'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'
import { generateMeetingsContextMd, downloadMd } from '@/lib/markdown'
import AgendaMatrix from '@/components/meetings/AgendaMatrix'

const DEFAULT_CATS = ['코어', '비즈', '개인', '기타']

const CATEGORY_COLORS: Record<string, string> = {
  '코어':    'bg-[#C7D8F0]/40 text-[#1A3562] border-[#C7D8F0]/55',
  '비즈':    'bg-[#F3E482]/40 text-[#5A4A10] border-[#F3E482]/55',
  '경영진':  'bg-[#90A7D8]/30 text-[#1E3A6B] border-[#90A7D8]/45',
  '본부장':  'bg-[#BFE4B5]/40 text-[#2D5A35] border-[#BFE4B5]/55',
  '타팀':    'bg-gray-100/80 text-gray-500 border-gray-200',
  '목표관리':'bg-[#EBA698]/25 text-[#6B2D25] border-[#EBA698]/40',
  '기타':    'bg-gray-100/80 text-gray-400 border-gray-200',
}

const CAT_CARD_BG: Record<string, string> = {
  '코어':    'border-t-[#A8C0E0]',
  '비즈':    'border-t-[#F3E482]',
  '경영진':  'border-t-[#90A7D8]',
  '본부장':  'border-t-[#BFE4B5]',
  '타팀':    'border-t-gray-200',
  '목표관리':'border-t-[#EBA698]',
  '기타':    'border-t-gray-200',
}

