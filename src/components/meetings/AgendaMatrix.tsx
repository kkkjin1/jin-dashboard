'use client'

import { useEffect, useState, useRef, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaGroup, AgendaItem, AgendaUpdate, AgendaSubTask } from '@/types'

// ── 상수 ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = { active: '#3B82F6', hold: '#9CA3AF', done: '#10B981' }
const STATUS_LABEL: Record<string, string> = { active: '진행', hold: '보류', done: '완료' }
const GROUP_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#9CA3AF']
const MATRIX_CATS = ['코어', '비즈', '개인']
const CAT_CLS: Record<string, string> = {
  '코어':  'bg-blue-50 text-blue-700 border-blue-200',
  '비즈':  'bg-amber-50 text-amber-700 border-amber-200',
  '개인':  'bg-emerald-50 text-emerald-700 border-emerald-200',
}
const CAT_BG: Record<string, string>     = { '코어': 'rgba(59,130,246,0.09)',  '비즈': 'rgba(245,158,11,0.09)',  '개인': 'rgba(16,185,129,0.09)' }
const CAT_BORDER: Record<string, string> = { '코어': '#3B82F6',                '비즈': '#F59E0B',                '개인': '#10B981' }
const CAT_DOT: Record<string, string>    = { '코어': '#3B82F6',                '비즈': '#F59E0B',                '개인': '#10B981' }

const W_LEFT = 220   // 안건열 너비 (달력 모드)
const W_CAL  = 52    // 날짜 열 너비 (달력 모드)

interface MeetingCol { id: string; title: string; meeting_date: string | null }

