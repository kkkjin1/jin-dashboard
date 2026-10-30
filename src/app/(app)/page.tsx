'use client'

import { useState, useRef, useEffect, useMemo, Fragment } from 'react'
import { CATEGORY_PALETTE, MEMO_TAG, MEETING_CATEGORY, FIXED_MEETING_TAGS, colorKeyFromName, PART_COLOR } from '@/lib/categoryColors'
import { useOrgData } from '@/hooks/useOrgData'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Plus, FileText, Clock, NotebookPen, CalendarDays, CalendarCheck, Layers, StickyNote, Repeat2, X } from 'lucide-react'
import ShortcutIcons from '@/components/ShortcutIcons'
import type { TaskTodo, Meeting, QuickMemo, AgendaSubTask, ScheduleItem, QuickTodo } from '@/types'
import { fetchMeetingNotesByMeetingIds, type MeetingNotesGrouped, type MeetingNoteRow } from '@/lib/meetingNotes'
import { scheduleOccursOn, type MeetingRecurrence } from '@/lib/meetingSchedule'
import type { GoogleCalendarEvent } from '@/app/api/calendar/today/route'
import { JournalFullscreenEditor, type DailyJournal, parseSections, serializeSections, SECTION_KEYS, SECTION_META, type SectionKey } from '@/components/home/DailyJournalWidget'
import { useUserSetting } from '@/hooks/useUserSetting'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────────────
interface MeetingSchedule extends MeetingRecurrence {
  id: string
  title: string
  time: string
  category?: string
}

type TodayTodo = Omit<TaskTodo, 'tasks'> & {
  tasks: { id: string; title: string; short_name: string | null; part: string } | null
}
type SubTaskWithContext = AgendaSubTask & {
  updated_at?: string | null
  agenda_items: { id: string; title: string; agenda_groups: { name: string; color: string; category: string } | null } | null
  sub_task_notes?: { created_at: string; edited_at: string | null; content: string | null }[]
}
type TLExtra = { id: string; title: string; subtitle?: string }

// ── Category Colors (고정 태그만; 팀명은 조직 설정에서 동적으로 옴) ──────────
const CATEGORY_COLOR: Record<string, string> = {
  '개인': '#83D5B6',
}

// ── Design Tokens (globals.css semantic token 참조 — Light/Dark 자동 대응) ──
const BG      = 'var(--bg-page)'
const CARD    = 'var(--surface-primary)'
const CHOVER  = 'var(--surface-hover-strong)'
const DIVIDER = 'var(--border-default)'
const TEXT1   = 'var(--text-primary)'
const TEXT2   = 'var(--text-secondary)'
const TEXT3   = 'var(--text-muted)'
const ACCENT  = 'var(--accent-primary)'

// Card base style
const cardBase = (accent = false): React.CSSProperties => ({
  background: CARD,
  border: `1px solid rgba(var(--ink-rgb),${accent ? '0.13' : '0.10'})`,
  borderRadius: 16,
  boxShadow: 'var(--shadow-card)',
  transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
})
// hover is handled by CSS .dash-card:hover in globals.css (avoids stuck onMouseLeave)

// Mobile card surface. Light: page(#F6F7F9)/card 2단 계층이 실제로 보이려면 카드가
// surface-secondary(#F3F4F6, page와 거의 구분 안 됨)가 아니라 surface-primary(#FFFFFF)여야
// 함 — Dark는 surface-primary(#161B24)가 기존 surface-secondary(#171B22)와 거의 동일해
// 시각적으로 그대로 유지됨.
const SURFACE  = 'var(--surface-primary)'
const MSHADOW  =
  'inset 0 1px 0 rgba(var(--ink-rgb),0.06), ' +
  '0 0 0 1px rgba(var(--ink-rgb),0.06), ' +
  '0 18px 60px rgba(0,0,0,0.15)'
