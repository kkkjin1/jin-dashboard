'use client'

import { useState, useRef, useEffect, useMemo, Fragment } from 'react'
import { CATEGORY_PALETTE, MEMO_TAG, colorKeyFromName } from '@/lib/categoryColors'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Plus, FileText, Clock, NotebookPen, Layers, CheckSquare, CalendarDays, StickyNote, Repeat2 } from 'lucide-react'
import type { TaskTodo, Meeting, QuickMemo, AgendaSubTask, NoteEntry } from '@/types'
import { JournalFullscreenEditor, type DailyJournal } from '@/components/home/DailyJournalWidget'
import { useUserSetting } from '@/hooks/useUserSetting'
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

// ── Category Colors (고정) ─────────────────────────────────────────────────
const CATEGORY_COLOR: Record<string, string> = {
  '개인': '#83D5B6',
  '코어': '#9DBEF5',
  '비즈': '#B0A8E8',
}

// ── Design Tokens ──────────────────────────────────────────────────────────
const BG      = '#0F1319'   // neutral near-black, barely any hue
const CARD    = '#161B24'   // neutral dark gray, minimal blue tint
const CHOVER  = '#1C1E23'   // neutral hover
const DIVIDER = 'rgba(255,255,255,0.06)'
const TEXT1   = '#E7EAF0'
const TEXT2   = '#98A1B2'
const TEXT3   = '#7B8397'
const ACCENT  = '#4C7FE0'

// Card base style
const cardBase = (accent = false): React.CSSProperties => ({
  background: CARD,
  border: `1px solid rgba(255,255,255,${accent ? '0.13' : '0.10'})`,
  borderRadius: 16,
  boxShadow: '0 2px 12px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3)',
  transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
})
// hover is handled by CSS .dash-card:hover in globals.css (avoids stuck onMouseLeave)

// Mobile keeps previous visual
const SURFACE  = '#171B22'
const MSHADOW  =
  'inset 0 1px 0 rgba(255,255,255,0.06), ' +
  '0 0 0 1px rgba(255,255,255,0.06), ' +
  '0 18px 60px rgba(0,0,0,0.15)'
const MCARD: React.CSSProperties = { background: SURFACE, boxShadow: MSHADOW, borderRadius: 24 }

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  try { return format(parseISO(s), 'M.d (E)', { locale: ko }) } catch { return s }
}
function tagCls(part: string) {
  return part === '비즈'
    ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-[rgba(249,115,22,0.12)] text-[rgba(253,186,116,0.85)]'
    : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-[rgba(91,126,196,0.12)] text-[rgba(147,197,253,0.85)]'
}
function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr()     { return localDateStr(new Date()) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) }

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
function ListRow({ children, style, onClick, draggable, onDragStart }: {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}) {
  const [h, setH] = useState(false)
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      style={{
        borderRadius: 8,
        marginLeft: -10, marginRight: -10,
        paddingLeft: 10, paddingRight: 10,
        background: h ? 'rgba(255,255,255,0.05)' : 'transparent',
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

// ── Timeline constants ─────────────────────────────────────────────────────
const H_START = 9, H_END = 21
const TL_CARD_G    = 10
const TL_TIME_H    = 16
const TL_LANE_H    = 40
const TL_LANE_GAP  = 5
const TL_LANE1_TOP = 22                                   // 회의 lane top
const TL_LANE2_TOP = TL_LANE1_TOP + TL_LANE_H + TL_LANE_GAP  // 업무 lane top
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
        border: `1px solid ${h ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.10)'}`,
        background: h ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        transition: 'all 150ms ease', cursor: onClick ? 'pointer' : 'default', flexShrink: 0,
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: `0 0 6px ${dot}80` }} />
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      {onClick && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1, marginLeft: -2 }}>+</span>}
    </div>
  )
}

