'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers, formatDate } from '@/lib/tasks'
import type { Task, Member, TaskStatus, Part, TaskType } from '@/types'

const PARTS: Part[] = ['코어', '비즈', '개인']
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

const PART_ACCENT: Record<string, string> = {
  '코어': 'border-t-indigo-400',
  '비즈': 'border-t-emerald-400',
  '개인': 'border-t-amber-400',
}

function MemberAvatar({ name }: { name: string }) {
  const colors = ['bg-red-400','bg-blue-400','bg-green-400','bg-purple-400','bg-amber-400','bg-pink-400','bg-indigo-400','bg-teal-400']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-white text-xs font-medium`}>
      {name[0]}
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [viewMode, setViewMode] = useState<'parts' | 'monthly'>('parts')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | '전체'>('전체')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')
  const [monthFilter, setMonthFilter] = useState<string>('전체')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const assigneeRef = useRef<HTMLSelectElement>(null)
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'KeyQ') setStatusFilter(prev => prev === '전체' ? '진행필요' : prev === '진행필요' ? '진행중' : prev === '진행중' ? '완료' : '전체')
      if (e.code === 'KeyW') setHideCompleted(prev => !prev)
      if (e.code === 'KeyE') setMonthFilter(prev => {
        if (prev === '전체') return allMonths[0] ?? '전체'
        const idx = allMonths.indexOf(prev)
        return idx < allMonths.length - 1 ? allMonths[idx + 1] : '전체'
      })
      if (e.code === 'KeyT') setViewMode(prev => prev === 'monthly' ? 'parts' : 'monthly')
      if (e.key === 'Tab') { e.preventDefault(); assigneeRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allMonths])

  const filteredTasks = tasks.filter(t => {
    if (hideCompleted && t.status === '완료') return false
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

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleCheckAll(ids: string[]) {
    const allChecked = ids.every(id => checkedIds.has(id))
    setCheckedIds(prev => {
      const s = new Set(prev)
      if (allChecked) ids.forEach(id => s.delete(id)); else ids.forEach(id => s.add(id))
      return s
    })
  }

  async function deleteChecked() {
    if (checkedIds.size === 0) return
    if (!confirm(`선택한 ${checkedIds.size}개 업무를 삭제하시겠습니까?`)) return
    await supabase.from('tasks').delete().in('id', Array.from(checkedIds))
    setTasks(prev => prev.filter(t => !checkedIds.has(t.id)))
    setCheckedIds(new Set())
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">업무 목록</h1>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 && (
            <button onClick={deleteChecked}
              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors">
              {checkedIds.size}개 삭제
            </button>
          )}
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setStatusFilter(prev => prev === '전체' ? '진행필요' : prev === '진행필요' ? '진행중' : prev === '진행중' ? '완료' : '전체')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${statusFilter !== '전체' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
          {statusFilter === '전체' ? '전체 상태' : statusFilter}<span className="ml-1.5 opacity-40 font-normal">[q]</span>
        </button>
        <button
          onClick={() => setHideCompleted(prev => !prev)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${hideCompleted ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
          {hideCompleted ? '완료 숨김' : '완료 표시'}<span className="ml-1.5 opacity-40 font-normal">[w]</span>
        </button>
        <button
          onClick={() => setMonthFilter(prev => {
            if (prev === '전체') return allMonths[0] ?? '전체'
            const idx = allMonths.indexOf(prev)
            return idx < allMonths.length - 1 ? allMonths[idx + 1] : '전체'
          })}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${monthFilter !== '전체' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
          {monthFilter === '전체' ? '전체 월' : formatMonth(monthFilter)}<span className="ml-1.5 opacity-40 font-normal">[e]</span>
        </button>
        <button
          onClick={() => { setViewMode(prev => prev === 'monthly' ? 'parts' : 'monthly'); if (viewMode === 'parts' && monthFilter === '전체' && allMonths.length > 0) setMonthFilter(allMonths[0]) }}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${viewMode === 'monthly' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
          월별 칸반<span className="ml-1.5 opacity-40 font-normal">[t]</span>
        </button>
        <select ref={assigneeRef} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none">
          <option value="전체">전체 담당자 [Tab]</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {/* 월별 칸반 */}
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
                    <div key={task.id} draggable
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={`bg-white rounded-xl border border-gray-100 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none ${draggingId === task.id ? 'opacity-40' : ''}`}>
                      <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {task.title || <span className="text-gray-300 italic text-xs">제목 없음</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-gray-400">{task.part} · {task.type}</span>
                          {task.mid_date && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">중간 {formatDate(task.mid_date)}</span>}
                          {task.end_date && <span className="text-xs text-gray-400">📅 {formatDate(task.end_date)}</span>}
                        </div>
                      </Link>
                    </div>
                  ))}
                  {colTasks.length === 0 && <p className="text-xs text-gray-300 text-center py-6">없음</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 파트별 3-column */}
      {viewMode === 'parts' && (
        <div className="grid grid-cols-3 gap-5">
          {PARTS.map(part => {
            const partTasks = filteredTasks.filter(t => t.part === part)
            const allPartIds = partTasks.map(t => t.id)
            const allChecked = allPartIds.length > 0 && allPartIds.every(id => checkedIds.has(id))
            return (
              <div key={part} className={`bg-white rounded-xl border-2 border-t-4 border-gray-100 p-4 ${PART_ACCENT[part]}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-gray-800">{part}파트</h2>
                    <span className="text-xs text-gray-400">{partTasks.length}</span>
                  </div>
                  {allPartIds.length > 0 && (
                    <input type="checkbox" checked={allChecked}
                      onChange={() => toggleCheckAll(allPartIds)}
                      className="w-3.5 h-3.5 rounded accent-gray-600 cursor-pointer" title="전체 선택" />
                  )}
                </div>
                {TYPES.map(type => {
                  const sectionTasks = partTasks.filter(t => t.type === type && t.status !== '완료')
                  const sectionKey = `${part}_${type}`
                  const isCollapsed = collapsedSections.has(sectionKey)
                  return (
                    <div key={type} className="mb-4">
                      <div className="flex items-center gap-2 mb-1.5 cursor-pointer" onClick={() => toggleSection(sectionKey)}>
                        <span className="text-[10px] text-gray-300">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{type}</span>
                        <span className="text-xs text-gray-300">{sectionTasks.length}</span>
                      </div>
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {sectionTasks.map(task => (
                            <div key={task.id}
                              className={`bg-gray-50 rounded-lg border px-3 py-2 flex items-center gap-2 hover:bg-white transition-colors cursor-pointer group ${checkedIds.has(task.id) ? 'border-gray-400 bg-white' : 'border-gray-100'}`}>
                              <input type="checkbox" checked={checkedIds.has(task.id)}
                                onChange={() => toggleCheck(task.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded accent-gray-600 cursor-pointer flex-shrink-0" />
                              <select value={task.status}
                                onChange={e => { e.stopPropagation(); updateStatus(task.id, e.target.value as TaskStatus) }}
                                onClick={e => e.stopPropagation()}
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-800 font-medium truncate">
                                  {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                                </span>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {task.mid_date && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full hidden group-hover:block">중간 {formatDate(task.mid_date)}</span>}
                                  {task.end_date && <span className="text-xs text-gray-400 hidden group-hover:block">📅 {formatDate(task.end_date)}</span>}
                                  {task.members && <MemberAvatar name={task.members.name} />}
                                </div>
                              </Link>
                            </div>
                          ))}
                          <button onClick={() => handleAddTask(part, type)}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                            + 업무 추가
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {(() => {
                  const completedTasks = partTasks.filter(t => t.status === '완료')
                  const completedKey = `${part}_완료`
                  const isCollapsed = collapsedSections.has(completedKey)
                  return (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-1.5 cursor-pointer" onClick={() => toggleSection(completedKey)}>
                        <span className="text-[10px] text-gray-300">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="text-xs font-medium text-green-600 uppercase tracking-wide">완료</span>
                        <span className="text-xs text-gray-300">{completedTasks.length}</span>
                      </div>
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {completedTasks.map(task => (
                            <div key={task.id}
                              className={`bg-gray-50 rounded-lg border px-3 py-2 flex items-center gap-2 hover:bg-white transition-colors cursor-pointer group ${checkedIds.has(task.id) ? 'border-gray-400 bg-white' : 'border-gray-100'}`}>
                              <input type="checkbox" checked={checkedIds.has(task.id)}
                                onChange={() => toggleCheck(task.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded accent-gray-600 cursor-pointer flex-shrink-0" />
                              <select value={task.status}
                                onChange={e => { e.stopPropagation(); updateStatus(task.id, e.target.value as TaskStatus) }}
                                onClick={e => e.stopPropagation()}
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-800 font-medium truncate">
                                  {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                                </span>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {task.mid_date && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full hidden group-hover:block">중간 {formatDate(task.mid_date)}</span>}
                                  {task.end_date && <span className="text-xs text-gray-400 hidden group-hover:block">📅 {formatDate(task.end_date)}</span>}
                                  {task.members && <MemberAvatar name={task.members.name} />}
                                </div>
                              </Link>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
