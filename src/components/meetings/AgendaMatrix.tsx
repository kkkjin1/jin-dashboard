'use client'

import { useEffect, useState, useRef, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaGroup, AgendaItem, AgendaSubTask, Attachment, Member, YearPlanPriority } from '@/types'
import TiptapEditor from '@/components/TiptapEditor'
import { GlassSelect } from '@/components/ui/GlassSelect'
import { DateCellPicker } from '@/components/ui/MiniDatePicker'
import { CATEGORY_PALETTE, colorKeyFromName } from '@/lib/categoryColors'
import { yearPlanSourceLabel } from '@/lib/yearPlan'
import { todayYmd } from '@/lib/tiptapExtensions'

// ── 상수 ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = { active: '#3B82F6', hold: '#6366F1', done: '#10B981' }
const STATUS_LABEL: Record<string, string> = { active: '진행필요', hold: '진행중', done: '진행완료' }
const GROUP_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#9CA3AF']

// 카테고리(팀명 등)별 색상은 고정 목록이 아니라 이름 해시로 안정 배정 — 팀명이 바뀌어도 코드 수정 불필요
function catPalette(cat: string) {
  return CATEGORY_PALETTE[colorKeyFromName(cat)]
}

const MEMBER_COLORS = ['#3B82F6','#10B981','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#EF4444','#84CC16','#F97316','#A78BFA']

const W_LEFT = 240

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${alpha})`
}

const S = { bd: '1px solid rgba(var(--ink-rgb),0.08)', bdL: '1px solid rgba(var(--ink-rgb),0.14)', bg: "var(--surface-panel)", bgRow: 'rgba(var(--ink-rgb),0.02)', t1: 'rgba(var(--text-rgb),1)', t2: 'rgba(var(--text-rgb),0.7)', t3: 'rgba(var(--text-rgb),0.4)' }

function stDateLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return '오늘'
  if (date === tomorrow) return '내일'
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth()+1}/${d.getDate()}`
}


// ── 드래그 소스 추적 (모듈 레벨 — React state/dataTransfer 우회) ────
let _dragItemId: string | null = null
let _dragSTId: string | null = null
let _dragGroupId: string | null = null