function formatYM(ym: string): string {
  if (ym === '날짜 없음') return '날짜 미지정'
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
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

  // 뷰 모드
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list')
  const [matrixCat, setMatrixCat] = useState<string>('코어')

  // 범주 추가
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // 카드 범주 수정
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatPos, setEditCatPos] = useState({ x: 0, y: 0 })

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('meetings').select('*').order('meeting_date', { ascending: false, nullsFirst: false })
      .then(({ data }) => { setMeetings((data ?? []) as Meeting[]); setLoading(false) })
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('meetings_cat_order')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        const filtered = parsed.filter((c: string) => typeof c === 'string')
        if (filtered.length > 0) setCatOrder(filtered)
      }
    } catch {}
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

  const totalFiltered = categoryGroups.reduce((s, g) => s + g.items.length, 0)
  const pillFilters = ['전체', ...catOrder]

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">회의록</h1>

        {/* 뷰 토글 */}
        <div className="flex items-center gap-0.5 bg-white/50 border border-white/70 rounded-full px-1 py-1">
          <button
            onClick={() => setViewMode('list')}
            className={`text-xs px-3 py-1 rounded-full transition-all font-medium ${viewMode === 'list' ? 'bg-[#1B3A6B] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            목록
          </button>
          <button
            onClick={() => setViewMode('matrix')}
            className={`text-xs px-3 py-1 rounded-full transition-all font-medium ${viewMode === 'matrix' ? 'bg-[#1B3A6B] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            안건 매트릭스
          </button>
        </div>

        <div className="flex-1" />

        {viewMode === 'list' && checkedIds.size > 0 && (
          <>
            <button onClick={downloadChecked} className={`${pill} ${pOff}`}>MD 다운로드 ({checkedIds.size})</button>
            <button onClick={deleteChecked}
              className="text-xs bg-red-50 border border-red-200 text-red-500 px-3 py-1.5 rounded-full hover:bg-red-100 transition-all">
              {checkedIds.size}개 삭제
            </button>
          </>
        )}
        {viewMode === 'list' && (
          <button onClick={() => setAdding(true)}
            className="text-sm bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-4 py-2 rounded-full hover:bg-[#D5E6F7] transition-colors shadow-sm">
            + 새 회의록
          </button>
        )}
      </div>

      {/* 안건 매트릭스 뷰 */}
      {viewMode === 'matrix' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* 파트 탭 */}
          <div className="flex-shrink-0 flex items-center gap-2 mb-4">
            {['전체', ...catOrder].map(c => (
              <button key={c}
                onClick={() => setMatrixCat(c)}
                className={`text-xs px-3.5 py-1.5 rounded-full border font-semibold transition-all ${
                  matrixCat === c
                    ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                    : 'bg-white/40 border-white/60 text-gray-500 hover:bg-white/60'
                }`}>
                {c}
              </button>
            ))}
            {matrixCat !== '전체' && (
              <div className="flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border text-emerald-700 bg-emerald-50 border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                회의록 동기화
              </div>
            )}
          </div>
          <AgendaMatrix key={matrixCat} category={matrixCat} allCats={catOrder} />
        </div>
      )}

      {/* 목록 뷰 */}
      {viewMode === 'list' && (
        <>

      {adding && (
        <div className="flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/80 px-5 py-4 mb-3 shadow-sm">
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
            onBlur={handleAdd}
            placeholder="회의 제목 입력 후 Enter"
            className="w-full text-sm focus:outline-none text-gray-700 bg-transparent" />
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
              className={`${pill} transition-all ${catFilter === c ? pOn : pOff} ${dragOverCat === c && dragCat !== c ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}>
              {c !== '전체' && <span className="text-[8px] opacity-30 mr-1 cursor-grab">⠿</span>}
              {c}
            </button>
            {/* '전체'와 '기타'는 삭제 불가 */}
            {c !== '전체' && c !== '기타' && (
              <button
                onClick={e => { e.stopPropagation(); deleteCategory(c) }}
                title="범주 삭제"
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-400 hover:bg-red-500 text-white rounded-full text-[9px] hidden group-hover/pill:flex items-center justify-center z-10 transition-colors shadow-sm">
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
            className="text-xs px-3 py-1.5 rounded-full border border-blue-300 focus:outline-none text-gray-700 w-28 bg-white flex-shrink-0"
          />
        ) : (
          <button
            onClick={() => setAddingCat(true)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 rounded-full px-2.5 py-1.5 transition-colors flex-shrink-0 whitespace-nowrap">
            + 범주
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto shrink-0">{totalFiltered}건</span>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-6 gap-3">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl h-28 animate-pulse" />)}
          </div>
        ) : categoryGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-gray-300 text-sm">해당 카테고리의 회의록이 없습니다</p>
            <button onClick={() => setCatFilter('전체')} className={`${pill} ${pOff} text-gray-400`}>전체 보기</button>
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

                  {catFilter === '전체' && (
                    <button onClick={() => toggleCat(cat)}
                      className="flex items-center gap-2.5 w-full text-left group py-2 mb-3 border-b border-white/40 pb-3">
                      <span className="text-gray-300 text-xs cursor-grab select-none" title="드래그하여 순서 변경">⠿</span>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${CATEGORY_COLORS[cat] ?? 'bg-gray-100/80 text-gray-400 border-gray-200'}`}>
                        {cat}
                      </span>
                      <span className="text-xs text-gray-400 bg-white/60 border border-white/70 px-2 py-0.5 rounded-full">{items.length}건</span>
                      <span className="text-[10px] text-gray-300 group-hover:text-gray-500 transition-colors ml-auto">
                        {isCatCollapsed ? '▶' : '▼'}
                      </span>
                    </button>
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
                              <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-700 transition-colors">{formatYM(ym)}</span>
                              <span className="text-[10px] text-gray-400 bg-white/50 border border-white/60 px-1.5 py-0.5 rounded-full">{monthItems.length}건</span>
                              {isLatest && <span className="text-[9px] text-[#1B3A6B] bg-[#C7D8F0]/30 border border-[#C7D8F0]/40 px-1.5 py-0.5 rounded-full">최신</span>}
                              <span className="text-[10px] text-gray-300 group-hover:text-gray-500 transition-colors ml-auto">{isMonthCollapsed ? '▶' : '▼'}</span>
                            </button>

                            {!isMonthCollapsed && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-6 gap-3">
                                {monthItems.map(meeting => (
                                  <div key={meeting.id}
                                    onClick={() => router.push(`/meetings/${meeting.id}`)}
                                    className={`group/card bg-white/40 backdrop-blur-xl border-t-2 border border-white/60 rounded-2xl p-3 hover:bg-white/60 hover:shadow-sm transition-all h-28 flex flex-col cursor-pointer ${CAT_CARD_BG[meeting.category ?? cat] ?? CAT_CARD_BG['기타']}`}>
                                    <p className="text-xs font-bold text-gray-800 leading-snug line-clamp-2 flex-1">
                                      {meeting.title || '제목 없음'}
                                    </p>
                                    <div className="flex items-center gap-1 mt-1.5 flex-shrink-0">
                                      <input type="checkbox" checked={checkedIds.has(meeting.id)}
                                        onChange={() => toggleCheck(meeting.id)}
                                        onClick={e => e.stopPropagation()}
                                        className="w-3 h-3 rounded accent-gray-700 flex-shrink-0 cursor-pointer" />
                                      <span className="text-[9px] text-neutral-400 flex-1">
                                        {meeting.meeting_date ? format(parseISO(meeting.meeting_date), 'M.d (E)', { locale: ko }) : '날짜 미지정'}
                                      </span>
                                      <button
                                        data-cat-trigger="true"
                                        onClick={e => openCatEdit(e, meeting.id)}
                                        className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium transition-all opacity-0 group-hover/card:opacity-100 ${CATEGORY_COLORS[meeting.category ?? '기타'] ?? CATEGORY_COLORS['기타']}`}>
                                        {meeting.category ?? '분류'}
                                      </button>
                                      {meeting.notes.length > 0 && (
                                        <span className="text-[9px] text-gray-400 bg-white/60 border border-white/70 px-1 py-0.5 rounded-full flex-shrink-0">
                                          {meeting.notes.length}노트
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
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
              className="w-full bg-white/20 backdrop-blur-xl border border-dashed border-white/50 rounded-3xl py-5 hover:bg-white/30 transition-all text-gray-400 hover:text-gray-600 text-xs font-medium">
              + 새 회의록
            </button>
          </div>
        )}
      </div>
      </>
      )}

      {/* 범주 수정 드롭다운 */}
      {editingCatId && typeof document !== 'undefined' && createPortal(
        <div
          data-cat-dd="true"
          style={{ position: 'fixed', left: editCatPos.x, top: editCatPos.y, zIndex: 1000 }}
          className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl shadow-2xl p-1.5 min-w-[90px]">
          {catOrder.map(c => (
            <button key={c} onClick={() => updateMeetingCat(editingCatId, c)}
              className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg transition-colors ${
                meetings.find(m => m.id === editingCatId)?.category === c
                  ? 'font-semibold text-gray-900 bg-gray-50'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {c}
            </button>
          ))}
          <button onClick={() => updateMeetingCat(editingCatId, null)}
            className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 border-t border-gray-100 mt-0.5 transition-colors">
            분류 없음
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
