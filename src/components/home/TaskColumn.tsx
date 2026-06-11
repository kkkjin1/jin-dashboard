'use client'

import Link from 'next/link'
import type { Task } from '@/types'
import { formatDate, daysUntil } from '@/lib/tasks'

const STATUS_COLORS: Record<string, string> = {
  '진행필요': 'bg-gray-100 text-gray-600',
  '진행중': 'bg-blue-50 text-blue-600',
  '완료': 'bg-green-50 text-green-600',
}

const PART_COLORS: Record<string, string> = {
  '코어': 'text-indigo-500',
  '비즈': 'text-emerald-500',
}

function ddayColor(d: number): string {
  if (d === 0) return 'bg-red-100 text-red-700 font-bold'
  if (d <= 2) return 'bg-orange-100 text-orange-600'
  if (d <= 4) return 'bg-amber-50 text-amber-600'
  return 'bg-yellow-50 text-yellow-600'
}

function getRelevantDays(task: Task, mode: 'end_date' | 'mid_date' | 'nearest'): number | null {
  if (mode === 'end_date') {
    if (!task.end_date) return null
    const d = daysUntil(task.end_date)
    return d >= 0 ? d : null
  }
  if (mode === 'mid_date') {
    if (!task.mid_date) return null
    const d = daysUntil(task.mid_date)
    return d >= 0 ? d : null
  }
  const candidates: number[] = []
  if (task.mid_date) { const d = daysUntil(task.mid_date); if (d >= 0) candidates.push(d) }
  if (task.end_date) { const d = daysUntil(task.end_date); if (d >= 0) candidates.push(d) }
  return candidates.length > 0 ? Math.min(...candidates) : null
}

interface Props {
  title: string
  count: number
  tasks: Task[]
  accentColor?: string
  dateMode?: 'end_date' | 'mid_date' | 'nearest'
}

function MemberAvatar({ name }: { name: string }) {
  const colors = ['bg-red-400', 'bg-blue-400', 'bg-green-400', 'bg-purple-400', 'bg-amber-400', 'bg-pink-400', 'bg-indigo-400', 'bg-teal-400']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-xs font-medium flex-shrink-0`}>
      {name[0]}
    </div>
  )
}

export default function TaskColumn({ title, count, tasks, accentColor = 'bg-red-500', dateMode = 'end_date' }: Props) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1 h-4 rounded-full ${accentColor}`} />
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
        {count > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
            {count}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">해당 업무가 없습니다</p>
        ) : (
          tasks.map(task => {
            const days = getRelevantDays(task, dateMode)
            return (
              <Link key={task.id} href={`/tasks/${task.id}`}>
                <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                        {task.status}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-xs ${PART_COLORS[task.part]}`}>{task.part}</span>
                          <span className="text-gray-300 text-xs">·</span>
                          <span className="text-xs text-gray-400">{task.type}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {days !== null && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ddayColor(days)}`}>
                          D-{days}
                        </span>
                      )}
                      {task.mid_date && dateMode === 'end_date' && (
                        <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                          중간 {formatDate(task.mid_date)}
                        </span>
                      )}
                      {task.members && <MemberAvatar name={task.members.name} />}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
