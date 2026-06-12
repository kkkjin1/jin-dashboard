'use client'

import { useEffect, useRef, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, getDay, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers } from '@/lib/tasks'
import type { Task, Member, TaskStatus, Part, Meeting } from '@/types'

const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']

interface DayTask {
  task: Task
  dateType: 'mid' | 'end'
}

export default function SchedulePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>[]>([])
  const [current, setCurrent] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | '전체'>('전체')
  const [partFilter, setPartFilter] = useState<Part | '전체'>('전체')
  const [viewFilter, setViewFilter] = useState<'전체' | '업무만' | '회의만'>('전체')
  const [reportFilter, setReportFilter] = useState<'전체' | '중간공유' | '최종보고'>('전체')
  const [showPrevCal, setShowPrevCal] = useState(false)
  const [showNextCal, setShowNextCal] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(true)
  const [analysisPeriod, setAnalysisPeriod] = useState<'이번주' | '이번달' | '직전월'>('이번달')
  const [showRepeatModal, setShowRepeatModal] = useState(false)
  const [repeatTitle, setRepeatTitle] = useState('')
  const [repeatDay, setRepeatDay] = useState('15')
  const [repeatMonthCount, setRepeatMonthCount] = useState('3')
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dayOrder, setDayOrder] = useState<Record<string, string[]>>({})
  const router = useRouter()
  const assigneeRef = useRef<HTMLSelectElement>(null)
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      fetchAllTasks(),
      fetchMembers(),
      supabase.from('meetings').select('id, title, meeting_date, category').not('meeting_date', 'is', null),
    ]).then(([t, m, { data: mtgs }]) => {
      setTasks(t); setMembers(m)
      setMeetings((mtgs ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>[])
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

  // 달력 데이터: 이전달 말일 + 현재달 + 다음달 초일
  const start = startOfMonth(current)
  const end = endOfMonth(current)
  const days = eachDayOfInterval({ start, end })
  const startDow = getDay(start)

  // 이전달 마지막 N일
  const prevMonth = subMonths(current, 1)
  const prevDays = startDow > 0
    ? Array.from({ length: startDow }, (_, i) => {
        const d = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), getDaysInMonth(prevMonth) - startDow + 1 + i)
        return d
      })
    : []

  // 다음달 첫 N일 (7의 배수로 맞추기)
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

  const selectedDayTasks = selectedDay ? getDayTasks(selectedDay) : []
  const selectedDayMeetings = selectedDay ? getDayMeetings(selectedDay) : []

  type DayListItem =
    | { itemId: string; type: 'task'; data: DayTask }
    | { itemId: string; type: 'meeting'; data: Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'> }

  function getOrderedDayItems(): DayListItem[] {
    const all: DayListItem[] = [
      ...selectedDayMeetings.map(m => ({ itemId: `meeting-${m.id}`, type: 'meeting' as const, data: m })),
      ...selectedDayTasks.map(dt => ({ itemId: `task-${dt.task.id}-${dt.dateType}`, type: 'task' as const, data: dt })),
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
    setDragItemId(null)
    setDragOverId(null)
  }

  // ── Helper: count weekdays (Mon–Fri) between two dates inclusive
  function countWeekdays(start: Date, end: Date): number {
    let count = 0
    const cur = new Date(start)
    while (cur <= end) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  // ── Helper: get [start, end] for a given analysis period
  function getPeriodRange(period: '이번주' | '이번달' | '직전월'): [Date, Date] {
    const today = new Date()
    if (period === '이번달') {
      return [startOfMonth(today), endOfMonth(today)]
    }
    if (period === '직전월') {
      const prev = subMonths(today, 1)
      return [startOfMonth(prev), endOfMonth(prev)]
    }
    // 이번주: Mon–Sun of current week
    const dow = today.getDay() // 0=Sun
    const diffToMon = (dow === 0 ? -6 : 1 - dow)
    const mon = new Date(today)
    mon.setDate(today.getDate() + diffToMon)
    mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    sun.setHours(23, 59, 59, 999)
    return [mon, sun]
  }

  // ── Mini month nav: count events for a given month
  function countMonthEvents(monthDate: Date): { meetings: number; tasks: number } {
    const mStart = startOfMonth(monthDate)
    const mEnd = endOfMonth(monthDate)
    const inRange = (dateStr: string | null | undefined) => {
      if (!dateStr) return false
      const d = parseISO(dateStr)
      return d >= mStart && d <= mEnd
    }
    const mtgCount = meetings.filter(m => inRange(m.meeting_date)).length
    const taskCount = tasks.filter(t => inRange(t.mid_date) || inRange(t.end_date)).length
    return { meetings: mtgCount, tasks: taskCount }
  }

  // ── Analysis stats computation
  function computeAnalysis(period: '이번주' | '이번달' | '직전월') {
    const [pStart, pEnd] = getPeriodRange(period)
    const inRange = (dateStr: string | null | undefined) => {
      if (!dateStr) return false
      const d = parseISO(dateStr)
      return d >= pStart && d <= pEnd
    }
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
  const prevCounts = countMonthEvents(prevMonthNav)
  const nextCounts = countMonthEvents(nextMonthNav)
  const analysis = computeAnalysis(analysisPeriod)

  function renderDay(day: Date, isOtherMonth: boolean) {
    const dayTasks = getDayTasks(day)
    const dayMeetings = getDayMeetings(day)
    const allItems = [...dayTasks.map(dt => ({ type: 'task' as const, dt })), ...dayMeetings.map(m => ({ type: 'meeting' as const, m }))]
    const isToday = isSameDay(day, new Date())
    const isSelected = selectedDay && isSameDay(day, selectedDay)
    return (
      <div key={day.toISOString()}
        onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
        className={`min-h-16 p-1 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-gray-100' : isToday ? 'bg-red-50' : isOtherMonth ? 'bg-gray-50/50 opacity-50' : 'hover:bg-gray-50'
        }`}>
        <p className={`text-xs text-center mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto ${
          isToday ? 'bg-red-500 text-white font-bold' : isOtherMonth ? 'text-gray-300' : 'text-gray-600'
        }`}>
          {format(day, 'd')}
        </p>
        <div className="space-y-0.5">
          {allItems.slice(0, 3).map((item, idx) => {
            if (item.type === 'task') {
              const { dt } = item
              return (
                <button key={`task-${dt.task.id}-${dt.dateType}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/tasks/${dt.task.id}`) }}
                  className={`w-full text-left rounded px-1 py-0.5 truncate text-xs leading-tight hover:opacity-80 ${
                    dt.dateType === 'mid' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}
                  title={`${dt.dateType === 'mid' ? '중간공유' : '최종보고'} | ${dt.task.title}`}>
                  <span className="font-medium">{dt.dateType === 'mid' ? '중간' : '최종'}</span>
                  {' '}{dt.task.title}
                </button>
              )
            } else {
              const { m } = item
              return (
                <button key={`meeting-${m.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/meetings/${m.id}`) }}
                  className="w-full text-left rounded px-1 py-0.5 truncate text-xs leading-tight bg-purple-100 text-purple-700 hover:opacity-80"
                  title={`회의 | ${m.title}`}>
                  💬 {m.title}
                </button>
              )
            }
          })}
          {allItems.length > 3 && <p className="text-xs text-gray-400 text-center">+{allItems.length - 3}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-gray-900 mb-5">일정</h1>

      {/* 필터 사이클 버튼 행 */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {/* q: 파트 */}
        <button
          onClick={() => setPartFilter(p => p === '전체' ? '코어' : p === '코어' ? '비즈' : '전체')}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            partFilter !== '전체' ? 'bg-[#5DBD97] text-white border-[#5DBD97]' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}>
          {partFilter === '전체' ? '전체 파트' : `${partFilter}파트`}
                  </button>

        {/* w: 상태 */}
        <button
          onClick={() => setStatusFilter(s => s === '전체' ? '진행필요' : s === '진행필요' ? '진행중' : s === '진행중' ? '완료' : '전체')}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            statusFilter !== '전체' ? 'bg-[#5DBD97] text-white border-[#5DBD97]' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}>
          {statusFilter === '전체' ? '전체 상태' : statusFilter}
                  </button>

        {/* e: 보고구분 */}
        <button
          onClick={() => setReportFilter(r => r === '전체' ? '중간공유' : r === '중간공유' ? '최종보고' : '전체')}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            reportFilter !== '전체' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}>
          {reportFilter === '전체' ? '보고구분' : reportFilter}
                  </button>

        {/* r: 업무/회의 */}
        <button
          onClick={() => setViewFilter(v => v === '전체' ? '업무만' : v === '업무만' ? '회의만' : '전체')}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            viewFilter !== '전체' ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}>
          {viewFilter === '전체' ? '업무+회의' : viewFilter}
                  </button>

        {/* Tab: 담당자 select */}
        <select ref={assigneeRef} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-full px-3 py-1.5 focus:outline-none focus:border-gray-400 bg-white text-gray-500">
          <option value="전체">전체 담당자</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        {/* 반복 추가 버튼 유지 */}
        <button onClick={() => setShowRepeatModal(true)}
          className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 ml-auto">
          ↺ 반복 추가
        </button>
      </div>

      {/* ── Feature A: Mini month navigation ── */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {/* Prev month pill */}
        <button
          onClick={() => setCurrent(prevMonthNav)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-gray-500 hover:bg-gray-50 border border-gray-100 transition-colors cursor-pointer"
        >
          <span className="text-gray-400">←</span>
          <span>{format(prevMonthNav, 'M월', { locale: ko })}</span>
          {(prevCounts.meetings > 0 || prevCounts.tasks > 0) && (
            <span className="text-gray-400">
              {[
                prevCounts.meetings > 0 ? `회의${prevCounts.meetings}` : null,
                prevCounts.tasks > 0 ? `마감${prevCounts.tasks}` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </button>

        {/* Current month pill (not clickable) */}
        <div className="px-4 py-1.5 rounded-full text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200">
          {format(current, 'M월', { locale: ko })} <span className="font-normal text-gray-400 text-[10px]">현재</span>
        </div>

        {/* Next month pill */}
        <button
          onClick={() => setCurrent(nextMonthNav)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-gray-500 hover:bg-gray-50 border border-gray-100 transition-colors cursor-pointer"
        >
          {(nextCounts.meetings > 0 || nextCounts.tasks > 0) && (
            <span className="text-gray-400">
              {[
                nextCounts.meetings > 0 ? `회의${nextCounts.meetings}` : null,
                nextCounts.tasks > 0 ? `마감${nextCounts.tasks}` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
          <span>{format(nextMonthNav, 'M월', { locale: ko })}</span>
          <span className="text-gray-400">→</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 캘린더 */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">{format(current, 'yyyy년 M월', { locale: ko })}</h2>
            <div className="flex gap-1">
              <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="px-2 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">←</button>
              <button onClick={() => setCurrent(new Date())}
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">오늘</button>
              <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="px-2 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">→</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px">
            {['일','월','화','수','목','금','토'].map(d => (
              <div key={d} className="text-center text-xs text-gray-400 font-medium py-2">{d}</div>
            ))}
            {prevDays.map(d => renderDay(d, true))}
            {days.map(d => renderDay(d, false))}
            {nextDays.map(d => renderDay(d, true))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2.5 bg-amber-100 rounded border border-amber-300" />
              <span className="text-xs text-gray-400">중간공유</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2.5 bg-red-100 rounded border border-red-300" />
              <span className="text-xs text-gray-400">최종보고</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2.5 bg-purple-100 rounded border border-purple-300" />
              <span className="text-xs text-gray-400">회의</span>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => setShowAnalysis(v => !v)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  showAnalysis
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                ⏱ 시간 분석
              </button>
            </div>
          </div>

          {/* ── Feature B: Time analysis panel ── */}
          {showAnalysis && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {/* Period selector */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-400 mr-1">기간</span>
                {(['이번주', '이번달', '직전월'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setAnalysisPeriod(p)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      analysisPeriod === p
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">업무일</p>
                  <p className="text-lg font-bold text-gray-800">{analysis.workDays}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-purple-400 mb-1">회의 건수</p>
                  <p className="text-lg font-bold text-purple-700">{analysis.meetingCount}<span className="text-xs font-normal text-purple-400 ml-0.5">건</span></p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-amber-500 mb-1">업무 마감</p>
                  <p className="text-lg font-bold text-amber-700">{analysis.taskDeadlines}<span className="text-xs font-normal text-amber-400 ml-0.5">건</span></p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                  {analysis.totalHours > 0 && (
                    <>
                      <div
                        className="bg-purple-400 transition-all"
                        style={{ width: `${Math.min(100, (analysis.meetingHours / analysis.totalHours) * 100)}%` }}
                      />
                      <div
                        className="bg-blue-200 transition-all"
                        style={{ width: `${Math.min(100, (analysis.focusHours / analysis.totalHours) * 100)}%` }}
                      />
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    총 <span className="font-semibold text-gray-700">{analysis.totalHours}h</span> 중{' '}
                    회의 <span className="font-semibold text-purple-600">{analysis.meetingHours}h</span>
                    {' · '}
                    집중 업무 <span className="font-semibold text-blue-600">{analysis.focusHours}h</span>
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-sm bg-purple-400" />
                      <span className="text-xs text-gray-400">회의</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-sm bg-blue-200" />
                      <span className="text-xs text-gray-400">집중</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 우측 패널: 미니 캘린더 + 선택한 날 업무 */}
        <div className="space-y-3">
          {/* 미니 캘린더 (전월/익월) 토글 */}
          <div className="space-y-2">
            {/* 전월 토글 */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
                onClick={() => setShowPrevCal(v => !v)}>
                <span>{format(prevMonthNav, 'yy년 M월', { locale: ko })} (전월)</span>
                <span>{showPrevCal ? '▲' : '▼'}</span>
              </button>
              {showPrevCal && (
                <div className="p-2">
                  <MiniCalInline monthDate={prevMonthNav} onClick={() => setCurrent(prevMonthNav)} />
                </div>
              )}
            </div>
            {/* 익월 토글 */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
                onClick={() => setShowNextCal(v => !v)}>
                <span>{format(nextMonthNav, 'yy년 M월', { locale: ko })} (익월)</span>
                <span>{showNextCal ? '▲' : '▼'}</span>
              </button>
              {showNextCal && (
                <div className="p-2">
                  <MiniCalInline monthDate={nextMonthNav} onClick={() => setCurrent(nextMonthNav)} />
                </div>
              )}
            </div>
          </div>

          {/* 선택한 날 업무 */}
          <div className="bg-white rounded-xl border border-gray-100 p-3">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">
            {selectedDay ? `${format(selectedDay, 'M월 d일', { locale: ko })} 일정` : '날짜를 선택하세요'}
          </h3>
          {!selectedDay ? (
            <p className="text-sm text-gray-300">캘린더에서 날짜를 클릭하면 해당일 업무를 볼 수 있습니다</p>
          ) : (selectedDayTasks.length === 0 && selectedDayMeetings.length === 0) ? (
            <p className="text-sm text-gray-300">이 날 예정된 일정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {getOrderedDayItems().map(item => (
                <div
                  key={item.itemId}
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragItemId(item.itemId) }}
                  onDragEnd={() => { setDragItemId(null); setDragOverId(null) }}
                  onDragOver={e => { e.preventDefault(); if (dragItemId !== item.itemId) setDragOverId(item.itemId) }}
                  onDrop={e => { e.preventDefault(); handleDayDrop(item.itemId) }}
                  onClick={() => router.push(item.type === 'meeting' ? `/meetings/${(item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).id}` : `/tasks/${(item.data as DayTask).task.id}`)}
                  className={`rounded-xl border p-3 transition-all cursor-grab active:cursor-grabbing select-none ${
                    item.type === 'meeting' ? 'bg-purple-50 border-purple-100 hover:border-purple-200' : 'bg-white border-gray-100 hover:border-gray-200'
                  } ${dragItemId === item.itemId ? 'opacity-40 scale-95' : ''} ${
                    dragOverId === item.itemId && dragItemId !== item.itemId ? 'border-blue-300 shadow-sm -translate-y-0.5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-300 text-xs">⠿</span>
                    {item.type === 'meeting' ? (
                      <span className="text-xs font-medium text-purple-600">💬 회의</span>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${(item.data as DayTask).dateType === 'mid' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                        {(item.data as DayTask).dateType === 'mid' ? '중간공유' : '최종보고'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    {item.type === 'meeting'
                      ? (item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).title
                      : (item.data as DayTask).task.title}
                  </p>
                  {item.type === 'meeting' && (item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).category && (
                    <span className="text-xs text-purple-400">{(item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).category}</span>
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
            </div>
          )}
          </div>
        </div>
      </div>

      {showRepeatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowRepeatModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">반복 일정 추가</h3>
            <div className="space-y-3">
              <input value={repeatTitle} onChange={e => setRepeatTitle(e.target.value)}
                placeholder="일정 제목" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">매월</span>
                <input value={repeatDay} onChange={e => setRepeatDay(e.target.value.replace(/\D/g, ''))}
                  placeholder="15" className="w-16 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none text-center" />
                <span className="text-xs text-gray-500">일</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">이번달부터</span>
                <select value={repeatMonthCount} onChange={e => setRepeatMonthCount(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white">
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}개월</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowRepeatModal(false)} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">취소</button>
              <button onClick={handleCreateRepeating} disabled={!repeatTitle.trim()}
                className="text-xs bg-[#5DBD97] text-white px-4 py-1.5 rounded-lg hover:bg-[#4aab84] disabled:opacity-30">
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
  '2026-10-03', '2026-10-09',
  '2026-12-25',
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
          <div key={d.toISOString()} className={`text-[9px] leading-4 rounded-full ${isToday_ ? 'bg-red-500 text-white font-bold' : (dow === 0 || holiday) ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
            {format(d, 'd')}
          </div>
        )
      })}
    </div>
  )
}

