'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'
import { generateMeetingsContextMd, downloadMd } from '@/lib/markdown'

const DEFAULT_CATS = ['코어', '비즈', '개인', '기타']

const CATEGORY_COLORS: Record<string, string> = {
  '코어':    'bg-[#1A3562]/50 text-[#A8C8F0] border-[#C7D8F0]/30',
  '비즈':    'bg-[#5A4A10]/50 text-[#F3E482] border-[#F3E482]/30',
  '경영진':  'bg-[#1E3A6B]/50 text-[#90A7D8] border-[#90A7D8]/30',
  '본부장':  'bg-[#2D5A35]/50 text-[#BFE4B5] border-[#BFE4B5]/30',
  '타팀':    'bg-white/[0.08] text-[rgba(226,232,240,0.5)] border-white/[0.1]',
  '기타':    'bg-white/[0.08] text-[rgba(226,232,240,0.4)] border-white/[0.1]',
}

const CAT_CARD_TOP_COLORS: Record<string, string> = {
  '코어':    '#A8C0E0',
  '비즈':    '#F3E482',
  '경영진':  '#90A7D8',
  '본부장':  '#BFE4B5',
  '타팀':    'rgba(255,255,255,0.2)',
  '기타':    'rgba(255,255,255,0.2)',
}

function formatYM(ym: string): string {
  if (ym === '날짜 없음') return '날짜 미지정'
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
const pOff = 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#E2E8F0]'

interface TaskLinkRow {
  meeting_id: string
  tasks: { id: string; title: string; status: string } | null
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [taskLinks, setTaskLinks] = useState<TaskLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [catFilter, setCatFilter] = useState<string>('전체')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [catOrder, setCatOrder] = useState<string[]>([...DEFAULT_CATS])
  const [dragCat, setDragCat] = useState<string | null>(null)
  const [dragOverCat, setDragOverCat] = useState<string | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatPos, setEditCatPos] = useState({ x: 0, y: 0 })
  const [expandedTaskCards, setExpandedTaskCards] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    let savedOrder: string[] = [...DEFAULT_CATS]
    try {
      const saved = localStorage.getItem('meetings_cat_order')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        const filtered = parsed.filter((c: string) => typeof c === 'string')
        if (filtered.length > 0) savedOrder = filtered
      }
    } catch {}

    Promise.all([
      supabase.from('meetings').select('*').order('meeting_date', { ascending: false, nullsFirst: false }),
      supabase.from('task_meeting_links').select('meeting_id, tasks(id, title, status)'),
    ]).then(([{ data: m }, { data: l }]) => {
      const loadedMeetings = (m ?? []) as Meeting[]
      setMeetings(loadedMeetings)
      setTaskLinks((l ?? []) as unknown as TaskLinkRow[])

      // DB에 있는 범주 중 catOrder에 없는 것을 자동 추가
      const dbCats = [...new Set(loadedMeetings.map(mt => mt.category).filter((c): c is string => !!c && c !== '기타'))]
      const missing = dbCats.filter(c => !savedOrder.includes(c))
      if (missing.length > 0) {
        const withoutGita = savedOrder.filter(c => c !== '기타')
        const next = [...withoutGita, ...missing, ...(savedOrder.includes('기타') ? ['기타'] : [])]
        savedOrder = next
        localStorage.setItem('meetings_cat_order', JSON.stringify(next))
      }
      setCatOrder(savedOrder)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!editingCatId) return
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('[data-cat-dd]') && !t.closest('[data-cat-trigger]')) setEditingCatId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [editingCatId])

  async function handleAdd() {
    if (!newTitle.trim()) { setAdding(false); return }
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase.from('meetings')
      .insert({ title: newTitle.trim(), meeting_date: today, notes: [] }).select().single()
    if (data) { setNewTitle(''); setAdding(false); router.push(`/meetings/${(data as Meeting).id}`) }
  }

  async function deleteChecked() {
    if (checkedIds.size === 0) return
    if (!confirm(`선택한 ${checkedIds.size}개 회의록을 삭제하시겠습니까?`)) return
    await supabase.from('meetings').delete().in('id', Array.from(checkedIds))
    setMeetings(prev => prev.filter(m => !checkedIds.has(m.id)))
    setCheckedIds(new Set())
  }

  function downloadChecked() {
    const selected = meetings.filter(m => checkedIds.has(m.id))
    const md = generateMeetingsContextMd(selected.map(m => ({ title: m.title, meeting_date: m.meeting_date, category: m.category, notes: m.notes })))
    downloadMd(md, selected.length === 1 ? selected[0].title : `회의록-${selected.length}건`)
  }

  function saveCatOrder(next: string[]) {
    setCatOrder(next)
    localStorage.setItem('meetings_cat_order', JSON.stringify(next))
  }

  function addCategory() {
    const name = newCatName.trim()
    if (!name || catOrder.includes(name) || name === '기타') return
    saveCatOrder([...catOrder, name])
    setNewCatName('')
    setAddingCat(false)
  }

  function deleteCategory(cat: string) {
    saveCatOrder(catOrder.filter(c => c !== cat))
    if (catFilter === cat) setCatFilter('전체')
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleCat(cat: string) {
    setCollapsedCats(prev => { const s = new Set(prev); s.has(cat) ? s.delete(cat) : s.add(cat); return s })
  }
  function toggleMonth(key: string) {
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  function onCatDragStart(e: React.DragEvent, cat: string) {
    e.dataTransfer.effectAllowed = 'move'
    setDragCat(cat)
  }
  function onCatDragOver(e: React.DragEvent, cat: string) {
    e.preventDefault()
    if (dragCat && dragCat !== cat) setDragOverCat(cat)
  }
  function onCatDrop(targetCat: string) {
    if (!dragCat || dragCat === targetCat) return
    const next = [...catOrder]
    const fi = next.indexOf(dragCat), ti = next.indexOf(targetCat)
    if (fi === -1 || ti === -1) return
    next.splice(fi, 1); next.splice(ti, 0, dragCat)
    saveCatOrder(next)
    setDragCat(null); setDragOverCat(null)
  }

  function openCatEdit(e: React.MouseEvent, meetingId: string) {
    e.stopPropagation(); e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setEditCatPos({ x: rect.left, y: rect.bottom + 4 })
    setEditingCatId(prev => prev === meetingId ? null : meetingId)
  }
  async function updateMeetingCat(meetingId: string, category: string | null) {
    await supabase.from('meetings').update({ category: category || null }).eq('id', meetingId)
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, category: (category ?? undefined) as string | undefined } as Meeting : m))
    setEditingCatId(null)
  }

  const categoryGroups = useMemo(() => {
    const effectiveCats = catOrder
    const nonGitaCats = catOrder.filter(c => c !== '기타')
    const all = catFilter === '전체'
      ? meetings
      : catFilter === '기타'
        ? meetings.filter(m => m.category === '기타' || !m.category || !nonGitaCats.includes(m.category ?? ''))
        : meetings.filter(m => m.category === catFilter)

    function buildMonths(items: Meeting[]) {
      const map = new Map<string, Meeting[]>()
      items.forEach(m => {
        const ym = m.meeting_date ? m.meeting_date.slice(0, 7) : '날짜 없음'
        if (!map.has(ym)) map.set(ym, [])
        map.get(ym)!.push(m)
      })
      return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([ym, items]) => ({ ym, items }))
    }

    if (catFilter !== '전체') {
      if (all.length === 0) return []
      return [{ cat: catFilter, items: all, months: buildMonths(all) }]
    }

    const groups = effectiveCats
      .map(cat => {
        const items = cat === '기타'
          ? all.filter(m => m.category === '기타' || !m.category || !nonGitaCats.includes(m.category ?? ''))
          : all.filter(m => m.category === cat)
        if (items.length === 0) return null
        return { cat, items, months: buildMonths(items) }
      })
      .filter(Boolean) as { cat: string; items: Meeting[]; months: { ym: string; items: Meeting[] }[] }[]

    // catOrder에 '기타'가 없어도 미분류 회의록은 항상 표시
    if (!catOrder.includes('기타')) {
      const assignedIds = new Set(groups.flatMap(g => g.items.map(m => m.id)))
      const leftovers = all.filter(m => !assignedIds.has(m.id))
      if (leftovers.length > 0) {
        groups.push({ cat: '기타', items: leftovers, months: buildMonths(leftovers) })
      }
    }

    return groups
  }, [meetings, catFilter, catOrder])

  const tasksMap = useMemo(() => {
    const map: Record<string, { id: string; title: string; status: string }[]> = {}
    taskLinks.forEach(l => {
      if (!l.tasks) return
      if (!map[l.meeting_id]) map[l.meeting_id] = []
      map[l.meeting_id].push(l.tasks)
    })
    return map
  }, [taskLinks])

  function toggleTaskCard(id: string) {
    setExpandedTaskCards(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const totalFiltered = categoryGroups.reduce((s, g) => s + g.items.length, 0)
  const pillFilters = ['전체', ...catOrder]

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans" style={{ background: '#0F1319', minHeight: '100%' }}>

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold" style={{ color: '#E2E8F0' }}>회의록</h1>

        <div className="flex-1" />

        {checkedIds.size > 0 && (
          <>
            <button onClick={downloadChecked} className={`${pill} ${pOff}`}>MD 다운로드 ({checkedIds.size})</button>
            <button onClick={deleteChecked}
              className="text-xs px-3 py-1.5 rounded-full transition-all"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              {checkedIds.size}개 삭제
            </button>
          </>
        )}
          <button onClick={() => setAdding(true)}
            className="text-sm px-4 py-2 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#E2E8F0' }}>
            + 새 회의록
          </button>
      </div>

      {/* 목록 뷰 */}
      <>

      {adding && (
        <div className="flex-shrink-0 rounded-2xl px-5 py-4 mb-3"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.07) inset' }}>
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
            onBlur={handleAdd}
            placeholder="회의 제목 입력 후 Enter"
            className="w-full text-sm focus:outline-none bg-transparent placeholder:text-[rgba(226,232,240,0.3)]"
            style={{ color: '#E2E8F0' }} />
        </div>
      )}

      {/* 범주 필터 pills + 추가/삭제 (pill 드래그로 순서 변경) */}
      <div className="flex-shrink-0 flex items-center gap-1.5 mb-5 overflow-x-auto scrollbar-hide">
        {pillFilters.map(c => (
          <div
            key={c}
            className={`relative group/pill flex-shrink-0 transition-opacity ${dragCat === c ? 'opacity-40' : ''}`}
            draggable={c !== '전체'}
            onDragStart={e => { if (c !== '전체') { e.dataTransfer.effectAllowed = 'move'; setDragCat(c) } }}
            onDragOver={e => { e.preventDefault(); if (dragCat && dragCat !== c && c !== '전체') setDragOverCat(c) }}
            onDrop={() => onCatDrop(c)}
            onDragEnd={() => { setDragCat(null); setDragOverCat(null) }}
          >
            <button
              onClick={() => setCatFilter(c)}
              className={`${pill} transition-all ${catFilter === c ? pOn : pOff} ${dragOverCat === c && dragCat !== c ? 'ring-2 ring-blue-400' : ''}`}>
              {c !== '전체' && <span className="text-[8px] opacity-30 mr-1 cursor-grab">⠿</span>}
              {c}
            </button>
            {/* '전체'와 '기타'는 삭제 불가 */}
            {c !== '전체' && c !== '기타' && (
              <button
                onClick={e => { e.stopPropagation(); deleteCategory(c) }}
                title="범주 삭제"
                className="absolute -top-1 -right-1 w-4 h-4 text-white rounded-full text-[9px] hidden group-hover/pill:flex items-center justify-center z-10 transition-colors shadow-sm"
                style={{ background: 'rgba(239,68,68,0.85)' }}>
                ×
              </button>
            )}
          </div>
        ))}
        {addingCat ? (
          <input
            autoFocus
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) addCategory()
              if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') }
            }}
            onBlur={() => { if (!newCatName.trim()) setAddingCat(false) }}
            placeholder="범주명 입력"
            className="text-xs px-3 py-1.5 rounded-full border focus:outline-none w-28 flex-shrink-0 placeholder:text-[rgba(226,232,240,0.3)]"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#E2E8F0' }}
          />
        ) : (
          <button
            onClick={() => setAddingCat(true)}
            className="text-xs border border-dashed rounded-full px-2.5 py-1.5 transition-colors flex-shrink-0 whitespace-nowrap"
            style={{ color: 'rgba(226,232,240,0.3)', borderColor: 'rgba(255,255,255,0.15)' }}>
            + 범주
          </button>
        )}
        <span className="text-xs ml-auto shrink-0" style={{ color: 'rgba(226,232,240,0.5)' }}>{totalFiltered}건</span>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="h-10 animate-pulse my-1 rounded-md"
                style={{ background: 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        ) : categoryGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-sm" style={{ color: 'rgba(226,232,240,0.28)' }}>해당 카테고리의 회의록이 없습니다</p>
            <button onClick={() => setCatFilter('전체')} className={`${pill} ${pOff}`}>전체 보기</button>
          </div>
        ) : (
          <div className="space-y-8 pb-6">
            {categoryGroups.map(({ cat, items, months }) => {
              const isCatCollapsed = collapsedCats.has(cat)
              const isDragOver = dragOverCat === cat && dragCat !== cat
              return (
                <div key={cat}
                  draggable={catFilter === '전체'}
                  onDragStart={e => onCatDragStart(e, cat)}
                  onDragOver={e => onCatDragOver(e, cat)}
                  onDrop={() => onCatDrop(cat)}
                  onDragEnd={() => { setDragCat(null); setDragOverCat(null) }}
                  className={`transition-all ${isDragOver ? 'translate-y-1 opacity-70' : ''} ${dragCat === cat ? 'opacity-40' : ''}`}>

                  {catFilter === '전체' ? (
                    <button onClick={() => toggleCat(cat)}
                      className="flex items-center gap-2.5 w-full text-left group py-2 mb-3 pb-3"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-xs cursor-grab select-none" style={{ color: 'rgba(226,232,240,0.28)' }} title="드래그하여 순서 변경">⠿</span>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${CATEGORY_COLORS[cat] ?? 'bg-white/[0.08] text-[rgba(226,232,240,0.4)] border-white/[0.1]'}`}>
                        {cat}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ color: 'rgba(226,232,240,0.5)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        {items.length}건
                      </span>
                      <span className="text-[10px] transition-colors ml-auto" style={{ color: 'rgba(226,232,240,0.28)' }}>
                        {isCatCollapsed ? '▶' : '▼'}
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 py-2 mb-3 pb-3"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${CATEGORY_COLORS[cat] ?? 'bg-white/[0.08] text-[rgba(226,232,240,0.4)] border-white/[0.1]'}`}>
                        {cat}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ color: 'rgba(226,232,240,0.5)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        {items.length}건
                      </span>
                    </div>
                  )}

                  {!isCatCollapsed && (
                    <div className="space-y-5">
                      {months.map(({ ym, items: monthItems }, idx) => {
                        const monthKey = `${cat}-${ym}`
                        const isMonthCollapsed = collapsedMonths.has(monthKey)
                        const isLatest = idx === 0
                        return (
                          <div key={ym}>
                            <button onClick={() => toggleMonth(monthKey)}
                              className="flex items-center gap-2 w-full text-left group mb-2">
                              <span className="text-xs font-semibold transition-colors"
                                style={{ color: 'rgba(226,232,240,0.5)' }}>{formatYM(ym)}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                style={{ color: 'rgba(226,232,240,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {monthItems.length}건
                              </span>
                              {isLatest && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                                  style={{ color: '#90B8E0', background: 'rgba(27,58,107,0.4)', border: '1px solid rgba(144,184,224,0.3)' }}>
                                  최신
                                </span>
                              )}
                              <span className="text-[10px] transition-colors ml-auto"
                                style={{ color: 'rgba(226,232,240,0.28)' }}>
                                {isMonthCollapsed ? '▶' : '▼'}
                              </span>
                            </button>

                            {!isMonthCollapsed && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                                {monthItems.map(meeting => {
                                  const meetingTasks = tasksMap[meeting.id] ?? []
                                  const accentColor = CAT_CARD_TOP_COLORS[meeting.category ?? cat] ?? CAT_CARD_TOP_COLORS['기타']
                                  return (
                                    <div key={meeting.id}
                                      onClick={() => router.push(`/meetings/${meeting.id}`)}
                                      className="group/row flex items-center gap-3 py-2.5 cursor-pointer rounded-md -mx-2 px-2 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium truncate" style={{ color: '#E2E8F0' }}>
                                          {meeting.title || '제목 없음'}
                                        </p>
                                        {meetingTasks.length > 0 && (
                                          <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(226,232,240,0.4)' }}
                                            onClick={e => e.stopPropagation()}>
                                            {meetingTasks.slice(0, 2).map(t => t.title).join(' · ')}
                                            {meetingTasks.length > 2 ? ` +${meetingTasks.length - 2}` : ''}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <input type="checkbox" checked={checkedIds.has(meeting.id)}
                                          onChange={() => toggleCheck(meeting.id)}
                                          onClick={e => e.stopPropagation()}
                                          className="w-3 h-3 rounded accent-gray-400 cursor-pointer opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                        {meeting.notes.length > 0 && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                                            style={{ color: 'rgba(226,232,240,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            {meeting.notes.length}노트
                                          </span>
                                        )}
                                        <button
                                          data-cat-trigger="true"
                                          onClick={e => openCatEdit(e, meeting.id)}
                                          className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium transition-all opacity-0 group-hover/row:opacity-100 ${CATEGORY_COLORS[meeting.category ?? '기타'] ?? CATEGORY_COLORS['기타']}`}>
                                          {meeting.category ?? '분류'}
                                        </button>
                                        <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.28)' }}>
                                          {meeting.meeting_date ? format(parseISO(meeting.meeting_date), 'M.d (E)', { locale: ko }) : '미지정'}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            <button onClick={() => setAdding(true)}
              className="w-full rounded-3xl py-5 transition-all text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(226,232,240,0.4)' }}>
              + 새 회의록
            </button>
          </div>
        )}
      </div>
      </>

      {/* 범주 수정 드롭다운 */}
      {editingCatId && typeof document !== 'undefined' && createPortal(
        <div
          data-cat-dd="true"
          style={{
            position: 'fixed',
            left: editCatPos.x,
            top: editCatPos.y,
            zIndex: 1000,
            background: 'rgba(19,21,28,0.96)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          }}
          className="rounded-xl p-1.5 min-w-[90px]">
          {catOrder.map(c => (
            <button key={c} onClick={() => updateMeetingCat(editingCatId, c)}
              className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              style={
                meetings.find(m => m.id === editingCatId)?.category === c
                  ? { fontWeight: 600, color: '#E2E8F0', background: 'rgba(255,255,255,0.1)' }
                  : { color: 'rgba(226,232,240,0.5)' }
              }>
              {c}
            </button>
          ))}
          <button onClick={() => updateMeetingCat(editingCatId, null)}
            className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg transition-colors mt-0.5 hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: 'rgba(226,232,240,0.28)', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'block' }}>
            분류 없음
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