// 프로젝트 출처(v59) — 목표 연계 실무(annual_goal_year_plan_id 있음) / 일반 실무(없음)
type SourceFilter = 'all' | 'goal' | 'general'
const SOURCE_FILTER_KEY = 'project-source-filter'
const SOURCE_FILTER_LABEL: Record<SourceFilter, string> = { all: '전체', goal: '목표 연계 실무', general: '일반 실무' }
type YearPlanRef = { year: number; priority: YearPlanPriority; item: { category: string; title: string } | null }

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function AgendaMatrix({ category, allCats }: { category: string; allCats: string[] }) {
  const supabase = createClient()
  const router   = useRouter()

  const [groups,  setGroups]  = useState<AgendaGroup[]>([])
  const [items,   setItems]   = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => {
    try { const v = sessionStorage.getItem(SOURCE_FILTER_KEY); if (v === 'goal' || v === 'general') return v } catch {}
    return 'all'
  })
  const [planRefs, setPlanRefs] = useState<Map<string, YearPlanRef>>(new Map())
  const [goalCatLabels, setGoalCatLabels] = useState<Record<string, string>>({})
  function selectSourceFilter(f: SourceFilter) {
    setSourceFilter(f)
    try { sessionStorage.setItem(SOURCE_FILTER_KEY, f) } catch {}
  }
  function matchesSource(i: AgendaItem) {
    if (sourceFilter === 'goal') return !!i.annual_goal_year_plan_id
    if (sourceFilter === 'general') return !i.annual_goal_year_plan_id
    return true
  }
  function sourceLabel(i: AgendaItem): string | null {
    const ref = i.annual_goal_year_plan_id ? planRefs.get(i.annual_goal_year_plan_id) : undefined
    return ref ? yearPlanSourceLabel(ref, ref.item, goalCatLabels) : null
  }

  const [openGroups,    setOpenGroups]    = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGName,    setNewGName]    = useState('')
  const [newGColor,   setNewGColor]   = useState(GROUP_COLORS[0])
  const [newGCat,     setNewGCat]     = useState<string>(allCats[0])
  const [addingItem,  setAddingItem]  = useState<string | null>(null)
  const [newITitle,   setNewITitle]   = useState('')

  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const [deletingItem,  setDeletingItem]  = useState<string | null>(null)

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGName,      setEditGName]      = useState('')
  const [editGColor,     setEditGColor]     = useState(GROUP_COLORS[0])
  const [editingItemId,  setEditingItemId]  = useState<string | null>(null)
  const [editITitle,     setEditITitle]     = useState('')
  const [editingSTId,    setEditingSTId]    = useState<string | null>(null)
  const [editSTTitle,    setEditSTTitle]    = useState('')

  const [members,       setMembers]       = useState<Member[]>([])
  const [subTasks,      setSubTasks]      = useState<AgendaSubTask[]>([])
  const [addingSubTask, setAddingSubTask] = useState<string | null>(null)
  const [newSTTitle,    setNewSTTitle]    = useState('')
  const [deletingST,    setDeletingST]    = useState<string | null>(null)
  const [dndErr,        setDndErr]        = useState<string>('')
  const [showDoneGroups, setShowDoneGroups] = useState<Set<string>>(new Set())
  function toggleShowDone(groupId: string) {
    setShowDoneGroups(prev => { const s = new Set(prev); s.has(groupId) ? s.delete(groupId) : s.add(groupId); return s })
  }
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [draggingItemId,  setDraggingItemId]  = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const [dragOverItemId,  setDragOverItemId]  = useState<string | null>(null)
  const [draggingSTId,    setDraggingSTId]    = useState<string | null>(null)
  const [dragOverSTId,    setDragOverSTId]    = useState<string | null>(null)

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const isAll = category === '전체'

  const sched = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
    const tom = new Date(d); tom.setDate(d.getDate()+1)
    const fri = new Date(d); fri.setDate(d.getDate() + (5 - d.getDay() + 7) % 7)
    return { today: fmt(d), tomorrow: fmt(tom), friday: fmt(fri) }
  }, [])

  const memberColors = useMemo(() =>
    Object.fromEntries(members.map((m, i) => [m.id, MEMBER_COLORS[i % MEMBER_COLORS.length]])),
  [members])

  // ── 데이터 로드 ──────────────────────────────────────────────────
  useEffect(() => { load() }, [category])

  async function load() {
    setLoading(true)
    const gQuery = supabase.from('agenda_groups').select('*').order('sort_order')
    const { data: gData } = isAll ? await gQuery : await gQuery.eq('category', category)
    const fetchedGroups = (gData ?? []) as AgendaGroup[]
    setGroups(fetchedGroups)
    setOpenGroups(new Set(fetchedGroups.filter(g => g.is_open).map(g => g.id)))

    if (fetchedGroups.length > 0) {
      const { data: iData } = await supabase.from('agenda_items').select('*').in('group_id', fetchedGroups.map(g => g.id)).order('sort_order')
      const fetchedItems = (iData ?? []) as AgendaItem[]
      setItems(fetchedItems)
      void loadPlanRefs(fetchedItems)
      if (fetchedItems.length > 0) {
        const { data: stData } = await supabase.from('agenda_sub_tasks').select('*').in('agenda_item_id', fetchedItems.map(i => i.id)).order('sort_order')
        setSubTasks((stData ?? []) as AgendaSubTask[])
      } else { setSubTasks([]) }
    } else { setItems([]); setSubTasks([]) }

    const { data: memberListData } = await supabase.from('members').select('id, name').is('archived_at', null).order('name')
    setMembers((memberListData ?? []) as Member[])

    setLoading(false)
  }

  // 목표 연계 프로젝트의 출처(연도 · 영역 > 목표 · 우선순위) — 표시 전용
  async function loadPlanRefs(list: AgendaItem[]) {
    const ids = [...new Set(list.map(i => i.annual_goal_year_plan_id).filter((v): v is string => !!v))]
    if (ids.length === 0) { setPlanRefs(new Map()); return }
    const [{ data: pData }, { data: lData }] = await Promise.all([
      supabase.from('annual_goal_year_plans').select('id, year, priority, annual_goal_items(category, title)').in('id', ids),
      supabase.from('annual_goal_category_labels').select('category_key, name'),
    ])
    const m = new Map<string, YearPlanRef>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(pData ?? []).forEach((r: any) => {
      const it = Array.isArray(r.annual_goal_items) ? r.annual_goal_items[0] : r.annual_goal_items
      m.set(r.id, { year: r.year, priority: r.priority, item: it ?? null })
    })
    setPlanRefs(m)
    setGoalCatLabels(Object.fromEntries((lData ?? []).map((r: { category_key: string; name: string }) => [r.category_key, r.name])))
  }

  // ── 그룹 토글 ────────────────────────────────────────────────────
  async function toggleGroup(id: string) {
    const isOpen = openGroups.has(id)
    setOpenGroups(prev => { const s = new Set(prev); isOpen ? s.delete(id) : s.add(id); return s })
    await supabase.from('agenda_groups').update({ is_open: !isOpen }).eq('id', id)
  }

  async function updateGroupCat(groupId: string, cat: string) {
    await supabase.from('agenda_groups').update({ category: cat }).eq('id', groupId)
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, category: cat } : g))
  }

  // ── CRUD ─────────────────────────────────────────────────────────
  function openAddGroup() { setNewGCat(isAll ? allCats[0] : category); setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(true) }
  async function addGroup() {
    const name = newGName.trim(); if (!name) { setAddingGroup(false); return }
    const { data } = await supabase.from('agenda_groups').insert({ category: newGCat, name, color: newGColor, sort_order: groups.length, is_open: true }).select().single()
    if (data) { setGroups(p => [...p, data as AgendaGroup]); setOpenGroups(p => new Set([...p, (data as AgendaGroup).id])) }
    setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(false)
  }
  async function deleteGroup(groupId: string) {
    await supabase.from('agenda_groups').delete().eq('id', groupId)
    setGroups(p => p.filter(g => g.id !== groupId)); setItems(p => p.filter(i => i.group_id !== groupId)); setDeletingGroup(null)
  }
  async function addItem(groupId: string) {
    const title = newITitle.trim(); if (!title) { setAddingItem(null); return }
    const { data } = await supabase.from('agenda_items').insert({ group_id: groupId, title, item_type: 'do', status: 'active', sort_order: items.filter(i => i.group_id === groupId).length }).select().single()
    if (data) setItems(p => [...p, data as AgendaItem])
    setNewITitle(''); setAddingItem(null)
  }
  async function deleteItem(itemId: string) {
    await supabase.from('agenda_items').delete().eq('id', itemId)
    setItems(p => p.filter(i => i.id !== itemId)); setDeletingItem(null)
  }
  function toggleExpandedItem(itemId: string) { setExpandedItems(prev => { const s = new Set(prev); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return s }) }
  async function addSubTask(itemId: string) {
    const title = newSTTitle.trim(); if (!title) { setAddingSubTask(null); return }
    const { data } = await supabase.from('agenda_sub_tasks').insert({ agenda_item_id: itemId, title, status: 'active', sort_order: subTasks.filter(st => st.agenda_item_id === itemId).length }).select().single()
    if (data) setSubTasks(p => [...p, data as AgendaSubTask])
    setNewSTTitle(''); setAddingSubTask(null)
  }
  async function deleteSubTask(stId: string) {
    await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSubTasks(p => p.filter(st => st.id !== stId)); setDeletingST(null)
  }
  async function updateGroup(groupId: string) {
    const name = editGName.trim(); if (!name) { setEditingGroupId(null); return }
    await supabase.from('agenda_groups').update({ name, color: editGColor }).eq('id', groupId)
    setGroups(p => p.map(g => g.id === groupId ? { ...g, name, color: editGColor } : g)); setEditingGroupId(null)
  }
  async function updateItem(itemId: string) {
    const title = editITitle.trim(); if (!title) { setEditingItemId(null); return }
    await supabase.from('agenda_items').update({ title }).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, title } : i)); setEditingItemId(null)
  }
  async function updateSubTaskDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('agenda_sub_tasks') as any).update({ target_date: date }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, target_date: date } : s))
  }
  async function updateSubTask(stId: string) {
    const title = editSTTitle.trim(); if (!title) { setEditingSTId(null); return }
    await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s)); setEditingSTId(null)
  }
  async function updateItemAssignee(itemId: string, assigneeId: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('agenda_items').update({ assignee_id: assigneeId } as any).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, assignee_id: assigneeId } : i))
  }
  async function updateSubTaskAssignee(stId: string, assigneeId: string | null) {
    await supabase.from('agenda_sub_tasks').update({ assignee_id: assigneeId }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, assignee_id: assigneeId } : s))
  }
  async function updateSubTaskMidDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('agenda_sub_tasks') as any).update({ mid_date: date }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, mid_date: date } : s))
  }
  async function updateSubTaskDueDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('agenda_sub_tasks') as any).update({ due_date: date }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, due_date: date } : s))
  }
  async function cycleStatus(item: AgendaItem) {
    const order: AgendaItem['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    const completed_at = next === 'done' ? todayYmd() : null
    await supabase.from('agenda_items').update({ status: next, completed_at }).eq('id', item.id)
    setItems(p => p.map(i => i.id === item.id ? { ...i, status: next, completed_at } : i))
  }
  async function cycleSubTaskStatus(st: AgendaSubTask) {
    const order: AgendaSubTask['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(st.status) + 1) % order.length]
    await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', st.id)
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, status: next } : s))
  }
  async function moveItemToGroup(itemId: string, newGroupId: string) {
    setItems(p => p.map(i => i.id === itemId ? { ...i, group_id: newGroupId } : i))
    const { error } = await supabase.from('agenda_items').update({ group_id: newGroupId }).eq('id', itemId)
    if (error) { setDndErr(`범주 이동 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000) }
  }
  async function moveSubTaskToItem(stId: string, newItemId: string) {
    const newSortOrder = subTasks.filter(s => s.agenda_item_id === newItemId).length
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, agenda_item_id: newItemId, sort_order: newSortOrder } : s))
    const { error } = await supabase.from('agenda_sub_tasks').update({ agenda_item_id: newItemId, sort_order: newSortOrder }).eq('id', stId)
    if (error) { setDndErr(`task 이동 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000) }
  }
  async function reorderGroup(dragId: string, targetId: string) {
    const sortedG = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    const dragIdx = sortedG.findIndex(g => g.id === dragId)
    const targetIdx = sortedG.findIndex(g => g.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...sortedG]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setGroups(p => p.map(g => { const idx = newOrder.findIndex(x => x.id === g.id); return idx >= 0 ? { ...g, sort_order: idx } : g }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('agenda_groups').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`범주 순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }
  async function reorderItem(dragId: string, targetId: string) {
    const draggedItem = items.find(i => i.id === dragId)
    if (!draggedItem) { setDndErr(`항목 못 찾음: ${dragId.slice(0, 8)}`); setTimeout(() => setDndErr(''), 4000); return }
    const groupItems = items.filter(i => i.group_id === draggedItem.group_id).sort((a, b) => a.sort_order - b.sort_order)
    const dragIdx = groupItems.findIndex(i => i.id === dragId)
    const targetIdx = groupItems.findIndex(i => i.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...groupItems]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setItems(p => p.map(item => { const idx = newOrder.findIndex(i => i.id === item.id); return idx >= 0 ? { ...item, sort_order: idx } : item }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('agenda_items').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }
  async function reorderSubTask(dragId: string, targetId: string) {
    const draggedST = subTasks.find(s => s.id === dragId)
    if (!draggedST) { setDndErr(`task 못 찾음: ${dragId.slice(0, 8)}`); setTimeout(() => setDndErr(''), 4000); return }
    const groupSTs = subTasks.filter(s => s.agenda_item_id === draggedST.agenda_item_id).sort((a, b) => a.sort_order - b.sort_order)
    const dragIdx = groupSTs.findIndex(s => s.id === dragId)
    const targetIdx = groupSTs.findIndex(s => s.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...groupSTs]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setSubTasks(p => p.map(st => { const idx = newOrder.findIndex(s => s.id === st.id); return idx >= 0 ? { ...st, sort_order: idx } : st }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('agenda_sub_tasks').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`task 순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }

  if (loading) return <div className="flex items-center justify-center h-32 text-sm text-gray-400 animate-pulse">불러오는 중…</div>

  // ── 뷰 토글 헤더 ─────────────────────────────────────────────────
  const viewToggle = (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 pb-3">
      <div className="flex items-center gap-0.5 bg-[rgba(var(--ink-rgb),0.08)] rounded-lg p-0.5">
        {(['all', 'goal', 'general'] as SourceFilter[]).map(f => (
          <button key={f} onClick={() => selectSourceFilter(f)}
            className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${sourceFilter === f ? 'bg-[rgba(var(--ink-rgb),0.12)] text-[rgba(var(--text-rgb),1)] shadow-sm' : 'text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)]'}`}>{SOURCE_FILTER_LABEL[f]}</button>
        ))}
      </div>
    </div>
  )

  // ── 목록 ─────────────────────────────────────────────────────
    return (
      <>
        {viewToggle}
        <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6">
          <div className="space-y-3 pb-4" style={{ minWidth: 520 }}>

            {[...groups].sort((a, b) => a.sort_order - b.sort_order).map(group => {
              const groupItems = items.filter(i => i.group_id === group.id && matchesSource(i)).sort((a, b) => a.sort_order - b.sort_order)
              // 출처 필터 중에는 해당 출처 프로젝트가 없는 범주를 숨긴다(전체 보기에서는 기존대로 모두 표시)
              if (sourceFilter !== 'all' && groupItems.length === 0) return null
              const doneGroupItems = groupItems.filter(i => i.status === 'done')
              const visibleGroupItems = showDoneGroups.has(group.id) ? groupItems : groupItems.filter(i => i.status !== 'done')
              const isOpen = openGroups.has(group.id)
              const groupBg = draggingGroupId === group.id ? 'rgba(0,0,0,0.08)' : dragOverGroupId === group.id ? hexToRgba(group.color, 0.22) : (group.category ? catPalette(group.category).bg : hexToRgba(group.color, 0.09))

              return (
                <div
                  key={group.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(var(--ink-rgb),0.06)',
                    border: dragOverGroupId === group.id ? `1px solid ${group.color}` : '1px solid rgba(var(--ink-rgb),0.09)',
                    opacity: draggingGroupId === group.id ? 0.4 : 1,
                    transition: 'border-color .15s',
                  }}
                  onDragOver={e => { if (!_dragItemId && !_dragGroupId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverGroupId(group.id); setDragOverItemId(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    if (_dragGroupId) {
                      const gId = _dragGroupId; _dragGroupId = null
                      if (gId !== group.id) reorderGroup(gId, group.id)
                      setDraggingGroupId(null); setDragOverGroupId(null)
                    } else if (_dragItemId) {
                      const dragId = _dragItemId; _dragItemId = null
                      const di = items.find(i => i.id === dragId)
                      if (di && di.group_id !== group.id) moveItemToGroup(dragId, group.id)
                      setDraggingItemId(null); setDragOverGroupId(null); setDragOverItemId(null)
                    }
                  }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null) }}
                >
                  {/* ── 그룹 헤더 ── */}
                  <div style={{ background: groupBg, borderBottom: '1px solid rgba(var(--ink-rgb),0.07)' }}>
                    {editingGroupId === group.id ? (
                      <div className="flex items-center gap-2 flex-wrap px-4 py-5">
                        <input autoFocus value={editGName} onChange={e => setEditGName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateGroup(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                          className="border border-[rgba(var(--ink-rgb),0.15)] rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-[rgba(var(--ink-rgb),0.3)] font-semibold w-40 bg-transparent"
                          style={{ color: S.t1 }} />
                        <div className="flex gap-1.5">
                          {GROUP_COLORS.map(c => <div key={c} onClick={() => setEditGColor(c)} style={{ width: 13, height: 13, borderRadius: '50%', background: c, cursor: 'pointer', border: editGColor === c ? '2px solid rgba(var(--text-rgb),1)' : '2px solid transparent', flexShrink: 0 }} />)}
                        </div>
                        <button onClick={() => updateGroup(group.id)} className="text-xs bg-[rgba(27,58,107,0.3)] text-[var(--accent-badge-text)] border border-[rgba(27,58,107,0.5)] px-3 py-1 rounded-lg">저장</button>
                        <button onClick={() => setEditingGroupId(null)} className="text-xs text-[rgba(var(--text-rgb),0.4)] px-2">취소</button>
                      </div>
                    ) : (
                      <div onClick={() => toggleGroup(group.id)}
                        className="flex items-center gap-2 group/grow cursor-pointer transition-all px-4 py-4">
                        <span
                          draggable
                          onDragStart={e => { e.stopPropagation(); _dragGroupId = group.id; _dragItemId = null; _dragSTId = null; e.dataTransfer.effectAllowed = 'move'; setDraggingGroupId(group.id) }}
                          onDragEnd={e => { e.stopPropagation(); _dragGroupId = null; setDraggingGroupId(null); setDragOverGroupId(null) }}
                          onClick={e => e.stopPropagation()}
                          title="드래그하여 범주 이동"
                          style={{ cursor: 'grab', color: S.t3, fontSize: 14, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}
                        >⠿</span>
                        <span style={{ fontSize: 9, color: S.t3, display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: S.t1 }}>{group.name}</span>
                        <span style={{ fontSize: 11, color: S.t3, background: 'rgba(var(--ink-rgb),0.1)', padding: '1px 7px', borderRadius: 99 }}>{groupItems.length}</span>
                        <div className="hidden md:flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                          {allCats.map(c => {
                            const active = group.category === c
                            const p = catPalette(c)
                            return (
                              <button key={c} onClick={() => updateGroupCat(group.id, c)}
                                className="text-[11px] px-2.5 py-0.5 rounded-full border font-semibold transition-all"
                                style={active
                                  ? { background: p.bg, color: p.text, borderColor: p.border }
                                  : { background: 'rgba(var(--ink-rgb),0.04)', color: 'rgba(var(--text-rgb),0.4)', borderColor: 'rgba(var(--ink-rgb),0.08)' }}>{c}</button>
                            )
                          })}
                        </div>
                        <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover/grow:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditingGroupId(group.id); setEditGName(group.name); setEditGColor(group.color) }} className="text-[10px] text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)] px-1">수정</button>
                          {deletingGroup === group.id ? (
                            <>
                              <span className="text-[10px] text-[rgba(var(--text-rgb),0.5)]">삭제?</span>
                              <button onClick={() => deleteGroup(group.id)} className="text-[10px] text-red-400 font-semibold px-1.5 py-0.5 rounded">삭제</button>
                              <button onClick={() => setDeletingGroup(null)} className="text-[10px] text-[rgba(var(--text-rgb),0.4)] px-1.5 py-0.5 rounded">취소</button>
                            </>
                          ) : (
                            <button onClick={() => setDeletingGroup(group.id)} className="text-[10px] text-[rgba(var(--text-rgb),0.3)] hover:text-red-400 px-1">삭제</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── 컬럼 헤더 ── */}
                  {isOpen && (
                    <div className="flex" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.07)' }}>
                      {(() => {
                        const hd: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase', padding: '8px 12px', borderLeft: '1px solid rgba(var(--ink-rgb),0.07)' }
                        return (<>
                          <div style={{ flex: 1, minWidth: 180, ...hd, borderLeft: 'none', paddingLeft: 16 }}>안건</div>
                          <div style={{ width: 90, ...hd }}>상태</div>
                          <div style={{ width: 120, ...hd }}>담당자</div>
                          <div style={{ width: 130, ...hd }}>일정</div>
                          <div style={{ width: 70, ...hd }}>비고</div>
                        </>)
                      })()}
                    </div>
                  )}

                  {/* ── 안건 목록 ── */}
                  {isOpen && visibleGroupItems.map(item => {
                    const itemSubTasks = subTasks.filter(st => st.agenda_item_id === item.id).sort((a, b) => a.sort_order - b.sort_order)
                    const isItemExpanded = expandedItems.has(item.id)
                    const activeColor = item.status === 'active' ? (group.category ? catPalette(group.category).solid : group.color) : STATUS_COLOR[item.status]
                    return (
                      <Fragment key={item.id}>
                        <div
                          className="group/irow flex hover:bg-[rgba(var(--ink-rgb),0.03)] transition-colors"
                          style={{ borderBottom: isItemExpanded ? 'none' : '1px solid rgba(var(--ink-rgb),0.05)', opacity: draggingItemId === item.id ? 0.35 : 1, borderTop: dragOverItemId === item.id ? '2px solid #3B82F6' : undefined, cursor: 'pointer' }}
                          onDragOver={e => {
                            if (_dragItemId) {
                              e.preventDefault(); e.dataTransfer.dropEffect = 'move'
                              const di = items.find(i => i.id === _dragItemId)
                              if (di?.group_id === group.id) { setDragOverItemId(item.id); setDragOverGroupId(null) }
                              else { setDragOverGroupId(group.id); setDragOverItemId(null) }
                            } else if (_dragSTId) {
                              e.preventDefault(); e.dataTransfer.dropEffect = 'move'
                              setDragOverItemId(item.id); setDragOverGroupId(null)
                            }
                          }}
                          onDrop={e => {
                            e.preventDefault()
                            if (_dragItemId) {
                              const dragId = _dragItemId; _dragItemId = null
                              if (dragId !== item.id) {
                                const di = items.find(i => i.id === dragId)
                                if (di) { if (di.group_id !== group.id) moveItemToGroup(dragId, group.id); else reorderItem(dragId, item.id) }
                              }
                              setDraggingItemId(null); setDragOverGroupId(null); setDragOverItemId(null)
                            } else if (_dragSTId) {
                              const dragId = _dragSTId; _dragSTId = null
                              const ds = subTasks.find(s => s.id === dragId)
                              if (ds && ds.agenda_item_id !== item.id) moveSubTaskToItem(dragId, item.id)
                              setDraggingSTId(null); setDragOverItemId(null)
                            }
                          }}
                          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverItemId(null) }}
                          onClick={() => toggleExpandedItem(item.id)}
                          onMouseEnter={() => router.prefetch(`/project/items/${item.id}`)}
                        >
                          <div style={{ flex: 1, minWidth: 180, padding: '16px 16px', display: 'flex', alignItems: 'center' }}>
                            <div className="flex items-center gap-2 w-full">
                              <span draggable
                                onDragStart={e => { e.stopPropagation(); _dragItemId = item.id; _dragSTId = null; e.dataTransfer.effectAllowed = 'move'; setDraggingItemId(item.id) }}
                                onDragEnd={e => { e.stopPropagation(); _dragItemId = null; setDraggingItemId(null); setDragOverGroupId(null); setDragOverItemId(null) }}
                                onClick={e => e.stopPropagation()}
                                style={{ cursor: 'grab', color: S.t3, fontSize: 14, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}>⠿</span>
                              <button onClick={e => { e.stopPropagation(); toggleExpandedItem(item.id) }}
                                style={{ fontSize: 8, color: S.t3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, transition: 'transform .15s', transform: isItemExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, width: 10 }}>▶</button>
                              <button onClick={e => { e.stopPropagation(); cycleStatus(item) }}
                                style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: activeColor, border: 'none', cursor: 'pointer', padding: 0 }} />
                              {editingItemId === item.id ? (
                                <input autoFocus value={editITitle} onChange={e => setEditITitle(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateItem(item.id); if (e.key === 'Escape') setEditingItemId(null) }}
                                  className="border border-[rgba(var(--ink-rgb),0.15)] rounded px-2 py-0.5 text-sm focus:outline-none focus:border-[rgba(var(--ink-rgb),0.3)] font-medium flex-1 min-w-0 bg-transparent"
                                  style={{ color: S.t1 }} />
                              ) : (
                                <span className="hover:text-blue-400 transition-colors cursor-pointer"
                                  style={{ fontSize: 14, fontWeight: 500, color: item.status === 'done' ? S.t3 : S.t1, textDecoration: item.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35, flexShrink: sourceLabel(item) ? 0 : undefined, maxWidth: sourceLabel(item) ? '65%' : undefined }}
                                  onClick={e => { e.stopPropagation(); router.push(`/project/items/${item.id}`) }}>
                                  {item.title}
                                </span>
                              )}
                              {itemSubTasks.length > 0 && (
                                <span style={{ fontSize: 10, color: S.t3, background: 'rgba(var(--ink-rgb),0.1)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>
                                  {itemSubTasks.filter(st => st.status !== 'done').length}/{itemSubTasks.length}
                                </span>
                              )}
                              {sourceLabel(item) && (
                                <span className="truncate min-w-0 flex-1" title={sourceLabel(item) ?? ''} style={{ fontSize: 10.5, color: S.t3 }}>
                                  {sourceLabel(item)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ width: 90, padding: '16px 12px', fontSize: 12, color: S.t2, borderLeft: '1px solid rgba(var(--ink-rgb),0.05)', display: 'flex', alignItems: 'center' }}>
                            {STATUS_LABEL[item.status]}
                          </div>
                          <div style={{ width: 120, padding: '8px 10px', borderLeft: '1px solid rgba(var(--ink-rgb),0.05)', display: 'flex', alignItems: 'center' }}>
                            <GlassSelect
                              value={item.assignee_id ?? ''}
                              onChange={v => updateItemAssignee(item.id, v || null)}
                              options={members.map(m => ({ value: m.id, label: m.name, color: memberColors[m.id] }))}
                              placeholder="-"
                              variant="inline"
                            />
                          </div>
                          {/* 일정 (안건 행은 비워둠) */}
                          <div style={{ width: 130, borderLeft: '1px solid rgba(var(--ink-rgb),0.05)' }} />
                          {/* 비고 */}
                          <div style={{ width: 70, padding: '12px 10px', borderLeft: '1px solid rgba(var(--ink-rgb),0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 opacity-0 group-hover/irow:opacity-100 transition-all">
                              {editingItemId !== item.id && (
                                <button onClick={() => { setEditingItemId(item.id); setEditITitle(item.title) }} className="text-[10px] text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)]">수정</button>
                              )}
                              {deletingItem === item.id ? (
                                <>
                                  <button onClick={() => deleteItem(item.id)} className="text-[10px] text-red-400 font-semibold">삭제</button>
                                  <button onClick={() => setDeletingItem(null)} className="text-[10px] text-[rgba(var(--text-rgb),0.4)]">취소</button>
                                </>
                              ) : (
                                <button onClick={() => setDeletingItem(item.id)} className="text-[10px] text-[rgba(var(--text-rgb),0.25)] hover:text-red-400">삭제</button>
                              )}
                            </div>
                          </div>
                        </div>

                        {isItemExpanded && itemSubTasks.map(st => (
                          <div key={st.id}
                            className="group/strow flex hover:bg-[rgba(59,130,246,0.04)] transition-colors"
                            style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.04)', background: 'rgba(var(--ink-rgb),0.025)', opacity: draggingSTId === st.id ? 0.35 : 1, borderTop: dragOverSTId === st.id ? '2px solid #3B82F6' : undefined, cursor: 'pointer' }}
                            onDragOver={e => { if (!_dragSTId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSTId(st.id) }}
                            onDrop={e => {
                              e.preventDefault()
                              const dragId = _dragSTId; _dragSTId = null
                              if (dragId && dragId !== st.id) {
                                const ds = subTasks.find(s => s.id === dragId)
                                if (ds) { if (ds.agenda_item_id !== st.agenda_item_id) moveSubTaskToItem(dragId, st.agenda_item_id); else reorderSubTask(dragId, st.id) }
                              }
                              setDraggingSTId(null); setDragOverSTId(null)
                            }}
                            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSTId(null) }}
                            onClick={() => router.push(`/project/items/${item.id}?focus=${st.id}`)}
                            onMouseEnter={() => router.prefetch(`/project/items/${item.id}`)}
                          >
                            <div style={{ flex: 1, minWidth: 180, padding: '12px 16px 12px 36px', display: 'flex', alignItems: 'center' }}>
                              <div className="flex items-center gap-2">
                                <span draggable
                                  onDragStart={e => { e.stopPropagation(); _dragSTId = st.id; _dragItemId = null; e.dataTransfer.effectAllowed = 'move'; setDraggingSTId(st.id) }}
                                  onDragEnd={e => { e.stopPropagation(); _dragSTId = null; setDraggingSTId(null); setDragOverSTId(null) }}
                                  onClick={e => e.stopPropagation()}
                                  style={{ cursor: 'grab', color: S.t3, fontSize: 12, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}>⠿</span>
                                <button onClick={e => { e.stopPropagation(); cycleSubTaskStatus(st) }}
                                  style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${st.status === 'done' ? '#10B981' : st.status === 'hold' ? '#6366F1' : (group.category ? catPalette(group.category).solid : group.color)}`, background: st.status === 'done' ? '#10B981' : st.status === 'hold' ? 'rgba(99,102,241,0.2)' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                                  {st.status === 'done' && <span style={{ color: 'white', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                                  {st.status === 'hold' && <span style={{ color: '#6366F1', fontSize: 7, lineHeight: 1 }}>▶</span>}
                                </button>
                                {editingSTId === st.id ? (
                                  <input autoFocus value={editSTTitle} onChange={e => setEditSTTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateSubTask(st.id); if (e.key === 'Escape') setEditingSTId(null) }}
                                    className="border border-[rgba(var(--ink-rgb),0.15)] rounded px-2 py-0.5 text-xs focus:outline-none flex-1 min-w-0 bg-transparent"
                                    style={{ color: S.t2 }} onClick={e => e.stopPropagation()} />
                                ) : (
                                  <span style={{ fontSize: 13, color: st.status === 'done' ? S.t3 : S.t2, textDecoration: st.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35 }}>
                                    {st.title}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ width: 90, borderLeft: '1px solid rgba(var(--ink-rgb),0.04)', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11,
                              color: st.status === 'done' ? '#10B981' : st.status === 'hold' ? '#6366F1' : 'rgba(var(--text-rgb),0.35)' }}>
                              {STATUS_LABEL[st.status]}
                            </div>
                            <div style={{ width: 120, padding: '6px 10px', borderLeft: '1px solid rgba(var(--ink-rgb),0.04)', display: 'flex', alignItems: 'center' }}>
                              <GlassSelect
                                value={st.assignee_id ?? ''}
                                onChange={v => updateSubTaskAssignee(st.id, v || null)}
                                options={members.map(m => ({ value: m.id, label: m.name, color: memberColors[m.id] }))}
                                placeholder="-"
                                variant="inline"
                              />
                            </div>
                            {/* ── 일정 칼럼 ── */}
                            <div style={{ width: 130, padding: '6px 10px', borderLeft: '1px solid rgba(var(--ink-rgb),0.04)', display: 'flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                              {st.assignee_id ? (
                                /* 담당자 있음 → 중간보고 + 완료일 2개 */
                                <div className="flex flex-col gap-0.5 w-full" onClick={e => e.stopPropagation()}>
                                  <DateCellPicker label="중" value={st.mid_date ?? null} color="var(--accent-badge-text)" onChange={v => updateSubTaskMidDate(st.id, v)} />
                                  <DateCellPicker label="완" value={st.due_date ?? null} color="#86EFAC" onChange={v => updateSubTaskDueDate(st.id, v)} />
                                </div>
                              ) : (
                                /* 담당자 없음 → 완료일 1개 + 오늘/내일/금주 퀵버튼 */
                                <div className="flex items-center gap-1 w-full">
                                  {st.target_date ? (
                                    <button onClick={() => updateSubTaskDate(st.id, null)}
                                      style={{ fontSize: 9, padding: '2px 8px', borderRadius: 999, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                                        background: st.target_date === sched.today ? 'rgba(220,38,38,0.18)' : st.target_date === sched.tomorrow ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)',
                                        color: st.target_date === sched.today ? 'var(--error-badge-text)' : st.target_date === sched.tomorrow ? 'var(--quick-todo-text)' : 'var(--accent-badge-text)' }}>
                                      {stDateLabel(st.target_date, sched.today, sched.tomorrow)} ×
                                    </button>
                                  ) : (
                                    <div className="opacity-0 group-hover/strow:opacity-100 transition-all flex items-center gap-0.5">
                                      <button onClick={() => updateSubTaskDate(st.id, sched.today)}  className="text-[9px] px-1.5 py-0.5 rounded-full bg-[rgba(220,38,38,0.12)]  text-red-400   border border-[rgba(220,38,38,0.2)]  font-medium">오늘</button>
                                      <button onClick={() => updateSubTaskDate(st.id, sched.tomorrow)} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[rgba(245,158,11,0.12)] text-amber-400 border border-[rgba(245,158,11,0.2)] font-medium">내일</button>
                                      <button onClick={() => updateSubTaskDate(st.id, sched.friday)}  className="text-[9px] px-1.5 py-0.5 rounded-full bg-[rgba(59,130,246,0.12)]  text-blue-400  border border-[rgba(59,130,246,0.2)]  font-medium">금주</button>
                                      <label className="relative cursor-pointer text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.6)] text-[10px] leading-none" title="날짜 선택">
                                        ⊕<input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onChange={e => e.target.value && updateSubTaskDate(st.id, e.target.value)} />
                                      </label>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* ── 비고 칼럼 ── */}
                            <div style={{ width: 70, padding: '6px 8px', borderLeft: '1px solid rgba(var(--ink-rgb),0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                              <div className="opacity-0 group-hover/strow:opacity-100 transition-all flex items-center gap-1.5">
                                {editingSTId !== st.id && (
                                  <button onClick={() => { setEditingSTId(st.id); setEditSTTitle(st.title) }} className="text-[10px] text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)]">수정</button>
                                )}
                                {deletingST === st.id ? (
                                  <>
                                    <button onClick={() => deleteSubTask(st.id)} className="text-[10px] text-red-400 font-semibold">삭제</button>
                                    <button onClick={() => setDeletingST(null)} className="text-[10px] text-[rgba(var(--text-rgb),0.4)]">취소</button>
                                  </>
                                ) : (
                                  <button onClick={() => setDeletingST(st.id)} className="text-[10px] text-[rgba(var(--text-rgb),0.25)] hover:text-red-400">삭제</button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {isItemExpanded && (
                          <div style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.04)', background: 'rgba(var(--ink-rgb),0.025)' }}>
                            {addingSubTask === item.id ? (
                              <div className="flex items-center gap-2 px-10 py-2">
                                <input autoFocus value={newSTTitle} onChange={e => setNewSTTitle(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(item.id); if (e.key === 'Escape') { setAddingSubTask(null); setNewSTTitle('') } }}
                                  placeholder="하위 태스크 입력 후 Enter"
                                  className="flex-1 border border-[rgba(var(--ink-rgb),0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-transparent text-[rgba(var(--text-rgb),1)]" />
                                <button onClick={() => addSubTask(item.id)} className="text-xs bg-[rgba(27,58,107,0.3)] text-[var(--accent-badge-text)] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                                <button onClick={() => { setAddingSubTask(null); setNewSTTitle('') }} className="text-xs text-[rgba(var(--text-rgb),0.4)] px-2">취소</button>
                              </div>
                            ) : (
                              <div onClick={() => setAddingSubTask(item.id)}
                                className="flex items-center gap-1 px-10 py-3 text-xs text-[rgba(var(--text-rgb),0.35)] hover:text-[rgba(var(--text-rgb),0.6)] hover:bg-[rgba(var(--ink-rgb),0.04)] cursor-pointer transition-colors">
                                ＋ 하위 태스크
                              </div>
                            )}
                          </div>
                        )}
                      </Fragment>
                    )
                  })}

                  {isOpen && doneGroupItems.length > 0 && (
                    <div style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.05)' }}>
                      <button onClick={() => toggleShowDone(group.id)}
                        className="w-full flex items-center gap-1.5 px-5 py-2 text-xs text-[rgba(var(--text-rgb),0.35)] hover:text-[rgba(var(--text-rgb),0.55)] hover:bg-[rgba(var(--ink-rgb),0.04)] transition-colors">
                        <span style={{ fontSize: 8, transform: showDoneGroups.has(group.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                        완료 {doneGroupItems.length}건
                      </button>
                    </div>
                  )}

                  {isOpen && (
                    <div>
                      {addingItem === group.id ? (
                        <div className="flex items-center gap-2 px-5 py-2.5">
                          <input autoFocus value={newITitle} onChange={e => setNewITitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(group.id); if (e.key === 'Escape') { setAddingItem(null); setNewITitle('') } }}
                            placeholder="안건명 입력 후 Enter"
                            className="flex-1 border border-[rgba(var(--ink-rgb),0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-transparent text-[rgba(var(--text-rgb),1)]" />
                          <button onClick={() => addItem(group.id)} className="text-xs bg-[rgba(27,58,107,0.3)] text-[var(--accent-badge-text)] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                          <button onClick={() => { setAddingItem(null); setNewITitle('') }} className="text-xs text-[rgba(var(--text-rgb),0.4)] px-2 py-1">취소</button>
                        </div>
                      ) : (
                        <div onClick={() => { setAddingItem(group.id); setNewITitle('') }}
                          className="flex items-center gap-1 px-5 py-3 text-xs text-[rgba(var(--text-rgb),0.35)] hover:text-[rgba(var(--text-rgb),0.6)] hover:bg-[rgba(var(--ink-rgb),0.04)] cursor-pointer transition-colors">
                          ＋ {group.name}에 안건 추가
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="rounded-xl border border-dashed border-[rgba(var(--ink-rgb),0.1)] overflow-hidden">
              {addingGroup ? (
                <div className="flex items-center gap-2 px-5 py-3 flex-wrap">
                  <input autoFocus value={newGName} onChange={e => setNewGName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGName('') } }}
                    placeholder="범주명 입력 후 Enter"
                    className="border border-[rgba(var(--ink-rgb),0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none w-40 bg-transparent text-[rgba(var(--text-rgb),1)]" />
                  {isAll && (
                    <div className="flex gap-1">
                      {allCats.map(c => {
                        const active = newGCat === c
                        const p = catPalette(c)
                        return (
                          <button key={c} type="button" onClick={() => setNewGCat(c)}
                            className="text-xs px-2.5 py-1 rounded-full border font-semibold transition-all"
                            style={active
                              ? { background: p.bg, color: p.text, borderColor: p.border }
                              : { background: 'rgba(var(--ink-rgb),0.04)', color: 'rgba(var(--text-rgb),0.4)', borderColor: 'rgba(var(--ink-rgb),0.08)' }}>{c}</button>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    {GROUP_COLORS.map(c => <div key={c} onClick={() => setNewGColor(c)} style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: newGColor === c ? '2px solid rgba(var(--text-rgb),1)' : '2px solid transparent', flexShrink: 0 }} />)}
                  </div>
                  <button onClick={addGroup} className="text-xs bg-[rgba(27,58,107,0.3)] text-[var(--accent-badge-text)] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                  <button onClick={() => { setAddingGroup(false); setNewGName('') }} className="text-xs text-[rgba(var(--text-rgb),0.4)] px-2 py-1">취소</button>
                </div>
              ) : (
                <div onClick={openAddGroup}
                  className="flex items-center gap-1 px-5 py-3 text-xs text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.6)] hover:bg-[rgba(var(--ink-rgb),0.04)] cursor-pointer transition-colors">
                  ＋ 범주 추가
                </div>
              )}
            </div>

          </div>
        </div>
      </>
    )
}
