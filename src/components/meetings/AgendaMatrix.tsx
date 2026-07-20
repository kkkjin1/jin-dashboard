'use client'

import { useEffect, useState, useRef, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaGroup, AgendaItem, AgendaSubTask, Attachment, Member } from '@/types'
import TiptapEditor from '@/components/TiptapEditor'

// ── 상수 ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = { active: '#3B82F6', hold: '#9CA3AF', done: '#10B981' }
const STATUS_LABEL: Record<string, string> = { active: '진행필요', hold: '진행중', done: '진행완료' }
const GROUP_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#9CA3AF']
const MATRIX_CATS = ['코어', '비즈', '개인']
const CAT_CLS: Record<string, string> = {
  '코어':  'bg-[rgba(59,130,246,0.15)] text-blue-300 border-[rgba(59,130,246,0.3)]',
  '비즈':  'bg-[rgba(245,158,11,0.15)] text-amber-300 border-[rgba(245,158,11,0.3)]',
  '개인':  'bg-[rgba(16,185,129,0.15)] text-emerald-300 border-[rgba(16,185,129,0.3)]',
}
const CAT_BG: Record<string, string>     = { '코어': 'rgba(59,130,246,0.09)',  '비즈': 'rgba(245,158,11,0.09)',  '개인': 'rgba(16,185,129,0.09)' }
const CAT_BORDER: Record<string, string> = { '코어': '#3B82F6',                '비즈': '#F59E0B',                '개인': '#10B981' }
const CAT_DOT: Record<string, string>    = { '코어': '#3B82F6',                '비즈': '#F59E0B',                '개인': '#10B981' }

