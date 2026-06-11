'use client'

import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, getDay, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers } from '@/lib/tasks'
import type { Task, Member, TaskStatus, Part, Meeting } from '@/types'

const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']
const PARTS: Part[] = ['코어', '비즈']

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
  const router = useRouter()
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
      if (t.mid_date && isSameDay(parseISO(t.mid_date), day)) result.push({ task: t, dateType: 'mid' })
      if (t.end_date && isSameDay(parseISO(t.end_date), day)) result.push({ task: t, dateType: 'end' })
    })
    return result
  }

  function getDayMeetings(day: Date) {
    if (viewFilter === '업무만') return []
    return meetings.filter(m => m.meeting_date && isSameDay(parseISO(m.meeting_date), day))
  }

  const selectedDayTasks = selectedDay ? getDayTasks(selectedDay) : []
  const selectedDayMeetings = selectedDay ? getDayMeetings(selectedDay) : []

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

      {/* 필터 영역 */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* 파트 필터 */}
        <div className="flex gap-1.5">
          {(['전체', ...PARTS] as const).map(p => (
            <button key={p} onClick={() => setPartFilter(p)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${partFilter === p ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {p === '전체' ? '전체 파트' : `${p}파트`}
            </button>
          ))}
        </div>

        <div className="w-px bg-gray-200 self-stretch" />

        {/* 담당자 드롭박스 */}
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none">
          <option value="전체">전체 담당자</option>
          <option value="me">나</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        {/* 상태 필터 */}
        <div className="flex gap-1.5">
          <button onClick={() => setStatusFilter('전체')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${statusFilter === '전체' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            전체 상태
          </button>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>

        <div className="w-px bg-gray-200 self-stretch" />

        {/* 보기 필터 */}
        <div className="flex gap-1">
          {(['전체', '업무만', '회의만'] as const).map(v => (
            <button key={v} onClick={() => setViewFilter(v)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                viewFilter === v
                  ? v === '회의만' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {v === '회의만' ? '💬 회의만' : v}
            </button>
          ))}
        </div>
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
          </div>
        </div>

        {/* 선택한 날 업무 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-3">
            {selectedDay ? `${format(selectedDay, 'M월 d일', { locale: ko })} 일정` : '날짜를 선택하세요'}
          </h3>
          {!selectedDay ? (
            <p className="text-sm text-gray-300">캘린더에서 날짜를 클릭하면 해당일 업무를 볼 수 있습니다</p>
          ) : (selectedDayTasks.length === 0 && selectedDayMeetings.length === 0) ? (
            <p className="text-sm text-gray-300">이 날 예정된 일정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {selectedDayMeetings.map(m => (
                <Link key={m.id} href={`/meetings/${m.id}`}>
                  <div className="bg-purple-50 rounded-xl border border-purple-100 p-3 hover:border-purple-200 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-purple-600">💬 회의</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{m.title}</p>
                    {m.category && <span className="text-xs text-purple-400">{m.category}</span>}
                  </div>
                </Link>
              ))}
              {selectedDayTasks.map((dt, idx) => (
                <Link key={`${dt.task.id}-${dt.dateType}-${idx}`} href={`/tasks/${dt.task.id}`}>
                  <div className="bg-white rounded-xl border border-gray-100 p-3 hover:border-gray-200 transition-colors">
                    <p className="text-sm font-medium text-gray-800 mb-1">{dt.task.title}</p>
                    <div className="flex flex-wrap gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${dt.dateType === 'mid' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                        {dt.dateType === 'mid' ? '중간공유' : '최종보고'}
                      </span>
                      <span className="text-xs text-gray-400">{dt.task.part}</span>
                      {dt.task.members?.name && <span className="text-xs text-gray-400">{dt.task.members.name}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
