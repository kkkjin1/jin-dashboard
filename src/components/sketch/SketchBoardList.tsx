'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clearAutosaveBuffer } from '@/hooks/useAutosave'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Trash2, PenTool, LayoutGrid, Search, ArrowUpDown, SquarePen, Plus, X, Eye, EyeOff, Lock } from 'lucide-react'
import { toSketchHtml } from './SketchTextEditor'
import type { SketchBoard, SketchNoteElement } from '@/types'

type BoardWithCount = SketchBoard & { sketch_cards?: { count: number }[] }
type SortKey = 'updated' | 'name'

// 에버노트식 2단 — 왼쪽 노트 목록, 오른쪽 메인 화면 / 선택 노트 미리보기(읽기 전용).
// 편집은 "열기"로 기존 /sketch/[id] 캔버스에 들어가서 한다 — 미리보기에서 바로 편집하면
// 노트를 바꿀 때마다 캔버스(autosave 포함)를 재마운트해야 해서, 그 위험을 피하려는 선택.
// 보안상 탭에 들어오면 어떤 본문도 바로 보이지 않는다 — 오른쪽은 메인 화면, 목록 본문 줄은 기본 숨김.
const SHOW_SNIPPET_KEY = 'sketch-list-snippet'

// 노트별 색 — 이름 해시로 고정 배정(저장 안 함). 보라 계열은 제외.
const NOTE_ACCENTS = ['#4C7FE0', '#2FA58A', '#D98A2B', '#D9675A', '#2E9DB8', '#6E9F3F']

function noteAccent(name: string) {
  // FNV-1a — 단순 *31 해시는 한글 이름에서 색이 두세 개로 몰렸다
  let h = 2166136261
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619) }
  return NOTE_ACCENTS[(h >>> 0) % NOTE_ACCENTS.length]
}

// note_body(HTML)에서 텍스트만 뽑는다 — 검색과 목록 본문 줄에 쓴다.
function bodyText(html: string | null | undefined) {
  if (!html) return ''
  const text = new DOMParser().parseFromString(html.replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, ' $&'), 'text/html').body.textContent ?? ''
  return text.replace(/\s+/g, ' ').trim()
}

function relativeDay(iso: string) {
  const d = parseISO(iso)
  const diff = differenceInCalendarDays(new Date(), d)
  if (diff <= 0) return format(d, 'a h:mm', { locale: ko })
  if (diff === 1) return '어제'
  if (diff < 7) return `${diff}일 전`
  return format(d, 'M월 d일', { locale: ko })
}

const ELEMENT_LABELS: Record<SketchNoteElement['type'], string> = { box: '포스트잇', image: '이미지', table: '표', mindmap: '마인드맵' }

function NoteBadge({ name, mindmap, size = 30 }: { name: string; mindmap: boolean; size?: number }) {
  const accent = noteAccent(name)
  return (
    <span
      className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold"
      style={{
        width: size, height: size, fontSize: size * 0.42,
        color: accent,
        background: `linear-gradient(145deg, ${accent}2E, ${accent}14)`,
        boxShadow: `inset 0 0 0 1px ${accent}33, 0 1px 2px ${accent}22`,
      }}
    >
      {mindmap ? <LayoutGrid size={size * 0.45} /> : (name.trim()[0] ?? '·')}
    </span>
  )
}

