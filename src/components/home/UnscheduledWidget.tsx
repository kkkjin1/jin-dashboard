'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { TaskTodo, ScheduleTag } from '@/types'

interface Props {
  todos: TaskTodo[]
  onAssign: (todoId: string, tag: ScheduleTag) => void
}

const TAG_OPTIONS: { tag: ScheduleTag; label: string; cls: string }[] = [
  { tag: 'today',     label: '오늘',  cls: 'bg-red-50 text-red-600 hover:bg-red-100' },
  { tag: 'tomorrow',  label: '내일',  cls: 'bg-orange-50 text-orange-600 hover:bg-orange-100' },
  { tag: 'this_week', label: '금주',  cls: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
]

export default function UnscheduledWidget({ todos, onAssign }: Props) {
  const unscheduled = todos.filter(t => !t.target_date && !t.schedule_tag)

  return (
    <div className="h-full flex flex-col p-3 font-sans">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400">📥 미배정</span>
        {unscheduled.length > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100/80 text-gray-500">
            {unscheduled.length > 9 ? '9+' : unscheduled.length}
          </span>
        )}
      </div>

      {unscheduled.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px] text-gray-300">배정 대기 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1 scrollbar-hide">
          {unscheduled.map(todo => {
            const task = todo.tasks as { id: string; title: string; short_name?: string | null } | null
            const badge = task?.short_name ?? ''
            return (
              <div key={todo.id} className="group flex flex-col px-1.5 py-1.5 rounded-lg hover:bg-white/50 transition-colors">
                <div className="flex items-start gap-1.5 min-w-0">
                  {badge && (
                    <span className="inline-block flex-shrink-0 text-[9px] bg-gray-100 text-gray-500 rounded px-1 py-0.5 leading-none mt-0.5">
                      {badge}
                    </span>
                  )}
                  <Link href={`/tasks/${task?.id ?? ''}`} className="text-xs text-gray-700 leading-snug hover:text-gray-900 transition-colors min-w-0">
                    {todo.title}
                  </Link>
                </div>
                <div className="overflow-hidden max-h-0 group-hover:max-h-6 transition-all duration-150 flex gap-0.5 mt-0.5">
                  {TAG_OPTIONS.map(({ tag, label, cls }) => (
                    <button
                      key={tag}
                      onClick={() => onAssign(todo.id, tag)}
                      className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${cls}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
