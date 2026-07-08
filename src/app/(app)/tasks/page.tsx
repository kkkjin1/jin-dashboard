'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers, formatDate } from '@/lib/tasks'
import { generateTasksContextMd, downloadMd } from '@/lib/markdown'
import { TaskPageSkeleton } from '@/components/ui/Skeleton'
import type { Task, Member, TaskStatus, TaskType } from '@/types'

const DEFAULT_PARTS = ['코어', '비즈', '개인']
const PARTS_KEY = 'jin_dashboard_parts'
const TYPES: TaskType[] = ['기획', '개선', '운영']
const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']

const STATUS_BADGE: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-100/80 text-gray-500 border-gray-200',
  '진행중':   'bg-[#90A7D8]/25 text-[#1E3A6B] border-[#90A7D8]/40',
  '완료':     'bg-[#BADEC8]/35 text-[#2D5A45] border-[#BADEC8]/50',
}

function MemberAvatar({ name }: { name: string }) {
  const colors = ['bg-[#BADEC8]','bg-[#F3E482]','bg-[#90A7D8]','bg-[#EBA698]','bg-[#BFE4B5]','bg-[#D3E69B]','bg-slate-300','bg-slate-400']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-gray-700 text-xs font-medium flex-shrink-0`}>
      {name[0]}
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

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

  // 월별 칸반 피커
  const currentYear = new Date().getFullYear()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(currentYear)
  const [pickerFocusMonth, setPickerFocusMonth] = useState(new Date().getMonth() + 1)

  // 팀(파트) 관리
  const [customParts, setCustomParts] = useState<string[]>(DEFAULT_PARTS)
  const [partsEditOpen, setPartsEditOpen] = useState(false)
  const [newPartName, setNewPartName] = useState('')
  const [editingPart, setEditingPart] = useState<string | null>(null)
  const [editingPartName, setEditingPartName] = useState('')

  // 파트 간 드래그앤드롭
  const [draggingPartTaskId, setDraggingPartTaskId] = useState<string | null>(null)
  const [dragOverPart, setDragOverPart] = useState<string | null>(null)

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

  // localStorage에서 팀 목록 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PARTS_KEY)
      if (saved) setCustomParts(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    Promise.all([fetchAllTasks(), fetchMembers()]).then(([t, m]) => {
      setTasks(t); setMembers(m); setLoadingTasks(false)
    })
  }, [])

  // DB에 존재하지만 customParts에 없는 파트를 자동 추가 (데이터 유실 방지)
  const displayParts = useMemo(() => {
    const dbParts = [...new Set(tasks.map(t => t.part).filter(Boolean))]
    const orphaned = dbParts.filter(p => !customParts.includes(p))
    return [...customParts, ...orphaned]
  }, [customParts, tasks])

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
          setMonthFilter(ym); setViewMode('monthly'); setShowPicker(false)
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
          setPickerFocusMonth(new Date().getMonth() + 1)
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

  // ── 팀 관리 ──────────────────────────────────────────────

  function saveParts(parts: string[]) {
    localStorage.setItem(PARTS_KEY, JSON.stringify(parts))
    setCustomParts(parts)
  }

  function addPart() {
    const name = newPartName.trim()
    if (!name || customParts.includes(name)) return
    saveParts([...customParts, name])
    setNewPartName('')
  }

  async function renamePart(oldName: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) { setEditingPart(null); return }
    await supabase.from('tasks').update({ part: trimmed }).eq('part', oldName)
    setTasks(prev => prev.map(t => t.part === oldName ? { ...t, part: trimmed } : t))
    saveParts(customParts.map(p => p === oldName ? trimmed : p))
    setEditingPart(null)
  }

  async function deletePart(partName: string) {
    const remaining = customParts.filter(p => p !== partName)
    const fallback = remaining[0] ?? '기타'
    const count = tasks.filter(t => t.part === partName).length
    const msg = count > 0
      ? `'${partName}' 팀의 업무 ${count}건을 '${fallback}'으로 이동 후 삭제하시겠습니까?`
      : `'${partName}' 팀을 삭제하시겠습니까?`
    if (!confirm(msg)) return
    if (count > 0) {
      await supabase.from('tasks').update({ part: fallback }).eq('part', partName)
      setTasks(prev => prev.map(t => t.part === partName ? { ...t, part: fallback } : t))
    }
    saveParts(remaining)
  }

  // ── 파트 간 드래그앤드롭 ─────────────────────────────────

  async function handlePartDrop(targetPart: string) {
    if (!draggingPartTaskId) return
    const task = tasks.find(t => t.id === draggingPartTaskId)
    setDraggingPartTaskId(null)
    setDragOverPart(null)
    if (!task || task.part === targetPart) return
    await supabase.from('tasks').update({ part: targetPart }).eq('id', draggingPartTaskId)
    setTasks(prev => prev.map(t => t.id === draggingPartTaskId ? { ...t, part: targetPart } : t))
  }

  // ── 기존 로직 ────────────────────────────────────────────

  async function handleAddTask(part: string, type: TaskType) {
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
      next.has(key) ? next.delete(key) : next.add(key)
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
      title: t.title, status: t.status, part: t.part, type: t.type,
      assignee: t.members?.name, start_date: t.start_date, mid_date: t.mid_date,
      end_date: t.end_date, retrospective: t.retrospective ?? null,
      notes: notesByTask[t.id] ?? [], todos: todosByTask[t.id] ?? [],
    }))
    const md = generateTasksContextMd(items)
    downloadMd(md, selected.length === 1 ? selected[0].title : `업무-${selected.length}건`)
  }

  if (loadingTasks) return <TaskPageSkeleton />

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 mr-auto">업무 목록</h1>
        {checkedIds.size > 0 && (
          <>
            <button onClick={downloadChecked} className={`${pill} ${pOff}`}>
              MD 다운로드 ({checkedIds.size})
            </button>
            <button onClick={deleteChecked}
              className="text-xs bg-red-50 border border-red-200 text-red-500 px-3 py-1.5 rounded-full hover:bg-red-100 transition-all">
              {checkedIds.size}개 삭제
            </button>
          </>
        )}
      </div>

      {/* 필터 바 */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setStatusFilter(prev => prev === '전체' ? '진행필요' : prev === '진행필요' ? '진행중' : prev === '진행중' ? '완료' : '전체')}
          className={`${pill} ${statusFilter !== '전체' ? pOn : pOff}`}>
          {statusFilter === '전체' ? '전체 상태' : statusFilter}
        </button>
        <button
          onClick={() => setHideCompleted(prev => !prev)}
          className={`${pill} ${hideCompleted ? pOn : pOff}`}>
          {hideCompleted ? '완료 숨김' : '완료 표시'}
        </button>
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setShowPicker(prev => !prev)}
            className={`${pill} ${viewMode === 'monthly' ? pOn : pOff}`}>
            {viewMode === 'monthly' && monthFilter !== '전체' ? formatMonth(monthFilter) : '월별 칸반'}
          </button>
          {viewMode === 'monthly' && (
            <button onClick={() => { setViewMode('parts'); setShowPicker(false) }}
              className="text-gray-400 hover:text-gray-700 text-sm px-0.5 leading-none transition-colors">×</button>
          )}
          {showPicker && (
            <div ref={pickerRef} className="absolute top-full left-0 mt-2 z-50 bg-white/90 backdrop-blur-xl border border-white/80 rounded-3xl shadow-lg p-4 w-56">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setPickerYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 text-lg">‹</button>
                <span className="text-sm font-semibold text-gray-800">{pickerYear}년</span>
                <button onClick={() => setPickerYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 text-lg">›</button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <button key={m}
                    onClick={() => { const ym = `${pickerYear}-${String(m).padStart(2, '0')}`; setMonthFilter(ym); setViewMode('monthly'); setShowPicker(false) }}
                    className={`text-xs py-1.5 rounded-full transition-colors ${pickerFocusMonth === m ? pOn : 'text-gray-600 hover:bg-gray-100'}`}>
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
            className={`${pill} flex items-center gap-1 ${assigneeFilter !== '전체' ? pOn : pOff}`}>
            {assigneeFilter === '전체' ? '전체 담당자' : (members.find(m => m.id === assigneeFilter)?.name ?? '담당자')}
            <span className="text-[10px] opacity-60">▾</span>
          </button>
          {assigneeOpen && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-white/90 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg py-1.5 min-w-36">
              <button onClick={() => { setAssigneeFilter('전체'); setAssigneeOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/60 transition-colors ${assigneeFilter === '전체' ? 'text-[#2D5A45] font-medium' : 'text-gray-600'}`}>
                전체 담당자
              </button>
              {members.map(m => (
                <button key={m.id} onClick={() => { setAssigneeFilter(m.id); setAssigneeOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/60 transition-colors ${assigneeFilter === m.id ? 'text-[#2D5A45] font-medium' : 'text-gray-600'}`}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 팀 편집 버튼 */}
        {viewMode === 'parts' && (
          <button onClick={() => setPartsEditOpen(prev => !prev)}
            className={`${pill} ${partsEditOpen ? pOn : pOff}`}>
            팀 편집
          </button>
        )}
      </div>

      {/* 팀 관리 패널 */}
      {partsEditOpen && viewMode === 'parts' && (
        <div className="flex-shrink-0 mb-4 bg-white/60 backdrop-blur-xl border border-white/70 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-gray-700">팀 관리</span>
            <span className="text-[10px] text-gray-400">이름 수정 시 해당 팀의 업무가 일괄 변경됩니다</span>
            <button onClick={() => setPartsEditOpen(false)} className="ml-auto text-lg leading-none text-gray-300 hover:text-gray-500">×</button>
          </div>
          <div className="space-y-2 mb-3">
            {customParts.map(part => (
              <div key={part} className="flex items-center gap-2">
                {editingPart === part ? (
                  <>
                    <input
                      value={editingPartName}
                      onChange={e => setEditingPartName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renamePart(part, editingPartName); if (e.key === 'Escape') setEditingPart(null) }}
                      autoFocus
                      className="flex-1 text-xs bg-white border border-stone-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-400"
                    />
                    <button onClick={() => renamePart(part, editingPartName)}
                      className="text-xs text-[#2D5A45] font-semibold px-2 py-1 rounded-lg hover:bg-[#BADEC8]/20 transition-colors whitespace-nowrap">저장</button>
                    <button onClick={() => setEditingPart(null)}
                      className="text-xs text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">취소</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs font-semibold text-gray-700">{part}</span>
                    <span className="text-[10px] text-gray-400 tabular-nums">{tasks.filter(t => t.part === part).length}건</span>
                    <button onClick={() => { setEditingPart(part); setEditingPartName(part) }}
                      className="text-[11px] text-gray-400 hover:text-gray-700 px-2 py-0.5 rounded-lg hover:bg-gray-100 transition-colors">수정</button>
                    <button onClick={() => deletePart(part)}
                      className="text-[11px] text-red-400 hover:text-red-600 px-2 py-0.5 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-3 border-t border-white/60">
            <input
              value={newPartName}
              onChange={e => setNewPartName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPart()}
              placeholder="새 팀 이름 입력 후 Enter"
              className="flex-1 text-xs bg-white border border-stone-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
            />
            <button onClick={addPart}
              className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg hover:bg-[#D5E6F7] transition-colors whitespace-nowrap">
              + 추가
            </button>
          </div>
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">

        {/* 월별 칸반 */}
        {viewMode === 'monthly' && (
          <div className="flex flex-col md:flex-row gap-4 pb-6">
            {STATUSES.map(status => {
              const colTasks = monthlyTasks.filter(t => t.status === status)
              return (
                <div key={status}
                  className="flex-1 bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4 min-h-48"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleDrop(e, status)}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[status]}`}>{status}</span>
                    <span className="text-xs text-gray-400">{colTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colTasks.map(task => (
                      <div key={task.id} draggable
                        onDragStart={() => setDraggingId(task.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className={`bg-white/60 rounded-2xl border border-white/70 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none hover:bg-white/80 transition-all ${draggingId === task.id ? 'opacity-40' : ''}`}>
                        <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {task.title || <span className="text-gray-300 italic text-xs">제목 없음</span>}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-400">{task.part} · {task.type}</span>
                            {task.mid_date && <span className="text-xs text-amber-600 bg-amber-50/80 px-1.5 py-0.5 rounded-full">중간 {formatDate(task.mid_date)}</span>}
                            {task.end_date && <span className="text-xs text-gray-400">{formatDate(task.end_date)}</span>}
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

        {/* 파트별 컬럼 (팀 간 드래그앤드롭 지원) */}
        {viewMode === 'parts' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pb-6">
            {displayParts.map(part => {
              const partTasks = filteredTasks.filter(t => t.part === part)
              const allPartIds = partTasks.map(t => t.id)
              const allChecked = allPartIds.length > 0 && allPartIds.every(id => checkedIds.has(id))
              const isDropTarget = draggingPartTaskId !== null && dragOverPart === part

              return (
                <div key={part}
                  className={`bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-5 transition-all duration-150 ${isDropTarget ? 'ring-2 ring-[#BADEC8] border-[#BADEC8]/50 bg-[#BADEC8]/10' : ''}`}
                  onDragOver={e => { e.preventDefault(); if (draggingPartTaskId) setDragOverPart(part) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverPart(null) }}
                  onDrop={e => { e.preventDefault(); handlePartDrop(part) }}>

                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-800">{part}</h2>
                      {isDropTarget
                        ? <span className="text-[10px] text-[#2D5A45] bg-[#BADEC8]/30 border border-[#BADEC8]/40 px-2 py-0.5 rounded-full">여기에 놓기 ↓</span>
                        : <span className="text-xs text-gray-400 bg-white/60 border border-white/70 px-2 py-0.5 rounded-full">{partTasks.length}</span>
                      }
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
                      <div key={type} className="mb-5">
                        <div className="flex items-center gap-2 mb-2 cursor-pointer" onClick={() => toggleSection(sectionKey)}>
                          <span className="text-[10px] text-gray-300">{isCollapsed ? '▶' : '▼'}</span>
                          <span className="text-xs font-semibold text-gray-400">{type}</span>
                          <span className="text-xs text-gray-300">{sectionTasks.length}</span>
                        </div>
                        {!isCollapsed && (
                          <div className="space-y-1.5">
                            {sectionTasks.map(task => (
                              <div key={task.id}
                                draggable
                                onDragStart={e => { e.stopPropagation(); setDraggingPartTaskId(task.id) }}
                                onDragEnd={() => { setDraggingPartTaskId(null); setDragOverPart(null) }}
                                className={`bg-white/50 rounded-2xl border border-white/70 px-3 py-2 flex items-center gap-2 hover:bg-white/70 transition-all cursor-grab active:cursor-grabbing select-none group ${checkedIds.has(task.id) ? 'bg-white/70 border-white/90' : ''} ${draggingPartTaskId === task.id ? 'opacity-40 scale-95' : ''}`}>
                                <input type="checkbox" checked={checkedIds.has(task.id)}
                                  onChange={() => toggleCheck(task.id)}
                                  onClick={e => e.stopPropagation()}
                                  className="w-3.5 h-3.5 rounded accent-gray-600 cursor-pointer flex-shrink-0" />
                                <select value={task.status}
                                  onChange={e => { e.stopPropagation(); updateStatus(task.id, e.target.value as TaskStatus) }}
                                  onClick={e => e.stopPropagation()}
                                  className={`text-xs px-1.5 py-0.5 rounded-full border font-medium cursor-pointer focus:outline-none flex-shrink-0 ${STATUS_BADGE[task.status]}`}>
                                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <Link href={`/tasks/${task.id}`}
                                  className="flex-1 min-w-0 flex items-center justify-between gap-2"
                                  onClick={e => { if (draggingPartTaskId) e.preventDefault() }}>
                                  <span className="text-xs text-gray-800 font-medium truncate">
                                    {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {task.mid_date && <span className="text-xs text-amber-600 bg-amber-50/80 px-1.5 py-0.5 rounded-full hidden group-hover:block">중간 {formatDate(task.mid_date)}</span>}
                                    {task.end_date && <span className="text-xs text-gray-400 hidden group-hover:block">{formatDate(task.end_date)}</span>}
                                    {task.members && <MemberAvatar name={task.members.name} />}
                                  </div>
                                </Link>
                              </div>
                            ))}
                            <button onClick={() => handleAddTask(part, type)}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:text-gray-500 hover:bg-white/40 rounded-2xl transition-colors">
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
                      <div>
                        <div className="flex items-center gap-2 mb-2 cursor-pointer" onClick={() => toggleSection(completedKey)}>
                          <span className="text-[10px] text-gray-300">{isCollapsed ? '▶' : '▼'}</span>
                          <span className="text-xs font-semibold text-[#2D5A45]">완료</span>
                          <span className="text-xs text-gray-300">{completedTasks.length}</span>
                        </div>
                        {!isCollapsed && (
                          <div className="space-y-1.5">
                            {completedTasks.map(task => (
                              <div key={task.id}
                                draggable
                                onDragStart={e => { e.stopPropagation(); setDraggingPartTaskId(task.id) }}
                                onDragEnd={() => { setDraggingPartTaskId(null); setDragOverPart(null) }}
                                className={`bg-white/50 rounded-2xl border border-white/70 px-3 py-2 flex items-center gap-2 hover:bg-white/70 transition-all cursor-grab active:cursor-grabbing select-none group opacity-70 hover:opacity-100 ${checkedIds.has(task.id) ? 'opacity-100 bg-white/70' : ''} ${draggingPartTaskId === task.id ? 'opacity-30 scale-95' : ''}`}>
                                <input type="checkbox" checked={checkedIds.has(task.id)}
                                  onChange={() => toggleCheck(task.id)}
                                  onClick={e => e.stopPropagation()}
                                  className="w-3.5 h-3.5 rounded accent-gray-600 cursor-pointer flex-shrink-0" />
                                <select value={task.status}
                                  onChange={e => { e.stopPropagation(); updateStatus(task.id, e.target.value as TaskStatus) }}
                                  onClick={e => e.stopPropagation()}
                                  className={`text-xs px-1.5 py-0.5 rounded-full border font-medium cursor-pointer focus:outline-none flex-shrink-0 ${STATUS_BADGE[task.status]}`}>
                                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                  <span className="text-xs text-gray-500 font-medium truncate line-through decoration-gray-300">
                                    {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
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
    </div>
  )
}
