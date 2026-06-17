'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface QuickMemo {
  id: string
  title: string
  content: string
  tag: string
  created_at: string
}

export default function TodayTodoWidget() {
  const [todos, setTodos] = useState<QuickMemo[]>([])
  const [done, setDone] = useState<QuickMemo[]>([])
  const [newText, setNewText] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedDone, setSelectedDone] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  async function loadMemos() {
    const { data } = await supabase
      .from('quick_memos')
      .select('id, title, content, tag, created_at')
      .in('tag', ['업무관련', '완료'])
      .order('created_at', { ascending: true })
    const all = (data ?? []) as QuickMemo[]
    setTodos(all.filter(m => m.tag === '업무관련'))
    setDone(all.filter(m => m.tag === '완료').reverse())
    setLoading(false)
  }

  useEffect(() => { loadMemos() }, [])

  useEffect(() => {
    function onMemoSaved() { loadMemos() }
    window.addEventListener('quick-memo-saved', onMemoSaved)
    return () => window.removeEventListener('quick-memo-saved', onMemoSaved)
  }, [])

  async function addMemo() {
    if (!newText.trim()) return
    await supabase.from('quick_memos').insert({ title: newText.trim(), content: '', tag: '업무관련' })
    setNewText('')
    loadMemos()
  }

  async function completeMemo(id: string) {
    await supabase.from('quick_memos').update({ tag: '완료' }).eq('id', id)
    const memo = todos.find(m => m.id === id)
    setTodos(prev => prev.filter(m => m.id !== id))
    if (memo) setDone(prev => [{ ...memo, tag: '완료' }, ...prev])
  }

  async function undoMemo(id: string) {
    await supabase.from('quick_memos').update({ tag: '업무관련' }).eq('id', id)
    const memo = done.find(m => m.id === id)
    setDone(prev => prev.filter(m => m.id !== id))
    if (memo) setTodos(prev => [...prev, { ...memo, tag: '업무관련' }])
    setSelectedDone(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function deleteDone(id: string) {
    await supabase.from('quick_memos').delete().eq('id', id)
    setDone(prev => prev.filter(m => m.id !== id))
    setSelectedDone(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function deleteSelectedDone() {
    const ids = Array.from(selectedDone)
    await supabase.from('quick_memos').delete().in('id', ids)
    setDone(prev => prev.filter(m => !selectedDone.has(m.id)))
    setSelectedDone(new Set())
  }

  async function deleteTodo(id: string) {
    await supabase.from('quick_memos').delete().eq('id', id)
    setTodos(prev => prev.filter(m => m.id !== id))
  }

  async function convertToTask(memo: QuickMemo) {
    const { data } = await supabase
      .from('tasks')
      .insert({ title: memo.title, part: '코어', type: '기획', status: '진행필요' })
      .select('id')
      .single()
    if (data) {
      await supabase.from('quick_memos').delete().eq('id', memo.id)
      setTodos(prev => prev.filter(m => m.id !== memo.id))
      router.push(`/tasks/${(data as { id: string }).id}`)
    }
  }

  function toggleSelectDone(id: string) {
    setSelectedDone(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-800">오늘 할 일</h3>
        <span className="text-xs text-gray-400">Ctrl+2 빠른 추가</span>
      </div>

      <div className="flex gap-2 mb-3 flex-shrink-0">
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addMemo() }}
          placeholder="할 일 추가... (Enter)"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400"
        />
        <button onClick={addMemo} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">+</button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-300 text-center py-4">불러오는 중...</p>
      ) : (
        <div className="flex gap-0 flex-1 min-h-0 overflow-hidden">
          {/* 미완료 */}
          <div className="flex-1 min-w-0 overflow-y-auto pr-2">
            <p className="text-[10px] text-gray-400 font-medium mb-1.5">미완료 {todos.length > 0 ? todos.length : ''}</p>
            {todos.length === 0 ? (
              <p className="text-xs text-gray-200 text-center py-3">없음</p>
            ) : todos.map(m => (
              <div key={m.id} className="group flex items-start gap-1.5 py-1 px-1 rounded-lg hover:bg-gray-50 transition-colors">
                <button
                  onClick={() => completeMemo(m.id)}
                  title="완료 처리"
                  className="flex-shrink-0 w-3.5 h-3.5 mt-0.5 rounded-full border border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                />
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => { localStorage.setItem('memos_open_id', m.id); router.push('/memos') }}>
                  <p className="text-sm text-gray-700 leading-snug truncate">{m.title}</p>
                </button>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => convertToTask(m)} title="업무로 만들기"
                    className="text-[10px] text-blue-400 hover:text-blue-600 px-1 py-0.5 rounded hover:bg-blue-50">↗</button>
                  <button onClick={() => deleteTodo(m.id)} title="삭제"
                    className="text-[10px] text-gray-300 hover:text-red-400 px-1 py-0.5 rounded hover:bg-red-50">×</button>
                </div>
              </div>
            ))}
          </div>

          {/* 구분선 */}
          <div className="w-px bg-gray-100 mx-2 flex-shrink-0" />

          {/* 완료 */}
          <div className="flex-1 min-w-0 overflow-y-auto pl-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <p className="text-[10px] text-gray-400 font-medium">완료 {done.length > 0 ? done.length : ''}</p>
              {selectedDone.size > 0 && (
                <button onClick={deleteSelectedDone}
                  className="text-[10px] text-red-400 hover:text-red-600 ml-auto">
                  {selectedDone.size}개 삭제
                </button>
              )}
            </div>
            {done.length === 0 ? (
              <p className="text-xs text-gray-200 text-center py-3">없음</p>
            ) : done.map(m => (
              <div key={m.id}
                className={`group flex items-start gap-1.5 py-1 px-1 rounded-lg transition-colors cursor-pointer ${selectedDone.has(m.id) ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => toggleSelectDone(m.id)}>
                <input type="checkbox" checked={selectedDone.has(m.id)}
                  onChange={() => toggleSelectDone(m.id)}
                  onClick={e => e.stopPropagation()}
                  className="flex-shrink-0 w-3 h-3 mt-0.5 rounded accent-gray-400 cursor-pointer" />
                <p className="flex-1 min-w-0 text-xs text-gray-400 line-through truncate leading-snug">{m.title}</p>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); undoMemo(m.id) }} title="되돌리기"
                    className="text-[10px] text-gray-300 hover:text-blue-400 px-1 py-0.5 rounded hover:bg-blue-50">↩</button>
                  <button onClick={e => { e.stopPropagation(); deleteDone(m.id) }} title="삭제"
                    className="text-[10px] text-gray-300 hover:text-red-400 px-1 py-0.5 rounded hover:bg-red-50">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
