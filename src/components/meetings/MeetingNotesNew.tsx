'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { Meeting } from '@/types'
import { CATEGORY_PALETTE, MEETING_CATEGORY, colorKeyFromName } from '@/lib/categoryColors'
import SearchToolbar, { type SortOrder, type DateSelection } from './SearchToolbar'
import MeetingSection from './MeetingSection'

// 팀명(코어/비즈 등)은 하드코딩하지 않음 — DB에 실제로 쓰인 category 값이 아래 useEffect에서 자동으로 추가됨.
const DEFAULT_CATS = ['개인', '경영진', '기타']

function catDot(cat: string): string {
  const key = MEETING_CATEGORY[cat] ?? colorKeyFromName(cat)
  return CATEGORY_PALETTE[key]?.solid ?? '#4A7FC0'
}

function filterByDate(meetings: Meeting[], sel: DateSelection): Meeting[] {
  if (!sel) return meetings
  return meetings.filter(m => m.meeting_date && m.meeting_date >= sel.from && m.meeting_date <= sel.to)
}

export default function MeetingNotesNew() {
  const supabase = createClient()
  const router   = useRouter()

  const [meetings,  setMeetings]  = useState<Meeting[]>([])
  const [loading,   setLoading]   = useState(true)
  const [catOrder,  setCatOrder]  = useState<string[]>([...DEFAULT_CATS])

  // 필터 상태
  const [search,         setSearch]         = useState('')
  const [dateSelection,  setDateSelection]  = useState<DateSelection>(null)
  const [teamFilter,     setTeamFilter]     = useState('전체')
  const [sortOrder,     setSortOrder]     = useState<SortOrder>('최신순')

  // 새 회의록 추가
  const [adding,    setAdding]    = useState(false)
  const [newTitle,  setNewTitle]  = useState('')

  useEffect(() => {
    let savedOrder = [...DEFAULT_CATS]
    try {
      const saved = localStorage.getItem('meetings_cat_order')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (parsed.length > 0) savedOrder = parsed
      }
    } catch {}

    supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .then(({ data: m }) => {
        const loaded = (m ?? []) as Meeting[]
        setMeetings(loaded)

        // DB에 있는 신규 범주 자동 추가
        const dbCats = [...new Set(loaded.map(mt => mt.category).filter((c): c is string => !!c && c !== '기타'))]
        const missing = dbCats.filter(c => !savedOrder.includes(c))
        if (missing.length > 0) {
          const withoutEtc = savedOrder.filter(c => c !== '기타')
          const next = [...withoutEtc, ...missing, ...(savedOrder.includes('기타') ? ['기타'] : [])]
          savedOrder = next
          localStorage.setItem('meetings_cat_order', JSON.stringify(next))
        }
        setCatOrder(savedOrder)
        setLoading(false)
      })
  }, [])

  // catOrder 변경 시 localStorage에 저장
  useEffect(() => {
    if (catOrder.length > 0) {
      localStorage.setItem('meetings_cat_order', JSON.stringify(catOrder))
    }
  }, [catOrder])

  async function handleAdd() {
    const title = newTitle.trim()
    if (!title) { setAdding(false); return }
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('meetings')
      .insert({ title, meeting_date: today, notes: [] })
      .select()
      .single()
    if (data) {
      setNewTitle('')
      setAdding(false)
      router.push(`/meetings/${(data as Meeting).id}`)
    }
  }

  // 필터링 + 정렬
  const filtered = useMemo(() => {
    let list = filterByDate(meetings, dateSelection)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(m => m.title.toLowerCase().includes(q))
    }

    if (teamFilter !== '전체') {
      const nonEtc = catOrder.filter(c => c !== '기타')
      if (teamFilter === '기타') {
        list = list.filter(m => !m.category || m.category === '기타' || !nonEtc.includes(m.category))
      } else {
        list = list.filter(m => m.category === teamFilter)
      }
    }

    if (sortOrder === '오래된순') list = [...list].sort((a, b) => (a.meeting_date ?? '').localeCompare(b.meeting_date ?? ''))
    else if (sortOrder === '제목순') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'ko'))
    // 최신순은 이미 DB 쿼리에서 정렬됨

    return list
  }, [meetings, dateSelection, search, teamFilter, sortOrder, catOrder])

  // 팀별 그룹
  const groups = useMemo(() => {
    const nonEtc = catOrder.filter(c => c !== '기타')
    // 검색/기간/팀 필터가 하나도 안 걸려있을 때만 빈 범주(회의록 0건)도 목록에 보여준다.
    // 필터가 걸려있는데 빈 범주까지 다 보이면 "필터링됐다"는 느낌이 사라지기 때문.
    const showEmptyCats = teamFilter === '전체' && !search.trim() && !dateSelection
    const result = catOrder
      .map(cat => {
        const items = cat === '기타'
          ? filtered.filter(m => !m.category || m.category === '기타' || !nonEtc.includes(m.category ?? ''))
          : filtered.filter(m => m.category === cat)
        if (items.length === 0 && !showEmptyCats) return null
        return { cat, items }
      })
      .filter(Boolean) as { cat: string; items: Meeting[] }[]

    // catOrder에 없는 범주도 표시
    const assignedIds = new Set(result.flatMap(g => g.items.map(m => m.id)))
    const leftovers = filtered.filter(m => !assignedIds.has(m.id))
    if (leftovers.length > 0 && !result.some(g => g.cat === '기타')) result.push({ cat: '기타', items: leftovers })

    return result
  }, [filtered, catOrder, teamFilter, search, dateSelection])

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#0F1319' }}>

      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center pt-6 pb-3">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: '#E2E8F0' }}>회의록</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'rgba(226,232,240,0.35)' }}>중요한 논의와 결정사항을 기록하고 관리하세요.</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors"
            style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: '#9DBEF5' }}
          >
            + 새 회의록
          </button>
        </div>
      </div>

      {/* 새 회의록 입력 폼 */}
      {adding && (
        <div
          className="flex-shrink-0 rounded-2xl px-5 py-4 mb-3"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd()
              if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
            }}
            onBlur={handleAdd}
            placeholder="회의 제목 입력 후 Enter"
            className="w-full text-[13px] bg-transparent focus:outline-none placeholder:text-[rgba(226,232,240,0.3)]"
            style={{ color: '#E2E8F0' }}
          />
        </div>
      )}

      {/* 검색 툴바 (sticky) */}
      <SearchToolbar
        search={search}             setSearch={setSearch}
        dateSelection={dateSelection} setDateSelection={setDateSelection}
        teamFilter={teamFilter}     setTeamFilter={setTeamFilter}
        sortOrder={sortOrder}       setSortOrder={setSortOrder}
        catOrder={catOrder}         setCatOrder={setCatOrder}
        total={filtered.length}
      />

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="space-y-3 pb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-[13px]" style={{ color: 'rgba(226,232,240,0.3)' }}>조건에 맞는 회의록이 없습니다</p>
            <button
              onClick={() => { setSearch(''); setDateSelection(null); setTeamFilter('전체') }}
              className="text-[12px] px-4 py-1.5 rounded-full transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="space-y-3 pb-8">
            {groups.map(({ cat, items }) => (
              <MeetingSection
                key={cat}
                cat={cat}
                meetings={items}
                dotColor={catDot(cat)}
                onNavigate={id => router.push(`/meetings/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
