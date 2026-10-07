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
import type { GoogleCalendarEvent } from '@/app/api/calendar/today/route'
import { JournalFullscreenEditor, type DailyJournal, parseSections, serializeSections, SECTION_KEYS, SECTION_META, type SectionKey } from '@/components/home/DailyJournalWidget'
import { useUserSetting } from '@/hooks/useUserSetting'
import { openQuickMemo } from '@/lib/quickMemo'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────────────
interface MeetingSchedule {
  id: string
  title: string
  time: string
  is_recurring: boolean
  days_of_week?: number[]
  date?: string
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
function ListRow({ children, style, onClick, draggable, onDragStart, onMouseEnter, onMouseLeave }: {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
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

// 홈 하단 진행중 과업 컬럼: 범주 | 프로젝트/과업 | 상태 | 마감
const BOTTOM_TASK_COLS = '76px minmax(0, 1fr) 60px 44px'
// 하단 박스 안쪽 여백 (오늘의 타임라인 카드와 같은 cardBase 박스)
const BOX_PAD_X = 22, BOX_PAD_Y = 18
const BOX_TITLE_H = 46   // 박스 제목 행 높이 (제목 위아래 여백 포함)

// ── Timeline constants ─────────────────────────────────────────────────────
const H_START = 9, H_END = 21
const TL_CARD_G    = 10
const TL_TIME_H    = 16
const TL_LANE_H    = 40
const TL_LANE_GAP  = 5
const TL_LANE1_TOP = 22                                      // 구글캘린더 lane top
const TL_LANE2_TOP = TL_LANE1_TOP + TL_LANE_H + TL_LANE_GAP  // 일정(회의)+업무추가 lane top
const TL_CARD_H    = TL_LANE2_TOP + TL_LANE_H + 10       // total height ≈ 117

// Single-lane vivid event palette
const EV_COLS = [
  { bg: 'rgba(48,74,142,0.58)',  bd: 'rgba(88,116,195,0.22)' },
  { bg: 'rgba(20,88,70,0.56)',   bd: 'rgba(38,128,100,0.22)' },
  { bg: 'rgba(122,76,14,0.58)',  bd: 'rgba(178,112,28,0.22)' },
  { bg: 'rgba(72,42,132,0.56)',  bd: 'rgba(106,74,190,0.22)' },
  { bg: 'rgba(45,48,125,0.58)',  bd: 'rgba(70,76,178,0.22)' },
]

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
  const containerRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [cw, setCw] = useState(0)
  const [gTooltip, setGTooltip] = useState<{ ev: GoogleCalendarEvent; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const [mPos, setMPos] = useState<Record<string, number>>({})
  const [mDur, setMDur] = useState<Record<string, number>>({})
  const [tPos, setTPos] = useState<Record<string, number>>({})
  const [tDur, setTDur] = useState<Record<string, number>>({})

  const mDragRef   = useRef<{ id: string; startX: number; startHour: number } | null>(null)
  const mResizeRef = useRef<{ id: string; startX: number; startDur: number } | null>(null)
  const tDragRef   = useRef<{ id: string; startX: number; startHour: number } | null>(null)
  const tResizeRef = useRef<{ id: string; startX: number; startDur: number } | null>(null)

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
  const siDragRef   = useRef<{ id: string; startX: number; startHour: number } | null>(null)
  const siResizeRef = useRef<{ id: string; startX: number; startDur: number } | null>(null)

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

  function onSiDragStart(id: string, startX: number) {
    const startHour = siPos[id] ?? H_START
    const fixedDur = siDur[id] ?? 1
    let latestHour = startHour
    siDragRef.current = { id, startX, startHour }
    function onMove(e: MouseEvent) {
      if (!siDragRef.current || hW === 0) return
      const newH = Math.max(H_START, Math.min(H_END - fixedDur, siDragRef.current.startHour + (e.clientX - siDragRef.current.startX) / hW))
      latestHour = newH
      setSiPos(p => ({ ...p, [id]: newH }))
    }
    function onUp() {
      siDragRef.current = null
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      onUpdateScheduleItemPosition(id, latestHour, fixedDur)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onSiResizeStart(id: string, startX: number) {
    const fixedHour = siPos[id] ?? H_START
    const startDur = siDur[id] ?? 1
    let latestDur = startDur
    siResizeRef.current = { id, startX, startDur }
    function onMove(e: MouseEvent) {
      if (!siResizeRef.current || hW === 0) return
      const newD = Math.max(0.25, Math.min(H_END - fixedHour, siResizeRef.current.startDur + (e.clientX - siResizeRef.current.startX) / hW))
      latestDur = newD
      setSiDur(p => ({ ...p, [id]: newD }))
    }
    function onUp() {
      siResizeRef.current = null
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      onUpdateScheduleItemPosition(id, fixedHour, latestDur)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // ── Extras (외부에서 드래그된 항목) ────────────────────────────────────
  const [extras,   setExtras]   = useState<TLExtra[]>([])
  const [extraPos, setExtraPos] = useState<Record<string, number>>({})
  const [extraDur, setExtraDur] = useState<Record<string, number>>({})
  const [dropIndicatorX, setDropIndicatorX] = useState<number | null>(null)
  const exDragRef   = useRef<{ id: string; startX: number; startHour: number } | null>(null)
  const exResizeRef = useRef<{ id: string; startX: number; startDur: number } | null>(null)

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

  const hW = cw > 0 ? cw / (H_END - H_START) : 0

  function cardGeom(hour: number, dur: number) {
    const rawX = Math.max(0, (hour - H_START) * hW)
    const rawW = Math.min(cw - rawX, Math.max(hW * 0.5, dur * hW))
    return { x: rawX + TL_CARD_G / 2, w: Math.max(16, rawW - TL_CARD_G) }
  }

  function onMDragStart(id: string, startX: number) {
    const startHour = mPos[id] ?? H_START
    mDragRef.current = { id, startX, startHour }
    function onMove(e: MouseEvent) {
      if (!mDragRef.current || hW === 0) return
      const dur = mDur[id] ?? 1
      const newH = Math.max(H_START, Math.min(H_END - dur, mDragRef.current.startHour + (e.clientX - mDragRef.current.startX) / hW))
      setMPos(p => ({ ...p, [id]: newH }))
    }
    function onUp() { mDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onMResizeStart(id: string, startX: number) {
    mResizeRef.current = { id, startX, startDur: mDur[id] ?? 1 }
    function onMove(e: MouseEvent) {
      if (!mResizeRef.current || hW === 0) return
      const newD = Math.max(0.25, Math.min(H_END - (mPos[id] ?? H_START), mResizeRef.current.startDur + (e.clientX - mResizeRef.current.startX) / hW))
      setMDur(p => ({ ...p, [id]: newD }))
    }
    function onUp() { mResizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onTDragStart(id: string, startX: number) {
    const startHour = tPos[id] ?? H_START
    tDragRef.current = { id, startX, startHour }
    function onMove(e: MouseEvent) {
      if (!tDragRef.current || hW === 0) return
      const dur = tDur[id] ?? 1
      const newH = Math.max(H_START, Math.min(H_END - dur, tDragRef.current.startHour + (e.clientX - tDragRef.current.startX) / hW))
      setTPos(p => ({ ...p, [id]: newH }))
    }
    function onUp() { tDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onTResizeStart(id: string, startX: number) {
    tResizeRef.current = { id, startX, startDur: tDur[id] ?? 1 }
    function onMove(e: MouseEvent) {
      if (!tResizeRef.current || hW === 0) return
      const newD = Math.max(0.25, Math.min(H_END - (tPos[id] ?? H_START), tResizeRef.current.startDur + (e.clientX - tResizeRef.current.startX) / hW))
      setTDur(p => ({ ...p, [id]: newD }))
    }
    function onUp() { tResizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // ── Extra drag/resize handlers ─────────────────────────────────────────
  function onExDragStart(id: string, startX: number) {
    const startHour = extraPos[id] ?? H_START
    exDragRef.current = { id, startX, startHour }
    function onMove(e: MouseEvent) {
      if (!exDragRef.current || hW === 0) return
      const dur = extraDur[id] ?? 1
      const newH = Math.max(H_START, Math.min(H_END - dur, exDragRef.current.startHour + (e.clientX - exDragRef.current.startX) / hW))
      setExtraPos(p => ({ ...p, [id]: newH }))
    }
    function onUp() { exDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onExResizeStart(id: string, startX: number) {
    exResizeRef.current = { id, startX, startDur: extraDur[id] ?? 1 }
    function onMove(e: MouseEvent) {
      if (!exResizeRef.current || hW === 0) return
      const newD = Math.max(0.25, Math.min(H_END - (extraPos[id] ?? H_START), exResizeRef.current.startDur + (e.clientX - exResizeRef.current.startX) / hW))
      setExtraDur(p => ({ ...p, [id]: newD }))
    }
    function onUp() { exResizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onRemoveExtra(id: string) {
    setExtras(p => p.filter(e => e.id !== id))
    setExtraPos(p => { const n = { ...p }; delete n[id]; return n })
    setExtraDur(p => { const n = { ...p }; delete n[id]; return n })
  }

  function onContainerDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('tl-extra')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!containerRef.current || hW === 0) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropIndicatorX(e.clientX - rect.left)
  }

  function onContainerDragLeave() { setDropIndicatorX(null) }

  function onContainerDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropIndicatorX(null)
    try {
      const raw = e.dataTransfer.getData('tl-extra')
      if (!raw || !containerRef.current || hW === 0) return
      const item: TLExtra = JSON.parse(raw)
      const rect = containerRef.current.getBoundingClientRect()
      const hour = Math.max(H_START, Math.min(H_END - 1, H_START + (e.clientX - rect.left) / hW))
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
  const curX    = hW > 0 ? Math.max(0, Math.min(cw, (curH - H_START) * hW)) : 0
  const hours   = Array.from({ length: H_END - H_START + 1 }, (_, i) => H_START + i)

  const mHasOverflow = meetings.some(m => (mPos[m.id] ?? H_START) + (mDur[m.id] ?? 1) > H_END)
  const tHasOverflow = todos.some(t    => (tPos[t.id] ?? H_START) + (tDur[t.id] ?? 1) > H_END)

  function hourToStr(h: number) {
    const hr = Math.floor(h)
    const mn = Math.round((h - hr) * 60)
    return `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}`
  }

  return (
    <div style={{ ...cardBase(), marginBottom: 10, overflow: 'hidden', transition: 'none', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center' }}><Clock size={14} strokeWidth={2} style={{ color: '#E05252' }} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT1, letterSpacing: '-0.01em' }}>오늘의 타임라인</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px 6px', borderRadius: 6, background: 'rgba(var(--accent-tint-rgb),0.12)', border: '1px solid rgba(var(--accent-tint-rgb),0.26)' }}>
            <button onClick={() => onNavigateDate(-1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-tint-text)', fontSize: 11, padding: '0 3px', lineHeight: 1 }}>‹</button>
            <span onClick={() => dateInputRef.current?.showPicker?.()}
              style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '0 3px' }}>
              <CalendarDays size={10} strokeWidth={2} style={{ color: 'var(--accent-tint-text)' }} />
              <span style={{ fontSize: 11, color: 'var(--accent-tint-text)', fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                {isToday ? '오늘' : format(parseISO(selectedDate), 'M월 d일 (eee)', { locale: ko })}
              </span>
            </span>
            <input ref={dateInputRef} type="date" value={selectedDate}
              onChange={e => { if (e.target.value) onPickDate(e.target.value) }}
              className="sr-only" />
            <button onClick={() => onNavigateDate(1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-tint-text)', fontSize: 11, padding: '0 3px', lineHeight: 1 }}>›</button>
          </div>
          {!isToday && (
            <button onClick={onJumpToday}
              style={{ fontSize: 10.5, color: TEXT3, background: 'none', border: '1px solid rgba(var(--ink-rgb),0.12)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
              오늘로
            </button>
          )}
        </div>
        <div ref={addRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setAddOpen(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(var(--accent-tint-rgb),0.35)', background: 'rgba(var(--accent-tint-rgb),0.10)', color: 'var(--accent-tint-text)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(var(--accent-tint-rgb),0.18)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(var(--accent-tint-rgb),0.5)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(var(--accent-tint-rgb),0.10)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(var(--accent-tint-rgb),0.35)' }}
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

      <div ref={containerRef}
        style={{ position: 'relative', margin: '8px 22px 14px', height: TL_CARD_H }}
        onDragOver={onContainerDragOver}
        onDragLeave={onContainerDragLeave}
        onDrop={onContainerDrop}
      >
        {/* Lane labels removed */}

        {/* Hour labels */}
        {hours.map((h, i) => (
          <span key={h} style={{ position: 'absolute', left: i * hW, top: 0, fontSize: 9.5, color: TEXT3, opacity: 0.65, userSelect: 'none', fontWeight: 500, transform: i === hours.length - 1 ? 'translateX(-100%)' : 'none' }}>
            {h}:00
          </span>
        ))}

        {/* Vertical grid lines */}
        {cw > 0 && hours.map((_, i) => (
          <div key={i} style={{ position: 'absolute', left: i * hW, top: TL_TIME_H, bottom: 0, width: 1, background: 'rgba(var(--ink-rgb),0.05)', pointerEvents: 'none' }} />
        ))}

        {/* Lane track backgrounds */}
        {cw > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: TL_LANE1_TOP, height: TL_LANE_H, borderRadius: 5, background: 'rgba(var(--ink-rgb),0.018)', pointerEvents: 'none' }} />}
        {cw > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: TL_LANE2_TOP, height: TL_LANE_H, borderRadius: 5, background: 'rgba(var(--ink-rgb),0.018)', pointerEvents: 'none' }} />}

        {/* Current time — vertical line */}
        {inRange && cw > 0 && (
          <div style={{ position: 'absolute', left: curX, top: TL_TIME_H, bottom: 0, width: 1.5, background: 'rgb(var(--accent-tint-rgb))', pointerEvents: 'none', zIndex: 10 }} />
        )}

        {/* Current time — pill badge */}
        {inRange && cw > 0 && (
          <div style={{
            position: 'absolute',
            left: Math.max(0, curX - 22),
            top: 1,
            background: 'rgb(var(--accent-tint-rgb))',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            pointerEvents: 'none',
            zIndex: 12,
            whiteSpace: 'nowrap',
            letterSpacing: '0.03em',
            boxShadow: '0 0 8px rgba(var(--accent-tint-rgb),0.38)',
          }}>
            {hourToStr(curH)}
          </div>
        )}

        {/* ── Lane 2: meetings ── */}
        {meetings.map((m, i) => {
          const hour = mPos[m.id] ?? (H_START + i * 1.5)
          const dur  = mDur[m.id] ?? 1
          const { x, w } = cardGeom(hour, dur)
          const col = EV_COLS[i % EV_COLS.length]
          return (
            <div key={m.id}
              onMouseDown={e => { e.preventDefault(); onMDragStart(m.id, e.clientX) }}
              style={{
                position: 'absolute', left: x, width: w,
                top: TL_LANE2_TOP, height: TL_LANE_H,
                borderRadius: 8, cursor: 'grab',
                background: col.bg,
                border: `1px solid ${col.bd}`,
                padding: '5px 10px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                overflow: 'hidden', userSelect: 'none', zIndex: 5,
              }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.50)', lineHeight: 1, marginBottom: 3 }}>{hourToStr(hour)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{m.title}</span>
              <div onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onMResizeStart(m.id, e.clientX) }}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
            </div>
          )
        })}

        {/* ── Lane 2: 고정 회의 ── */}
        {fixedMeetings.map((s, i) => {
          const fid = `fixed_${s.id}`
          const [fh, fm] = s.time.split(':').map(Number)
          const timeHour = fh + fm / 60
          const hour = mPos[fid] ?? timeHour
          const dur  = mDur[fid] ?? 1
          const { x, w } = cardGeom(hour, dur)
          const col = EV_COLS[(meetings.length + i) % EV_COLS.length]
          return (
            <div key={fid}
              onMouseDown={e => { e.preventDefault(); onMDragStart(fid, e.clientX) }}
              style={{
                position: 'absolute', left: x, width: w,
                top: TL_LANE2_TOP, height: TL_LANE_H,
                borderRadius: 8, cursor: 'grab',
                background: col.bg,
                border: `1px solid rgba(56,190,152,0.30)`,
                padding: '5px 10px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                overflow: 'hidden', userSelect: 'none', zIndex: 4,
              }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.50)', lineHeight: 1, marginBottom: 3 }}>{s.time}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>↺ {s.title}</span>
              <div onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onMResizeStart(fid, e.clientX) }}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
            </div>
          )
        })}

        {/* ── Lane 1: 구글캘린더 (읽기전용 — 드래그/추가 불가, 클릭 시 회의록 생성/이동) ── */}
        {googleEvents.map(ev => {
          const { x, w } = cardGeom(ev.start_hour, ev.duration_hours)
          return (
            <div key={ev.id}
              onClick={() => onSelectGoogleEvent(ev)}
              onMouseEnter={e => {
                const r = e.currentTarget.getBoundingClientRect()
                setGTooltip({ ev, x: r.left + r.width / 2, y: r.top })
              }}
              onMouseLeave={() => setGTooltip(t => (t?.ev.id === ev.id ? null : t))}
              style={{
                position: 'absolute', left: x, width: w,
                top: TL_LANE1_TOP, height: TL_LANE_H,
                borderRadius: 8, cursor: 'pointer',
                background: 'rgba(66,133,244,0.16)',
                border: '1px solid rgba(66,133,244,0.4)',
                padding: '5px 10px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                overflow: 'hidden', userSelect: 'none', zIndex: 5,
              }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 3 }}>{ev.allDay ? '종일' : hourToStr(ev.start_hour)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>📅 {ev.title}</span>
            </div>
          )
        })}

        {/* ── 구글캘린더 hover 미리보기 (박스가 짧아 텍스트가 잘려도 전체 내용 확인 가능) ── */}
        {gTooltip && (
          <div style={{
            position: 'fixed', left: gTooltip.x, top: gTooltip.y - 8,
            transform: 'translate(-50%, -100%)',
            maxWidth: 260, padding: '8px 12px', borderRadius: 10,
            background: 'var(--surface-tooltip)', border: '1px solid rgba(66,133,244,0.35)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            pointerEvents: 'none', zIndex: 9999,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-tint-text)', marginBottom: 3 }}>
              📅 {gTooltip.ev.allDay ? '종일' : `${hourToStr(gTooltip.ev.start_hour)} – ${hourToStr(gTooltip.ev.start_hour + gTooltip.ev.duration_hours)}`}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: TEXT1, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4 }}>
              {gTooltip.ev.title}
            </div>
          </div>
        )}

        {/* ── Lane 2: task todos ── */}
        {todos.map((t, i) => {
          const hour = tPos[t.id] ?? (H_START + i * 1.5)
          const dur  = tDur[t.id] ?? 1
          const { x, w } = cardGeom(hour, dur)
          const col = EV_COLS[(i + 2) % EV_COLS.length]
          return (
            <div key={t.id}
              onMouseDown={e => { e.preventDefault(); onTDragStart(t.id, e.clientX) }}
              style={{
                position: 'absolute', left: x, width: w,
                top: TL_LANE2_TOP, height: TL_LANE_H,
                borderRadius: 8, cursor: 'grab',
                background: col.bg,
                border: `1px solid ${col.bd}`,
                padding: '5px 10px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                overflow: 'hidden', userSelect: 'none', zIndex: 5,
              }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.50)', lineHeight: 1, marginBottom: 3 }}>{hourToStr(hour)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{t.title}</span>
              <div onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onTResizeStart(t.id, e.clientX) }}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
            </div>
          )
        })}

        {/* ── Drop indicator ── */}
        {dropIndicatorX !== null && cw > 0 && (
          <div style={{ position: 'absolute', left: dropIndicatorX, top: TL_TIME_H, bottom: 0, width: 2, background: 'rgba(76,127,224,0.7)', pointerEvents: 'none', zIndex: 20, boxShadow: '0 0 8px rgba(76,127,224,0.4)' }} />
        )}

        {/* ── Lane 2: extras (외부 드래그 항목) ── */}
        {extras.map((ex, i) => {
          const hour = extraPos[ex.id] ?? (H_START + (todos.length + i) * 1.2)
          const dur  = extraDur[ex.id] ?? 1
          const { x, w } = cardGeom(hour, dur)
          return (
            <div key={ex.id}
              onMouseDown={e => { e.preventDefault(); onExDragStart(ex.id, e.clientX) }}
              style={{ position: 'absolute', left: x, width: w, top: TL_LANE2_TOP, height: TL_LANE_H, borderRadius: 8, cursor: 'grab', background: 'rgba(40,98,130,0.62)', border: '1px solid rgba(70,148,200,0.22)', padding: '5px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', userSelect: 'none', zIndex: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.50)', lineHeight: 1, marginBottom: 3 }}>{hourToStr(hour)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{ex.title}</span>
              {ex.subtitle && <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{ex.subtitle}</span>}
              <div onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onExResizeStart(ex.id, e.clientX) }}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRemoveExtra(ex.id) }}
                style={{ position: 'absolute', right: 12, top: 5, width: 14, height: 14, background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: '50%', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ×
              </button>
            </div>
          )
        })}

        {/* ── Lane 2: 업무 일정 (schedule_items, "일정 추가"로 만든 항목) ── */}
        {scheduleItems.map((s, i) => {
          const hour = siPos[s.id] ?? s.start_hour
          const dur  = siDur[s.id] ?? s.duration_hours
          const { x, w } = cardGeom(hour, dur)
          const col = EV_COLS[(i + 4) % EV_COLS.length]
          return (
            <div key={s.id}
              onMouseDown={e => { e.preventDefault(); onSiDragStart(s.id, e.clientX) }}
              style={{ position: 'absolute', left: x, width: w, top: TL_LANE2_TOP, height: TL_LANE_H, borderRadius: 8, cursor: 'grab', background: col.bg, border: `1px solid ${col.bd}`, padding: '5px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', userSelect: 'none', zIndex: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.50)', lineHeight: 1, marginBottom: 3 }}>{hourToStr(hour)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{s.title}</span>
              <div onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onSiResizeStart(s.id, e.clientX) }}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRemoveScheduleItem(s.id) }}
                style={{ position: 'absolute', right: 12, top: 5, width: 14, height: 14, background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: '50%', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={9} />
              </button>
            </div>
          )
        })}

        {/* Overflow indicators per lane */}
        {mHasOverflow && cw > 0 && (
          <div style={{ position: 'absolute', right: -18, top: TL_LANE2_TOP + TL_LANE_H / 2 - 10, pointerEvents: 'none' }}>
            <span style={{ fontSize: 18, color: TEXT2, opacity: 0.55 }}>›</span>
          </div>
        )}
        {tHasOverflow && cw > 0 && (
          <div style={{ position: 'absolute', right: -18, top: TL_LANE2_TOP + TL_LANE_H / 2 - 10, pointerEvents: 'none' }}>
            <span style={{ fontSize: 18, color: TEXT2, opacity: 0.55 }}>›</span>
          </div>
        )}

      </div>
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
  const [doneTasks,     setDoneTasks]     = useState<string[]>([])
  const [doneAgenda,    setDoneAgenda]    = useState<string[]>([])
  const [doneQuick,     setDoneQuick]     = useState<string[]>([])
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
  const [weekPickerOpen, setWeekPickerOpen] = useState(false)
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
  const stScrollRef = useRef<HTMLDivElement>(null)
  const stColsRef = useRef(stCols)
  stColsRef.current = stCols   // always fresh — reads latest value at drag start

  const [subTasks,      setSubTasks]      = useState<SubTaskWithContext[]>([])
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
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    async function load() {
      const today     = todayStr()
      const yesterday = yesterdayStr()
      const [
        { data: stData }, { data: taskTodoData },
        { data: mData },  { data: mmData }, { data: jData },
        { data: qtData },
      ] = await Promise.all([
        sb.current.from('agenda_sub_tasks').select('*, agenda_items(id, title, agenda_groups(name, color, category)), sub_task_notes(created_at, edited_at, content)').eq('status', 'active').order('sort_order').limit(100),
        // schedule_tag는 배정 시점의 스냅샷이라 자정이 지나도 갱신되지 않음 — target_date를 기준으로 오늘/금주 분류
        sb.current.from('task_todos').select('*, tasks(id, title, short_name, part)').eq('done', false).order('sort_order').limit(60),
        sb.current.from('meetings').select('*').order('meeting_date', { ascending: false }).limit(20),
        sb.current.from('quick_memos').select('*').order('created_at', { ascending: false }).limit(100),
        sb.current.from('daily_journals').select('id, date, content, linked_task_ids, linked_meeting_ids, tags').in('date', [today, yesterday]),
        // 프로젝트/안건에 속하지 않는 즉석 추가 할일 — quick_todos 전용 테이블 (schedule 탭과 공유).
        // 금주 업무 7열이 요일별로 보여주므로 일정 탭과 같이 미완료 전체를 읽고, '오늘'은 화면에서 거른다.
        sb.current.from('quick_todos').select('*').eq('done', false).order('sort_order'),
      ])

      setSubTasks((stData ?? []) as SubTaskWithContext[])
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

  async function toggleTask(id: string) {
    // 체크 시만 완료 처리 (토글 아님 — 취소 불필요)
    setDoneTasks(p => [...p, id])
    await sb.current.from('task_todos').update({ done: true }).eq('id', id)
    // 애니메이션 후 목록에서 제거
    setTimeout(() => setAllTaskTodos(p => p.filter(t => t.id !== id)), 600)
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

  async function toggleQuickTodo(id: string) {
    setDoneQuick(p => [...p, id])
    await sb.current.from('quick_todos').update({ done: true }).eq('id', id)
    setTimeout(() => setQuickTodos(p => p.filter(t => t.id !== id)), 600)
  }

  function removeQuickTodo(id: string) {
    setQuickTodos(p => p.filter(t => t.id !== id))
    sb.current.from('quick_todos').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('즉석 할일 삭제 실패:', error.message) })
  }

  async function completeSubTask(id: string) {
    setDoneAgenda(p => [...p, id])
    await sb.current.from('agenda_sub_tasks').update({ status: 'done' }).eq('id', id)
    setTimeout(() => setSubTasks(p => p.filter(st => st.id !== id)), 600)
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
  const timelineDow       = dowOfDateStr(timelineDate)
  const timelineFixedMeetings = fixedSchedules
    .filter(s => s.is_recurring ? (s.days_of_week ?? []).includes(timelineDow) : s.date === timelineDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  // 고정회의가 기록되면(사전메모 저장 등) 같은 제목의 meeting 레코드가 생겨 Lane 2에 중복 박스로 겹쳐 보이므로 제외
  const timelineFixedTitles = new Set(timelineFixedMeetings.map(s => s.title))
  const timelineMeetings  = meetings.filter(m => m.meeting_date?.startsWith(timelineDate) && !timelineFixedTitles.has(m.title))
  const recentMeetings = meetings.slice(0, 5)

  // task_todos → target_date 기준 분류 (schedule_tag는 배정 시점 스냅샷이라 자정 경과 후에도 안 바뀜 → 신뢰하지 않음)
  const todayQuickTodos = quickTodos.filter(q => q.target_date === today)
  const todayTodos = allTaskTodos.filter(t => t.target_date ? t.target_date === today : t.schedule_tag === 'today')
  const timelineTodos = isTimelineToday ? todayTodos : allTaskTodos.filter(t => t.target_date === timelineDate)
  const meetingsForJournal = meetings.map(m => ({ id: m.id, title: m.title, meeting_date: m.meeting_date ?? undefined }))

  const skel = (n: number) => Array.from({ length: n }, (_, i) => (
    <div key={i} className="h-8 rounded-xl animate-pulse" style={{ background: 'rgba(var(--ink-rgb),0.04)', marginBottom: 6 }} />
  ))
  const dots = ['#7A82D8', '#5E8FBF', '#38BE98', '#C87840']


  // ── 금주 업무 7열 (홈 개편 목업) ─────────────────────────────────────────
  // 새 조회/상태 없음 — 이미 로드한 task_todos / agenda_sub_tasks / quick_todos / 고정회의를
  // 날짜(target_date)로만 재분류한다. 직전주 미완료 = 지난주 월~일 날짜의 미완료(그 이전은 건수만),
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
  let olderOpenCount = 0
  for (const date of [today, wkTomorrow]) {
    const c = weekCol(date)
    if (c < 1 || c > 5) continue
    const dow = dowOfDateStr(date)
    fixedSchedules
      .filter(s => s.is_recurring ? (s.days_of_week ?? []).includes(dow) : s.date === date)
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach(s => weekCols[c].push({ key: `fx_${date}_${s.id}`, kind: 'fixed', title: s.title, meta: s.time, date, fixed: s, fixedKey: date === today ? s.id : `tmr_${s.id}` }))
  }
  for (const t of allTaskTodos) {
    // target_date 없는 구 데이터는 schedule_tag 스냅샷으로 대체 (기존 오늘/금주 분류와 동일한 우선순위)
    const date = t.target_date ?? (t.schedule_tag === 'today' ? today : t.schedule_tag === 'tomorrow' ? wkTomorrow : t.schedule_tag === 'this_week' ? weekDays[4] : null)
    const c = weekCol(date)
    if (c === -2) olderOpenCount++
    if (c >= 0) weekCols[c].push({ key: `td_${t.id}`, kind: 'todo', title: t.title, meta: t.tasks?.short_name ?? t.tasks?.title ?? '', date: date!, todo: t })
  }
  for (const q of quickTodos) {
    const c = weekCol(q.target_date)
    if (c === -2) olderOpenCount++
    if (c >= 0) weekCols[c].push({ key: `qt_${q.id}`, kind: 'quick', title: q.title, meta: '즉석 할 일', date: q.target_date!, quick: q })
  }
  for (const st of subTasks) {
    const c = weekCol(st.target_date)
    if (c === -2) olderOpenCount++
    if (c >= 0) weekCols[c].push({ key: `st_${st.id}`, kind: 'agenda', title: st.title, meta: st.agenda_items?.title ?? '', date: st.target_date!, st })
  }
  weekCols[0].sort((a, b) => a.date.localeCompare(b.date))
  weekCols[6].sort((a, b) => a.date.localeCompare(b.date))
  const shortDate = (d: string) => { const [, m, dd] = d.split('-').map(Number); return `${m}.${String(dd).padStart(2, '0')}` }

  // 하단 50:50 — 퀵메모/진행중 과업 모두 정확히 5행 (같은 invisible grid 공유)
  const BOTTOM_ROWS = 5
  const bottomMemos = memos.slice(0, BOTTOM_ROWS)
  const bottomTasks = sortedSubTasks.slice(0, BOTTOM_ROWS)
  const SHOW_RECENT_MEETINGS = false   // 목업 평가 동안 홈 배치에서 제외 (데이터/컴포넌트는 유지)

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 400, lineHeight: '18px', color: done ? TEXT3 : titleColor, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, letterSpacing: '-0.01em' }}>{title}</p>
          {extra}
        </div>
        {metaText && <p style={{ fontSize: 11.5, lineHeight: '16px', color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metaText}</p>}
      </div>
    )
    const rowStyle: React.CSSProperties = { marginLeft: -6, marginRight: -6, paddingLeft: 6, paddingRight: 6, borderRadius: 6 }
    const rowInner: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0' }
    const hoverBtn: React.CSSProperties = { fontSize: 11, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, whiteSpace: 'nowrap' }

    if (item.kind === 'fixed' && item.fixed) {
      const s = item.fixed, k = item.fixedKey!
      const isToday = item.date === today
      const linked = meetings.find(m => m.title === s.title && m.meeting_date?.startsWith(item.date))
      const prepNotes = notesByMeeting[linked?.id ?? '']?.prep ?? []
      const isOpen = fMemoOpen[k] ?? false
      const text = fMemoTexts[k] ?? ''
      const metaText = [s.time, linked && isToday ? '기록됨' : '', prepNotes.length ? `안건 ${prepNotes.length}` : ''].filter(Boolean).join(' · ')
      return (
        <ListRow key={item.key} style={rowStyle} onClick={() => { if (isToday) goToFixedMeetingToday(s); else router.push(linked ? `/meetings/${linked.id}` : '/meetings') }}>
          <div className="group" style={rowInner}>
            <Repeat2 size={12} strokeWidth={2} style={{ color: TEXT3, marginTop: 3, flexShrink: 0 }} />
            {body(s.title, false, fMemoSaved[k] ? `${s.time} · 저장됨 ✓` : metaText,
              <button type="button" className="opacity-0 group-hover:opacity-100" style={hoverBtn}
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
      const t = item.todo, done = doneTasks.includes(t.id)
      return (
        <ListRow key={item.key} style={rowStyle} draggable
          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `todo_${t.id}`, title: t.title, subtitle: t.tasks?.short_name ?? t.tasks?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}>
          <div style={rowInner}>{check(done, () => toggleTask(t.id))}{body(t.title, done, meta)}</div>
        </ListRow>
      )
    }
    if (item.kind === 'quick' && item.quick) {
      const q = item.quick, done = doneQuick.includes(q.id)
      return (
        <ListRow key={item.key} style={rowStyle}>
          <div className="group" style={rowInner}>
            {check(done, () => toggleQuickTodo(q.id))}
            {body(q.title, done, meta,
              <button type="button" className="opacity-0 group-hover:opacity-100" style={hoverBtn} onClick={() => removeQuickTodo(q.id)}>×</button>)}
          </div>
        </ListRow>
      )
    }
    const st = item.st!, done = doneAgenda.includes(st.id)
    const showPicker = datePickerStId === st.id
    return (
      <ListRow key={item.key} style={rowStyle} draggable
        onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `st_${st.id}`, title: st.title, subtitle: st.agenda_items?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}>
        <div className="group" style={rowInner}>
          {check(done, () => completeSubTask(st.id))}
          {body(st.title, done, meta,
            !showPicker && <button type="button" className="opacity-0 group-hover:opacity-100" style={hoverBtn} onClick={() => setDatePickerStId(st.id)}>날짜</button>)}
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
                    const done = doneTasks.includes(t.id)
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
                    const done = doneQuick.includes(t.id)
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
      <div className="hidden md:flex flex-col h-full overflow-hidden" style={{ background: BG }}>

        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto scrollbar-hide" style={{ paddingBottom: 8 }}>

          {/* Hero — chips left, search right (aligned to same height) */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 14, flexShrink: 0 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: TEXT1, letterSpacing: '-0.03em', lineHeight: 1.2 }}>안녕하세요, 진일님 👋</h1>
              <p style={{ fontSize: 13, color: TEXT2, marginTop: 4, letterSpacing: '-0.01em' }}>오늘도 집중해서 멋진 하루 보내세요.</p>
              {!loading && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  <KpiChip dot="#5B7EC4" label={`오늘 일정 ${todayMeetings.length + (isTimelineToday ? googleEvents.length : 0)}건`} />
                  <KpiChip dot="#7878D8" label={`오늘 업무 ${todayTodos.length + todayQuickTodos.length}건`} />
                  <KpiChip dot="#38BE98" label={`진행중 과업 ${subTasks.length}건`} />
                  <KpiChip dot={todayJournal ? '#38BE98' : '#C86868'} label={todayJournal ? '회고 작성완료' : '회고 미작성'} onClick={() => setShowJournal(true)} />
                </div>
              )}
            </div>
            {/* 바로가기 + 검색바 — flex-end로 칩 행 높이에 맞춤 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 2 }}>
                <ShortcutIcons />
              </div>
              <div
                onClick={() => window.dispatchEvent(new Event('open-global-search'))}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(var(--ink-rgb),0.14)'; el.style.background = 'rgba(var(--ink-rgb),0.07)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(var(--ink-rgb),0.08)'; el.style.background = 'rgba(var(--ink-rgb),0.04)' }}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, width: 380, height: 30, borderRadius: 9, background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid rgba(var(--ink-rgb),0.08)', padding: '0 11px', cursor: 'pointer', transition: 'all 150ms ease' }}
              >
                <Search size={12} style={{ color: 'rgba(var(--ink-rgb),0.28)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'rgba(var(--ink-rgb),0.26)', flex: 1 }}>검색 (과업, 안건, 회의록 등)</span>
                <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.08)', color: 'rgba(var(--ink-rgb),0.24)', fontFamily: 'monospace' }}>⌘K</kbd>
              </div>
            </div>
          </div>

          {/* Row 1: Dual-lane timeline — full width */}
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

          {/* ── 금주 업무 — 하나의 주간 작업면을 7열로 나눈 primary 영역 ── */}
          <section data-home="week" style={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column', marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: TEXT1, letterSpacing: '-0.02em' }}>
                  <CalendarCheck size={15} strokeWidth={2} style={{ color: '#5E8FBF' }} />금주 업무
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
              {weekOffset === 0 && <button type="button" onClick={() => { setQuickAddTitle(''); setWeekAddDate(d => d === today ? null : today) }}
                style={{ fontSize: 12, color: weekAddDate === today ? TEXT2 : TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {weekAddDate === today ? '취소' : '+ 오늘 할 일'}
              </button>}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '0.85fr repeat(5, minmax(0, 1fr)) 0.85fr', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
              {weekCols.map((items, ci) => {
                const secondary = ci === 0 || ci === 6
                const date = secondary ? null : weekDays[ci - 1]
                const isTodayCol = date === today
                const isPast = !!date && date < today
                return (
                  <div key={`h${ci}`} data-week-col={ci} className="group" style={{ gridRow: 1, gridColumn: ci + 1, position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6, height: 34, padding: '0 12px', borderBottom: `1px solid ${DIVIDER}`, borderRight: ci === 0 ? '1px solid rgba(var(--ink-rgb),0.06)' : undefined, borderLeft: ci === 6 ? '1px solid rgba(var(--ink-rgb),0.06)' : undefined, paddingTop: 9 }}>
                    {secondary ? (
                      <span style={{ fontSize: 12, fontWeight: 500, color: TEXT3 }}>{ci === 0 ? '직전주 미완료' : '다음주로 연기'}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13.5, fontWeight: 500, color: isPast ? TEXT3 : TEXT1 }}>{'월화수목금'[ci - 1]}</span>
                        <span style={{ fontSize: 11.5, color: TEXT3, fontVariantNumeric: 'tabular-nums' }}>{shortDate(date!)}</span>
                        {isTodayCol && <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--accent-tint-text)', background: 'rgba(var(--accent-tint-rgb),0.12)', padding: '1px 6px', borderRadius: 4, alignSelf: 'center', marginTop: -9 }}>오늘</span>}
                      </>
                    )}
                    {items.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: TEXT3, opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>{items.length}</span>}
                    {date && (
                      <button type="button" aria-label={`${shortDate(date)}에 할 일 추가`} title={`${shortDate(date)}에 할 일 추가`}
                        onClick={() => { setQuickAddTitle(''); setWeekAddDate(d => d === date ? null : date) }}
                        className={weekAddDate === date ? '' : 'opacity-0 group-hover:opacity-100'}
                        style={{ marginLeft: items.length > 0 ? 4 : 'auto', alignSelf: 'center', marginTop: -9, width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, color: TEXT3, background: weekAddDate === date ? 'rgba(var(--ink-rgb),0.06)' : 'transparent', border: 'none', cursor: 'pointer', padding: 0, transition: 'opacity 120ms ease' }}>+</button>
                    )}
                    {isTodayCol && <div style={{ position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, borderRadius: 1, background: ACCENT }} />}
                  </div>
                )
              })}
              {weekCols.map((items, ci) => {
                const secondary = ci === 0 || ci === 6
                const colDate = secondary ? null : weekDays[ci - 1]
                return (
                  <div key={`b${ci}`} data-week-body={ci} className="scrollbar-hide" style={{ gridRow: 2, gridColumn: ci + 1, minHeight: 0, overflowY: 'auto', padding: '6px 12px 8px', borderRight: ci === 0 ? '1px solid rgba(var(--ink-rgb),0.06)' : undefined, borderLeft: ci === 6 ? '1px solid rgba(var(--ink-rgb),0.06)' : undefined }}>
                    {colDate && weekAddDate === colDate && (
                      <input autoFocus value={quickAddTitle}
                        onChange={e => setQuickAddTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addQuickTodo(colDate); if (e.key === 'Escape') setWeekAddDate(null) }}
                        placeholder={colDate === today ? '오늘 할 일 (Enter)' : `${shortDate(colDate)} 할 일 (Enter)`}
                        style={{ width: '100%', fontSize: 12.5, background: 'transparent', border: `1px solid ${DIVIDER}`, borderRadius: 6, padding: '5px 8px', color: TEXT1, outline: 'none', margin: '2px 0 4px' }} />
                    )}
                    {loading ? skel(2)
                      : items.length === 0 && secondary
                        ? <p style={{ fontSize: 11.5, color: TEXT3, opacity: 0.6, padding: '6px 0' }}>없음</p>
                        : items.map(item => renderWeekItem(item, secondary))}
                    {ci === 0 && !loading && olderOpenCount > 0 && (
                      <p style={{ fontSize: 11.5, color: TEXT3, opacity: 0.75, padding: '8px 0 2px' }}>그 이전 미완료 {olderOpenCount}건</p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── 하단 50:50 — 퀵메모 | 진행중 과업. 한 개의 invisible grid를 공유해 행 높이/기준선 일치 ── */}
          {/* 박스는 각 열 뒤에 까는 배경(음수 margin으로 bleed) — 행 정렬 grid는 하나로 유지 */}
          <section data-home="bottom" style={{
            flexShrink: 0, marginTop: 20, padding: `${BOX_PAD_Y}px ${BOX_PAD_X}px`, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: BOX_PAD_X * 2 + 10,
            gridTemplateRows: `${BOX_TITLE_H}px 40px repeat(${BOTTOM_ROWS}, 36px) auto`,
          }}>
            {[1, 2, 3].map(col => (
              <div key={`box${col}`} aria-hidden style={{ ...cardBase(), transition: 'none', gridColumn: col, gridRow: '1 / -1', margin: `-${BOX_PAD_Y}px -${BOX_PAD_X}px` }} />
            ))}
            {/* row 1: section title — 오늘의 타임라인 헤더와 같은 스타일 */}
            {([[1, '퀵메모', <StickyNote key="i" size={15} strokeWidth={2} style={{ color: '#70B8C4' }} />], [2, '진행중 과업', <Layers key="i" size={15} strokeWidth={2} style={{ color: '#5B7EC4' }} />], [3, '회고', <NotebookPen key="i" size={15} strokeWidth={2} style={{ color: '#C8A050' }} />]] as const).map(([col, label, icon]) => (
              <h2 key={label} style={{ gridRow: 1, gridColumn: col, position: 'relative', display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: TEXT1, letterSpacing: '-0.02em', height: BOX_TITLE_H, paddingBottom: 14, margin: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>{label}
              </h2>
            ))}

            {/* row 2: 같은 첫 row — 메모 입력 trigger(기존 빠른 메모 팝업) ↔ 테이블 헤더 */}
            <button type="button" data-bottom="memo-input" onClick={() => openQuickMemo()}
              style={{ position: 'relative', gridRow: 2, gridColumn: 1, height: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(var(--ink-rgb),0.10)', background: 'rgba(var(--ink-rgb),0.025)', cursor: 'text', textAlign: 'left', transition: 'border-color 150ms ease' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--ink-rgb),0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(var(--ink-rgb),0.10)' }}>
              <span style={{ flex: 1, fontSize: 13, color: TEXT3 }}>메모를 빠르게 남겨보세요</span>
              <kbd style={{ fontSize: 10.5, color: TEXT3, opacity: 0.8, fontFamily: 'inherit' }}>Ctrl+3</kbd>
            </button>
            <div data-bottom="journal-header" style={{ position: 'relative', gridRow: 2, gridColumn: 3, height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px', borderBottom: `1px solid ${DIVIDER}` }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: TEXT2, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(today)}</span>
              <span style={{ fontSize: 11.5, color: todayJournal ? '#38BE98' : TEXT3 }}>{todayJournal ? '작성됨' : '미작성'}</span>
              <button type="button" onClick={async () => { if (jEdits) await saveInlineJournal(); setShowJournal(true) }}
                style={{ marginLeft: 'auto', fontSize: 12, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>전체 편집 ↗</button>
            </div>
            <div data-bottom="task-header" style={{ position: 'relative', gridRow: 2, gridColumn: 2, height: 40, display: 'grid', gridTemplateColumns: BOTTOM_TASK_COLS, alignItems: 'center', columnGap: 12, padding: '0 6px', borderBottom: `1px solid ${DIVIDER}` }}>
              {([['범주', '범주'], ['프로젝트 / 과업', '상세TASK'], ['상태', null], ['마감', '마감']] as const).map(([label, sortKey]) => (
                <button key={label} type="button" disabled={!sortKey} onClick={() => sortKey && toggleSort(sortKey)}
                  style={{ fontSize: 12, fontWeight: 500, color: stSort?.col === sortKey ? TEXT2 : TEXT3, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: sortKey ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  {label}{sortKey && stSort?.col === sortKey ? (stSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>

            {/* rows 3~7: 데이터 5행 — memo N ↔ task N 같은 grid row */}
            {Array.from({ length: BOTTOM_ROWS }, (_, i) => {
              const memo = bottomMemos[i]
              const st = bottomTasks[i]
              const cellBase: React.CSSProperties = { position: 'relative', gridRow: 3 + i, height: 36, borderBottom: `1px solid ${DIVIDER}` }
              const emptyCell: React.CSSProperties = { gridRow: 3 + i, height: 36 }
              const memoTag = memo ? (memo.tag[0] ?? '기타') : ''
              const overdue = !!st && !!(st.target_date ?? st.due_date) && (st.target_date ?? st.due_date)! < today
              return (
                <Fragment key={i}>
                  {loading ? <div style={{ ...emptyCell, gridColumn: 1, paddingTop: 4 }}>{skel(1)}</div>
                    : memo ? (
                      <ListRow onClick={() => setMemoViewId(memo.id)} draggable
                        onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `memo_${memo.id}`, title: memo.title, subtitle: memoTag })); e.dataTransfer.effectAllowed = 'copy' }}
                        style={{ ...cellBase, gridColumn: 1, marginLeft: 0, marginRight: 0, paddingLeft: 6, paddingRight: 6, borderRadius: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: CATEGORY_PALETTE[MEMO_TAG[memoTag] ?? colorKeyFromName(memoTag)].solid, flexShrink: 0, opacity: 0.85 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 400, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memo.title || '(제목 없음)'}</span>
                        <span style={{ fontSize: 11.5, color: TEXT3, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(memo.created_at)}</span>
                      </ListRow>
                    ) : <div style={{ ...emptyCell, gridColumn: 1 }} />}
                  {loading ? <div style={{ ...emptyCell, gridColumn: 2, paddingTop: 4 }}>{skel(1)}</div>
                    : st ? (
                      <Link href={`/subtasks/${st.id}`} style={{ ...cellBase, gridColumn: 2, display: 'block', textDecoration: 'none' }}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `st_${st.id}`, title: st.title, subtitle: st.agenda_items?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}>
                        <ListRow style={{ height: '100%', marginLeft: 0, marginRight: 0, paddingLeft: 6, paddingRight: 6, borderRadius: 0, display: 'grid', gridTemplateColumns: BOTTOM_TASK_COLS, alignItems: 'center', columnGap: 12 }}>
                          <span style={{ fontSize: 11.5, color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.agenda_items?.agenda_groups?.category ?? '—'}</span>
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 400, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{st.title}</span>
                            {st.agenda_items && <span style={{ fontSize: 11.5, color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 2, minWidth: 0 }}>{st.agenda_items.title}</span>}
                          </span>
                          <span style={{ fontSize: 11.5, color: overdue ? '#C86868' : TEXT3, whiteSpace: 'nowrap' }}>{overdue ? '기한 경과' : '진행중'}</span>
                          <span style={{ fontSize: 11.5, color: TEXT3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{(st.target_date ?? st.due_date) ? shortDate((st.target_date ?? st.due_date)!) : '—'}</span>
                        </ListRow>
                      </Link>
                    ) : <div style={{ ...emptyCell, gridColumn: 2 }} />}
                </Fragment>
              )
            })}

            {/* 회고 — 전체 섹션(식사·감사·일반 포함)을 36px 행으로, 5행 높이 안에서 스크롤 */}
            <div className="scrollbar-hide" data-bottom="journal-sections"
              style={{ position: 'relative', gridColumn: 3, gridRow: `3 / ${3 + BOTTOM_ROWS}`, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {(() => {
                const parsed = parseSections(todayJournal?.content ?? '')
                return SECTION_KEYS.map(k => (
                  <label key={k} style={{ height: 36, borderBottom: `1px solid ${DIVIDER}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 6px', cursor: 'text' }}>
                    <span style={{ fontSize: 11.5, color: TEXT3, width: 64, flexShrink: 0, whiteSpace: 'nowrap' }}>{SECTION_META[k].label}</span>
                    <textarea value={jEdits?.[k] ?? parsed[k]} rows={1} disabled={loading}
                      onChange={e => setJEdits(p => ({ ...(p ?? {}), [k]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveInlineJournal() } }}
                      placeholder={k === 'meal' ? '점심: … (줄바꿈 후 저녁: …)' : SECTION_META[k].ph || SECTION_META[k].label}
                      className="scrollbar-hide"
                      style={{ flex: 1, minWidth: 0, height: 20, lineHeight: '20px', fontSize: 13, color: TEXT1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: 0, fontFamily: 'inherit', overflowY: 'auto' }} />
                  </label>
                ))
              })()}
            </div>

            {/* last row: 전체 보기 */}
            <Link href="/memos" style={{ position: 'relative', gridRow: 3 + BOTTOM_ROWS, gridColumn: 1, fontSize: 12, color: TEXT3, textDecoration: 'none', paddingTop: 10, justifySelf: 'start' }}>
              전체 보기 →{memos.length > BOTTOM_ROWS ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{memos.length}건</span> : null}
            </Link>
            <Link href="/project" style={{ position: 'relative', gridRow: 3 + BOTTOM_ROWS, gridColumn: 2, fontSize: 12, color: TEXT3, textDecoration: 'none', paddingTop: 10, justifySelf: 'start' }}>
              전체 보기 →{subTasks.length > BOTTOM_ROWS ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{subTasks.length}건</span> : null}
            </Link>
            <div style={{ position: 'relative', gridRow: 3 + BOTTOM_ROWS, gridColumn: 3, display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10 }}>
              <span style={{ fontSize: 12, color: jMsg.startsWith('저장 실패') ? '#C86868' : jMsg ? '#38BE98' : TEXT3, flex: 1 }}>
                {jMsg || (jEdits ? '수정됨 · Ctrl+Enter 저장' : 'Ctrl+Enter 저장')}
              </span>
              <button type="button" onClick={saveInlineJournal} disabled={!jEdits || jSaving}
                style={{ fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 6, border: `1px solid ${jEdits ? 'rgba(var(--accent-tint-rgb),0.35)' : 'rgba(var(--ink-rgb),0.10)'}`, background: jEdits ? 'rgba(var(--accent-tint-rgb),0.12)' : 'transparent', color: jEdits ? 'var(--accent-tint-text)' : TEXT3, cursor: jEdits ? 'pointer' : 'default' }}>
                {jSaving ? '저장 중…' : '저장'}
              </button>
            </div>
          </section>

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
