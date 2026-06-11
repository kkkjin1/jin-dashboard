'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers, formatDate } from '@/lib/tasks'
import type { Task, Member, TaskStatus, Part, TaskType } from '@/types'

const PARTS: Part[] = ['코어', '비즈']
const TYPES: TaskType[] = ['기획', '개선', '운영']
const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']

const STATUS_COLORS: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-100 text-gray-600',
  '진행중': 'bg-blue-50 text-blue-600',
  '완료': 'bg-green-50 text-green-600',
}

const STATUS_BG: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-50 border-gray-200',
  '진행중': 'bg-blue-50 border-blue-100',
  '완료': 'bg-green-50 border-green-100',
}

function MemberAvatar({ name }: { name: string }) {
  const colors = ['bg-red-400','bg-blue-400','bg-green-400','bg-purple-400','bg-amber-400','bg-pink-400','bg-indigo-400','bg-teal-400']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-6 h-6 rounded-full ${color} flex items-center justify-center text-white text-xs font-medium`}>
      {name[0]}
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

type ViewMode = 'parts' | 'monthly'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [activePart, setActivePart] = useState<Part | '전체'>('전체')
  const [viewMode, setViewMode] = useState<ViewMode>('parts')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | '전체'>('전체')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')
  const [monthFilter, setMonthFilter] = useState<string>('전체')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hideCompleted, setHideCompleted] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    Promise.all([fetchAllTasks(), fetchMembers()]).then(([t, m]) => {
      setTasks(t); setMembers(m)
    })
  }, [])

  const allMonths = useMemo(() => {
    const months = new Set<string>()
    tasks.forEach(t => (t.work_months ?? []).forEach(m => months.add(m)))
    return Array.from(months).sort().reverse()
  }, [tasks])

  // When switching to monthly view, auto-select most recent month
  function switchToMonthly() {
    setViewMode('monthly')
    if (monthFilter === '전체' && allMonths.length > 0) {
      setMonthFilter(allMonths[0])
    }
  }

  const filteredTasks = tasks.filter(t => {
    if (hideCompleted && t.status === '완료') return false
    if (activePart !== '전체' && t.part !== activePart) return false
    if (statusFilter !== '전체' && t.status !== statusFilter) return false
    if (assigneeFilter !== '전체' && t.assignee_id !== assigneeFilter) return false
    if (monthFilter !== '전체' && !(t.work_months ?? []).includes(monthFilter)) return false
    return true
  })

  const monthlyTasks = useMemo(() => {
    if (monthFilter === '전체') return tasks
    return tasks.filter(t => (t.work_months ?? []).includes(monthFilter))
  }, [tasks, monthFilter])

  async function handleAddTask(part: Part, type: TaskType) {
    const { data } = await supabase.from('tasks').insert({ title: '', part, type, status: '진행필요' }).select('id').single()
    if (data) router.push(`/tasks/${(data as { id: string }).id}`)
  }

  async function updateStatus(taskId: string, status: TaskStatus) {
    await supabase.from('tasks').update({ status }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    if (!draggingId) return
    updateStatus(draggingId, status)
    setDraggingId(null)
  }

  const partsToShow = activePart === '전체' ? PARTS : [activePart]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">업무 목록</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideCompleted(prev => !prev)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${hideCompleted ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
          >
            {hideCompleted ? '완료 숨김' : '완료 표시'}
          </button>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskStatus | '전체')}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none">
            <option value="전체">전체 상태</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none">
            <option value="전체">전체 담당자</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {/* 탭 + 월 필터 */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-0">
        <div className="flex gap-1">
          {(['전체', ...PARTS] as const).map(p => (
            <button key={p}
              onClick={() => { setActivePart(p); setViewMode('parts') }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${viewMode === 'parts' && activePart === p ? 'text-gray-900 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-600'}`}>
              {p === '전체' ? '전체' : `${p}파트`}
              <span className="ml-1.5 text-xs text-gray-400">
                {p === '전체' ? filteredTasks.length : filteredTasks.filter(t => t.part === p).length}
              </span>
            </button>
          ))}
          <button
            onClick={switchToMonthly}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${viewMode === 'monthly' ? 'text-gray-900 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-600'}`}>
            월별
          </button>
        </div>
        <div className="ml-2 pb-px">
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none">
            <option value="전체">전체 작업월</option>
            {allMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
        </div>
      </div>

      {/* 월별 뷰: 상태별 칸반 + DnD */}
      {viewMode === 'monthly' && (
        <div className="flex gap-4">
          {STATUSES.map(status => {
            const colTasks = monthlyTasks.filter(t => t.status === status)
            return (
              <div key={status}
                className={`flex-1 rounded-xl border p-3 min-h-48 ${STATUS_BG[status]}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, status)}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>{status}</span>
                  <span className="text-xs text-gray-400">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map(task => (
                    <div key={task.id}
                      draggable
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={`bg-white rounded-xl border border-gray-100 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none transition-opacity ${draggingId === task.id ? 'opacity-40' : ''}`}>
                      <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {task.title || <span className="text-gray-300 italic text-xs">제목 없음</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">{task.part} · {task.type}</span>
                          {task.mid_date && (
                            <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">중간 {formatDate(task.mid_date)}</span>
                          )}
                          {task.end_date && (
                            <span className="text-xs text-gray-400">📅 {formatDate(task.end_date)}</span>
                          )}
                        </div>
                      </Link>
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-6">없음</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 파트 뷰: 기존 목록 */}
      {viewMode === 'parts' && (
        <div className="space-y-8">
          {partsToShow.map(part => (
            <div key={part}>
              <h2 className="text-sm font-semibold text-gray-500 mb-3">{part}파트</h2>
              {TYPES.map(type => {
                const sectionTasks = filteredTasks.filter(t => t.part === part && t.type === type)
                return (
                  <div key={type} className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{type}</span>
                      <span className="text-xs text-gray-300">{sectionTasks.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {sectionTasks.map(task => (
                        <div key={task.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4 hover:border-gray-200 transition-colors">
                          <select value={task.status} onChange={e => updateStatus(task.id, e.target.value as TaskStatus)}
                            onClick={e => e.stopPropagation()}
                            className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${STATUS_COLORS[task.status]}`}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <Link href={`/tasks/${task.id}`} className="flex-1 flex items-center gap-4 min-w-0">
                            <span className="text-sm text-gray-800 font-medium flex-1 truncate">
                              {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                            </span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {(task.work_months ?? []).length > 0 && (
                                <span className="text-xs text-gray-300">{formatMonth((task.work_months ?? []).at(-1)!)}</span>
                              )}
                              {task.mid_date && (
                                <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">중간 {formatDate(task.mid_date)}</span>
                              )}
                              {task.end_date && (
                                <span className="text-xs text-gray-400">📅 {formatDate(task.end_date)}</span>
                              )}
                              {task.members && <MemberAvatar name={task.members.name} />}
                            </div>
                          </Link>
                        </div>
                      ))}
                      <button onClick={() => handleAddTask(part, type)}
                        className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:text-gray-500 hover:bg-white rounded-xl transition-colors">
                        + 업무 추가
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
