'use client'

import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, getDay, isSameMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'
import { fetchAllTasks, fetchMembers, formatDate } from '@/lib/tasks'
import type { Task, Member } from '@/types'

export default function SchedulePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [current, setCurrent] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')

  useEffect(() => {
    Promise.all([fetchAllTasks(), fetchMembers()]).then(([t, m]) => {
      setTasks(t); setMembers(m)
    })
  }, [])

  const filtered = assigneeFilter === '전체'
    ? tasks
    : tasks.filter(t => t.assignee_id === assigneeFilter)

  const start = startOfMonth(current)
  const end = endOfMonth(current)
  const days = eachDayOfInterval({ start, end })
  const startDow = getDay(start)

  function getTasksForDay(day: Date) {
    return filtered.filter(t => {
      const dates = [t.mid_date, t.end_date].filter(Boolean)
      return dates.some(d => isSameDay(parseISO(d!), day))
    })
  }

  const selectedTasks = selectedDay ? getTasksForDay(selectedDay) : []

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">일정</h1>

      {/* 담당자 필터 */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setAssigneeFilter('전체')}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            assigneeFilter === '전체' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          전체
        </button>
        {members.map(m => (
          <button
            key={m.id}
            onClick={() => setAssigneeFilter(m.id)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              assigneeFilter === m.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 캘린더 */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">
              {format(current, 'yyyy년 M월', { locale: ko })}
            </h2>
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
            {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(day => {
              const dayTasks = getTasksForDay(day)
              const isToday = isSameDay(day, new Date())
              const isSelected = selectedDay && isSameDay(day, selectedDay)
              const hasMid = dayTasks.some(t => t.mid_date && isSameDay(parseISO(t.mid_date), day))
              const hasEnd = dayTasks.some(t => t.end_date && isSameDay(parseISO(t.end_date), day))

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
                  className={`min-h-14 p-1.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-gray-100' : isToday ? 'bg-red-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <p className={`text-xs text-center mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto ${
                    isToday ? 'bg-red-500 text-white font-bold' : 'text-gray-600'
                  }`}>
                    {format(day, 'd')}
                  </p>
                  <div className="space-y-0.5">
                    {hasMid && <div className="h-1 bg-amber-400 rounded-full" />}
                    {hasEnd && <div className="h-1 bg-red-400 rounded-full" />}
                  </div>
                  {dayTasks.length > 0 && (
                    <p className="text-center text-xs text-gray-300 mt-0.5">{dayTasks.length}</p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 bg-amber-400 rounded-full" /><span className="text-xs text-gray-400">중간공유</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 bg-red-400 rounded-full" /><span className="text-xs text-gray-400">최종보고</span></div>
          </div>
        </div>

        {/* 선택한 날 업무 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-3">
            {selectedDay ? `${format(selectedDay, 'M월 d일', { locale: ko })} 일정` : '날짜를 선택하세요'}
          </h3>
          {!selectedDay ? (
            <p className="text-sm text-gray-300">캘린더에서 날짜를 클릭하면 해당일 업무를 볼 수 있습니다</p>
          ) : selectedTasks.length === 0 ? (
            <p className="text-sm text-gray-300">이 날 예정된 일정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {selectedTasks.map(task => (
                <Link key={task.id} href={`/tasks/${task.id}`}>
                  <div className="bg-white rounded-xl border border-gray-100 p-3 hover:border-gray-200 transition-colors">
                    <p className="text-sm font-medium text-gray-800 mb-1">{task.title}</p>
                    <div className="flex flex-wrap gap-1">
                      {task.mid_date && isSameDay(parseISO(task.mid_date), selectedDay) && (
                        <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">중간공유</span>
                      )}
                      {task.end_date && isSameDay(parseISO(task.end_date), selectedDay) && (
                        <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">최종보고</span>
                      )}
                      <span className="text-xs text-gray-400">{task.members?.name}</span>
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
