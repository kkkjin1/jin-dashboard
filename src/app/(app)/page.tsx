'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import DailyJournalWidget from '@/components/home/DailyJournalWidget'
import TodayTodoWidget from '@/components/home/TodayTodoWidget'
import UnscheduledWidget from '@/components/home/UnscheduledWidget'
import WeeklyGoalsWidget from '@/components/home/WeeklyGoalsWidget'
import MeetingBriefWidget from '@/components/home/MeetingBriefWidget'
import QuickTaskInput from '@/components/home/QuickTaskInput'
import { fetchAllTasks } from '@/lib/tasks'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import { HomePageSkeleton } from '@/components/ui/Skeleton'
import type { Task, Meeting, TaskTodo, ScheduleTag } from '@/types'

function getShortcutIcon(url: string, title: string): string {
  const u = url.toLowerCase()
  const t = title.toLowerCase()
  if (u.includes('calendar.google') || u.includes('calendar') || t.includes('캘린더') || t.includes('calendar')) return '📅'
  if (u.includes('gmail') || u.includes('/mail') || t.includes('메일') || t.includes('gmail') || t.includes('mail')) return '📧'
  if (u.includes('notion.') || t.includes('notion')) return '📋'
  if (u.includes('slack.com') || t.includes('slack')) return '💬'
  if (u.includes('github.com') || t.includes('github')) return '🐙'
  if (u.includes('figma.com') || t.includes('figma')) return '🎨'
  if (u.includes('drive.google') || t.includes('드라이브') || t.includes('drive')) return '📁'
  if (u.includes('docs.google') || t.includes('구글 문서') || t.includes('docs')) return '📄'
  if (u.includes('sheets.google') || t.includes('시트') || t.includes('sheet')) return '📊'
  if (u.includes('zoom.us') || t.includes('zoom')) return '🎥'
  if (u.includes('meet.google') || t.includes('meet')) return '🎥'
  if (u.includes('jira') || t.includes('jira')) return '🎯'
  if (u.includes('confluence') || t.includes('confluence')) return '🗂️'
  return '🔗'
}

