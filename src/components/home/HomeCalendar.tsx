'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, getDay } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Task, Meeting } from '@/types'

interface Props {
  tasks: Task[]
  meetings?: Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]
}

type CalendarEvent =
  | { type: 'mid'; task: Task }
  | { type: 'end'; task: Task }
  | { type: 'meeting'; meeting: Pick<Meeting, 'id' | 'title' | 'meeting_date'> }

export default function HomeCalendar({ tasks, meetings }: Props) {
  const [current, setCurrent] = useState(new Date())
  const router = useRouter()

  const start = startOfMonth(current)
  const end = endOfMonth(current)
  const days = eachDayOfInterval({ start, end })
  const startDow = getDay(start)

  function getDayEvents(day: Date): CalendarEvent[] {
    const result: CalendarEvent[] = []
    tasks.forEach(t => {
      if (t.mid_date && isSameDay(parseISO(t.mid_date), day)) result.push({ type: 'mid', task: t })
      if (t.end_date && isSameDay(parseISO(t.end_date), day)) result.push({ type: 'end', task: t })
    })
    meetings?.forEach(m => {
      if (m.meeting_date && isSameDay(parseISO(m.meeting_date), day)) result.push({ type: 'meeting', meeting: m })
    })
    return result
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 text-sm">
          {format(current, 'yyyy년 M월', { locale: ko })}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="px-2 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >←</button>
          <button
            onClick={() => setCurrent(new Date())}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >오늘</button>
          <button
            onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="px-2 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {['일', '월', '화', '수', '목', '금', '토'].map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-2">{d}</div>
        ))}
        {Array.from({ length: startDow }).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map(day => {
          const dayEvents = getDayEvents(day)
          const isToday = isSameDay(day, new Date())

          return (
            <div
              key={day.toISOString()}
              className={`min-h-16 p-1 rounded-lg ${isToday ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors`}
            >
              <p className={`text-xs text-center mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto ${
                isToday ? 'bg-red-500 text-white font-bold' : 'text-gray-600'
              }`}>
                {format(day, 'd')}
              </p>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev, idx) => (
                  <button
                    key={`${ev.type}-${ev.type === 'meeting' ? ev.meeting.id : ev.task.id}-${idx}`}
                    onClick={() => router.push(ev.type === 'meeting' ? `/meetings/${ev.meeting.id}` : `/tasks/${ev.task.id}`)}
                    className={`w-full text-left rounded px-1 py-0.5 truncate text-xs leading-tight transition-opacity hover:opacity-80 ${
                      ev.type === 'mid' ? 'bg-amber-100 text-amber-700' :
                      ev.type === 'end' ? 'bg-red-100 text-red-700' :
                      'bg-purple-100 text-purple-700'
                    }`}
                    title={ev.type === 'meeting' ? ev.meeting.title : `${ev.type === 'mid' ? '중간공유' : '최종보고'} | ${ev.task.title}`}
                  >
                    <span className="font-medium">{ev.type === 'mid' ? '중간공유' : ev.type === 'end' ? '최종보고' : '회의'}</span>
                    {' '}
                    <span className="truncate">{ev.type === 'meeting' ? ev.meeting.title : ev.task.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-gray-400 text-center">+{dayEvents.length - 3}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
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
  )
}
