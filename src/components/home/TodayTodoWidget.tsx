'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

interface QuickMemo {
  id: string
  title: string
  content: string
  tag: string
  created_at: string
}

interface TooltipState {
  memo: QuickMemo
  x: number
  y: number
}

interface LinkTask { id: string; title: string; status: string }
interface LinkTodo { id: string; content: string; done: boolean; sort_order: number }
interface LinkPopup {
  memo: QuickMemo
  x: number
  y: number
  step: 1 | 2
  search: string
  tasks: LinkTask[] | null
  task: LinkTask | null
  todos: LinkTodo[]
}

export default function TodayTodoWidget() {
  const [todos, setTodos] = useState<QuickMemo[]>([])
  const [done, setDone] = useState<QuickMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDone, setSelectedDone] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState('')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [linkPopup, setLinkPopup] = useState<LinkPopup | null>(null)
  const [showDonePopup, setShowDonePopup] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // ESC로 팝업 닫기
  useEffect(() => {
    if (!linkPopup && !showDonePopup) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setLinkPopup(null); setShowDonePopup(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [linkPopup, showDonePopup])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  async function completeMemo(id: string) {
    const { data, error } = await supabase
      .from('quick_memos').update({ tag: '완료' }).eq('id', id).select('id')
    if (error || !data?.length) {
      showToast(error ? `완료 처리 실패: ${error.message}` : '저장 실패 — Supabase 권한 설정을 확인하세요')
      await loadMemos()
      return
    }
    const memo = todos.find(m => m.id === id)
    setTodos(prev => prev.filter(m => m.id !== id))
    if (memo) setDone(prev => [{ ...memo, tag: '완료' }, ...prev])
  }

  async function undoMemo(id: string) {
    const { data, error } = await supabase
      .from('quick_memos').update({ tag: '업무관련' }).eq('id', id).select('id')
    if (error || !data?.length) {
      showToast(error ? `되돌리기 실패: ${error.message}` : '저장 실패 — Supabase 권한 설정을 확인하세요')
      await loadMemos()
      return
    }
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

  async function convertToTask(memo: QuickMemo, skipConfirm = false) {
    if (!skipConfirm && !confirm('업무로 이동하시겠습니까?')) return
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

  // 업무연동 팝업 열기
  async function openLinkPopup(memo: QuickMemo, e: React.MouseEvent) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const popupW = 288
    const x = Math.min(rect.left, window.innerWidth - popupW - 8)
    const y = rect.bottom + 6
    setLinkPopup({ memo, x, y, step: 1, search: '', tasks: null, task: null, todos: [] })
    const { data } = await supabase
      .from('tasks')
      .select('id, title, status')
      .not('status', 'eq', '완료')
      .order('created_at', { ascending: false })
    setLinkPopup(prev => prev ? { ...prev, tasks: (data ?? []) as LinkTask[] } : null)
  }

  // 업무 선택 → 할일 목록 로드
  async function selectLinkTask(task: LinkTask) {
    setLinkPopup(prev => prev ? { ...prev, step: 2, task, todos: [] } : null)
    const { data } = await supabase
      .from('task_todos')
      .select('id, content, done, sort_order')
      .eq('task_id', task.id)
      .order('sort_order')
      .order('created_at')
    setLinkPopup(prev => prev ? { ...prev, todos: (data ?? []) as LinkTodo[] } : null)
  }

  // 선택 위치에 할일 삽입 + 메모 완료 처리
  async function insertTodoAt(insertBefore: string | 'end') {
    if (!linkPopup?.task) return
    const { memo, task, todos: existingTodos } = linkPopup

    const { data: inserted } = await supabase
      .from('task_todos')
      .insert({ task_id: task.id, content: memo.title, done: false, sort_order: 0 })
      .select('id')
      .single()
    if (!inserted) return

    // 삽입 위치를 반영한 새 순서로 sort_order 재정렬
    let newIds: string[]
    if (insertBefore === 'end') {
      newIds = [...existingTodos.map(t => t.id), (inserted as { id: string }).id]
    } else {
      const idx = existingTodos.findIndex(t => t.id === insertBefore)
      const safeIdx = idx === -1 ? existingTodos.length : idx
      newIds = [
        ...existingTodos.slice(0, safeIdx).map(t => t.id),
        (inserted as { id: string }).id,
        ...existingTodos.slice(safeIdx).map(t => t.id),
      ]
    }
    await Promise.all(newIds.map((id, i) =>
      supabase.from('task_todos').update({ sort_order: i * 1000 }).eq('id', id)
    ))

    // 메모 완료 처리
    await supabase.from('quick_memos').update({ tag: '완료' }).eq('id', memo.id)
    const completedMemo = { ...memo, tag: '완료' }
    setTodos(prev => prev.filter(m => m.id !== memo.id))
    setDone(prev => [completedMemo, ...prev])
    setLinkPopup(null)
  }

  function toggleSelectDone(id: string) {
    setSelectedDone(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function showTooltip(m: QuickMemo, e: React.MouseEvent) {
    if (!m.content) return
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (tooltip?.memo.id === m.id) return  // 이미 같은 메모 tooltip 표시 중
    const tooltipH = 320
    const x = e.clientX + 16
    const y = Math.max(8, Math.min(e.clientY - 8, window.innerHeight - tooltipH - 8))
    setTooltip({ memo: m, x, y })
  }

  function scheduleHide() {
    hideTimer.current = setTimeout(() => setTooltip(null), 120)
  }

  function keepTooltip() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  function openMemo(id: string) {
    localStorage.setItem('memos_open_id', id)
    router.push('/memos')
  }

  return (
    <>
      <div className="h-full flex flex-col p-4 font-sans">
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" />
          <h3 className="text-xs font-semibold text-gray-800">오늘 할 일</h3>
          <span className="text-[9px] text-gray-400 mr-auto">Ctrl+2</span>
          {done.length > 0 && (
            <button
              onClick={() => setShowDonePopup(true)}
              className="text-[9px] text-gray-400 hover:text-[#0F1E36] bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full transition-colors flex-shrink-0">
              완료보기 {done.length}
            </button>
          )}
        </div>

        {toast && (
          <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-600 flex-shrink-0">
            {toast}
          </div>
        )}

        {loading ? (
          <p className="text-[10px] text-gray-300 text-center py-4">불러오는 중...</p>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            <p className="text-[10px] text-gray-400 font-medium mb-2 flex-shrink-0">미완료 {todos.length > 0 ? `${todos.length}` : ''}</p>
            {todos.length === 0 ? (
              <p className="text-[10px] text-gray-200 text-center py-3">없음</p>
            ) : (
              <div className="space-y-3">
                {todos.map(m => (
                  <div key={m.id} className="group flex items-start gap-1.5 px-1 rounded-lg hover:bg-white/50 transition-colors">
                    <button
                      onClick={() => completeMemo(m.id)}
                      title="완료 처리"
                      className="flex-shrink-0 w-3 h-3 mt-0.5 rounded-full border border-gray-300 hover:border-[#0F1E36]/40 hover:bg-[#EFF6FF] transition-colors"
                    />
                    <button
                      className="flex-1 min-w-0 text-left"
                      onMouseMove={e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        if (e.clientX - rect.left < 40) showTooltip(m, e)
                        else scheduleHide()
                      }}
                      onMouseLeave={scheduleHide}
                      onClick={() => openMemo(m.id)}>
                      <p className={`text-[10px] leading-relaxed break-words ${m.content ? 'text-gray-800 underline decoration-dotted decoration-[#0F1E36]/30 underline-offset-2' : 'text-gray-700'}`}>{m.title}</p>
                    </button>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); setTooltip(null) }}>
                      <button onClick={e => openLinkPopup(m, e)} title="업무 연동"
                        className="text-[9px] text-indigo-400 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-indigo-50">연동</button>
                      <button onClick={() => deleteTodo(m.id)} title="삭제"
                        className="text-[9px] text-gray-300 hover:text-red-400 px-1 py-0.5 rounded hover:bg-red-50">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* 미리보기 tooltip */}
      {tooltip && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, zIndex: 9999, width: 256, minHeight: 200, maxHeight: 320, background: 'rgba(248,250,252,0.96)' }}
          className="border border-gray-200 text-xs rounded-xl px-3.5 py-3 shadow-xl pointer-events-auto flex flex-col backdrop-blur-sm"
          onMouseEnter={keepTooltip}
          onMouseLeave={scheduleHide}>
          <p className="text-gray-600 leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto mb-2 pr-0.5">{tooltip.memo.content}</p>
          <button
            onClick={() => { setTooltip(null); openMemo(tooltip.memo.id) }}
            className="text-[#0F1E36] hover:text-[#162844] text-[11px] font-medium transition-colors">
            메모에서 열기 →
          </button>
        </div>,
        document.body
      )}

      {/* 완료 팝업 */}
      {showDonePopup && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9990] bg-black/20 backdrop-blur-sm" onClick={() => setShowDonePopup(false)} />
          <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white/97 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/80 w-full max-w-sm max-h-[72vh] flex flex-col">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800">완료 항목</h3>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{done.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedDone.size > 0 && (
                    <button onClick={() => { deleteSelectedDone(); }} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">
                      {selectedDone.size}개 삭제
                    </button>
                  )}
                  <button onClick={() => setShowDonePopup(false)} className="text-[10px] text-gray-300 hover:text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded-full transition-colors">
                    ESC
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 scrollbar-hide">
                {done.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-8">완료된 항목이 없습니다</p>
                ) : (
                  (() => {
                    const byDate: Record<string, QuickMemo[]> = {}
                    done.forEach(m => {
                      const d = m.created_at.slice(0, 10)
                      if (!byDate[d]) byDate[d] = []
                      byDate[d].push(m)
                    })
                    return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map(date => (
                      <div key={date}>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          {format(parseISO(date), 'M월 d일 (E)', { locale: ko })}
                        </p>
                        <div className="space-y-1.5">
                          {byDate[date].map(m => (
                            <div key={m.id}
                              className={`group flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors cursor-pointer ${selectedDone.has(m.id) ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                              onClick={() => toggleSelectDone(m.id)}>
                              <input type="checkbox" checked={selectedDone.has(m.id)}
                                onChange={() => toggleSelectDone(m.id)} onClick={e => e.stopPropagation()}
                                className="flex-shrink-0 w-3 h-3 rounded accent-gray-400 cursor-pointer" />
                              <p className="flex-1 min-w-0 text-xs text-gray-400 line-through leading-relaxed truncate">{m.title}</p>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button onClick={e => { e.stopPropagation(); undoMemo(m.id) }}
                                  className="text-[10px] text-gray-300 hover:text-blue-400 px-1 py-0.5 rounded hover:bg-blue-50">↩</button>
                                <button onClick={e => { e.stopPropagation(); deleteDone(m.id) }}
                                  className="text-[10px] text-gray-300 hover:text-red-400 px-1 py-0.5 rounded hover:bg-red-50">×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  })()
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* 업무 연동 팝업 */}
      {linkPopup && typeof document !== 'undefined' && createPortal(
        <>
          {/* 외부 클릭 닫기 */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setLinkPopup(null)} />
          <div
            style={{ position: 'fixed', left: linkPopup.x, top: linkPopup.y, zIndex: 9999, width: 288 }}
            className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">

            {linkPopup.step === 1 ? (
              /* ── Step 1: 업무 선택 ── */
              <>
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-700">업무 연동</span>
                  <button onClick={() => setLinkPopup(null)} className="text-gray-300 hover:text-gray-500 text-xs leading-none">✕</button>
                </div>
                <div className="px-3 py-2 border-b border-gray-100">
                  <input
                    autoFocus
                    value={linkPopup.search}
                    onChange={e => setLinkPopup(prev => prev ? { ...prev, search: e.target.value } : null)}
                    placeholder="업무 검색..."
                    className="w-full text-xs text-gray-700 focus:outline-none placeholder-gray-300"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {linkPopup.tasks === null ? (
                    <p className="text-xs text-gray-300 text-center py-4">불러오는 중...</p>
                  ) : linkPopup.tasks
                      .filter(t => t.title.toLowerCase().includes(linkPopup.search.toLowerCase()))
                      .length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-4">검색 결과 없음</p>
                  ) : (
                    linkPopup.tasks
                      .filter(t => t.title.toLowerCase().includes(linkPopup.search.toLowerCase()))
                      .map(task => (
                        <button key={task.id} onClick={() => selectLinkTask(task)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 transition-colors">
                          <span className="flex-1 truncate text-gray-700">{task.title}</span>
                          <span className="text-[10px] text-gray-300 flex-shrink-0">{task.status}</span>
                        </button>
                      ))
                  )}
                </div>
                <div className="border-t border-gray-100">
                  <button
                    onClick={() => { setLinkPopup(null); convertToTask(linkPopup.memo, true) }}
                    className="w-full text-left px-3 py-2 text-xs text-indigo-500 hover:bg-indigo-50 transition-colors flex items-center gap-1.5">
                    + New 업무 생성
                  </button>
                </div>
              </>
            ) : (
              /* ── Step 2: 위치 선택 ── */
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                  <button
                    onClick={() => setLinkPopup(prev => prev ? { ...prev, step: 1, task: null, todos: [] } : null)}
                    className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">←</button>
                  <span className="text-xs font-semibold text-gray-700 truncate flex-1">{linkPopup.task?.title}</span>
                  <button onClick={() => setLinkPopup(null)} className="text-gray-300 hover:text-gray-500 text-xs flex-shrink-0 leading-none">✕</button>
                </div>
                <p className="text-[10px] text-gray-400 px-3 pt-2">추가할 위치를 선택하세요</p>
                <div className="max-h-64 overflow-y-auto pb-1">
                  {linkPopup.todos.length === 0 ? (
                    <button onClick={() => insertTodoAt('end')}
                      className="w-full py-3 text-xs text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                      + 첫 번째 할일로 추가
                    </button>
                  ) : (
                    <>
                      {/* 맨 위 */}
                      <button onClick={() => insertTodoAt(linkPopup.todos[0].id)}
                        className="w-full py-1 text-[10px] text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border-b border-dashed border-gray-100">
                        ↑ 맨 위에 추가
                      </button>
                      {linkPopup.todos.map((todo, i) => (
                        <div key={todo.id}>
                          <div className={`px-3 py-1.5 text-xs ${todo.done ? 'text-gray-300 line-through' : 'text-gray-600'}`}>
                            {i + 1}. {todo.content}
                          </div>
                          <button
                            onClick={() => insertTodoAt(linkPopup.todos[i + 1]?.id ?? 'end')}
                            className="w-full py-1 text-[10px] text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border-b border-dashed border-gray-100">
                            {i === linkPopup.todos.length - 1 ? '↓ 맨 아래에 추가' : '↓ 다음에 추가'}
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}
