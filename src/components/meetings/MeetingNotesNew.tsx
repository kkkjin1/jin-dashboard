'use client'

import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDevPilotClient } from '@/lib/supabase/devPilotClient'
import { useAutosave, clearAutosaveBuffer } from '@/hooks/useAutosave'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'
import { CATEGORY_PALETTE, MEETING_CATEGORY, colorKeyFromName } from '@/lib/categoryColors'
import { fetchMeetingNotes, fetchMeetingNoteCounts, type MeetingNotesGrouped } from '@/lib/meetingNotes'
import SearchToolbar, { type SortOrder, type DateSelection } from './SearchToolbar'
import MeetingSection from './MeetingSection'

// 팀명(코어/비즈 등)은 하드코딩하지 않음 — DB에 실제로 쓰인 category 값이 아래 useEffect에서 자동으로 추가됨.
const DEFAULT_CATS = ['개인', '경영진', '기타']

// 탭별 격리 목적 — MobileMemoSheet의 QID_STORAGE_KEY 선례와 동일한 방식(localStorage가
// 아니라 sessionStorage를 씀). "+ 새 회의록" 폼을 열 때 sessionStorage에서 qid를 읽거나
// 없으면 새로 발급해 저장 — Final Save 성공 시에만 이 키를 clear하므로, 저장하지 않고
// 폼을 닫은 경우(Escape 등)엔 같은 qid가 남아 다음에 폼을 열 때 자동저장 복구가 가능하다.
const QID_STORAGE_KEY = 'meeting_notes_new_qid'

function catDot(cat: string): string {
  const key = MEETING_CATEGORY[cat] ?? colorKeyFromName(cat)
  return CATEGORY_PALETTE[key]?.solid ?? '#4A7FC0'
}

