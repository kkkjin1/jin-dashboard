'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers, formatDate } from '@/lib/tasks'
import { generateTasksContextMd, downloadMd } from '@/lib/markdown'
import { TaskPageSkeleton } from '@/components/ui/Skeleton'
import type { Task, Member, TaskStatus, Part, TaskType } from '@/types'

const PARTS: Part[] = ['코어', '비즈', '개인']
const TYPES: TaskType[] = ['기획', '개선', '운영']
const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']

const STATUS_COLORS: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-100 text-gray-500',
  '진행중':   'bg-[#90A7D8]/30 text-[#1E3A6B]',
  '완료':     'bg-[#BADEC8]/40 text-[#2D5A45]',
}

const STATUS_BG: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-50 border-gray-200',
  '진행중':   'bg-[#90A7D8]/10 border-[#90A7D8]/25',
  '완료':     'bg-gray-50 border-gray-200',
}

const PART_TOP: Record<string, string> = {
  '코어': 'bg-[#BADEC8]',
  '비즈': 'bg-[#90A7D8]',
  '개인': 'bg-slate-300',
}

const PART_DOT: Record<string, string> = {
  '코어': 'bg-[#BADEC8]',
  '비즈': 'bg-[#90A7D8]',
  '개인': 'bg-slate-400',
}

