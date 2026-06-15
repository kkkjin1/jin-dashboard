'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface QuickMemo {
  id: string
  title: string
  content: string
  created_at: string
}

export default function TodayTodoWidget() {
  const [memos, setMemos] = useState<QuickMemo[]>([])
  const [newText, setNewText] = useState('')
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const todayStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  async function loadMemos() {
    const { data } = await supabase
      .from('quick_memos')
      .select('id, title, content, created_at')
      .eq('tag', '업무관련')
      .gte('created_at', `${todayStr}T00:00:00`)
      .lt('created_at', `${todayStr}T23:59:59`)
      .order('created_at', { ascending: true })
    setMemos((data ?? []) as QuickMemo[])
    setLoading(false)
  }

  useEffect(() => { loadMemos() }, [])

  // QuickMemoPanel에서 저장 이벤트 감지
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

  async function deleteMemo(id: string) {
    await supabase.from('quick_memos').delete().eq('id', id)
    setMemos(prev => prev.filter(m => m.id !== id))
  }

  async function convertToTask(memo: QuickMemo) {
    const { data } = await supabase
      .from('tasks')
      .insert({ title: memo.title, part: '코어', type: '기획', status: '진행필요' })
      .select('id')
      .single()
    if (data) {
      await supabase.from('quick_memos').delete().eq('id', memo.id)
      setMemos(prev => prev.filter(m => m.id !== memo.id))
      router.push(`/tasks/${(data as { id: string }).id}`)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">오늘 할 일</h3>
        <span className="text-xs text-gray-400">Ctrl+2 빠른 추가</span>
      </div>

      {/* 인라인 입력 */}
      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addMemo() }}
          placeholder="할 일 추가... (Enter)"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400"
        />
        <button
          onClick={addMemo}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
        >+</button>
      </div>

      {/* 목록 */}
      <div className="space-y-1.5 overflow-y-auto max-h-[280px]">
        {loading ? (
          <p className="text-xs text-gray-300 text-center py-4">불러오는 중...</p>
        ) : memos.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-4">오늘 할 일을 적어두세요</p>
        ) : (
          memos.map(m => (
            <div key={m.id} className="group flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
              <span className="text-gray-300 mt-0.5 text-xs flex-shrink-0">◦</span>
              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => { localStorage.setItem('memos_open_id', m.id); router.push('/memos') }}>
                <p className="text-sm text-gray-700 leading-snug truncate">{m.title}</p>
                {m.content && <p className="text-xs text-gray-400 truncate mt-0.5">{m.content}</p>}
              </button>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => convertToTask(m)}
                  title="업무로 만들기"
                  className="text-[10px] text-blue-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
                >업무↗</button>
                <button
                  onClick={() => deleteMemo(m.id)}
                  title="삭제"
                  className="text-[10px] text-gray-300 hover:text-red-400 px-1 py-0.5 rounded hover:bg-red-50 transition-colors"
                >×</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
