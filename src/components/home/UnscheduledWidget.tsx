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
      <div className="flex items-center gap-2 mb-2.5 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
        <h3 className="text-xs font-semibold text-gray-500">미배정</h3>
        {unscheduled.length > 0 && (
          <span className="ml-auto text-[10px] text-gray-400">{unscheduled.length}건</span>
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
            const badge = task?.short_name ?? task?.title?.slice(0, 4) ?? ''
            return (
              <div key={todo.id} className="group flex items-start gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-white/50 transition-colors">
                <div className="flex-1 min-w-0">
                  {badge && (
                    <span className="inline-block text-[9px] bg-gray-100 text-gray-500 rounded px-1 py-0.5 mr-1 leading-none">
                      {badge}
                    </span>
                  )}
                  <Link href={`/tasks/${task?.id ?? ''}`} className="text-[11px] text-gray-600 leading-snug hover:text-gray-900 transition-colors">
                    {todo.title}
                  </Link>
                </div>
                <div className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
