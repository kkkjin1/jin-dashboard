'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format, isToday, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import SummaryCards from '@/components/home/SummaryCards'
import TaskColumn from '@/components/home/TaskColumn'
import HomeCalendar from '@/components/home/HomeCalendar'
import { fetchAllTasks, daysUntil, isAnyDateSoon, isEndDateSoon, nearestEventDays } from '@/lib/tasks'
import type { Task } from '@/types'

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllTasks().then(data => {
      setTasks(data)
      setLoading(false)
    })
  }, [])

  const active = tasks.filter(t => t.status !== '완료')

  const todayTasks = active
    .filter(t => t.end_date && isToday(parseISO(t.end_date)))

  const weekTasks = active
    .filter(t => {
      if (!t.end_date) return false
      const d = daysUntil(t.end_date)
      return d >= 1 && d <= 6
    })
    .sort((a, b) => daysUntil(a.end_date!) - daysUntil(b.end_date!))

  const anySoonTasks = active
    .filter(t => isAnyDateSoon(t))
    .sort((a, b) => nearestEventDays(a) - nearestEventDays(b))

  const endSoonTasks = active
    .filter(t => isEndDateSoon(t))
    .sort((a, b) => daysUntil(a.end_date!) - daysUntil(b.end_date!))

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-red-500 font-medium mb-1">
            {format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">안녕하세요, 팀장님</h1>
          <p className="text-sm text-gray-400 mt-1">오늘과 이번주 마감을 한눈에 확인하세요.</p>
        </div>
        <Link
          href="/tasks"
          className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-4 py-2 transition-colors hover:bg-white"
        >
          전체 업무 보기 →
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-20 animate-pulse" />)}
        </div>
      ) : (
        <SummaryCards tasks={tasks} />
      )}

      {loading ? (
        <div className="flex gap-4">
          {[1,2,3,4].map(i => <div key={i} className="flex-1 h-40 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : (
        <div className="flex gap-4">
          <TaskColumn
            title="오늘 마감"
            count={todayTasks.length}
            tasks={todayTasks}
            accentColor="bg-red-500"
            dateMode="end_date"
          />
          <TaskColumn
            title="이번주 마감"
            count={weekTasks.length}
            tasks={weekTasks}
            accentColor="bg-blue-400"
            dateMode="end_date"
          />
          <TaskColumn
            title="중간공유 임박"
            count={anySoonTasks.length}
            tasks={anySoonTasks}
            accentColor="bg-amber-400"
            dateMode="nearest"
          />
          <TaskColumn
            title="최종마감 임박"
            count={endSoonTasks.length}
            tasks={endSoonTasks}
            accentColor="bg-rose-500"
            dateMode="end_date"
          />
        </div>
      )}

      <HomeCalendar tasks={tasks} />
    </div>
  )
}
