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

function CompactCol({
  title, items, dark, warn, droppable, onDrop, onDragOver, onDragLeave,
  isDragOver, onComplete, completedCount = 0, colBadge,
}: CompactColProps) {
  const dragRing = isDragOver && droppable ? (dark ? 'ring-1 ring-white/20' : 'ring-1 ring-emerald-400/60') : ''

  const cardBase = 'rounded-2xl p-4 min-w-0 flex flex-col relative overflow-hidden h-full transition-all font-sans'
  const cardCls = dark
    ? `bg-[#1A1F2E] border border-white/6 shadow-2xl ${cardBase} ${dragRing}`
    : warn
      ? `bg-white/40 backdrop-blur-md border border-red-200/50 shadow-sm ${cardBase} ${dragRing}`
      : `bg-white/40 backdrop-blur-md border border-white/60 shadow-sm ${cardBase} ${dragRing}`

  const emptyTxt   = dark ? 'text-white/25' : 'text-gray-300'
  const itemTxt    = dark ? 'text-white/80' : 'text-gray-700'
  const subTxt     = dark ? 'text-white/35' : 'text-gray-400'
  const chipCls    = dark ? 'bg-white/10 text-white/35' : 'bg-gray-100/80 text-gray-400'
  const hoverCls   = dark ? 'hover:bg-white/5' : 'hover:bg-white/50'
  const divideCls  = dark ? 'divide-white/5' : 'divide-gray-100/60'
  const completeCls = dark
    ? 'border-white/20 hover:border-white/50'
    : 'border-gray-300/60 hover:border-emerald-400 hover:bg-emerald-50'
  const checkCls   = dark ? 'text-white/50' : 'text-emerald-500'
  const titleCls   = dark ? 'text-white/40' : warn ? 'text-[#B44A3A]' : 'text-gray-400'
  const badgeBg    = dark
    ? 'bg-white/10 text-white/50'
    : warn
      ? 'bg-[#FDECEA]/80 text-[#B44A3A]'
      : 'bg-gray-100/80 text-gray-500'

  return (
    <div className={cardCls}
      onDragOver={droppable ? onDragOver : undefined}
      onDrop={droppable ? onDrop : undefined}
      onDragLeave={droppable ? onDragLeave : undefined}
    >
      {/* 카드 헤더 */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${titleCls}`}>{title}</span>
        {items.length > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </div>

      {/* 아이템 목록 — 내부 스크롤 */}
      {items.length === 0 ? (
        <p className={`text-sm flex-1 flex items-center justify-center ${emptyTxt}`}>
          {isDragOver && droppable ? '여기에 놓기' : '없음'}
        </p>
      ) : (
        <div className={`divide-y ${divideCls} overflow-y-auto flex-1 min-h-0 scrollbar-hide`}>
          {items.map(item => (
            <div key={item.id}
              className={`group flex items-start gap-2 py-2 px-1 rounded transition-colors ${hoverCls}`}>
              {onComplete && (
                <button
                  onClick={e => { e.stopPropagation(); onComplete(item.id) }}
                  className={`flex-shrink-0 w-3.5 h-3.5 mt-0.5 rounded-full border transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center ${completeCls}`}
                  title="완료">
                  <span className={`text-[8px] leading-none ${checkCls}`}>✓</span>
                </button>
              )}
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                dark ? 'bg-[#F0C048]/60' : warn ? 'bg-red-300' : 'bg-gray-300'
              }`} />
              <Link href={`/tasks/${item.taskId}`} className="flex-1 min-w-0"
                draggable={droppable}
                onDragStart={droppable ? e => { e.stopPropagation(); e.dataTransfer.setData('todoId', item.id) } : undefined}>
                <div className="flex items-start gap-1.5 flex-wrap min-w-0">
                  {item.taskShortName && (
                    <span className={`text-[9px] font-mono flex-shrink-0 px-1 py-0.5 rounded mt-0.5 ${chipCls}`}>
                      {item.taskShortName}{(item.idxInTask ?? 0) + 1}
                    </span>
                  )}
                  <span className={`text-sm leading-relaxed break-words min-w-0 ${itemTxt}`}>
                    {item.title || '제목 없음'}
                  </span>
                </div>
                {item.taskTitle && (
                  <span className={`text-xs leading-relaxed break-words block mt-0.5 ${subTxt}`}>
                    {item.taskTitle}
                  </span>
                )}
              </Link>
              {colBadge && (
                <span className={`flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full self-start mt-0.5 ${colBadge.bg} ${colBadge.text}`}>
                  {colBadge.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 도트 그리드 (다크 카드 전용) */}
      {dark && (
        <div className="absolute bottom-3 right-3 opacity-50 pointer-events-none">
          <DotGrid total={28} filled={Math.min(completedCount, 28)} />
        </div>
      )}
    </div>
  )
}

function getThisWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
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
  const [tasks, setTasks]                       = useState<Task[]>([])
  const [todos, setTodos]                       = useState<TaskTodo[]>([])
  const [completedThisWeek, setCompletedThisWeek] = useState<TaskTodo[]>([])
  const [loading, setLoading]                   = useState(true)
  const [dragOverBucket, setDragOverBucket]     = useState<string | null>(null)
  const [meetings, setMeetings]                 = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [search, setSearch]                     = useState('')
  const [searchMeetings, setSearchMeetings]     = useState<Pick<Meeting, 'id' | 'title'>[]>([])
  const [meetingsLoaded, setMeetingsLoaded]     = useState(false)
  const [searchOpen, setSearchOpen]             = useState(false)
  const searchRef       = useRef<HTMLDivElement>(null)
  const searchInputRef  = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  type Shortcut = { id: string; title: string; url: string }
  const { value: shortcuts, save: saveShortcutsRemote } = useUserSetting<Shortcut[]>('home_shortcuts', [])
  const [showAddShortcut,  setShowAddShortcut]  = useState(false)
  const [newShortcutTitle, setNewShortcutTitle] = useState('')
  const [newShortcutUrl,   setNewShortcutUrl]   = useState('')
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null)
  const [editShortcutTitle, setEditShortcutTitle] = useState('')
  const [editShortcutUrl,   setEditShortcutUrl]   = useState('')

  useEffect(() => {
    Promise.all([
      fetchAllTasks(),
      supabase.from('meetings').select('id, title, meeting_date').order('meeting_date', { ascending: true }),
      supabase.from('task_todos')
        .select('id, title, target_date, sort_order, task_id, done, tasks(id, title, short_name)')
        .eq('done', false),
      supabase.from('task_todos')
        .select('id, title, done_at, sort_order, task_id, tasks(id, title, short_name)')
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

  function saveShortcuts(list: Shortcut[]) { saveShortcutsRemote(list) }

  function addShortcut() {
    if (!newShortcutUrl.trim()) return
    const url = newShortcutUrl.startsWith('http') ? newShortcutUrl : 'https://' + newShortcutUrl
    const title = newShortcutTitle.trim() || url
    saveShortcuts([...shortcuts, { id: Date.now().toString(), title, url }])
    setNewShortcutTitle(''); setNewShortcutUrl(''); setShowAddShortcut(false)
  }

  function removeShortcut(id: string) { saveShortcuts(shortcuts.filter(s => s.id !== id)) }

  function startEditShortcut(s: { id: string; title: string; url: string }) {
    setEditingShortcutId(s.id); setEditShortcutTitle(s.title); setEditShortcutUrl(s.url)
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
    setSearch(val); setSearchOpen(!!val)
    if (val && !meetingsLoaded) {
      const { data } = await supabase.from('meetings').select('id, title').order('created_at', { ascending: false })
      setSearchMeetings((data ?? []) as Pick<Meeting, 'id' | 'title'>[])
      setMeetingsLoaded(true)
    }
  }

  const q = search.trim().toLowerCase()
  const matchedTasks = q
    ? tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.retrospective?.improvement && t.retrospective.improvement.toLowerCase().includes(q))
      ).slice(0, 6)
    : []
  const matchedMeetings = q
    ? searchMeetings.filter(m => m.title.toLowerCase().includes(q)).slice(0, 4)
    : []
  const hasResults = matchedTasks.length > 0 || matchedMeetings.length > 0

  const { today, tomorrow, thisFriday } = getDateStrings()

  const taskTodoOrderMap: Record<string, TaskTodo[]> = {}
  todos.forEach(t => {
    if (!taskTodoOrderMap[t.task_id]) taskTodoOrderMap[t.task_id] = []
    taskTodoOrderMap[t.task_id].push(t)
  })
  Object.values(taskTodoOrderMap).forEach(arr =>
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  )

  function toColItems(filtered: TaskTodo[]): TodoColItem[] {
    return filtered.map(t => {
      const taskArr    = taskTodoOrderMap[t.task_id] ?? []
      const idxInTask  = taskArr.findIndex(x => x.id === t.id)
      const joinedTask = t.tasks as { id: string; title: string; short_name?: string | null } | null
      return {
        id: t.id, title: t.title, taskId: t.task_id,
        taskTitle:     joinedTask?.title ?? null,
        taskShortName: joinedTask?.short_name ?? null,
        idxInTask:     idxInTask >= 0 ? idxInTask : 0,
      }
    })
  }

  const todayItems     = toColItems(todos.filter(t => t.target_date === today))
  const tomorrowItems  = toColItems(todos.filter(t => t.target_date === tomorrow))
  const weekItems      = toColItems(todos.filter(t => t.target_date && t.target_date > tomorrow && t.target_date <= thisFriday))
  const overdueItems   = toColItems(todos.filter(t => t.target_date && t.target_date < today))

  function handleDragOver(e: React.DragEvent, bucket: string) {
    e.preventDefault(); setDragOverBucket(bucket)
  }

  async function handleDrop(e: React.DragEvent, bucket: 'today' | 'tomorrow' | 'this_week') {
    e.preventDefault(); setDragOverBucket(null)
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

  return (
    <div
      className="h-full overflow-hidden flex flex-col gap-3 py-4 font-sans"
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        setSearch(''); setSearchOpen(false)
        ;(document.activeElement as HTMLElement)?.blur()
      }}
    >

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[1.35rem] font-light tracking-tight text-gray-900 leading-tight">
            안녕하세요, 진일님.
          </h1>
          <p className="text-gray-400 mt-0.5 text-[10px] uppercase tracking-widest">
            {format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-6">
            {[
              { label: '오늘',   count: todayItems.length,   color: '#2E5E4A' },
              { label: '금주',   count: weekItems.length,    color: '#9CA3AF' },
              { label: '미진행', count: overdueItems.length, color: '#B44A3A' },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-right">
                <div className="font-semibold leading-none tabular-nums"
                  style={{ fontSize: '1.6rem', letterSpacing: '-0.04em', color }}>
                  {count}
                </div>
                <div className="text-gray-400 mt-0.5 text-[9px] uppercase tracking-widest">{label}</div>
              </div>
            ))}
          </div>

          {/* 검색 */}
          <div ref={searchRef} className="relative">
            <button
              onClick={() => { setSearchOpen(p => !p); if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50) }}
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/50 transition-all text-sm">
              🔍
            </button>
            {searchOpen && (
              <div className="absolute top-full mt-2 right-0 w-72 bg-white/90 backdrop-blur-xl rounded-2xl border border-white/80 shadow-xl z-50 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100/60">
                  <input ref={searchInputRef} value={search}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="업무·회의록 검색"
                    className="text-sm text-gray-700 focus:outline-none flex-1 bg-transparent" />
                  {search && (
                    <button onClick={() => { setSearch(''); setSearchOpen(false) }}
                      className="text-gray-300 hover:text-gray-500 text-base leading-none">×</button>
                  )}
                </div>
                {hasResults ? (
                  <div className="divide-y divide-gray-50/80 max-h-56 overflow-y-auto">
                    {matchedTasks.length > 0 && (
                      <div className="px-3 py-1.5">
                        <p className="text-xs font-semibold text-gray-400 mb-1">업무</p>
                        {matchedTasks.map(t => (
                          <Link key={t.id} href={`/tasks/${t.id}`} onClick={() => setSearchOpen(false)}>
                            <div className="py-1 px-1 hover:bg-gray-50/80 rounded-lg flex items-center gap-2">
                              <span className="text-xs text-gray-400">≡</span>
                              <span className="text-sm text-gray-800 truncate flex-1">{t.title || '제목 없음'}</span>
                              <span className={`text-xs flex-shrink-0 px-1.5 py-0.5 rounded ${
                                t.status === '완료' ? 'bg-green-50 text-green-600'
                                : t.status === '진행중' ? 'bg-blue-50 text-blue-600'
                                : 'bg-gray-100 text-gray-500'
                              }`}>{t.status}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                    {matchedMeetings.length > 0 && (
                      <div className="px-3 py-1.5">
                        <p className="text-xs font-semibold text-gray-400 mb-1">회의록</p>
                        {matchedMeetings.map(m => (
                          <Link key={m.id} href={`/meetings/${m.id}`} onClick={() => setSearchOpen(false)}>
                            <div className="py-1 px-1 hover:bg-gray-50/80 rounded-lg flex items-center gap-2">
                              <span className="text-xs text-gray-400">💬</span>
                              <span className="text-sm text-gray-800 truncate">{m.title || '제목 없음'}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : search ? (
                  <p className="text-sm text-gray-400 text-center py-3">검색 결과 없음</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 바로가기 ── */}
      <div className="flex-shrink-0 flex gap-1.5 flex-wrap items-center">
        {shortcuts.map(s => {
          if (editingShortcutId === s.id) return (
            <div key={s.id} className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 p-2 w-36 shadow-sm">
              <input value={editShortcutTitle} onChange={e => setEditShortcutTitle(e.target.value)}
                placeholder="이름" autoFocus
                className="text-xs font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200/60 pb-0.5 mb-0.5 bg-transparent" />
              <input value={editShortcutUrl} onChange={e => setEditShortcutUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEditShortcut(); if (e.key === 'Escape') setEditingShortcutId(null) }}
                placeholder="URL" className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
              <div className="flex gap-1 mt-1 justify-end">
                <button onClick={() => setEditingShortcutId(null)} className="text-xs text-gray-400 px-1.5 py-0.5">취소</button>
                <button onClick={saveEditShortcut} className="text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded">저장</button>
              </div>
            </div>
          )
          return (
            <div key={s.id} className="group relative">
              <a href={s.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 bg-white/40 backdrop-blur-md border border-white/60 rounded-full px-2.5 py-1 hover:bg-white/60 transition-all shadow-sm">
                <span className="text-xs text-gray-600 truncate max-w-24">🔗 {s.title}</span>
              </a>
              <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEditShortcut(s)}
                  className="w-3.5 h-3.5 bg-blue-500 text-white rounded-full text-[8px] flex items-center justify-center hover:bg-blue-600">✎</button>
                <button onClick={() => removeShortcut(s.id)}
                  className="w-3.5 h-3.5 bg-gray-400 text-white rounded-full text-[8px] flex items-center justify-center hover:bg-red-500">×</button>
              </div>
            </div>
          )
        })}
        {showAddShortcut ? (
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 p-2 w-36 shadow-sm">
            <input value={newShortcutTitle} onChange={e => setNewShortcutTitle(e.target.value)}
              placeholder="이름" autoFocus
              className="text-xs font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200/60 pb-0.5 mb-0.5 bg-transparent" />
            <input value={newShortcutUrl} onChange={e => setNewShortcutUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addShortcut(); if (e.key === 'Escape') setShowAddShortcut(false) }}
              placeholder="URL" className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
            <div className="flex gap-1 mt-1 justify-end">
              <button onClick={() => setShowAddShortcut(false)} className="text-xs text-gray-400 px-1.5 py-0.5">취소</button>
              <button onClick={addShortcut} className="text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded">추가</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setShowAddShortcut(true); setEditingShortcutId(null) }}
            className="flex items-center border border-dashed border-gray-300/60 hover:border-gray-400/60 rounded-full px-2.5 py-1 text-gray-300 hover:text-gray-400 transition-all text-xs">
            + 바로가기
          </button>
        )}
      </div>

      {/* ── 빠른 업무 추가 ── */}
      <div className="flex-shrink-0">
        <QuickTaskInput tasks={tasks} onAdded={todo => setTodos(prev => [todo, ...prev])} />
      </div>

      {/* ── 벤토 그리드 ──
          journal이 rows 3-4를 모두 차지하므로 backlog 영역 없음.
          today:   col 1, rows 1-2
          journal: cols 1-2, rows 3-4
          todo:    col 3, rows 3-4
      */}
      <div
        className="flex-1 min-h-0 grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
          gridTemplateAreas: `
            "today  tomorrow week"
            "today  overdue  overdue"
            "journal journal todo"
            "journal journal todo"
          `,
        }}
      >
        {/* 오늘 — 다크, rows 1-2 */}
        <div style={{ gridArea: 'today' }} className="min-h-0">
          <CompactCol
            title="오늘" items={todayItems} dark
            completedCount={completedThisWeek.length}
            colBadge={{ label: '진행중', bg: 'bg-violet-500/20', text: 'text-violet-300' }}
            droppable
            onDrop={e => handleDrop(e, 'today')}
            onDragOver={e => handleDragOver(e, 'today')}
            onDragLeave={() => setDragOverBucket(null)}
            isDragOver={dragOverBucket === 'today'}
            onComplete={handleCompleteTodo}
          />
        </div>

        {/* 내일 */}
        <div style={{ gridArea: 'tomorrow' }} className="min-h-0">
          <CompactCol
            title="내일" items={tomorrowItems}
            colBadge={{ label: '대기', bg: 'bg-gray-100/80', text: 'text-gray-400' }}
            droppable
            onDrop={e => handleDrop(e, 'tomorrow')}
            onDragOver={e => handleDragOver(e, 'tomorrow')}
            onDragLeave={() => setDragOverBucket(null)}
            isDragOver={dragOverBucket === 'tomorrow'}
            onComplete={handleCompleteTodo}
          />
        </div>

        {/* 금주 */}
        <div style={{ gridArea: 'week' }} className="min-h-0">
          <CompactCol
            title="금주" items={weekItems}
            colBadge={{ label: '대기', bg: 'bg-gray-100/80', text: 'text-gray-400' }}
            droppable
            onDrop={e => handleDrop(e, 'this_week')}
            onDragOver={e => handleDragOver(e, 'this_week')}
            onDragLeave={() => setDragOverBucket(null)}
            isDragOver={dragOverBucket === 'this_week'}
            onComplete={handleCompleteTodo}
          />
        </div>

        {/* 미진행 — 2열, row 2 */}
        <div style={{ gridArea: 'overdue' }} className="min-h-0">
          <CompactCol
            title="미진행" items={overdueItems} warn
            colBadge={{ label: '긴급', bg: 'bg-red-50/80', text: 'text-red-400' }}
            onComplete={handleCompleteTodo}
          />
        </div>

        {/* 회고 위젯 — 2열, rows 3-4 (확장됨) */}
        <div style={{ gridArea: 'journal' }} className="min-h-0 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
            <DailyJournalWidget tasks={tasks} meetings={meetings} />
          </div>
        </div>

        {/* 오늘 할일 위젯 — col 3, rows 3-4 */}
        <div style={{ gridArea: 'todo' }} className="min-h-0 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
            <TodayTodoWidget />
          </div>
        </div>
      </div>
    </div>
  )
}
