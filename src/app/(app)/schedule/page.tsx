'use client'

import { useEffect, useRef, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, getDay, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers } from '@/lib/tasks'
import { useUserSetting } from '@/hooks/useUserSetting'
import type { Task, Member, TaskStatus, Part, Meeting } from '@/types'

interface MeetingSchedule {
  id: string
  title: string
  time: string
  is_recurring: boolean
  days_of_week?: number[]
  date?: string
  prep_note?: string
}

const DOW_LABELS_SCHED = ['일', '월', '화', '수', '목', '금', '토']

function todayStrSched(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']

interface DayTask {
  task: Task
  dateType: 'mid' | 'end'
}

interface ScheduledTodo {
  id: string
  title: string
  target_date: string
  task: { id: string; title: string; short_name: string | null; assignee_id: string | null; part: string }
}

interface ScheduledOneOnOne {
  id: string
  member_id: string
  member_name: string
  next_appointment_date: string
}

export default function SchedulePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>[]>([])
  const [scheduledTodos, setScheduledTodos] = useState<ScheduledTodo[]>([])
  const [current, setCurrent] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | '전체'>('전체')
  const [partFilter, setPartFilter] = useState<Part | '전체'>('전체')
  const [viewFilter, setViewFilter] = useState<'전체' | '업무만' | '회의만'>('전체')
  const [reportFilter, setReportFilter] = useState<'전체' | '중간공유' | '최종보고'>('전체')
  const [showPrevCal, setShowPrevCal] = useState(false)
  const [showNextCal, setShowNextCal] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysisPeriod, setAnalysisPeriod] = useState<'이번주' | '이번달' | '직전월'>('이번달')
  const [showRepeatModal, setShowRepeatModal] = useState(false)
  const [repeatTitle, setRepeatTitle] = useState('')
  const [repeatDay, setRepeatDay] = useState('15')
  const [repeatMonthCount, setRepeatMonthCount] = useState('3')
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dayOrder, setDayOrder] = useState<Record<string, string[]>>({})
  // 할일별 담당자 (task detail 페이지에서 localStorage 공유)
  const [todoAssigneeMap, setTodoAssigneeMap] = useState<Record<string, string>>({})
  // 예정 1on1 (next_appointment_date 기준)
  const [scheduledOneOnOnes, setScheduledOneOnOnes] = useState<ScheduledOneOnOne[]>([])
  const router = useRouter()

  // 고정 회의 관리
  const { value: schedules, save: saveSchedules } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [meetForm, setMeetForm] = useState({ title: '', time: '09:00', is_recurring: true, days_of_week: [] as number[], date: todayStrSched() })

  function addMeetingSchedule() {
    if (!meetForm.title.trim()) return
    const item: MeetingSchedule = {
      id: Date.now().toString(),
      title: meetForm.title.trim(),
      time: meetForm.time,
      is_recurring: meetForm.is_recurring,
      ...(meetForm.is_recurring ? { days_of_week: meetForm.days_of_week } : { date: meetForm.date }),
    }
    saveSchedules([...schedules, item])
    setMeetForm({ title: '', time: '09:00', is_recurring: true, days_of_week: [], date: todayStrSched() })
    setShowMeetingForm(false)
  }

  function removeMeetingSchedule(id: string) {
    saveSchedules(schedules.filter(s => s.id !== id))
  }

  function toggleMeetDow(d: number) {
    setMeetForm(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(d)
        ? prev.days_of_week.filter(x => x !== d)
        : [...prev.days_of_week, d],
    }))
  }
  const assigneeRef = useRef<HTMLSelectElement>(null)
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      fetchAllTasks(),
      fetchMembers(),
      supabase.from('meetings').select('id, title, meeting_date, category').not('meeting_date', 'is', null),
      supabase.from('task_todos').select('id, title, target_date, tasks!inner(id, title, short_name, assignee_id, part)').not('target_date', 'is', null).eq('done', false),
    ]).then(([t, m, { data: mtgs }, { data: todoData }]) => {
      setTasks(t); setMembers(m)
      setMeetings((mtgs ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setScheduledTodos((todoData ?? []).map((r: any) => ({ id: r.id, title: r.title, target_date: r.target_date, task: r.tasks })))
    })
    // 할일별 담당자 맵 (task detail과 localStorage 공유)
    try {
      const raw = localStorage.getItem('todo_assignees')
      if (raw) setTodoAssigneeMap(JSON.parse(raw))
    } catch {}
    // 예정 1on1 (next_appointment_date 설정된 것)
    supabase
      .from('one_on_ones')
      .select('id, member_id, next_appointment_date, members(name)')
      .not('next_appointment_date', 'is', null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        if (data) setScheduledOneOnOnes((data as any[]).map(r => ({
          id: r.id,
          member_id: r.member_id,
          member_name: r.members?.name ?? '팀원',
          next_appointment_date: r.next_appointment_date,
        })))
      })
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'KeyQ') setPartFilter(p => p === '전체' ? '코어' : p === '코어' ? '비즈' : '전체')
      if (e.code === 'KeyW') setStatusFilter(s => s === '전체' ? '진행필요' : s === '진행필요' ? '진행중' : s === '진행중' ? '완료' : '전체')
      if (e.code === 'KeyE') setReportFilter(r => r === '전체' ? '중간공유' : r === '중간공유' ? '최종보고' : '전체')
      if (e.code === 'KeyR') setViewFilter(v => v === '전체' ? '업무만' : v === '업무만' ? '회의만' : '전체')
      if (e.key === 'Tab') { e.preventDefault(); assigneeRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onMeetingCreated(e: Event) {
      const m = (e as CustomEvent).detail as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>
      if (m?.meeting_date) setMeetings(prev => [...prev, m])
    }
    window.addEventListener('quick-meeting-created', onMeetingCreated)
    return () => window.removeEventListener('quick-meeting-created', onMeetingCreated)
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('schedule_day_order')
      if (saved) setDayOrder(JSON.parse(saved))
    } catch {}
  }, [])

  const filtered = tasks.filter(t => {
    if (assigneeFilter !== '전체' && t.assignee_id !== assigneeFilter) return false
    if (statusFilter !== '전체' && t.status !== statusFilter) return false
    if (partFilter !== '전체' && t.part !== partFilter) return false
    return true
  })

  const start = startOfMonth(current)
  const end = endOfMonth(current)
  const days = eachDayOfInterval({ start, end })
  const startDow = getDay(start)

  const prevMonth = subMonths(current, 1)
  const prevDays = startDow > 0
    ? Array.from({ length: startDow }, (_, i) => {
        const d = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), getDaysInMonth(prevMonth) - startDow + 1 + i)
        return d
      })
    : []

  const totalCells = prevDays.length + days.length
  const nextCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
  const nextMonth = addMonths(current, 1)
  const nextDays = Array.from({ length: nextCount }, (_, i) => new Date(nextMonth.getFullYear(), nextMonth.getMonth(), i + 1))

  function getDayTasks(day: Date): DayTask[] {
    if (viewFilter === '회의만') return []
    const result: DayTask[] = []
    filtered.forEach(t => {
      if (t.mid_date && isSameDay(parseISO(t.mid_date), day)) {
        if (reportFilter === '전체' || reportFilter === '중간공유')
          result.push({ task: t, dateType: 'mid' })
      }
      if (t.end_date && isSameDay(parseISO(t.end_date), day)) {
        if (reportFilter === '전체' || reportFilter === '최종보고')
          result.push({ task: t, dateType: 'end' })
      }
    })
    return result
  }

  function getDayMeetings(day: Date) {
    if (viewFilter === '업무만') return []
    return meetings.filter(m => m.meeting_date && isSameDay(parseISO(m.meeting_date), day))
  }

  function getDayScheduledTodos(day: Date): ScheduledTodo[] {
    if (viewFilter === '회의만') return []
    return scheduledTodos.filter(t => {
      if (!isSameDay(parseISO(t.target_date), day)) return false
      // 할일별 담당자 우선, 없으면 업무 담당자 사용
      const effectiveAssignee = todoAssigneeMap[t.id] ?? t.task.assignee_id
      if (assigneeFilter !== '전체' && effectiveAssignee !== assigneeFilter) return false
      if (partFilter !== '전체' && t.task.part !== partFilter) return false
      return true
    })
  }

  function getDayOneOnOnes(day: Date): ScheduledOneOnOne[] {
    if (viewFilter === '업무만') return []
    return scheduledOneOnOnes.filter(o => isSameDay(parseISO(o.next_appointment_date), day))
  }

  const selectedDayTasks = selectedDay ? getDayTasks(selectedDay) : []
  const selectedDayMeetings = selectedDay ? getDayMeetings(selectedDay) : []
  const selectedDayTodos = selectedDay ? getDayScheduledTodos(selectedDay) : []
  const selectedDayOneOnOnes = selectedDay ? getDayOneOnOnes(selectedDay) : []

  type DayListItem =
    | { itemId: string; type: 'task'; data: DayTask }
    | { itemId: string; type: 'meeting'; data: Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'> }
    | { itemId: string; type: 'todo'; data: ScheduledTodo }

  function getOrderedDayItems(): DayListItem[] {
    const all: DayListItem[] = [
      ...selectedDayMeetings.map(m => ({ itemId: `meeting-${m.id}`, type: 'meeting' as const, data: m })),
      ...selectedDayTasks.map(dt => ({ itemId: `task-${dt.task.id}-${dt.dateType}`, type: 'task' as const, data: dt })),
      ...selectedDayTodos.map(t => ({ itemId: `todo-${t.id}`, type: 'todo' as const, data: t })),
    ]
    if (!selectedDay) return all
    const key = format(selectedDay, 'yyyy-MM-dd')
    const savedOrder = dayOrder[key]
    if (!savedOrder || savedOrder.length === 0) return all
    const itemMap = new Map(all.map(item => [item.itemId, item]))
    const ordered: DayListItem[] = []
    for (const id of savedOrder) {
      const item = itemMap.get(id)
      if (item) { ordered.push(item); itemMap.delete(id) }
    }
    ordered.push(...itemMap.values())
    return ordered
  }

  function handleDayDrop(targetId: string) {
    if (!dragItemId || !selectedDay || dragItemId === targetId) return
    const key = format(selectedDay, 'yyyy-MM-dd')
    const items = getOrderedDayItems()
    const ids = items.map(i => i.itemId)
    const fromIdx = ids.indexOf(dragItemId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const newIds = [...ids]
    newIds.splice(fromIdx, 1)
    newIds.splice(toIdx, 0, dragItemId)
    const newOrder = { ...dayOrder, [key]: newIds }
    setDayOrder(newOrder)
    localStorage.setItem('schedule_day_order', JSON.stringify(newOrder))
    setDragItemId(null); setDragOverId(null)
  }

  function countWeekdays(start: Date, end: Date): number {
    let count = 0
    const cur = new Date(start)
    while (cur <= end) { const dow = cur.getDay(); if (dow !== 0 && dow !== 6) count++; cur.setDate(cur.getDate() + 1) }
    return count
  }

  function getPeriodRange(period: '이번주' | '이번달' | '직전월'): [Date, Date] {
    const today = new Date()
    if (period === '이번달') return [startOfMonth(today), endOfMonth(today)]
    if (period === '직전월') { const prev = subMonths(today, 1); return [startOfMonth(prev), endOfMonth(prev)] }
    const dow = today.getDay()
    const diffToMon = (dow === 0 ? -6 : 1 - dow)
    const mon = new Date(today); mon.setDate(today.getDate() + diffToMon); mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999)
    return [mon, sun]
  }

  function countMonthEvents(monthDate: Date): { meetings: number; tasks: number } {
    const mStart = startOfMonth(monthDate); const mEnd = endOfMonth(monthDate)
    const inRange = (dateStr: string | null | undefined) => { if (!dateStr) return false; const d = parseISO(dateStr); return d >= mStart && d <= mEnd }
    return { meetings: meetings.filter(m => inRange(m.meeting_date)).length, tasks: tasks.filter(t => inRange(t.mid_date) || inRange(t.end_date)).length }
  }

  function computeAnalysis(period: '이번주' | '이번달' | '직전월') {
    const [pStart, pEnd] = getPeriodRange(period)
    const inRange = (dateStr: string | null | undefined) => { if (!dateStr) return false; const d = parseISO(dateStr); return d >= pStart && d <= pEnd }
    const workDays = countWeekdays(pStart, pEnd)
    const meetingCount = meetings.filter(m => inRange(m.meeting_date)).length
    const taskDeadlines = tasks.filter(t => inRange(t.mid_date) || inRange(t.end_date)).length
    const totalHours = workDays * 8
    const meetingHours = meetingCount * 1
    const focusHours = Math.max(0, totalHours - meetingHours)
    return { workDays, meetingCount, taskDeadlines, totalHours, meetingHours, focusHours }
  }

  async function handleCreateRepeating() {
    if (!repeatTitle.trim()) return
    const day = Math.max(1, Math.min(31, parseInt(repeatDay) || 15))
    const count = parseInt(repeatMonthCount) || 3
    const today = new Date()
    const newMeetings: typeof meetings = []
    for (let i = 0; i < count; i++) {
      const month = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const actualDay = Math.min(day, getDaysInMonth(month))
      const dateStr = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(actualDay).padStart(2,'0')}`
      const { data } = await supabase.from('meetings').insert({ title: repeatTitle.trim(), meeting_date: dateStr, notes: [] }).select('id, title, meeting_date, category').single()
      if (data) newMeetings.push(data as typeof meetings[0])
    }
    setMeetings(prev => [...prev, ...newMeetings])
    setRepeatTitle(''); setRepeatDay('15'); setRepeatMonthCount('3')
    setShowRepeatModal(false)
  }

  const prevMonthNav = subMonths(current, 1)
  const nextMonthNav = addMonths(current, 1)
  const analysis = computeAnalysis(analysisPeriod)

  function getMeetingColor(category: string | null | undefined): string {
    switch (category) {
      case '코어':   return 'bg-[#BADEC8]/50 text-gray-800'
      case '비즈':   return 'bg-[#F3E482]/55 text-gray-800'
      case '경영진': return 'bg-[#90A7D8]/40 text-gray-800'
      case '본부장': return 'bg-[#EBA698]/40 text-gray-800'
      case '타팀':   return 'bg-[#BFE4B5]/50 text-gray-800'
      default:       return 'bg-[#BADEC8]/50 text-gray-800'
    }
  }

  function renderDay(day: Date, isOtherMonth: boolean) {
    const dayTasks = getDayTasks(day)
    const dayMeetings = getDayMeetings(day)
    const dayTodos = getDayScheduledTodos(day)
    const dayOneOnOnes = getDayOneOnOnes(day)
    const allItems = [
      ...dayTasks.map(dt => ({ type: 'task' as const, dt })),
      ...dayMeetings.map(m => ({ type: 'meeting' as const, m })),
      ...dayTodos.map(t => ({ type: 'todo' as const, t })),
      ...dayOneOnOnes.map(o => ({ type: 'one-on-one' as const, o })),
    ]
    const isToday = isSameDay(day, new Date())
    const isSelected = selectedDay && isSameDay(day, selectedDay)
    return (
      <div key={day.toISOString()}
        onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
        className={`min-h-24 p-1.5 rounded-2xl cursor-pointer transition-colors ${isToday ? 'ring-1 ring-[#BADEC8] ring-inset' : ''} ${isSelected ? 'bg-white/60' : isOtherMonth ? 'bg-white/10 opacity-40' : 'hover:bg-white/40'}`}>
        <p className={`text-xs text-center mb-1.5 w-6 h-6 flex items-center justify-center rounded-full mx-auto ${
          isToday ? 'bg-[#2D5A45] text-white font-bold' : isOtherMonth ? 'text-gray-300' : 'text-gray-600'
        }`}>
          {format(day, 'd')}
        </p>
        <div className="space-y-0.5">
          {allItems.slice(0, 4).map((item, idx) => {
            if (item.type === 'task') {
              const { dt } = item
              return (
                <button key={`task-${dt.task.id}-${dt.dateType}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/tasks/${dt.task.id}`) }}
                  className={`w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 font-medium ${
                    dt.dateType === 'mid' ? 'bg-[#F3E482]/65 text-gray-800' : 'bg-[#90A7D8]/45 text-gray-800'
                  }`}
                  title={`${dt.dateType === 'mid' ? '중간공유' : '최종보고'} | ${dt.task.title}`}>
                  <span className="opacity-70">{dt.dateType === 'mid' ? '중간' : '최종'}</span>
                  {' '}{dt.task.title}
                </button>
              )
            } else if (item.type === 'meeting') {
              const { m } = item
              return (
                <button key={`meeting-${m.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/meetings/${m.id}`) }}
                  className={`w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 font-medium ${getMeetingColor(m.category)}`}
                  title={`회의 | ${m.title}`}>
                  {m.title}
                </button>
              )
            } else if (item.type === 'todo') {
              const { t } = item
              return (
                <button key={`todo-${t.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/tasks/${t.task.id}`) }}
                  className="w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 bg-violet-50/80 text-violet-800"
                  title={`할일 | ${t.title}`}>
                  <span className="opacity-50 mr-0.5">·</span>{t.title}
                </button>
              )
            } else {
              const { o } = item
              return (
                <button key={`oo-${o.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/one-on-one/${o.member_id}`) }}
                  className="w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 bg-purple-100/70 text-purple-800"
                  title={`1on1 | ${o.member_name}`}>
                  <span className="opacity-60 mr-0.5 text-[9px]">1:1</span>{o.member_name}
                </button>
              )
            }
          })}
          {allItems.length > 4 && <p className="text-[10px] text-gray-400 text-center">+{allItems.length - 4}</p>}
        </div>
      </div>
    )
  }

  const pillBase = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
  const pillActive = 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
  const pillInactive = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">일정</h1>
      </div>

      {/* 필터 pills */}
      <div className="flex-shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-hide mb-4">
        <button onClick={() => setPartFilter(p => p === '전체' ? '코어' : p === '코어' ? '비즈' : '전체')}
          className={`${pillBase} ${partFilter !== '전체' ? pillActive : pillInactive}`}>
          {partFilter === '전체' ? '전체 파트' : `${partFilter}파트`}
        </button>

        <button onClick={() => setStatusFilter(s => s === '전체' ? '진행필요' : s === '진행필요' ? '진행중' : s === '진행중' ? '완료' : '전체')}
          className={`${pillBase} ${statusFilter !== '전체' ? pillActive : pillInactive}`}>
          {statusFilter === '전체' ? '전체 상태' : statusFilter}
        </button>

        <button onClick={() => setReportFilter(r => r === '전체' ? '중간공유' : r === '중간공유' ? '최종보고' : '전체')}
          className={`${pillBase} ${reportFilter !== '전체' ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : pillInactive}`}>
          {reportFilter === '전체' ? '보고구분' : reportFilter}
        </button>

        <button onClick={() => setViewFilter(v => v === '전체' ? '업무만' : v === '업무만' ? '회의만' : '전체')}
          className={`${pillBase} ${viewFilter !== '전체' ? 'bg-[#1C2B3A] text-white border-[#1C2B3A] shadow-sm' : pillInactive}`}>
          {viewFilter === '전체' ? '업무+회의' : viewFilter}
        </button>

        <select ref={assigneeRef} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          className={`${pillBase} bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 focus:outline-none cursor-pointer`}>
          <option value="전체">전체 담당자</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <button onClick={() => setShowRepeatModal(true)}
          className={`${pillBase} ${pillInactive} ml-auto`}>
          ↺ 반복 추가
        </button>
      </div>

      {/* 메인 그리드 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">

          {/* 캘린더 */}
          <div className="md:col-span-2 bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">{format(current, 'yyyy년 M월', { locale: ko })}</h2>
              <div className="flex items-center gap-1 bg-white/50 rounded-full p-1 border border-white/70">
                <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="px-2.5 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-full transition-all">←</button>
                <button onClick={() => setCurrent(new Date())}
                  className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-700 hover:bg-white/60 rounded-full transition-all font-medium">오늘</button>
                <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="px-2.5 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-full transition-all">→</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px flex-1">
              {['일','월','화','수','목','금','토'].map(d => (
                <div key={d} className="text-center text-xs text-gray-400 font-medium py-2">{d}</div>
              ))}
              {prevDays.map(d => renderDay(d, true))}
              {days.map(d => renderDay(d, false))}
              {nextDays.map(d => renderDay(d, true))}
            </div>

            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/50 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-[#F3E482]/60 rounded border border-[#F3E482]/80" />
                <span className="text-xs text-gray-400">중간공유</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-[#90A7D8]/40 rounded border border-[#90A7D8]/60" />
                <span className="text-xs text-gray-400">최종보고</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <div className="w-2 h-2.5 bg-[#BADEC8]/50 rounded" />
                  <div className="w-2 h-2.5 bg-[#F3E482]/55 rounded" />
                  <div className="w-2 h-2.5 bg-[#90A7D8]/40 rounded" />
                </div>
                <span className="text-xs text-gray-400">회의</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-violet-50/80 rounded border border-violet-200/50" />
                <span className="text-xs text-gray-400">할일</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-purple-100/70 rounded border border-purple-200/50" />
                <span className="text-xs text-gray-400">1on1</span>
              </div>
              <div className="ml-auto">
                <button onClick={() => setShowAnalysis(v => !v)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${showAnalysis ? pillActive : pillInactive}`}>
                  ⏱ 시간 분석
                </button>
              </div>
            </div>

            {showAnalysis && (
              <div className="mt-4 pt-4 border-t border-white/50">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-gray-400 mr-1">기간</span>
                  {(['이번주', '이번달', '직전월'] as const).map(p => (
                    <button key={p} onClick={() => setAnalysisPeriod(p)}
                      className={`text-xs px-3 py-1 rounded-full transition-all ${analysisPeriod === p ? pillActive : 'bg-white/50 text-gray-500 border border-white/60 hover:bg-white/70'}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: '업무일', value: analysis.workDays, unit: '일', cls: 'bg-white/50' },
                    { label: '회의 건수', value: analysis.meetingCount, unit: '건', cls: 'bg-rose-50/60' },
                    { label: '업무 마감', value: analysis.taskDeadlines, unit: '건', cls: 'bg-slate-50/60' },
                  ].map(s => (
                    <div key={s.label} className={`${s.cls} rounded-2xl border border-white/60 p-3 text-center`}>
                      <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                      <p className="text-lg font-bold text-gray-800">{s.value}<span className="text-xs font-normal text-gray-400 ml-0.5">{s.unit}</span></p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex h-3.5 rounded-full overflow-hidden bg-white/40">
                    {analysis.totalHours > 0 && (
                      <>
                        <div className="bg-rose-300 transition-all" style={{ width: `${Math.min(100, (analysis.meetingHours / analysis.totalHours) * 100)}%` }} />
                        <div className="bg-[#BADEC8]/70 transition-all" style={{ width: `${Math.min(100, (analysis.focusHours / analysis.totalHours) * 100)}%` }} />
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    총 <span className="font-semibold text-gray-700">{analysis.totalHours}h</span>{' · '}
                    회의 <span className="font-semibold text-rose-500">{analysis.meetingHours}h</span>{' · '}
                    집중 <span className="font-semibold text-[#2D5A45]">{analysis.focusHours}h</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 우측 패널 */}
          <div className="space-y-3">

            {/* 고정 회의 설정 */}
            <div id="meetings" className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">📋 고정 회의</h3>
                <button
                  onClick={() => setShowMeetingForm(p => !p)}
                  className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors">
                  {showMeetingForm ? '취소' : '+ 추가'}
                </button>
              </div>

              {showMeetingForm && (
                <div className="mb-3 p-2.5 bg-white/60 border border-gray-200/60 rounded-xl space-y-2">
                  <input
                    autoFocus
                    value={meetForm.title}
                    onChange={e => setMeetForm(p => ({ ...p, title: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addMeetingSchedule() }}
                    placeholder="회의명"
                    className="w-full text-xs focus:outline-none border-b border-gray-100 pb-1 bg-transparent text-gray-700 placeholder:text-gray-300"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={meetForm.time}
                      onChange={e => setMeetForm(p => ({ ...p, time: e.target.value }))}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none text-gray-600 bg-white"
                    />
                    <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={meetForm.is_recurring}
                        onChange={e => setMeetForm(p => ({ ...p, is_recurring: e.target.checked }))}
                        className="w-3 h-3"
                      />
                      반복
                    </label>
                  </div>
                  {meetForm.is_recurring ? (
                    <div className="flex gap-1">
                      {DOW_LABELS_SCHED.map((label, d) => (
                        <button key={d} type="button" onClick={() => toggleMeetDow(d)}
                          className={`text-[9px] w-6 h-6 rounded-full font-medium transition-colors ${
                            meetForm.days_of_week.includes(d) ? 'bg-[#1B3A6B] text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="date"
                      value={meetForm.date}
                      onChange={e => setMeetForm(p => ({ ...p, date: e.target.value }))}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none text-gray-600 bg-white"
                    />
                  )}
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button onClick={() => setShowMeetingForm(false)}
                      className="text-[10px] text-gray-400 hover:text-gray-600">취소</button>
                    <button onClick={addMeetingSchedule} disabled={!meetForm.title.trim()}
                      className="text-[10px] bg-[#1B3A6B] text-white px-2.5 py-1 rounded-full disabled:opacity-40">
                      저장
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {schedules.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-2">등록된 고정 회의 없음</p>
                ) : (
                  schedules.map(s => (
                    <div key={s.id} className="group flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-white/50 transition-colors">
                      <span className="text-[11px] font-mono text-gray-400 w-10 flex-shrink-0">{s.time}</span>
                      <span className="flex-1 text-[11px] text-gray-700 truncate">{s.title}</span>
                      <span className="text-[8px] text-gray-300 flex-shrink-0">
                        {s.is_recurring
                          ? (s.days_of_week ?? []).map(d => DOW_LABELS_SCHED[d]).join('')
                          : s.date}
                      </span>
                      <button
                        onClick={() => removeMeetingSchedule(s.id)}
                        className="text-[9px] text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 전월 */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-500 hover:bg-white/40 transition-colors"
                onClick={() => setShowPrevCal(v => !v)}>
                <span>{format(prevMonthNav, 'yy년 M월', { locale: ko })} (전월)</span>
                <span className="text-gray-300">{showPrevCal ? '▲' : '▼'}</span>
              </button>
              {showPrevCal && (
                <div className="px-3 pb-3">
                  <MiniCalInline monthDate={prevMonthNav} onClick={() => setCurrent(prevMonthNav)} />
                </div>
              )}
            </div>

            {/* 익월 */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-500 hover:bg-white/40 transition-colors"
                onClick={() => setShowNextCal(v => !v)}>
                <span>{format(nextMonthNav, 'yy년 M월', { locale: ko })} (익월)</span>
                <span className="text-gray-300">{showNextCal ? '▲' : '▼'}</span>
              </button>
              {showNextCal && (
                <div className="px-3 pb-3">
                  <MiniCalInline monthDate={nextMonthNav} onClick={() => setCurrent(nextMonthNav)} />
                </div>
              )}
            </div>

            {/* 선택한 날 일정 */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                {selectedDay ? `${format(selectedDay, 'M월 d일 (E)', { locale: ko })} 일정` : '날짜를 선택하세요'}
              </h3>
              {!selectedDay ? (
                <p className="text-xs text-gray-300 leading-relaxed">캘린더에서 날짜를 클릭하면 해당일 일정을 볼 수 있습니다</p>
              ) : (selectedDayTasks.length === 0 && selectedDayMeetings.length === 0 && selectedDayTodos.length === 0 && selectedDayOneOnOnes.length === 0) ? (
                <p className="text-xs text-gray-300">예정된 일정이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {getOrderedDayItems().map(item => (
                    <div key={item.itemId}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragItemId(item.itemId) }}
                      onDragEnd={() => { setDragItemId(null); setDragOverId(null) }}
                      onDragOver={e => { e.preventDefault(); if (dragItemId !== item.itemId) setDragOverId(item.itemId) }}
                      onDrop={e => { e.preventDefault(); handleDayDrop(item.itemId) }}
                      onClick={() => {
                        if (item.type === 'meeting') router.push(`/meetings/${(item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).id}`)
                        else if (item.type === 'todo') router.push(`/tasks/${(item.data as ScheduledTodo).task.id}`)
                        else router.push(`/tasks/${(item.data as DayTask).task.id}`)
                      }}
                      className={`bg-white/60 rounded-2xl border p-3 transition-all cursor-grab active:cursor-grabbing select-none ${
                        item.type === 'meeting' ? 'border-[#BADEC8]/40 hover:border-[#BADEC8]/70' : 'border-white/80 hover:border-gray-200'
                      } ${dragItemId === item.itemId ? 'opacity-40 scale-95' : ''} ${
                        dragOverId === item.itemId && dragItemId !== item.itemId ? 'border-[#BADEC8] -translate-y-0.5 shadow-sm' : ''
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-300 text-xs">⠿</span>
                        {item.type === 'meeting' ? (
                          <span className="text-xs font-medium text-[#2D5A45]">💬 회의</span>
                        ) : item.type === 'todo' ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">할일</span>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${(item.data as DayTask).dateType === 'mid' ? 'bg-[#F3E482]/50 text-[#5A4A10]' : 'bg-[#90A7D8]/30 text-[#1E3A6B]'}`}>
                            {(item.data as DayTask).dateType === 'mid' ? '중간공유' : '최종보고'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-800 break-words leading-snug">
                        {item.type === 'meeting'
                          ? (item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).title
                          : item.type === 'todo'
                            ? (item.data as ScheduledTodo).title
                            : (item.data as DayTask).task.title}
                      </p>
                      {item.type === 'meeting' && (item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).category && (
                        <span className="text-xs text-[#2D5A45] mt-0.5 block">{(item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).category}</span>
                      )}
                      {item.type === 'todo' && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {(item.data as ScheduledTodo).task.short_name ?? (item.data as ScheduledTodo).task.title}
                        </p>
                      )}
                      {item.type === 'task' && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="text-xs text-gray-400">{(item.data as DayTask).task.part}</span>
                          {(item.data as DayTask).task.members?.name && (
                            <span className="text-xs text-gray-400">{(item.data as DayTask).task.members?.name}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {selectedDayOneOnOnes.map(o => (
                    <div key={`oo-panel-${o.id}`}
                      onClick={() => router.push(`/one-on-one/${o.member_id}`)}
                      className="bg-purple-50/60 rounded-2xl border border-purple-100/60 p-3 transition-all cursor-pointer hover:border-purple-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">1on1</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800">{o.member_name}</p>
                      <p className="text-xs text-purple-400 mt-0.5">다음 1on1 예정</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showRepeatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm" onClick={() => setShowRepeatModal(false)}>
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/80 p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">반복 일정 추가</h3>
            <div className="space-y-3">
              <input value={repeatTitle} onChange={e => setRepeatTitle(e.target.value)}
                placeholder="일정 제목" className="w-full text-sm border border-gray-200 rounded-2xl px-3 py-2 focus:outline-none bg-white/60" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">매월</span>
                <input value={repeatDay} onChange={e => setRepeatDay(e.target.value.replace(/\D/g, ''))}
                  placeholder="15" className="w-16 text-sm border border-gray-200 rounded-2xl px-3 py-2 focus:outline-none text-center bg-white/60" />
                <span className="text-xs text-gray-500">일</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">이번달부터</span>
                <select value={repeatMonthCount} onChange={e => setRepeatMonthCount(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-2xl px-3 py-2 focus:outline-none bg-white/60">
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}개월</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowRepeatModal(false)} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">취소</button>
              <button onClick={handleCreateRepeating} disabled={!repeatTitle.trim()}
                className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-4 py-1.5 rounded-full hover:bg-[#D5E6F7] disabled:opacity-30">
                {repeatMonthCount}개 일정 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const KR_HOLIDAYS = new Set([
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-01', '2025-05-05', '2025-06-06', '2025-08-15',
  '2025-10-03', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', '2025-10-09',
  '2025-12-25',
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-01', '2026-03-02', '2026-05-05',
  '2026-06-06', '2026-08-15',
  '2026-09-23', '2026-09-24', '2026-09-25',
  '2026-10-03', '2026-10-09', '2026-12-25',
])

function isKoreanHoliday(d: Date): boolean {
  return KR_HOLIDAYS.has(format(d, 'yyyy-MM-dd'))
}

function MiniCalInline({ monthDate, onClick }: { monthDate: Date; onClick: () => void }) {
  const mStart = startOfMonth(monthDate)
  const mEnd = endOfMonth(monthDate)
  const mDays = eachDayOfInterval({ start: mStart, end: mEnd })
  const mStartDow = getDay(mStart)
  const today = new Date()
  return (
    <div className="grid grid-cols-7 text-center cursor-pointer" onClick={onClick}>
      {['일','월','화','수','목','금','토'].map((d, i) => (
        <div key={d} className={`text-[9px] pb-0.5 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-300'}`}>{d}</div>
      ))}
      {Array.from({ length: mStartDow }, (_, i) => <div key={`p${i}`} />)}
      {mDays.map(d => {
        const dow = getDay(d)
        const holiday = isKoreanHoliday(d)
        const isToday_ = isSameDay(d, today)
        return (
          <div key={d.toISOString()} className={`text-[10px] h-6 flex items-center justify-center rounded-full ${isToday_ ? 'bg-red-500 text-white font-bold' : (dow === 0 || holiday) ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
            {format(d, 'd')}
          </div>
        )
      })}
    </div>
  )
}
