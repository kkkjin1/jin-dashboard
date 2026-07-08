'use client'

import { useEffect, useState, useRef, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaGroup, AgendaItem, AgendaUpdate, AgendaSubTask } from '@/types'

// ── 상수 ────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = { do: '내 실행', fb: '피드백', rp: '보고수신', ag: '단순안건' }
const TYPE_CLS: Record<string, string> = {
  do: 'bg-blue-50 text-blue-600 border-blue-200',
  fb: 'bg-amber-50 text-amber-600 border-amber-200',
  rp: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  ag: 'bg-gray-100 text-gray-500 border-gray-200',
}
const STATUS_COLOR: Record<string, string> = { active: '#3B82F6', hold: '#9CA3AF', done: '#10B981' }
const STATUS_LABEL: Record<string, string> = { active: '진행', hold: '보류', done: '완료' }
const GROUP_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#9CA3AF']
const MATRIX_CATS = ['코어', '비즈', '개인']
const CAT_CLS: Record<string, string> = {
  '코어':  'bg-blue-50 text-blue-700 border-blue-200',
  '비즈':  'bg-amber-50 text-amber-700 border-amber-200',
  '개인':  'bg-emerald-50 text-emerald-700 border-emerald-200',
}
// 전체 모드에서 카테고리별 배경색
const CAT_BG: Record<string, string>     = { '코어': 'rgba(59,130,246,0.09)',  '비즈': 'rgba(245,158,11,0.09)',  '개인': 'rgba(16,185,129,0.09)' }
const CAT_BORDER: Record<string, string> = { '코어': '#3B82F6',                '비즈': '#F59E0B',                '개인': '#10B981' }

const W_ITEM  = 280
const W_PAST  = 260
const W_NOW   = 680
const W_ADD   = 64

// ── 타입 ────────────────────────────────────────────────────────────
interface MeetingCol { id: string; title: string; meeting_date: string | null }
interface ExpandedNote { date: string; itemTitle: string; note: string; meetingId: string }

function formatDate(d: string | null) {
  if (!d) return '날짜 미지정'
  const dt = new Date(d + 'T00:00:00')
  const days = ['일','월','화','수','목','금','토']
  return `${dt.getMonth()+1}/${dt.getDate()} (${days[dt.getDay()]})`
}
function nk(itemId: string, meetingId: string) { return `${itemId}_${meetingId}` }
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── 스타일 헬퍼 ─────────────────────────────────────────────────────
const S = {
  bd:    '1px solid #E5E9F0',
  bdL:   '1px solid #BDD0EA',
  bg:    '#fff',
  bgRow: '#F7F9FC',
  bgNow: '#F0F4FA',
  t1:    '#1A2233',
  t2:    '#4A5A72',
  t3:    '#8FA0B5',
}