const W_LEFT = 240

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${alpha})`
}

const S = { bd: '1px solid rgba(255,255,255,0.08)', bdL: '1px solid rgba(255,255,255,0.14)', bg: '#13151C', bgRow: 'rgba(255,255,255,0.02)', t1: '#E2E8F0', t2: 'rgba(226,232,240,0.7)', t3: 'rgba(226,232,240,0.4)' }

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
let _rdDragItemId: string | null = null

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function AgendaMatrix({ category, allCats }: { category: string; allCats: string[] }) {
  const supabase = createClient()
  const router   = useRouter()

  const [groups,  setGroups]  = useState<AgendaGroup[]>([])
  const [items,   setItems]   = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)

  const [openGroups,    setOpenGroups]    = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGName,    setNewGName]    = useState('')
  const [newGColor,   setNewGColor]   = useState(GROUP_COLORS[0])
  const [newGCat,     setNewGCat]     = useState<string>(MATRIX_CATS[0])
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
  const [viewMode, setViewMode] = useState<'list' | 'roadmap'>('list')
  const [yearNav, setYearNav] = useState(() => new Date().getFullYear())
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [draggingItemId,  setDraggingItemId]  = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const [dragOverItemId,  setDragOverItemId]  = useState<string | null>(null)
  const [draggingSTId,    setDraggingSTId]    = useState<string | null>(null)
  const [dragOverSTId,    setDragOverSTId]    = useState<string | null>(null)
  const [periodPickerItemId,  setPeriodPickerItemId]  = useState<string | null>(null)
  const [periodPickerGroupId, setPeriodPickerGroupId] = useState<string | null>(null)
  const [periodPickerPos,     setPeriodPickerPos]     = useState<{ x: number; y: number } | null>(null)
  const [periodPickerYear,    setPeriodPickerYear]    = useState(() => new Date().getFullYear())
  const [periodPickerStartM,  setPeriodPickerStartM]  = useState<number>(1)
  const [periodPickerEndM,    setPeriodPickerEndM]    = useState<number>(12)
  const [rdDraggingId,    setRdDraggingId]    = useState<string | null>(null)
  const [rdDragOverId,    setRdDragOverId]    = useState<string | null>(null)

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

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const yearMonths = useMemo((): string[] => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return Array.from({ length: 12 }, (_, i) => `${yearNav}-${pad(i + 1)}`)
  }, [yearNav])

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
      if (fetchedItems.length > 0) {
        const { data: stData } = await supabase.from('agenda_sub_tasks').select('*').in('agenda_item_id', fetchedItems.map(i => i.id)).order('sort_order')
        setSubTasks((stData ?? []) as AgendaSubTask[])
      } else { setSubTasks([]) }
    } else { setItems([]); setSubTasks([]) }

    const { data: memberListData } = await supabase.from('members').select('id, name').is('archived_at', null).order('name')
    setMembers((memberListData ?? []) as Member[])

    setLoading(false)
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
  function openAddGroup() { setNewGCat(isAll ? MATRIX_CATS[0] : category); setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(true) }
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
  async function cycleStatus(item: AgendaItem) {
    const order: AgendaItem['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    await supabase.from('agenda_items').update({ status: next }).eq('id', item.id)
    setItems(p => p.map(i => i.id === item.id ? { ...i, status: next } : i))
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
  async function updateRoadmapPeriod(itemId: string, year: number | null, key: string | null) {
    const value = (year && key) ? `${year}-${key}` : null
    await supabase.from('agenda_items').update({ roadmap_period: value }).eq('id', itemId)
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, roadmap_period: value } : i))
    setPeriodPickerItemId(null)
    setPeriodPickerPos(null)
  }
  async function updateGroupRoadmapPeriod(groupId: string, year: number | null, key: string | null) {
    const value = (year && key) ? `${year}-${key}` : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('agenda_groups').update({ roadmap_period: value } as any).eq('id', groupId)
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, roadmap_period: value } : g))
    setPeriodPickerGroupId(null)
    setPeriodPickerPos(null)
  }
  async function reorderRoadmapItem(dragId: string, targetId: string) {
    const draggedItem = items.find(i => i.id === dragId)
    const targetItem  = items.find(i => i.id === targetId)
    if (!draggedItem || !targetItem) return
    const period = draggedItem.roadmap_period ?? null
    const sectionItems = items
      .filter(i => (i.roadmap_period ?? null) === period)
      .sort((a, b) => (a.roadmap_rank ?? 999) - (b.roadmap_rank ?? 999) || a.sort_order - b.sort_order)
    const dragIdx   = sectionItems.findIndex(i => i.id === dragId)
    const targetIdx = sectionItems.findIndex(i => i.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...sectionItems]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setItems(p => p.map(item => {
      const idx = newOrder.findIndex(i => i.id === item.id)
      return idx >= 0 ? { ...item, roadmap_rank: idx } : item
    }))
    for (let i = 0; i < newOrder.length; i++) {
      await supabase.from('agenda_items').update({ roadmap_rank: i }).eq('id', newOrder[i].id)
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

  // ── 공통 상수 (모든 뷰에서 사용) ─────────────────────────────────
  const catColor  = CAT_BORDER[category] ?? '#1B3A6B'
  const W_ROAD    = 68
  const MONTH_KO  = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
  const curYM     = todayStr.slice(0, 7)

  // ── 뷰 토글 헤더 ─────────────────────────────────────────────────
  const viewToggle = (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 pb-3">
      <div className="flex items-center gap-0.5 bg-[rgba(255,255,255,0.08)] rounded-lg p-0.5">
        <button onClick={() => setViewMode('list')}
          className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${viewMode === 'list' ? 'bg-[rgba(255,255,255,0.12)] text-[#E2E8F0] shadow-sm' : 'text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]'}`}>목록</button>
        <button onClick={() => setViewMode('roadmap')}
          className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${viewMode === 'roadmap' ? 'bg-[rgba(255,255,255,0.12)] text-[#E2E8F0] shadow-sm' : 'text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]'}`}>로드맵</button>
      </div>
      {viewMode === 'roadmap' && (
        <div className="flex items-center gap-1.5">
          <button onClick={() => setYearNav(p => p - 1)} className="text-[rgba(226,232,240,0.4)] hover:text-[#E2E8F0] text-base px-1 leading-none">‹</button>
          <span className="text-sm font-semibold text-[rgba(226,232,240,0.7)] w-16 text-center">{yearNav}년</span>
          <button onClick={() => setYearNav(p => p + 1)} className="text-[rgba(226,232,240,0.4)] hover:text-[#E2E8F0] text-base px-1 leading-none">›</button>
        </div>
      )}
    </div>
  )

  // ── 목록 모드 (전체/코어/비즈 공통) ─────────────────────────────
  if (viewMode === 'list') {
    return (
      <>
        {viewToggle}
        <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6">
          <div className="space-y-3 pb-4" style={{ minWidth: 520 }}>

            {[...groups].sort((a, b) => a.sort_order - b.sort_order).map(group => {
              const groupItems = items.filter(i => i.group_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
              const doneGroupItems = groupItems.filter(i => i.status === 'done')
              const visibleGroupItems = showDoneGroups.has(group.id) ? groupItems : groupItems.filter(i => i.status !== 'done')
              const isOpen = openGroups.has(group.id)
              const groupBg = draggingGroupId === group.id ? 'rgba(0,0,0,0.08)' : dragOverGroupId === group.id ? hexToRgba(group.color, 0.22) : (CAT_BG[group.category ?? ''] ?? hexToRgba(group.color, 0.09))

              return (
                <div
                  key={group.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: dragOverGroupId === group.id ? `1px solid ${group.color}` : '1px solid rgba(255,255,255,0.09)',
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
                  <div style={{ background: groupBg, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {editingGroupId === group.id ? (
                      <div className="flex items-center gap-2 flex-wrap px-4 py-5">
                        <input autoFocus value={editGName} onChange={e => setEditGName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateGroup(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                          className="border border-[rgba(255,255,255,0.15)] rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-[rgba(255,255,255,0.3)] font-semibold w-40 bg-transparent"
                          style={{ color: S.t1 }} />
                        <div className="flex gap-1.5">
                          {GROUP_COLORS.map(c => <div key={c} onClick={() => setEditGColor(c)} style={{ width: 13, height: 13, borderRadius: '50%', background: c, cursor: 'pointer', border: editGColor === c ? '2px solid #E2E8F0' : '2px solid transparent', flexShrink: 0 }} />)}
                        </div>
                        <button onClick={() => updateGroup(group.id)} className="text-xs bg-[rgba(27,58,107,0.3)] text-[#93C5FD] border border-[rgba(27,58,107,0.5)] px-3 py-1 rounded-lg">저장</button>
                        <button onClick={() => setEditingGroupId(null)} className="text-xs text-[rgba(226,232,240,0.4)] px-2">취소</button>
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
                        <span style={{ fontSize: 11, color: S.t3, background: 'rgba(255,255,255,0.1)', padding: '1px 7px', borderRadius: 99 }}>{groupItems.length}</span>
                        <div className="hidden md:flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                          {MATRIX_CATS.map(c => (
                            <button key={c} onClick={() => updateGroupCat(group.id, c)}
                              className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold transition-all ${group.category === c ? CAT_CLS[c] : 'bg-[rgba(255,255,255,0.04)] text-[rgba(226,232,240,0.4)] border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.2)]'}`}>{c}</button>
                          ))}
                        </div>
                        <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover/grow:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditingGroupId(group.id); setEditGName(group.name); setEditGColor(group.color) }} className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-1">수정</button>
                          {deletingGroup === group.id ? (
                            <>
                              <span className="text-[10px] text-[rgba(226,232,240,0.5)]">삭제?</span>
                              <button onClick={() => deleteGroup(group.id)} className="text-[10px] text-red-400 font-semibold px-1.5 py-0.5 rounded">삭제</button>
                              <button onClick={() => setDeletingGroup(null)} className="text-[10px] text-[rgba(226,232,240,0.4)] px-1.5 py-0.5 rounded">취소</button>
                            </>
                          ) : (
                            <button onClick={() => setDeletingGroup(group.id)} className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-red-400 px-1">삭제</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── 컬럼 헤더 ── */}
                  {isOpen && (
                    <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ flex: 1, minWidth: 180, padding: '8px 16px', fontSize: 11, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase' as const }}>안건</div>
                      <div style={{ width: 90, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase' as const, borderLeft: '1px solid rgba(255,255,255,0.07)' }}>상태</div>
                      <div style={{ width: 120, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase' as const, borderLeft: '1px solid rgba(255,255,255,0.07)' }}>담당자</div>
                      <div style={{ width: 80, padding: '8px 12px', borderLeft: '1px solid rgba(255,255,255,0.07)' }} />
                    </div>
                  )}

                  {/* ── 안건 목록 ── */}
                  {isOpen && visibleGroupItems.map(item => {
                    const itemSubTasks = subTasks.filter(st => st.agenda_item_id === item.id).sort((a, b) => a.sort_order - b.sort_order)
                    const isItemExpanded = expandedItems.has(item.id)
                    const activeColor = item.status === 'active' ? (CAT_BORDER[group.category ?? ''] ?? group.color) : STATUS_COLOR[item.status]
                    return (
                      <Fragment key={item.id}>
                        <div
                          className="group/irow flex hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                          style={{ borderBottom: isItemExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)', opacity: draggingItemId === item.id ? 0.35 : 1, borderTop: dragOverItemId === item.id ? '2px solid #3B82F6' : undefined, cursor: 'pointer' }}
                          onDragOver={e => {
                            if (!_dragItemId) return
                            e.preventDefault(); e.dataTransfer.dropEffect = 'move'
                            const di = items.find(i => i.id === _dragItemId)
                            if (di?.group_id === group.id) { setDragOverItemId(item.id); setDragOverGroupId(null) }
                            else { setDragOverGroupId(group.id); setDragOverItemId(null) }
                          }}
                          onDrop={e => {
                            e.preventDefault()
                            const dragId = _dragItemId; _dragItemId = null
                            if (dragId && dragId !== item.id) {
                              const di = items.find(i => i.id === dragId)
                              if (di) { if (di.group_id !== group.id) moveItemToGroup(dragId, group.id); else reorderItem(dragId, item.id) }
                            }
                            setDraggingItemId(null); setDragOverGroupId(null); setDragOverItemId(null)
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
                                  className="border border-[rgba(255,255,255,0.15)] rounded px-2 py-0.5 text-sm focus:outline-none focus:border-[rgba(255,255,255,0.3)] font-medium flex-1 min-w-0 bg-transparent"
                                  style={{ color: S.t1 }} />
                              ) : (
                                <span className="hover:text-blue-400 transition-colors cursor-pointer"
                                  style={{ fontSize: 14, fontWeight: 500, color: item.status === 'done' ? S.t3 : S.t1, textDecoration: item.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35 }}
                                  onClick={e => { e.stopPropagation(); router.push(`/project/items/${item.id}`) }}>
                                  {item.title}
                                </span>
                              )}
                              {itemSubTasks.length > 0 && (
                                <span style={{ fontSize: 10, color: S.t3, background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>
                                  {itemSubTasks.filter(st => st.status !== 'done').length}/{itemSubTasks.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ width: 90, padding: '16px 12px', fontSize: 12, color: S.t2, borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center' }}>
                            {STATUS_LABEL[item.status]}
                          </div>
                          <div style={{ width: 120, padding: '10px 12px', fontSize: 12, borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                            <select value={item.assignee_id ?? ''} onChange={e => updateItemAssignee(item.id, e.target.value || null)}
                              className="text-xs bg-transparent border-none outline-none cursor-pointer w-full"
                              style={{ color: item.assignee_id ? S.t2 : S.t3 }}>
                              <option value="">-</option>
                              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </div>
                          <div style={{ width: 80, padding: '16px 12px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 opacity-0 group-hover/irow:opacity-100 transition-all">
                              {editingItemId !== item.id && (
                                <button onClick={() => { setEditingItemId(item.id); setEditITitle(item.title) }} className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]">수정</button>
                              )}
                              {deletingItem === item.id ? (
                                <>
                                  <button onClick={() => deleteItem(item.id)} className="text-[10px] text-red-400 font-semibold">삭제</button>
                                  <button onClick={() => setDeletingItem(null)} className="text-[10px] text-[rgba(226,232,240,0.4)]">취소</button>
                                </>
                              ) : (
                                <button onClick={() => setDeletingItem(item.id)} className="text-[10px] text-[rgba(226,232,240,0.25)] hover:text-red-400">삭제</button>
                              )}
                            </div>
                          </div>
                        </div>

                        {isItemExpanded && itemSubTasks.map(st => (
                          <div key={st.id}
                            className="group/strow flex hover:bg-[rgba(59,130,246,0.04)] transition-colors"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.025)', opacity: draggingSTId === st.id ? 0.35 : 1, borderTop: dragOverSTId === st.id ? '2px solid #3B82F6' : undefined, cursor: 'pointer' }}
                            onDragOver={e => { if (!_dragSTId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSTId(st.id) }}
                            onDrop={e => { e.preventDefault(); const dragId = _dragSTId; _dragSTId = null; if (dragId && dragId !== st.id) reorderSubTask(dragId, st.id); setDraggingSTId(null); setDragOverSTId(null) }}
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
                                  style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${st.status === 'done' ? '#10B981' : st.status === 'hold' ? '#F59E0B' : (CAT_BORDER[group.category ?? ''] ?? group.color)}`, background: st.status === 'done' ? '#10B981' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                                  {st.status === 'done' && <span style={{ color: 'white', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                                  {st.status === 'hold' && <span style={{ color: '#F59E0B', fontSize: 9, lineHeight: 1 }}>−</span>}
                                </button>
                                {editingSTId === st.id ? (
                                  <input autoFocus value={editSTTitle} onChange={e => setEditSTTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateSubTask(st.id); if (e.key === 'Escape') setEditingSTId(null) }}
                                    className="border border-[rgba(255,255,255,0.15)] rounded px-2 py-0.5 text-xs focus:outline-none flex-1 min-w-0 bg-transparent"
                                    style={{ color: S.t2 }} onClick={e => e.stopPropagation()} />
                                ) : (
                                  <span style={{ fontSize: 13, color: st.status === 'done' ? S.t3 : S.t2, textDecoration: st.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35 }}>
                                    {st.title}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ width: 90, borderLeft: '1px solid rgba(255,255,255,0.04)' }} />
                            <div style={{ width: 120, borderLeft: '1px solid rgba(255,255,255,0.04)' }} />
                            <div style={{ width: 80, padding: '8px 12px', borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5">
                                {st.target_date && (
                                  <button onClick={() => updateSubTaskDate(st.id, null)}
                                    style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, fontWeight: 600, flexShrink: 0, border: 'none', cursor: 'pointer',
                                      background: st.target_date === sched.today ? 'rgba(220,38,38,0.18)' : st.target_date === sched.tomorrow ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)',
                                      color: st.target_date === sched.today ? '#FC8181' : st.target_date === sched.tomorrow ? '#FCD34D' : '#93C5FD' }}>
                                    {stDateLabel(st.target_date, sched.today, sched.tomorrow)} ×
                                  </button>
                                )}
                                {!st.target_date && (
                                  <div className="opacity-0 pointer-events-none group-hover/strow:opacity-100 group-hover/strow:pointer-events-auto transition-all flex items-center gap-0.5">
                                    <button onClick={() => updateSubTaskDate(st.id, sched.today)} className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(220,38,38,0.12)] text-red-400 border border-[rgba(220,38,38,0.2)] font-medium">오늘</button>
                                    <button onClick={() => updateSubTaskDate(st.id, sched.tomorrow)} className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(245,158,11,0.12)] text-amber-400 border border-[rgba(245,158,11,0.2)] font-medium">내일</button>
                                    <button onClick={() => updateSubTaskDate(st.id, sched.friday)} className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(59,130,246,0.12)] text-blue-400 border border-[rgba(59,130,246,0.2)] font-medium">금주</button>
                                    <label className="relative cursor-pointer text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.6)] text-[10px] px-0.5" title="특정일 선택">
                                      📅<input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onChange={e => e.target.value && updateSubTaskDate(st.id, e.target.value)} />
                                    </label>
                                  </div>
                                )}
                                <div className="opacity-0 group-hover/strow:opacity-100 transition-all flex items-center gap-1.5">
                                  {editingSTId !== st.id && (
                                    <button onClick={() => { setEditingSTId(st.id); setEditSTTitle(st.title) }} className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]">수정</button>
                                  )}
                                  {deletingST === st.id ? (
                                    <>
                                      <button onClick={() => deleteSubTask(st.id)} className="text-[10px] text-red-400 font-semibold">삭제</button>
                                      <button onClick={() => setDeletingST(null)} className="text-[10px] text-[rgba(226,232,240,0.4)]">취소</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setDeletingST(st.id)} className="text-[10px] text-[rgba(226,232,240,0.25)] hover:text-red-400">삭제</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        {isItemExpanded && (
                          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.025)' }}>
                            {addingSubTask === item.id ? (
                              <div className="flex items-center gap-2 px-10 py-2">
                                <input autoFocus value={newSTTitle} onChange={e => setNewSTTitle(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(item.id); if (e.key === 'Escape') { setAddingSubTask(null); setNewSTTitle('') } }}
                                  placeholder="하위 태스크 입력 후 Enter"
                                  className="flex-1 border border-[rgba(255,255,255,0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-transparent text-[#E2E8F0]" />
                                <button onClick={() => addSubTask(item.id)} className="text-xs bg-[rgba(27,58,107,0.3)] text-[#93C5FD] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                                <button onClick={() => { setAddingSubTask(null); setNewSTTitle('') }} className="text-xs text-[rgba(226,232,240,0.4)] px-2">취소</button>
                              </div>
                            ) : (
                              <div onClick={() => setAddingSubTask(item.id)}
                                className="flex items-center gap-1 px-10 py-3 text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.6)] hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors">
                                ＋ 하위 태스크
                              </div>
                            )}
                          </div>
                        )}
                      </Fragment>
                    )
                  })}

                  {isOpen && doneGroupItems.length > 0 && (
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <button onClick={() => toggleShowDone(group.id)}
                        className="w-full flex items-center gap-1.5 px-5 py-2 text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.55)] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
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
                            className="flex-1 border border-[rgba(255,255,255,0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-transparent text-[#E2E8F0]" />
                          <button onClick={() => addItem(group.id)} className="text-xs bg-[rgba(27,58,107,0.3)] text-[#93C5FD] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                          <button onClick={() => { setAddingItem(null); setNewITitle('') }} className="text-xs text-[rgba(226,232,240,0.4)] px-2 py-1">취소</button>
                        </div>
                      ) : (
                        <div onClick={() => { setAddingItem(group.id); setNewITitle('') }}
                          className="flex items-center gap-1 px-5 py-3 text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.6)] hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors">
                          ＋ {group.name}에 안건 추가
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] overflow-hidden">
              {addingGroup ? (
                <div className="flex items-center gap-2 px-5 py-3 flex-wrap">
                  <input autoFocus value={newGName} onChange={e => setNewGName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGName('') } }}
                    placeholder="범주명 입력 후 Enter"
                    className="border border-[rgba(255,255,255,0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none w-40 bg-transparent text-[#E2E8F0]" />
                  {isAll && (
                    <div className="flex gap-1">
                      {MATRIX_CATS.map(c => (
                        <button key={c} type="button" onClick={() => setNewGCat(c)}
                          className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${newGCat === c ? CAT_CLS[c] : 'bg-[rgba(255,255,255,0.04)] text-[rgba(226,232,240,0.4)] border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.2)]'}`}>{c}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    {GROUP_COLORS.map(c => <div key={c} onClick={() => setNewGColor(c)} style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: newGColor === c ? '2px solid #E2E8F0' : '2px solid transparent', flexShrink: 0 }} />)}
                  </div>
                  <button onClick={addGroup} className="text-xs bg-[rgba(27,58,107,0.3)] text-[#93C5FD] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                  <button onClick={() => { setAddingGroup(false); setNewGName('') }} className="text-xs text-[rgba(226,232,240,0.4)] px-2 py-1">취소</button>
                </div>
              ) : (
                <div onClick={openAddGroup}
                  className="flex items-center gap-1 px-5 py-3 text-xs text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.6)] hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors">
                  ＋ 범주 추가
                </div>
              )}
            </div>

          </div>
        </div>
      </>
    )
  }

  // ── 연간 로드맵 모드 ────────────────────────────────────────────
  if (viewMode === 'roadmap') {
    const yearStr = String(yearNav)

    // ── period 설정 ──
    const RD_PERIODS = [
      { key: 'H1',   label: '상반기', color: '#6366F1', months: [0,1,2,3,4,5]           },
      { key: 'Q1',   label: 'Q1',    color: '#3B82F6', months: [0,1,2]                  },
      { key: 'Q2',   label: 'Q2',    color: '#F59E0B', months: [3,4,5]                  },
      { key: 'H2',   label: '하반기', color: '#EC4899', months: [6,7,8,9,10,11]          },
      { key: 'Q3',   label: 'Q3',    color: '#10B981', months: [6,7,8]                  },
      { key: 'Q4',   label: 'Q4',    color: '#EF4444', months: [9,10,11]                },
      { key: 'full', label: '연간',  color: '#8B5CF6', months: [0,1,2,3,4,5,6,7,8,9,10,11] },
    ] as const
    type RdPeriodKey = typeof RD_PERIODS[number]['key']
    const RD_MAP = Object.fromEntries(RD_PERIODS.map(p => [p.key, p])) as Record<RdPeriodKey, typeof RD_PERIODS[number]>

    // "2026-Q1" or "2026-3-11" 형식 파싱
    type ParsedPd = { year: number; key: string; label: string; color: string; months: number[] }
    const parsePd = (val: string | null | undefined): ParsedPd | null => {
      if (!val) return null
      const di = val.indexOf('-')
      if (di < 0) return null
      const yr = Number(val.slice(0, di))
      if (isNaN(yr)) return null
      const rest = val.slice(di + 1)
      // 커스텀 월 범위: "3-11"
      const cm = rest.match(/^(\d{1,2})-(\d{1,2})$/)
      if (cm) {
        const sm = Number(cm[1]) - 1, em = Number(cm[2]) - 1
        const months = Array.from({ length: em - sm + 1 }, (_, i) => sm + i)
        return { year: yr, key: rest, label: `${cm[1]}-${cm[2]}월`, color: '#8B5CF6', months }
      }
      // 표준 키: Q1, H1 등
      const info = RD_MAP[rest as RdPeriodKey]
      if (info) return { year: yr, key: rest, label: info.label, color: info.color, months: info.months as unknown as number[] }
      return null
    }
    const pdBadgeLabel = (val: string | null | undefined): string => {
      const p = parsePd(val)
      if (!p) return '+'
      return p.year === yearNav ? p.label : `${String(p.year).slice(2)}·${p.label}`
    }
    const openPeriodPicker = (e: React.MouseEvent, item: AgendaItem) => {
      e.stopPropagation()
      setPeriodPickerGroupId(null)
      if (periodPickerItemId === item.id) { setPeriodPickerItemId(null); setPeriodPickerPos(null); return }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const p = parsePd(item.roadmap_period)
      setPeriodPickerYear(p?.year ?? yearNav)
      if (p) {
        setPeriodPickerStartM((p.months[0] ?? 0) + 1)
        setPeriodPickerEndM((p.months[p.months.length - 1] ?? 11) + 1)
      }
      setPeriodPickerItemId(item.id)
      setPeriodPickerPos({ x: rect.left, y: rect.bottom + 4 })
    }
    const openGroupPeriodPicker = (e: React.MouseEvent, group: AgendaGroup) => {
      e.stopPropagation()
      setPeriodPickerItemId(null)
      if (periodPickerGroupId === group.id) { setPeriodPickerGroupId(null); setPeriodPickerPos(null); return }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const p = parsePd(group.roadmap_period)
      setPeriodPickerYear(p?.year ?? yearNav)
      if (p) {
        setPeriodPickerStartM((p.months[0] ?? 0) + 1)
        setPeriodPickerEndM((p.months[p.months.length - 1] ?? 11) + 1)
      }
      setPeriodPickerGroupId(group.id)
      setPeriodPickerPos({ x: rect.left, y: rect.bottom + 4 })
    }

    const getItemGroupColor = (item: AgendaItem) => {
      const g = groups.find(gr => gr.id === item.group_id)
      return CAT_BORDER[g?.category ?? ''] ?? g?.color ?? '#1B3A6B'
    }

    // ── 공통: 테이블 헤더 ──
    const rdHeader = (
      <thead>
        <tr>
          <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 6, background: S.bg, borderBottom: S.bd, borderRight: S.bdL, width: W_LEFT, minWidth: W_LEFT }} />
          {(['Q1','Q2','Q3','Q4'] as const).map((q, qi) => (
            <th key={q} colSpan={3} style={{ position: 'sticky', top: 0, zIndex: 4, background: ['rgba(59,130,246,0.06)','rgba(245,158,11,0.06)','rgba(16,185,129,0.06)','rgba(239,68,68,0.06)'][qi], borderBottom: S.bd, borderLeft: S.bdL, textAlign: 'center', fontSize: 10, fontWeight: 700, color: ['#3B82F6','#F59E0B','#10B981','#EF4444'][qi], letterSpacing: '.06em', padding: '5px 0' }}>{q}</th>
          ))}
        </tr>
        <tr>
          <th style={{ position: 'sticky', left: 0, top: 26, zIndex: 5, background: S.bg, borderBottom: S.bdL, borderRight: S.bdL, width: W_LEFT, minWidth: W_LEFT, padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: S.t3, letterSpacing: '.05em' }}>안건</th>
          {yearMonths.map((ym, mi) => {
            const isCur = ym === curYM
            const qBg = ['rgba(59,130,246,0.03)','rgba(245,158,11,0.03)','rgba(16,185,129,0.03)','rgba(239,68,68,0.03)'][Math.floor(mi/3)]
            return (
              <th key={ym} style={{ position: 'sticky', top: 26, zIndex: 3, background: isCur ? 'rgba(59,130,246,0.12)' : qBg, borderBottom: isCur ? `2px solid ${catColor}` : S.bdL, borderLeft: mi%3===0 ? S.bdL : S.bd, width: W_ROAD, minWidth: W_ROAD, padding: '6px 4px', textAlign: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: isCur ? 700 : 500, color: isCur ? catColor : S.t2 }}>{MONTH_KO[mi]}</span>
              </th>
            )
          })}
        </tr>
      </thead>
    )

    // ── 공통: Period picker (fixed, 테이블 stacking 밖) ──────────────
    const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
    const rdPicker = (() => {
      if (!periodPickerItemId || !periodPickerPos) return null
      const item = items.find(i => i.id === periodPickerItemId)
      if (!item) return null
      const cur = parsePd(item.roadmap_period)
      return (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: periodPickerPos.y, left: periodPickerPos.x, zIndex: 9999, background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', width: 196 }}>
          {/* ── 연도 화살표 ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={() => setPeriodPickerYear(p => p - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B7280', padding: '0 4px', lineHeight: 1 }}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1B3A6B' }}>{periodPickerYear}년</span>
            <button onClick={() => setPeriodPickerYear(p => p + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B7280', padding: '0 4px', lineHeight: 1 }}>›</button>
          </div>
          {/* ── 분기/반기 단축키 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 8 }}>
            {RD_PERIODS.map(p => {
              const isActive = cur?.year === periodPickerYear && cur?.key === p.key
              return (
                <button key={p.key} onClick={() => updateRoadmapPeriod(item.id, periodPickerYear, p.key)}
                  style={{ fontSize: 10, fontWeight: 700, padding: '4px 0', borderRadius: 5, cursor: 'pointer',
                    color: isActive ? 'white' : p.color,
                    background: isActive ? p.color : hexToRgba(p.color, 0.08),
                    border: `1px solid ${hexToRgba(p.color, 0.3)}` }}>
                  {p.label}
                </button>
              )
            })}
          </div>
          {/* ── 직접 월 입력 ── */}
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: '.05em', marginBottom: 5 }}>직접 입력</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <select value={periodPickerStartM} onChange={e => setPeriodPickerStartM(Number(e.target.value))}
                style={{ flex: 1, fontSize: 11, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 2px', cursor: 'pointer', background: 'white', color: '#374151' }}>
                {MONTHS_KO.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>~</span>
              <select value={periodPickerEndM} onChange={e => setPeriodPickerEndM(Number(e.target.value))}
                style={{ flex: 1, fontSize: 11, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 2px', cursor: 'pointer', background: 'white', color: '#374151' }}>
                {MONTHS_KO.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <button onClick={() => updateRoadmapPeriod(item.id, periodPickerYear, `${periodPickerStartM}-${periodPickerEndM}`)}
                style={{ fontSize: 10, fontWeight: 700, color: 'white', background: '#1B3A6B', border: 'none', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', flexShrink: 0 }}>적용</button>
            </div>
          </div>
          {/* ── 없음 ── */}
          <button onClick={() => updateRoadmapPeriod(item.id, null, null)}
            style={{ width: '100%', fontSize: 10, color: '#9CA3AF', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, padding: '3px 0', cursor: 'pointer', marginTop: 6 }}>없음</button>
        </div>
      )
    })()

    // ── 범주 period picker ──────────────────────────────────────────
    const rdGroupPicker = (() => {
      if (!periodPickerGroupId || !periodPickerPos) return null
      const group = groups.find(g => g.id === periodPickerGroupId)
      if (!group) return null
      const cur = parsePd(group.roadmap_period)
      return (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: periodPickerPos.y, left: periodPickerPos.x, zIndex: 9999, background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', width: 196 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '.05em', marginBottom: 8 }}>범주 기간</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={() => setPeriodPickerYear(p => p - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B7280', padding: '0 4px', lineHeight: 1 }}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1B3A6B' }}>{periodPickerYear}년</span>
            <button onClick={() => setPeriodPickerYear(p => p + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B7280', padding: '0 4px', lineHeight: 1 }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 8 }}>
            {RD_PERIODS.map(p => {
              const isActive = cur?.year === periodPickerYear && cur?.key === p.key
              return (
                <button key={p.key} onClick={() => updateGroupRoadmapPeriod(group.id, periodPickerYear, p.key)}
                  style={{ fontSize: 10, fontWeight: 700, padding: '4px 0', borderRadius: 5, cursor: 'pointer',
                    color: isActive ? 'white' : p.color,
                    background: isActive ? p.color : hexToRgba(p.color, 0.08),
                    border: `1px solid ${hexToRgba(p.color, 0.3)}` }}>
                  {p.label}
                </button>
              )
            })}
          </div>
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: '.05em', marginBottom: 5 }}>직접 입력</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <select value={periodPickerStartM} onChange={e => setPeriodPickerStartM(Number(e.target.value))}
                style={{ flex: 1, fontSize: 11, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 2px', cursor: 'pointer', background: 'white', color: '#374151' }}>
                {['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>~</span>
              <select value={periodPickerEndM} onChange={e => setPeriodPickerEndM(Number(e.target.value))}
                style={{ flex: 1, fontSize: 11, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 2px', cursor: 'pointer', background: 'white', color: '#374151' }}>
                {['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <button onClick={() => updateGroupRoadmapPeriod(group.id, periodPickerYear, `${periodPickerStartM}-${periodPickerEndM}`)}
                style={{ fontSize: 10, fontWeight: 700, color: 'white', background: '#1B3A6B', border: 'none', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', flexShrink: 0 }}>적용</button>
            </div>
          </div>
          <button onClick={() => updateGroupRoadmapPeriod(group.id, null, null)}
            style={{ width: '100%', fontSize: 10, color: '#9CA3AF', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, padding: '3px 0', cursor: 'pointer', marginTop: 6 }}>없음</button>
        </div>
      )
    })()

    // ── 공통: 안건 한 행 렌더 ──
    const rdItemRow = (item: AgendaItem, gColor: string) => {
      const itemSTs  = subTasks.filter(st => st.agenda_item_id === item.id && st.target_date?.startsWith(yearStr))
      const stMonths = itemSTs.map(st => st.target_date!.slice(0,7)).sort()
      const minM = stMonths[0] ?? null
      const maxM = stMonths[stMonths.length-1] ?? null
      const countByM: Record<string,number> = {}
      stMonths.forEach(m => { countByM[m] = (countByM[m]||0)+1 })
      const isDone  = item.status === 'done'
      const period  = item.roadmap_period ?? null
      const pd      = parsePd(period)
      const pInfo   = pd?.year === yearNav ? pd : null
      const isRdOver   = rdDragOverId === item.id
      const isRdDragging = rdDraggingId === item.id

      return (
        <tr key={item.id}
          draggable
          onDragStart={e => { e.stopPropagation(); _rdDragItemId = item.id; e.dataTransfer.effectAllowed='move'; setRdDraggingId(item.id) }}
          onDragEnd={() => { _rdDragItemId = null; setRdDraggingId(null); setRdDragOverId(null) }}
          onDragOver={e => { if (!_rdDragItemId || _rdDragItemId === item.id) return; e.preventDefault(); e.stopPropagation(); setRdDragOverId(item.id) }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); if (_rdDragItemId && _rdDragItemId !== item.id) reorderRoadmapItem(_rdDragItemId, item.id); _rdDragItemId = null; setRdDraggingId(null); setRdDragOverId(null) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRdDragOverId(null) }}
          style={{ borderBottom: isRdOver ? `2px solid ${gColor}` : S.bd, opacity: isDone ? 0.4 : isRdDragging ? 0.5 : 1, background: isRdOver ? hexToRgba(gColor, 0.05) : S.bg }}
          className="group/rditem hover:bg-[rgba(255,255,255,0.04)]"
        >
          <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'inherit', borderRight: S.bdL, padding: '8px 12px' }}>
            <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
              {/* 드래그 핸들 */}
              <span className="opacity-0 group-hover/rditem:opacity-100 transition-opacity flex-shrink-0 cursor-grab text-gray-300 text-xs select-none" style={{ fontSize: 13 }}>⠿</span>
              {/* period 뱃지 (드롭다운은 fixed로 별도 렌더) */}
              <button onClick={e => openPeriodPicker(e, item)}
                style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, cursor: 'pointer', lineHeight: 1.6, minWidth: 24, textAlign: 'center', flexShrink: 0, transition: 'all 0.1s',
                  color: pd ? pd.color : '#9CA3AF',
                  background: pd ? hexToRgba(pd.color, 0.1) : 'transparent',
                  border: pd ? `1px solid ${hexToRgba(pd.color, 0.35)}` : '1px dashed rgba(255,255,255,0.2)' }}>
                {pdBadgeLabel(period)}
              </button>
              {/* 범주 도트 + 제목 */}
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: gColor, flexShrink: 0, display: 'inline-block' }} />
              <span onClick={() => router.push(`/project/items/${item.id}`)} style={{ fontSize: 13, fontWeight: 500, color: isDone ? S.t3 : S.t1, textDecoration: isDone ? 'line-through' : 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{item.title}</span>
              {itemSTs.length > 0 && <span style={{ fontSize: 10, color: S.t3, flexShrink: 0 }}>· {itemSTs.length}</span>}
            </div>
          </td>
          {yearMonths.map((ym, mi) => {
            const inRange = minM && maxM && ym >= minM && ym <= maxM
            const isFirst = ym === minM, isLast = ym === maxM, isSingle = minM === maxM
            const cnt = countByM[ym] ?? 0
            const isCurM = ym === curYM
            const inPeriod = pInfo ? (pInfo.months as unknown as number[]).includes(mi) : false
            return (
              <td key={ym} style={{ borderLeft: mi%3===0 ? S.bdL : S.bd, padding: '2px 1px', verticalAlign: 'middle', position: 'relative',
                background: inPeriod ? hexToRgba(pInfo!.color, 0.07) : isCurM ? hexToRgba(catColor, 0.04) : 'transparent' }}>
                {inRange && <div style={{ height: 6, background: gColor, opacity: 0.5, borderRadius: isSingle ? 4 : isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : 0, marginBottom: cnt > 0 ? 1 : 0 }} />}
                {cnt > 0 && <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: gColor, opacity: 0.85, lineHeight: 1 }}>{cnt}</div>}
              </td>
            )
          })}
        </tr>
      )
    }

    // ── 전체 탭: period 섹션별 그룹핑 ──────────────────────────────
    if (isAll) {
      // 전체 로드맵: 범주 → 안건 → 세부task 3단계 계층, 목록탭 순서 동일
      return (
        <>
          {viewToggle}
          <div className="flex-1 min-h-0 overflow-auto" onClick={() => setPeriodPickerItemId(null)}>
            <table style={{ borderCollapse: 'collapse', minWidth: W_LEFT + 12 * W_ROAD }}>
              {rdHeader}
              <tbody>
                {[...groups].sort((a,b) => a.sort_order - b.sort_order).map(group => {
                  const groupItems = items.filter(i => i.group_id === group.id).sort((a,b) => a.sort_order - b.sort_order)
                  const doneGroupItems = groupItems.filter(i => i.status === 'done')
                  const visibleItems = showDoneGroups.has(group.id) ? groupItems : groupItems.filter(i => i.status !== 'done')
                  const isGOpen = openGroups.has(group.id)
                  const gColor = CAT_BORDER[group.category ?? ''] ?? group.color
                  // 같은 범주 내 순서에 따라 배경 밝기 교차
                  const sameCatGroups = [...groups].filter(g => g.category === group.category).sort((a,b) => a.sort_order - b.sort_order)
                  const groupIdxInCat = sameCatGroups.findIndex(g => g.id === group.id)
                  const gBgAlpha = groupIdxInCat % 2 === 0 ? 0.10 : 0.04
                  const gBg = CAT_BORDER[group.category ?? '']
                    ? hexToRgba(CAT_BORDER[group.category ?? ''], gBgAlpha)
                    : hexToRgba(group.color, gBgAlpha)
                  // 범주 기간 바: 수동 설정된 기간 우선, 없으면 세부task 날짜 범위
                  const groupPd = parsePd(group.roadmap_period)
                  const groupPdInfo = groupPd?.year === yearNav ? groupPd : null
                  const groupSTMs = subTasks
                    .filter(st => groupItems.some(i => i.id === st.agenda_item_id) && st.target_date?.startsWith(yearStr))
                    .map(st => st.target_date!.slice(0,7)).sort()
                  const gMinM = groupPdInfo
                    ? `${yearNav}-${String(groupPdInfo.months[0]+1).padStart(2,'0')}`
                    : (groupSTMs[0] ?? null)
                  const gMaxM = groupPdInfo
                    ? `${yearNav}-${String(groupPdInfo.months[groupPdInfo.months.length-1]+1).padStart(2,'0')}`
                    : (groupSTMs[groupSTMs.length-1] ?? null)
                  const gBarColor = groupPdInfo ? groupPdInfo.color : gColor
                  const gPdLabel = group.roadmap_period ? pdBadgeLabel(group.roadmap_period) : '+'

                  return (
                    <Fragment key={group.id}>
                      {/* ── 범주 헤더 ── */}
                      <tr style={{ background: gBg, cursor: 'pointer' }} onClick={() => { setPeriodPickerGroupId(null); setPeriodPickerItemId(null); setPeriodPickerPos(null); toggleGroup(group.id) }}>
                        <td style={{ position: 'sticky', left: 0, zIndex: 2, background: gBg, borderBottom: S.bd, borderRight: S.bdL, borderLeft: `3px solid ${gColor}`, padding: '8px 14px' }}>
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 8, transform: isGOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', color: gColor }}>▶</span>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: gColor }}>{group.name}</span>
                            {group.category && <span style={{ fontSize: 9, color: gColor, opacity: 0.7, background: hexToRgba(gColor, 0.1), padding: '1px 5px', borderRadius: 4 }}>{group.category}</span>}
                            <span style={{ fontSize: 10, color: S.t3, background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 99 }}>{visibleItems.length}</span>
                            {/* 범주 기간 뱃지 */}
                            <button onClick={e => openGroupPeriodPicker(e, group)}
                              style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, cursor: 'pointer', lineHeight: 1.6, flexShrink: 0, transition: 'all 0.1s', marginLeft: 'auto',
                                color: groupPdInfo ? groupPdInfo.color : '#9CA3AF',
                                background: groupPdInfo ? hexToRgba(groupPdInfo.color, 0.1) : 'transparent',
                                border: groupPdInfo ? `1px solid ${hexToRgba(groupPdInfo.color, 0.35)}` : '1px dashed rgba(255,255,255,0.2)' }}>
                              {gPdLabel}
                            </button>
                          </div>
                        </td>
                        {yearMonths.map((ym, mi) => {
                          const inRange = gMinM && gMaxM && ym >= gMinM && ym <= gMaxM
                          const isFirst = ym === gMinM, isLast = ym === gMaxM, isSingle = gMinM === gMaxM
                          return (
                            <td key={ym} style={{ borderLeft: mi%3===0 ? S.bdL : S.bd, borderBottom: S.bd, background: gBg, padding: '0 1px', verticalAlign: 'middle' }}>
                              {inRange && <div style={{ height: 4, background: gBarColor, opacity: groupPdInfo ? 0.45 : 0.25, borderRadius: isSingle ? 3 : isFirst ? '3px 0 0 3px' : isLast ? '0 3px 3px 0' : 0 }} />}
                            </td>
                          )
                        })}
                      </tr>

                      {/* ── 안건 + 세부task ── */}
                      {isGOpen && visibleItems.map(item => {
                        const isItemOpen = expandedItems.has(item.id)
                        const itemSTs = subTasks.filter(st => st.agenda_item_id === item.id && st.target_date?.startsWith(yearStr))
                        const stMonths = itemSTs.map(st => st.target_date!.slice(0,7)).sort()
                        const minM = stMonths[0] ?? null
                        const maxM = stMonths[stMonths.length-1] ?? null
                        const countByM: Record<string,number> = {}
                        stMonths.forEach(m => { countByM[m] = (countByM[m]||0)+1 })
                        const isDone = item.status === 'done'
                        const period = item.roadmap_period ?? null
                        const pd     = parsePd(period)
                        const pInfo  = pd?.year === yearNav ? pd : null
                        const allItemSTs = subTasks.filter(st => st.agenda_item_id === item.id)

                        return (
                          <Fragment key={item.id}>
                            {/* 안건 행 */}
                            <tr style={{ borderBottom: S.bd, opacity: isDone ? 0.4 : 1, background: S.bg }} className="group/rditem hover:bg-[rgba(255,255,255,0.04)]">
                              <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'inherit', borderRight: S.bdL, padding: '8px 12px 8px 20px' }}>
                                <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                                  {/* 안건 토글 (세부task 펼치기) */}
                                  <button onClick={e => { e.stopPropagation(); toggleExpandedItem(item.id) }}
                                    style={{ fontSize: 7, color: gColor, transform: isItemOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: allItemSTs.length > 0 ? 1 : 0.2 }}>▶</button>
                                  {/* period 뱃지 (드롭다운은 fixed로 별도 렌더) */}
                                  <button onClick={e => openPeriodPicker(e, item)}
                                    style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, cursor: 'pointer', lineHeight: 1.6, minWidth: 24, textAlign: 'center', flexShrink: 0, transition: 'all 0.1s',
                                      color: pd ? pd.color : '#9CA3AF',
                                      background: pd ? hexToRgba(pd.color, 0.1) : 'transparent',
                                      border: pd ? `1px solid ${hexToRgba(pd.color, 0.35)}` : '1px dashed rgba(255,255,255,0.2)' }}>
                                    {pdBadgeLabel(period)}
                                  </button>
                                  {/* 상태 도트 + 제목 */}
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: isDone ? '#10B981' : item.status === 'hold' ? '#F59E0B' : gColor, flexShrink: 0, display: 'inline-block' }} />
                                  <span onClick={() => router.push(`/project/items/${item.id}`)} style={{ fontSize: 13, fontWeight: 500, color: isDone ? S.t3 : S.t1, textDecoration: isDone ? 'line-through' : 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{item.title}</span>
                                  {allItemSTs.length > 0 && <span style={{ fontSize: 10, color: S.t3, flexShrink: 0 }}>· {allItemSTs.length}</span>}
                                </div>
                              </td>
                              {yearMonths.map((ym, mi) => {
                                const inRange = minM && maxM && ym >= minM && ym <= maxM
                                const isFirst = ym === minM, isLast = ym === maxM, isSingle = minM === maxM
                                const cnt = countByM[ym] ?? 0
                                const inPeriod = pInfo ? (pInfo.months as unknown as number[]).includes(mi) : false
                                return (
                                  <td key={ym} style={{ borderLeft: mi%3===0 ? S.bdL : S.bd, padding: '2px 1px', verticalAlign: 'middle', position: 'relative',
                                    background: inPeriod ? hexToRgba(pInfo!.color, 0.07) : ym===curYM ? hexToRgba(catColor, 0.04) : 'transparent' }}>
                                    {inRange && <div style={{ height: 6, background: gColor, opacity: 0.5, borderRadius: isSingle ? 4 : isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : 0, marginBottom: cnt > 0 ? 1 : 0 }} />}
                                    {cnt > 0 && <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: gColor, opacity: 0.85, lineHeight: 1 }}>{cnt}</div>}
                                  </td>
                                )
                              })}
                            </tr>

                            {/* 세부task 행 */}
                            {isItemOpen && subTasks.filter(st => st.agenda_item_id === item.id).sort((a,b) => a.sort_order - b.sort_order).map(st => {
                              const stYM = st.target_date?.startsWith(yearStr) ? st.target_date.slice(0,7) : null
                              return (
                                <tr key={st.id} style={{ borderBottom: S.bd, background: 'rgba(255,255,255,0.025)' }} className="hover:bg-[rgba(59,130,246,0.04)]">
                                  <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'rgba(255,255,255,0.025)', borderRight: S.bdL, padding: '5px 12px 5px 44px' }}>
                                    <div className="flex items-center gap-2">
                                      <button onClick={e => { e.stopPropagation(); cycleSubTaskStatus(st) }}
                                        style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${st.status === 'done' ? '#10B981' : st.status === 'hold' ? '#F59E0B' : hexToRgba(gColor, 0.7)}`, background: st.status === 'done' ? '#10B981' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {st.status === 'done' && <span style={{ color: 'white', fontSize: 8, lineHeight: 1 }}>✓</span>}
                                      </button>
                                      <span onClick={() => router.push(`/project/items/${item.id}?focus=${st.id}`)} style={{ fontSize: 12, color: st.status === 'done' ? S.t3 : S.t2, textDecoration: st.status === 'done' ? 'line-through' : 'none', cursor: 'pointer' }}>{st.title}</span>
                                      {st.target_date && <span style={{ fontSize: 9, color: S.t3 }}>{stDateLabel(st.target_date, sched.today, sched.tomorrow)}</span>}
                                    </div>
                                  </td>
                                  {yearMonths.map((ym, mi) => (
                                    <td key={ym} style={{ borderLeft: mi%3===0 ? S.bdL : S.bd, verticalAlign: 'middle', textAlign: 'center', padding: 0,
                                      background: ym===curYM ? hexToRgba(catColor, 0.04) : 'transparent' }}>
                                      {stYM === ym && <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.status === 'done' ? '#10B981' : st.status === 'hold' ? '#F59E0B' : gColor, margin: '0 auto', opacity: 0.85 }} />}
                                    </td>
                                  ))}
                                </tr>
                              )
                            })}
                          </Fragment>
                        )
                      })}

                      {/* 완료 안건 토글 */}
                      {isGOpen && doneGroupItems.length > 0 && (
                        <tr style={{ borderBottom: S.bd }}>
                          <td colSpan={13} style={{ padding: 0 }}>
                            <button onClick={e => { e.stopPropagation(); toggleShowDone(group.id) }}
                              style={{ position: 'sticky', left: 0, width: 'max-content' }}
                              className="flex items-center gap-1.5 px-5 py-2 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.6)] transition-colors">
                              <span style={{ fontSize: 8, transform: showDoneGroups.has(group.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                              완료 {doneGroupItems.length}건
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rdPicker}
          {rdGroupPicker}
        </>
      )
    }

    // ── 카테고리 탭: 범주별 그룹핑 + period 뱃지 ──────────────────
    return (
      <>
        {viewToggle}
        <div className="flex-1 min-h-0 overflow-auto" onClick={() => setPeriodPickerItemId(null)}>
          <table style={{ borderCollapse: 'collapse', minWidth: W_LEFT + 12 * W_ROAD }}>
            {rdHeader}
            <tbody>
              {[...groups].sort((a,b) => a.sort_order-b.sort_order).map(group => {
                const groupItems = items.filter(i => i.group_id === group.id).sort((a,b) => a.sort_order-b.sort_order)
                const doneGroupItems = groupItems.filter(i => i.status === 'done')
                const visibleItems = showDoneGroups.has(group.id) ? groupItems : groupItems.filter(i => i.status !== 'done')
                const isOpen = openGroups.has(group.id)
                const gColor = CAT_BORDER[group.category ?? ''] ?? group.color
                const gBg = CAT_BG[group.category ?? ''] ?? hexToRgba(group.color, 0.07)
                return (
                  <Fragment key={group.id}>
                    <tr>
                      <td onClick={() => toggleGroup(group.id)} style={{ position: 'sticky', left: 0, zIndex: 2, background: gBg, borderBottom: S.bd, borderRight: S.bdL, padding: '7px 16px', cursor: 'pointer' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 8, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s', color: gColor }}>▶</span>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: gColor }}>{group.name}</span>
                        </div>
                      </td>
                      {yearMonths.map((ym, mi) => (
                        <td key={ym} style={{ borderLeft: mi%3===0 ? S.bdL : S.bd, borderBottom: S.bd, background: ym===curYM ? hexToRgba(catColor,0.04) : gBg }} />
                      ))}
                    </tr>
                    {isOpen && visibleItems.map(item => rdItemRow(item, gColor))}
                    {isOpen && doneGroupItems.length > 0 && (
                      <tr style={{ borderBottom: S.bd }}>
                        <td colSpan={13} style={{ padding: 0 }}>
                          <button onClick={() => toggleShowDone(group.id)}
                            style={{ position: 'sticky', left: 0, width: 'max-content' }}
                            className="flex items-center gap-1.5 px-5 py-2 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.6)] transition-colors">
                            <span style={{ fontSize: 8, transform: showDoneGroups.has(group.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                            완료 {doneGroupItems.length}건
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {rdPicker}
        {rdGroupPicker}
      </>
    )
  }

  return null
}