function MemberAvatar({ name }: { name: string }) {
  const colors = ['bg-[#BADEC8]','bg-[#F3E482]','bg-[#90A7D8]','bg-[#EBA698]','bg-[#BFE4B5]','bg-[#D3E69B]','bg-slate-300','bg-slate-400']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-gray-700 text-xs font-medium`}>
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
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [viewMode, setViewMode] = useState<'parts' | 'monthly'>('parts')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | '전체'>('전체')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')
  const [monthFilter, setMonthFilter] = useState<string>('전체')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const currentYear = new Date().getFullYear()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(currentYear)
  const [pickerFocusMonth, setPickerFocusMonth] = useState(new Date().getMonth() + 1)
  const assigneeDropdownRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const showPickerRef = useRef(false)
  const pickerYearRef = useRef(currentYear)
  const pickerFocusMonthRef = useRef(new Date().getMonth() + 1)
  const viewModeRef = useRef<'parts' | 'monthly'>('parts')
  showPickerRef.current = showPicker
  pickerYearRef.current = pickerYear
  pickerFocusMonthRef.current = pickerFocusMonth
  viewModeRef.current = viewMode
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    Promise.all([fetchAllTasks(), fetchMembers()]).then(([t, m]) => {
      setTasks(t); setMembers(m); setLoadingTasks(false)
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
      if (showPickerRef.current) {
        if (e.code === 'ArrowLeft') {
          e.preventDefault()
          const m = pickerFocusMonthRef.current
          if (m > 1) { setPickerFocusMonth(m - 1) }
          else { setPickerFocusMonth(12); setPickerYear(pickerYearRef.current - 1) }
        }
        if (e.code === 'ArrowRight') {
          e.preventDefault()
          const m = pickerFocusMonthRef.current
          if (m < 12) { setPickerFocusMonth(m + 1) }
          else { setPickerFocusMonth(1); setPickerYear(pickerYearRef.current + 1) }
        }
        if (e.code === 'ArrowUp') { e.preventDefault(); setPickerFocusMonth(m => m > 4 ? m - 4 : m) }
        if (e.code === 'ArrowDown') { e.preventDefault(); setPickerFocusMonth(m => m < 9 ? m + 4 : m) }
        if (e.key === 'Enter') {
          const ym = `${pickerYearRef.current}-${String(pickerFocusMonthRef.current).padStart(2, '0')}`
          setMonthFilter(ym)
          setViewMode('monthly')
          setShowPicker(false)
        }
        if (e.key === 'Escape') setShowPicker(false)
        return
      }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'KeyQ') setStatusFilter(prev => prev === '전체' ? '진행필요' : prev === '진행필요' ? '진행중' : prev === '진행중' ? '완료' : '전체')
      if (e.code === 'KeyW') setHideCompleted(prev => !prev)
      if (e.code === 'KeyE') {
        if (viewModeRef.current === 'monthly') {
          setViewMode('parts')
        } else {
          const nowM = new Date().getMonth() + 1
          setPickerFocusMonth(nowM)
          setPickerYear(new Date().getFullYear())
          setShowPicker(true)
        }
      }
      if (e.key === 'Tab') { e.preventDefault(); setAssigneeOpen(prev => !prev) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!showPicker) return
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showPicker])

  useEffect(() => {
    if (!assigneeOpen) return
    function onClickOutside(e: MouseEvent) {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) setAssigneeOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [assigneeOpen])

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

  async function downloadChecked() {
    const ids = Array.from(checkedIds)
    const selected = tasks.filter(t => ids.includes(t.id))
    const [{ data: notesData }, { data: todosData }] = await Promise.all([
      supabase.from('notes').select('task_id, title, content, created_at').in('task_id', ids).order('created_at', { ascending: false }),
      supabase.from('task_todos').select('task_id, content, done, target_date, sort_order').in('task_id', ids).order('sort_order'),
    ])
    const notesByTask: Record<string, { title: string; content: string; created_at: string }[]> = {}
    const todosByTask: Record<string, { content: string; done: boolean; target_date?: string | null }[]> = {}
    ;(notesData ?? []).forEach((n: { task_id: string; title: string; content: string; created_at: string }) => {
      if (!notesByTask[n.task_id]) notesByTask[n.task_id] = []
      notesByTask[n.task_id].push({ title: n.title, content: n.content, created_at: n.created_at })
    })
    ;(todosData ?? []).forEach((td: { task_id: string; content: string; done: boolean; target_date?: string | null }) => {
      if (!todosByTask[td.task_id]) todosByTask[td.task_id] = []
      todosByTask[td.task_id].push({ content: td.content, done: td.done, target_date: td.target_date })
    })
    const items = selected.map(t => ({
      title: t.title,
      status: t.status,
      part: t.part,
      type: t.type,
      assignee: t.members?.name,
      start_date: t.start_date,
      mid_date: t.mid_date,
      end_date: t.end_date,
      retrospective: t.retrospective ?? null,
      notes: notesByTask[t.id] ?? [],
      todos: todosByTask[t.id] ?? [],
    }))
    const md = generateTasksContextMd(items)
    const label = selected.length === 1 ? selected[0].title : `업무-${selected.length}건`
    downloadMd(md, label)
  }

  if (loadingTasks) return <TaskPageSkeleton />

  return (
    <div className="p-3 md:p-5">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold text-gray-900">업무 목록</h1>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 && (
            <>
              <button onClick={downloadChecked}
                className="text-xs bg-gray-700 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors">
                MD 다운로드 ({checkedIds.size})
              </button>
              <button onClick={deleteChecked}
                className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600 transition-colors">
                {checkedIds.size}개 삭제
              </button>
            </>
          )}
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setStatusFilter(prev => prev === '전체' ? '진행필요' : prev === '진행필요' ? '진행중' : prev === '진행중' ? '완료' : '전체')}
          className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${statusFilter !== '전체' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
          {statusFilter === '전체' ? '전체 상태' : statusFilter}
        </button>
        <button
          onClick={() => setHideCompleted(prev => !prev)}
          className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${hideCompleted ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
          {hideCompleted ? '완료 숨김' : '완료 표시'}
        </button>
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setShowPicker(prev => !prev)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${viewMode === 'monthly' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            {viewMode === 'monthly' && monthFilter !== '전체' ? formatMonth(monthFilter) : '월별 칸반'}
          </button>
          {viewMode === 'monthly' && (
            <button
              onClick={() => { setViewMode('parts'); setShowPicker(false) }}
              className="text-gray-300 hover:text-gray-600 text-sm px-0.5 leading-none transition-colors">
              ×
            </button>
          )}
          {showPicker && (
            <div ref={pickerRef} className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-56">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setPickerYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-gray-500 text-lg">‹</button>
                <span className="text-sm font-semibold text-gray-800">{pickerYear}년</span>
                <button onClick={() => setPickerYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-gray-500 text-lg">›</button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <button key={m}
                    onClick={() => {
                      const ym = `${pickerYear}-${String(m).padStart(2, '0')}`
                      setMonthFilter(ym); setViewMode('monthly'); setShowPicker(false)
                    }}
                    className={`text-xs py-1.5 rounded-lg transition-colors ${pickerFocusMonth === m ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {m}월
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-300 mt-3 text-center">↑↓ 월 · ←→ 년 · Enter 선택</p>
            </div>
          )}
        </div>
        <div className="relative" ref={assigneeDropdownRef}>
          <button onClick={() => setAssigneeOpen(prev => !prev)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1 ${assigneeFilter !== '전체' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            {assigneeFilter === '전체' ? '전체 담당자' : (members.find(m => m.id === assigneeFilter)?.name ?? '담당자')}
            <span className="text-[10px] opacity-60">▾</span>
          </button>
          {assigneeOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-36">
              <button onClick={() => { setAssigneeFilter('전체'); setAssigneeOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${assigneeFilter === '전체' ? 'text-[#2D5A45] font-medium' : 'text-gray-600'}`}>
                전체 담당자
              </button>
              {members.map(m => (
                <button key={m.id} onClick={() => { setAssigneeFilter(m.id); setAssigneeOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${assigneeFilter === m.id ? 'text-[#2D5A45] font-medium' : 'text-gray-600'}`}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 월별 칸반 */}
      {viewMode === 'monthly' && (
        <div className="flex flex-col md:flex-row gap-4">
          {STATUSES.map(status => {
            const colTasks = monthlyTasks.filter(t => t.status === status)
            return (
              <div key={status}
                className={`flex-1 rounded-lg border p-4 min-h-48 ${STATUS_BG[status]}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, status)}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded ${STATUS_COLORS[status]}`}>{status}</span>
                  <span className="text-xs text-gray-400">{colTasks.length}</span>
                </div>
                <div className="space-y-3">
                  {colTasks.map(task => (
                    <div key={task.id} draggable
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={`bg-white rounded-lg border border-gray-100 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none ${draggingId === task.id ? 'opacity-40' : ''}`}>
                      <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                        <p className="text-sm font-semibold text-gray-800 truncate">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PARTS.map(part => {
            const partTasks = filteredTasks.filter(t => t.part === part)
            const allPartIds = partTasks.map(t => t.id)
            const allChecked = allPartIds.length > 0 && allPartIds.every(id => checkedIds.has(id))
            return (
              <div key={part} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`h-1 ${PART_TOP[part] ?? 'bg-gray-200'}`} />
                <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PART_DOT[part] ?? 'bg-gray-300'}`} />
                    <h2 className="text-sm font-bold text-gray-800">{part}파트</h2>
                    <span className="text-xs text-gray-400">{partTasks.length}</span>
                  </div>
                  {allPartIds.length > 0 && (
                    <input type="checkbox" checked={allChecked}
                      onChange={() => toggleCheckAll(allPartIds)}
                      className="w-3 h-3 rounded accent-gray-600 cursor-pointer" title="전체 선택" />
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
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{type}</span>
                        <span className="text-xs text-gray-300">{sectionTasks.length}</span>
                      </div>
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {sectionTasks.map(task => (
                            <div key={task.id}
                              className={`bg-gray-50 rounded-md border px-3 py-2 flex items-center gap-2 hover:bg-white transition-colors cursor-pointer group ${checkedIds.has(task.id) ? 'border-gray-400 bg-white' : 'border-gray-100'}`}>
                              <input type="checkbox" checked={checkedIds.has(task.id)}
                                onChange={() => toggleCheck(task.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded accent-gray-600 cursor-pointer flex-shrink-0" />
                              <select value={task.status}
                                onChange={e => { e.stopPropagation(); updateStatus(task.id, e.target.value as TaskStatus) }}
                                onClick={e => e.stopPropagation()}
                                className={`text-xs px-1.5 py-0.5 rounded font-medium border-0 cursor-pointer focus:outline-none flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-800 font-medium truncate">
                                  {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                                </span>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {task.mid_date && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded hidden group-hover:block">중간 {formatDate(task.mid_date)}</span>}
                                  {task.end_date && <span className="text-xs text-gray-400 hidden group-hover:block">📅 {formatDate(task.end_date)}</span>}
                                  {task.members && <MemberAvatar name={task.members.name} />}
                                </div>
                              </Link>
                            </div>
                          ))}
                          <button onClick={() => handleAddTask(part, type)}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-md transition-colors">
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
                        <span className="text-xs font-bold uppercase tracking-wide text-green-600">완료</span>
                        <span className="text-xs text-gray-300">{completedTasks.length}</span>
                      </div>
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {completedTasks.map(task => (
                            <div key={task.id}
                              className={`bg-gray-50 rounded-md border px-3 py-2 flex items-center gap-2 hover:bg-white transition-colors cursor-pointer group ${checkedIds.has(task.id) ? 'border-gray-400 bg-white' : 'border-gray-100'}`}>
                              <input type="checkbox" checked={checkedIds.has(task.id)}
                                onChange={() => toggleCheck(task.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded accent-gray-600 cursor-pointer flex-shrink-0" />
                              <select value={task.status}
                                onChange={e => { e.stopPropagation(); updateStatus(task.id, e.target.value as TaskStatus) }}
                                onClick={e => e.stopPropagation()}
                                className={`text-xs px-1.5 py-0.5 rounded font-medium border-0 cursor-pointer focus:outline-none flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-800 font-medium truncate">
                                  {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                                </span>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {task.mid_date && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded hidden group-hover:block">중간 {formatDate(task.mid_date)}</span>}
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
                </div>{/* /p-4 */}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
