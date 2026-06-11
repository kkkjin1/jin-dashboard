'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
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

function MemberAvatar({ name }: { name: string }) {
  const colors = ['bg-red-400','bg-blue-400','bg-green-400','bg-purple-400','bg-amber-400','bg-pink-400','bg-indigo-400','bg-teal-400']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-6 h-6 rounded-full ${color} flex items-center justify-center text-white text-xs font-medium`}>
      {name[0]}
    </div>
  )
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [activePart, setActivePart] = useState<Part | '전체'>('전체')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | '전체'>('전체')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')
  const [adding, setAdding] = useState<{ part: Part; type: TaskType } | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    Promise.all([fetchAllTasks(), fetchMembers()]).then(([t, m]) => {
      setTasks(t); setMembers(m)
    })
  }, [])

  useEffect(() => {
    if (adding) addInputRef.current?.focus()
  }, [adding])

  const filteredTasks = tasks.filter(t => {
    if (activePart !== '전체' && t.part !== activePart) return false
    if (statusFilter !== '전체' && t.status !== statusFilter) return false
    if (assigneeFilter !== '전체' && t.assignee_id !== assigneeFilter) return false
    return true
  })

  async function handleAddTask(part: Part, type: TaskType) {
    if (!newTitle.trim()) { setAdding(null); return }
    const { data } = await supabase
      .from('tasks')
      .insert({ title: newTitle.trim(), part, type, status: '진행필요' })
      .select('*, members(id, name, part)')
      .single()
    if (data) setTasks(prev => [data as Task, ...prev])
    setNewTitle('')
    setAdding(null)
  }

  async function updateStatus(taskId: string, status: TaskStatus) {
    await supabase.from('tasks').update({ status }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  const partsToShow = activePart === '전체' ? PARTS : [activePart]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">업무 목록</h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as TaskStatus | '전체')}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none"
          >
            <option value="전체">전체 상태</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none"
          >
            <option value="전체">전체 담당자</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {/* 파트 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-100 pb-0">
        {(['전체', ...PARTS] as const).map(p => (
          <button
            key={p}
            onClick={() => setActivePart(p)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activePart === p
                ? 'text-gray-900 border-b-2 border-red-500'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {p === '전체' ? '전체' : `${p}파트`}
            <span className="ml-1.5 text-xs text-gray-400">
              {p === '전체' ? filteredTasks.length : filteredTasks.filter(t => t.part === p).length}
            </span>
          </button>
        ))}
      </div>

      {/* 파트별 섹션 */}
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
                      <div key={task.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4 hover:border-gray-200 transition-colors group">
                        <select
                          value={task.status}
                          onChange={e => updateStatus(task.id, e.target.value as TaskStatus)}
                          onClick={e => e.stopPropagation()}
                          className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${STATUS_COLORS[task.status]}`}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <Link href={`/tasks/${task.id}`} className="flex-1 flex items-center gap-4 min-w-0">
                          <span className="text-sm text-gray-800 font-medium flex-1 truncate">{task.title}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {task.mid_date && (
                              <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                                중간공유 {formatDate(task.mid_date)}
                              </span>
                            )}
                            {task.end_date && (
                              <span className="text-xs text-gray-400">📅 {formatDate(task.end_date)}</span>
                            )}
                            {task.members && <MemberAvatar name={task.members.name} />}
                          </div>
                        </Link>
                      </div>
                    ))}

                    {/* 빠른 추가 */}
                    {adding?.part === part && adding?.type === type ? (
                      <div className="bg-white rounded-xl border border-blue-200 px-4 py-2">
                        <input
                          ref={addInputRef}
                          value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddTask(part, type)
                            if (e.key === 'Escape') { setAdding(null); setNewTitle('') }
                          }}
                          onBlur={() => handleAddTask(part, type)}
                          placeholder="업무명 입력 후 엔터"
                          className="w-full text-sm focus:outline-none text-gray-700"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setAdding({ part, type })}
                        className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:text-gray-500 hover:bg-white rounded-xl transition-colors"
                      >
                        + 업무 추가
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