function localDateStr(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function todayStr() {
  return localDateStr(new Date())
}

function formatSharedDateLabel(ds: string) {
  const d = new Date(ds + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(d); target.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff === 2) return '그제'
  const m = d.getMonth() + 1
  const day = d.getDate()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${m}/${day} (${days[d.getDay()]})`
}

interface TodoColItem {
  id: string
  title: string
  taskId: string
  taskTitle: string | null
  taskShortName?: string | null
  idxInTask?: number
  itemType?: 'todo' | 'meeting' | 'milestone' | 'oneonone'
  href?: string
  itemBadge?: { label: string; cls: string }
  isSubTask?: boolean
}

interface AgendaSTHome {
  id: string
  title: string
  target_date: string
  status: string
  agenda_item_id: string
  agenda_items: { id: string; title: string; agenda_groups: { id: string; name: string } | null } | null
}

interface CompactColProps {
  title: string
  items: TodoColItem[]
  dark?: boolean
  droppable?: boolean
  onDrop?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  isDragOver?: boolean
  onComplete?: (todoId: string, isSubTask?: boolean) => void
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
  title, items, dark, droppable, onDrop, onDragOver, onDragLeave,
  isDragOver, onComplete, completedCount = 0, colBadge,
}: CompactColProps) {
  const dragRing = isDragOver && droppable ? (dark ? 'ring-1 ring-white/20' : 'ring-1 ring-[#1B3A6B]/20') : ''

  const cardBase = 'rounded-2xl p-4 min-w-0 flex flex-col relative overflow-hidden h-full transition-all font-sans'
  const cardCls = dark
    ? `bg-[#1B3A6B] border border-white/8 shadow-2xl ${cardBase} ${dragRing}`
    : `bg-white/40 backdrop-blur-md border border-white/60 shadow-sm ${cardBase} ${dragRing}`

  const emptyTxt  = dark ? 'text-white/25' : 'text-gray-300'
  const itemTxt   = dark ? 'text-white/80' : 'text-gray-700'
  const subTxt    = dark ? 'text-white/35' : 'text-gray-400'
  const chipCls   = dark ? 'bg-white/10 text-white/35' : 'bg-gray-100/80 text-gray-400'
  const hoverCls  = dark ? 'hover:bg-white/5' : 'hover:bg-white/50'
  const divideCls = dark ? 'divide-white/5' : 'divide-gray-100/60'
  const completeCls = dark
    ? 'border-white/20 hover:border-white/50'
    : 'border-gray-300/60 hover:border-[#1B3A6B]/40 hover:bg-[#EFF6FF]'
  const checkCls  = dark ? 'text-white/50' : 'text-[#1B3A6B]'
  const titleCls  = dark ? 'text-white/40' : 'text-gray-400'
  const badgeBg   = dark ? 'bg-white/10 text-white/50' : 'bg-gray-100/80 text-gray-500'

  return (
    <div className={cardCls}
      onDragOver={droppable ? onDragOver : undefined}
      onDrop={droppable ? onDrop : undefined}
      onDragLeave={droppable ? onDragLeave : undefined}
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className={`text-xs font-semibold ${titleCls}`}>{title}</span>
        {items.length > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className={`text-sm flex-1 flex items-center justify-center ${emptyTxt}`}>
          {isDragOver && droppable ? '여기에 놓기' : '없음'}
        </p>
      ) : (
        <div className={`divide-y ${divideCls} overflow-y-auto flex-1 min-h-0 scrollbar-hide`}>
          {items.map(item => {
            const isTodo = !item.itemType || item.itemType === 'todo'
            const dotCls = item.itemType === 'meeting'
              ? 'bg-[#A8C0E0]'
              : item.itemType === 'milestone'
                ? 'bg-amber-400/70'
                : item.itemType === 'oneonone'
                  ? 'bg-purple-300/70'
                  : dark ? 'bg-[#F0C048]/60' : 'bg-gray-300'
            return (
              <div key={item.id}
                className={`group relative flex items-start gap-1.5 py-2 px-1 rounded transition-colors ${hoverCls}`}>
                {onComplete && isTodo && (
                  <button
                    onClick={e => { e.stopPropagation(); onComplete(item.id, item.isSubTask) }}
                    className={`absolute left-0 top-[7px] w-3.5 h-3.5 rounded-full border transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center z-10 ${completeCls}`}
                    title="완료">
                    <span className={`text-[8px] leading-none ${checkCls}`}>✓</span>
                  </button>
                )}
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotCls}`} />
                <Link href={item.href ?? `/tasks/${item.taskId}`} className="flex-1 min-w-0"
                  draggable={isTodo && droppable}
                  onDragStart={isTodo && droppable ? e => { e.stopPropagation(); e.dataTransfer.setData('todoId', item.id) } : undefined}>
                  <div className="flex items-start gap-1.5 flex-wrap min-w-0">
                    {item.taskShortName && (
                      <span className={`text-[9px] font-mono flex-shrink-0 px-1 py-0.5 rounded mt-0.5 ${chipCls}`}>
                        {item.taskShortName}{(item.idxInTask ?? 0) + 1}
                      </span>
                    )}
                    <span className={`text-xs leading-relaxed break-words min-w-0 ${itemTxt}`}>
                      {item.title || '제목 없음'}
                    </span>
                  </div>
                  {item.taskTitle && (
                    <span className={`text-xs leading-relaxed break-words block mt-0.5 ${subTxt}`}>
                      {item.taskTitle}
                    </span>
                  )}
                </Link>
                {item.itemBadge ? (
                  <span className={`flex-shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full self-start mt-0.5 ${item.itemBadge.cls}`}>
                    {item.itemBadge.label}
                  </span>
                ) : colBadge ? (
                  <span className={`flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full self-start mt-0.5 ${colBadge.bg} ${colBadge.text}`}>
                    {colBadge.label}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

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
  const [tasks, setTasks]                         = useState<Task[]>([])
  const [todos, setTodos]                         = useState<TaskTodo[]>([])
  const [completedThisWeek, setCompletedThisWeek] = useState<TaskTodo[]>([])
  const [loading, setLoading]                     = useState(true)
  const [dragOverBucket, setDragOverBucket]       = useState<string | null>(null)
  const [meetings, setMeetings]                   = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [oneOnOnes, setOneOnOnes]                 = useState<{ id: string; session_date: string }[]>([])
  const [agendaSubTasks, setAgendaSubTasks]       = useState<AgendaSTHome[]>([])
  const supabase = createClient()
  const [sharedDate, setSharedDate] = useState(todayStr())

  function navigateSharedDate(dir: -1 | 1) {
    setSharedDate(prev => {
      const [y, m, d] = prev.split('-').map(Number)
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() + dir)
      const next = localDateStr(dt)
      if (next > todayStr()) return prev
      return next
    })
  }

  async function handleAssignTodo(todoId: string, tag: ScheduleTag) {
    const { today: t, tomorrow: tm, thisFriday: tf } = getDateStrings()
    const targetDate = tag === 'today' ? t : tag === 'tomorrow' ? tm : tf
    await supabase.from('task_todos').update({ target_date: targetDate }).eq('id', todoId)
    setTodos(prev => prev.map(todo => todo.id === todoId ? { ...todo, target_date: targetDate } : todo))
  }

  type Shortcut = { id: string; title: string; url: string }
  const { value: shortcuts, save: saveShortcutsRemote } = useUserSetting<Shortcut[]>('home_shortcuts', [])
  const [showAddShortcut,   setShowAddShortcut]   = useState(false)
  const [newShortcutTitle,  setNewShortcutTitle]  = useState('')
  const [newShortcutUrl,    setNewShortcutUrl]    = useState('')
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
      supabase.from('one_on_ones')
        .select('id, session_date')
        .not('session_date', 'is', null),
      supabase.from('agenda_sub_tasks')
        .select('id, title, target_date, status, agenda_item_id, agenda_items(id, title, agenda_groups(id, name))')
        .neq('status', 'done')
        .not('target_date', 'is', null),
    ]).then(([taskData, { data: meetingData }, { data: todosData }, { data: completedData }, { data: ooData }, { data: stData }]) => {
      setTasks(taskData)
      setMeetings((meetingData ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[])
      setTodos((todosData ?? []) as unknown as TaskTodo[])
      setCompletedThisWeek((completedData ?? []) as unknown as TaskTodo[])
      setOneOnOnes((ooData ?? []) as { id: string; session_date: string }[])
      setAgendaSubTasks((stData ?? []) as unknown as AgendaSTHome[])
      setLoading(false)
    })
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

  function stToColItem(st: AgendaSTHome): TodoColItem {
    const groupName = st.agenda_items?.agenda_groups?.name
    const itemTitle = st.agenda_items?.title ?? null
    return {
      id: st.id,
      title: st.title,
      taskId: st.agenda_item_id,
      taskTitle: itemTitle ? (groupName ? `${groupName} · ${itemTitle}` : itemTitle) : null,
      taskShortName: null,
      itemType: 'todo',
      href: `/project/items/${st.agenda_item_id}`,
      itemBadge: { label: '안건', cls: 'bg-blue-50 text-blue-600 border border-blue-100' },
      isSubTask: true,
    }
  }

  function getMeetingItems(date: string): TodoColItem[]
  function getMeetingItems(from: string, to: string): TodoColItem[]
  function getMeetingItems(dateOrFrom: string, to?: string): TodoColItem[] {
    const filtered = to
      ? meetings.filter(m => m.meeting_date && m.meeting_date > dateOrFrom && m.meeting_date <= to)
      : meetings.filter(m => m.meeting_date === dateOrFrom)
    return filtered.map(m => ({
      id: `mtg-${m.id}`, title: m.title || '회의', taskId: m.id, taskTitle: null,
      itemType: 'meeting' as const, href: `/meetings/${m.id}`,
      itemBadge: { label: '회의', cls: 'bg-[#C7D8F0] text-[#1A3562]' },
    }))
  }

  function getMilestoneItems(date: string): TodoColItem[]
  function getMilestoneItems(from: string, to: string): TodoColItem[]
  function getMilestoneItems(dateOrFrom: string, to?: string): TodoColItem[] {
    const result: TodoColItem[] = []
    tasks.forEach(t => {
      const inRange = (d: string | null) => d && (to ? d > dateOrFrom && d <= to : d === dateOrFrom)
      if (inRange(t.mid_date)) result.push({
        id: `mid-${t.id}`, title: t.title, taskId: t.id, taskTitle: '중간공유',
        itemType: 'milestone' as const, href: `/tasks/${t.id}`,
        itemBadge: { label: '중간', cls: 'bg-amber-100 text-amber-700' },
      })
      if (inRange(t.end_date)) result.push({
        id: `end-${t.id}`, title: t.title, taskId: t.id, taskTitle: '최종보고',
        itemType: 'milestone' as const, href: `/tasks/${t.id}`,
        itemBadge: { label: '최종', cls: 'bg-red-100 text-red-600' },
      })
    })
    return result
  }

  function getOneOnOneItems(date: string): TodoColItem[]
  function getOneOnOneItems(from: string, to: string): TodoColItem[]
  function getOneOnOneItems(dateOrFrom: string, to?: string): TodoColItem[] {
    const filtered = to
      ? oneOnOnes.filter(s => s.session_date > dateOrFrom && s.session_date <= to)
      : oneOnOnes.filter(s => s.session_date === dateOrFrom)
    return filtered.map(s => ({
      id: `oo-${s.id}`, title: '1on1 세션', taskId: s.id, taskTitle: null,
      itemType: 'oneonone' as const, href: '/one-on-one',
      itemBadge: { label: '1on1', cls: 'bg-purple-100 text-purple-600' },
    }))
  }

  const todayItems    = [...toColItems(todos.filter(t => t.target_date === today)), ...agendaSubTasks.filter(st => st.target_date === today).map(stToColItem), ...getMeetingItems(today), ...getMilestoneItems(today), ...getOneOnOneItems(today)]
  const tomorrowItems = [...toColItems(todos.filter(t => t.target_date === tomorrow)), ...agendaSubTasks.filter(st => st.target_date === tomorrow).map(stToColItem), ...getMeetingItems(tomorrow), ...getMilestoneItems(tomorrow), ...getOneOnOneItems(tomorrow)]
  const weekItems     = [...toColItems(todos.filter(t => t.target_date && t.target_date > tomorrow && t.target_date <= thisFriday)), ...agendaSubTasks.filter(st => st.target_date > tomorrow && st.target_date <= thisFriday).map(stToColItem), ...getMeetingItems(tomorrow, thisFriday), ...getMilestoneItems(tomorrow, thisFriday), ...getOneOnOneItems(tomorrow, thisFriday)]

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

  async function handleCompleteTodo(todoId: string, isSubTask?: boolean) {
    if (isSubTask) {
      await supabase.from('agenda_sub_tasks').update({ status: 'done' }).eq('id', todoId)
      setAgendaSubTasks(prev => prev.filter(st => st.id !== todoId))
      return
    }
    const doneAt = new Date().toISOString()
    await supabase.from('task_todos').update({ done: true, done_at: doneAt }).eq('id', todoId)
    const completed = todos.find(t => t.id === todoId)
    setTodos(prev => prev.filter(t => t.id !== todoId))
    if (completed) setCompletedThisWeek(prev => [{ ...completed, done: true, done_at: doneAt }, ...prev])
  }

  if (loading) return <HomePageSkeleton />

  return (
    <div className="h-full overflow-hidden flex flex-col gap-3 py-4 font-sans">

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
                <button onClick={saveEditShortcut} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-1.5 py-0.5 rounded">저장</button>
              </div>
            </div>
          )
          return (
            <div key={s.id} className="group relative">
              <a href={s.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 bg-white/40 backdrop-blur-md border border-white/60 rounded-full px-2.5 py-1 hover:bg-white/60 transition-all shadow-sm">
                <span className="text-xs text-gray-600 truncate max-w-24">{getShortcutIcon(s.url, s.title)} {s.title}</span>
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
              <button onClick={addShortcut} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-1.5 py-0.5 rounded">추가</button>
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

      {/* ── 모바일 레이아웃 ── */}
      <div className="md:hidden flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-3 pb-4">
        <div className="h-72 flex-shrink-0">
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
        <div className="grid grid-cols-2 gap-3 flex-shrink-0" style={{ height: '11rem' }}>
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
        <div className="flex-shrink-0 h-64 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
            <DailyJournalWidget selectedDate={todayStr()} onNavigate={() => {}} tasks={tasks} meetings={meetings.map(m => ({ id: m.id, title: m.title ?? '', meeting_date: m.meeting_date ?? null }))} />
          </div>
        </div>
        <div className="flex-shrink-0 h-64 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
            <TodayTodoWidget />
          </div>
        </div>
      </div>

      {/* ── 데스크톱: 2행 그리드 ──
           Row 1 (flex-[2]): 오늘 | 내일 | 금주 | 오늘할일  (4등분 소형)
           Row 2 (flex-[3]): 오늘일상(1/3) | 회고(2/3)      (자동초안 연동)
      */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 gap-3">

        {/* Row 1 — 오늘 | 내일 | 금주 | 미배정 */}
        <div className="flex-[2] grid grid-cols-4 gap-3 min-h-0">
          <div className="min-h-0">
            <CompactCol
              title="☀️ 오늘" items={todayItems} dark
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
          <div className="min-h-0">
            <CompactCol
              title="🌙 내일" items={tomorrowItems}
              colBadge={{ label: '대기', bg: 'bg-gray-100/80', text: 'text-gray-400' }}
              droppable
              onDrop={e => handleDrop(e, 'tomorrow')}
              onDragOver={e => handleDragOver(e, 'tomorrow')}
              onDragLeave={() => setDragOverBucket(null)}
              isDragOver={dragOverBucket === 'tomorrow'}
              onComplete={handleCompleteTodo}
            />
          </div>
          <div className="min-h-0">
            <CompactCol
              title="📅 금주" items={weekItems}
              colBadge={{ label: '대기', bg: 'bg-gray-100/80', text: 'text-gray-400' }}
              droppable
              onDrop={e => handleDrop(e, 'this_week')}
              onDragOver={e => handleDragOver(e, 'this_week')}
              onDragLeave={() => setDragOverBucket(null)}
              isDragOver={dragOverBucket === 'this_week'}
              onComplete={handleCompleteTodo}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
              <UnscheduledWidget todos={todos} onAssign={handleAssignTodo} onComplete={handleCompleteTodo} />
            </div>
          </div>
        </div>

        {/* Row 2 — 회고(1) | 금주목표(1) | 오늘회의+오늘할일(2) */}
        <div className="flex-[3] grid grid-cols-4 gap-3 min-h-0">
          {/* 회고 */}
          <div className="min-h-0 overflow-hidden col-span-1">
            <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
              <DailyJournalWidget
                selectedDate={sharedDate}
                onNavigate={navigateSharedDate}
                onDateChange={date => setSharedDate(date)}
                tasks={tasks}
                meetings={meetings}
              />
            </div>
          </div>
          {/* 금주 목표 */}
          <div className="min-h-0 overflow-hidden col-span-1">
            <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
              <WeeklyGoalsWidget tasks={tasks} />
            </div>
          </div>
          {/* 오늘 회의 + 오늘 할 일 (2칸 합산) */}
          <div className="min-h-0 overflow-hidden col-span-2">
            <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans grid grid-cols-2 divide-x divide-white/40">
              <div className="min-h-0 overflow-hidden">
                <MeetingBriefWidget />
              </div>
              <div className="min-h-0 overflow-hidden">
                <TodayTodoWidget />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