function catStyle(cat: string): { background: string; color: string; borderColor: string } {
  const key = MEETING_CATEGORY[cat] ?? colorKeyFromName(cat)
  const p = CATEGORY_PALETTE[key]
  return { background: p.bg, color: p.text, borderColor: p.border }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function filterByDate(meetings: Meeting[], sel: DateSelection): Meeting[] {
  if (!sel) return meetings
  return meetings.filter(m => m.meeting_date && m.meeting_date >= sel.from && m.meeting_date <= sel.to)
}

export default function MeetingNotesNew() {
  const supabase = createClient()
  const router   = useRouter()

  // pilotClient가 null이면(.env.development.local 미설정) activeSupabase는 순수 JS
  // 언어 의미론(`??`)으로 반드시 supabase(프로덕션)로 귀결된다 — MobileMemoSheet/
  // Quick Memo와 동일한 원칙, 이 화면의 Supabase 호출 4곳 전부가 따른다. Autosave도
  // STEP A-2부터 이 activeSupabase를 그대로 쓴다.
  const pilotClient = getDevPilotClient()
  const activeSupabase = pilotClient ?? supabase

  const [meetings,  setMeetings]  = useState<Meeting[]>([])
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
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
  const [addError,  setAddError]  = useState('')
  const [qid, setQid] = useState('') // autosave entityId(create-flow 임시 id)

  // 우측 미리보기 패널 — 도킹 상세 편집 대신, 선택한 회의를 가볍게 훑어보는 용도(편집은 상세 페이지에서)
  const [selected, setSelected] = useState<Meeting | null>(null)
  const [previewCounts, setPreviewCounts] = useState<{ attachments: number; links: number } | null>(null)
  const [selectedNotes, setSelectedNotes] = useState<MeetingNotesGrouped | null>(null)

  // 헤더(제목+검색+버튼) + 새 회의록 폼 + SearchToolbar 영역의 실측 높이 — 미리보기
  // 패널의 marginTop으로 그대로 써서, 카테고리 그룹 박스 상단과 미리보기 패널 상단을
  // 항상 맞춘다. 폼 열림/닫힘처럼 실제 레이아웃 흐름에 영향을 주는 변화만 반영되고,
  // 캘린더 드롭다운처럼 absolute 포지션인 오버레이는 흐름 밖이라 높이에 영향 없음.
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setHeaderHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!selected) { setPreviewCounts(null); return }
    let cancelled = false
    Promise.all([
      activeSupabase.from('attachments').select('id', { count: 'exact', head: true }).eq('meeting_id', selected.id),
      activeSupabase.from('meeting_agenda_links').select('id', { count: 'exact', head: true }).eq('meeting_id', selected.id),
    ]).then(([attRes, linkRes]) => {
      if (cancelled) return
      setPreviewCounts({ attachments: attRes.count ?? 0, links: linkRes.count ?? 0 })
    })
    return () => { cancelled = true }
  }, [selected?.id])

  // 미리보기의 "최근 노트"는 선택된 회의 1건에 대해서만 본문을 조회 — 목록 전체의
  // 노트 본문을 미리 내려받지 않는다(noteCounts는 개수만 별도 조회, 아래 참고).
  useEffect(() => {
    if (!selected) { setSelectedNotes(null); return }
    let cancelled = false
    fetchMeetingNotes(activeSupabase, selected.id).then(grouped => {
      if (!cancelled) setSelectedNotes(grouped)
    })
    return () => { cancelled = true }
  }, [selected?.id])

  useEffect(() => {
    let savedOrder = [...DEFAULT_CATS]
    try {
      const saved = localStorage.getItem('meetings_cat_order')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (parsed.length > 0) savedOrder = parsed
      }
    } catch {}

    activeSupabase
      .from('meetings')
      // 목록/검색/필터/정렬에 실제로 쓰이는 열만 select — 레거시 notes(jsonb) 등은 제외.
      .select('id, title, meeting_date, category')
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .then(async ({ data: m }) => {
        const loaded = (m ?? []) as Meeting[]
        setMeetings(loaded)
        setNoteCounts(await fetchMeetingNoteCounts(activeSupabase, loaded.map(mt => mt.id)))

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

  // "+ 새 회의록" 클릭 시 sessionStorage(탭별 격리)에서 qid를 읽거나 없으면 새로
  // 발급해 저장 — MobileMemoSheet의 mount effect와 동일한 mint 로직을, 이 화면은
  // 폼을 여러 번 열고 닫을 수 있으므로 "열 때마다" 수행한다.
  function openAddForm() {
    let existingQid = ''
    try { existingQid = sessionStorage.getItem(QID_STORAGE_KEY) ?? '' } catch {}
    const nextQid = existingQid || crypto.randomUUID()
    if (!existingQid) {
      try { sessionStorage.setItem(QID_STORAGE_KEY, nextQid) } catch {}
    }
    setQid(nextQid)
    setAddError('')
    setAdding(true)
  }

  // Autosave: entityId(qid)가 아직 없거나 폼이 닫혀 있으면 enabled=false라 완전히
  // 비활성 — 기존 화면 동작에는 영향 없음. activeSupabase를 그대로 써서 dev-pilot
  // 테스트 중엔 dev-pilot 프로젝트로, 그 외엔 프로덕션으로 향한다(STEP A-2).
  // value는 반드시 useMemo로 감싼다(MobileMemoSheet의 draftValue와 동일한 이유).
  const draftValue = useMemo(() => ({ title: newTitle }), [newTitle])
  const autosave = useAutosave({
    supabase: activeSupabase,
    enabled: adding && !!qid,
    entityType: 'meeting',
    entityId: qid,
    fieldKey: 'draft',
    value: draftValue,
    onRecoveredAvailable: () => {},
  })

  function applyRecovered() {
    if (!autosave.recovered) return
    const v = autosave.recovered.value as { title: string }
    setNewTitle(v.title ?? '')
    autosave.discardRecovered()
  }

  async function handleAdd() {
    const title = newTitle.trim()
    if (!title) { setAdding(false); return }
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data, error } = await activeSupabase
      .from('meetings')
      .insert({ title, meeting_date: today, notes: [] })
      .select('id')
      .single()
    if (error) {
      // 실패 시 폼/입력값은 그대로 유지 — 재시도 가능하게 함
      setAddError('저장 실패 — 잠시 후 다시 시도해 주세요 (내용은 보존됨)')
      return
    }
    if (data) {
      setAddError('')
      // canonical meetings INSERT 성공 → canonical id 확보 → rebind/sessionStorage
      // 삭제/버퍼 cleanup 중 무엇이 실패해도 이미 성공한 canonical Save(meetings row)는
      // 롤백하지 않는다(MobileMemoSheet handleSave와 동일한 failure-isolation 원칙).
      if (qid) {
        try {
          const result = await autosave.flush({ source: 'final', rebindToEntityId: data.id })
          if (!result.rebind?.ok) {
            console.error('meetings_list_new_autosave_rebind_failed', {
              event: 'meetings_list_new_autosave_rebind_failed',
              qid,
              canonicalId: data.id,
              step: result.ok ? 'rebind' : 'sync',
              error: result.rebind?.error ?? result.error ?? 'unknown',
              timestamp: new Date().toISOString(),
            })
          }
        } catch (e) {
          console.error('meetings_list_new_autosave_rebind_failed', {
            event: 'meetings_list_new_autosave_rebind_failed',
            qid,
            canonicalId: data.id,
            step: 'flush',
            error: e instanceof Error ? e.message : 'unknown',
            timestamp: new Date().toISOString(),
          })
        }

        try { sessionStorage.removeItem(QID_STORAGE_KEY) } catch {}
        try { clearAutosaveBuffer('meeting', qid, 'draft') } catch {}
      }

      setNewTitle('')
      setAdding(false)
      router.push(`/meetings/${data.id}`)
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

  // regular는 created_at DESC로 이미 정렬되어 있어 [0]이 곧 최신 일반 노트 —
  // 구 `selected.notes.find(n => !n.is_prep)`(원본 배열에서 첫 non-prep, 항상
  // prepend되어 왔으므로 결과적으로 최신 노트였음)와 동일한 결과.
  const latestNote = selectedNotes?.regular[0]
  const selectedDateLabel = selected?.meeting_date
    ? (() => { try { return format(parseISO(selected.meeting_date as string), 'yyyy.MM.dd (eee)', { locale: ko }) } catch { return '' } })()
    : ''

  return (
    <div className="h-full flex gap-6 overflow-hidden" style={{ background: '#0F1319' }}>
    {/* 리스트 폭 제한 — 화면 전체로 늘어나면 제목 뒤 태그/노트수까지 빈 공간이 길게 남아서
        컬럼 폭을 제한. 오른쪽 남는 공간은 회의 선택 시 미리보기 패널이 차지 */}
    <div className="h-full flex flex-col overflow-hidden" style={{ width: 720, maxWidth: '100%', flexShrink: 0 }}>

      {/* 헤더+새 회의록 폼+검색 툴바 wrapper — 실측 높이를 ResizeObserver로 재서
          headerHeight에 담고, 우측 미리보기 패널의 marginTop으로 그대로 사용한다 */}
      <div ref={headerRef} className="flex-shrink-0">
        {/* 헤더: 1행 제목 단독, 2행 검색(풀와이드) + 추가 버튼 — 메모 탭과 동일한 리듬 */}
        <div className="flex-shrink-0 pt-6 pb-3">
          <h1 className="text-[20px] font-bold mb-3" style={{ color: '#E2E8F0' }}>회의록</h1>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <Search size={14} style={{ color: 'rgba(226,232,240,0.35)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="회의명, 키워드 검색..."
                className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-[rgba(226,232,240,0.25)]"
                style={{ color: '#E2E8F0' }}
              />
            </div>
            <button
              onClick={openAddForm}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors flex-shrink-0"
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
            {/* Autosave: 복구 배너 — 자동 적용하지 않음 */}
            {autosave.recovered && (
              <div
                className="mb-2 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2"
                style={{ background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: '#9DBEF5' }}
              >
                <span className="flex-1">복구 가능한 자동저장 내용이 있습니다</span>
                <button onClick={applyRecovered} className="underline underline-offset-2">적용</button>
                <button onClick={() => autosave.discardRecovered()} className="underline underline-offset-2">무시</button>
              </div>
            )}
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd()
                if (e.key === 'Escape') { setAdding(false); setNewTitle(''); setAddError('') }
              }}
              onBlur={handleAdd}
              placeholder="회의 제목 입력 후 Enter"
              className="w-full text-[13px] bg-transparent focus:outline-none placeholder:text-[rgba(226,232,240,0.3)]"
              style={{ color: '#E2E8F0' }}
            />

            {/* 저장 실패 안내 — 실패 시 폼/입력값은 지우지 않으므로 재시도하면 됨 */}
            {addError && (
              <div className="mt-2 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FC8181' }}>
                <span>⚠</span>
                <span className="flex-1">{addError}</span>
              </div>
            )}
          </div>
        )}

        {/* 검색 툴바 (sticky) — 검색창은 위 헤더로 이동, 여기는 기간/정렬/팀 필터만 */}
        <SearchToolbar
          dateSelection={dateSelection} setDateSelection={setDateSelection}
          teamFilter={teamFilter}     setTeamFilter={setTeamFilter}
          sortOrder={sortOrder}       setSortOrder={setSortOrder}
          catOrder={catOrder}         setCatOrder={setCatOrder}
          total={filtered.length}
        />
      </div>

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
                onSelect={id => setSelected(meetings.find(m => m.id === id) ?? null)}
                noteCounts={noteCounts}
              />
            ))}
          </div>
        )}
      </div>
    </div>

    {/* 우측 미리보기 패널 — 회의를 선택했을 때만 등장. 편집은 여기서 하지 않고 상세 페이지로 유도.
        marginTop을 좌측 헤더 wrapper의 실측 높이(headerHeight)로 맞춰서, 경영진 그룹 박스
        상단과 미리보기 패널 상단이 항상 같은 y좌표에서 시작하도록 함 */}
    <div className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-hide" style={{ marginTop: headerHeight }}>
      {selected ? (
        <div className="pr-1 pb-6">
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(226,232,240,0.4)' }}>회의 미리보기</span>
              <button onClick={() => setSelected(null)} className="text-lg leading-none transition-colors" style={{ color: 'rgba(226,232,240,0.28)' }}>×</button>
            </div>

            <h2 className="text-base font-semibold mb-2.5" style={{ color: '#E2E8F0' }}>{selected.title || '제목 없음'}</h2>

            <div className="flex items-center gap-2 mb-4">
              {selected.category && (
                <span className="text-[10px] px-2.5 py-1 rounded-full border font-medium" style={catStyle(selected.category)}>
                  {selected.category}
                </span>
              )}
              {selectedDateLabel && (
                <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.35)' }}>{selectedDateLabel}</span>
              )}
            </div>

            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'rgba(226,232,240,0.4)' }}>최근 노트</p>
              {latestNote ? (
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: 'rgba(226,232,240,0.7)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {stripHtml(latestNote.content)}
                </p>
              ) : (
                <p className="text-[13px]" style={{ color: 'rgba(226,232,240,0.25)' }}>기록된 노트가 없습니다</p>
              )}
            </div>

            <div className="flex items-center gap-4 mb-5">
              <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.4)' }}>
                첨부 {previewCounts ? previewCounts.attachments : '…'}
              </span>
              <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.4)' }}>
                연관업무 {previewCounts ? previewCounts.links : '…'}
              </span>
            </div>

            <button
              onClick={() => router.push(`/meetings/${selected.id}`)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors"
              style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: '#9DBEF5' }}
            >
              자세히 보기 →
            </button>
          </div>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center">
          <p className="text-[12px]" style={{ color: 'rgba(226,232,240,0.2)' }}>회의를 선택하면 여기에 미리보기가 표시됩니다</p>
        </div>
      )}
    </div>
    </div>
  )
}