const MCARD: React.CSSProperties = { background: SURFACE, boxShadow: MSHADOW, borderRadius: 24 }

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  try { return format(parseISO(s), 'M.d (E)', { locale: ko }) } catch { return s }
}
function tagStyle(part: string): React.CSSProperties {
  const key = PART_COLOR[part] ?? colorKeyFromName(part)
  const p = CATEGORY_PALETTE[key]
  return { background: p.bg, color: p.text }
}
function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr()     { return localDateStr(new Date()) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) }
function shiftDateStr(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + days)
  return localDateStr(dt)
}
function dowOfDateStr(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

// ── Empty State ────────────────────────────────────────────────────────────
function EmptyState({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', height: '100%' }}>
      <div style={{ color: TEXT3, opacity: 0.45 }}>{icon}</div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 12.5, color: TEXT3, fontWeight: 400 }}>{label}</p>
        {sub && <p style={{ fontSize: 11.5, color: TEXT3, marginTop: 3, opacity: 0.6 }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── List Row wrapper (row-level hover) ──────────────────────────────────────
function ListRow({ children, style, onClick, draggable, onDragStart, onDragEnd, onMouseEnter, onMouseLeave }: {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const [h, setH] = useState(false)
  return (
    <div
      onMouseEnter={() => { setH(true); onMouseEnter?.() }}
      onMouseLeave={() => { setH(false); onMouseLeave?.() }}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        borderRadius: 8,
        marginLeft: -10, marginRight: -10,
        paddingLeft: 10, paddingRight: 10,
        background: h ? 'rgba(var(--ink-rgb),0.05)' : 'transparent',
        transition: 'background 120ms ease',
        cursor: draggable ? 'grab' : onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Card Section ───────────────────────────────────────────────────────────
function CardSection({
  title, link, linkLabel, children, extra, accent, icon,
}: {
  title: string
  link?: string
  linkLabel?: string
  children: React.ReactNode
  extra?: React.ReactNode
  accent?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div
      className="dash-card"
      style={{
        ...cardBase(accent),
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT1, letterSpacing: '-0.02em' }}>{title}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {extra}
          {link && (
            <Link href={link} style={{ fontSize: 11.5, color: TEXT3, textDecoration: 'none', transition: 'color 150ms' }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = TEXT2)}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = TEXT3)}
            >{linkLabel ?? '전체 보기'}</Link>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="scrollbar-hide">
        {children}
      </div>
    </div>
  )
}

// 금주 업무 7열 — 직전주 미완료 | 월~금 | 다음주로 연기, 모두 같은 폭 (오늘은 유리 테두리로만 강조).
// 열이 좁은 만큼 업무명은 WEEK_ITEM_LINES줄까지 줄바꿈해 보여준다. 최소 폭 합보다 좁으면 columns 영역만 가로 스크롤.
const WEEK_COL_MIN = 110
const WEEK_ITEM_LINES = 4
// 금주 업무 즉석 할일 요일 이동용 드래그 데이터 타입 (타임라인용 'tl-extra'와 구분)
const WEEK_QUICK_DND = 'week-quick-id'
// '이전 N건' 모달에서 요일 열로 끌어 옮길 때 — 할 일(task_todos)·세부task(agenda_sub_tasks). 값은 JSON {kind, id}
const WEEK_MOVE_DND = 'week-move-item'
// 금주 업무 섹션 높이 — 내용 높이 기준, 공간 부족 시 최소 200까지 축소, 업무가 많아도 340에서 멈춤(열 안 스크롤)
const WEEK_MIN_H = 200
// 화면 비율 맞춤 — 노트북(2880×1800, 배율 200% → 홈 높이 752px) 화면이 기준.
// 더 높은 화면은 ① 본문을 최대 HOME_MAX_ZOOM까지 확대(메뉴바 제외)하고 ② 그래도 남는 세로 높이는
// 행·간격·타임라인 레인 높이를 같은 배수(--vs)로 늘려 채운다. 행 수·노출 항목 수는 기준 화면과 같다.
const HOME_REF_H = 752
const HOME_MAX_ZOOM = 1.1
// 세로 배수 적용 길이 (글자 크기에는 쓰지 않음)
const vs = (px: number) => `calc(${px}px * var(--vs, 1))`
// 하단 3박스 기준 행 수 — 박스 높이는 배수만큼 커지고, 그 안에 들어가는 행 수는 floor(3 × 배수)
const BASE_BOTTOM_ROWS = 3
// 금주 업무 카드 — 제목 행 · 제목 아래 간격 · 요일 머리글 행 높이
const WEEK_TITLE_H = 28, WEEK_TITLE_GAP = 6, WEEK_COLHEAD_H = 30

// 홈 하단 진행중 과업 컬럼: 범주 | 프로젝트/과업 | 상태 | 마감 (노트북 폭에서 과업명 칸 확보를 위해 고정 칸 최소화)
const BOTTOM_TASK_COLS = '56px minmax(0, 1fr) 50px 36px'
// 하단 박스 안쪽 여백 (오늘의 타임라인 카드와 같은 cardBase 박스)
const BOX_PAD_X = 22, BOX_PAD_Y = 12
const BOX_FIRST_ROW_H = 36   // 퀵메모 입력 ↔ 과업 헤더 ↔ 회고 헤더
const BOTTOM_ROW_H = 32      // 데이터 행
const BOX_TITLE_H = 24   // 박스 제목 행 높이 — 제목을 위에 붙여 바로 아래 머리글 줄과 간격을 좁게

// ── Timeline constants ─────────────────────────────────────────────────────
const H_START = 9, H_END = 21
const snap5 = (h: number) => Math.round(h * 12) / 12   // 타임라인 시간은 5분 단위
// 세로 타임라인 — 위→아래로 시간이 흐른다. 시각은 칸 높이에 대한 %로 놓아 칸이 어떤 크기든 9~21시가 꽉 차고,
// 칸이 TL_HOUR_MIN × 12보다 낮을 때만 스크롤한다 (측정값에 기대지 않아 zoom 배율과 무관)
const TL_COL_W     = 'clamp(306px, 27%, 378px)'   // 홈 왼쪽 타임라인 열 폭 (남는 폭은 금주 업무로)
const TL_HOURS     = H_END - H_START
const TL_HOUR_MIN  = 40
const TL_GUTTER    = 44      // 왼쪽 시각 표시 칸
const TL_COL_GAP   = 3       // 같은 레인에서 겹쳐 나란히 놓인 카드 사이 간격
const TL_LANE_GAP  = 6       // 일정·구글캘린더 레인 ↔ 회의·업무 레인 간격 (두 레인은 반반)
const TL_CARD_GAP  = 2       // 위아래로 붙은 카드 사이 간격
const TL_COMPACT_H = 36      // 이보다 낮은 카드는 시간·제목을 한 줄로
const TL_NOW       = '#E05252'
const TL_TODO_DND  = 'tl-todo-id'   // '시간 미정' 칩 → 타임라인으로 끌어 시간 배치
const tlPct = (h: number) => `${((h - H_START) / TL_HOURS) * 100}%`

// 타임라인 카드 색 — 파스텔 바탕(투명도 높게) + 같은 색 계열 얇은 테두리로 종류만 구분 (구글캘린더 / 회의 / 업무)
type TlTone = { bg: string; bd: string }
const TL_TONES = {
  gcal: { bg: 'rgba(132,176,242,0.13)', bd: 'rgba(132,176,242,0.30)' },
  meet: { bg: 'rgba(160,178,206,0.15)', bd: 'rgba(160,178,206,0.34)' },
  task: { bg: 'rgba(124,206,190,0.14)', bd: 'rgba(124,206,190,0.34)' },
} satisfies Record<string, TlTone>
const tlCardStyle = (tone: TlTone): React.CSSProperties => ({
  background: tone.bg, border: `1px solid ${tone.bd}`,
})

// ── TimelineCard — 회의·고정회의·할일·업무·드래그 항목 공통 카드 ─────────
// 박스에는 제목만(최대 2줄), 시간·전체 제목은 마우스를 올리면 툴팁으로. 드래그로 이동/끝시간 조절.
// 위치·크기는 칸에 대한 % (calc 문자열), px는 한 줄/두 줄 판단용 예상 높이
type TlGeom = { left: string; width: string; top: string; height: string; px: number }
// hover 툴팁 — 화면 좌표(zoom 환산 후)와 보여줄 내용
type TlTip = { title: string; range: string; subtitle?: string; hint?: string; x: number; y: number }
// 겹치는 카드끼리만 나란히 — 시작 순으로 빈 칸에 넣고, 서로 이어서 겹치는 묶음은 같은 칸 수로 나눈다 (구글캘린더 방식)
type TlSlot = { key: string; hour: number; dur: number }
function layoutTlSlots(slots: TlSlot[]) {
  const out: Record<string, { col: number; cols: number }> = {}
  const sorted = [...slots].sort((a, b) => a.hour - b.hour || b.dur - a.dur)
  let group: TlSlot[] = [], colEnds: number[] = [], groupEnd = -Infinity
  const flush = () => { group.forEach(g => { out[g.key].cols = colEnds.length }); group = []; colEnds = [] }
  for (const sl of sorted) {
    const end = sl.hour + Math.max(sl.dur, 0.25)   // 카드 최소 높이(15분)만큼은 차지
    if (sl.hour >= groupEnd - 1e-6) flush()
    let col = colEnds.findIndex(e => e <= sl.hour + 1e-6)
    if (col < 0) { col = colEnds.length; colEnds.push(end) } else colEnds[col] = end
    out[sl.key] = { col, cols: 1 }
    group.push(sl); groupEnd = Math.max(groupEnd, end)
  }
  flush()
  return out
}
// 카드 안쪽 — 제목만. 낮은 카드는 한 줄, 높은 카드는 두 줄까지 (넘치면 …)
function TlCardBody({ g, title, padRight = 0 }: { g: TlGeom; title: React.ReactNode; padRight?: number }) {
  const lines = g.px < TL_COMPACT_H ? 1 : 2
  return (
    <div style={{ fontSize: 11.5, fontWeight: 400, color: TEXT1, lineHeight: '16px', letterSpacing: '-0.01em', paddingRight: padRight, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', wordBreak: lines === 1 ? 'break-all' : 'keep-all', overflowWrap: 'anywhere' }}>
      {title}
    </div>
  )
}
// 카드 위치 → hover 툴팁 좌표 (fixed 툴팁도 zoom 안에 있어 화면 px를 배율로 나눈다)
function tlTipAt(el: HTMLElement, tip: Omit<TlTip, 'x' | 'y'>): TlTip {
  const r = el.getBoundingClientRect()
  const z = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1
  return { ...tip, x: (r.left + r.width / 2) / z, y: r.top / z }
}
function TimelineCard({ g, tone, title, prefix, subtitle, range, zIndex = 5, onDrag, onResize, onRemove, removeLabel = '빼기', onTip }: {
  g: TlGeom
  tone: TlTone; title: string; prefix?: string; subtitle?: string; range: string
  zIndex?: number
  onDrag: (clientY: number) => void
  onResize: (clientY: number) => void
  onRemove?: () => void
  removeLabel?: string
  onTip: (tip: TlTip | null) => void
}) {
  const compact = g.px < TL_COMPACT_H
  return (
    <div className="group"
      onMouseDown={e => { e.preventDefault(); onTip(null); onDrag(e.clientY) }}
      onMouseEnter={e => onTip(tlTipAt(e.currentTarget, { title: `${prefix ?? ''}${title}`, range, subtitle }))}
      onMouseLeave={() => onTip(null)}
      style={{
        position: 'absolute', left: g.left, width: g.width, top: g.top, height: g.height,
        borderRadius: 6, cursor: 'grab',
        ...tlCardStyle(tone),
        padding: compact ? '0 7px' : '5px 7px',
        display: 'flex', flexDirection: 'column', justifyContent: compact ? 'center' : 'flex-start',
        overflow: 'hidden', userSelect: 'none', zIndex,
      }}>
      <TlCardBody g={g} title={<>{prefix}{title}</>} padRight={onRemove ? 14 : 0} />
      <div onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onTip(null); onResize(e.clientY) }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, cursor: 'ns-resize' }} />
      {onRemove && (
        <button type="button" aria-label={removeLabel} title={removeLabel} className="opacity-0 group-hover:opacity-100"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onTip(null); onRemove() }}
          style={{ position: 'absolute', right: 5, top: compact ? 'calc(50% - 7px)' : 5, width: 14, height: 14, background: 'rgba(var(--ink-rgb),0.10)', border: 'none', borderRadius: '50%', color: TEXT2, cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 120ms ease' }}>
          <X size={9} />
        </button>
      )}
    </div>
  )
}

// ── KpiChip ────────────────────────────────────────────────────────────────
function KpiChip({ dot, label, onClick }: { dot: string; label: string; onClick?: () => void }) {
  const [h, setH] = useState(false)
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 13px', borderRadius: 999,
        border: `1px solid ${h ? 'rgba(var(--ink-rgb),0.15)' : 'rgba(var(--ink-rgb),0.10)'}`,
        background: h ? 'rgba(var(--ink-rgb),0.06)' : 'rgba(var(--ink-rgb),0.03)',
        transition: 'all 150ms ease', cursor: onClick ? 'pointer' : 'default', flexShrink: 0,
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: `0 0 6px ${dot}80` }} />
      <span style={{ fontSize: 12, color: 'rgba(var(--ink-rgb),0.72)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      {onClick && <span style={{ fontSize: 13, color: 'rgba(var(--ink-rgb),0.35)', lineHeight: 1, marginLeft: -2 }}>+</span>}
    </div>
  )
}

// ── DualLaneTimeline ───────────────────────────────────────────────────────
function DualLaneTimeline({ meetings, todos, scheduleItems, googleEvents, now, selectedDate, isToday, onNavigateDate, onJumpToday, onPickDate, onAddScheduleItem, onRemoveScheduleItem, onUpdateScheduleItemPosition, onSelectGoogleEvent, fixedMeetings = [] }: {
  meetings: Meeting[]
  todos: TodayTodo[]
  scheduleItems: ScheduleItem[]
  googleEvents: GoogleCalendarEvent[]
  now: Date
  selectedDate: string
  isToday: boolean
  onNavigateDate: (dir: -1 | 1) => void
  onJumpToday: () => void
  onPickDate: (date: string) => void
  onAddScheduleItem: (title: string, startHour: number) => Promise<void>
  onRemoveScheduleItem: (id: string) => void
  onUpdateScheduleItemPosition: (id: string, startHour: number, durationHours: number) => void
  onSelectGoogleEvent: (ev: GoogleCalendarEvent) => void
  fixedMeetings?: MeetingSchedule[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)   // 9~21시 칸 (위치는 모두 이 칸에 대한 %)
  const viewportRef  = useRef<HTMLDivElement>(null)   // 세로 스크롤 칸
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [ch, setCh] = useState(0)   // 칸 높이 — 카드를 한 줄/여러 줄로 그릴지 판단에만 쓴다
  const [tip, setTip] = useState<TlTip | null>(null)   // 카드 hover 툴팁 (전체 제목 + 시간)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => setCh(e.contentRect.height))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const [mPos, setMPos] = useState<Record<string, number>>({})
  const [mDur, setMDur] = useState<Record<string, number>>({})
  const [tPos, setTPos] = useState<Record<string, number>>({})
  const [tDur, setTDur] = useState<Record<string, number>>({})

  const [live, setLive] = useState<{ hour: number; dur: number } | null>(null)   // 이동/끝시간 조절 중인 카드의 시간 범위

  // ── 일정 추가 팝오버 (회의는 구글캘린더 연동으로 대체 — 업무만 수기 추가) ──
  const [addOpen, setAddOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const addRef = useRef<HTMLDivElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!addOpen) return
    function onClickOutside(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [addOpen])

  useEffect(() => { if (addOpen) setTimeout(() => addInputRef.current?.focus(), 30) }, [addOpen])

  async function handleAddSubmit() {
    const title = addTitle.trim()
    if (!title) return
    const startHour = Math.min(H_END - 1, Math.max(H_START, Math.round(now.getHours())))
    await onAddScheduleItem(title, startHour)
    setAddTitle('')
    setAddOpen(false)
  }

  // ── 업무 일정(schedule_items) — 위치/기간은 로컬에서 즉시 반영, 드래그가
  //    끝났을 때만 부모로 올려 DB에 저장 (todos/meetings와 같은 패턴) ──────
  const [siPos, setSiPos] = useState<Record<string, number>>({})
  const [siDur, setSiDur] = useState<Record<string, number>>({})


  useEffect(() => {
    setSiPos(prev => {
      const next = { ...prev }
      scheduleItems.forEach(s => { if (!(s.id in next)) next[s.id] = s.start_hour })
      return next
    })
    setSiDur(prev => {
      const next = { ...prev }
      scheduleItems.forEach(s => { if (!(s.id in next)) next[s.id] = s.duration_hours })
      return next
    })
  }, [scheduleItems])

  // 업무 일정은 드래그가 끝났을 때만 부모로 올려 DB에 저장
  const onSiDrag   = (id: string, y: number, h: number, d: number) => startCardDrag('move',   y, h, d, nh => setSiPos(p => ({ ...p, [id]: nh })), onUpdateScheduleItemPosition.bind(null, id))
  const onSiResize = (id: string, y: number, h: number, d: number) => startCardDrag('resize', y, h, d, (nh, nd) => setSiDur(p => ({ ...p, [id]: nd })), onUpdateScheduleItemPosition.bind(null, id))

  // ── Extras (외부에서 드래그된 항목) ────────────────────────────────────
  const [extras,   setExtras]   = useState<TLExtra[]>([])
  const [extraPos, setExtraPos] = useState<Record<string, number>>({})
  const [extraDur, setExtraDur] = useState<Record<string, number>>({})
  const [dropIndicatorY, setDropIndicatorY] = useState<number | null>(null)


  useEffect(() => {
    try {
      const savedDate = localStorage.getItem('home_tl_date')
      if (savedDate !== todayStr()) {
        // 날짜가 바뀌면 어제 타임라인 배치는 버린다 (퀵메모/회의록 드래그 항목 포함)
        ;['home_tl_pos', 'home_tl_dur', 'home_tl_task_pos', 'home_tl_task_dur', 'home_tl_extras', 'home_tl_extra_pos', 'home_tl_extra_dur']
          .forEach(k => localStorage.removeItem(k))
        localStorage.setItem('home_tl_date', todayStr())
        return
      }
      const mp = localStorage.getItem('home_tl_pos')
      const md = localStorage.getItem('home_tl_dur')
      const tp = localStorage.getItem('home_tl_task_pos')
      const td = localStorage.getItem('home_tl_task_dur')
      const ex = localStorage.getItem('home_tl_extras')
      const ep = localStorage.getItem('home_tl_extra_pos')
      const ed = localStorage.getItem('home_tl_extra_dur')
      if (mp) setMPos(JSON.parse(mp))
      if (md) setMDur(JSON.parse(md))
      if (tp) setTPos(JSON.parse(tp))
      if (td) setTDur(JSON.parse(td))
      if (ex) setExtras(JSON.parse(ex))
      if (ep) setExtraPos(JSON.parse(ep))
      if (ed) setExtraDur(JSON.parse(ed))
    } catch {}
  }, [])

  useEffect(() => { try { localStorage.setItem('home_tl_pos', JSON.stringify(mPos)); localStorage.setItem('home_tl_date', todayStr()) } catch {} }, [mPos])
  useEffect(() => { try { localStorage.setItem('home_tl_dur', JSON.stringify(mDur)); localStorage.setItem('home_tl_date', todayStr()) } catch {} }, [mDur])
  useEffect(() => { try { localStorage.setItem('home_tl_task_pos', JSON.stringify(tPos)); localStorage.setItem('home_tl_date', todayStr()) } catch {} }, [tPos])
  useEffect(() => { try { localStorage.setItem('home_tl_task_dur', JSON.stringify(tDur)); localStorage.setItem('home_tl_date', todayStr()) } catch {} }, [tDur])
  useEffect(() => { try { localStorage.setItem('home_tl_extras', JSON.stringify(extras)); localStorage.setItem('home_tl_date', todayStr()) } catch {} }, [extras])
  useEffect(() => { try { localStorage.setItem('home_tl_extra_pos', JSON.stringify(extraPos)); localStorage.setItem('home_tl_date', todayStr()) } catch {} }, [extraPos])
  useEffect(() => { try { localStorage.setItem('home_tl_extra_dur', JSON.stringify(extraDur)); localStorage.setItem('home_tl_date', todayStr()) } catch {} }, [extraDur])

  // 카드별 시작·길이. 종일 일정은 위 '종일' 줄, 아직 시간을 안 정한 오늘 할 일은 '시간 미정' 칸으로 빠진다
  const allDayEvents = googleEvents.filter(ev => ev.allDay)
  const untimedTodos = todos.filter(t => tPos[t.id] == null)
  const slots: TlSlot[] = [
    ...googleEvents.filter(ev => !ev.allDay).map(ev => ({ key: `g:${ev.id}`, hour: ev.start_hour, dur: ev.duration_hours })),
    ...meetings.map((m, i) => ({ key: `m:${m.id}`, hour: mPos[m.id] ?? (H_START + i * 1.5), dur: mDur[m.id] ?? 1 })),
    ...fixedMeetings.map(f => {
      const fid = `fixed_${f.id}`, [fh, fm] = f.time.split(':').map(Number)
      return { key: `f:${f.id}`, hour: mPos[fid] ?? fh + fm / 60, dur: mDur[fid] ?? 1 }
    }),
    ...todos.filter(t => tPos[t.id] != null).map(t => ({ key: `t:${t.id}`, hour: tPos[t.id], dur: tDur[t.id] ?? 1 })),
    ...extras.map((ex, i) => ({ key: `x:${ex.id}`, hour: extraPos[ex.id] ?? (H_START + i * 1.2), dur: extraDur[ex.id] ?? 1 })),
    ...scheduleItems.map(si => ({ key: `s:${si.id}`, hour: siPos[si.id] ?? si.start_hour, dur: siDur[si.id] ?? si.duration_hours })),
  ]
  const slotOf = Object.fromEntries(slots.map(sl => [sl.key, sl]))
  // 레인 0 = 일정·구글캘린더, 1 = 회의·업무 — 겹침 배치는 레인 안에서만
  const laneOf = (key: string) => key.startsWith('g:') ? 0 : 1
  const slotCols = { ...layoutTlSlots(slots.filter(sl => laneOf(sl.key) === 0)), ...layoutTlSlots(slots.filter(sl => laneOf(sl.key) === 1)) }
  const hourPx = ch / TL_HOURS
  const laneFree = `((100% - ${TL_GUTTER + TL_LANE_GAP}px) / 2)`   // 레인 하나의 폭

  function cardGeom(key: string): TlGeom {
    const { hour, dur } = slotOf[key], { col, cols } = slotCols[key], lane = laneOf(key)
    const start = Math.max(H_START, Math.min(H_END - 0.25, hour))
    const len = Math.min(H_END - start, Math.max(0.25, dur))
    const free = `(${laneFree} - ${TL_COL_GAP * (cols - 1)}px)`   // 레인 폭에서 카드 사이 간격을 뺀 폭
    return {
      left: `calc(${TL_GUTTER + lane * TL_LANE_GAP + col * TL_COL_GAP}px + ${laneFree} * ${lane} + ${free} * ${col / cols})`,
      width: `calc(${free} / ${cols})`,
      top: `calc(${tlPct(start)} + ${TL_CARD_GAP / 2}px)`,
      height: `calc(${(len / TL_HOURS) * 100}% - ${TL_CARD_GAP}px)`,
      px: len * hourPx - TL_CARD_GAP,
    }
  }

  // 지금 시각이 보이게 처음 한 번 스크롤 (12시간이 다 들어가면 스크롤 없음)
  const didAutoScroll = useRef(false)
  useEffect(() => {
    const el = viewportRef.current
    if (didAutoScroll.current || !el || ch === 0 || !isToday) return
    didAutoScroll.current = true
    if (el.scrollHeight <= el.clientHeight + 1) return
    const f = (now.getHours() + now.getMinutes() / 60 - H_START) / TL_HOURS
    el.scrollTop = Math.max(0, f * el.scrollHeight - el.clientHeight / 3)
  }, [ch, isToday, now])

  // 칸 안 세로 위치(화면 px) → 시각. clientY와 getBoundingClientRect가 같은 화면 단위라 zoom 환산이 필요 없다
  function hourAtY(clientY: number) {
    const r = containerRef.current?.getBoundingClientRect()
    if (!r || r.height === 0) return null
    return H_START + ((clientY - r.top) / r.height) * TL_HOURS
  }

  // 카드 이동/끝시간 조절 공통 — 5분 단위로 스냅하고, 움직이는 동안 시간 범위 배지(live)를 띄운다.
  // hour/dur는 화면에 그려진 카드 값을 그대로 받는다 (저장 위치가 없는 카드의 기본 배치도 그대로 시작점)
  // 움직이지 않고 마우스를 떼면 아무것도 저장하지 않는다
  function startCardDrag(mode: 'move' | 'resize', startY: number, hour: number, dur: number,
    apply: (hour: number, dur: number) => void, onDone?: (hour: number, dur: number) => void) {
    const r = containerRef.current?.getBoundingClientRect()
    if (!r || r.height === 0) return
    const pxPerHour = r.height / TL_HOURS
    let cur = { hour, dur }
    let moved = false
    function onMove(e: MouseEvent) {
      if (!moved && Math.abs(e.clientY - startY) < 3) return
      moved = true
      const delta = (e.clientY - startY) / pxPerHour
      if (mode === 'move') {
        cur = { hour: Math.max(H_START, Math.min(H_END - dur, snap5(hour + delta))), dur }
      } else {
        const end = Math.max(hour + 0.25, Math.min(H_END, snap5(hour + dur + delta)))   // 끝 시각을 5분에 맞춤, 최소 15분
        cur = { hour, dur: end - hour }
      }
      setLive(cur)
      apply(cur.hour, cur.dur)
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      setLive(null)
      if (moved) onDone?.(cur.hour, cur.dur)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }
  const onMDrag   = (id: string, y: number, h: number, d: number) => startCardDrag('move',   y, h, d, nh => setMPos(p => ({ ...p, [id]: nh })))
  const onMResize = (id: string, y: number, h: number, d: number) => startCardDrag('resize', y, h, d, (nh, nd) => setMDur(p => ({ ...p, [id]: nd })))
  const onTDrag   = (id: string, y: number, h: number, d: number) => startCardDrag('move',   y, h, d, nh => setTPos(p => ({ ...p, [id]: nh })))
  const onTResize = (id: string, y: number, h: number, d: number) => startCardDrag('resize', y, h, d, (nh, nd) => setTDur(p => ({ ...p, [id]: nd })))
  const onExDrag   = (id: string, y: number, h: number, d: number) => startCardDrag('move',   y, h, d, nh => setExtraPos(p => ({ ...p, [id]: nh })))
  const onExResize = (id: string, y: number, h: number, d: number) => startCardDrag('resize', y, h, d, (nh, nd) => setExtraDur(p => ({ ...p, [id]: nd })))

  function onRemoveExtra(id: string) {
    setExtras(p => p.filter(e => e.id !== id))
    setExtraPos(p => { const n = { ...p }; delete n[id]; return n })
    setExtraDur(p => { const n = { ...p }; delete n[id]; return n })
  }
  // 오늘 할 일을 타임라인에서 빼 '시간 미정'으로 되돌림
  function unplaceTodo(id: string) {
    setTPos(p => { const n = { ...p }; delete n[id]; return n })
    setTDur(p => { const n = { ...p }; delete n[id]; return n })
  }

  function onContainerDragOver(e: React.DragEvent) {
    const types = e.dataTransfer.types
    if (!types.includes('tl-extra') && !types.includes(TL_TODO_DND)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = types.includes(TL_TODO_DND) ? 'move' : 'copy'
    const h = hourAtY(e.clientY)
    if (h !== null) setDropIndicatorY(Math.max(H_START, Math.min(H_END - 0.25, snap5(h))))
  }

  function onContainerDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndicatorY(null)
  }

  function onContainerDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropIndicatorY(null)
    const h = hourAtY(e.clientY)
    if (h === null) return
    const hour = Math.max(H_START, Math.min(H_END - 1, snap5(h)))
    const todoId = e.dataTransfer.getData(TL_TODO_DND)
    if (todoId) {
      setTPos(p => ({ ...p, [todoId]: hour }))
      setTDur(p => ({ ...p, [todoId]: p[todoId] ?? 1 }))
      return
    }
    try {
      const raw = e.dataTransfer.getData('tl-extra')
      if (!raw) return
      const item: TLExtra = JSON.parse(raw)
      if (extras.some(ex => ex.id === item.id)) {
        setExtraPos(p => ({ ...p, [item.id]: hour }))
        return
      }
      setExtras(p => [...p, item])
      setExtraPos(p => ({ ...p, [item.id]: hour }))
      setExtraDur(p => ({ ...p, [item.id]: 1 }))
    } catch {}
  }

  const curH    = now.getHours() + now.getMinutes() / 60
  const inRange = isToday && curH >= H_START && curH <= H_END
  const hours   = Array.from({ length: TL_HOURS + 1 }, (_, i) => H_START + i)

  function hourToStr(h: number) {
    const total = Math.round(h * 60)   // 분 단위로 먼저 반올림 — 9.999h가 09:60으로 찍히지 않게
    return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
  }
  const rangeStr = (h: number, d: number) => `${hourToStr(h)} – ${hourToStr(h + d)}`
  const navBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-tint-text)', fontSize: 11, padding: '0 3px', lineHeight: 1 }

  return (
    <div data-home="timeline" style={{ ...cardBase(), borderRadius: 14, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'none' }}>
      {/* 헤더 — 제목 · 날짜 이동 | 업무 추가 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 6, columnGap: 8, padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={14} strokeWidth={2.2} style={{ color: TL_NOW }} />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT1, letterSpacing: '-0.02em', margin: 0 }}>오늘의 타임라인</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 5px', borderRadius: 6, background: 'rgba(var(--accent-tint-rgb),0.12)', border: '1px solid rgba(var(--accent-tint-rgb),0.26)' }}>
            <button type="button" aria-label="이전 날" onClick={() => onNavigateDate(-1)} style={navBtn}>‹</button>
            <span onClick={() => dateInputRef.current?.showPicker?.()}
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '0 2px' }}>
              <span style={{ fontSize: 11, color: 'var(--accent-tint-text)', fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                {isToday ? '오늘' : format(parseISO(selectedDate), 'M월 d일 (eee)', { locale: ko })}
              </span>
            </span>
            <input ref={dateInputRef} type="date" value={selectedDate}
              onChange={e => { if (e.target.value) onPickDate(e.target.value) }}
              className="sr-only" />
            <button type="button" aria-label="다음 날" onClick={() => onNavigateDate(1)} style={navBtn}>›</button>
          </div>
          {!isToday && (
            <button type="button" onClick={onJumpToday}
              style={{ fontSize: 10.5, color: TEXT3, background: 'none', border: '1px solid rgba(var(--ink-rgb),0.12)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>
              오늘로
            </button>
          )}
        </div>
        <div ref={addRef} style={{ position: 'relative' }}>
          <button type="button"
            onClick={() => setAddOpen(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(var(--accent-tint-rgb),0.35)', background: 'rgba(var(--accent-tint-rgb),0.10)', color: 'var(--accent-tint-text)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--accent-tint-rgb),0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--accent-tint-rgb),0.10)' }}
          >
            <Plus size={11} />
            업무 추가
          </button>

          {addOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 30,
              width: 240, padding: 12, borderRadius: 12,
              background: 'var(--surface-tooltip)', border: '1px solid rgba(var(--ink-rgb),0.10)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            }}>
              <input
                ref={addInputRef}
                value={addTitle}
                onChange={e => setAddTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddSubmit()
                  if (e.key === 'Escape') setAddOpen(false)
                }}
                placeholder="업무 제목 입력 후 Enter"
                style={{ width: '100%', fontSize: 12.5, color: TEXT1, background: 'rgba(var(--ink-rgb),0.05)', border: '1px solid rgba(var(--ink-rgb),0.09)', borderRadius: 7, padding: '7px 9px', outline: 'none' }}
              />
              <p style={{ fontSize: 10, color: TEXT3, marginTop: 6 }}>현재 시각 근처에 추가되고, 이후 드래그로 옮길 수 있어요.</p>
            </div>
          )}
        </div>
      </div>

      {/* 시간 미정 — 아직 시간을 안 정한 오늘 할 일. 끌어서 아래 시각에 놓으면 배치된다 */}
      {untimedTodos.length > 0 && (
        <div style={{ margin: '10px 14px 0', padding: '0 8px', height: 34, borderRadius: 8, border: '1px dashed rgba(var(--ink-rgb),0.16)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, minWidth: 0 }}>
          <span style={{ fontSize: 10.5, color: TEXT3, flexShrink: 0 }}>시간 미정</span>
          {/* 한 줄 고정 — 칩이 많으면 옆으로 스크롤 (타임라인 높이가 칩 수에 따라 변하지 않게) */}
          <div className="scrollbar-hide" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
          {untimedTodos.map(t => (
            <span key={t.id} draggable title={`${t.title} — 끌어서 시간에 놓기`}
              onDragStart={e => { e.dataTransfer.setData(TL_TODO_DND, t.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragEnd={() => setDropIndicatorY(null)}
              style={{ flexShrink: 0, maxWidth: 180, fontSize: 11.5, color: TEXT1, padding: '3px 8px', borderRadius: 6, ...tlCardStyle(TL_TONES.task), cursor: 'grab', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}
            </span>
          ))}
          </div>
          <span style={{ flexShrink: 0, fontSize: 10, color: TEXT3, opacity: 0.8, whiteSpace: 'nowrap' }}>끌어서 배치 ↓</span>
        </div>
      )}

      {/* 레인 머리 행 — 아래 시간 칸과 같은 폭(시각 칸 + 반반 두 레인). 종일 일정은 일정 레인 아래 칩으로 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: TL_LANE_GAP, rowGap: 4, margin: '10px 14px 0 8px', paddingLeft: TL_GUTTER, flexShrink: 0 }}>
        {(['일정 · 구글캘린더', '회의 · 업무'] as const).map(label => (
          <span key={label} style={{ fontSize: 10.5, fontWeight: 500, color: TEXT3, letterSpacing: '0.02em', paddingLeft: 2, paddingBottom: 4, borderBottom: `1px solid ${DIVIDER}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        ))}
        {allDayEvents.length > 0 && (
          // 한 줄 고정 — 종일 일정이 많으면 옆으로 스크롤
          <div className="scrollbar-hide" style={{ gridColumn: 1, display: 'flex', gap: 4, minWidth: 0, overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
            {allDayEvents.map(ev => (
              <button key={ev.id} type="button" title={`종일 · ${ev.title}`} onClick={() => onSelectGoogleEvent(ev)}
                style={{ ...tlCardStyle(TL_TONES.gcal), flexShrink: 0, maxWidth: 160, borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 400, color: TEXT1, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontWeight: 400, color: TEXT2, marginRight: 4 }}>종일</span>{ev.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 세로 스크롤 칸 — 9~21시 칸은 이 칸 높이를 꽉 채우고, TL_HOUR_MIN × 12보다 낮을 때만 스크롤 */}
      <div ref={viewportRef} className="scrollbar-hide" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehaviorY: 'contain', margin: '0 14px 0 8px', padding: '10px 0 12px' }}>
      <div ref={containerRef}
        style={{ position: 'relative', height: `max(100%, ${TL_HOURS * TL_HOUR_MIN}px)` }}
        onDragOver={onContainerDragOver}
        onDragLeave={onContainerDragLeave}
        onDrop={onContainerDrop}
      >
        {/* 시각 표시 + 정시 실선 · 30분 점선 */}
        {hours.map((h, i) => (
          <div key={h}>
            <span style={{ position: 'absolute', left: 0, width: TL_GUTTER - 10, textAlign: 'right', top: tlPct(h), transform: 'translateY(-50%)', fontSize: 10, color: TEXT3, userSelect: 'none', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {String(h).padStart(2, '0')}:00
            </span>
            <div style={{ position: 'absolute', top: tlPct(h), left: TL_GUTTER, right: 0, height: 1, background: 'rgba(var(--ink-rgb),0.07)', pointerEvents: 'none' }} />
            {i < TL_HOURS && <div style={{ position: 'absolute', top: tlPct(h + 0.5), left: TL_GUTTER, right: 0, borderTop: '1px dashed rgba(var(--ink-rgb),0.06)', pointerEvents: 'none' }} />}
          </div>
        ))}

        {/* 레인 바탕 */}
        {[0, 1].map(lane => (
          <div key={`lane${lane}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${TL_GUTTER + lane * TL_LANE_GAP}px + ${laneFree} * ${lane})`, width: `calc(${laneFree})`, borderRadius: 5, background: 'rgba(var(--ink-rgb),0.018)', pointerEvents: 'none' }} />
        ))}

        {/* 지금 — 빨간 선 + 시각 배지 */}
        {inRange && (
          <>
            <div style={{ position: 'absolute', top: tlPct(curH), left: TL_GUTTER - 2, right: 0, height: 1.5, background: TL_NOW, pointerEvents: 'none', zIndex: 10 }} />
            <div style={{ position: 'absolute', left: 0, top: tlPct(curH), transform: 'translateY(-50%)', background: TL_NOW, color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, pointerEvents: 'none', zIndex: 12, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {hourToStr(curH)}
            </div>
          </>
        )}

        {/* ── 회의 ── */}
        {meetings.map(m => {
          const { hour, dur } = slotOf[`m:${m.id}`]
          return (
            <TimelineCard key={m.id} g={cardGeom(`m:${m.id}`)}
              tone={TL_TONES.meet} title={m.title} range={rangeStr(hour, dur)}
              onDrag={cy => onMDrag(m.id, cy, hour, dur)} onResize={cy => onMResize(m.id, cy, hour, dur)} onTip={setTip} />
          )
        })}

        {/* ── 고정 회의 ── */}
        {fixedMeetings.map(s => {
          const fid = `fixed_${s.id}`
          const { hour, dur } = slotOf[`f:${s.id}`]
          return (
            <TimelineCard key={fid} g={cardGeom(`f:${s.id}`)} zIndex={4}
              tone={TL_TONES.meet} prefix="↺ " title={s.title} range={rangeStr(hour, dur)}
              onDrag={cy => onMDrag(fid, cy, hour, dur)} onResize={cy => onMResize(fid, cy, hour, dur)} onTip={setTip} />
          )
        })}

        {/* ── 구글캘린더 (읽기전용 — 드래그/추가 불가, 클릭 시 회의록 생성/이동) ── */}
        {googleEvents.map(ev => {
          if (ev.allDay) return null
          const g = cardGeom(`g:${ev.id}`)
          const compact = g.px < TL_COMPACT_H
          return (
            <div key={ev.id}
              onClick={() => { setTip(null); onSelectGoogleEvent(ev) }}
              onMouseEnter={e => setTip(tlTipAt(e.currentTarget, { title: ev.title, range: rangeStr(ev.start_hour, ev.duration_hours), hint: '클릭하면 회의록 만들기·열기' }))}
              onMouseLeave={() => setTip(null)}
              style={{
                position: 'absolute', left: g.left, width: g.width, top: g.top, height: g.height,
                borderRadius: 6, cursor: 'pointer',
                ...tlCardStyle(TL_TONES.gcal),
                padding: compact ? '0 7px' : '5px 7px',
                display: 'flex', flexDirection: 'column', justifyContent: compact ? 'center' : 'flex-start',
                overflow: 'hidden', userSelect: 'none', zIndex: 5,
              }}>
              <TlCardBody g={g} title={ev.title} />
            </div>
          )
        })}

        {/* ── 오늘 할 일 (시간을 정한 것만 — 나머지는 위 '시간 미정') ── */}
        {todos.filter(t => tPos[t.id] != null).map(t => {
          const { hour, dur } = slotOf[`t:${t.id}`]
          return (
            <TimelineCard key={t.id} g={cardGeom(`t:${t.id}`)}
              tone={TL_TONES.task} title={t.title} range={rangeStr(hour, dur)}
              onDrag={cy => onTDrag(t.id, cy, hour, dur)} onResize={cy => onTResize(t.id, cy, hour, dur)}
              onRemove={() => unplaceTodo(t.id)} removeLabel="시간 미정으로 되돌리기" onTip={setTip} />
          )
        })}

        {/* ── 이동/끝시간 조절 중 시간 범위 배지 ── */}
        {live && (
          <div style={{
            position: 'absolute', zIndex: 14, pointerEvents: 'none', whiteSpace: 'nowrap',
            right: 4, top: tlPct(live.hour), transform: live.hour - H_START < 0.5 ? 'translateY(4px)' : 'translateY(calc(-100% - 3px))',
            background: 'var(--surface-tooltip)', color: TEXT1, border: '1px solid rgba(var(--accent-tint-rgb),0.45)',
            fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, fontVariantNumeric: 'tabular-nums',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}>
            {rangeStr(live.hour, live.dur)}
          </div>
        )}

        {/* ── 끌어 놓을 위치 ── */}
        {dropIndicatorY !== null && (
          <div style={{ position: 'absolute', top: tlPct(dropIndicatorY), left: TL_GUTTER, right: 0, height: 2, background: 'rgba(76,127,224,0.7)', pointerEvents: 'none', zIndex: 20, boxShadow: '0 0 8px rgba(76,127,224,0.4)' }}>
            <span style={{ position: 'absolute', right: 0, top: -16, fontSize: 10, fontWeight: 700, color: 'rgb(76,127,224)', fontVariantNumeric: 'tabular-nums' }}>{hourToStr(dropIndicatorY)}</span>
          </div>
        )}

        {/* ── 외부에서 끌어온 항목 (퀵메모·세부task 등) ── */}
        {extras.map(ex => {
          const { hour, dur } = slotOf[`x:${ex.id}`]
          return (
            <TimelineCard key={ex.id} g={cardGeom(`x:${ex.id}`)} zIndex={6}
              tone={TL_TONES.task} title={ex.title} subtitle={ex.subtitle} range={rangeStr(hour, dur)}
              onDrag={cy => onExDrag(ex.id, cy, hour, dur)} onResize={cy => onExResize(ex.id, cy, hour, dur)}
              onRemove={() => onRemoveExtra(ex.id)} onTip={setTip} />
          )
        })}

        {/* ── 업무 일정 (schedule_items, "업무 추가"로 만든 항목) ── */}
        {scheduleItems.map(s => {
          const { hour, dur } = slotOf[`s:${s.id}`]
          return (
            <TimelineCard key={s.id} g={cardGeom(`s:${s.id}`)} zIndex={6}
              tone={TL_TONES.task} title={s.title} range={rangeStr(hour, dur)}
              onDrag={cy => onSiDrag(s.id, cy, hour, dur)} onResize={cy => onSiResize(s.id, cy, hour, dur)}
              onRemove={() => onRemoveScheduleItem(s.id)} removeLabel="삭제" onTip={setTip} />
          )
        })}
      </div>
      </div>

      {/* 카드 hover 툴팁 — 시간 + 전체 제목 (박스에는 제목만 2줄) */}
      {tip && !live && (
        <div style={{
          position: 'fixed', left: tip.x, top: tip.y - 6,
          transform: 'translate(-50%, -100%)',
          width: 'max-content', maxWidth: 280, padding: '8px 11px', borderRadius: 9,
          background: 'var(--surface-tooltip)', border: '1px solid rgba(var(--ink-rgb),0.12)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
          pointerEvents: 'none', zIndex: 9999,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: TEXT2, marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{tip.range}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT1, lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{tip.title}</div>
          {tip.subtitle && <div style={{ fontSize: 11, color: TEXT3, marginTop: 2, lineHeight: 1.4 }}>{tip.subtitle}</div>}
          {tip.hint && <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 4 }}>{tip.hint}</div>}
        </div>
      )}
    </div>
  )
}

// ── WeekPicker — 금주 업무 주 이동 달력 (월요일 시작, 주 단위 행 선택) ──────────
function WeekPicker({ weekMonday, today, onPick, onClose }: {
  weekMonday: string
  today: string
  onPick: (dateStr: string) => void
  onClose: () => void
}) {
  const [view, setView] = useState(() => ({ y: +weekMonday.slice(0, 4), m: +weekMonday.slice(5, 7) - 1 }))
  const [hoverRow, setHoverRow] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) onClose() }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  // 해당 월을 덮는 주(월요일 시작)들 — 최대 6행
  const first = localDateStr(new Date(view.y, view.m, 1))
  const gridStart = shiftDateStr(first, -((dowOfDateStr(first) + 6) % 7))
  const rows: string[][] = []
  for (let r = 0; r < 6; r++) {
    const row = Array.from({ length: 7 }, (_, i) => shiftDateStr(gridStart, r * 7 + i))
    if (r > 0 && +row[0].slice(5, 7) - 1 !== view.m) break
    rows.push(row)
  }
  const shiftMonth = (d: number) => setView(v => { const t = new Date(v.y, v.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() } })
  const navBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: TEXT2, cursor: 'pointer', fontSize: 14 }
  const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.06)' }
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'none' }

  return (
    <div ref={ref} onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 60, width: 268, padding: 12, borderRadius: 14, background: 'var(--dropdown-panel-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(var(--ink-rgb),0.10)', boxShadow: '0 18px 48px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.06)', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => shiftMonth(-1)} style={navBtn} aria-label="이전 달" onMouseEnter={hoverOn} onMouseLeave={hoverOff}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT1, letterSpacing: '-0.01em' }}>{view.y}년 {view.m + 1}월</span>
        <button type="button" onClick={() => shiftMonth(1)} style={navBtn} aria-label="다음 달" onMouseEnter={hoverOn} onMouseLeave={hoverOff}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
          <span key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 500, padding: '4px 0', color: i >= 5 ? TEXT3 : TEXT2, opacity: i >= 5 ? 0.7 : 1 }}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((row, ri) => {
          const isSel = row[0] === weekMonday
          const isHover = hoverRow === ri && !isSel
          return (
            <button key={row[0]} type="button" onClick={() => onPick(row[0])}
              onMouseEnter={() => setHoverRow(ri)} onMouseLeave={() => setHoverRow(null)}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: 30, borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer',
                background: isSel ? 'rgba(var(--accent-tint-rgb),0.14)' : isHover ? 'rgba(var(--ink-rgb),0.05)' : 'transparent', transition: 'background 120ms ease' }}>
              {row.map((d, i) => {
                const inMonth = +d.slice(5, 7) - 1 === view.m
                const isToday = d === today
                return (
                  <span key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums',
                      fontWeight: isToday ? 600 : isSel ? 500 : 400,
                      background: isToday ? ACCENT : 'transparent',
                      color: isToday ? '#fff' : isSel ? 'var(--accent-tint-text)' : (!inMonth || i >= 5) ? TEXT3 : TEXT1,
                      opacity: !inMonth && !isToday ? 0.45 : 1 }}>
                      {+d.slice(8)}
                    </span>
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${DIVIDER}` }}>
        <span style={{ fontSize: 11, color: TEXT3 }}>주를 선택하세요</span>
        <button type="button" onClick={() => onPick(today)}
          style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--accent-tint-text)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>이번 주</button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [quickTodos,    setQuickTodos]    = useState<QuickTodo[]>([])
  const [quickAddOpen,  setQuickAddOpen]  = useState(false)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [weekAddDate,   setWeekAddDate]   = useState<string | null>(null)   // 금주 업무: 즉석 할 일을 추가할 요일 날짜
  const [showJournal,   setShowJournal]   = useState(false)
  const [fMemoOpen,     setFMemoOpen]     = useState<Record<string, boolean>>({})
  const [fMemoTexts,    setFMemoTexts]    = useState<Record<string, string>>({})
  const [fMemoSaving,   setFMemoSaving]   = useState<Record<string, boolean>>({})
  const [fMemoSaved,    setFMemoSaved]    = useState<Record<string, boolean>>({})
  const [memoViewId,    setMemoViewId]    = useState<string | null>(null)
  const [weekOffset,    setWeekOffset]    = useState(0)   // 금주 업무 주 이동 (0 = 이번 주)
  const [weekDropDate,  setWeekDropDate]  = useState<string | null>(null)   // 즉석 할일 드래그 중 강조할 요일 열
  const [weekPickerOpen, setWeekPickerOpen] = useState(false)
  const [olderOpen,     setOlderOpen]     = useState(false)   // 직전주 열 '이전 N건' 모달
  const [olderDragging, setOlderDragging] = useState(false)   // 모달에서 끄는 중 — 아래 요일 열에 놓을 수 있게 모달을 잠깐 투명·클릭 통과
  const [olderSel,      setOlderSel]      = useState<Set<string>>(new Set())   // 모달 일괄 선택(WeekItem.key)
  const [olderConfirmDelete, setOlderConfirmDelete] = useState(false)   // 일괄 삭제는 두 번 눌러 실행
  const [hoveredStId,   setHoveredStId]   = useState<string | null>(null)
  const [datePickerStId,setDatePickerStId] = useState<string | null>(null)
  // 초기값을 epoch(고정값)로 둬서 SSR과 클라이언트 첫 렌더가 항상 일치하게 함 —
  // new Date()를 렌더 중에 직접 호출하면 서버 렌더 시각과 클라이언트 하이드레이션 시각이
  // 달라 hydration mismatch(React #418)가 발생하고, 이는 next/link의 client-side
  // navigation을 깨뜨려 모든 링크 클릭이 hard reload로 떨어지는 원인이 된다.
  const [now,           setNow]           = useState(new Date(0))
  const [stCols,        setStCols]        = useState<[number, number, number, number, number]>([56, 160, 72, 64, 100])
  const [stSort,        setStSort]        = useState<{ col: string; dir: 'asc' | 'desc' } | null>({ col: '업데이트', dir: 'desc' })
  const [stRowH,        setStRowH]        = useState(40)
  const [isCompact,     setIsCompact]     = useState(false)
  const [homeFit,       setHomeFit]       = useState({ zoom: 1, vs: 1 })   // 화면 비율 맞춤 (HOME_REF_H 기준)
  const homeOuterRef  = useRef<HTMLDivElement>(null)
  const stScrollRef = useRef<HTMLDivElement>(null)
  const stColsRef = useRef(stCols)
  stColsRef.current = stCols   // always fresh — reads latest value at drag start

  const [subTasks,      setSubTasks]      = useState<SubTaskWithContext[]>([])
  const [doneSubTasks,  setDoneSubTasks]  = useState<SubTaskWithContext[]>([])   // 금주 업무에 취소선으로 남길 최근 완료 안건 세부task
  const [allTaskTodos,  setAllTaskTodos]  = useState<TodayTodo[]>([])
  const [meetings,      setMeetings]      = useState<Meeting[]>([])
  const [notesByMeeting, setNotesByMeeting] = useState<Record<string, MeetingNotesGrouped>>({})
  const [memos,         setMemos]         = useState<QuickMemo[]>([])
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([])
  const [todayJournal,  setTodayJournal]  = useState<DailyJournal | null>(null)
  const [yesterJournal, setYesterJournal] = useState<DailyJournal | null>(null)
  // 홈 하단 회고 열 — 오늘자 섹션 인라인 편집 (null = 변경 없음)
  const [jEdits,        setJEdits]        = useState<Partial<Record<SectionKey, string>> | null>(null)
  const [jSaving,       setJSaving]       = useState(false)
  const [jMsg,          setJMsg]          = useState('')
  const [loading,       setLoading]       = useState(true)
  const [gcalPicker,    setGcalPicker]    = useState<GoogleCalendarEvent | null>(null)
  const sb = useRef(createClient())
  const { org } = useOrgData()
  const meetingCategories = useMemo(() => [...org.map(t => t.name), ...FIXED_MEETING_TAGS], [org])

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < 1600)
    // zoom 밖(바깥 래퍼) 높이로 배율 결정 → zoom 후에도 기준보다 남는 높이 비율이 세로 배수
    const homeEl = homeOuterRef.current
    const fit = () => {
      const h = homeEl?.clientHeight ?? 0
      if (h === 0) return
      const zoom = Math.min(HOME_MAX_ZOOM, Math.max(1, h / HOME_REF_H))
      const v = Math.max(1, h / zoom / HOME_REF_H)
      setHomeFit(p => (Math.abs(p.zoom - zoom) < 0.001 && Math.abs(p.vs - v) < 0.001 ? p : { zoom, vs: v }))
    }
    const ro = homeEl ? new ResizeObserver(fit) : null
    if (homeEl && ro) { fit(); ro.observe(homeEl) }
    check()
    window.addEventListener('resize', check)
    return () => { window.removeEventListener('resize', check); ro?.disconnect() }
  }, [])

  useEffect(() => {
    async function load() {
      const today     = todayStr()
      const yesterday = yesterdayStr()
      const [
        { data: stData }, { data: taskTodoData },
        { data: mData },  { data: mmData }, { data: jData },
        { data: qtData }, { data: doneStData },
      ] = await Promise.all([
        sb.current.from('agenda_sub_tasks').select('*, agenda_items(id, title, agenda_groups(name, color, category)), sub_task_notes(created_at, edited_at, content)').eq('status', 'active').neq('kind', 'record').order('sort_order').limit(100),
        // schedule_tag는 배정 시점의 스냅샷이라 자정이 지나도 갱신되지 않음 — target_date를 기준으로 오늘/금주 분류
        // 완료 항목도 금주 업무에 취소선으로 남기기 위해 최근 60일치 완료분을 함께 읽는다.
        sb.current.from('task_todos').select('*, tasks(id, title, short_name, part)').or(`done.eq.false,target_date.gte.${shiftDateStr(today, -60)}`).order('sort_order').limit(200),
        sb.current.from('meetings').select('*').order('meeting_date', { ascending: false }).limit(20),
        sb.current.from('quick_memos').select('*').order('created_at', { ascending: false }).limit(100),
        sb.current.from('daily_journals').select('id, date, content, linked_task_ids, linked_meeting_ids, tags').in('date', [today, yesterday]),
        // 프로젝트/안건에 속하지 않는 즉석 추가 할일 — quick_todos 전용 테이블 (schedule 탭과 공유).
        // 금주 업무 7열이 요일별로 보여주므로 일정 탭과 같이 미완료 전체를 읽고, '오늘'은 화면에서 거른다.
        // 완료 항목도 취소선으로 남겨 보여주기 위해 최근 60일치 완료분을 함께 읽는다.
        sb.current.from('quick_todos').select('*').or(`done.eq.false,target_date.gte.${shiftDateStr(today, -60)}`).order('sort_order'),
        sb.current.from('agenda_sub_tasks').select('*, agenda_items(id, title, agenda_groups(name, color, category)), sub_task_notes(created_at, edited_at, content)').eq('status', 'done').neq('kind', 'record').gte('target_date', shiftDateStr(today, -60)).order('sort_order').limit(100),
      ])

      setSubTasks((stData ?? []) as SubTaskWithContext[])
      setDoneSubTasks((doneStData ?? []) as SubTaskWithContext[])
      setAllTaskTodos((taskTodoData ?? []) as TodayTodo[])
      const loadedMeetings = (mData ?? []) as Meeting[]
      setMeetings(loadedMeetings)
      setNotesByMeeting(await fetchMeetingNotesByMeetingIds(sb.current, loadedMeetings.map(m => m.id)))
      setMemos((mmData ?? []) as QuickMemo[])
      setQuickTodos((qtData ?? []) as QuickTodo[])
      const jList = (jData ?? []) as DailyJournal[]
      setTodayJournal(jList.find(j => j.date === today) ?? null)
      setYesterJournal(jList.find(j => j.date === yesterday) ?? null)
      setLoading(false)
    }
    load()
  }, [])

  // 오늘의 타임라인 — 조회 중인 날짜(오늘 외 전후 이동 가능)에 종속된 데이터
  const [timelineDate, setTimelineDate] = useState(todayStr())
  useEffect(() => {
    sb.current.from('schedule_items').select('*').eq('item_date', timelineDate)
      .then(({ data, error }) => {
        if (error) { console.error('일정 조회 실패:', error.message); return }
        setScheduleItems((data ?? []) as ScheduleItem[])
      })
  }, [timelineDate])

  // 날짜별 캐시 — 재방문 시 즉시 표시하고, 그 사이 구글캘린더가 바뀌었을 수 있으니 뒤에서 다시 확인해 갱신 (stale-while-revalidate)
  const googleEventsCacheRef = useRef<Record<string, GoogleCalendarEvent[]>>({})
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([])
  useEffect(() => {
    let cancelled = false
    const cached = googleEventsCacheRef.current[timelineDate]
    if (cached) setGoogleEvents(cached)

    fetch(`/api/calendar/today?date=${timelineDate}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const events = data.events ?? []
        googleEventsCacheRef.current[timelineDate] = events
        setGoogleEvents(events)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [timelineDate])

  // Esc로 인라인 메모 뷰 닫기 (전역 검색창은 GlobalSearch 컴포넌트가 자체 처리)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMemoViewId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    try {
      const s = localStorage.getItem('dash_st_cols_v9')
      if (s) {
        const p = JSON.parse(s)
        if (Array.isArray(p) && p.length === 5) setStCols(p as [number, number, number, number, number])
      }
    } catch {}
  }, [])

  useEffect(() => {
    const el = stScrollRef.current
    if (!el) return
    const update = () => setStRowH(Math.floor(el.clientHeight / (isCompact ? 6 : 8)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [subTasks, loading, isCompact])

  function startStColResize(ci: number, startX: number) {
    const startWidths = stColsRef.current.slice() as [number, number, number, number, number]
    function onMove(e: MouseEvent) {
      const delta = e.clientX - startX
      const next = startWidths.slice() as [number, number, number, number, number]
      if (ci === 0) {
        // 범주 ↔ 안건 swap
        const total = startWidths[0] + startWidths[1]
        const newL = Math.min(total - 44, Math.max(30, startWidths[0] + delta))
        next[0] = newL; next[1] = total - newL
      } else if (ci === 1) {
        // 안건 grows → 상세TASK(1fr) shrinks
        next[1] = Math.max(44, startWidths[1] + delta)
      } else if (ci === 2) {
        // 상세TASK grows (via 1fr) ↔ 업데이트내용 shrinks
        next[4] = Math.max(44, startWidths[4] - delta)
      } else if (ci === 3) {
        // 업데이트내용 ↔ 업데이트 swap
        const total = startWidths[4] + startWidths[2]
        const newL = Math.min(total - 44, Math.max(44, startWidths[4] + delta))
        next[4] = newL; next[2] = total - newL
      } else {
        // 업데이트 ↔ 마감 swap
        const total = startWidths[2] + startWidths[3]
        const newL = Math.min(total - 44, Math.max(44, startWidths[2] + delta))
        next[2] = newL; next[3] = total - newL
      }
      setStCols(next)
      try { localStorage.setItem('dash_st_cols_v9', JSON.stringify(next)) } catch {}
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function toggleSort(col: string) {
    setStSort(prev => prev?.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  }


  function latestNoteDate(st: SubTaskWithContext): string {
    const notes = st.sub_task_notes
    if (!notes?.length) return st.updated_at ?? ''
    const max = notes.reduce((m, n) => {
      const d = n.edited_at ?? n.created_at
      return d > m ? d : m
    }, '')
    return max || (st.updated_at ?? '')
  }

  function latestNoteContent(st: SubTaskWithContext): string {
    const notes = st.sub_task_notes
    if (!notes?.length) return ''
    const latest = notes.reduce((m, n) => {
      const d = n.edited_at ?? n.created_at
      const md = m.edited_at ?? m.created_at
      return d > md ? n : m
    })
    const text = (latest.content ?? '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()
    return text.length > 60 ? text.slice(0, 60) + '…' : text
  }

  const sortedSubTasks = useMemo(() => {
    if (!stSort) return subTasks
    return [...subTasks].sort((a, b) => {
      let av = '', bv = ''
      if (stSort.col === '상세TASK') { av = a.title; bv = b.title }
      else if (stSort.col === '안건') { av = a.agenda_items?.title ?? ''; bv = b.agenda_items?.title ?? '' }
      else if (stSort.col === '범주') { av = a.agenda_items?.agenda_groups?.category ?? ''; bv = b.agenda_items?.agenda_groups?.category ?? '' }
      else if (stSort.col === '업데이트') { av = latestNoteDate(a); bv = latestNoteDate(b) }
      else if (stSort.col === '마감') { av = a.target_date ?? a.due_date ?? ''; bv = b.target_date ?? b.due_date ?? '' }
      return stSort.dir === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko')
    })
  }, [subTasks, stSort])

  // 완료해도 목록에서 빼지 않고 취소선으로 남김 — 다시 누르면 완료 취소
  useEffect(() => {
    if (!olderOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOlder() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [olderOpen])

  function closeOlder() {
    setOlderOpen(false)
    setOlderSel(new Set())
    setOlderConfirmDelete(false)
  }

  // 할 일(task_todos) 날짜 옮기기 — '이전 N건' 모달에서 요일 열로 끌어 놓을 때
  async function moveTaskTodo(id: string, date: string) {
    const cur = allTaskTodos.find(t => t.id === id)
    if (!cur || cur.target_date === date) return
    setAllTaskTodos(p => p.map(t => t.id === id ? { ...t, target_date: date } : t))
    const { error } = await sb.current.from('task_todos').update({ target_date: date }).eq('id', id)
    if (error) {
      console.error('할 일 날짜 이동 실패:', error.message)
      setAllTaskTodos(p => p.map(t => t.id === id ? { ...t, target_date: cur.target_date } : t))
    }
  }

  // '이전 N건' 모달 일괄 처리 — 확인 = 완료 처리(체크박스와 같은 함수), 삭제 = 실제 삭제(세부task는 안건 상세에서도 사라짐)
  function completeOlderItems(items: { kind: string; todo?: TodayTodo; quick?: QuickTodo; st?: SubTaskWithContext }[]) {
    for (const it of items) {
      if (it.kind === 'todo' && it.todo && !it.todo.done) void toggleTask(it.todo.id)
      else if (it.kind === 'quick' && it.quick && !it.quick.done) void toggleQuickTodo(it.quick.id)
      else if (it.kind === 'agenda' && it.st && it.st.status !== 'done') void completeSubTask(it.st.id)
    }
  }
  async function deleteOlderItems(items: { kind: string; todo?: TodayTodo; quick?: QuickTodo; st?: SubTaskWithContext }[]) {
    const todoIds = items.flatMap(it => (it.kind === 'todo' && it.todo ? [it.todo.id] : []))
    const stIds = items.flatMap(it => (it.kind === 'agenda' && it.st ? [it.st.id] : []))
    for (const it of items) if (it.kind === 'quick' && it.quick) removeQuickTodo(it.quick.id)
    if (todoIds.length) {
      const { error } = await sb.current.from('task_todos').delete().in('id', todoIds)
      if (error) console.error('할 일 삭제 실패:', error.message)
      else setAllTaskTodos(p => p.filter(t => !todoIds.includes(t.id)))
    }
    if (stIds.length) {
      const { error } = await sb.current.from('agenda_sub_tasks').delete().in('id', stIds)
      if (error) console.error('세부task 삭제 실패:', error.message)
      else setSubTasks(p => p.filter(st => !stIds.includes(st.id)))
    }
  }

  async function toggleTask(id: string) {
    const cur = allTaskTodos.find(t => t.id === id)
    if (!cur) return
    const done = !cur.done
    const doneAt = done ? new Date().toISOString() : null
    setAllTaskTodos(p => p.map(t => t.id === id ? { ...t, done, done_at: doneAt } : t))
    const { error } = await sb.current.from('task_todos').update({ done, done_at: doneAt }).eq('id', id)
    if (error) {
      console.error('할 일 완료 처리 실패:', error.message)
      setAllTaskTodos(p => p.map(t => t.id === id ? { ...t, done: cur.done, done_at: cur.done_at } : t))
    }
  }

  // 즉석 할일 (quick_todos) — 프로젝트 상세task/안건에 속하지 않는, 홈에서 바로 추가하는 가벼운 항목
  async function addQuickTodo(date: string = today) {
    const title = quickAddTitle.trim()
    if (!title) return
    const { data, error } = await sb.current.from('quick_todos')
      .insert({ title, target_date: date }).select('*').single()
    if (error) { console.error('즉석 할일 추가 실패:', error.message); return }
    if (data) setQuickTodos(p => [...p, data as QuickTodo])
    setQuickAddTitle('')
    setQuickAddOpen(false)
    setWeekAddDate(null)
  }

  // 완료해도 목록에서 빼지 않고 취소선으로 남김 — 다시 누르면 완료 취소
  async function toggleQuickTodo(id: string) {
    const cur = quickTodos.find(t => t.id === id)
    if (!cur) return
    const done = !cur.done
    setQuickTodos(p => p.map(t => t.id === id ? { ...t, done } : t))
    const { error } = await sb.current.from('quick_todos').update({ done }).eq('id', id)
    if (error) {
      console.error('즉석 할일 완료 처리 실패:', error.message)
      setQuickTodos(p => p.map(t => t.id === id ? { ...t, done: cur.done } : t))
    }
  }

  // 금주 업무에서 다른 열로 드래그해 날짜/연기 변경 — 즉석 할일만 대상 (연동 task는 각 출처에서 관리)
  // 요일 열에 놓으면 그 날짜 + 연기 해제, '다음주로 연기' 열에 놓으면 날짜는 두고 연기 표시만 켠다
  async function moveQuickTodo(id: string, date: string, deferred = false) {
    const cur = quickTodos.find(t => t.id === id)
    if (!cur || (cur.target_date === date && !!cur.deferred === deferred)) return
    setQuickTodos(p => p.map(t => t.id === id ? { ...t, target_date: date, deferred } : t))
    const { error } = await sb.current.from('quick_todos').update({ target_date: date, deferred }).eq('id', id)
    if (error) {
      console.error('즉석 할일 이동 실패:', error.message)
      setQuickTodos(p => p.map(t => t.id === id ? { ...t, target_date: cur.target_date, deferred: cur.deferred } : t))
    }
  }

  function removeQuickTodo(id: string) {
    setQuickTodos(p => p.filter(t => t.id !== id))
    sb.current.from('quick_todos').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('즉석 할일 삭제 실패:', error.message) })
  }

  // 완료 시 진행중 목록(subTasks)에서 완료 목록(doneSubTasks)으로 옮겨 금주 업무에는 취소선으로 남김 — 다시 누르면 진행중으로 복귀
  async function completeSubTask(id: string) {
    const active = subTasks.find(st => st.id === id)
    const finished = doneSubTasks.find(st => st.id === id)
    const cur = active ?? finished
    if (!cur) return
    const status = active ? 'done' : 'active'
    const moved = { ...cur, status } as SubTaskWithContext
    const apply = (toDone: boolean, item: SubTaskWithContext) => {
      setSubTasks(p => toDone ? p.filter(st => st.id !== id) : [...p.filter(st => st.id !== id), item].sort((a, b) => a.sort_order - b.sort_order))
      setDoneSubTasks(p => toDone ? [...p.filter(st => st.id !== id), item] : p.filter(st => st.id !== id))
    }
    apply(status === 'done', moved)
    const { error } = await sb.current.from('agenda_sub_tasks').update({ status }).eq('id', id)
    if (error) {
      console.error('세부task 완료 처리 실패:', error.message)
      apply(status !== 'done', cur)
    }
  }

  async function assignSubTaskDate(id: string, date: string) {
    setSubTasks(p => p.map(st => st.id === id ? { ...st, target_date: date } : st))
    await sb.current.from('agenda_sub_tasks').update({ target_date: date }).eq('id', id)
    setDatePickerStId(null)
    setHoveredStId(null)
  }

  // Track B-4: meeting_notes에 is_prep=true row를 INSERT — meetings.notes는
  // 더 이상 건드리지 않는다. meeting이 없어 새로 만드는 경우 "meeting INSERT
  // -> meeting_notes INSERT" 두 호출이 되어 원자성이 사라지지만(B-4 설계
  // §6에서 승인된 수용 리스크), 실패 시 보상 write는 추가하지 않는다.
  async function saveFixedMeetingMemo(schedule: MeetingSchedule, date: string = today, stateKey: string = schedule.id) {
    const text = (fMemoTexts[stateKey] ?? '').trim()
    if (!text) return
    setFMemoSaving(p => ({ ...p, [stateKey]: true }))
    const now = new Date().toISOString()
    const category = schedule.category ?? '기타'
    const existing = meetings.find(m => m.title === schedule.title && m.meeting_date?.startsWith(date))
    let meetingId = existing?.id
    if (!meetingId) {
      const { data } = await sb.current.from('meetings').insert({ title: schedule.title, meeting_date: date, category }).select('*').single()
      if (data) { setMeetings(prev => [...prev, data as Meeting]); meetingId = (data as Meeting).id }
    }
    if (meetingId) {
      const { data: noteData } = await sb.current.from('meeting_notes').insert({
        meeting_id: meetingId, title: '사전 메모', content: text, is_prep: true, created_at: now, updated_at: now,
      }).select('*').single()
      if (noteData) {
        setNotesByMeeting(prev => {
          const g = prev[meetingId as string] ?? { regular: [], prep: [] }
          return { ...prev, [meetingId as string]: { ...g, prep: [...g.prep, noteData as MeetingNoteRow] } }
        })
      }
    }
    setFMemoTexts(p => ({ ...p, [stateKey]: '' }))
    setFMemoSaving(p => ({ ...p, [stateKey]: false }))
    setFMemoSaved(p => ({ ...p, [stateKey]: true }))
    setTimeout(() => setFMemoSaved(p => ({ ...p, [stateKey]: false })), 2500)
  }

  // 고정회의(반복일정) 클릭 → 그날의 회의록으로 이동. 없으면 새로 만들어서 이동.
  async function goToFixedMeetingToday(schedule: MeetingSchedule) {
    const existing = meetings.find(m => m.title === schedule.title && m.meeting_date?.startsWith(today))
    if (existing) { router.push(`/meetings/${existing.id}`); return }
    const category = schedule.category ?? '기타'
    const { data, error } = await sb.current.from('meetings')
      .insert({ title: schedule.title, meeting_date: today, category }).select('*').single()
    if (error || !data) { console.error('회의록 생성 실패:', error?.message); return }
    setMeetings(p => [...p, data as Meeting])
    router.push(`/meetings/${(data as Meeting).id}`)
  }

  // 세부task/안건에 종속시키기 어려운 "오늘 이 시간에 할 업무"용 가벼운 일정 —
  // schedule_items 전용 테이블에 저장 (퀵메모와 분리해 퀵메모가 방대해지는 것을 방지)
  async function handleAddScheduleItem(title: string, startHour: number): Promise<void> {
    const { data, error } = await sb.current.from('schedule_items')
      .insert({ title, item_date: timelineDate, start_hour: startHour, duration_hours: 1 })
      .select('*').single()
    if (error) { console.error('일정 추가 실패:', error.message); return }
    if (data) setScheduleItems(p => [...p, data as ScheduleItem])
  }

  // 홈 회고 인라인 저장 — 전체화면 에디터(doSave)와 같은 daily_journals update/insert.
  // 홈에 없는 섹션(감사·식사·일반 등)은 기존 content에서 그대로 보존한다.
  async function saveInlineJournal() {
    if (!jEdits || jSaving) return
    const content = serializeSections({ ...parseSections(todayJournal?.content ?? ''), ...jEdits })
    if (!content.trim()) return
    setJSaving(true); setJMsg('')
    const payload = {
      content,
      linked_task_ids: todayJournal?.linked_task_ids ?? [],
      linked_meeting_ids: todayJournal?.linked_meeting_ids ?? [],
      tags: todayJournal?.tags ?? [],
      updated_at: new Date().toISOString(),
    }
    const { data, error } = todayJournal
      ? await sb.current.from('daily_journals').update(payload).eq('id', todayJournal.id).select('*').single()
      : await sb.current.from('daily_journals').insert({ date: todayStr(), ...payload }).select('*').single()
    setJSaving(false)
    if (error || !data) { setJMsg(`저장 실패: ${error?.message ?? ''}`); return }
    setTodayJournal(data as DailyJournal)
    setJEdits(null)
    setJMsg('저장됨 ✓')
    setTimeout(() => setJMsg(''), 2000)
  }

  function handleRemoveScheduleItem(id: string) {
    setScheduleItems(p => p.filter(s => s.id !== id))
    sb.current.from('schedule_items').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('일정 삭제 실패:', error.message) })
  }

  // 구글캘린더 이벤트 클릭 — 이미 연동된 회의록 있으면 바로 이동, 없으면 범주 선택 후 생성
  function handleSelectGoogleEvent(ev: GoogleCalendarEvent) {
    const existing = meetings.find(m => m.meeting_date?.startsWith(timelineDate) && m.title === ev.title)
    if (existing) { router.push(`/meetings/${existing.id}`); return }
    setGcalPicker(ev)
  }

  async function createMeetingFromGoogleEvent(category: string) {
    if (!gcalPicker) return
    const ev = gcalPicker
    const { data, error } = await sb.current.from('meetings')
      .insert({ title: ev.title, meeting_date: timelineDate, category }).select('id').single()
    setGcalPicker(null)
    if (error || !data) { console.error('회의록 생성 실패:', error?.message); return }
    setMeetings(p => [...p, { id: data.id, title: ev.title, meeting_date: timelineDate, category } as Meeting])
    router.push(`/meetings/${data.id}`)
  }

  function handleUpdateScheduleItemPosition(id: string, startHour: number, durationHours: number) {
    setScheduleItems(p => p.map(s => s.id === id ? { ...s, start_hour: startHour, duration_hours: durationHours } : s))
    sb.current.from('schedule_items').update({ start_hour: startHour, duration_hours: durationHours }).eq('id', id)
      .then(({ error }) => { if (error) console.error('일정 위치 저장 실패:', error.message) })
  }

  const { value: fixedSchedules } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])

  const today          = todayStr()
  const todayMeetings  = meetings.filter(m => m.meeting_date?.startsWith(today))

  // 오늘의 타임라인 — timelineDate 기준 파생 데이터 (today와 다를 수 있음)
  const isTimelineToday   = timelineDate === today
  const timelineFixedMeetings = fixedSchedules
    .filter(s => scheduleOccursOn(s, timelineDate))
    .sort((a, b) => a.time.localeCompare(b.time))
  // 고정회의가 기록되면(사전메모 저장 등) 같은 제목의 meeting 레코드가 생겨 Lane 2에 중복 박스로 겹쳐 보이므로 제외
  const timelineFixedTitles = new Set(timelineFixedMeetings.map(s => s.title))
  const timelineMeetings  = meetings.filter(m => m.meeting_date?.startsWith(timelineDate) && !timelineFixedTitles.has(m.title))
  const recentMeetings = meetings.slice(0, 5)

  // task_todos → target_date 기준 분류 (schedule_tag는 배정 시점 스냅샷이라 자정 경과 후에도 안 바뀜 → 신뢰하지 않음)
  const todayQuickTodos = quickTodos.filter(q => q.target_date === today && !q.deferred)
  const todayTodos = allTaskTodos.filter(t => t.target_date ? t.target_date === today : t.schedule_tag === 'today')
  const timelineTodos = (isTimelineToday ? todayTodos : allTaskTodos.filter(t => t.target_date === timelineDate)).filter(t => !t.done)
  // 오늘 업무 건수 — 취소선으로 남은 완료분은 세지 않음
  const todayOpenCount = todayTodos.filter(t => !t.done).length + todayQuickTodos.filter(q => !q.done).length
  const meetingsForJournal = meetings.map(m => ({ id: m.id, title: m.title, meeting_date: m.meeting_date ?? undefined }))

  const skel = (n: number) => Array.from({ length: n }, (_, i) => (
    <div key={i} className="h-8 rounded-xl animate-pulse" style={{ background: 'rgba(var(--ink-rgb),0.04)', marginBottom: 6 }} />
  ))
  const dots = ['#7A82D8', '#5E8FBF', '#38BE98', '#C87840']


  // ── 금주 업무 7열 (홈 개편 목업) ─────────────────────────────────────────
  // 새 조회/상태 없음 — 이미 로드한 task_todos / agenda_sub_tasks / quick_todos / 고정회의를
  // 날짜(target_date)로만 재분류한다. 직전주 미완료 = 지난주 월~일 날짜의 미완료(그 이전은 건수만, 큰 화면에선 일부 노출),
  // 다음주 = 다음 주 월~일 날짜가 잡힌 항목(별도 '연기' 상태 필드는 없음).
  const weekMonday  = shiftDateStr(today, 7 * weekOffset - ((dowOfDateStr(today) + 6) % 7))
  const prevMonday  = shiftDateStr(weekMonday, -7)
  const closeWeekPicker = () => setWeekPickerOpen(false)
  // 달력에서 고른 날짜가 속한 주 → 이번 주 기준 offset
  function weekOffsetOf(dateStr: string): number {
    const mondayOf = (s: string) => shiftDateStr(s, -((dowOfDateStr(s) + 6) % 7))
    const [a, b] = [mondayOf(today), mondayOf(dateStr)].map(s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) })
    return Math.round((b - a) / (7 * 86400000))
  }
  const weekDays    = [0, 1, 2, 3, 4].map(i => shiftDateStr(weekMonday, i))
  const weekSunday  = shiftDateStr(weekMonday, 6)
  const nextMonday  = shiftDateStr(weekMonday, 7)
  const nextSunday  = shiftDateStr(weekMonday, 13)
  const wkTomorrow  = shiftDateStr(today, 1)
  type WeekItem = {
    key: string; kind: 'todo' | 'quick' | 'agenda' | 'fixed'; title: string; meta: string; date: string
    todo?: TodayTodo; quick?: QuickTodo; st?: SubTaskWithContext; fixed?: MeetingSchedule; fixedKey?: string
  }
  // 0 = 직전주 미완료, 1~5 = 월~금(이번 주 토·일은 금으로), 6 = 다음주, -1 = 표시 안 함, -2 = 지난주 이전 미완료
  function weekCol(date: string | null | undefined): number {
    if (!date) return -1
    if (date < prevMonday) return -2
    if (date < weekMonday) return 0
    if (date <= weekSunday) { const i = weekDays.indexOf(date); return i >= 0 ? i + 1 : 5 }
    if (date >= nextMonday && date <= nextSunday) return 6
    return -1
  }
  const weekCols: WeekItem[][] = [[], [], [], [], [], [], []]
  const olderItems: WeekItem[] = []   // 지난주보다 이전 날짜의 미완료 (기존엔 개수만 표시)
  // 고정회의(일정 탭 반복/단발) — 보고 있는 주의 월~금 각 날짜에 일정 탭과 같은 규칙으로 배치 (다음주로 연기 열엔 넣지 않음)
  weekDays.forEach((date, i) => {
    fixedSchedules
      .filter(s => scheduleOccursOn(s, date))
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach(s => weekCols[i + 1].push({ key: `fx_${date}_${s.id}`, kind: 'fixed', title: s.title, meta: s.time, date, fixed: s, fixedKey: `${date}_${s.id}` }))
  })
  for (const t of allTaskTodos) {
    // target_date 없는 구 데이터는 schedule_tag 스냅샷으로 대체 (기존 오늘/금주 분류와 동일한 우선순위)
    const date = t.target_date ?? (t.schedule_tag === 'today' ? today : t.schedule_tag === 'tomorrow' ? wkTomorrow : t.schedule_tag === 'this_week' ? weekDays[4] : null)
    const c = weekCol(date)
    if (t.done && (c === 0 || c === -2)) continue   // 직전주/이전 '미완료' 집계에서 완료분 제외
    const it: WeekItem = { key: `td_${t.id}`, kind: 'todo', title: t.title, meta: t.tasks?.short_name ?? t.tasks?.title ?? '', date: date!, todo: t }
    if (c === -2) olderItems.push(it)
    if (c >= 0) weekCols[c].push(it)
  }
  for (const q of quickTodos) {
    // 연기된 항목은 원래 날짜가 속한 주에서는 요일 대신 '다음주로 연기' 열로 — 다음 주에는 날짜 그대로 직전주 미완료로 잡힌다
    const raw = weekCol(q.target_date)
    const c = q.deferred && raw >= 1 && raw <= 5 ? 6 : raw
    if (q.done && (c === 0 || c === -2)) continue   // 직전주/이전 '미완료' 집계에서 완료분 제외
    const it: WeekItem = { key: `qt_${q.id}`, kind: 'quick', title: q.title, meta: q.deferred ? '연기' : '즉석 할 일', date: q.target_date!, quick: q }
    if (c === -2) olderItems.push(it)
    if (c >= 0) weekCols[c].push(it)
  }
  for (const st of [...subTasks, ...doneSubTasks].sort((a, b) => a.sort_order - b.sort_order)) {
    const c = weekCol(st.target_date)
    if (st.status === 'done' && (c === 0 || c === -2)) continue
    const it: WeekItem = { key: `st_${st.id}`, kind: 'agenda', title: st.title, meta: st.agenda_items?.title ?? '', date: st.target_date!, st }
    if (c === -2) olderItems.push(it)
    if (c >= 0) weekCols[c].push(it)
  }
  weekCols[0].sort((a, b) => a.date.localeCompare(b.date))
  weekCols[6].sort((a, b) => a.date.localeCompare(b.date))
  // 열(0 = 직전주 미완료, 1~5 = 월~금, 6 = 다음주로 연기) → 열 정의
  const weekVisible = [0, 1, 2, 3, 4, 5, 6]
  const weekGridCols = `repeat(${weekVisible.length}, minmax(${WEEK_COL_MIN}px, 1fr))`
  // 직전주 미완료 열은 지난주보다 이전 날짜의 미완료까지 모두 날짜순으로 (건수와 목록이 일치)
  const weekColItems = (ci: number) => ci === 0 ? [...weekCols[0], ...olderItems].sort((a, b) => a.date.localeCompare(b.date)) : weekCols[ci]
  const weekMinW = WEEK_COL_MIN * weekVisible.length
  const olderOpenCount = olderItems.length   // 지난주보다 이전 미완료는 개수만 ('이전 N건')
  // 완료·삭제·이동으로 목록에서 빠진 항목은 선택에서도 자동으로 빠지게 현재 목록 기준으로 센다
  const olderSelItems = olderItems.filter(it => olderSel.has(it.key))
  const olderSelCount = olderSelItems.length
  // 하단 3박스 — 박스 높이는 기준 3행 × 배수 그대로, 그 안의 행 수만 늘림 (행 높이 ≥ 기준 32px)
  const BOTTOM_ROWS = Math.max(BASE_BOTTOM_ROWS, Math.floor(BASE_BOTTOM_ROWS * homeFit.vs + 1e-6))
  const bottomRowH = `calc(${BOTTOM_ROW_H}px * var(--vs, 1) * ${BASE_BOTTOM_ROWS / BOTTOM_ROWS})`
  const shortDate = (d: string) => { const [, m, dd] = d.split('-').map(Number); return `${m}.${String(dd).padStart(2, '0')}` }

  // 3행 높이만 보이고 나머지는 각 박스 안에서 스크롤 (퀵메모는 최근 30건, 과업은 전체)
  const bottomMemos = memos.slice(0, 30)
  const bottomTasks = sortedSubTasks
  const SHOW_RECENT_MEETINGS = false   // 목업 평가 동안 홈 배치에서 제외 (데이터/컴포넌트는 유지)

  // 금주 업무 드롭 대상 — 요일(colDate)은 그 날짜로 이동, 'defer'(다음주로 연기)는 연기 표시
  function weekDropProps(dropKey: string, colDate: string | null) {
    const isQuickDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(WEEK_QUICK_DND) || (!!colDate && e.dataTransfer.types.includes(WEEK_MOVE_DND))
    return {
      onDragOver: (e: React.DragEvent) => { if (!isQuickDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (weekDropDate !== dropKey) setWeekDropDate(dropKey) },
      onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setWeekDropDate(d => d === dropKey ? null : d) },
      onDrop: (e: React.DragEvent) => {
        const moved = colDate ? e.dataTransfer.getData(WEEK_MOVE_DND) : ''
        if (moved && colDate) {
          setWeekDropDate(null); e.preventDefault()
          const { kind, id: mid } = JSON.parse(moved) as { kind: 'todo' | 'agenda'; id: string }
          if (kind === 'todo') void moveTaskTodo(mid, colDate); else void assignSubTaskDate(mid, colDate)
          return
        }
        const id = e.dataTransfer.getData(WEEK_QUICK_DND); setWeekDropDate(null); if (!id) return; e.preventDefault()
        if (colDate) { moveQuickTodo(id, colDate); return }
        const cur = quickTodos.find(t => t.id === id)
        if (!cur || cur.target_date > weekSunday) return   // 이미 다음 주 이후 날짜면 그대로
        // 보고 있는 주의 항목은 날짜 유지, 직전주 이전에서 끌어온 항목은 보고 있는 주 월요일로 당겨 연기
        moveQuickTodo(id, cur.target_date >= weekMonday ? cur.target_date : weekMonday, true)
      },
    }
  }
  const dropTargetStyle = (on: boolean): React.CSSProperties => on
    ? { background: 'rgba(var(--accent-tint-rgb),0.10)', boxShadow: 'inset 0 0 0 1.5px rgba(var(--accent-tint-rgb),0.45)', borderRadius: 8 }
    : {}

  function renderWeekItem(item: WeekItem, secondary: boolean) {
    const showDate = secondary
    const meta = [item.meta, showDate ? shortDate(item.date) : ''].filter(Boolean).join(' · ')
    const titleColor = secondary ? TEXT2 : TEXT1
    const check = (done: boolean, onClick: () => void) => (
      <button type="button" onClick={e => { e.stopPropagation(); onClick() }} aria-label="완료"
        style={{ width: 14, height: 14, marginTop: 2, borderRadius: 4, border: `1.5px solid ${done ? '#38BE98' : 'rgba(var(--ink-rgb),0.22)'}`, background: done ? '#38BE98' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0, transition: 'all 150ms ease-out' }}>
        {done && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
    )
    const body = (title: string, done: boolean, metaText: string, extra?: React.ReactNode) => (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <p title={title} style={{ fontSize: 12, fontWeight: 400, lineHeight: '17px', color: done ? TEXT3 : titleColor, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: WEEK_ITEM_LINES, WebkitBoxOrient: 'vertical', wordBreak: 'keep-all', overflowWrap: 'anywhere', flex: 1, minWidth: 0, letterSpacing: '-0.01em' }}>{title}</p>
          {extra}
        </div>
        {metaText && <p style={{ fontSize: 10.5, lineHeight: '15px', color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metaText}</p>}
      </div>
    )
    const rowStyle: React.CSSProperties = { marginLeft: -6, marginRight: -6, paddingLeft: 6, paddingRight: 6, borderRadius: 6 }
    const rowInner: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, padding: `calc(5px + 21px * (var(--vs, 1) - 1)) 0` }   // 기준 42px 행 → 42 × 배수
    const hoverBtn: React.CSSProperties = { fontSize: 11, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, whiteSpace: 'nowrap' }

    if (item.kind === 'fixed' && item.fixed) {
      const s = item.fixed, k = item.fixedKey!
      const isToday = item.date === today
      const isPastDay = item.date < today   // 지난 요일 — 기록 확인용으로 흐리게
      const linked = meetings.find(m => m.title === s.title && m.meeting_date?.startsWith(item.date))
      const prepNotes = notesByMeeting[linked?.id ?? '']?.prep ?? []
      const isOpen = fMemoOpen[k] ?? false
      const text = fMemoTexts[k] ?? ''
      const metaText = [s.time, linked && item.date <= today ? '기록됨' : '', prepNotes.length ? `안건 ${prepNotes.length}` : ''].filter(Boolean).join(' · ')
      return (
        <ListRow key={item.key} style={isPastDay ? { ...rowStyle, opacity: 0.55 } : rowStyle} onClick={() => { if (isToday) goToFixedMeetingToday(s); else router.push(linked ? `/meetings/${linked.id}` : '/meetings') }}>
          <div className="group" style={rowInner}>
            <Repeat2 size={12} strokeWidth={2} style={{ color: TEXT3, marginTop: 3, flexShrink: 0 }} />
            {body(s.title, false, fMemoSaved[k] ? `${s.time} · 저장됨 ✓` : metaText,
              <button type="button" className="hidden group-hover:block" style={hoverBtn}
                onClick={e => { e.stopPropagation(); setFMemoOpen(p => ({ ...p, [k]: !p[k] })) }}>{isOpen ? '닫기' : '안건'}</button>)}
          </div>
          {isOpen && (
            <div onClick={e => e.stopPropagation()} style={{ paddingLeft: 20, paddingBottom: 8 }}>
              {prepNotes.map((n: MeetingNoteRow, ni: number) => (
                <p key={ni} style={{ fontSize: 11.5, color: TEXT3, lineHeight: 1.6 }}>· {n.content}</p>
              ))}
              <textarea autoFocus value={text} rows={2}
                onChange={e => setFMemoTexts(p => ({ ...p, [k]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveFixedMeetingMemo(s, item.date, k) }
                  if (e.key === 'Escape') setFMemoOpen(p => ({ ...p, [k]: false }))
                }}
                placeholder="회의 안건 메모 (Ctrl+Enter 저장)"
                style={{ width: '100%', marginTop: 4, background: 'rgba(var(--ink-rgb),0.03)', border: `1px solid ${DIVIDER}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, color: TEXT1, resize: 'none', outline: 'none', lineHeight: 1.5, fontFamily: 'inherit' }} />
            </div>
          )}
        </ListRow>
      )
    }
    if (item.kind === 'todo' && item.todo) {
      const t = item.todo, done = t.done
      return (
        <ListRow key={item.key} style={rowStyle} draggable
          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `todo_${t.id}`, title: t.title, subtitle: t.tasks?.short_name ?? t.tasks?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}>
          <div style={rowInner}>{check(done, () => toggleTask(t.id))}{body(t.title, done, meta)}</div>
        </ListRow>
      )
    }
    if (item.kind === 'quick' && item.quick) {
      const q = item.quick, done = q.done
      return (
        <ListRow key={item.key} style={rowStyle} draggable
          onDragStart={e => { e.dataTransfer.setData(WEEK_QUICK_DND, q.id); e.dataTransfer.effectAllowed = 'move' }}
          onDragEnd={() => setWeekDropDate(null)}>
          <div className="group" style={rowInner}>
            {check(done, () => toggleQuickTodo(q.id))}
            {body(q.title, done, meta,
              <button type="button" className="hidden group-hover:block" style={hoverBtn} onClick={() => removeQuickTodo(q.id)}>×</button>)}
          </div>
        </ListRow>
      )
    }
    const st = item.st!, done = st.status === 'done'
    const showPicker = datePickerStId === st.id
    return (
      <ListRow key={item.key} style={rowStyle} draggable
        onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `st_${st.id}`, title: st.title, subtitle: st.agenda_items?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}>
        <div className="group" style={rowInner}>
          {check(done, () => completeSubTask(st.id))}
          {body(st.title, done, meta,
            !showPicker && <button type="button" className="hidden group-hover:block" style={hoverBtn} onClick={() => setDatePickerStId(st.id)}>날짜</button>)}
        </div>
        {showPicker && (
          <div style={{ paddingLeft: 22, paddingBottom: 6 }}>
            <input type="date" autoFocus defaultValue={st.target_date ?? ''}
              onChange={e => { if (e.target.value) assignSubTaskDate(st.id, e.target.value) }}
              onBlur={() => { setDatePickerStId(null); setHoveredStId(null) }}
              style={{ background: 'rgba(var(--ink-rgb),0.04)', border: `1px solid ${DIVIDER}`, borderRadius: 6, padding: '2px 6px', fontSize: 11.5, color: TEXT1, outline: 'none' }} />
          </div>
        )}
      </ListRow>
    )
  }

  // Row divider
  function rd(i: number, len: number): React.CSSProperties {
    return i < len - 1 ? { borderBottom: `1px solid ${DIVIDER}` } : {}
  }

  return (
    <div className="font-sans flex flex-col" style={{ height: '100%', background: BG }}>

      {/* ── 모바일 ── */}
      {/* BottomNav 겹침 보정은 AppShell의 main pb로 전역 처리됨 — 여기는 리스트 하단 여백만 */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 pt-5 pb-6 space-y-4">

        <div className="rounded-[20px] p-4" style={MCARD}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>오늘의 할 일</h2>
            <button onClick={() => setQuickAddOpen(v => !v)} className="text-[11px]" style={{ color: quickAddOpen ? '#38BE98' : TEXT3, background: 'none', border: 'none' }}>
              {quickAddOpen ? '취소' : '+ 추가'}
            </button>
          </div>
          {quickAddOpen && (
            <div className="flex gap-1.5 mb-3">
              <input
                autoFocus
                value={quickAddTitle}
                onChange={e => setQuickAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addQuickTodo(); if (e.key === 'Escape') setQuickAddOpen(false) }}
                placeholder="오늘 할 일을 바로 추가..."
                className="flex-1 text-[13px] rounded-lg px-2.5 py-1.5 outline-none"
                style={{ background: 'rgba(var(--ink-rgb),0.05)', border: '1px solid rgba(var(--ink-rgb),0.09)', color: TEXT1 }}
              />
              <button onClick={() => addQuickTodo()} disabled={!quickAddTitle.trim()} className="text-[12px] px-3 rounded-lg"
                style={{ background: quickAddTitle.trim() ? 'rgba(56,190,152,0.18)' : 'rgba(var(--ink-rgb),0.04)', border: `1px solid ${quickAddTitle.trim() ? 'rgba(56,190,152,0.35)' : 'rgba(var(--ink-rgb),0.07)'}`, color: quickAddTitle.trim() ? '#38BE98' : TEXT3 }}>
                추가
              </button>
            </div>
          )}
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : todayTodos.length === 0 && todayQuickTodos.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>오늘 할 일이 없어요</p>
              : <>
                  {todayTodos.map((t, i) => {
                    const done = t.done
                    return (
                      <div key={t.id} className="flex items-center gap-3 py-2.5" style={rd(i, todayTodos.length + todayQuickTodos.length)}>
                        <button onClick={() => toggleTask(t.id)} className="flex-shrink-0 rounded-full border-2 flex items-center justify-center"
                          style={{ width: 18, height: 18, borderColor: done ? '#38BE98' : 'rgba(var(--ink-rgb),0.2)', background: done ? '#38BE98' : 'transparent' }}>
                          {done && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium" style={{ color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</p>
                          {t.tasks && <p className="text-[11px]" style={{ color: TEXT2 }}>{t.tasks.short_name ?? t.tasks.title}</p>}
                        </div>
                        {t.tasks && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={tagStyle(t.tasks.part)}>{t.tasks.part}</span>}
                      </div>
                    )
                  })}
                  {todayQuickTodos.map((t, i) => {
                    const done = t.done
                    return (
                      <div key={t.id} className="flex items-center gap-3 py-2.5" style={rd(todayTodos.length + i, todayTodos.length + todayQuickTodos.length)}>
                        <button onClick={() => toggleQuickTodo(t.id)} className="flex-shrink-0 rounded-full border-2 flex items-center justify-center"
                          style={{ width: 18, height: 18, borderColor: done ? '#38BE98' : 'rgba(var(--ink-rgb),0.2)', background: done ? '#38BE98' : 'transparent' }}>
                          {done && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium" style={{ color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</p>
                        </div>
                        <button onClick={() => removeQuickTodo(t.id)} className="text-[13px] flex-shrink-0 px-1" style={{ color: TEXT3, background: 'none', border: 'none' }}>×</button>
                      </div>
                    )
                  })}
                </>
          }
        </div>

        <div className="rounded-[20px] p-4" style={MCARD}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>진행 중 과업</h2>
            <Link href="/project" className="text-[11px]" style={{ color: TEXT3 }}>전체 보기</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : subTasks.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>진행 중인 과업이 없어요</p>
              : subTasks.map((st, i) => {
                  const gc = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                  return (
                    <Link key={st.id} href={`/subtasks/${st.id}`}>
                      <div className="flex items-center gap-3 py-2.5" style={rd(i, subTasks.length)}>
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: gc }} />
                        <span className="text-[13px] font-medium flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{st.title}</span>
                        {st.agenda_items && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 truncate max-w-[100px]"
                            style={{ background: `${gc}33`, color: gc }}>{st.agenda_items.title}</span>
                        )}
                      </div>
                    </Link>
                  )
                })
          }
        </div>

        <div className="rounded-[20px] p-4" style={MCARD}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>오늘의 일정</h2>
            <Link href="/schedule" className="text-[11px]" style={{ color: TEXT3 }}>전체</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(2)}</div>
            : todayMeetings.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>오늘 일정 없음</p>
              : todayMeetings.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-2.5 py-2.5" style={rd(i, todayMeetings.length)}>
                    <Clock size={11} style={{ color: TEXT3 }} className="flex-shrink-0" />
                    <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{m.title}</span>
                  </div>
                ))
          }
        </div>

        <div className="rounded-[20px] p-4" style={MCARD}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>최근 회의록</h2>
            <Link href="/meetings" className="text-[11px]" style={{ color: TEXT3 }}>전체</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : recentMeetings.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>회의록이 없어요</p>
              : recentMeetings.map((m, i) => (
                  <Link key={m.id} href={`/meetings/${m.id}`}>
                    <div className="flex items-center gap-2.5 py-2.5" style={rd(i, recentMeetings.length)}>
                      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.07)' }}>
                        <FileText size={11} strokeWidth={1.75} style={{ color: TEXT2 }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: TEXT1 }}>{m.title}</p>
                        <p className="text-[11px]" style={{ color: TEXT3 }}>{fmtDate(m.meeting_date)}</p>
                      </div>
                    </div>
                  </Link>
                ))
          }
        </div>

        <div className="rounded-[20px] p-4" style={MCARD}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>퀵메모</h2>
            <Link href="/memos" className="text-[11px]" style={{ color: TEXT3 }}>전체</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : memos.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>메모가 없어요</p>
              : memos.slice(0, 6).map((memo, i) => (
                  <div key={memo.id} onClick={() => { localStorage.setItem('memos_open_id', memo.id); router.push('/memos') }}
                    className="flex items-center gap-2.5 py-2.5 cursor-pointer" style={rd(i, Math.min(memos.length, 6))}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dots[i % 4] }} />
                    <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{memo.title}</span>
                    <span className="text-[10px] flex-shrink-0" style={{ color: TEXT3 }}>{fmtDate(memo.created_at)}</span>
                  </div>
                ))
          }
        </div>

        <div className="rounded-[20px] p-4" style={MCARD}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>회고</h2>
            {todayJournal && <button onClick={() => setShowJournal(true)} className="text-[11px]" style={{ color: TEXT3 }}>수정</button>}
          </div>
          {todayJournal ? (
            <button onClick={() => setShowJournal(true)} className="w-full text-left">
              <p className="text-[13px] leading-relaxed line-clamp-4" style={{ color: TEXT2 }}>{todayJournal.content}</p>
            </button>
          ) : (
            <button onClick={() => setShowJournal(true)} className="w-full py-5 flex flex-col items-center justify-center gap-2 rounded-xl"
              style={{ border: '1px dashed rgba(var(--ink-rgb),0.1)' }}>
              <NotebookPen size={18} strokeWidth={1.5} style={{ color: TEXT3 }} />
              <span className="text-[12px]" style={{ color: TEXT3 }}>오늘 회고 작성하기</span>
            </button>
          )}
        </div>

      </div>

      {/* ── 데스크톱 ── */}
      <div ref={homeOuterRef} className="hidden md:flex flex-col h-full overflow-hidden" style={{ background: BG }}>

        {/* 본문 zoom(메뉴바 제외) + 세로 배수 --vs — 위 homeFit 참고 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto scrollbar-hide"
          style={{ paddingBottom: 4, zoom: homeFit.zoom, '--vs': homeFit.vs } as React.CSSProperties}>

          {/* Hero — 2행 compact: [인사말 · 부제 | 바로가기] / [상태 칩 | 검색] (1366×768 한 화면 예산) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 20, rowGap: vs(6), marginBottom: vs(10), flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
              <h1 style={{ fontSize: 21, fontWeight: 700, color: TEXT1, letterSpacing: '-0.03em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>안녕하세요, 진일님 👋</h1>
              <p style={{ fontSize: 12.5, color: TEXT3, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>오늘도 집중해서 멋진 하루 보내세요.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, position: 'relative', zIndex: 2 }}>
              <ShortcutIcons />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 24 }}>
              {!loading && (
                <>
                  <KpiChip dot="#5B7EC4" label={`오늘 일정 ${todayMeetings.length + (isTimelineToday ? googleEvents.length : 0)}건`} />
                  <KpiChip dot="#7878D8" label={`오늘 업무 ${todayOpenCount}건`} />
                  <KpiChip dot="#38BE98" label={`진행중 과업 ${subTasks.length}건`} />
                  <KpiChip dot={todayJournal ? '#38BE98' : '#C86868'} label={todayJournal ? '회고 작성완료' : '회고 미작성'} onClick={() => setShowJournal(true)} />
                </>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div
                onClick={() => window.dispatchEvent(new Event('open-global-search'))}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(var(--ink-rgb),0.14)'; el.style.background = 'rgba(var(--ink-rgb),0.07)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(var(--ink-rgb),0.08)'; el.style.background = 'rgba(var(--ink-rgb),0.04)' }}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, width: 340, height: 30, borderRadius: 9, background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid rgba(var(--ink-rgb),0.08)', padding: '0 11px', cursor: 'pointer', transition: 'all 150ms ease' }}
              >
                <Search size={12} style={{ color: 'rgba(var(--ink-rgb),0.28)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'rgba(var(--ink-rgb),0.26)', flex: 1 }}>검색 (과업, 안건, 회의록 등)</span>
                <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.08)', color: 'rgba(var(--ink-rgb),0.24)', fontFamily: 'monospace' }}>⌘K</kbd>
              </div>
            </div>
          </div>

          {/* 본문 2단 — 왼쪽: 오늘의 타임라인(세로, 열 높이 전체) | 오른쪽: 금주 업무 + 하단 3박스 */}
          <div data-home="body" style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: `${TL_COL_W} minmax(0, 1fr)`, gridTemplateRows: 'minmax(0, 1fr)', columnGap: 12 }}>
          <DualLaneTimeline
            meetings={timelineMeetings} todos={timelineTodos} scheduleItems={scheduleItems} googleEvents={googleEvents} now={now}
            selectedDate={timelineDate} isToday={isTimelineToday}
            onNavigateDate={dir => setTimelineDate(d => shiftDateStr(d, dir))}
            onJumpToday={() => setTimelineDate(todayStr())}
            onPickDate={setTimelineDate}
            onAddScheduleItem={handleAddScheduleItem}
            onRemoveScheduleItem={handleRemoveScheduleItem}
            onUpdateScheduleItemPosition={handleUpdateScheduleItemPosition}
            onSelectGoogleEvent={handleSelectGoogleEvent}
            fixedMeetings={timelineFixedMeetings}
          />

          <div data-home="right" style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* ── 금주 업무 — 오른쪽 열의 주 작업면. 하단 3박스를 뺀 높이를 모두 쓰고, 항목이 많으면 열 안에서 스크롤 ── */}
          <section data-home="week" style={{ ...cardBase(), borderRadius: 14, transition: 'none', position: 'relative', flex: '87 1 0px', minHeight: vs(WEEK_MIN_H), display: 'flex', flexDirection: 'column', paddingTop: 12, overflow: 'hidden' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: vs(WEEK_TITLE_H), padding: '0 16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: TEXT1, letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>
                  <CalendarCheck size={14} strokeWidth={2.2} style={{ color: '#5E8FBF' }} />금주 업무
                </h2>
                <span style={{ fontSize: 12, color: TEXT3, fontVariantNumeric: 'tabular-nums' }}>{weekDays[0].replace(/-/g, '.')} – {shortDate(weekDays[4])}</span>
                {/* 주 이동 — 오늘의 타임라인 날짜 네비와 같은 스타일 */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2, padding: '3px 6px', borderRadius: 6, background: 'rgba(var(--accent-tint-rgb),0.12)', border: '1px solid rgba(var(--accent-tint-rgb),0.26)' }}>
                  <button type="button" onClick={() => setWeekOffset(w => w - 1)} aria-label="이전 주"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-tint-text)', fontSize: 11, padding: '0 3px', lineHeight: 1 }}>‹</button>
                  <span onMouseDown={e => e.stopPropagation()} onClick={() => setWeekPickerOpen(v => !v)} title="날짜로 이동"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 3px', cursor: 'pointer' }}>
                    <CalendarDays size={10} strokeWidth={2} style={{ color: 'var(--accent-tint-text)' }} />
                    <span style={{ fontSize: 11, color: 'var(--accent-tint-text)', fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                      {weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난주' : weekOffset === 1 ? '다음 주' : `${weekOffset > 0 ? '+' : ''}${weekOffset}주`}
                    </span>
                  </span>
                  {weekPickerOpen && (
                    <WeekPicker weekMonday={weekMonday} today={today}
                      onPick={d => { setWeekOffset(weekOffsetOf(d)); setWeekPickerOpen(false) }}
                      onClose={closeWeekPicker} />
                  )}
                  <button type="button" onClick={() => setWeekOffset(w => w + 1)} aria-label="다음 주"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-tint-text)', fontSize: 11, padding: '0 3px', lineHeight: 1 }}>›</button>
                </div>
                {weekOffset !== 0 && (
                  <button type="button" onClick={() => setWeekOffset(0)}
                    style={{ fontSize: 10.5, color: TEXT3, background: 'none', border: '1px solid rgba(var(--ink-rgb),0.12)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                    이번 주로
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {weekOffset === 0 && <button type="button" onClick={() => { setQuickAddTitle(''); setWeekAddDate(d => d === today ? null : today) }}
                  style={{ marginLeft: 4, fontSize: 12, color: weekAddDate === today ? TEXT2 : TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
                  {weekAddDate === today ? '취소' : '+ 오늘 할 일'}
                </button>}
              </div>
            </div>
            {/* 폭이 모자라면 열을 찌그러뜨리지 않고 이 영역만 가로 스크롤 (섹션 헤더는 스크롤 밖에 고정).
                제목 행 아래 간격은 여기 paddingTop으로 둔다 — 오늘 열 유리 테두리가 이 간격까지 위로 올라가도 잘리지 않게 */}
            <div data-week-scroll style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, minWidth: 0, width: '100%', padding: `${vs(WEEK_TITLE_GAP)} 6px 0`, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'rgba(var(--ink-rgb),0.18) transparent' }}>
            <div style={{ height: '100%', minWidth: weekMinW, display: 'grid', gridTemplateColumns: weekGridCols, gridTemplateRows: 'auto minmax(0, 1fr)' }}>
              {weekVisible.map(ci => {
                const items = weekColItems(ci)
                const secondary = ci === 0 || ci === 6
                const date = secondary ? null : weekDays[ci - 1]
                const isTodayCol = date === today
                const isPast = !!date && date < today
                return (
                  <div key={`h${ci}`} data-week-col={ci} className="group" style={{ gridRow: 1, gridColumn: weekVisible.indexOf(ci) + 1, position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6, height: vs(WEEK_COLHEAD_H), padding: '0 12px', borderBottom: `1px solid ${DIVIDER}`, borderLeft: weekVisible.indexOf(ci) > 0 ? '1px solid rgba(var(--ink-rgb),0.05)' : undefined, paddingTop: vs(7) }}>
                    {secondary ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: ci === 0 && items.length > 0 ? '#C08A2E' : TEXT2, whiteSpace: 'nowrap' }}>{ci === 0 ? '직전주 미완료' : '다음주로 연기'}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: isPast ? TEXT3 : TEXT1 }}>{'월화수목금'[ci - 1]}</span>
                        <span style={{ fontSize: 11.5, color: TEXT3, fontVariantNumeric: 'tabular-nums' }}>{shortDate(date!)}</span>
                        {isTodayCol && <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--accent-tint-text)', background: 'rgba(var(--accent-tint-rgb),0.12)', padding: '1px 6px', borderRadius: 4, alignSelf: 'center', marginTop: -7 }}>오늘</span>}
                      </>
                    )}
                    {items.length > 0 && <span style={{ marginLeft: 2, fontSize: 11, color: TEXT3, opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>{items.length}</span>}
                    {date && (
                      <button type="button" aria-label={`${shortDate(date)}에 할 일 추가`} title={`${shortDate(date)}에 할 일 추가`}
                        onClick={() => { setQuickAddTitle(''); setWeekAddDate(d => d === date ? null : date) }}
                        className={weekAddDate === date ? '' : 'opacity-0 group-hover:opacity-100'}
                        style={{ marginLeft: 'auto', alignSelf: 'center', marginTop: -7, width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, color: TEXT3, background: weekAddDate === date ? 'rgba(var(--ink-rgb),0.06)' : 'transparent', border: 'none', cursor: 'pointer', padding: 0, transition: 'opacity 120ms ease' }}>+</button>
                    )}
                  </div>
                )
              })}
              {weekVisible.map(ci => {
                const items = weekColItems(ci)
                const secondary = ci === 0 || ci === 6
                const colDate = secondary ? null : weekDays[ci - 1]
                const dropKey = ci === 6 ? 'defer' : colDate   // 직전주 열은 날짜가 정해지지 않아 드롭 대상 아님
                return (
                  <div key={`b${ci}`} data-week-body={ci} className="scrollbar-hide"
                    {...(dropKey ? weekDropProps(dropKey, colDate) : {})}
                    // 세로만 contain — 가로(틸트 휠)까지 막으면 바깥 가로 스크롤로 전달되지 않는다
                    style={{ gridRow: 2, gridColumn: weekVisible.indexOf(ci) + 1, minHeight: 0, overflowY: 'auto', overscrollBehaviorY: 'contain', padding: `${vs(6)} 12px`, borderLeft: weekVisible.indexOf(ci) > 0 ? '1px solid rgba(var(--ink-rgb),0.05)' : undefined, transition: 'background 120ms ease', ...dropTargetStyle(!!dropKey && weekDropDate === dropKey) }}>
                    {colDate && weekAddDate === colDate && (
                      <input autoFocus value={quickAddTitle}
                        onChange={e => setQuickAddTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addQuickTodo(colDate); if (e.key === 'Escape') setWeekAddDate(null) }}
                        placeholder={colDate === today ? '오늘 할 일 (Enter)' : `${shortDate(colDate)} 할 일 (Enter)`}
                        style={{ width: '100%', fontSize: 12.5, background: 'transparent', border: `1px solid ${DIVIDER}`, borderRadius: 6, padding: '5px 8px', color: TEXT1, outline: 'none', margin: '2px 0 4px' }} />
                    )}
                    {!loading && ci === 0 && olderOpenCount > 0 && (
                      <button type="button" title="지난주보다 이전 날짜의 미완료 — 골라서 확인·삭제" onClick={() => setOlderOpen(true)}
                        className="hover:underline"
                        style={{ display: 'block', padding: '2px 0 4px', fontSize: 10.5, color: TEXT3, whiteSpace: 'nowrap', background: 'none', border: 'none', cursor: 'pointer' }}>이전 {olderOpenCount}건 일괄 정리 ›</button>
                    )}
                    {loading ? skel(2)
                      : items.length === 0 && secondary
                        ? <p style={{ fontSize: 11.5, color: TEXT3, opacity: 0.6, padding: '6px 0' }}>{ci === 6 ? '없음 · 즉석 할 일을 끌어 놓으면 연기' : '없음'}</p>
                        : items.map(item => secondary ? (
                            // 직전주·다음주 항목 중 할 일·세부task는 요일 열로 끌면 그 날짜로 옮겨지도록 요일 이동용 데이터를 덧붙인다
                            <div key={item.key}
                              onDragStart={e => {
                                if (item.kind === 'todo' || item.kind === 'agenda') e.dataTransfer.setData(WEEK_MOVE_DND, JSON.stringify({ kind: item.kind, id: item.kind === 'todo' ? item.todo!.id : item.st!.id }))
                                e.dataTransfer.effectAllowed = 'copyMove'   // 타임라인(copy)·요일 열(move) 어느 쪽에도 놓을 수 있게
                              }}>
                              {renderWeekItem(item, true)}
                            </div>
                          ) : renderWeekItem(item, false))}
                  </div>
                )
              })}
              {/* 오늘 열 유리 테두리 — 머리글+본문을 한 장의 유리판처럼 감싼다. 얇은 그라데이션 선(마스크) + 위쪽 하이라이트·아래 그림자로 입체감.
                  클릭·드래그는 그대로 통과(pointerEvents none) */}
              {weekDays.includes(today) && (
                <div aria-hidden data-week-today-frame
                  style={{ gridRow: '1 / 3', gridColumn: weekVisible.indexOf(weekDays.indexOf(today) + 1) + 1, position: 'relative', zIndex: 1, margin: `${vs(-5)} 3px 8px`, borderRadius: 12, pointerEvents: 'none',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(var(--accent-tint-rgb),0.12), 0 1px 2px rgba(var(--ink-rgb),0.06), 0 10px 24px -12px rgba(var(--accent-tint-rgb),0.5)' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', padding: 1,
                    background: 'linear-gradient(165deg, rgba(var(--accent-tint-rgb),0.5) 0%, rgba(var(--accent-tint-rgb),0.6) 30%, rgba(var(--accent-tint-rgb),0.22) 70%, rgba(255,255,255,0.55) 100%)',
                    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor',
                    mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)' }} />
                </div>
              )}
            </div>
            </div>

          </section>

          {/* '이전 N건' 모달 — 지난주보다 이전 날짜의 미완료. 스크롤로 보고, 항목을 끌어 요일 열에 놓으면 그 날짜로 옮김.
              끄는 동안엔 모달을 투명·클릭 통과로 바꿔 아래 요일 열이 드롭을 받게 한다. ESC·바깥 클릭으로 닫힘 */}
          {olderOpen && (
            <div onClick={closeOlder}
              style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                background: 'rgba(0,0,0,0.28)', opacity: olderDragging ? 0 : 1, pointerEvents: olderDragging ? 'none' : 'auto', transition: 'opacity 120ms ease' }}>
              <div onClick={e => e.stopPropagation()} role="dialog" aria-label="이전 미완료"
                style={{ width: 'min(420px, 100%)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-elevated)', border: '1px solid rgba(var(--ink-rgb),0.12)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 16px 8px' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT1 }}>이전 미완료</span>
                  <span style={{ fontSize: 11.5, color: TEXT3 }}>{olderItems.length}건 · 끌어서 요일에 놓으면 그 날짜로 이동</span>
                  <button type="button" aria-label="닫기" onClick={closeOlder}
                    style={{ marginLeft: 'auto', fontSize: 16, lineHeight: 1, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>×</button>
                </div>
                {olderItems.length > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 6px', fontSize: 11.5, color: TEXT2, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={olderSelCount === olderItems.length}
                      ref={el => { if (el) el.indeterminate = olderSelCount > 0 && olderSelCount < olderItems.length }}
                      onChange={() => { setOlderConfirmDelete(false); setOlderSel(olderSelCount === olderItems.length ? new Set() : new Set(olderItems.map(it => it.key))) }}
                      style={{ accentColor: 'var(--accent-tint-text)', cursor: 'pointer' }} />
                    전체 선택
                  </label>
                )}
                <div style={{ overflowY: 'auto', padding: '0 16px 12px', minHeight: 0 }}>
                  {olderItems.length === 0
                    ? <p style={{ fontSize: 12, color: TEXT3, padding: '8px 0' }}>남은 항목이 없어요</p>
                    : [...olderItems].sort((a, b) => a.date.localeCompare(b.date)).map(item => (
                        <div key={item.key}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 6, background: olderSel.has(item.key) ? 'rgba(var(--accent-tint-rgb),0.10)' : undefined }}
                          // 행 자체의 드래그(타임라인용 데이터·즉석 할일 id)에 요일 이동용 데이터를 덧붙인다
                          onDragStart={e => {
                            if (item.kind === 'todo' || item.kind === 'agenda') e.dataTransfer.setData(WEEK_MOVE_DND, JSON.stringify({ kind: item.kind, id: item.kind === 'todo' ? item.todo!.id : item.st!.id }))
                            e.dataTransfer.effectAllowed = 'copyMove'
                            // 바로 숨기면 브라우저가 드래그를 취소할 수 있어 다음 틱에
                            setTimeout(() => setOlderDragging(true), 0)
                          }}
                          onDragEnd={() => setOlderDragging(false)}>
                          <input type="checkbox" aria-label="선택" checked={olderSel.has(item.key)}
                            onChange={() => { setOlderConfirmDelete(false); setOlderSel(p => { const n = new Set(p); if (n.has(item.key)) n.delete(item.key); else n.add(item.key); return n }) }}
                            style={{ marginTop: `calc(7px + 21px * (var(--vs, 1) - 1))`, accentColor: 'var(--accent-tint-text)', cursor: 'pointer', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>{renderWeekItem(item, true)}</div>
                        </div>
                      ))}
                </div>
                {olderSelCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(var(--ink-rgb),0.08)' }}>
                    <span style={{ fontSize: 12, color: TEXT2 }}>{olderSelCount}개 선택</span>
                    <button type="button" onClick={() => { completeOlderItems(olderSelItems); setOlderSel(new Set()) }}
                      style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#38BE98', background: 'rgba(56,190,152,0.12)', border: '1px solid rgba(56,190,152,0.35)', borderRadius: 7, padding: '4px 12px', cursor: 'pointer' }}>
                      확인
                    </button>
                    <button type="button"
                      onClick={() => {
                        if (!olderConfirmDelete) { setOlderConfirmDelete(true); return }
                        void deleteOlderItems(olderSelItems); setOlderSel(new Set()); setOlderConfirmDelete(false)
                      }}
                      style={{ fontSize: 12, fontWeight: 600, color: '#E5484D', background: olderConfirmDelete ? 'rgba(229,72,77,0.16)' : 'rgba(229,72,77,0.08)', border: '1px solid rgba(229,72,77,0.35)', borderRadius: 7, padding: '4px 12px', cursor: 'pointer' }}>
                      {olderConfirmDelete ? '한 번 더 누르면 삭제' : '삭제'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 하단 3박스 — 퀵메모 | 진행중 과업 | 회고. 한 개의 invisible grid를 공유해 행 높이/기준선 일치 ── */}
          {/* 박스는 각 열 뒤에 까는 배경(음수 margin으로 bleed) — 행 정렬 grid는 하나로 유지 */}
          <section data-home="bottom" style={{
            // 기본 높이(BOTTOM_ROWS행) + 금주 업무와 87:11로 나눈 남는 높이 — 늘어난 만큼 목록 행이 더 보인다
            flex: `11 0 calc(2 * ${vs(BOX_PAD_Y)} + ${vs(BOX_TITLE_H)} + ${vs(BOX_FIRST_ROW_H)} + ${BOTTOM_ROWS} * ${bottomRowH} + ${vs(8)} + 22px)`, minHeight: 0,
            padding: `${vs(BOX_PAD_Y)} ${BOX_PAD_X}px`, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: BOX_PAD_X * 2 + 10,
            gridTemplateRows: `${vs(BOX_TITLE_H)} ${vs(BOX_FIRST_ROW_H)} minmax(0, 1fr) auto`,
          }}>
            {[1, 2, 3].map(col => (
              <div key={`box${col}`} aria-hidden style={{ ...cardBase(), borderRadius: 14, transition: 'none', gridColumn: col, gridRow: '1 / -1', margin: `calc(-1 * ${vs(BOX_PAD_Y)}) -${BOX_PAD_X}px` }} />
            ))}
            {/* row 1: section title — 오늘의 타임라인 헤더와 같은 스타일 */}
            {([[1, '퀵메모', <StickyNote key="i" size={14} strokeWidth={2.2} style={{ color: '#70B8C4' }} />], [2, '진행중 과업', <Layers key="i" size={14} strokeWidth={2.2} style={{ color: '#5B7EC4' }} />], [3, '회고', <NotebookPen key="i" size={14} strokeWidth={2.2} style={{ color: '#C8A050' }} />]] as const).map(([col, label, icon]) => (
              <h2 key={label} style={{ gridRow: 1, gridColumn: col, position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: TEXT1, letterSpacing: '-0.02em', height: vs(BOX_TITLE_H), alignSelf: 'start', margin: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>{label}
              </h2>
            ))}

            {/* row 2: 퀵메모 · 과업 표 · 회고 머리글 — 세 박스 첫 줄 층위를 맞춘다 */}
            <div data-bottom="memo-header" style={{ position: 'relative', gridRow: 2, gridColumn: 1, height: vs(BOX_FIRST_ROW_H), display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px', borderBottom: `1px solid ${DIVIDER}` }}>
              <span style={{ width: 5, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: TEXT3 }}>제목</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: TEXT3 }}>날짜</span>
            </div>
            <div data-bottom="journal-header" style={{ position: 'relative', gridRow: 2, gridColumn: 3, height: vs(BOX_FIRST_ROW_H), display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px', borderBottom: `1px solid ${DIVIDER}` }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: TEXT2, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(today)}</span>
              <span style={{ fontSize: 11.5, color: todayJournal ? '#38BE98' : TEXT3 }}>{todayJournal ? '작성됨' : '미작성'}</span>
              <button type="button" onClick={async () => { if (jEdits) await saveInlineJournal(); setShowJournal(true) }}
                style={{ marginLeft: 'auto', fontSize: 12, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>전체 편집 ↗</button>
            </div>
            <div data-bottom="task-header" style={{ position: 'relative', gridRow: 2, gridColumn: 2, height: vs(BOX_FIRST_ROW_H), display: 'grid', gridTemplateColumns: BOTTOM_TASK_COLS, alignItems: 'center', columnGap: 10, padding: '0 6px', borderBottom: `1px solid ${DIVIDER}` }}>
              {([['범주', '범주'], ['프로젝트 / 과업', '상세TASK'], ['상태', null], ['마감', '마감']] as const).map(([label, sortKey]) => (
                <button key={label} type="button" disabled={!sortKey} onClick={() => sortKey && toggleSort(sortKey)}
                  style={{ fontSize: 12, fontWeight: 500, color: stSort?.col === sortKey ? TEXT2 : TEXT3, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: sortKey ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  {label}{sortKey && stSort?.col === sortKey ? (stSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>

            {/* 데이터 영역 — 3열 모두 BOTTOM_ROWS 높이의 스크롤 셀 (행 높이 동일 → 첫 화면 행 정렬 유지, 스크롤바 숨김) */}
            {[1, 2].map(col => (
              <div key={`list${col}`} className="scrollbar-hide" data-bottom={col === 1 ? 'memo-list' : 'task-list'}
                style={{ position: 'relative', gridColumn: col, gridRow: 3, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {loading ? <div style={{ paddingTop: 4 }}>{skel(BOTTOM_ROWS)}</div>
                  : col === 1 ? bottomMemos.map(memo => {
                      const memoTag = memo.tag[0] ?? '기타'
                      return (
                        <ListRow key={memo.id} onClick={() => setMemoViewId(memo.id)} draggable
                          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `memo_${memo.id}`, title: memo.title, subtitle: memoTag })); e.dataTransfer.effectAllowed = 'copy' }}
                          style={{ height: bottomRowH, borderBottom: `1px solid ${DIVIDER}`, marginLeft: 0, marginRight: 0, paddingLeft: 6, paddingRight: 6, borderRadius: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: CATEGORY_PALETTE[MEMO_TAG[memoTag] ?? colorKeyFromName(memoTag)].solid, flexShrink: 0, opacity: 0.85 }} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 400, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memo.title || '(제목 없음)'}</span>
                          <span style={{ fontSize: 10.5, color: TEXT3, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(memo.created_at)}</span>
                        </ListRow>
                      )
                    })
                  : bottomTasks.map(st => {
                      const overdue = !!(st.target_date ?? st.due_date) && (st.target_date ?? st.due_date)! < today
                      return (
                        <Link key={st.id} href={`/subtasks/${st.id}`} style={{ height: bottomRowH, borderBottom: `1px solid ${DIVIDER}`, display: 'block', textDecoration: 'none' }}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `st_${st.id}`, title: st.title, subtitle: st.agenda_items?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}>
                          <ListRow style={{ height: '100%', marginLeft: 0, marginRight: 0, paddingLeft: 6, paddingRight: 6, borderRadius: 0, display: 'grid', gridTemplateColumns: BOTTOM_TASK_COLS, alignItems: 'center', columnGap: 10 }}>
                            <span style={{ fontSize: 10.5, color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.agenda_items?.agenda_groups?.category ?? '—'}</span>
                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 400, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, maxWidth: '100%' }}>{st.title}</span>
                              {st.agenda_items && <span style={{ fontSize: 10.5, color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{st.agenda_items.title}</span>}
                            </span>
                            <span style={{ fontSize: 10.5, color: overdue ? '#C86868' : TEXT3, whiteSpace: 'nowrap' }}>{overdue ? '기한 경과' : '진행중'}</span>
                            <span style={{ fontSize: 10.5, color: TEXT3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{(st.target_date ?? st.due_date) ? shortDate((st.target_date ?? st.due_date)!) : '—'}</span>
                          </ListRow>
                        </Link>
                      )
                    })}
              </div>
            ))}

            {/* 회고 — 전체 섹션(식사·감사·일반 포함)을 같은 행 높이로, BOTTOM_ROWS 높이 안에서 스크롤 */}
            <div className="scrollbar-hide" data-bottom="journal-sections"
              style={{ position: 'relative', gridColumn: 3, gridRow: 3, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {(() => {
                const parsed = parseSections(todayJournal?.content ?? '')
                return SECTION_KEYS.map(k => (
                  <label key={k} style={{ height: bottomRowH, borderBottom: `1px solid ${DIVIDER}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 6px', cursor: 'text' }}>
                    <span style={{ fontSize: 10.5, color: TEXT3, width: 60, flexShrink: 0, whiteSpace: 'nowrap' }}>{SECTION_META[k].label}</span>
                    <textarea value={jEdits?.[k] ?? parsed[k]} rows={1} disabled={loading}
                      onChange={e => setJEdits(p => ({ ...(p ?? {}), [k]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveInlineJournal() } }}
                      placeholder={k === 'meal' ? '점심: … (줄바꿈 후 저녁: …)' : SECTION_META[k].ph || SECTION_META[k].label}
                      className="scrollbar-hide"
                      style={{ flex: 1, minWidth: 0, height: 20, lineHeight: '20px', fontSize: 12, color: TEXT1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: 0, fontFamily: 'inherit', overflowY: 'auto' }} />
                  </label>
                ))
              })()}
            </div>

            {/* last row: 전체 보기 */}
            <Link href="/memos" style={{ position: 'relative', gridRow: 4, gridColumn: 1, fontSize: 12, color: TEXT3, textDecoration: 'none', paddingTop: vs(8), justifySelf: 'start' }}>
              전체 보기 →{memos.length > BOTTOM_ROWS ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{memos.length}건</span> : null}
            </Link>
            <Link href="/project" style={{ position: 'relative', gridRow: 4, gridColumn: 2, fontSize: 12, color: TEXT3, textDecoration: 'none', paddingTop: vs(8), justifySelf: 'start' }}>
              전체 보기 →{subTasks.length > BOTTOM_ROWS ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{subTasks.length}건</span> : null}
            </Link>
            <div style={{ position: 'relative', gridRow: 4, gridColumn: 3, display: 'flex', alignItems: 'center', gap: 10, paddingTop: vs(8) }}>
              <span style={{ fontSize: 12, color: jMsg.startsWith('저장 실패') ? '#C86868' : jMsg ? '#38BE98' : TEXT3, flex: 1 }}>
                {jMsg || (jEdits ? '수정됨 · Ctrl+Enter 저장' : 'Ctrl+Enter 저장')}
              </span>
              <button type="button" onClick={saveInlineJournal} disabled={!jEdits || jSaving}
                style={{ fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 6, border: `1px solid ${jEdits ? 'rgba(var(--accent-tint-rgb),0.35)' : 'rgba(var(--ink-rgb),0.10)'}`, background: jEdits ? 'rgba(var(--accent-tint-rgb),0.12)' : 'transparent', color: jEdits ? 'var(--accent-tint-text)' : TEXT3, cursor: jEdits ? 'pointer' : 'default' }}>
                {jSaving ? '저장 중…' : '저장'}
              </button>
            </div>
          </section>
          </div>
          </div>

          {/* 최근 회의록 — 목업 평가 동안 홈 primary layout에서 제외 (컴포넌트/데이터 로직 유지) */}
          {SHOW_RECENT_MEETINGS && (
            <div style={{ height: 240, marginTop: 24, flexShrink: 0 }}>
            <CardSection title="최근 회의록" link="/meetings" linkLabel="전체 →" icon={<FileText size={14} strokeWidth={2} style={{ color: '#7A82D8' }} />}>
              {loading ? <div>{skel(3)}</div>
                : recentMeetings.length === 0
                  ? <EmptyState
                      icon={<FileText size={20} strokeWidth={1.5} />}
                      label="회의록이 없습니다."
                      sub="첫 번째 회의록을 작성해보세요."
                    />
                  : recentMeetings.map((m, i) => (
                      <Link key={m.id} href={`/meetings/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                        <ListRow
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `meeting_${m.id}`, title: m.title, subtitle: fmtDate(m.meeting_date) })); e.dataTransfer.effectAllowed = 'copy' }}
                          style={{ ...rd(i, recentMeetings.length) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: isCompact ? '6px 0' : '9px 0' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: dots[i % 4], flexShrink: 0, boxShadow: `0 0 5px ${dots[i % 4]}80` }} />
                            <span style={{ fontSize: isCompact ? 12 : 13.5, fontWeight: 500, color: TEXT1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                            <span style={{ fontSize: 10.5, color: TEXT3, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtDate(m.meeting_date)}</span>
                          </div>
                        </ListRow>
                      </Link>
                    ))
              }
            </CardSection>
            </div>
          )}
        </div>
      </div>

      {/* 퀵메모 팝업 */}
      {memoViewId && typeof document !== 'undefined' && createPortal(
        (() => {
          const mv = memos.find(m => m.id === memoViewId)
          if (!mv) return null
          const mvPrimaryTag = mv.tag[0] ?? '기타'
          const dotColor = CATEGORY_PALETTE[MEMO_TAG[mvPrimaryTag] ?? colorKeyFromName(mvPrimaryTag)].solid
          return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-6"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
              onClick={() => setMemoViewId(null)}>
              <div style={{ width: '100%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-modal2)', border: '1px solid rgba(var(--ink-rgb),0.08)', borderRadius: 18, boxShadow: '0 32px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}>
                {/* 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(var(--ink-rgb),0.07)', flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 6px ${dotColor}80`, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: TEXT1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mv.title || '(제목 없음)'}</span>
                  <span style={{ fontSize: 11, color: TEXT3, flexShrink: 0 }}>{fmtDate(mv.created_at)}</span>
                  <button onClick={() => setMemoViewId(null)}
                    style={{ fontSize: 13, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}>✕</button>
                </div>
                {/* 본문 */}
                <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {mv.content
                    ? <div style={{ fontSize: 14, color: TEXT2, lineHeight: 1.75 }}
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: mv.content }} />
                    : <p style={{ fontSize: 13, color: TEXT3 }}>내용이 없습니다.</p>
                  }
                </div>
                {/* 하단 액션 */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(var(--ink-rgb),0.07)', display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => { localStorage.setItem('memos_open_id', mv.id); router.push('/memos'); setMemoViewId(null) }}
                    style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(var(--ink-rgb),0.12)', background: 'rgba(var(--ink-rgb),0.05)', color: TEXT2, cursor: 'pointer' }}>
                    편집하기 →
                  </button>
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {/* 구글캘린더 회의 → 회의록 생성 (범주 선택) */}
      {gcalPicker && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setGcalPicker(null)}>
          <div style={{ width: '100%', maxWidth: 380, background: 'var(--surface-modal2)', border: '1px solid rgba(var(--ink-rgb),0.08)', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.5)', padding: 20 }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT1, marginBottom: 4 }}>📅 {gcalPicker.title}</p>
            <p style={{ fontSize: 11.5, color: TEXT3, marginBottom: 14 }}>회의록을 어느 범주에 만들까요?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {meetingCategories.map(cat => {
                const key = MEETING_CATEGORY[cat] ?? colorKeyFromName(cat)
                const p = CATEGORY_PALETTE[key]
                return (
                  <button key={cat} onClick={() => createMeetingFromGoogleEvent(cat)}
                    style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: p.bg, color: p.text, border: `1px solid ${p.border}` }}>
                    {cat}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setGcalPicker(null)}
              style={{ marginTop: 14, fontSize: 11.5, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer' }}>
              취소
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 회고 풀스크린 에디터 */}
      {showJournal && typeof document !== 'undefined' && createPortal(
        <JournalFullscreenEditor
          selectedDate={todayStr()}
          current={todayJournal}
          yesterday={yesterJournal}
          meetings={meetingsForJournal}
          supabaseClient={sb.current}
          onSaved={(j) => { setTodayJournal(j); setShowJournal(false); setJEdits(null) }}
          onClose={() => setShowJournal(false)}
        />,
        document.body
      )}

    </div>
  )
}
