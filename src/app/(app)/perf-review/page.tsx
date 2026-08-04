'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import TiptapEditor from '@/components/TiptapEditor'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Meeting { id: string; title: string; meeting_date: string }
interface CompletedTask { id: string; title: string; part: string | null; type: string | null }
interface CompletedAgendaItem { id: string; title: string; group_name: string; group_color: string }
interface DailyJournal { id: string; date: string; content: string }
interface QuickMemo { id: string; title: string; tag: string | null; created_at: string }
type Mode = 'weekly' | 'monthly'

// ─── Helpers ───────────────────────────────────────────────────────────────
function getWeekStart(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day))
  r.setHours(0, 0, 0, 0)
  return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoWeekNum(d: Date): number {
  const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = tmp.getDay() || 7
  tmp.setDate(tmp.getDate() + 4 - dow)
  const y0 = new Date(tmp.getFullYear(), 0, 1)
  return Math.ceil((((tmp.getTime() - y0.getTime()) / 86400000) + 1) / 7)
}
function weekOfMonth(ws: Date): number { return Math.ceil(ws.getDate() / 7) }
function fmtWeekTitle(ws: Date): string {
  return `${ws.getFullYear()}년 ${ws.getMonth() + 1}월 ${weekOfMonth(ws)}주차`
}
function fmtWeekRange(ws: Date): string {
  const we = addDays(ws, 6)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
  return `${fmt(ws)} ~ ${fmt(we)}`
}
function fmtMonthTitle(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}
function adjMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtDateShort(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[a-z#\d]+;/g, ' ').trim()
}
function parseJournal(html: string): { title: string; preview: string } {
  const paras = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/g) ?? [])
    .map(p => p.replace(/<[^>]*>/g, '').replace(/&[a-z#\d]+;/g, ' ').trim())
    .filter(Boolean)
  return {
    title: (paras[0] ?? '').slice(0, 60) || stripHtml(html).slice(0, 60),
    preview: (paras[1] ?? '').slice(0, 80),
  }
}

// ─── Style tokens ──────────────────────────────────────────────────────────
const S = {
  bg: '#0F1319',
  headerGrad: 'linear-gradient(180deg, rgba(76,127,224,0.07) 0%, rgba(15,19,25,0) 100%)',
  card: 'rgba(255,255,255,0.04)',
  cardRetro: 'rgba(255,255,255,0.03)',
  t1: 'rgba(226,232,240,0.92)',
  t2: 'rgba(226,232,240,0.72)',
  t3: 'rgba(226,232,240,0.45)',
  t4: 'rgba(226,232,240,0.28)',
  accent: '#4C7FE0',
  accentDim: 'rgba(76,127,224,0.15)',
  accentBorder: 'rgba(76,127,224,0.28)',
  r: '14px',
  rowBorder: 'rgba(255,255,255,0.04)',
}

// 회고 완성도(retroFilled 0~3)에 따른 pill 색상
const RETRO_COLORS = [
  'rgba(255,255,255,0.20)',   // 0: 활동 있으나 회고 미작성
  'rgba(125,196,160,0.88)',   // 1/3 — 초록
  'rgba(232,197,71,0.88)',    // 2/3 — 황
  '#4C7FE0',                  // 3/3 — 파랑
]

// ─── WeekPills ─────────────────────────────────────────────────────────────
interface PillsProps {
  weekStart: Date
  journals: DailyJournal[]
  meetings: Meeting[]
  quickMemos: QuickMemo[]
  retroFilled: number  // 0~3: good/bad/next_focus 중 작성된 개수
}
function WeekPills({ weekStart, journals, meetings, quickMemos, retroFilled }: PillsProps) {
  const dayLabels = ['월', '화', '수', '목', '금', '토', '일']
  const today = localDate(new Date())
  const PILL_H = 38
  const activeColor = RETRO_COLORS[retroFilled] ?? RETRO_COLORS[0]

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      {dayLabels.map((label, i) => {
        const date = localDate(addDays(weekStart, i))
        const hasM = meetings.some(m => m.meeting_date === date)
        const hasJ = journals.some(j => j.date === date && stripHtml(j.content ?? '').length > 2)
        const hasQ = quickMemos.some(m => localDate(new Date(m.created_at)) === date)
        const hasActivity = hasM || hasJ || hasQ
        const isToday = date === today

        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9.5, fontWeight: isToday ? 700 : 400, color: isToday ? S.t2 : S.t4 }}>{label}</span>
            <div style={{
              width: 14, height: PILL_H, borderRadius: 8, overflow: 'hidden',
              background: 'rgba(255,255,255,0.07)',
              border: isToday ? `1.5px solid rgba(255,255,255,0.28)` : `1px solid rgba(255,255,255,0.07)`,
              position: 'relative',
            }}>
              {/* 활동 채움: 있으면 100%, 없으면 0% */}
              {hasActivity && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: '100%',
                  background: activeColor,
                  transition: 'background 0.4s',
                }} />
              )}
              {/* 오늘 도트 */}
              {isToday && (
                <div style={{
                  position: 'absolute', bottom: 5, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%',
                  background: hasActivity ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                  zIndex: 2,
                }} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── StatChip ──────────────────────────────────────────────────────────────
function StatChip({ icon, label, count, unit, bg }: {
  icon: string; label: string; count: number | string; unit: string; bg: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px 6px 10px', borderRadius: 22, background: bg }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: S.t2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: S.t1 }}>{count}{unit}</span>
    </div>
  )
}

// ─── SummaryCard ───────────────────────────────────────────────────────────
interface CardProps {
  icon: string; iconBg: string; label: string
  count: number; countUnit: string; loading?: boolean
  open: boolean; onToggle: () => void; children: React.ReactNode
}
function SummaryCard({ icon, iconBg, label, count, countUnit, loading, open, onToggle, children }: CardProps) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: S.card, borderRadius: S.r, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</div>
          {/* 라벨과 카운트 사이 명시적 gap */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: S.t1 }}>{label}</span>
            <span style={{ fontWeight: 400, color: S.t3, fontSize: 12 }}>{loading ? '...' : `${count}${countUnit}`}</span>
          </div>
        </div>
        <span style={{ fontSize: 9, color: S.t4, display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>▲</span>
      </div>
      {open && (
        <div className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderTop: `1px solid rgba(255,255,255,0.055)` }}>
          {children}
        </div>
      )}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ padding: '12px 16px', fontSize: 12, color: S.t4 }}>{text}</div>
}