function formatDate(d: string | null) {
  if (!d) return '날짜 미지정'
  const dt = new Date(d + 'T00:00:00')
  const days = ['일','월','화','수','목','금','토']
  return `${dt.getMonth()+1}/${dt.getDate()} (${days[dt.getDay()]})`
}
function formatDateShort(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getMonth()+1}/${dt.getDate()}`
}
function formatDayLabel(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  const days = ['일','월','화','수','목','금','토']
  return days[dt.getDay()]
}
function nk(itemId: string, meetingId: string) { return `${itemId}_${meetingId}` }
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const S = {
  bd:    '1px solid #E5E9F0',
  bdL:   '1px solid #BDD0EA',
  bg:    '#fff',
  bgRow: '#F7F9FC',
  t1:    '#1A2233',
  t2:    '#4A5A72',
  t3:    '#8FA0B5',
}

// ── 회의 팝업 ────────────────────────────────────────────────────────
interface MeetingPopupProps {
  meeting: MeetingCol
  items: AgendaItem[]
  groups: AgendaGroup[]
  notes: Record<string, string>
  onNote: (itemId: string, meetingId: string, value: string) => void
  onClose: () => void
  onOpenMeeting: (meetingId: string) => void
  catColor: string
  category: string
}

function MeetingPopup({ meeting, items, groups, notes, onNote, onClose, onOpenMeeting, catColor, category }: MeetingPopupProps) {
  const byGroup = groups
    .map(g => ({ group: g, items: items.filter(i => i.group_id === g.id) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,.28)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
        style={{ width: '82vw', maxWidth: 940, height: '76vh', maxHeight: 720 }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ borderLeft: `4px solid ${catColor}` }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
              {category} 회의록
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: S.t1 }}>{formatDate(meeting.meeting_date)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onOpenMeeting(meeting.id)}
              className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors font-medium">
              회의록 상세 →
            </button>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-100 text-lg leading-none transition-colors ml-1">
              ×
            </button>
          </div>
        </div>

        {/* 안건 + 진전내용 테이블 */}
        <div className="flex-1 overflow-y-auto">
          {byGroup.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: S.t3 }}>
              안건이 없습니다. 전체 탭에서 안건을 먼저 추가해주세요.
            </div>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: S.bd }}>
                  <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2, padding: '8px 20px', fontSize: 11, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left', width: 220, borderBottom: S.bd }}>안건</th>
                  <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2, padding: '8px 20px', fontSize: 11, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left', borderLeft: S.bd, borderBottom: S.bd }}>진전 내용</th>
                </tr>
              </thead>
              <tbody>
                {byGroup.map(({ group, items: gItems }) => (
                  <Fragment key={group.id}>
                    <tr style={{ background: hexToRgba(group.color, 0.07), borderBottom: S.bd }}>
                      <td colSpan={2} style={{ padding: '6px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', borderLeft: `3px solid ${group.color}` }}>
                        <span style={{ color: group.color }}>{group.name}</span>
                      </td>
                    </tr>
                    {gItems.map(item => (
                      <tr key={item.id} style={{ borderBottom: S.bd }}>
                        <td style={{ padding: '10px 20px', verticalAlign: 'top', width: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0, marginTop: 4 }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: item.status === 'done' ? S.t3 : S.t1, lineHeight: 1.4, textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                              {item.title}
                            </span>
                          </div>
                        </td>
                        <td style={{ borderLeft: S.bd, padding: '6px 16px', verticalAlign: 'top' }}>
                          <textarea
                            value={notes[nk(item.id, meeting.id)] ?? ''}
                            onChange={e => onNote(item.id, meeting.id, e.target.value)}
                            placeholder="진전 내용, 결정사항, 다음 액션 등…"
                            rows={3}
                            style={{ width: '100%', border: 'none', background: 'transparent', resize: 'vertical', fontSize: 13, color: S.t1, lineHeight: 1.65, fontFamily: 'inherit', outline: 'none', minHeight: 52 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function AgendaMatrix({ category, allCats }: { category: string; allCats: string[] }) {
  const supabase = createClient()
  const router   = useRouter()

  const [groups,  setGroups]  = useState<AgendaGroup[]>([])
  const [items,   setItems]   = useState<AgendaItem[]>([])
  const [cols,    setCols]    = useState<MeetingCol[]>([])
  const [notes,   setNotes]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [openGroups,      setOpenGroups]      = useState<Set<string>>(new Set())
  const [expandedItems,   setExpandedItems]   = useState<Set<string>>(new Set())
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingCol | null>(null)

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

  const [subTasks,      setSubTasks]      = useState<AgendaSubTask[]>([])
  const [addingSubTask, setAddingSubTask] = useState<string | null>(null)
  const [newSTTitle,    setNewSTTitle]    = useState('')
  const [deletingST,    setDeletingST]    = useState<string | null>(null)

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const isAll = category === '전체'

  // ── 데이터 로드 ──────────────────────────────────────────────────
  useEffect(() => { load() }, [category])

  async function load() {
    setLoading(true)

    const gQuery = supabase.from('agenda_groups').select('*').order('sort_order')
    const { data: gData } = isAll
      ? await gQuery
      : await gQuery.eq('category', category)

    const fetchedGroups = (gData ?? []) as AgendaGroup[]
    setGroups(fetchedGroups)
    setOpenGroups(new Set(fetchedGroups.filter(g => g.is_open).map(g => g.id)))

    if (fetchedGroups.length > 0) {
      const { data: iData } = await supabase
        .from('agenda_items')
        .select('*')
        .in('group_id', fetchedGroups.map(g => g.id))
        .order('sort_order')
      const fetchedItems = (iData ?? []) as AgendaItem[]
      setItems(fetchedItems)
      if (fetchedItems.length > 0) {
        const { data: stData } = await supabase
          .from('agenda_sub_tasks')
          .select('*')
          .in('agenda_item_id', fetchedItems.map(i => i.id))
          .order('sort_order')
        setSubTasks((stData ?? []) as AgendaSubTask[])
      } else {
        setSubTasks([])
      }
    } else {
      setItems([]); setSubTasks([])
    }

    if (!isAll) {
      const { data: mData } = await supabase
        .from('meetings')
        .select('id, title, meeting_date')
        .eq('category', category)
        .order('meeting_date', { ascending: true })
      const fetchedCols = (mData ?? []) as MeetingCol[]
      setCols(fetchedCols)

      if (fetchedCols.length > 0) {
        const { data: uData } = await supabase
          .from('agenda_updates')
          .select('*')
          .in('meeting_id', fetchedCols.map(m => m.id))
        const map: Record<string, string> = {}
        ;(uData ?? []).forEach((u: AgendaUpdate) => { map[nk(u.agenda_item_id, u.meeting_id)] = u.note })
        setNotes(map)
      }
    } else {
      setCols([]); setNotes({})
    }

    setLoading(false)
  }

  // ── 노트 저장 ────────────────────────────────────────────────────
  function handleNote(itemId: string, meetingId: string, value: string) {
    const key = nk(itemId, meetingId)
    setNotes(prev => ({ ...prev, [key]: value }))
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      await supabase.from('agenda_updates').upsert(
        { agenda_item_id: itemId, meeting_id: meetingId, note: value },
        { onConflict: 'agenda_item_id,meeting_id' }
      )
    }, 600)
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

  // ── 그룹 추가/삭제 ───────────────────────────────────────────────
  function openAddGroup() {
    setNewGCat(isAll ? MATRIX_CATS[0] : category)
    setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(true)
  }
  async function addGroup() {
    const name = newGName.trim(); if (!name) { setAddingGroup(false); return }
    const { data } = await supabase.from('agenda_groups')
      .insert({ category: newGCat, name, color: newGColor, sort_order: groups.length, is_open: true })
      .select().single()
    if (data) {
      setGroups(p => [...p, data as AgendaGroup])
      setOpenGroups(p => new Set([...p, (data as AgendaGroup).id]))
    }
    setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(false)
  }
  async function deleteGroup(groupId: string) {
    await supabase.from('agenda_groups').delete().eq('id', groupId)
    setGroups(p => p.filter(g => g.id !== groupId))
    setItems(p => p.filter(i => i.group_id !== groupId))
    setDeletingGroup(null)
  }

  // ── 안건 추가/삭제 ───────────────────────────────────────────────
  async function addItem(groupId: string) {
    const title = newITitle.trim(); if (!title) { setAddingItem(null); return }
    const sort_order = items.filter(i => i.group_id === groupId).length
    const { data } = await supabase.from('agenda_items')
      .insert({ group_id: groupId, title, item_type: 'do', status: 'active', sort_order })
      .select().single()
    if (data) setItems(p => [...p, data as AgendaItem])
    setNewITitle(''); setAddingItem(null)
  }
  async function deleteItem(itemId: string) {
    await supabase.from('agenda_items').delete().eq('id', itemId)
    setItems(p => p.filter(i => i.id !== itemId))
    setDeletingItem(null)
  }

  // ── 하위태스크 추가/삭제 ─────────────────────────────────────────
  function toggleExpandedItem(itemId: string) {
    setExpandedItems(prev => { const s = new Set(prev); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return s })
  }
  async function addSubTask(itemId: string) {
    const title = newSTTitle.trim()
    if (!title) { setAddingSubTask(null); return }
    const sort_order = subTasks.filter(st => st.agenda_item_id === itemId).length
    const { data } = await supabase.from('agenda_sub_tasks')
      .insert({ agenda_item_id: itemId, title, status: 'active', sort_order })
      .select().single()
    if (data) setSubTasks(p => [...p, data as AgendaSubTask])
    setNewSTTitle(''); setAddingSubTask(null)
  }
  async function deleteSubTask(stId: string) {
    await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSubTasks(p => p.filter(st => st.id !== stId))
    setDeletingST(null)
  }

  // ── 수정 함수들 ──────────────────────────────────────────────────
  async function updateGroup(groupId: string) {
    const name = editGName.trim(); if (!name) { setEditingGroupId(null); return }
    await supabase.from('agenda_groups').update({ name, color: editGColor }).eq('id', groupId)
    setGroups(p => p.map(g => g.id === groupId ? { ...g, name, color: editGColor } : g))
    setEditingGroupId(null)
  }
  async function updateItem(itemId: string) {
    const title = editITitle.trim(); if (!title) { setEditingItemId(null); return }
    await supabase.from('agenda_items').update({ title }).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, title } : i))
    setEditingItemId(null)
  }
  async function updateSubTask(stId: string) {
    const title = editSTTitle.trim(); if (!title) { setEditingSTId(null); return }
    await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s))
    setEditingSTId(null)
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

  // ── 날짜 추가 ────────────────────────────────────────────────────
  async function addMeeting() {
    const dateStr = prompt('회의 날짜 (YYYY-MM-DD)')
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
    const { data } = await supabase.from('meetings')
      .insert({ title: `${category} ${dateStr}`, meeting_date: dateStr, category, notes: [] })
      .select('id, title, meeting_date').single()
    if (!data) return
    const newCol = data as MeetingCol
    setCols(prev => [...prev, newCol].sort((a, b) => (a.meeting_date ?? '').localeCompare(b.meeting_date ?? '')))
  }

  // ── 범주 추가 폼 ─────────────────────────────────────────────────
  function AddGroupForm({ colSpan }: { colSpan: number }) {
    return (
      <tr>
        <td colSpan={colSpan} style={{ background: S.bgRow, padding: 0 }}>
          {addingGroup ? (
            <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap">
              <input autoFocus value={newGName} onChange={e => setNewGName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGName('') } }}
                placeholder="범주명 입력 후 Enter"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400 w-40" />
              {isAll && (
                <div className="flex gap-1">
                  {MATRIX_CATS.map(c => (
                    <button key={c} type="button" onClick={() => setNewGCat(c)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${newGCat === c ? CAT_CLS[c] : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                {GROUP_COLORS.map(c => (
                  <div key={c} onClick={() => setNewGColor(c)}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: newGColor === c ? '2px solid #1A2233' : '2px solid transparent', flexShrink: 0 }} />
                ))}
              </div>
              <button onClick={addGroup} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
              <button onClick={() => { setAddingGroup(false); setNewGName('') }} className="text-xs text-gray-400 px-2 py-1">취소</button>
            </div>
          ) : (
            <div onClick={openAddGroup}
              className="flex items-center gap-1 px-5 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100/60 cursor-pointer transition-colors">
              ＋ 범주 추가
            </div>
          )}
        </td>
      </tr>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  )

  // ── 전체 모드 (트리뷰, 파트/유형 없음) ────────────────────────────
  if (isAll) {
    return (
      <div className="flex-1 min-h-0 overflow-auto">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: S.bd }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 5, background: S.bg, padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase', borderBottom: S.bd, width: '55%' }}>안건</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: S.bg, padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase', borderBottom: S.bd, borderLeft: S.bd, width: 80 }}>상태</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: S.bg, padding: '10px 12px', borderBottom: S.bd, borderLeft: S.bd, width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {groups.map(group => {
              const groupItems = items.filter(i => i.group_id === group.id)
              const isOpen = openGroups.has(group.id)
              return (
                <Fragment key={group.id}>
                  {/* 범주 행 */}
                  <tr style={{ background: CAT_BG[group.category ?? ''] ?? hexToRgba(group.color, 0.09) }}>
                    <td colSpan={3} style={{ padding: 0, borderTop: '3px solid #fff', borderBottom: S.bd, borderLeft: `3px solid ${CAT_BORDER[group.category ?? ''] ?? group.color}` }}>
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-2 flex-wrap" style={{ padding: '14px 16px' }}>
                          <input autoFocus value={editGName} onChange={e => setEditGName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateGroup(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                            className="border border-gray-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-gray-400 font-semibold w-40"
                            style={{ color: S.t1 }} />
                          <div className="flex gap-1.5">
                            {GROUP_COLORS.map(c => (
                              <div key={c} onClick={() => setEditGColor(c)}
                                style={{ width: 13, height: 13, borderRadius: '50%', background: c, cursor: 'pointer', border: editGColor === c ? '2px solid #1A2233' : '2px solid transparent', flexShrink: 0 }} />
                            ))}
                          </div>
                          <button onClick={() => updateGroup(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1 rounded-lg">저장</button>
                          <button onClick={() => setEditingGroupId(null)} className="text-xs text-gray-400 px-2">취소</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/grow" style={{ padding: '20px 16px' }}>
                          <span style={{ width: 3, height: 14, borderRadius: 2, background: CAT_BORDER[group.category ?? ''] ?? group.color, flexShrink: 0 }} />
                          <button onClick={() => toggleGroup(group.id)}
                            style={{ fontSize: 9, color: S.t3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</button>
                          <span style={{ fontSize: 13, fontWeight: 700, color: S.t1 }}>{group.name}</span>
                          <span style={{ fontSize: 11, color: S.t3, background: '#E5E9F0', padding: '1px 7px', borderRadius: 99 }}>{groupItems.length}</span>
                          <div className="flex gap-1 ml-2">
                            {MATRIX_CATS.map(c => (
                              <button key={c} onClick={() => updateGroupCat(group.id, c)}
                                className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold transition-all ${group.category === c ? CAT_CLS[c] : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                                {c}
                              </button>
                            ))}
                          </div>
                          <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover/grow:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingGroupId(group.id); setEditGName(group.name); setEditGColor(group.color) }}
                              className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors px-1">수정</button>
                            {deletingGroup === group.id ? (
                              <>
                                <span className="text-[10px] text-gray-500">삭제?</span>
                                <button onClick={() => deleteGroup(group.id)} className="text-[10px] text-red-500 font-semibold px-1.5 py-0.5 rounded">삭제</button>
                                <button onClick={() => setDeletingGroup(null)} className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded">취소</button>
                              </>
                            ) : (
                              <button onClick={() => setDeletingGroup(group.id)} className="text-[10px] text-gray-300 hover:text-red-400 transition-colors px-1">삭제</button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* 안건 행들 */}
                  {isOpen && groupItems.map(item => {
                    const itemSubTasks = subTasks.filter(st => st.agenda_item_id === item.id)
                    const isItemExpanded = expandedItems.has(item.id)
                    const activeColor = item.status === 'active' ? (CAT_BORDER[group.category ?? ''] ?? group.color) : STATUS_COLOR[item.status]
                    return (
                      <Fragment key={item.id}>
                        <tr style={{ borderBottom: isItemExpanded ? 'none' : S.bd }} className="hover:bg-gray-50/60 group/irow">
                          <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleExpandedItem(item.id)}
                                style={{ fontSize: 8, color: S.t3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, transition: 'transform .15s', transform: isItemExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, width: 10 }}>▶</button>
                              <button onClick={() => cycleStatus(item)} title={`상태: ${STATUS_LABEL[item.status]}`}
                                style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: activeColor, border: 'none', cursor: 'pointer', padding: 0 }} />
                              {editingItemId === item.id ? (
                                <input autoFocus value={editITitle} onChange={e => setEditITitle(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateItem(item.id); if (e.key === 'Escape') setEditingItemId(null) }}
                                  className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-400 font-medium flex-1 min-w-0"
                                  style={{ color: S.t1 }} />
                              ) : (
                                <span style={{ fontSize: 14, fontWeight: 500, color: item.status === 'done' ? S.t3 : S.t1, textDecoration: item.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35 }}>
                                  {item.title}
                                </span>
                              )}
                              {itemSubTasks.length > 0 && (
                                <span style={{ fontSize: 10, color: S.t3, background: '#E5E9F0', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>
                                  {itemSubTasks.filter(st => st.status !== 'done').length}/{itemSubTasks.length}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ borderLeft: S.bd, padding: '10px 12px', fontSize: 12, color: S.t2, verticalAlign: 'middle' }}>
                            {STATUS_LABEL[item.status]}
                          </td>
                          <td style={{ borderLeft: S.bd, padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <div className="flex items-center gap-1.5 justify-center opacity-0 group-hover/irow:opacity-100 transition-all">
                              <button onClick={() => router.push(`/project/items/${item.id}`)}
                                className="text-[10px] text-[#1B3A6B] hover:underline font-semibold">→ 상세</button>
                              {editingItemId !== item.id && (
                                <button onClick={() => { setEditingItemId(item.id); setEditITitle(item.title) }}
                                  className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                              )}
                              {deletingItem === item.id ? (
                                <>
                                  <button onClick={() => deleteItem(item.id)} className="text-[10px] text-red-500 hover:text-red-700 font-semibold">삭제</button>
                                  <button onClick={() => setDeletingItem(null)} className="text-[10px] text-gray-400">취소</button>
                                </>
                              ) : (
                                <button onClick={() => setDeletingItem(item.id)} className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* 하위 태스크 행들 */}
                        {isItemExpanded && itemSubTasks.map(st => (
                          <tr key={st.id} style={{ borderBottom: S.bd, background: '#FAFBFD' }} className="group/strow">
                            <td style={{ padding: '7px 16px 7px 44px', verticalAlign: 'middle' }}>
                              <div className="flex items-center gap-2">
                                <button onClick={() => cycleSubTaskStatus(st)} title={`상태: ${STATUS_LABEL[st.status]}`}
                                  style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: st.status === 'active' ? (CAT_BORDER[group.category ?? ''] ?? group.color) : STATUS_COLOR[st.status], border: 'none', cursor: 'pointer', padding: 0 }} />
                                {editingSTId === st.id ? (
                                  <input autoFocus value={editSTTitle} onChange={e => setEditSTTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateSubTask(st.id); if (e.key === 'Escape') setEditingSTId(null) }}
                                    className="border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-gray-400 flex-1 min-w-0"
                                    style={{ color: S.t2 }} />
                                ) : (
                                  <button onClick={() => router.push(`/subtasks/${st.id}`)}
                                    style={{ fontSize: 13, color: st.status === 'done' ? S.t3 : S.t2, textDecoration: st.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                    className="hover:underline">
                                    {st.title}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ borderLeft: S.bd }} />
                            <td style={{ borderLeft: S.bd, padding: '6px 12px', textAlign: 'center' }}>
                              <div className="flex items-center gap-1.5 justify-center opacity-0 group-hover/strow:opacity-100 transition-all">
                                {editingSTId !== st.id && (
                                  <button onClick={() => { setEditingSTId(st.id); setEditSTTitle(st.title) }}
                                    className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                                )}
                                {deletingST === st.id ? (
                                  <>
                                    <button onClick={() => deleteSubTask(st.id)} className="text-[10px] text-red-500 font-semibold">삭제</button>
                                    <button onClick={() => setDeletingST(null)} className="text-[10px] text-gray-400">취소</button>
                                  </>
                                ) : (
                                  <button onClick={() => setDeletingST(st.id)} className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}

                        {isItemExpanded && (
                          <tr key={`add-st-${item.id}`} style={{ borderBottom: S.bd, background: '#FAFBFD' }}>
                            <td colSpan={3} style={{ padding: 0 }}>
                              {addingSubTask === item.id ? (
                                <div className="flex items-center gap-2 px-10 py-2">
                                  <input autoFocus value={newSTTitle} onChange={e => setNewSTTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(item.id); if (e.key === 'Escape') { setAddingSubTask(null); setNewSTTitle('') } }}
                                    placeholder="하위 태스크 입력 후 Enter"
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                                  <button onClick={() => addSubTask(item.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                                  <button onClick={() => { setAddingSubTask(null); setNewSTTitle('') }} className="text-xs text-gray-400 px-2">취소</button>
                                </div>
                              ) : (
                                <div onClick={() => setAddingSubTask(item.id)}
                                  className="flex items-center gap-1 px-10 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                                  ＋ 하위 태스크
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}

                  {isOpen && (
                    <tr key={`add-i-${group.id}`} style={{ borderBottom: S.bd }}>
                      <td colSpan={3} style={{ padding: 0 }}>
                        {addingItem === group.id ? (
                          <div className="flex items-center gap-2 px-5 py-2">
                            <input autoFocus value={newITitle} onChange={e => setNewITitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(group.id); if (e.key === 'Escape') { setAddingItem(null); setNewITitle('') } }}
                              placeholder="안건명 입력 후 Enter"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                            <button onClick={() => addItem(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                            <button onClick={() => { setAddingItem(null); setNewITitle('') }} className="text-xs text-gray-400 px-2 py-1">취소</button>
                          </div>
                        ) : (
                          <div onClick={() => { setAddingItem(group.id); setNewITitle('') }}
                            className="flex items-center gap-1 px-5 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                            ＋ {group.name}에 안건 추가
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            <AddGroupForm colSpan={3} />
          </tbody>
        </table>
      </div>
    )
  }

  // ── 달력 칸반 모드 (코어/비즈/개인) ──────────────────────────────
  const catColor = CAT_BORDER[category] ?? '#1B3A6B'
  const catDot   = CAT_DOT[category]   ?? '#1B3A6B'
  const totalW   = W_LEFT + cols.length * W_CAL + 48

  return (
    <>
      {/* 달력 그리드 */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table style={{ borderCollapse: 'collapse', minWidth: totalW, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {/* 안건 헤더 (sticky) */}
              <th style={{
                position: 'sticky', left: 0, top: 0, zIndex: 5,
                background: S.bg, borderBottom: S.bdL, borderRight: S.bdL,
                width: W_LEFT, minWidth: W_LEFT,
                padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase',
              }}>
                안건
                <span style={{ marginLeft: 8, fontSize: 10, color: S.t3, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  열 클릭으로 회의 오픈
                </span>
              </th>

              {/* 날짜 헤더들 */}
              {cols.map((m, idx) => {
                const isRecent = idx >= cols.length - 3
                const dayLabel = formatDayLabel(m.meeting_date)
                const isSun = dayLabel === '일'
                const isSat = dayLabel === '토'
                return (
                  <th key={m.id}
                    onClick={() => setSelectedMeeting(m)}
                    style={{
                      position: 'sticky', top: 0, zIndex: 3,
                      background: isRecent ? '#F5F8FF' : S.bg,
                      borderBottom: isRecent ? S.bdL : S.bd,
                      borderLeft: S.bd,
                      width: W_CAL, minWidth: W_CAL,
                      cursor: 'pointer',
                      transition: 'background .12s',
                    }}
                    className="hover:bg-blue-50/40">
                    <div style={{ padding: '6px 2px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isSun ? '#EF4444' : isSat ? '#3B82F6' : S.t1, lineHeight: 1.2 }}>
                        {formatDateShort(m.meeting_date)}
                      </div>
                      <div style={{ fontSize: 9, color: isSun ? '#FCA5A5' : isSat ? '#93C5FD' : S.t3, marginTop: 1 }}>
                        {dayLabel}
                      </div>
                    </div>
                  </th>
                )
              })}

              {/* + 날짜 추가 */}
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: S.bg, borderBottom: S.bd, borderLeft: S.bd, width: 48, minWidth: 48 }}>
                <button onClick={addMeeting}
                  className="w-full h-full flex flex-col items-center justify-center gap-0.5 hover:bg-gray-50 transition-colors"
                  style={{ border: 'none', cursor: 'pointer', background: 'none', padding: '6px 2px', color: S.t3, fontSize: 14 }}>
                  ＋
                  <span style={{ fontSize: 8, lineHeight: 1.2, color: S.t3 }}>날짜</span>
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {groups.map(group => {
              const groupItems = items.filter(i => i.group_id === group.id)
              const isOpen = openGroups.has(group.id)
              return (
                <Fragment key={group.id}>
                  {/* 범주 헤더 행 */}
                  <tr>
                    <td colSpan={cols.length + 2}
                      style={{
                        position: 'sticky', left: 0, zIndex: 2,
                        background: hexToRgba(group.color, 0.08),
                        borderTop: '3px solid #fff', borderBottom: S.bd,
                        borderLeft: `3px solid ${group.color}`,
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleGroup(group.id)}>
                      <div className="flex items-center gap-2 group/grow" style={{ padding: '12px 16px' }}>
                        <span style={{ width: 3, height: 12, borderRadius: 2, background: group.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: S.t3, display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: S.t1 }}>{group.name}</span>
                        <span style={{ fontSize: 10, color: S.t3, background: '#E5E9F0', padding: '1px 6px', borderRadius: 99 }}>{groupItems.length}</span>
                      </div>
                    </td>
                  </tr>

                  {/* 안건 행들 */}
                  {isOpen && groupItems.map(item => {
                    return (
                      <tr key={item.id} style={{ borderBottom: S.bd }} className="hover:bg-gray-50/30 group/irow">
                        {/* 안건명 (sticky) */}
                        <td style={{ position: 'sticky', left: 0, zIndex: 2, background: S.bg, borderRight: S.bdL, width: W_LEFT, minWidth: W_LEFT, verticalAlign: 'middle' }}>
                          <div style={{ padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
                            <button onClick={() => cycleStatus(item)} title={STATUS_LABEL[item.status]}
                              style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: item.status === 'active' ? catDot : STATUS_COLOR[item.status], border: 'none', cursor: 'pointer', padding: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: item.status === 'done' ? S.t3 : S.t1, lineHeight: 1.35, flex: 1, minWidth: 0, textDecoration: item.status === 'done' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.title}
                            </span>
                            <button
                              onClick={() => router.push(`/project/items/${item.id}`)}
                              style={{ fontSize: 10, color: catColor, opacity: 0, transition: 'opacity .15s', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontWeight: 600 }}
                              className="group-hover/irow:opacity-100">
                              →
                            </button>
                          </div>
                        </td>

                        {/* 날짜 셀들 (도트 인디케이터, 클릭 시 팝업) */}
                        {cols.map((m, idx) => {
                          const note = notes[nk(item.id, m.id)] ?? ''
                          const hasContent = note.trim().length > 0
                          const isRecent = idx >= cols.length - 3
                          return (
                            <td key={m.id}
                              onClick={() => setSelectedMeeting(m)}
                              style={{
                                borderLeft: S.bd,
                                background: isRecent ? 'rgba(235,242,255,0.4)' : 'transparent',
                                width: W_CAL, minWidth: W_CAL,
                                textAlign: 'center',
                                verticalAlign: 'middle',
                                cursor: 'pointer',
                                padding: '8px 2px',
                              }}
                              className="hover:bg-blue-50/50 transition-colors">
                              {hasContent ? (
                                <div style={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  background: catDot,
                                  margin: '0 auto',
                                  boxShadow: `0 0 0 2px ${hexToRgba(catDot, 0.2)}`,
                                }} />
                              ) : (
                                <div style={{
                                  width: 4, height: 4, borderRadius: '50%',
                                  background: '#E5E9F0',
                                  margin: '0 auto',
                                }} />
                              )}
                            </td>
                          )
                        })}

                        {/* 빈 셀 (+ 추가 열) */}
                        <td style={{ borderLeft: S.bd }} />
                      </tr>
                    )
                  })}

                  {/* 안건 추가 행 */}
                  {isOpen && (
                    <tr key={`add-i-${group.id}`} style={{ borderBottom: S.bd }}>
                      <td colSpan={cols.length + 2} style={{ padding: 0 }}>
                        {addingItem === group.id ? (
                          <div className="flex items-center gap-2 px-5 py-2">
                            <input autoFocus value={newITitle} onChange={e => setNewITitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(group.id); if (e.key === 'Escape') { setAddingItem(null); setNewITitle('') } }}
                              placeholder="안건명 입력 후 Enter"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                            <button onClick={() => addItem(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                            <button onClick={() => { setAddingItem(null); setNewITitle('') }} className="text-xs text-gray-400 px-2 py-1">취소</button>
                          </div>
                        ) : (
                          <div onClick={() => { setAddingItem(group.id); setNewITitle('') }}
                            className="flex items-center gap-1 px-5 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                            ＋ {group.name}에 안건 추가
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            <AddGroupForm colSpan={cols.length + 2} />
          </tbody>
        </table>

        {/* 안건/날짜 없을 때 빈 상태 */}
        {groups.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: S.t3 }}>
            전체 탭에서 {category} 범주를 추가하면 여기에 나타납니다.
          </div>
        )}
        {groups.length > 0 && cols.length === 0 && (
          <div style={{ padding: '16px 20px', fontSize: 12, color: S.t3 }}>
            오른쪽 ＋ 버튼으로 날짜를 추가하면 칸반 그리드가 시작됩니다.
          </div>
        )}
      </div>

      {/* 회의 팝업 */}
      {selectedMeeting && (
        <MeetingPopup
          meeting={selectedMeeting}
          items={items}
          groups={groups}
          notes={notes}
          onNote={handleNote}
          onClose={() => setSelectedMeeting(null)}
          onOpenMeeting={id => { router.push(`/meetings/${id}`); setSelectedMeeting(null) }}
          catColor={catColor}
          category={category}
        />
      )}
    </>
  )
}