// ── 컴포넌트 ────────────────────────────────────────────────────────
export default function AgendaMatrix({ category, allCats }: { category: string; allCats: string[] }) {
  const supabase = createClient()
  const router   = useRouter()

  const [groups,  setGroups]  = useState<AgendaGroup[]>([])
  const [items,   setItems]   = useState<AgendaItem[]>([])
  const [cols,    setCols]    = useState<MeetingCol[]>([])
  const [notes,   setNotes]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [openGroups,   setOpenGroups]   = useState<Set<string>>(new Set())
  const [hiddenCols,   setHiddenCols]   = useState<Set<string>>(new Set())
  const [expandedNote, setExpandedNote] = useState<ExpandedNote | null>(null)

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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
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
      setItems([])
      setSubTasks([])
    }

    if (!isAll) {
      const { data: mData } = await supabase
        .from('meetings')
        .select('id, title, meeting_date')
        .eq('category', category)
        .order('meeting_date', { ascending: true })
      const fetchedCols = (mData ?? []) as MeetingCol[]
      setCols(fetchedCols)

      const hidden = new Set<string>()
      fetchedCols.forEach((m, i) => { if (i < fetchedCols.length - 3) hidden.add(m.id) })
      setHiddenCols(hidden)

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

  // ── 그룹 카테고리 변경 ────────────────────────────────────────────
  async function updateGroupCat(groupId: string, cat: string) {
    await supabase.from('agenda_groups').update({ category: cat }).eq('id', groupId)
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, category: cat } : g))
  }

  // ── 그룹 추가 ────────────────────────────────────────────────────
  function openAddGroup() {
    setNewGCat(isAll ? MATRIX_CATS[0] : category)
    setNewGName('')
    setNewGColor(GROUP_COLORS[0])
    setAddingGroup(true)
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

  // ── 그룹 삭제 ────────────────────────────────────────────────────
  async function deleteGroup(groupId: string) {
    await supabase.from('agenda_groups').delete().eq('id', groupId)
    setGroups(p => p.filter(g => g.id !== groupId))
    setItems(p => p.filter(i => i.group_id !== groupId))
    setDeletingGroup(null)
  }

  // ── 안건 추가 ────────────────────────────────────────────────────
  async function addItem(groupId: string) {
    const title = newITitle.trim(); if (!title) { setAddingItem(null); return }
    const sort_order = items.filter(i => i.group_id === groupId).length
    const { data } = await supabase.from('agenda_items')
      .insert({ group_id: groupId, title, item_type: 'do', status: 'active', sort_order })
      .select().single()
    if (data) setItems(p => [...p, data as AgendaItem])
    setNewITitle(''); setAddingItem(null)
  }

  // ── 안건 삭제 ────────────────────────────────────────────────────
  async function deleteItem(itemId: string) {
    await supabase.from('agenda_items').delete().eq('id', itemId)
    setItems(p => p.filter(i => i.id !== itemId))
    setDeletingItem(null)
  }

  // ── 아이템 서브태스크 토글 ────────────────────────────────────────
  function toggleExpandedItem(itemId: string) {
    setExpandedItems(prev => {
      const s = new Set(prev)
      s.has(itemId) ? s.delete(itemId) : s.add(itemId)
      return s
    })
  }

  // ── 서브태스크 추가 ───────────────────────────────────────────────
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

  // ── 서브태스크 삭제 ───────────────────────────────────────────────
  async function deleteSubTask(stId: string) {
    await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSubTasks(p => p.filter(st => st.id !== stId))
    setDeletingST(null)
  }

  // ── 그룹 이름/색상 수정 ──────────────────────────────────────────
  async function updateGroup(groupId: string) {
    const name = editGName.trim(); if (!name) { setEditingGroupId(null); return }
    await supabase.from('agenda_groups').update({ name, color: editGColor }).eq('id', groupId)
    setGroups(p => p.map(g => g.id === groupId ? { ...g, name, color: editGColor } : g))
    setEditingGroupId(null)
  }

  // ── 안건 제목 수정 ────────────────────────────────────────────────
  async function updateItem(itemId: string) {
    const title = editITitle.trim(); if (!title) { setEditingItemId(null); return }
    await supabase.from('agenda_items').update({ title }).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, title } : i))
    setEditingItemId(null)
  }

  // ── 안건 유형 순환 (클릭) ─────────────────────────────────────────
  async function cycleItemType(item: AgendaItem) {
    const order: AgendaItem['item_type'][] = ['do', 'fb', 'rp', 'ag']
    const next = order[(order.indexOf(item.item_type) + 1) % order.length]
    await supabase.from('agenda_items').update({ item_type: next }).eq('id', item.id)
    setItems(p => p.map(i => i.id === item.id ? { ...i, item_type: next } : i))
  }

  // ── 서브태스크 제목 수정 ──────────────────────────────────────────
  async function updateSubTask(stId: string) {
    const title = editSTTitle.trim(); if (!title) { setEditingSTId(null); return }
    await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s))
    setEditingSTId(null)
  }

  // ── 서브태스크 상태 순환 ─────────────────────────────────────────
  async function cycleSubTaskStatus(st: AgendaSubTask) {
    const order: AgendaSubTask['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(st.status) + 1) % order.length]
    await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', st.id)
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, status: next } : s))
  }

  // ── 안건 상태 순환 ───────────────────────────────────────────────
  async function cycleStatus(item: AgendaItem) {
    const order: AgendaItem['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    await supabase.from('agenda_items').update({ status: next }).eq('id', item.id)
    setItems(p => p.map(i => i.id === item.id ? { ...i, status: next } : i))
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
    setHiddenCols(prev => { const s = new Set(prev); s.delete(newCol.id); return s })
  }

  // ── 계산값 ───────────────────────────────────────────────────────
  const visCols  = useMemo(() => cols.filter(m => !hiddenCols.has(m.id)), [cols, hiddenCols])
  const nowCol   = visCols[visCols.length - 1] ?? null
  const pastCols = visCols.slice(0, -1)

  function prevNote(itemId: string): string {
    if (!nowCol) return ''
    const nowIdx = cols.findIndex(m => m.id === nowCol.id)
    if (nowIdx <= 0) return ''
    return notes[nk(itemId, cols[nowIdx - 1].id)] ?? ''
  }

  // ── 범주 추가 폼 (공통) ───────────────────────────────────────────
  function AddGroupForm({ colSpan }: { colSpan: number }) {
    return (
      <tr>
        <td colSpan={colSpan} style={{ background:S.bgRow, padding:0 }}>
          {addingGroup ? (
            <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap">
              <input autoFocus value={newGName} onChange={e=>setNewGName(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)addGroup(); if(e.key==='Escape'){setAddingGroup(false);setNewGName('')} }}
                placeholder="범주명 입력 후 Enter"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400 w-40"/>
              {/* 파트 선택 */}
              <div className="flex gap-1">
                {MATRIX_CATS.map(c => (
                  <button key={c} type="button" onClick={()=>setNewGCat(c)}
                    className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${newGCat === c ? CAT_CLS[c] : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                    {c}
                  </button>
                ))}
              </div>
              {/* 색상 선택 */}
              <div className="flex gap-1.5">
                {GROUP_COLORS.map(c=>(
                  <div key={c} onClick={()=>setNewGColor(c)}
                    style={{width:14,height:14,borderRadius:'50%',background:c,cursor:'pointer',border:newGColor===c?'2px solid #1A2233':'2px solid transparent',flexShrink:0}}/>
                ))}
              </div>
              <button onClick={addGroup} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
              <button onClick={()=>{setAddingGroup(false);setNewGName('')}} className="text-xs text-gray-400 px-2 py-1">취소</button>
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

  // ── 전체 모드 렌더 ────────────────────────────────────────────────
  if (isAll) {
    return (
      <div className="flex-1 min-h-0 overflow-auto">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: S.bd }}>
              <th style={{ position:'sticky', left:0, top:0, zIndex:5, background:S.bg, padding:'10px 16px', textAlign:'left', fontSize:12, fontWeight:700, color:S.t3, letterSpacing:'.05em', textTransform:'uppercase', borderBottom:S.bd, width:'40%' }}>안건</th>
              <th style={{ position:'sticky', top:0, zIndex:3, background:S.bg, padding:'10px 12px', textAlign:'left', fontSize:12, fontWeight:700, color:S.t3, letterSpacing:'.05em', textTransform:'uppercase', borderBottom:S.bd, borderLeft:S.bd }}>파트</th>
              <th style={{ position:'sticky', top:0, zIndex:3, background:S.bg, padding:'10px 12px', textAlign:'left', fontSize:12, fontWeight:700, color:S.t3, letterSpacing:'.05em', textTransform:'uppercase', borderBottom:S.bd, borderLeft:S.bd }}>유형</th>
              <th style={{ position:'sticky', top:0, zIndex:3, background:S.bg, padding:'10px 12px', textAlign:'left', fontSize:12, fontWeight:700, color:S.t3, letterSpacing:'.05em', textTransform:'uppercase', borderBottom:S.bd, borderLeft:S.bd }}>상태</th>
              <th style={{ position:'sticky', top:0, zIndex:3, background:S.bg, padding:'10px 12px', borderBottom:S.bd, borderLeft:S.bd, width:60 }} />
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
                    <td colSpan={5} style={{ padding:0, borderTop:'3px solid #fff', borderBottom: S.bd, borderLeft: `3px solid ${CAT_BORDER[group.category ?? ''] ?? group.color}` }}>
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-2 flex-wrap" style={{ padding:'14px 16px' }}>
                          <input autoFocus value={editGName} onChange={e=>setEditGName(e.target.value)}
                            onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)updateGroup(group.id); if(e.key==='Escape')setEditingGroupId(null) }}
                            className="border border-gray-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-gray-400 font-semibold w-40"
                            style={{ color:S.t1 }}/>
                          <div className="flex gap-1.5">
                            {GROUP_COLORS.map(c=>(
                              <div key={c} onClick={()=>setEditGColor(c)}
                                style={{width:13,height:13,borderRadius:'50%',background:c,cursor:'pointer',border:editGColor===c?'2px solid #1A2233':'2px solid transparent',flexShrink:0}}/>
                            ))}
                          </div>
                          <button onClick={()=>updateGroup(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1 rounded-lg">저장</button>
                          <button onClick={()=>setEditingGroupId(null)} className="text-xs text-gray-400 px-2">취소</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/grow" style={{ padding:'20px 16px' }}>
                          <span style={{ width:3, height:14, borderRadius:2, background: CAT_BORDER[group.category ?? ''] ?? group.color, flexShrink:0 }} />
                          <button
                            onClick={() => toggleGroup(group.id)}
                            style={{ fontSize:9, color:S.t3, background:'none', border:'none', cursor:'pointer', padding:0, lineHeight:1, display:'inline-block', transition:'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                          >▼</button>
                          <span style={{ fontSize:13, fontWeight:700, color:S.t1 }}>{group.name}</span>
                          <span style={{ fontSize:11, color:S.t3, background:'#E5E9F0', padding:'1px 7px', borderRadius:99 }}>{groupItems.length}</span>
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
                                <span className="text-[10px] text-gray-500">범주 삭제?</span>
                                <button onClick={() => deleteGroup(group.id)} className="text-[10px] text-red-500 hover:text-red-700 font-semibold px-1.5 py-0.5 rounded">삭제</button>
                                <button onClick={() => setDeletingGroup(null)} className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded">취소</button>
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
                          <td style={{ padding:'10px 16px', verticalAlign:'middle' }}>
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleExpandedItem(item.id)}
                                style={{ fontSize:8, color:S.t3, background:'none', border:'none', cursor:'pointer', padding:0, lineHeight:1, transition:'transform .15s', transform: isItemExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink:0, width:10 }}>▶</button>
                              <button onClick={() => cycleStatus(item)} title={`상태: ${STATUS_LABEL[item.status]}`}
                                style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: activeColor, border:'none', cursor:'pointer', padding:0 }} />
                              {editingItemId === item.id ? (
                                <input autoFocus value={editITitle} onChange={e=>setEditITitle(e.target.value)}
                                  onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)updateItem(item.id); if(e.key==='Escape')setEditingItemId(null) }}
                                  className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-400 font-medium flex-1 min-w-0"
                                  style={{ color:S.t1 }}/>
                              ) : (
                                <span style={{ fontSize:14, fontWeight:500, color: item.status==='done' ? S.t3 : S.t1, textDecoration: item.status==='done' ? 'line-through' : 'none', lineHeight:1.35 }}>
                                  {item.title}
                                </span>
                              )}
                              {itemSubTasks.length > 0 && (
                                <span style={{ fontSize:10, color:S.t3, background:'#E5E9F0', padding:'1px 6px', borderRadius:99, flexShrink:0 }}>
                                  {itemSubTasks.filter(st=>st.status!=='done').length}/{itemSubTasks.length}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ borderLeft:S.bd, padding:'10px 12px', verticalAlign:'middle' }}>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${CAT_CLS[groups.find(g=>g.id===item.group_id)?.category??'코어'] ?? CAT_CLS['코어']}`}>
                              {groups.find(g=>g.id===item.group_id)?.category ?? '—'}
                            </span>
                          </td>
                          <td style={{ borderLeft:S.bd, padding:'10px 12px', verticalAlign:'middle' }}>
                            <button onClick={()=>cycleItemType(item)} title="클릭하여 유형 변경"
                              className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold hover:opacity-70 transition-opacity cursor-pointer ${TYPE_CLS[item.item_type]}`}>
                              {TYPE_LABEL[item.item_type]}
                            </button>
                          </td>
                          <td style={{ borderLeft:S.bd, padding:'10px 12px', fontSize:12, color:S.t2, verticalAlign:'middle' }}>
                            {STATUS_LABEL[item.status]}
                          </td>
                          <td style={{ borderLeft:S.bd, padding:'10px 12px', verticalAlign:'middle', textAlign:'center' }}>
                            <div className="flex items-center gap-1.5 justify-center opacity-0 group-hover/irow:opacity-100 transition-all">
                              {editingItemId !== item.id && (
                                <button onClick={()=>{ setEditingItemId(item.id); setEditITitle(item.title) }}
                                  className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                              )}
                              {deletingItem === item.id ? (
                                <>
                                  <button onClick={() => deleteItem(item.id)} className="text-[10px] text-red-500 hover:text-red-700 font-semibold">삭제</button>
                                  <button onClick={() => setDeletingItem(null)} className="text-[10px] text-gray-400">취소</button>
                                </>
                              ) : (
                                <button onClick={() => setDeletingItem(item.id)}
                                  className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* 하위 태스크 행들 */}
                        {isItemExpanded && itemSubTasks.map(st => (
                          <tr key={st.id} style={{ borderBottom: S.bd, background:'#FAFBFD' }} className="group/strow">
                            <td style={{ padding:'7px 16px 7px 44px', verticalAlign:'middle' }}>
                              <div className="flex items-center gap-2">
                                <button onClick={() => cycleSubTaskStatus(st)} title={`상태: ${STATUS_LABEL[st.status]}`}
                                  style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background: st.status === 'active' ? (CAT_BORDER[group.category ?? ''] ?? group.color) : STATUS_COLOR[st.status], border:'none', cursor:'pointer', padding:0 }} />
                                {editingSTId === st.id ? (
                                  <input autoFocus value={editSTTitle} onChange={e=>setEditSTTitle(e.target.value)}
                                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)updateSubTask(st.id); if(e.key==='Escape')setEditingSTId(null) }}
                                    className="border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-gray-400 flex-1 min-w-0"
                                    style={{ color:S.t2 }}/>
                                ) : (
                                  <button onClick={()=>router.push(`/subtasks/${st.id}`)}
                                    style={{ fontSize:13, color: st.status==='done' ? S.t3 : S.t2, textDecoration: st.status==='done' ? 'line-through' : 'none', lineHeight:1.35, background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}
                                    className="hover:underline">
                                    {st.title}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ borderLeft:S.bd }} /><td style={{ borderLeft:S.bd }} /><td style={{ borderLeft:S.bd }} />
                            <td style={{ borderLeft:S.bd, padding:'6px 12px', textAlign:'center' }}>
                              <div className="flex items-center gap-1.5 justify-center opacity-0 group-hover/strow:opacity-100 transition-all">
                                {editingSTId !== st.id && (
                                  <button onClick={()=>{ setEditingSTId(st.id); setEditSTTitle(st.title) }}
                                    className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                                )}
                                {deletingST === st.id ? (
                                  <>
                                    <button onClick={() => deleteSubTask(st.id)} className="text-[10px] text-red-500 font-semibold">삭제</button>
                                    <button onClick={() => setDeletingST(null)} className="text-[10px] text-gray-400">취소</button>
                                  </>
                                ) : (
                                  <button onClick={() => setDeletingST(st.id)}
                                    className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}

                        {/* 하위 태스크 추가 */}
                        {isItemExpanded && (
                          <tr key={`add-st-${item.id}`} style={{ borderBottom: S.bd, background:'#FAFBFD' }}>
                            <td colSpan={5} style={{ padding:0 }}>
                              {addingSubTask === item.id ? (
                                <div className="flex items-center gap-2 px-10 py-2">
                                  <input autoFocus value={newSTTitle} onChange={e=>setNewSTTitle(e.target.value)}
                                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)addSubTask(item.id); if(e.key==='Escape'){setAddingSubTask(null);setNewSTTitle('')} }}
                                    placeholder="하위 태스크 입력 후 Enter"
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                                  <button onClick={()=>addSubTask(item.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                                  <button onClick={()=>{setAddingSubTask(null);setNewSTTitle('')}} className="text-xs text-gray-400 px-2">취소</button>
                                </div>
                              ) : (
                                <div onClick={()=>setAddingSubTask(item.id)}
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

                  {/* 안건 추가 */}
                  {isOpen && (
                    <tr key={`add-i-${group.id}`} style={{ borderBottom: S.bd }}>
                      <td colSpan={5} style={{ padding:0 }}>
                        {addingItem === group.id ? (
                          <div className="flex items-center gap-2 px-5 py-2">
                            <input autoFocus value={newITitle} onChange={e=>setNewITitle(e.target.value)}
                              onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)addItem(group.id); if(e.key==='Escape'){setAddingItem(null);setNewITitle('')} }}
                              placeholder="안건명 입력 후 Enter"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                            <button onClick={()=>addItem(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                            <button onClick={()=>{setAddingItem(null);setNewITitle('')}} className="text-xs text-gray-400 px-2 py-1">취소</button>
                          </div>
                        ) : (
                          <div onClick={()=>{setAddingItem(group.id);setNewITitle('')}}
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

            <AddGroupForm colSpan={5} />
          </tbody>
        </table>
      </div>
    )
  }

  // ── 매트릭스 모드 렌더 (코어/비즈/개인) ──────────────────────────
  const totalCols = visCols.length + 2

  return (
    <>
      <div className="flex-1 min-h-0 overflow-auto" style={{ paddingRight: 40 }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {/* 안건 헤더 */}
              <th style={{ position:'sticky', left:0, top:0, zIndex:5, background:S.bg, borderBottom:S.bd, borderRight:S.bdL, width:W_ITEM, minWidth:W_ITEM }}>
                <div style={{ padding:'10px 16px', fontSize:12, fontWeight:700, color:S.t3, letterSpacing:'.05em', textTransform:'uppercase' }}>안건</div>
              </th>

              {/* 직전 회의 헤더들 */}
              {pastCols.map(m => (
                <th key={m.id} style={{ position:'sticky', top:0, zIndex:3, background:S.bg, borderBottom:S.bd, borderLeft:S.bd, width:W_PAST, minWidth:W_PAST }}>
                  <div className="flex flex-col items-center gap-1" style={{ padding:'8px 6px' }}>
                    <span style={{ fontSize:13, fontWeight:600, color:S.t1 }}>{formatDate(m.meeting_date)}</span>
                    <span style={{ fontSize:10, background:S.bgRow, color:S.t3, border:S.bd, padding:'1px 6px', borderRadius:99, fontWeight:600 }}>완료</span>
                    <button onClick={() => router.push(`/meetings/${m.id}`)}
                      className="text-[10px] text-gray-400 hover:text-gray-700 border border-gray-200 px-2 py-0.5 rounded-full hover:bg-gray-50 transition-colors whitespace-nowrap">
                      회의록 →
                    </button>
                  </div>
                </th>
              ))}

              {/* 이번 회의 헤더 */}
              {nowCol ? (
                <th style={{ position:'sticky', top:0, zIndex:3, background:S.bgNow, borderBottom:S.bdL, borderLeft:S.bdL, width:W_NOW, minWidth:W_NOW }}>
                  <div className="flex flex-col items-center" style={{ padding:'8px 8px', gap:4 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:S.t1 }}>{formatDate(nowCol.meeting_date)}</span>
                    <span style={{ fontSize:10, background:'#1B3A6B', color:'#fff', padding:'1px 8px', borderRadius:99, fontWeight:700, letterSpacing:'.04em' }}>이번 회의</span>
                    <button onClick={() => router.push(`/meetings/${nowCol.id}`)}
                      className="text-[10px] text-[#1B3A6B] bg-[#E8F0FB] border border-[#C5D8F0] px-2.5 py-0.5 rounded-full hover:bg-[#D5E6F7] transition-colors font-semibold whitespace-nowrap">
                      회의록 상세 →
                    </button>
                  </div>
                </th>
              ) : (
                <th style={{ position:'sticky', top:0, zIndex:3, background:S.bg, borderBottom:S.bd, borderLeft:S.bd, width:W_NOW, minWidth:W_NOW }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'16px 8px', fontSize:13, color:S.t3 }}>날짜를 추가해 시작하세요</div>
                </th>
              )}

              {/* + 날짜 추가 */}
              <th style={{ position:'sticky', top:0, zIndex:3, background:S.bg, borderBottom:S.bd, borderLeft:S.bd, width:W_ADD, minWidth:W_ADD }}>
                <button onClick={addMeeting}
                  className="w-full h-full hover:bg-gray-50 transition-colors flex flex-col items-center justify-center gap-1"
                  style={{ border:'none', cursor:'pointer', background:'none', padding:'8px 4px', color:S.t3, fontSize:18 }}>
                  ＋
                  <span style={{ fontSize:10, lineHeight:1.3, textAlign:'center' }}>날짜<br/>추가</span>
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
                  {/* 범주 행 */}
                  <tr>
                    <td colSpan={totalCols} style={{ position:'sticky', left:0, zIndex:2, background: hexToRgba(group.color, 0.09), borderTop:'3px solid #fff', borderBottom:S.bd, borderLeft: `3px solid ${group.color}`, padding:0 }}>
                      <div className="flex items-center gap-2 transition-colors group/grow" style={{ padding:'20px 16px', cursor:'pointer' }}
                        onClick={() => toggleGroup(group.id)}>
                        <span style={{ width:3, height:14, borderRadius:2, background:group.color, flexShrink:0 }} />
                        <span style={{ fontSize:9, color:S.t3, display:'inline-block', transition:'transform .15s', transform: isOpen?'rotate(0deg)':'rotate(-90deg)' }}>▼</span>
                        {editingGroupId === group.id ? (
                          <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
                            <input autoFocus value={editGName} onChange={e=>setEditGName(e.target.value)}
                              onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)updateGroup(group.id); if(e.key==='Escape')setEditingGroupId(null) }}
                              className="w-40 border border-gray-300 rounded px-2 py-0.5 text-sm font-bold focus:outline-none focus:border-gray-400"
                              style={{ color:S.t1 }}/>
                            <div className="flex gap-1">
                              {GROUP_COLORS.map(c => (
                                <button key={c} onClick={()=>setEditGColor(c)}
                                  style={{ width:13, height:13, borderRadius:'50%', background:c, border: editGColor===c ? `2px solid ${c}` : '2px solid transparent', outline: editGColor===c ? `2px solid ${c}` : 'none', cursor:'pointer', padding:0 }}/>
                              ))}
                            </div>
                            <button onClick={()=>updateGroup(group.id)} className="text-[11px] bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-2 py-0.5 rounded-lg">저장</button>
                            <button onClick={()=>setEditingGroupId(null)} className="text-[11px] text-gray-400 px-1">취소</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ fontSize:13, fontWeight:700, color:S.t1 }}>{group.name}</span>
                            <span style={{ fontSize:11, color:S.t3, background:'#E5E9F0', padding:'1px 7px', borderRadius:99 }}>{groupItems.length}</span>
                          </>
                        )}
                        {/* 파트 변경 pills (hover 시 표시) */}
                        <div className="flex gap-1 ml-1 opacity-0 group-hover/grow:opacity-100 transition-opacity" onClick={e=>e.stopPropagation()}>
                          {MATRIX_CATS.map(c => (
                            <button key={c} onClick={() => updateGroupCat(group.id, c)}
                              className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold transition-all ${group.category === c ? CAT_CLS[c] : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                              {c}
                            </button>
                          ))}
                        </div>
                        <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover/grow:opacity-100 transition-opacity" onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>{ setEditingGroupId(group.id); setEditGName(group.name); setEditGColor(group.color) }}
                            className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors">수정</button>
                          {deletingGroup === group.id ? (
                            <>
                              <span className="text-[10px] text-gray-500">범주 삭제?</span>
                              <button onClick={()=>deleteGroup(group.id)} className="text-[10px] text-red-500 font-semibold px-1.5 py-0.5 rounded">삭제</button>
                              <button onClick={()=>setDeletingGroup(null)} className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded">취소</button>
                            </>
                          ) : (
                            <button onClick={()=>setDeletingGroup(group.id)} className="text-[10px] text-gray-300 hover:text-red-400 transition-colors">삭제</button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* 안건 행들 */}
                  {isOpen && groupItems.map(item => {
                    const itemSubTasks = subTasks.filter(st => st.agenda_item_id === item.id)
                    const isItemExpanded = expandedItems.has(item.id)
                    const pNote = prevNote(item.id)
                    return (
                      <Fragment key={item.id}>
                        <tr style={{ borderBottom: isItemExpanded ? 'none' : S.bd }} className="hover:bg-gray-50/40 group/irow">

                          {/* 안건 셀 */}
                          <td style={{ position:'sticky', left:0, zIndex:2, background: S.bg, borderRight:S.bdL, width:W_ITEM, minWidth:W_ITEM, verticalAlign:'top' }}>
                            <div style={{ padding:'10px 16px', display:'flex', alignItems:'flex-start', gap:9 }}>
                              <button onClick={()=>toggleExpandedItem(item.id)}
                                style={{ fontSize:8, color:S.t3, background:'none', border:'none', cursor:'pointer', padding:0, lineHeight:1, transition:'transform .15s', transform: isItemExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink:0, marginTop:6, width:10 }}>▶</button>
                              <button onClick={()=>cycleStatus(item)} title={`상태: ${STATUS_LABEL[item.status]}`}
                                style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, marginTop:6, background: item.status === 'active' ? (CAT_BORDER[group.category ?? ''] ?? group.color) : STATUS_COLOR[item.status], border:'none', cursor:'pointer', padding:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                {editingItemId === item.id ? (
                                  <input autoFocus value={editITitle} onChange={e=>setEditITitle(e.target.value)}
                                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)updateItem(item.id); if(e.key==='Escape')setEditingItemId(null) }}
                                    className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-400 font-medium w-full mb-1"
                                    style={{ color:S.t1 }}/>
                                ) : (
                                  <div style={{ fontSize:14, fontWeight:500, color: item.status==='done' ? S.t3 : S.t1, lineHeight:1.4, marginBottom:4, textDecoration: item.status==='done'?'line-through':'none' }}>
                                    {item.title}
                                  </div>
                                )}
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                  <button onClick={()=>cycleItemType(item)} title="클릭하여 유형 변경"
                                    className={`text-[11px] px-1.5 py-0.5 rounded-full border font-semibold hover:opacity-70 transition-opacity cursor-pointer ${TYPE_CLS[item.item_type]}`}>
                                    {TYPE_LABEL[item.item_type]}
                                  </button>
                                  {itemSubTasks.length > 0 && (
                                    <span style={{ fontSize:10, color:S.t3, background:'#E5E9F0', padding:'1px 6px', borderRadius:99 }}>
                                      {itemSubTasks.filter(st=>st.status!=='done').length}/{itemSubTasks.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 opacity-0 group-hover/irow:opacity-100 transition-opacity flex-shrink-0">
                                {editingItemId !== item.id && (
                                  <button onClick={()=>{ setEditingItemId(item.id); setEditITitle(item.title) }}
                                    className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                                )}
                                {deletingItem === item.id ? (
                                  <>
                                    <button onClick={()=>deleteItem(item.id)} className="text-[10px] text-red-500 font-semibold">삭제</button>
                                    <button onClick={()=>setDeletingItem(null)} className="text-[10px] text-gray-400">취소</button>
                                  </>
                                ) : (
                                  <button onClick={()=>setDeletingItem(item.id)} className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 직전 회의 노트 셀들 */}
                          {pastCols.map(m => {
                            const note = notes[nk(item.id, m.id)] ?? ''
                            return (
                              <td key={m.id}
                                style={{ borderLeft:S.bd, width:W_PAST, minWidth:W_PAST, verticalAlign:'top', cursor: note?'pointer':'default' }}
                                onClick={() => note && setExpandedNote({ date:formatDate(m.meeting_date), itemTitle:item.title, note, meetingId:m.id })}
                                className={note ? 'hover:bg-blue-50/30' : ''}
                              >
                                <div style={{ padding:'9px 11px', minHeight:68 }}>
                                  {note
                                    ? <div style={{ fontSize:13, color:S.t2, lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:5, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{note}</div>
                                    : <div style={{ fontSize:12, color:'#C8D5E8' }}>—</div>
                                  }
                                </div>
                              </td>
                            )
                          })}

                          {/* 이번 회의 노트 셀 */}
                          {nowCol ? (
                            <td style={{ borderLeft:S.bdL, background:S.bgNow, width:W_NOW, minWidth:W_NOW, verticalAlign:'top' }}>
                              <div style={{ padding:'9px 11px' }}>
                                {pNote && (
                                  <div style={{ marginBottom:6, padding:'4px 8px', borderLeft:`2px solid #BDD0EA`, borderRadius:'0 4px 4px 0', background:'rgba(15,30,54,.04)' }}>
                                    <div style={{ fontSize:10, fontWeight:700, color:S.t3, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:1 }}>직전</div>
                                    <div style={{ fontSize:11, color:S.t3, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{pNote}</div>
                                  </div>
                                )}
                                <textarea
                                  value={notes[nk(item.id, nowCol.id)] ?? ''}
                                  onChange={e => handleNote(item.id, nowCol.id, e.target.value)}
                                  placeholder="오늘 논의 내용 입력…"
                                  rows={4}
                                  style={{ width:'100%', border:'none', background:'transparent', resize:'none', fontSize:13, color:S.t1, lineHeight:1.65, fontFamily:'inherit', outline:'none', minHeight:60 }}
                                />
                              </div>
                            </td>
                          ) : (
                            <td style={{ borderLeft:S.bd, width:W_NOW, minWidth:W_NOW }} />
                          )}

                          <td style={{ borderLeft:S.bd, width:W_ADD, minWidth:W_ADD }} />
                        </tr>

                        {/* 하위 태스크 행들 */}
                        {isItemExpanded && itemSubTasks.map(st => (
                          <tr key={st.id} style={{ borderBottom: S.bd, background:'#FAFBFD' }} className="group/strow">
                            <td style={{ position:'sticky', left:0, zIndex:2, background:'#FAFBFD', borderRight:S.bdL, width:W_ITEM, minWidth:W_ITEM, verticalAlign:'middle' }}>
                              <div style={{ padding:'7px 16px 7px 42px', display:'flex', alignItems:'center', gap:8 }}>
                                <button onClick={()=>cycleSubTaskStatus(st)} title={`상태: ${STATUS_LABEL[st.status]}`}
                                  style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background: st.status === 'active' ? (CAT_BORDER[group.category ?? ''] ?? group.color) : STATUS_COLOR[st.status], border:'none', cursor:'pointer', padding:0 }} />
                                {editingSTId === st.id ? (
                                  <input autoFocus value={editSTTitle} onChange={e=>setEditSTTitle(e.target.value)}
                                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)updateSubTask(st.id); if(e.key==='Escape')setEditingSTId(null) }}
                                    className="border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-gray-400 flex-1 min-w-0"
                                    style={{ color:S.t2 }}/>
                                ) : (
                                  <button onClick={()=>router.push(`/subtasks/${st.id}`)}
                                    style={{ fontSize:13, color: st.status==='done' ? S.t3 : S.t2, textDecoration: st.status==='done' ? 'line-through' : 'none', flex:1, minWidth:0, background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}
                                    className="hover:underline">
                                    {st.title}
                                  </button>
                                )}
                                <div className="opacity-0 group-hover/strow:opacity-100 transition-opacity flex-shrink-0 flex items-center gap-1.5">
                                  {editingSTId !== st.id && (
                                    <button onClick={()=>{ setEditingSTId(st.id); setEditSTTitle(st.title) }}
                                      className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                                  )}
                                  {deletingST === st.id ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={()=>deleteSubTask(st.id)} className="text-[10px] text-red-500 font-semibold">삭제</button>
                                      <button onClick={()=>setDeletingST(null)} className="text-[10px] text-gray-400">취소</button>
                                    </div>
                                  ) : (
                                    <button onClick={()=>setDeletingST(st.id)} className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                                  )}
                                </div>
                              </div>
                            </td>
                            {pastCols.map(m => <td key={m.id} style={{ borderLeft:S.bd, background:'rgba(0,0,0,0.01)' }} />)}
                            {nowCol ? <td style={{ borderLeft:S.bdL, background:'rgba(240,244,250,0.5)' }} /> : <td />}
                            <td style={{ borderLeft:S.bd }} />
                          </tr>
                        ))}

                        {/* 하위 태스크 추가 행 */}
                        {isItemExpanded && (
                          <tr key={`add-st-${item.id}`} style={{ borderBottom: S.bd, background:'#FAFBFD' }}>
                            <td colSpan={totalCols} style={{ padding:0 }}>
                              {addingSubTask === item.id ? (
                                <div className="flex items-center gap-2 px-10 py-2">
                                  <input autoFocus value={newSTTitle} onChange={e=>setNewSTTitle(e.target.value)}
                                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)addSubTask(item.id); if(e.key==='Escape'){setAddingSubTask(null);setNewSTTitle('')} }}
                                    placeholder="하위 태스크 입력 후 Enter"
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                                  <button onClick={()=>addSubTask(item.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                                  <button onClick={()=>{setAddingSubTask(null);setNewSTTitle('')}} className="text-xs text-gray-400 px-2">취소</button>
                                </div>
                              ) : (
                                <div onClick={()=>setAddingSubTask(item.id)}
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

                  {/* 안건 추가 행 */}
                  {isOpen && (
                    <tr key={`add-i-${group.id}`} style={{ borderBottom:S.bd }}>
                      <td colSpan={totalCols} style={{ padding:0 }}>
                        {addingItem === group.id ? (
                          <div className="flex items-center gap-2 px-5 py-2">
                            <input autoFocus value={newITitle} onChange={e=>setNewITitle(e.target.value)}
                              onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing)addItem(group.id); if(e.key==='Escape'){setAddingItem(null);setNewITitle('')} }}
                              placeholder="안건명 입력 후 Enter"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                            <button onClick={()=>addItem(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                            <button onClick={()=>{setAddingItem(null);setNewITitle('')}} className="text-xs text-gray-400 px-2 py-1">취소</button>
                          </div>
                        ) : (
                          <div onClick={()=>{setAddingItem(group.id);setNewITitle('')}}
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

            <AddGroupForm colSpan={totalCols} />
          </tbody>
        </table>
      </div>

      {/* 노트 상세 팝업 */}
      {expandedNote && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background:'rgba(0,0,0,.18)' }}
          onClick={() => setExpandedNote(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 max-w-md w-[90%] relative"
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setExpandedNote(null)} className="absolute top-3 right-4 text-gray-300 hover:text-gray-600 text-xl leading-none">×</button>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{expandedNote.date}</div>
            <div className="text-sm font-semibold text-gray-800 mb-3">{expandedNote.itemTitle}</div>
            <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{expandedNote.note}</div>
            <button
              onClick={() => { router.push(`/meetings/${expandedNote.meetingId}`); setExpandedNote(null) }}
              className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-medium w-full">
              회의록에서 전체 보기 →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