// ─── Row variants ──────────────────────────────────────────────────────────
function MeetingRow({ date, title }: { date: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${S.rowBorder}` }}>
      <span style={{ width: 32, fontSize: 11, color: S.t4, flexShrink: 0 }}>{fmtDateShort(date)}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: S.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
    </div>
  )
}
function CompletedItemRow({ typeLabel, title, tag, tagBg, tagColor }: { typeLabel: string; title: string; tag: string; tagBg: string; tagColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${S.rowBorder}` }}>
      <span style={{ width: 26, fontSize: 10.5, color: S.t4, flexShrink: 0 }}>{typeLabel}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: S.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: tagBg, color: tagColor, flexShrink: 0 }}>{tag}</span>
    </div>
  )
}
function JournalRow({ date, title, preview }: { date: string; title: string; preview: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${S.rowBorder}` }}>
      <span style={{ width: 32, fontSize: 11, color: S.t4, flexShrink: 0, paddingTop: 2 }}>{fmtDateShort(date)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: S.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || '(내용 없음)'}</div>
        {preview && <div style={{ fontSize: 11, color: S.t4, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>}
      </div>
    </div>
  )
}
function MemoRow({ title, date, tag }: { title: string; date: string; tag: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${S.rowBorder}` }}>
      <span style={{ flex: 1, fontSize: 12.5, color: S.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ fontSize: 11, color: S.t4, flexShrink: 0 }}>{date}</span>
      {tag && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(167,139,250,0.18)', color: 'rgba(167,139,250,0.8)', flexShrink: 0 }}>{tag}</span>}
    </div>
  )
}