export default function SketchBoardList() {
  const supabase = createClient()
  const router = useRouter()

  const [boards, setBoards] = useState<BoardWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSnippet, setShowSnippet] = useState(() => {
    try { return localStorage.getItem(SHOW_SNIPPET_KEY) === '1' } catch { return false }
  })
  const [elementCounts, setElementCounts] = useState<{ boardId: string; counts: Partial<Record<SketchNoteElement['type'], number>> } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 자유노트의 마인드맵 카드가 만든 자식 보드(parent_board_id 있음)는 목록에 안 보인다 —
    // 카드 자체가 이미 자유노트 안에서 그 보드로의 진입점이라, 여기 또 노출되면 중복이다.
    // parent_board_id 필터는 DB 쿼리가 아니라 클라이언트에서 거른다 — schema_v55.sql이
    // 아직 적용 안 된 상태에서 배포돼도(존재하지 않는 컬럼으로 필터하면 쿼리 자체가
    // 에러가 나 목록 전체가 비어버림) 안전하게 기존 목록이 그대로 보이게 하기 위함.
    supabase.from('sketch_boards').select('*, sketch_cards(count)').order('updated_at', { ascending: false })
      .then(({ data }) => {
        setBoards(((data ?? []) as BoardWithCount[]).filter(b => !b.parent_board_id && !b.agenda_item_id))
        setLoading(false)
      })
  }, [])

  function toggleSnippet() {
    setShowSnippet(prev => {
      try { localStorage.setItem(SHOW_SNIPPET_KEY, prev ? '0' : '1') } catch {}
      return !prev
    })
  }

  const texts = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of boards) map.set(b.id, b.board_type === 'freenote' ? bodyText(b.note_body) : '')
    return map
  }, [boards])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? boards.filter(b => b.name.toLowerCase().includes(q) || (texts.get(b.id) ?? '').toLowerCase().includes(q))
      : boards
    return sort === 'name' ? [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ko')) : rows
  }, [boards, texts, query, sort])

  const selected = boards.find(b => b.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) return
    const board = boards.find(b => b.id === selectedId)
    if (board?.board_type !== 'freenote') return
    supabase.from('sketch_note_elements').select('type').eq('board_id', selectedId)
      .then(({ data }) => {
        const counts: Partial<Record<SketchNoteElement['type'], number>> = {}
        for (const row of (data ?? []) as { type: SketchNoteElement['type'] }[]) counts[row.type] = (counts[row.type] ?? 0) + 1
        setElementCounts({ boardId: selectedId, counts })
      })
  }, [selectedId, boards])

  // Esc — 어디서든 미리보기를 닫고 메인 화면으로(옆에 사람이 올 때 빠르게 가리기)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'INPUT' && (t as HTMLInputElement).value) return
      setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openBoard(id: string) {
    router.push(`/sketch/${id}`)
  }

  function selectBoard(id: string) {
    // 좁은 화면은 미리보기 칸이 없으니 바로 연다
    if (window.innerWidth < 768) { openBoard(id); return }
    setSelectedId(id)
  }

  // 보드 타입 선택 UI는 없앴다 — 마인드맵은 이제 독립 보드가 아니라 자유노트 위에
  // 놓는 카드 하나(생성 시 자동으로 자식 보드가 만들어짐)라, 새로 만드는 보드는
  // 항상 자유노트다. 이름은 묻지 않고 "제목 없음"으로 만들어 바로 열고, 캔버스 상단 제목칸에서 고친다.
  async function handleAdd() {
    const { data, error } = await supabase.from('sketch_boards').insert({ name: '제목 없음', board_type: 'freenote' }).select().single()
    if (error || !data) { console.error('보드 생성 실패:', error?.message); return }
    openBoard(data.id)
  }

  async function deleteBoard(id: string, name: string) {
    if (!confirm(`'${name}' 보드를 삭제하시겠습니까? 안의 카드도 모두 삭제됩니다.`)) return
    const { error } = await supabase.from('sketch_boards').delete().eq('id', id)
    // canonical DELETE 성공 이후에만 로컬 autosave 버퍼 정리 — 자식 sketch_note_elements는
    // FK CASCADE로 같이 지워지지만, 그 각각의 버퍼(box content/table_data)까지 여기서
    // 정리하려면 삭제 전에 자식 목록을 따로 조회해야 해서 현재 삭제 구조를 넘어서는
    // 확장이 필요하다 — 이번 STEP에서는 board 자신의 note_body 버퍼만 정리한다.
    if (error) return
    try { clearAutosaveBuffer('sketch_board', id, 'note_body') } catch {}
    setBoards(prev => prev.filter(b => b.id !== id))
    setSelectedId(null)
  }

  // 목록에서 ↑↓로 노트 이동, Enter로 열기
  function handleListKeyDown(e: React.KeyboardEvent) {
    if (!visible.length) return
    const idx = visible.findIndex(b => b.id === selectedId)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const nextIdx = idx < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx - 1)
      const next = visible[nextIdx]
      setSelectedId(next.id)
      listRef.current?.querySelector<HTMLElement>(`[data-board-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && selectedId) {
      openBoard(selectedId)
    }
  }

  const counts = selected && elementCounts?.boardId === selected.id ? elementCounts.counts : null
  const countText = counts
    ? (Object.keys(ELEMENT_LABELS) as SketchNoteElement['type'][]).filter(t => counts[t]).map(t => `${ELEMENT_LABELS[t]} ${counts[t]}`).join(' · ')
    : ''
  const weekCount = boards.filter(b => differenceInCalendarDays(new Date(), parseISO(b.updated_at)) < 7).length
  const selectedAccent = selected ? noteAccent(selected.name) : '#4C7FE0'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center pt-6 pb-3">
        <h1 className="text-[20px] font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <PenTool size={18} strokeWidth={1.75} />
          생각스케치
        </h1>
        <button
          onClick={() => void handleAdd()}
          className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold text-white transition-transform hover:-translate-y-px"
          style={{ background: 'linear-gradient(135deg, #5B8DEF, #3F6FD1)', boxShadow: '0 4px 14px rgba(63,111,209,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' }}
        >
          <Plus size={14} /> 새 노트
        </button>
      </div>

      <div
        className="flex-1 min-h-0 mb-6 flex rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(var(--ink-rgb),0.08)', background: 'var(--surface-primary)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* 왼쪽: 노트 목록 */}
        <aside
          className="w-full md:w-[300px] flex-shrink-0 flex flex-col min-h-0"
          style={{ background: 'var(--surface-panel)', borderRight: '1px solid rgba(var(--ink-rgb),0.07)' }}
        >
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex flex-col gap-2">
            <label
              className="flex items-center gap-2 px-2.5 h-8 rounded-lg"
              style={{ background: 'var(--surface-primary)', border: '1px solid rgba(var(--ink-rgb),0.08)', boxShadow: 'inset 0 1px 2px rgba(var(--ink-rgb),0.04)' }}
            >
              <Search size={13} style={{ color: 'var(--text-muted)' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
                placeholder="노트 검색"
                className="flex-1 min-w-0 text-[12.5px] bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.35)]"
                style={{ color: 'var(--text-primary)' }}
              />
            </label>
            <div className="flex items-center gap-1 px-0.5">
              <span className="text-[11px] mr-auto" style={{ color: 'var(--text-muted)' }}>
                노트 {visible.length}개
              </span>
              <button
                onClick={toggleSnippet}
                title={showSnippet ? '목록 본문 줄 숨기기' : '목록 본문 줄 보기'}
                className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md transition-colors hover:bg-[rgba(var(--ink-rgb),0.06)]"
                style={{ color: 'var(--text-muted)' }}
              >
                {showSnippet ? <Eye size={11} /> : <EyeOff size={11} />} 본문
              </button>
              <button
                onClick={() => setSort(s => (s === 'updated' ? 'name' : 'updated'))}
                className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md transition-colors hover:bg-[rgba(var(--ink-rgb),0.06)]"
                style={{ color: 'var(--text-muted)' }}
              >
                <ArrowUpDown size={11} /> {sort === 'updated' ? '최근 수정순' : '이름순'}
              </button>
            </div>
          </div>

          <div
            ref={listRef}
            tabIndex={0}
            onKeyDown={handleListKeyDown}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide focus:outline-none px-2 pb-2 flex flex-col gap-1"
          >
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'rgba(var(--ink-rgb),0.04)' }} />
              ))
            ) : visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px]" style={{ color: 'rgba(var(--text-rgb),0.35)' }}>
                {query ? '검색 결과가 없습니다' : '아직 노트가 없습니다'}
              </p>
            ) : (
              visible.map(board => {
                const active = board.id === selectedId
                const text = texts.get(board.id) ?? ''
                const mindmap = board.board_type !== 'freenote'
                return (
                  <div
                    key={board.id}
                    data-board-id={board.id}
                    onClick={() => selectBoard(board.id)}
                    onDoubleClick={() => openBoard(board.id)}
                    className={`flex-shrink-0 flex gap-2.5 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all ${active ? '' : 'hover:bg-[rgba(var(--ink-rgb),0.04)]'}`}
                    style={active ? {
                      background: 'var(--surface-elevated)',
                      boxShadow: `0 4px 14px rgba(var(--ink-rgb),0.08), 0 1px 2px rgba(var(--ink-rgb),0.06), inset 0 0 0 1px ${noteAccent(board.name)}40`,
                    } : undefined}
                  >
                    <NoteBadge name={board.name} mindmap={mindmap} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="flex-1 min-w-0 text-[13.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {board.name}
                        </p>
                        <span className="flex-shrink-0 text-[10.5px]" style={{ color: 'rgba(var(--text-rgb),0.38)' }}>
                          {relativeDay(board.updated_at)}
                        </span>
                      </div>
                      {mindmap ? (
                        <p className="mt-0.5 text-[11.5px]" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>마인드맵 · 카드 {board.sketch_cards?.[0]?.count ?? 0}개</p>
                      ) : showSnippet ? (
                        <p className="mt-0.5 text-[11.5px] leading-[1.5] line-clamp-2 break-keep" style={{ color: text ? 'rgba(var(--text-rgb),0.5)' : 'rgba(var(--text-rgb),0.28)' }}>
                          {text || '내용 없음'}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11.5px]" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>자유노트</p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* 오른쪽: 메인 화면 / 선택 노트 미리보기(읽기 전용) */}
        <section className="hidden md:flex flex-1 min-w-0 flex-col relative">
          {!selected ? (
            <div className="flex-1 min-h-0 overflow-y-auto relative">
              {/* 배경 색 번짐 */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(76,127,224,0.16), transparent 70%)' }} />
                <div className="absolute -bottom-40 -left-24 w-[460px] h-[460px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(47,165,138,0.13), transparent 70%)' }} />
              </div>

              <div className="relative max-w-[640px] mx-auto px-10 pt-16 pb-10">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white"
                  style={{ background: 'linear-gradient(135deg, #5B8DEF, #2FA58A)', boxShadow: '0 10px 28px rgba(63,111,209,0.32), inset 0 1px 0 rgba(255,255,255,0.3)' }}
                >
                  <PenTool size={24} strokeWidth={1.75} />
                </div>
                <h2 className="mt-5 text-[24px] font-bold" style={{ color: 'var(--text-primary)' }}>생각스케치</h2>
                <p className="mt-1.5 text-[13px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Lock size={12} /> 노트를 고르면 미리보기가 열립니다. <kbd className="px-1.5 py-px rounded text-[11px]" style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.1)' }}>Esc</kbd> 로 바로 가릴 수 있어요.
                </p>

                <div className="mt-8 grid grid-cols-2 gap-3">
                  {[
                    { label: '전체 노트', value: boards.length, color: '#4C7FE0' },
                    { label: '최근 7일 수정', value: weekCount, color: '#2FA58A' },
                  ].map(s => (
                    <div
                      key={s.label}
                      className="rounded-2xl px-5 py-4"
                      style={{ background: 'var(--surface-elevated)', border: '1px solid rgba(var(--ink-rgb),0.07)', boxShadow: '0 6px 20px rgba(var(--ink-rgb),0.06)' }}
                    >
                      <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                      <p className="mt-1 text-[26px] font-bold leading-none" style={{ color: s.color }}>{loading ? '–' : s.value}</p>
                    </div>
                  ))}
                </div>

                {boards.length > 0 && (
                  <>
                    <p className="mt-8 mb-2.5 text-[12px] font-semibold" style={{ color: 'var(--text-secondary, var(--text-muted))' }}>최근 노트</p>
                    <div className="flex flex-col gap-2">
                      {boards.slice(0, 4).map(b => (
                        <button
                          key={b.id}
                          onClick={() => setSelectedId(b.id)}
                          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all hover:-translate-y-px"
                          style={{ background: 'var(--surface-elevated)', border: '1px solid rgba(var(--ink-rgb),0.07)', boxShadow: '0 2px 8px rgba(var(--ink-rgb),0.04)' }}
                        >
                          <NoteBadge name={b.name} mindmap={b.board_type !== 'freenote'} size={26} />
                          <span className="flex-1 min-w-0 truncate text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</span>
                          <span className="text-[11px]" style={{ color: 'rgba(var(--text-rgb),0.38)' }}>{relativeDay(b.updated_at)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 노트 색 띠 */}
              <div className="absolute inset-x-0 top-0 h-[120px] pointer-events-none" style={{ background: `linear-gradient(180deg, ${selectedAccent}1F, transparent)` }} />
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: selectedAccent }} />

              <div
                className="relative flex-shrink-0 flex items-start gap-3 px-10 pt-7 pb-4"
                style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.06)' }}
              >
                <NoteBadge name={selected.name} mindmap={selected.board_type !== 'freenote'} size={40} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-[22px] font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{selected.name}</h2>
                  <p className="mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    {format(parseISO(selected.updated_at), 'yyyy년 M월 d일 a h:mm', { locale: ko })} 수정
                    {selected.board_type === 'freenote'
                      ? (countText && <> · {countText}</>)
                      : <> · 마인드맵 · 카드 {selected.sketch_cards?.[0]?.count ?? 0}개</>}
                  </p>
                </div>
                <button
                  onClick={() => deleteBoard(selected.id, selected.name)}
                  title="삭제"
                  className="p-2 rounded-lg transition-colors flex-shrink-0 hover:bg-[rgba(248,113,113,0.1)] hover:text-[#f87171]"
                  style={{ color: 'rgba(var(--text-rgb),0.35)' }}
                >
                  <Trash2 size={15} />
                </button>
                <button
                  onClick={() => openBoard(selected.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-transform hover:-translate-y-px flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #5B8DEF, #3F6FD1)', boxShadow: '0 4px 14px rgba(63,111,209,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' }}
                >
                  <SquarePen size={14} /> 열기
                </button>
                <button
                  onClick={() => setSelectedId(null)}
                  title="닫기 (Esc)"
                  className="p-2 rounded-lg transition-colors flex-shrink-0 hover:bg-[rgba(var(--ink-rgb),0.06)]"
                  style={{ color: 'rgba(var(--text-rgb),0.45)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="relative flex-1 min-h-0 overflow-y-auto px-10 py-7" onDoubleClick={() => openBoard(selected.id)}>
                {selected.board_type !== 'freenote' ? (
                  <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>마인드맵 보드입니다. 열기를 눌러 확인하세요.</p>
                ) : !(texts.get(selected.id)) ? (
                  <p className="text-[13px]" style={{ color: 'rgba(var(--text-rgb),0.3)' }}>본문이 비어 있습니다.</p>
                ) : (
                  // 캔버스 본문 프리뷰(SketchTextEditor의 SketchPreview)와 같은 클래스·변환을 써서 모양을 맞춘다
                  <div
                    className="freenote-body freenote-doc tiptap-input leading-relaxed"
                    style={{ color: 'var(--text-primary)', fontSize: 15, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
                    dangerouslySetInnerHTML={{ __html: toSketchHtml(selected.note_body) }}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