// ── DualLaneTimeline ───────────────────────────────────────────────────────
function DualLaneTimeline({ meetings, todos, now, onAdd, fixedMeetings = [] }: {
  meetings: Meeting[]
  todos: TodayTodo[]
  now: Date
  onAdd: (title: string, startHour: number) => Promise<string | null>
  fixedMeetings?: MeetingSchedule[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(0)

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

  // ── Extras (외부에서 드래그된 항목) ────────────────────────────────────
  const [extras,   setExtras]   = useState<TLExtra[]>([])
  const [extraPos, setExtraPos] = useState<Record<string, number>>({})
  const [extraDur, setExtraDur] = useState<Record<string, number>>({})
  const [dropIndicatorX, setDropIndicatorX] = useState<number | null>(null)
  const exDragRef   = useRef<{ id: string; startX: number; startHour: number } | null>(null)
  const exResizeRef = useRef<{ id: string; startX: number; startDur: number } | null>(null)

  useEffect(() => {
    try {
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

  useEffect(() => { try { localStorage.setItem('home_tl_pos', JSON.stringify(mPos)) } catch {} }, [mPos])
  useEffect(() => { try { localStorage.setItem('home_tl_dur', JSON.stringify(mDur)) } catch {} }, [mDur])
  useEffect(() => { try { localStorage.setItem('home_tl_task_pos', JSON.stringify(tPos)) } catch {} }, [tPos])
  useEffect(() => { try { localStorage.setItem('home_tl_task_dur', JSON.stringify(tDur)) } catch {} }, [tDur])
  useEffect(() => { try { localStorage.setItem('home_tl_extras', JSON.stringify(extras)) } catch {} }, [extras])
  useEffect(() => { try { localStorage.setItem('home_tl_extra_pos', JSON.stringify(extraPos)) } catch {} }, [extraPos])
  useEffect(() => { try { localStorage.setItem('home_tl_extra_dur', JSON.stringify(extraDur)) } catch {} }, [extraDur])

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
  const inRange = curH >= H_START && curH <= H_END
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: 'rgba(91,126,196,0.12)', border: '1px solid rgba(91,126,196,0.26)' }}>
            <CalendarDays size={10} strokeWidth={2} style={{ color: '#8DAEE6' }} />
            <span style={{ fontSize: 11, color: '#8DAEE6', fontWeight: 600, letterSpacing: '-0.01em' }}>{format(now, 'M월 d일 (eee)', { locale: ko })}</span>
          </div>
        </div>
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(91,126,196,0.35)', background: 'rgba(91,126,196,0.10)', color: '#8DAEE6', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,126,196,0.18)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(91,126,196,0.5)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,126,196,0.10)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(91,126,196,0.35)' }}
        >
          <Plus size={11} />
          일정 추가
        </button>
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
          <div key={i} style={{ position: 'absolute', left: i * hW, top: TL_TIME_H, bottom: 0, width: 1, background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        ))}

        {/* Lane track backgrounds */}
        {cw > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: TL_LANE1_TOP, height: TL_LANE_H, borderRadius: 5, background: 'rgba(255,255,255,0.018)', pointerEvents: 'none' }} />}
        {cw > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: TL_LANE2_TOP, height: TL_LANE_H, borderRadius: 5, background: 'rgba(255,255,255,0.018)', pointerEvents: 'none' }} />}

        {/* Past overlay */}
        {inRange && cw > 0 && (
          <div style={{ position: 'absolute', left: 0, top: TL_TIME_H, bottom: 0, width: curX, background: 'rgba(0,0,0,0.22)', pointerEvents: 'none' }} />
        )}

        {/* Current time — vertical line */}
        {inRange && cw > 0 && (
          <div style={{ position: 'absolute', left: curX, top: TL_TIME_H, bottom: 0, width: 1.5, background: '#5B7EC4', pointerEvents: 'none', zIndex: 10 }} />
        )}

        {/* Current time — pill badge */}
        {inRange && cw > 0 && (
          <div style={{
            position: 'absolute',
            left: Math.max(0, curX - 22),
            top: 1,
            background: '#5B7EC4',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            pointerEvents: 'none',
            zIndex: 12,
            whiteSpace: 'nowrap',
            letterSpacing: '0.03em',
            boxShadow: '0 0 8px rgba(91,126,196,0.38)',
          }}>
            {hourToStr(curH)}
          </div>
        )}

        {/* ── Lane 1: meetings ── */}
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
                top: TL_LANE1_TOP, height: TL_LANE_H,
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

        {/* ── Lane 1: 고정 회의 ── */}
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
                top: TL_LANE1_TOP, height: TL_LANE_H,
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

        {/* Overflow indicators per lane */}
        {mHasOverflow && cw > 0 && (
          <div style={{ position: 'absolute', right: -18, top: TL_LANE1_TOP + TL_LANE_H / 2 - 10, pointerEvents: 'none' }}>
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [doneTasks,     setDoneTasks]     = useState<string[]>([])
  const [doneAgenda,    setDoneAgenda]    = useState<string[]>([])
  const [showJournal,   setShowJournal]   = useState(false)
  const [memoOpen,      setMemoOpen]      = useState<Record<string, boolean>>({})
  const [memoTexts,     setMemoTexts]     = useState<Record<string, string>>({})
  const [memoSaving,    setMemoSaving]    = useState<Record<string, boolean>>({})
  const [memoSaved,     setMemoSaved]     = useState<Record<string, boolean>>({})
  const [fMemoOpen,     setFMemoOpen]     = useState<Record<string, boolean>>({})
  const [fMemoTexts,    setFMemoTexts]    = useState<Record<string, string>>({})
  const [fMemoSaving,   setFMemoSaving]   = useState<Record<string, boolean>>({})
  const [fMemoSaved,    setFMemoSaved]    = useState<Record<string, boolean>>({})
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [weekFilter,    setWeekFilter]    = useState<'all' | 'tomorrow' | 'week' | 'unscheduled'>('all')
  const [now,           setNow]           = useState(new Date())
  const [stCols,        setStCols]        = useState<[number, number, number, number, number]>([56, 160, 72, 64, 100])
  const [stSort,        setStSort]        = useState<{ col: string; dir: 'asc' | 'desc' } | null>({ col: '업데이트', dir: 'desc' })
  const [stRowH,        setStRowH]        = useState(40)
  const stScrollRef = useRef<HTMLDivElement>(null)
  const stColsRef = useRef(stCols)
  stColsRef.current = stCols   // always fresh — reads latest value at drag start
  const searchInputRef  = useRef<HTMLInputElement>(null)

  const [subTasks,      setSubTasks]      = useState<SubTaskWithContext[]>([])
  const [todayTodos,    setTodayTodos]    = useState<TodayTodo[]>([])
  const [weekTodos,     setWeekTodos]     = useState<TodayTodo[]>([])
  const [meetings,      setMeetings]      = useState<Meeting[]>([])
  const [memos,         setMemos]         = useState<QuickMemo[]>([])
  const [todayJournal,  setTodayJournal]  = useState<DailyJournal | null>(null)
  const [yesterJournal, setYesterJournal] = useState<DailyJournal | null>(null)
  const [loading,       setLoading]       = useState(true)
  const sb = useRef(createClient())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    async function load() {
      const today     = todayStr()
      const yesterday = yesterdayStr()
      const [
        { data: stData }, { data: tdData }, { data: wkData },
        { data: mData },  { data: mmData }, { data: jData },
      ] = await Promise.all([
        sb.current.from('agenda_sub_tasks').select('*, agenda_items(id, title, agenda_groups(name, color, category)), sub_task_notes(created_at, edited_at, content)').eq('status', 'active').order('sort_order').limit(100),
        sb.current.from('task_todos').select('*, tasks(id, title, short_name, part)').eq('schedule_tag', 'today').eq('done', false).order('sort_order').limit(15),
        sb.current.from('task_todos').select('*, tasks(id, title, short_name, part)').in('schedule_tag', ['tomorrow', 'this_week']).eq('done', false).order('sort_order').limit(30),
        sb.current.from('meetings').select('*').order('meeting_date', { ascending: false }).limit(20),
        sb.current.from('quick_memos').select('*').order('created_at', { ascending: false }).limit(100),
        sb.current.from('daily_journals').select('id, date, content, linked_task_ids, linked_meeting_ids, tags').in('date', [today, yesterday]),
      ])

      setSubTasks((stData ?? []) as SubTaskWithContext[])
      setTodayTodos((tdData ?? []) as TodayTodo[])
      setWeekTodos((wkData ?? []) as TodayTodo[])
      setMeetings((mData ?? []) as Meeting[])
      setMemos((mmData ?? []) as QuickMemo[])
      const jList = (jData ?? []) as DailyJournal[]
      setTodayJournal(jList.find(j => j.date === today) ?? null)
      setYesterJournal(jList.find(j => j.date === yesterday) ?? null)
      setLoading(false)
    }
    load()
  }, [])

  // Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
    else setSearchQuery('')
  }, [searchOpen])

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
    const update = () => setStRowH(Math.floor(el.clientHeight / 8))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [subTasks, loading])

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

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const res: { type: string; title: string; href: string }[] = []
    subTasks.forEach(st => {
      if (st.title.toLowerCase().includes(q)) res.push({ type: '세부task', title: st.title, href: `/subtasks/${st.id}` })
    })
    meetings.forEach(m => {
      if (m.title.toLowerCase().includes(q)) res.push({ type: '회의록', title: m.title, href: `/meetings/${m.id}` })
    })
    memos.forEach(m => {
      if ((m.title ?? '').toLowerCase().includes(q)) res.push({ type: '메모', title: m.title ?? '제목 없음', href: `memo:${m.id}` })
    })
    return res.slice(0, 8)
  }, [searchQuery, subTasks, meetings, memos])

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

  function toggleTask(id: string) {
    setDoneTasks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function saveMeetingMemo(meetingId: string) {
    const text = (memoTexts[meetingId] ?? '').trim()
    if (!text) return
    setMemoSaving(p => ({ ...p, [meetingId]: true }))
    const meeting = meetings.find(m => m.id === meetingId)
    const existingNotes = (meeting?.notes ?? []) as NoteEntry[]
    const newNote: NoteEntry = {
      title: '사전 메모',
      content: text,
      created_at: new Date().toISOString(),
      is_prep: true,
    }
    await sb.current.from('meetings').update({ notes: [...existingNotes, newNote] }).eq('id', meetingId)
    setMeetings(prev => prev.map(m =>
      m.id === meetingId ? { ...m, notes: [...(m.notes ?? []), newNote] } : m
    ))
    setMemoTexts(p => ({ ...p, [meetingId]: '' }))
    setMemoSaving(p => ({ ...p, [meetingId]: false }))
    setMemoSaved(p => ({ ...p, [meetingId]: true }))
    setTimeout(() => setMemoSaved(p => ({ ...p, [meetingId]: false })), 2500)
  }

  async function saveFixedMeetingMemo(schedule: MeetingSchedule) {
    const text = (fMemoTexts[schedule.id] ?? '').trim()
    if (!text) return
    setFMemoSaving(p => ({ ...p, [schedule.id]: true }))
    const newNote: NoteEntry = { title: '사전 메모', content: text, created_at: new Date().toISOString(), is_prep: true }
    // 오늘 날짜로 같은 제목의 회의가 이미 있으면 append, 없으면 새로 생성
    const existing = meetings.find(m => m.title === schedule.title && m.meeting_date?.startsWith(today))
    if (existing) {
      const existingNotes = (existing.notes ?? []) as NoteEntry[]
      await sb.current.from('meetings').update({ notes: [...existingNotes, newNote] }).eq('id', existing.id)
      setMeetings(prev => prev.map(m => m.id === existing.id ? { ...m, notes: [...(m.notes ?? []), newNote] } : m))
    } else {
      const { data } = await sb.current.from('meetings').insert({ title: schedule.title, meeting_date: today, notes: [newNote] }).select('*').single()
      if (data) setMeetings(prev => [...prev, data as Meeting])
    }
    setFMemoTexts(p => ({ ...p, [schedule.id]: '' }))
    setFMemoSaving(p => ({ ...p, [schedule.id]: false }))
    setFMemoSaved(p => ({ ...p, [schedule.id]: true }))
    setTimeout(() => setFMemoSaved(p => ({ ...p, [schedule.id]: false })), 2500)
  }

  async function handleAddMeeting(title: string, startHour: number): Promise<string | null> {
    const today = todayStr()
    const { data } = await sb.current.from('meetings').insert({ title, meeting_date: today }).select('id').single()
    if (data) {
      setMeetings(p => [...p, { id: data.id, title, meeting_date: today } as Meeting])
      return data.id
    }
    return null
  }

  const { value: fixedSchedules } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])

  const today          = todayStr()
  const todayMeetings  = meetings.filter(m => m.meeting_date?.startsWith(today))
  const todayDow = now.getDay()
  const todayFixedMeetings = fixedSchedules
    .filter(s => s.is_recurring ? (s.days_of_week ?? []).includes(todayDow) : s.date === today)
    .sort((a, b) => a.time.localeCompare(b.time))
  // 오늘 실제 meeting 레코드가 이미 존재하면 고정 회의 목록에서 제외 (중복 방지)
  const todayFixedMeetingsVisible = todayFixedMeetings.filter(
    s => !meetings.some(m => m.title === s.title && m.meeting_date?.startsWith(today))
  )
  const recentMeetings = meetings.slice(0, 5)
  const _pad = (n: number) => String(n).padStart(2, '0')
  const tomorrowDate = new Date(now); tomorrowDate.setDate(now.getDate() + 1)
  const fridayDate   = new Date(now); fridayDate.setDate(now.getDate() + (5 - now.getDay() + 7) % 7)
  const tomorrowStr  = `${tomorrowDate.getFullYear()}-${_pad(tomorrowDate.getMonth()+1)}-${_pad(tomorrowDate.getDate())}`
  const fridayStr    = `${fridayDate.getFullYear()}-${_pad(fridayDate.getMonth()+1)}-${_pad(fridayDate.getDate())}`

  // agenda_sub_tasks → date-based derived lists
  const todayAgendaItems       = subTasks.filter(st => st.target_date === today)
  const tomorrowAgendaItems    = subTasks.filter(st => st.target_date === tomorrowStr)
  const weekAgendaItems        = subTasks.filter(st => st.target_date && st.target_date > tomorrowStr && st.target_date <= fridayStr)
  const unscheduledAgendaItems = subTasks.filter(st => !st.target_date)
  const futureAgendaItems      = subTasks.filter(st => st.target_date && st.target_date > fridayStr)

  const filteredWeek = weekFilter === 'all'
    ? weekTodos
    : weekFilter === 'tomorrow'
      ? weekTodos.filter(t => t.schedule_tag === 'tomorrow')
      : weekFilter === 'week'
        ? weekTodos.filter(t => t.schedule_tag === 'this_week')
        : []
  const meetingsForJournal = meetings.map(m => ({ id: m.id, title: m.title, meeting_date: m.meeting_date ?? undefined }))

  const skel = (n: number) => Array.from({ length: n }, (_, i) => (
    <div key={i} className="h-8 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', marginBottom: 6 }} />
  ))
  const dots = ['#7A82D8', '#5E8FBF', '#38BE98', '#C87840']


  // Row divider
  function rd(i: number, len: number): React.CSSProperties {
    return i < len - 1 ? { borderBottom: `1px solid ${DIVIDER}` } : {}
  }

  return (
    <div className="font-sans flex flex-col" style={{ height: '100%', background: BG }}>

      {/* ── 모바일 (unchanged) ── */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 pt-5 pb-36 space-y-4">

        <div className="rounded-[20px] p-4" style={MCARD}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>오늘의 할 일</h2>
            <Link href="/tasks" className="text-[11px]" style={{ color: TEXT3 }}>+ 추가</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : todayTodos.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>오늘 할 일이 없어요</p>
              : todayTodos.map((t, i) => {
                  const done = doneTasks.includes(t.id)
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2.5" style={rd(i, todayTodos.length)}>
                      <button onClick={() => toggleTask(t.id)} className="flex-shrink-0 rounded-full border-2 flex items-center justify-center"
                        style={{ width: 18, height: 18, borderColor: done ? '#38BE98' : 'rgba(255,255,255,0.2)', background: done ? '#38BE98' : 'transparent' }}>
                        {done && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium" style={{ color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</p>
                        {t.tasks && <p className="text-[11px]" style={{ color: TEXT2 }}>{t.tasks.short_name ?? t.tasks.title}</p>}
                      </div>
                      {t.tasks && <span className={tagCls(t.tasks.part)}>{t.tasks.part}</span>}
                    </div>
                  )
                })
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
                      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
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
              style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
              <NotebookPen size={18} strokeWidth={1.5} style={{ color: TEXT3 }} />
              <span className="text-[12px]" style={{ color: TEXT3 }}>오늘 회고 작성하기</span>
            </button>
          )}
        </div>

      </div>

      {/* ── 데스크톱 ── */}
      <div className="hidden md:flex flex-col h-full overflow-hidden" style={{ background: BG }}>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* Hero — chips left, search right (aligned to same height) */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 14, flexShrink: 0 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: TEXT1, letterSpacing: '-0.03em', lineHeight: 1.2 }}>안녕하세요, 진일님 👋</h1>
              <p style={{ fontSize: 13, color: TEXT2, marginTop: 4, letterSpacing: '-0.01em' }}>오늘도 집중해서 멋진 하루 보내세요.</p>
              {!loading && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  <KpiChip dot="#5B7EC4" label={`오늘 일정 ${todayMeetings.length}건`} />
                  <KpiChip dot="#7878D8" label={`오늘 업무 ${todayTodos.length}건`} />
                  <KpiChip dot="#38BE98" label={`진행중 과업 ${subTasks.length}건`} />
                  <KpiChip dot={todayJournal ? '#38BE98' : '#C86868'} label={todayJournal ? '회고 작성완료' : '회고 미작성'} onClick={() => setShowJournal(true)} />
                </div>
              )}
            </div>
            {/* Search bar — flex-end aligns it to chip row height */}
            <div
              onClick={() => setSearchOpen(true)}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.14)'; el.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.08)'; el.style.background = 'rgba(255,255,255,0.04)' }}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, width: 380, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0 11px', cursor: 'pointer', transition: 'all 150ms ease' }}
            >
              <Search size={12} style={{ color: 'rgba(255,255,255,0.28)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.26)', flex: 1 }}>검색 (과업, 안건, 회의록 등)</span>
              <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.24)', fontFamily: 'monospace' }}>⌘K</kbd>
            </div>
          </div>

          {/* Row 1: Dual-lane timeline — full width */}
          <DualLaneTimeline meetings={todayMeetings} todos={todayTodos} now={now} onAdd={handleAddMeeting} fixedMeetings={todayFixedMeetingsVisible} />

          {/* Rows 2 + 3 — 단일 3열 그리드, 열 정렬 보장 */}
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1.15fr 0.85fr', columnGap: 12, rowGap: 14 }}>

          {/* Row 2 — display:contents로 자식들이 바깥 그리드 직접 참여 */}
          <div style={{ display: 'contents' }}>

            {/* 진행중 과업 — col 1-2 span */}
            <div style={{
              gridColumn: '1 / 3',
              background: 'transparent',
              padding: '4px 0',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}><Layers size={14} strokeWidth={2} style={{ color: '#5B7EC4' }} /></span>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT1, letterSpacing: '-0.02em' }}>진행중 과업</h2>
                </div>
                <Link href="/project" style={{ fontSize: 11.5, color: TEXT3, textDecoration: 'none', transition: 'color 150ms' }}
                  onMouseEnter={e => ((e.target as HTMLElement).style.color = TEXT2)}
                  onMouseLeave={e => ((e.target as HTMLElement).style.color = TEXT3)}>전체 →</Link>
              </div>
              {/* 컬럼 헤더: 범주 | 안건 | 상세TASK(1fr) | 업데이트 | 업데이트내용 | 마감 */}
              {!loading && subTasks.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `${stCols[0]}px ${stCols[1]}px minmax(44px, 1fr) ${stCols[4]}px ${stCols[2]}px ${stCols[3]}px`, padding: '0 0 6px', borderBottom: `1px solid ${DIVIDER}`, marginBottom: 2, flexShrink: 0, alignItems: 'center' }}>
                  {/* 범주 */}
                  <div style={{ textAlign: 'center' }}>
                    <button onClick={() => toggleSort('범주')} style={{ fontSize: 10, fontWeight: 600, color: stSort?.col === '범주' ? TEXT2 : TEXT3, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0 }}>
                      범주{stSort?.col === '범주' ? <span style={{ fontSize: 9 }}>{stSort.dir === 'asc' ? '↑' : '↓'}</span> : null}
                    </button>
                  </div>
                  {/* 안건: resize ci=0 */}
                  <div style={{ position: 'relative', textAlign: 'center' }}>
                    <div onMouseDown={e => { e.preventDefault(); startStColResize(0, e.clientX) }} style={{ position: 'absolute', left: -4, top: -4, bottom: -4, width: 16, cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 1, pointerEvents: 'none' }} />
                    </div>
                    <button onClick={() => toggleSort('안건')} style={{ fontSize: 10, fontWeight: 600, color: stSort?.col === '안건' ? TEXT2 : TEXT3, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0, paddingLeft: 10 }}>
                      안건{stSort?.col === '안건' ? <span style={{ fontSize: 9 }}>{stSort.dir === 'asc' ? '↑' : '↓'}</span> : null}
                    </button>
                  </div>
                  {/* 상세TASK: resize ci=1 */}
                  <div style={{ position: 'relative', paddingLeft: 10 }}>
                    <div onMouseDown={e => { e.preventDefault(); startStColResize(1, e.clientX) }} style={{ position: 'absolute', left: -4, top: -4, bottom: -4, width: 16, cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 1, pointerEvents: 'none' }} />
                    </div>
                    <button onClick={() => toggleSort('상세TASK')} style={{ fontSize: 10, fontWeight: 600, color: stSort?.col === '상세TASK' ? TEXT2 : TEXT3, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0 }}>
                      상세TASK{stSort?.col === '상세TASK' ? <span style={{ fontSize: 9 }}>{stSort.dir === 'asc' ? '↑' : '↓'}</span> : null}
                    </button>
                  </div>
                  {/* 업데이트 내용: resize ci=2 */}
                  <div style={{ position: 'relative', paddingLeft: 10 }}>
                    <div onMouseDown={e => { e.preventDefault(); startStColResize(2, e.clientX) }} style={{ position: 'absolute', left: -4, top: -4, bottom: -4, width: 16, cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 1, pointerEvents: 'none' }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: TEXT3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>업데이트 내용</span>
                  </div>
                  {/* 업데이트: resize ci=3 */}
                  <div style={{ position: 'relative', textAlign: 'center' }}>
                    <div onMouseDown={e => { e.preventDefault(); startStColResize(3, e.clientX) }} style={{ position: 'absolute', left: -4, top: -4, bottom: -4, width: 16, cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 1, pointerEvents: 'none' }} />
                    </div>
                    <button onClick={() => toggleSort('업데이트')} style={{ fontSize: 10, fontWeight: 600, color: stSort?.col === '업데이트' ? TEXT2 : TEXT3, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0, paddingLeft: 10 }}>
                      업데이트{stSort?.col === '업데이트' ? <span style={{ fontSize: 9 }}>{stSort.dir === 'asc' ? '↑' : '↓'}</span> : null}
                    </button>
                  </div>
                  {/* 마감: resize ci=4 */}
                  <div style={{ position: 'relative', textAlign: 'center' }}>
                    <div onMouseDown={e => { e.preventDefault(); startStColResize(4, e.clientX) }} style={{ position: 'absolute', left: -4, top: -4, bottom: -4, width: 16, cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 1, pointerEvents: 'none' }} />
                    </div>
                    <button onClick={() => toggleSort('마감')} style={{ fontSize: 10, fontWeight: 600, color: stSort?.col === '마감' ? TEXT2 : TEXT3, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0, paddingLeft: 10 }}>
                      마감{stSort?.col === '마감' ? <span style={{ fontSize: 9 }}>{stSort.dir === 'asc' ? '↑' : '↓'}</span> : null}
                    </button>
                  </div>
                </div>
              )}
              <div ref={stScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="scrollbar-hide">
                {loading ? <div>{skel(6)}</div>
                  : subTasks.length === 0
                    ? <EmptyState icon={<Layers size={20} strokeWidth={1.5} />} label="진행 중인 과업이 없습니다." sub="새로운 과업을 시작해보세요." />
                    : sortedSubTasks.map((st, i) => {
                        const gc = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                        return (
                          <Link key={st.id} href={`/subtasks/${st.id}`} style={{ textDecoration: 'none', display: 'block', height: stRowH }}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `st_${st.id}`, title: st.title, subtitle: st.agenda_items?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}>
                            <ListRow style={{ ...rd(i, sortedSubTasks.length), height: '100%', display: 'flex', alignItems: 'center' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: `${stCols[0]}px ${stCols[1]}px minmax(44px, 1fr) ${stCols[4]}px ${stCols[2]}px ${stCols[3]}px`, alignItems: 'center', width: '100%' }}>
                                {/* 범주: 고정 색상 */}
                                <div style={{ textAlign: 'center' }}>
                                  {st.agenda_items?.agenda_groups ? (() => {
                                    const cat = st.agenda_items!.agenda_groups!.category
                                    const cc = CATEGORY_COLOR[cat] ?? gc
                                    return (
                                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: `${cc}28`, color: cc, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {cat}
                                      </span>
                                    )
                                  })() : <span style={{ color: TEXT3, fontSize: 10 }}>—</span>}
                                </div>
                                {/* 안건 */}
                                <div style={{ textAlign: 'center', paddingLeft: 8 }}>
                                  {st.agenda_items ? (
                                    <span style={{ fontSize: 11, fontWeight: 500, color: TEXT2, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {st.agenda_items.title}
                                    </span>
                                  ) : <span style={{ color: TEXT3, fontSize: 10 }}>—</span>}
                                </div>
                                {/* 상세TASK */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, paddingLeft: 10, overflow: 'hidden' }}>
                                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: gc, flexShrink: 0, opacity: 0.9 }} />
                                  <span style={{ fontSize: 13.5, fontWeight: 500, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0', minWidth: 0 }}>{st.title}</span>
                                </div>
                                {/* 업데이트 내용 */}
                                <div style={{ paddingLeft: 10, overflow: 'hidden' }}>
                                  <span style={{ fontSize: 11, color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                    {latestNoteContent(st) || '—'}
                                  </span>
                                </div>
                                {/* 업데이트 */}
                                <div style={{ textAlign: 'center' }}>
                                  <span style={{ fontSize: 11, color: TEXT3, whiteSpace: 'nowrap' }}>
                                    {(() => { try { const d = latestNoteDate(st); return d ? format(parseISO(d), 'yyyy.MM.dd') : '—' } catch { return '—' } })()}
                                  </span>
                                </div>
                                {/* 마감 */}
                                <div style={{ textAlign: 'center' }}>
                                  <span style={{ fontSize: 11, color: TEXT3, whiteSpace: 'nowrap' }}>
                                    {fmtDate(st.target_date ?? st.due_date ?? '') || '—'}
                                  </span>
                                </div>
                              </div>
                            </ListRow>
                          </Link>
                        )
                      })
                }
              </div>
            </div>

            {/* 오늘 업무 */}
            <CardSection title="오늘 업무" link="/tasks" linkLabel="+ 추가" icon={<CheckSquare size={14} strokeWidth={2} style={{ color: '#38BE98' }} />}>
              {loading ? <div>{skel(4)}</div>
                : todayTodos.length === 0 && todayAgendaItems.length === 0 && todayMeetings.length === 0 && todayFixedMeetingsVisible.length === 0
                  ? <EmptyState
                      icon={<CheckSquare size={20} strokeWidth={1.5} />}
                      label="오늘 업무가 비어있어요."
                      sub="여유로운 하루거나, 추가해보세요."
                    />
                  : <>
                      {/* ── 오늘 예정 회의 ── */}
                      {todayMeetings.length > 0 && (
                        <>
                          {todayMeetings.map((m, i) => {
                            const isOpen  = memoOpen[m.id]  ?? false
                            const text    = memoTexts[m.id]  ?? ''
                            const saving  = memoSaving[m.id] ?? false
                            const saved   = memoSaved[m.id]  ?? false
                            const prepNotes = (m.notes ?? []).filter((n: NoteEntry) => n.is_prep)
                            const total   = todayMeetings.length + todayTodos.length + todayAgendaItems.length
                            return (
                              <div key={m.id} style={{ ...rd(i, total), paddingBottom: 2 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0 5px' }}>
                                  <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(91,126,196,0.14)', border: '1px solid rgba(91,126,196,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Clock size={9} strokeWidth={2.5} style={{ color: '#8DAEE6' }} />
                                  </div>
                                  <Link href={`/meetings/${m.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                                    <p style={{ fontSize: 14, fontWeight: 500, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                                  </Link>
                                  {saved ? (
                                    <span style={{ fontSize: 10.5, color: '#38BE98', flexShrink: 0 }}>저장됨 ✓</span>
                                  ) : (
                                    <button
                                      onClick={() => setMemoOpen(p => ({ ...p, [m.id]: !p[m.id] }))}
                                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: `1px solid ${isOpen ? 'rgba(91,126,196,0.35)' : 'rgba(255,255,255,0.08)'}`, background: isOpen ? 'rgba(91,126,196,0.12)' : 'transparent', color: isOpen ? '#8DAEE6' : TEXT3, cursor: 'pointer', flexShrink: 0, transition: 'all 150ms', whiteSpace: 'nowrap' }}
                                    >
                                      {prepNotes.length > 0 ? `안건 ${prepNotes.length}` : '안건'}
                                    </button>
                                  )}
                                </div>
                                {/* 기존 사전메모 미리보기 */}
                                {prepNotes.length > 0 && !isOpen && (
                                  <div style={{ marginLeft: 26, marginBottom: 5 }}>
                                    {prepNotes.slice(-3).map((n: NoteEntry, ni: number) => (
                                      <p key={ni} style={{ fontSize: 11.5, color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.6 }}>· {n.content}</p>
                                    ))}
                                  </div>
                                )}
                                {/* 인라인 메모 입력 (열림 상태) */}
                                {isOpen && (
                                  <div style={{ marginLeft: 26, marginBottom: 7 }}>
                                    {prepNotes.length > 0 && (
                                      <div style={{ marginBottom: 6 }}>
                                        {prepNotes.map((n: NoteEntry, ni: number) => (
                                          <p key={ni} style={{ fontSize: 11.5, color: TEXT3, lineHeight: 1.6 }}>· {n.content}</p>
                                        ))}
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                      <textarea
                                        autoFocus
                                        value={text}
                                        onChange={e => setMemoTexts(p => ({ ...p, [m.id]: e.target.value }))}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveMeetingMemo(m.id) }
                                          if (e.key === 'Escape') setMemoOpen(p => ({ ...p, [m.id]: false }))
                                        }}
                                        placeholder="회의 안건 메모... (Ctrl+Enter 저장)"
                                        rows={2}
                                        style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, padding: '6px 9px', fontSize: 12.5, color: TEXT1, resize: 'none', outline: 'none', lineHeight: 1.55, fontFamily: 'inherit', transition: 'border-color 150ms' }}
                                        onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(91,126,196,0.40)' }}
                                        onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.09)' }}
                                      />
                                      <button
                                        onClick={() => saveMeetingMemo(m.id)}
                                        disabled={!text.trim() || saving}
                                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: text.trim() ? 'rgba(91,126,196,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${text.trim() ? 'rgba(91,126,196,0.35)' : 'rgba(255,255,255,0.07)'}`, color: text.trim() ? '#8DAEE6' : TEXT3, cursor: text.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'all 150ms' }}
                                      >
                                        {saving ? '…' : '저장'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {(todayTodos.length > 0 || todayAgendaItems.length > 0 || todayFixedMeetingsVisible.length > 0) && (
                            <div style={{ borderTop: `1px solid ${DIVIDER}`, margin: '4px 0 6px' }} />
                          )}
                        </>
                      )}
                      {/* ── 고정 회의 ── */}
                      {todayFixedMeetingsVisible.length > 0 && (
                        <>
                          {todayFixedMeetingsVisible.map((s, i) => {
                            const isOpen = fMemoOpen[s.id] ?? false
                            const text   = fMemoTexts[s.id] ?? ''
                            const saving = fMemoSaving[s.id] ?? false
                            const saved  = fMemoSaved[s.id] ?? false
                            const linkedMeeting = meetings.find(m => m.title === s.title && m.meeting_date?.startsWith(today))
                            const prepNotes = ((linkedMeeting?.notes ?? []) as NoteEntry[]).filter(n => n.is_prep)
                            const total = todayFixedMeetingsVisible.length + todayTodos.length + todayAgendaItems.length
                            return (
                              <div key={s.id} style={{ ...rd(i, total), paddingBottom: 2 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0 5px' }}>
                                  <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(56,190,152,0.12)', border: '1px solid rgba(56,190,152,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Repeat2 size={9} strokeWidth={2.5} style={{ color: '#38BE98' }} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 14, fontWeight: 500, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
                                  </div>
                                  <span style={{ fontSize: 11, color: TEXT3, flexShrink: 0, fontVariantNumeric: 'tabular-nums', marginRight: 6 }}>{s.time}</span>
                                  {saved ? (
                                    <span style={{ fontSize: 10.5, color: '#38BE98', flexShrink: 0 }}>저장됨 ✓</span>
                                  ) : (
                                    <button
                                      onClick={() => setFMemoOpen(p => ({ ...p, [s.id]: !p[s.id] }))}
                                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: `1px solid ${isOpen ? 'rgba(56,190,152,0.35)' : 'rgba(255,255,255,0.08)'}`, background: isOpen ? 'rgba(56,190,152,0.12)' : 'transparent', color: isOpen ? '#38BE98' : TEXT3, cursor: 'pointer', flexShrink: 0, transition: 'all 150ms', whiteSpace: 'nowrap' }}
                                    >
                                      {prepNotes.length > 0 ? `안건 ${prepNotes.length}` : '안건'}
                                    </button>
                                  )}
                                </div>
                                {prepNotes.length > 0 && !isOpen && (
                                  <div style={{ marginLeft: 26, marginBottom: 5 }}>
                                    {prepNotes.slice(-3).map((n: NoteEntry, ni: number) => (
                                      <p key={ni} style={{ fontSize: 11.5, color: TEXT3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.6 }}>· {n.content}</p>
                                    ))}
                                  </div>
                                )}
                                {isOpen && (
                                  <div style={{ marginLeft: 26, marginBottom: 7 }}>
                                    {prepNotes.length > 0 && (
                                      <div style={{ marginBottom: 6 }}>
                                        {prepNotes.map((n: NoteEntry, ni: number) => (
                                          <p key={ni} style={{ fontSize: 11.5, color: TEXT3, lineHeight: 1.6 }}>· {n.content}</p>
                                        ))}
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                      <textarea
                                        autoFocus
                                        value={text}
                                        onChange={e => setFMemoTexts(p => ({ ...p, [s.id]: e.target.value }))}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveFixedMeetingMemo(s) }
                                          if (e.key === 'Escape') setFMemoOpen(p => ({ ...p, [s.id]: false }))
                                        }}
                                        placeholder="회의 안건 메모... (Ctrl+Enter 저장)"
                                        rows={2}
                                        style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, padding: '6px 9px', fontSize: 12.5, color: TEXT1, resize: 'none', outline: 'none', lineHeight: 1.55, fontFamily: 'inherit', transition: 'border-color 150ms' }}
                                        onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(56,190,152,0.40)' }}
                                        onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.09)' }}
                                      />
                                      <button
                                        onClick={() => saveFixedMeetingMemo(s)}
                                        disabled={!text.trim() || saving}
                                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: text.trim() ? 'rgba(56,190,152,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${text.trim() ? 'rgba(56,190,152,0.35)' : 'rgba(255,255,255,0.07)'}`, color: text.trim() ? '#38BE98' : TEXT3, cursor: text.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'all 150ms' }}
                                      >
                                        {saving ? '…' : '저장'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {(todayTodos.length > 0 || todayAgendaItems.length > 0) && (
                            <div style={{ borderTop: `1px solid ${DIVIDER}`, margin: '4px 0 6px' }} />
                          )}
                        </>
                      )}
                      {todayTodos.map((t, i) => {
                        const done = doneTasks.includes(t.id)
                        return (
                          <ListRow key={t.id} style={{ ...rd(i, todayTodos.length + todayAgendaItems.length) }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                              <button
                                onClick={() => toggleTask(t.id)}
                                style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${done ? '#38BE98' : 'rgba(255,255,255,0.18)'}`, background: done ? '#38BE98' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 200ms ease-out' }}
                              >
                                {done && <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 14, fontWeight: done ? 400 : 500, color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 200ms' }}>{t.title}</p>
                                {t.tasks && <p style={{ fontSize: 12, color: TEXT3, marginTop: 1 }}>{t.tasks.short_name ?? t.tasks.title}</p>}
                              </div>
                              {t.tasks && <span className={tagCls(t.tasks.part)}>{t.tasks.part}</span>}
                            </div>
                          </ListRow>
                        )
                      })}
                      {todayAgendaItems.map((st, i) => {
                        const done = doneAgenda.includes(st.id)
                        const groupColor = st.agenda_items?.agenda_groups?.color ?? TEXT3
                        const total = todayTodos.length + todayAgendaItems.length
                        const globalIdx = todayTodos.length + i
                        return (
                          <ListRow key={st.id}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `st_${st.id}`, title: st.title, subtitle: st.agenda_items?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}
                            style={{ ...rd(globalIdx, total) }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                              <button
                                onClick={() => setDoneAgenda(p => p.includes(st.id) ? p.filter(x => x !== st.id) : [...p, st.id])}
                                style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${done ? '#38BE98' : 'rgba(255,255,255,0.18)'}`, background: done ? '#38BE98' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 200ms ease-out' }}
                              >
                                {done && <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 14, fontWeight: done ? 400 : 500, color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 200ms' }}>{st.title}</p>
                                {st.agenda_items && <p style={{ fontSize: 12, color: TEXT3, marginTop: 1 }}>{st.agenda_items.title}</p>}
                              </div>
                              <div style={{ width: 6, height: 6, borderRadius: 2, background: groupColor, flexShrink: 0, opacity: 0.85 }} />
                            </div>
                          </ListRow>
                        )
                      })}
                    </>
              }
            </CardSection>

          </div>

          {/* Row 3 — display:contents로 자식들이 바깥 그리드 직접 참여 */}
          <div style={{ display: 'contents' }}>

            {/* 퀵메모 */}
            <CardSection title="퀵메모" link="/memos" linkLabel="전체 →" icon={<StickyNote size={14} strokeWidth={2} style={{ color: '#70B8C4' }} />}>
              {loading ? <div>{skel(4)}</div>
                : memos.length === 0
                  ? <EmptyState
                      icon={<StickyNote size={20} strokeWidth={1.5} />}
                      label="저장된 메모가 없습니다."
                      sub="Ctrl+3으로 빠르게 추가하세요."
                    />
                  : memos.map((memo, i) => {
                      const dotColor = CATEGORY_PALETTE[MEMO_TAG[memo.tag] ?? colorKeyFromName(memo.tag)].solid
                      return (
                        <ListRow key={memo.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `memo_${memo.id}`, title: memo.title, subtitle: memo.tag })); e.dataTransfer.effectAllowed = 'copy' }}
                          onClick={() => { localStorage.setItem('memos_open_id', memo.id); router.push('/memos') }}
                          style={{ ...rd(i, memos.length) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 5px ${dotColor}80` }} />
                            <span style={{ fontSize: 13.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: TEXT1, fontWeight: 500 }}>{memo.title}</span>
                            <span style={{ fontSize: 10.5, color: TEXT3, flexShrink: 0 }}>{fmtDate(memo.created_at)}</span>
                          </div>
                        </ListRow>
                      )
                    })
              }
            </CardSection>

            {/* 최근 회의록 */}
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: dots[i % 4], flexShrink: 0, boxShadow: `0 0 5px ${dots[i % 4]}80` }} />
                            <span style={{ fontSize: 13.5, fontWeight: 500, color: TEXT1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                            <span style={{ fontSize: 10.5, color: TEXT3, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtDate(m.meeting_date)}</span>
                          </div>
                        </ListRow>
                      </Link>
                    ))
              }
            </CardSection>

            {/* 금주 업무 (회고 자리로 이동) */}
            <CardSection
              title="금주 업무"
              icon={<CalendarDays size={14} strokeWidth={2} style={{ color: '#5E8FBF' }} />}
              extra={
                <div style={{ display: 'flex', gap: 3 }}>
                  {([['all','전체'],['tomorrow','내일'],['week','금주'],['unscheduled','미진행']] as const).map(([f, label]) => {
                    const isActive = weekFilter === f
                    return (
                      <button key={f} onClick={() => setWeekFilter(f)}
                        style={{
                          fontSize: 11,
                          padding: '3px 7px',
                          borderRadius: 7,
                          border: `1px solid ${isActive ? 'rgba(91,126,196,0.35)' : 'rgba(255,255,255,0.07)'}`,
                          background: isActive ? 'rgba(91,126,196,0.14)' : 'transparent',
                          color: isActive ? '#8DAEE6' : TEXT3,
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                          fontWeight: isActive ? 600 : 400,
                        }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              }
            >
              {loading ? <div>{skel(4)}</div>
                : (() => {
                    const filtAgenda = weekFilter === 'tomorrow' ? tomorrowAgendaItems
                      : weekFilter === 'week'        ? weekAgendaItems
                      : weekFilter === 'unscheduled' ? unscheduledAgendaItems
                      : [] // 'all' handled separately below
                    const isEmpty = weekFilter === 'all'
                      ? filteredWeek.length === 0 && tomorrowAgendaItems.length === 0 && weekAgendaItems.length === 0 && unscheduledAgendaItems.length === 0 && futureAgendaItems.length === 0
                      : filteredWeek.length === 0 && filtAgenda.length === 0
                    if (isEmpty) return (
                      <EmptyState
                        icon={<CalendarDays size={20} strokeWidth={1.5} />}
                        label={weekFilter === 'all' ? '이번 주 업무가 없습니다.' : weekFilter === 'tomorrow' ? '내일 업무가 없습니다.' : weekFilter === 'week' ? '이번 주 업무가 없습니다.' : '미진행 항목이 없습니다.'}
                      />
                    )
                    // ── 공통 row helpers ──
                    const dotColor = (tag: string | null | undefined) => tag === 'tomorrow' ? '#5E8FBF' : '#7A82D8'
                    function TaskRow({ t, i, len }: { t: TodayTodo; i: number; len: number }) {
                      return (
                        <ListRow
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `todo_${t.id}`, title: t.title, subtitle: t.tasks?.short_name ?? t.tasks?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}
                          style={{ ...rd(i, len) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
                            <div style={{ width: 5, height: 5, borderRadius: 1.5, background: dotColor(t.schedule_tag), flexShrink: 0, opacity: 0.85 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 500, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{t.title}</span>
                              {t.tasks && <span style={{ fontSize: 11, color: TEXT3 }}>{t.tasks.short_name ?? t.tasks.title}</span>}
                            </div>
                          </div>
                        </ListRow>
                      )
                    }
                    function AgendaRow({ st, i, len }: { st: SubTaskWithContext; i: number; len: number }) {
                      const gc = st.agenda_items?.agenda_groups?.color ?? TEXT3
                      return (
                        <ListRow
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('tl-extra', JSON.stringify({ id: `st_${st.id}`, title: st.title, subtitle: st.agenda_items?.title ?? '' })); e.dataTransfer.effectAllowed = 'copy' }}
                          style={{ ...rd(i, len) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
                            <div style={{ width: 5, height: 5, borderRadius: 2, background: gc, flexShrink: 0, opacity: 0.85 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 500, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{st.title}</span>
                              {st.agenda_items && <span style={{ fontSize: 11, color: TEXT3 }}>{st.agenda_items.title}</span>}
                            </div>
                          </div>
                        </ListRow>
                      )
                    }
                    // ── 필터별 뷰 ──
                    if (weekFilter !== 'all') {
                      const combined = [...filteredWeek.map(t => ({ kind: 'task' as const, t })), ...filtAgenda.map(st => ({ kind: 'agenda' as const, st }))]
                      return <>{combined.map((item, i) => item.kind === 'task'
                        ? <TaskRow key={item.t.id} t={item.t} i={i} len={combined.length} />
                        : <AgendaRow key={item.st.id} st={item.st} i={i} len={combined.length} />
                      )}</>
                    }
                    // 'all' — 내일 / 금주 / 미진행 / 이후 grouped
                    const tomorrows = filteredWeek.filter(t => t.schedule_tag === 'tomorrow')
                    const thisWeek  = filteredWeek.filter(t => t.schedule_tag === 'this_week')
                    const allTomorrow = [...tomorrows, ...tomorrowAgendaItems]
                    const allWeek     = [...thisWeek, ...weekAgendaItems]
                    const allUnscheduled = unscheduledAgendaItems
                    // 이후: target_date > fridayStr인 항목을 날짜별로 그룹핑
                    const futureDateKeys = [...new Set(futureAgendaItems.map(st => st.target_date!))].sort()
                    const futureDateGroups = futureDateKeys.map(date => ({
                      date,
                      items: futureAgendaItems.filter(st => st.target_date === date),
                    }))
                    function formatFutureDate(dateStr: string): string {
                      const d = new Date(dateStr + 'T00:00:00')
                      const m = d.getMonth() + 1
                      const day = d.getDate()
                      const dow = ['일','월','화','수','목','금','토'][d.getDay()]
                      return `${m}/${day} (${dow})`
                    }
                    function GroupLabel({ color, label }: { color: string; label: string }) {
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 6, padding: '2px 8px', borderRadius: 999, background: `${color}14`, border: `1px solid ${color}2A` }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
                          <span style={{ fontSize: 10.5, fontWeight: 600, color, letterSpacing: '0.01em' }}>{label}</span>
                        </div>
                      )
                    }
                    return (
                      <>
                        {allTomorrow.length > 0 && (
                          <>
                            <GroupLabel color="#5E8FBF" label="내일" />
                            {allTomorrow.map((item, i) => 'schedule_tag' in item
                              ? <TaskRow key={item.id} t={item as TodayTodo} i={i} len={allTomorrow.length} />
                              : <AgendaRow key={item.id} st={item as SubTaskWithContext} i={i} len={allTomorrow.length} />
                            )}
                          </>
                        )}
                        {allTomorrow.length > 0 && allWeek.length > 0 && (
                          <div style={{ borderTop: `1px solid ${DIVIDER}`, margin: '10px 0 8px' }} />
                        )}
                        {allWeek.length > 0 && (
                          <>
                            <GroupLabel color="#7A82D8" label="금주" />
                            {allWeek.map((item, i) => 'schedule_tag' in item
                              ? <TaskRow key={item.id} t={item as TodayTodo} i={i} len={allWeek.length} />
                              : <AgendaRow key={item.id} st={item as SubTaskWithContext} i={i} len={allWeek.length} />
                            )}
                          </>
                        )}
                        {allUnscheduled.length > 0 && (allTomorrow.length > 0 || allWeek.length > 0) && (
                          <div style={{ borderTop: `1px solid ${DIVIDER}`, margin: '10px 0 8px' }} />
                        )}
                        {allUnscheduled.length > 0 && (
                          <>
                            <GroupLabel color="#C87840" label="미진행" />
                            {allUnscheduled.map((st, i) => <AgendaRow key={st.id} st={st} i={i} len={allUnscheduled.length} />)}
                          </>
                        )}
                        {futureDateGroups.map(({ date, items }, gi) => {
                          const priorHasItems = allTomorrow.length > 0 || allWeek.length > 0 || allUnscheduled.length > 0
                          return (
                            <Fragment key={date}>
                              {(priorHasItems || gi > 0) && (
                                <div style={{ borderTop: `1px solid ${DIVIDER}`, margin: '10px 0 8px' }} />
                              )}
                              <GroupLabel color="#6B7A9F" label={formatFutureDate(date)} />
                              {items.map((st, i) => <AgendaRow key={st.id} st={st} i={i} len={items.length} />)}
                            </Fragment>
                          )
                        })}
                      </>
                    )
                  })()
              }
            </CardSection>

          </div>
          </div>{/* end rows wrapper */}
        </div>
      </div>

      {/* 검색 모달 */}
      {searchOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg mx-4 overflow-hidden"
            style={{ background: '#22232A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Search size={14} style={{ color: TEXT2, opacity: 0.75 }} className="flex-shrink-0" />
              <input ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="과업, 회의록, 메모 검색..."
                className="flex-1 bg-transparent focus:outline-none"
                style={{ fontSize: 14, color: TEXT1 }} />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ fontSize: 11, color: TEXT3 }}>지우기</button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {searchQuery.trim() === '' ? (
                <p className="px-4 py-6 text-center" style={{ fontSize: 13, color: TEXT3 }}>검색어를 입력하세요</p>
              ) : searchResults.length === 0 ? (
                <p className="px-4 py-6 text-center" style={{ fontSize: 13, color: TEXT3 }}>검색 결과가 없어요</p>
              ) : (
                <div className="py-1">
                  {searchResults.map((r, i) => (
                    <button key={i}
                      onClick={() => {
                        if (r.href.startsWith('memo:')) {
                          localStorage.setItem('memos_open_id', r.href.slice(5))
                          router.push('/memos')
                        } else {
                          router.push(r.href)
                        }
                        setSearchOpen(false)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                      style={{ transition: 'background 180ms', borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: r.type === '세부task' ? 'rgba(99,102,241,0.18)' : r.type === '회의록' ? 'rgba(52,211,153,0.14)' : 'rgba(251,146,60,0.14)', color: r.type === '세부task' ? '#A5B4FC' : r.type === '회의록' ? '#6EE7B7' : '#FED7AA' }}>
                        {r.type}
                      </span>
                      <span style={{ fontSize: 13, color: TEXT1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
          onSaved={(j) => { setTodayJournal(j); setShowJournal(false) }}
          onClose={() => setShowJournal(false)}
        />,
        document.body
      )}

    </div>
  )
}