// ─── RetroField ────────────────────────────────────────────────────────────
interface RetroFieldProps {
  label: string; dotColor: string; headerBg: string; placeholder: string
  editorKey: string; value: string | null
  onChange: (v: string) => void; saved: boolean
}
function RetroField({ label, dotColor, headerBg, placeholder, editorKey, value, onChange, saved }: RetroFieldProps) {
  function handleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('[contenteditable]')) {
      const ce = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[contenteditable]')
      ce?.focus()
    }
  }
  return (
    <div onClick={handleClick} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: S.cardRetro, borderRadius: S.r, overflow: 'hidden', cursor: 'text' }}>
      <div style={{ background: headerBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 16px 14px', borderBottom: `1px solid rgba(255,255,255,0.06)`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: S.t1 }}>{label}</span>
        </div>
        <span style={{ fontSize: 11, color: saved ? S.t3 : S.t4, fontStyle: saved ? 'normal' : 'italic' }}>
          {saved ? '저장됨' : placeholder}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '2px 16px 6px' }}>
        {value === null
          ? <div style={{ padding: '10px 0', fontSize: 11.5, color: S.t4 }}>불러오는 중...</div>
          : <TiptapEditor key={editorKey} value={value} onChange={onChange} dark hideToolbar minHeight={44} />
        }
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function CompletedTestPage() {
  const supabase = createClient()
  const nowYM = useMemo(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const [mode, setMode] = useState<Mode>('weekly')
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [selectedMonth, setSelectedMonth] = useState<string>(nowYM)
  const [loading, setLoading] = useState(true)

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([])
  const [completedAgenda, setCompletedAgenda] = useState<CompletedAgendaItem[]>([])
  const [journals, setJournals] = useState<DailyJournal[]>([])
  const [quickMemos, setQuickMemos] = useState<QuickMemo[]>([])

  const [good, setGood] = useState<string | null>(null)
  const [bad, setBad] = useState<string | null>(null)
  const [nextFocus, setNextFocus] = useState<string | null>(null)
  const [goodSaved, setGoodSaved] = useState(false)
  const [badSaved, setBadSaved] = useState(false)
  const [nextSaved, setNextSaved] = useState(false)
  const goodRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const badRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [open, setOpen] = useState({ meetings: true, completed: true, memos: true, journals: true })

  // 회고 완성도: good/bad/next_focus 중 실제 내용이 있는 개수 (0~3)
  const retroFilled = useMemo(() => {
    return [good, bad, nextFocus].filter(v => v !== null && stripHtml(v ?? '').length > 2).length
  }, [good, bad, nextFocus])

  const periodKey = useMemo(() => {
    if (mode === 'weekly') return `week_${localDate(weekStart)}`
    return `month_${selectedMonth}`
  }, [mode, weekStart, selectedMonth])

  const { wsISO, weISO, wsDate, weDate } = useMemo(() => {
    if (mode === 'weekly') {
      const we = addDays(weekStart, 7)
      return { wsISO: weekStart.toISOString(), weISO: we.toISOString(), wsDate: localDate(weekStart), weDate: localDate(we) }
    }
    const [y, m] = selectedMonth.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 1)
    return { wsISO: start.toISOString(), weISO: end.toISOString(), wsDate: localDate(start), weDate: localDate(end) }
  }, [mode, weekStart, selectedMonth])

  useEffect(() => {
    setLoading(true)
    setMeetings([]); setCompletedTasks([]); setCompletedAgenda([]); setJournals([]); setQuickMemos([])
    Promise.all([
      supabase.from('meetings').select('id, title, meeting_date').gte('meeting_date', wsDate).lt('meeting_date', weDate).order('meeting_date'),
      supabase.from('tasks').select('id, title, part, type').eq('status', '완료').gte('updated_at', wsISO).lt('updated_at', weISO),
      supabase.from('agenda_items').select('id, title, agenda_groups(name, color)').eq('status', 'done').gte('updated_at', wsISO).lt('updated_at', weISO),
      supabase.from('daily_journals').select('id, date, content').gte('date', wsDate).lt('date', weDate).order('date'),
      supabase.from('quick_memos').select('id, title, tag, created_at').gte('created_at', wsISO).lt('created_at', weISO).order('created_at', { ascending: false }),
    ]).then(([mtgRes, taskRes, agendaRes, journalRes, memoRes]) => {
      setMeetings((mtgRes.data ?? []) as Meeting[])
      setCompletedTasks((taskRes.data ?? []) as CompletedTask[])
      setCompletedAgenda(
        (agendaRes.data ?? []).map((a: { id: string; title: string; agenda_groups: { name: string; color: string }[] | { name: string; color: string } | null }) => {
          const g = Array.isArray(a.agenda_groups) ? a.agenda_groups[0] : a.agenda_groups
          return { id: a.id, title: a.title, group_name: g?.name ?? '', group_color: g?.color ?? '#9CA3AF' }
        })
      )
      setJournals((journalRes.data ?? []) as DailyJournal[])
      setQuickMemos((memoRes.data ?? []) as QuickMemo[])
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsISO, weISO, wsDate, weDate])

  const prevPeriodRef = useRef<{ key: string; type: string } | null>(null)

  useEffect(() => {
    // 주차 이동 시 pending 저장 타이머가 있으면 이전 period로 먼저 flush한 뒤 취소 (안 그러면 마지막 입력이 유실됨)
    const prev = prevPeriodRef.current
    if (prev) {
      if (goodRef.current) { clearTimeout(goodRef.current); if (good != null) supabase.from('period_journals').upsert({ period_key: prev.key, period_type: prev.type, good }) }
      if (badRef.current) { clearTimeout(badRef.current); if (bad != null) supabase.from('period_journals').upsert({ period_key: prev.key, period_type: prev.type, bad }) }
      if (nextRef.current) { clearTimeout(nextRef.current); if (nextFocus != null) supabase.from('period_journals').upsert({ period_key: prev.key, period_type: prev.type, next_focus: nextFocus }) }
    }
    prevPeriodRef.current = { key: periodKey, type: mode === 'weekly' ? 'weekly' : 'monthly' }
    setGood(null); setBad(null); setNextFocus(null)
    setGoodSaved(false); setBadSaved(false); setNextSaved(false)
    supabase.from('period_journals').select('good, bad, next_focus').eq('period_key', periodKey).maybeSingle()
      .then(({ data }) => { setGood(data?.good ?? ''); setBad(data?.bad ?? ''); setNextFocus(data?.next_focus ?? '') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey])

  async function upsertJournal(field: string, value: string) {
    const periodType = mode === 'weekly' ? 'weekly' : 'monthly'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('period_journals').upsert({ period_key: periodKey, period_type: periodType, [field]: value } as any, { onConflict: 'period_key' })
  }

  function handleGoodChange(v: string) {
    setGood(v)
    setGoodSaved(false)
    if (goodRef.current) clearTimeout(goodRef.current)
    goodRef.current = setTimeout(async () => { await upsertJournal('good', v); setGoodSaved(true) }, 300)
  }
  function handleBadChange(v: string) {
    setBad(v)
    setBadSaved(false)
    if (badRef.current) clearTimeout(badRef.current)
    badRef.current = setTimeout(async () => { await upsertJournal('bad', v); setBadSaved(true) }, 300)
  }
  function handleNextChange(v: string) {
    setNextFocus(v)
    setNextSaved(false)
    if (nextRef.current) clearTimeout(nextRef.current)
    nextRef.current = setTimeout(async () => { await upsertJournal('next_focus', v); setNextSaved(true) }, 300)
  }

  function prevPeriod() {
    if (mode === 'weekly') setWeekStart(d => addDays(d, -7))
    else setSelectedMonth(m => adjMonth(m, -1))
  }
  function nextPeriod() {
    if (mode === 'weekly') setWeekStart(d => addDays(d, 7))
    else setSelectedMonth(m => adjMonth(m, 1))
  }
  function toggleSection(k: keyof typeof open) { setOpen(o => ({ ...o, [k]: !o[k] })) }

  const allCompleted = [...completedAgenda, ...completedTasks]
  const filledJournals = journals.filter(j => stripHtml(j.content ?? '').length > 2)
  const wBadge = mode === 'weekly' ? `W${isoWeekNum(weekStart)}` : `${parseInt(selectedMonth.split('-')[1])}월`
  const periodTitle = mode === 'weekly' ? fmtWeekTitle(weekStart) : fmtMonthTitle(selectedMonth)
  const periodRange = mode === 'weekly' ? fmtWeekRange(weekStart) : ''
  const retroLabel = mode === 'weekly' ? '이번 주 회고' : '이번 달 회고'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: S.bg, overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: S.headerGrad, borderBottom: `1px solid rgba(255,255,255,0.07)`, padding: '16px 24px 0' }}>

        {/* 상단 2-column: 좌(타이틀+기간네비) / 우(탭만) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>

          {/* 좌: 타이틀 + 기간 네비 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: S.t1, margin: 0, letterSpacing: '-0.01em' }}>완료성과</h1>
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(251,146,60,0.18)', color: 'rgba(251,146,60,0.82)', letterSpacing: '0.04em' }}>test</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={prevPeriod} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid rgba(255,255,255,0.09)`, background: 'rgba(255,255,255,0.055)', color: S.t3, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, background: S.accentDim, border: `1px solid ${S.accentBorder}`, fontSize: 11, fontWeight: 700, color: S.accent, letterSpacing: '0.04em', flexShrink: 0 }}>{wBadge}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: S.t1, lineHeight: 1.25 }}>{periodTitle}</span>
                  {periodRange && <span style={{ fontSize: 11, color: S.t3, lineHeight: 1.25 }}>{periodRange}</span>}
                </div>
              </div>
              <button onClick={nextPeriod} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid rgba(255,255,255,0.09)`, background: 'rgba(255,255,255,0.055)', color: S.t3, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </div>
          </div>

          {/* 우: 탭만 */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 }}>
            {(['weekly', 'monthly'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: '4px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 11.5, fontWeight: 600,
                background: mode === m ? S.accent : 'transparent',
                color: mode === m ? '#fff' : S.t3,
                transition: 'all 0.15s',
              }}>{m === 'weekly' ? '주간' : '당월'}</button>
            ))}
          </div>
        </div>

        {/* Stat chips + Pills (같은 줄, pills는 우측) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <StatChip icon="📋" label="회의" count={loading ? '–' : meetings.length} unit="" bg="rgba(144,167,216,0.18)" />
            <StatChip icon="✅" label="완료" count={loading ? '–' : allCompleted.length} unit="" bg="rgba(186,222,200,0.18)" />
            <StatChip icon="📓" label="기록" count={loading ? '–' : filledJournals.length} unit="일" bg="rgba(251,191,36,0.16)" />
            <StatChip icon="💬" label="퀵메모" count={loading ? '–' : quickMemos.length} unit="" bg="rgba(167,139,250,0.16)" />
          </div>
          {mode === 'weekly' && (
            <WeekPills
              weekStart={weekStart}
              journals={journals}
              meetings={meetings}
              quickMemos={quickMemos}
              retroFilled={retroFilled}
            />
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '5fr 6fr', gap: 16, padding: '14px 24px 16px', overflow: 'hidden' }}>

        {/* Left: 4분할 (순서: 회의 → 완료 → 퀵메모 → 일일회고) */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: S.t4, letterSpacing: '0.04em', marginBottom: 10, flexShrink: 0 }}>이번 기간 요약</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden' }}>

            {/* 회의 */}
            <SummaryCard icon="📋" iconBg="rgba(144,167,216,0.22)" label="회의" count={meetings.length} countUnit="건" loading={loading} open={open.meetings} onToggle={() => toggleSection('meetings')}>
              {loading ? <EmptyRow text="불러오는 중..." /> :
                meetings.length === 0 ? <EmptyRow text="해당 기간 회의 없음" /> :
                meetings.map(m => <MeetingRow key={m.id} date={m.meeting_date} title={m.title ?? ''} />)
              }
            </SummaryCard>

            {/* 완료 안건/업무 */}
            <SummaryCard icon="✅" iconBg="rgba(186,222,200,0.22)" label="완료 안건 / 업무" count={allCompleted.length} countUnit="건" loading={loading} open={open.completed} onToggle={() => toggleSection('completed')}>
              {loading ? <EmptyRow text="불러오는 중..." /> :
                allCompleted.length === 0 ? <EmptyRow text="해당 기간 완료 항목 없음" /> :
                <>
                  {completedAgenda.map(a => (
                    <CompletedItemRow key={`a_${a.id}`} typeLabel="안건" title={a.title ?? ''} tag="완료" tagBg="rgba(186,222,200,0.25)" tagColor="#7DC4A0" />
                  ))}
                  {completedTasks.map(t => (
                    <CompletedItemRow key={`t_${t.id}`} typeLabel="업무" title={t.title ?? ''} tag={t.part ?? '업무'} tagBg="rgba(144,167,216,0.22)" tagColor="#90A7D8" />
                  ))}
                </>
              }
            </SummaryCard>

            {/* 퀵메모 */}
            <SummaryCard icon="💬" iconBg="rgba(167,139,250,0.2)" label="퀵메모" count={quickMemos.length} countUnit="" loading={loading} open={open.memos} onToggle={() => toggleSection('memos')}>
              {loading ? <EmptyRow text="불러오는 중..." /> :
                quickMemos.length === 0 ? <EmptyRow text="해당 기간 퀵메모 없음" /> :
                quickMemos.map(m => <MemoRow key={m.id} title={m.title ?? ''} date={`${new Date(m.created_at).getMonth() + 1}/${new Date(m.created_at).getDate()}`} tag={m.tag} />)
              }
            </SummaryCard>

            {/* 일일회고 */}
            <SummaryCard icon="📓" iconBg="rgba(251,191,36,0.18)" label="일일회고" count={filledJournals.length} countUnit="일 작성" loading={loading} open={open.journals} onToggle={() => toggleSection('journals')}>
              {loading ? <EmptyRow text="불러오는 중..." /> :
                filledJournals.length === 0 ? <EmptyRow text="해당 기간 기록 없음" /> :
                filledJournals.map(j => {
                  const { title, preview } = parseJournal(j.content ?? '')
                  return <JournalRow key={j.id} date={j.date} title={title} preview={preview} />
                })
              }
            </SummaryCard>

          </div>
        </div>

        {/* Right: Retro */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: S.t4, letterSpacing: '0.04em', marginBottom: 10, flexShrink: 0 }}>{retroLabel}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflow: 'hidden' }}>
            <RetroField label="잘한 것 · 성과" dotColor="#7DC4A0" headerBg="rgba(125,196,160,0.1)" placeholder="이번 주 잘 해낸 일은?" editorKey={`${periodKey}_good`} value={good} onChange={handleGoodChange} saved={goodSaved} />
            <RetroField label="아쉬웠던 것" dotColor="#E8C547" headerBg="rgba(232,197,71,0.09)" placeholder="더 잘할 수 있었던 부분은?" editorKey={`${periodKey}_bad`} value={bad} onChange={handleBadChange} saved={badSaved} />
            <RetroField label={mode === 'weekly' ? '다음 주 이어갈 것' : '다음 달 이어갈 것'} dotColor="#6B9FD4" headerBg="rgba(107,159,212,0.1)" placeholder="다음 기간에 집중할 것은?" editorKey={`${periodKey}_next`} value={nextFocus} onChange={handleNextChange} saved={nextSaved} />
          </div>
        </div>
      </div>
    </div>
  )
}
