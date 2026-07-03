'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import DailyJournalWidget from '@/components/home/DailyJournalWidget'
import TodayTodoWidget from '@/components/home/TodayTodoWidget'
import QuickTaskInput from '@/components/home/QuickTaskInput'
import { fetchAllTasks } from '@/lib/tasks'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import { HomePageSkeleton } from '@/components/ui/Skeleton'
import type { Task, Meeting, TaskTodo } from '@/types'

interface TodoColItem {
  id: string
  title: string
  taskId: string
  taskTitle: string | null
  taskShortName?: string | null
  idxInTask?: number
}

interface CompactColProps {
  title: string
  items: TodoColItem[]
  dark?: boolean
  warn?: boolean
  droppable?: boolean
  onDrop?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  isDragOver?: boolean
  onComplete?: (todoId: string) => void
  maxItems?: number
  scrollable?: boolean
  completedCount?: number
  colBadge?: { label: string; bg: string; text: string }
}

function DotGrid({ total, filled }: { total: number; filled: number }) {
  const cols = 7; const rows = 4
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <div key={i} className={`w-[5px] h-[5px] rounded-full transition-colors ${i < filled ? 'bg-[#F0C048]' : 'bg-white/10'}`} />
      ))}
    </div>
  )
}

function CompactCol({ title, items, dark, warn, droppable, onDrop, onDragOver, onDragLeave, isDragOver, onComplete, maxItems = 5, scrollable, completedCount = 0, colBadge }: CompactColProps) {
  const dragRing = isDragOver && droppable ? (dark ? 'ring-1 ring-white/20' : 'ring-1 ring-emerald-400') : ''
  const emptyTxt = dark ? 'text-white/25' : 'text-gray-300'
  const itemTxt = dark ? 'text-white/80' : 'text-gray-700'
  const subTxt = dark ? 'text-white/30' : 'text-gray-400'
  const chipCls = dark ? 'bg-white/10 text-white/35' : 'bg-gray-100 text-gray-400'
  const hoverCls = dark ? 'hover:bg-white/5' : 'hover:bg-gray-50'
  const divideCls = dark ? 'divide-white/5' : 'divide-gray-100'
  const completeCls = dark ? 'border-white/20 hover:border-white/50' : 'border-gray-200 hover:border-emerald-400 hover:bg-emerald-50'
  const checkCls = dark ? 'text-white/50' : 'text-emerald-500'
  const cardCls = dark
    ? `bg-[#1D2232] ${dragRing} rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.18)] p-4 min-w-0 min-h-[186px] transition-all flex flex-col relative overflow-hidden`
    : `bg-white border border-white/80 ${dragRing} rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.04)] p-4 min-w-0 min-h-[186px] transition-all flex flex-col`

  // 다크 카드 (오늘) — 별도 레이아웃
  if (dark) {
    return (
      <div className={cardCls}
        onDragOver={droppable ? onDragOver : undefined}
        onDrop={droppable ? onDrop : undefined}
        onDragLeave={droppable ? onDragLeave : undefined}
      >
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase text-white/40" style={{letterSpacing:'0.07em'}}>{title}</span>
            <span className="text-[10px] text-white/30">↗</span>
          </div>
          {items.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">
              {items.length > 9 ? '9+' : items.length}
            </span>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-white/20 text-center py-2">없음</p>
        ) : (
          <div className={`divide-y ${divideCls} ${scrollable ? 'overflow-y-auto flex-1 min-h-0' : ''}`}>
            {(scrollable ? items : items.slice(0, maxItems)).map(item => (
              <div key={item.id} className={`group flex items-start gap-2 py-2 px-1 rounded transition-colors ${hoverCls}`}>
                {onComplete && (
                  <button onClick={e => { e.stopPropagation(); onComplete(item.id) }}
                    className={`flex-shrink-0 w-3.5 h-3.5 mt-0.5 rounded-full border transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center ${completeCls}`}
                    title="완료">
                    <span className={`text-[8px] leading-none ${checkCls}`}>✓</span>
                  </button>
                )}
                <span className="w-1.5 h-1.5 rounded-full bg-[#F0C048]/60 mt-1.5 flex-shrink-0" />
                <Link href={`/tasks/${item.taskId}`} className="flex-1 min-w-0"
                  draggable={droppable}
                  onDragStart={droppable ? e => { e.stopPropagation(); e.dataTransfer.setData('todoId', item.id) } : undefined}>
                  <span className={`text-sm leading-relaxed break-words ${itemTxt}`}>{item.title || '제목 없음'}</span>
                  {item.taskTitle && <span className={`text-[10px] truncate block ${subTxt}`}>{item.taskTitle}</span>}
                </Link>
                {colBadge && (
                  <span className={`flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${colBadge.bg} ${colBadge.text}`}>{colBadge.label}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {/* 도트 그리드 — 우하단 */}
        <div className="absolute bottom-3 right-3 opacity-70">
          <DotGrid total={28} filled={Math.min(completedCount, 28)} />
        </div>
      </div>
    )
  }

  // 일반 카드 (내일·금주·미진행)
  const titleCls = warn ? 'text-[#B44A3A]' : 'text-gray-400'
  const badgeBg = warn ? 'bg-[#FDECEA] text-[#B44A3A]' : 'bg-gray-100 text-gray-500'

  return (
    <div className={cardCls}
      onDragOver={droppable ? onDragOver : undefined}
      onDrop={droppable ? onDrop : undefined}
      onDragLeave={droppable ? onDragLeave : undefined}
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className={`text-[10px] font-semibold uppercase ${titleCls}`} style={{letterSpacing:'0.07em'}}>{title}</span>
        {items.length > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className={`text-xs text-center py-1 ${emptyTxt}`}>{isDragOver && droppable ? '여기에 놓기' : '없음'}</p>
      ) : (
        <div className={`divide-y ${divideCls} ${scrollable ? 'overflow-y-auto flex-1 min-h-0' : ''}`}>
          {(scrollable ? items : items.slice(0, maxItems)).map(item => (
            <div key={item.id} className={`group flex items-start gap-1.5 py-1.5 px-1 rounded transition-colors ${hoverCls}`}>
              {onComplete && (
                <button onClick={e => { e.stopPropagation(); onComplete(item.id) }}
                  className={`flex-shrink-0 w-3.5 h-3.5 mt-0.5 rounded-full border transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center ${completeCls}`}
                  title="완료">
                  <span className={`text-[8px] leading-none ${checkCls}`}>✓</span>
                </button>
              )}
              <span className={`w-1 h-1 rounded-full mt-2 flex-shrink-0 ${warn ? 'bg-red-300' : 'bg-gray-300'}`} />
              <Link href={`/tasks/${item.taskId}`} className="flex-1 min-w-0">
                <div className="cursor-grab active:cursor-grabbing"
                  draggable={droppable}
                  onDragStart={droppable ? e => { e.stopPropagation(); e.dataTransfer.setData('todoId', item.id) } : undefined}>
                  <div className="flex items-start gap-1 min-w-0">
                    {item.taskShortName && (
                      <span className={`text-[9px] font-mono flex-shrink-0 px-1 py-0.5 rounded mt-0.5 ${chipCls}`}>
                        {item.taskShortName}{(item.idxInTask ?? 0) + 1}
                      </span>
                    )}
                    <span className={`text-sm leading-relaxed break-words ${itemTxt}`}>{item.title || '제목 없음'}</span>
                  </div>
                  {item.taskTitle && <span className={`text-[10px] truncate block ${subTxt}`}>{item.taskTitle}</span>}
                </div>
              </Link>
              {colBadge && (
                <span className={`flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full self-start mt-0.5 ${colBadge.bg} ${colBadge.text}`}>{colBadge.label}</span>
              )}
            </div>
          ))}
          {!scrollable && items.length > maxItems && (
            <p className={`text-[10px] px-1 pt-1 ${emptyTxt}`}>+{items.length - maxItems}개 더</p>
          )}
        </div>
      )}
    </div>
  )
}

function getThisWeekStart(): string {
  const d = new Date()
  const day = d.getDay() // 0=Sun, 1=Mon...6=Sat
  const daysToMon = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - daysToMon)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function getDateStrings() {
  const todayDate = new Date()
  const today = todayDate.toISOString().slice(0, 10)
  const tomorrowDate = new Date(todayDate); tomorrowDate.setDate(todayDate.getDate() + 1)
  const tomorrow = tomorrowDate.toISOString().slice(0, 10)
  const thisFriDate = new Date(todayDate)
  const day = thisFriDate.getDay()
  const daysToFri = (5 - day + 7) % 7
  thisFriDate.setDate(thisFriDate.getDate() + (daysToFri === 0 ? 0 : daysToFri))
  const thisFriday = thisFriDate.toISOString().slice(0, 10)
  return { today, tomorrow, thisFriday }
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [todos, setTodos] = useState<TaskTodo[]>([])
  const [completedThisWeek, setCompletedThisWeek] = useState<TaskTodo[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOverBucket, setDragOverBucket] = useState<string | null>(null)
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [search, setSearch] = useState('')
  const [searchMeetings, setSearchMeetings] = useState<Pick<Meeting, 'id' | 'title'>[]>([])
  const [meetingsLoaded, setMeetingsLoaded] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  type Shortcut = { id: string; title: string; url: string }
  const { value: shortcuts, save: saveShortcutsRemote } = useUserSetting<Shortcut[]>('home_shortcuts', [])
  const [showAddShortcut, setShowAddShortcut] = useState(false)
  const [newShortcutTitle, setNewShortcutTitle] = useState('')
  const [newShortcutUrl, setNewShortcutUrl] = useState('')
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null)
  const [editShortcutTitle, setEditShortcutTitle] = useState('')
  const [editShortcutUrl, setEditShortcutUrl] = useState('')

  useEffect(() => {
    Promise.all([
      fetchAllTasks(),
      supabase.from('meetings').select('id, title, meeting_date').order('meeting_date', { ascending: true }),
      supabase.from('task_todos').select('id, title, target_date, sort_order, task_id, done, tasks(id, title, short_name)').eq('done', false),
      supabase.from('task_todos').select('id, title, done_at, sort_order, task_id, tasks(id, title, short_name)')
        .eq('done', true).gte('done_at', getThisWeekStart()).order('done_at', { ascending: false }),
    ]).then(([taskData, { data: meetingData }, { data: todosData }, { data: completedData }]) => {
      setTasks(taskData)
      setMeetings((meetingData ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[])
      setTodos((todosData ?? []) as unknown as TaskTodo[])
      setCompletedThisWeek((completedData ?? []) as unknown as TaskTodo[])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])


  function saveShortcuts(list: Shortcut[]) {
    saveShortcutsRemote(list)
  }

  function addShortcut() {
    if (!newShortcutUrl.trim()) return
    const url = newShortcutUrl.startsWith('http') ? newShortcutUrl : 'https://' + newShortcutUrl
    const title = newShortcutTitle.trim() || url
    const item = { id: Date.now().toString(), title, url }
    saveShortcuts([...shortcuts, item])
    setNewShortcutTitle(''); setNewShortcutUrl(''); setShowAddShortcut(false)
  }

  function removeShortcut(id: string) {
    saveShortcuts(shortcuts.filter(s => s.id !== id))
  }

  function startEditShortcut(s: {id: string; title: string; url: string}) {
    setEditingShortcutId(s.id)
    setEditShortcutTitle(s.title)
    setEditShortcutUrl(s.url)
    setShowAddShortcut(false)
  }

  function saveEditShortcut() {
    if (!editShortcutUrl.trim() || !editingShortcutId) return
    const url = editShortcutUrl.startsWith('http') ? editShortcutUrl : 'https://' + editShortcutUrl
    const title = editShortcutTitle.trim() || url
    saveShortcuts(shortcuts.map(s => s.id === editingShortcutId ? { ...s, title, url } : s))
    setEditingShortcutId(null); setEditShortcutTitle(''); setEditShortcutUrl('')
  }

  async function handleSearchChange(val: string) {
    setSearch(val)
    setSearchOpen(!!val)
    if (val && !meetingsLoaded) {
      const { data } = await supabase.from('meetings').select('id, title').order('created_at', { ascending: false })
      setSearchMeetings((data ?? []) as Pick<Meeting, 'id' | 'title'>[])
      setMeetingsLoaded(true)
    }
  }

  const q = search.trim().toLowerCase()
  const matchedTasks = q ? tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.retrospective?.improvement && t.retrospective.improvement.toLowerCase().includes(q))
  ).slice(0, 6) : []
  const matchedMeetings = q ? searchMeetings.filter(m => m.title.toLowerCase().includes(q)).slice(0, 4) : []
  const hasResults = matchedTasks.length > 0 || matchedMeetings.length > 0

  const { today, tomorrow, thisFriday } = getDateStrings()

  // task_id별 sort_order 기준 인덱스 계산
  const taskTodoOrderMap: Record<string, TaskTodo[]> = {}
  todos.forEach(t => {
    if (!taskTodoOrderMap[t.task_id]) taskTodoOrderMap[t.task_id] = []
    taskTodoOrderMap[t.task_id].push(t)
  })
  Object.values(taskTodoOrderMap).forEach(arr => arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))

  function toColItemsV2(filtered: TaskTodo[]): TodoColItem[] {
    return filtered.map(t => {
      const taskArr = taskTodoOrderMap[t.task_id] ?? []
      const idxInTask = taskArr.findIndex(x => x.id === t.id)
      const joinedTask = t.tasks as { id: string; title: string; short_name?: string | null } | null
      return {
        id: t.id,
        title: t.title,
        taskId: t.task_id,
        taskTitle: joinedTask?.title ?? null,
        taskShortName: joinedTask?.short_name ?? null,
        idxInTask: idxInTask >= 0 ? idxInTask : 0,
      }
    })
  }

  const todayItems = toColItemsV2(todos.filter(t => t.target_date === today))
  const tomorrowItems = toColItemsV2(todos.filter(t => t.target_date === tomorrow))
  const weekItems = toColItemsV2(todos.filter(t => t.target_date && t.target_date > tomorrow && t.target_date <= thisFriday))
  const overdueItems = toColItemsV2(todos.filter(t => t.target_date && t.target_date < today))
  const unscheduledItems = toColItemsV2(todos.filter(t => !t.target_date))

  function handleDragOver(e: React.DragEvent, bucket: string) {
    e.preventDefault()
    setDragOverBucket(bucket)
  }

  async function handleDrop(e: React.DragEvent, bucket: 'today' | 'tomorrow' | 'this_week') {
    e.preventDefault()
    setDragOverBucket(null)
    const todoId = e.dataTransfer.getData('todoId')
    if (!todoId) return
    const { today: t, tomorrow: tm, thisFriday: tf } = getDateStrings()
    const targetDate = bucket === 'today' ? t : bucket === 'tomorrow' ? tm : tf
    await supabase.from('task_todos').update({ target_date: targetDate }).eq('id', todoId)
    setTodos(prev => prev.map(todo => todo.id === todoId ? { ...todo, target_date: targetDate } : todo))
  }

  async function handleCompleteTodo(todoId: string) {
    const doneAt = new Date().toISOString()
    await supabase.from('task_todos').update({ done: true, done_at: doneAt }).eq('id', todoId)
    const completed = todos.find(t => t.id === todoId)
    setTodos(prev => prev.filter(t => t.id !== todoId))
    if (completed) setCompletedThisWeek(prev => [{ ...completed, done: true, done_at: doneAt }, ...prev])
  }

  if (loading) return <HomePageSkeleton />

  function handlePageKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Escape') return
    setSearch('')
    setSearchOpen(false)
    ;(document.activeElement as HTMLElement)?.blur()
  }

  return (
    <div className="p-4 md:p-4 flex flex-col md:h-full md:overflow-hidden gap-3" onKeyDown={handlePageKeyDown}>

      {/* Row 1: 헤더 */}
      <div className="flex items-end justify-between flex-shrink-0">
        <div>
          <h1 className="font-normal leading-tight text-gray-900"
              style={{fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.6rem', letterSpacing: '-0.025em'}}>
            안녕하세요, 진일님.
          </h1>
          <p className="text-gray-400 mt-1.5"
             style={{fontSize: '10px', letterSpacing: '0.07em', textTransform: 'uppercase'}}>
            {format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}
          </p>
        </div>
        <div className="flex items-end gap-7">
          <div className="hidden sm:flex items-end gap-7">
            <div className="text-right">
              <div className="font-bold leading-none text-[#2E5E4A]"
                   style={{fontSize: '2.3rem', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums'}}>
                {todayItems.length}
              </div>
              <div className="text-gray-400 mt-1" style={{fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase'}}>오늘</div>
            </div>
            <div className="text-right">
              <div className="font-bold leading-none text-gray-400"
                   style={{fontSize: '2.3rem', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums'}}>
                {weekItems.length}
              </div>
              <div className="text-gray-400 mt-1" style={{fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase'}}>금주</div>
            </div>
            <div className="text-right">
              <div className="font-bold leading-none text-[#B44A3A]"
                   style={{fontSize: '2.3rem', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums'}}>
                {overdueItems.length}
              </div>
              <div className="text-gray-400 mt-1" style={{fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase'}}>미진행</div>
            </div>
          </div>
          <div ref={searchRef} className="relative self-center">
            <button
              onClick={() => { setSearchOpen(p => !p); if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50) }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors"
            >
              <span className="text-sm">🔍</span>
            </button>
            {searchOpen && (
              <div className="absolute top-full mt-1 right-0 w-80 bg-white rounded-xl border border-gray-100 shadow-xl z-50 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="업무·회의록 검색"
                    className="text-sm text-gray-700 focus:outline-none flex-1 bg-transparent"
                  />
                  {search && (
                    <button onClick={() => { setSearch(''); setSearchOpen(false) }}
                      className="text-gray-300 hover:text-gray-500 text-base leading-none">×</button>
                  )}
                </div>
                {hasResults ? (
                  <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                    {matchedTasks.length > 0 && (
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-gray-400 mb-1.5">업무</p>
                        {matchedTasks.map(t => (
                          <Link key={t.id} href={`/tasks/${t.id}`} onClick={() => setSearchOpen(false)}>
                            <div className="py-1.5 px-1 hover:bg-gray-50 rounded-lg flex items-center gap-2">
                              <span className="text-xs text-gray-400">≡</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-800 truncate block">{t.title || '제목 없음'}</span>
                                {t.retrospective?.improvement && t.retrospective.improvement.toLowerCase().includes(q) && (
                                  <span className="text-xs text-red-400 truncate block">개선: {t.retrospective.improvement.slice(0, 40)}</span>
                                )}
                              </div>
                              <span className={`text-xs ml-auto flex-shrink-0 px-1.5 py-0.5 rounded ${t.status === '완료' ? 'bg-green-50 text-green-600' : t.status === '진행중' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                    {matchedMeetings.length > 0 && (
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-gray-400 mb-1.5">회의록</p>
                        {matchedMeetings.map(m => (
                          <Link key={m.id} href={`/meetings/${m.id}`} onClick={() => setSearchOpen(false)}>
                            <div className="py-1.5 px-1 hover:bg-gray-50 rounded-lg flex items-center gap-2">
                              <span className="text-xs text-gray-400">💬</span>
                              <span className="text-sm text-gray-800 truncate">{m.title || '제목 없음'}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : search ? (
                  <p className="text-xs text-gray-400 text-center py-4">검색 결과 없음</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: 바로가기 */}
      <div className="flex-shrink-0">
        <div className="flex gap-2 flex-wrap items-center">
          {shortcuts.map(s => {
            if (editingShortcutId === s.id) {
              return (
                <div key={s.id} className="bg-white rounded-xl border border-blue-300 p-2.5 w-40 shadow-sm">
                  <input value={editShortcutTitle} onChange={e => setEditShortcutTitle(e.target.value)}
                    placeholder="이름" autoFocus
                    className="text-xs font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
                  <input value={editShortcutUrl} onChange={e => setEditShortcutUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEditShortcut(); if (e.key === 'Escape') setEditingShortcutId(null) }}
                    placeholder="URL"
                    className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
                  <div className="flex gap-1 mt-1.5 justify-end">
                    <button onClick={() => setEditingShortcutId(null)} className="text-xs text-gray-400 px-2 py-0.5">취소</button>
                    <button onClick={saveEditShortcut} className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-lg">저장</button>
                  </div>
                </div>
              )
            }
            return (
              <div key={s.id} className="group relative">
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-3 py-2 hover:border-gray-400 hover:shadow-sm transition-all">
                  <span className="text-xs font-medium text-gray-700 truncate max-w-28">🔗 {s.title}</span>
                </a>
                <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEditShortcut(s)}
                    className="w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-blue-600">✎</button>
                  <button onClick={() => removeShortcut(s.id)}
                    className="w-4 h-4 bg-gray-400 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-500">×</button>
                </div>
              </div>
            )
          })}
          {showAddShortcut ? (
            <div className="bg-white rounded-xl border border-blue-300 p-2.5 w-40 shadow-sm">
              <input value={newShortcutTitle} onChange={e => setNewShortcutTitle(e.target.value)}
                placeholder="이름" autoFocus
                className="text-xs font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
              <input value={newShortcutUrl} onChange={e => setNewShortcutUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addShortcut(); if (e.key === 'Escape') setShowAddShortcut(false) }}
                placeholder="URL"
                className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
              <div className="flex gap-1 mt-1.5 justify-end">
                <button onClick={() => setShowAddShortcut(false)} className="text-xs text-gray-400 px-2 py-0.5">취소</button>
                <button onClick={addShortcut} className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-lg">추가</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setShowAddShortcut(true); setEditingShortcutId(null) }}
              className="flex items-center justify-center border border-dashed border-gray-200 hover:border-gray-300 rounded-md px-3 py-2 text-gray-300 hover:text-gray-400 transition-colors text-xs">
              + 바로가기
            </button>
          )}
        </div>
      </div>

      {/* Row 3: 빠른 업무 추가 */}
      <QuickTaskInput
        tasks={tasks}
        onAdded={todo => setTodos(prev => [todo, ...prev])}
      />

      {/* Row 4: 컴팩트 업무 현황 */}
      <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3">
        <CompactCol
          title="오늘" items={todayItems} dark
          completedCount={completedThisWeek.length}
          colBadge={{ label: '진행중', bg: 'bg-violet-500/20', text: 'text-violet-300' }}
          droppable onDrop={e => handleDrop(e, 'today')} onDragOver={e => handleDragOver(e, 'today')} onDragLeave={() => setDragOverBucket(null)} isDragOver={dragOverBucket === 'today'}
          onComplete={handleCompleteTodo}
        />
        <CompactCol
          title="내일" items={tomorrowItems}
          colBadge={{ label: '대기', bg: 'bg-gray-100', text: 'text-gray-400' }}
          droppable onDrop={e => handleDrop(e, 'tomorrow')} onDragOver={e => handleDragOver(e, 'tomorrow')} onDragLeave={() => setDragOverBucket(null)} isDragOver={dragOverBucket === 'tomorrow'}
          onComplete={handleCompleteTodo}
        />
        <CompactCol
          title="금주" items={weekItems}
          colBadge={{ label: '대기', bg: 'bg-gray-100', text: 'text-gray-400' }}
          droppable onDrop={e => handleDrop(e, 'this_week')} onDragOver={e => handleDragOver(e, 'this_week')} onDragLeave={() => setDragOverBucket(null)} isDragOver={dragOverBucket === 'this_week'}
          onComplete={handleCompleteTodo}
        />
        <CompactCol title="미진행" items={overdueItems} warn
          colBadge={{ label: '긴급', bg: 'bg-red-50', text: 'text-red-400' }}
          onComplete={handleCompleteTodo}
        />
      </div>

      {/* Row 5: 회고 + 오늘할일 + 미지정백로그 */}
      <div className="md:flex-1 md:min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:overflow-hidden">
          <DailyJournalWidget tasks={tasks} meetings={meetings} />
        </div>
        <div className="md:overflow-hidden flex flex-col gap-3 min-h-0">
          <div className="flex-[3] min-h-0 overflow-hidden">
            <TodayTodoWidget />
          </div>
          {/* 미지정 할일 + 금주 완료 2분할 */}
          <div className="bg-white border border-white/80 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden flex-[2] min-h-0">
            <div className="flex border-b border-gray-100 flex-shrink-0">
              <div className="flex-1 flex items-center gap-1.5 px-3 py-2 border-r border-gray-100">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-600">미지정</span>
                {unscheduledItems.length > 0 && (
                  <span className="ml-auto text-xs text-gray-400 font-medium">{unscheduledItems.length}</span>
                )}
              </div>
              <div className="flex-1 flex items-center gap-1.5 px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-600">금주 완료</span>
                {completedThisWeek.length > 0 && (
                  <span className="ml-auto text-xs text-emerald-500 font-medium">{completedThisWeek.length}</span>
                )}
              </div>
            </div>
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* 미지정 할일 */}
              <div className="flex-1 overflow-y-auto p-2 border-r border-gray-50 space-y-0.5">
                {unscheduledItems.length === 0 ? (
                  <p className="text-sm text-gray-300 text-center py-3">없음</p>
                ) : unscheduledItems.map(item => (
                  <Link key={item.id} href={`/tasks/${item.taskId}`}>
                    <div className="py-1 px-1 hover:bg-gray-50 rounded transition-colors">
                      <div className="flex items-center gap-1 min-w-0">
                        {item.taskShortName && (
                          <span className="text-[10px] font-mono text-gray-400 flex-shrink-0 bg-gray-100 px-1 py-0.5 rounded">
                            {item.taskShortName}{(item.idxInTask ?? 0) + 1}
                          </span>
                        )}
                        <span className="text-sm text-gray-700 truncate">{item.title}</span>
                      </div>
                      {item.taskTitle && <span className="text-xs text-gray-400 truncate block">{item.taskTitle}</span>}
                    </div>
                  </Link>
                ))}
              </div>
              {/* 금주 완료 */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {completedThisWeek.length === 0 ? (
                  <p className="text-sm text-gray-300 text-center py-3">없음</p>
                ) : completedThisWeek.map(t => {
                  const joined = t.tasks as { id: string; title: string; short_name?: string | null } | null
                  return (
                    <Link key={t.id} href={`/tasks/${t.task_id}`}>
                      <div className="py-1 px-1 hover:bg-gray-50 rounded transition-colors">
                        <div className="flex items-center gap-1 min-w-0">
                          {joined?.short_name && (
                            <span className="text-[10px] font-mono text-gray-300 flex-shrink-0 bg-gray-50 px-1 py-0.5 rounded line-through">
                              {joined.short_name}
                            </span>
                          )}
                          <span className="text-sm text-gray-400 truncate line-through">{t.title}</span>
                        </div>
                        {joined?.title && <span className="text-xs text-gray-300 truncate block">{joined.title}</span>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
