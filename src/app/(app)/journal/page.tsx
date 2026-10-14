'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task } from '@/types'
import { JournalFullscreenEditor } from '@/components/home/DailyJournalWidget'
import type { DailyJournal } from '@/components/home/DailyJournalWidget'

interface MeetingMin { id: string; title: string; meeting_date?: string | null }

function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr() { return localDateStr(new Date()) }

function nDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d)
}

function getPrevDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1)
  return localDateStr(dt)
}

function formatDateFull(ds: string) {
  const d = new Date(ds + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

function formatDateShort(ds: string) {
  const d = new Date(ds + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

/** 목록 미리보기 — 원문에서 섹션 제목(## …)과 목록 기호·굵게 표시만 걷어내고, 줄은 ' · '로 이어 붙인다 */
function previewText(s: string) {
  return s.split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^#{1,6}\s/.test(l))
    .map(l => l.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').trim())
    .filter(Boolean)
    .join(' · ')
}

function buildMarkdown(selected: string[], journals: DailyJournal[], tasks: Task[]) {
  const journalMap = new Map(journals.map(j => [j.date, j]))
  const sorted = [...selected].sort()
  const lines: string[] = []
  lines.push(`# 회고 기록 (${sorted[0]} ~ ${sorted[sorted.length - 1]})`)
  lines.push(`> 내보낸 일자 수: ${sorted.length}건`)
  lines.push('')
  for (const ds of sorted) {
    const j = journalMap.get(ds)
    lines.push(`## ${formatDateFull(ds)}`)
    if (!j) {
      lines.push('(기록 없음)')
    } else {
      lines.push(j.content)
      if (j.linked_task_ids.length > 0) {
        lines.push('')
        lines.push('**연결된 업무:**')
        j.linked_task_ids.forEach(id => {
          const t = tasks.find(x => x.id === id)
          if (t) lines.push(`- ${t.title} [${t.status}]`)
        })
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}

function downloadMd(content: string, from: string, to: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `회고_${from}_${to}.md`
  a.click()
  URL.revokeObjectURL(url)
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function ymOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  return ymOf(new Date(y, m - 1 + delta, 1))
}
function lastDayOfYm(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return localDateStr(new Date(y, m, 0))
}
/** 월요일 시작 주의 [월, 일] 날짜 문자열 */
function weekRange(offsetWeeks: number): [string, string] {
  const d = new Date()
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  return [localDateStr(mon), localDateStr(sun)]
}

/* ── 기간 탐색(우측 사이드바) — 상단 기간 필터와 동시에 걸리지 않도록 하나만 활성 ── */
interface Scope { key: string; label: string; from: string; to: string }

/* ── 행 컴포넌트 ── */
function JournalRow({ journal, isFirst, isLast, selectMode, selected, flash, rowRef, onToggleSelect, onOpen, onDelete }: {
  journal: DailyJournal
  isFirst: boolean
  isLast: boolean
  selectMode: boolean
  selected: boolean
  flash: boolean
  rowRef: (el: HTMLDivElement | null) => void
  onToggleSelect: (date: string) => void
  onOpen: (j: DailyJournal) => void
  onDelete: (date: string) => void
}) {
  const preview = previewText(journal.content)
  const d = new Date(journal.date + 'T00:00:00')
  const tags = journal.tags ?? []
  const taskCount = journal.linked_task_ids?.length ?? 0
  const meetingCount = journal.linked_meeting_ids?.length ?? 0
  const meta = [taskCount > 0 && `업무 ${taskCount}`, meetingCount > 0 && `회의 ${meetingCount}`].filter(Boolean).join(' · ')
  const showCheck = selectMode || selected

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={() => (selectMode ? onToggleSelect(journal.date) : onOpen(journal))}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(journal) }}
      className="group relative flex items-stretch cursor-pointer select-none transition-colors duration-150 outline-none hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]"
      style={{
        background: flash || selected ? 'var(--surface-selected)' : undefined,
        borderTop: isFirst ? undefined : '1px solid var(--border-default)',
      }}
      >

      {showCheck && (
        <div className="flex items-start pl-4 pt-[15px]">
          <input type="checkbox" checked={selected} aria-label={`${journal.date} 선택`}
            onChange={() => onToggleSelect(journal.date)}
            onClick={e => e.stopPropagation()}
            className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--accent-primary)]" />
        </div>
      )}

      {/* 날짜 */}
      <div className="flex-shrink-0 w-[68px] sm:w-[76px] pl-4 py-3.5">
        <div className="text-[13px] font-semibold tabular-nums leading-5" style={{ color: 'var(--text-primary)' }}>
          {d.getMonth() + 1}.{String(d.getDate()).padStart(2, '0')}
        </div>
        <div className="text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>{WEEKDAYS[d.getDay()]}요일</div>
      </div>

      {/* 세로 타임라인 + dot */}
      <div className="relative flex-shrink-0 w-5" aria-hidden>
        <div className="absolute left-1/2 -translate-x-1/2 w-px"
          style={{ top: isFirst ? 24 : 0, bottom: isLast ? 'calc(100% - 24px)' : 0, background: 'var(--border-strong)' }} />
        <div className="absolute left-1/2 -translate-x-1/2 w-[7px] h-[7px] rounded-full"
          style={{ top: 21, background: 'var(--accent-primary)', boxShadow: '0 0 0 3px var(--surface-primary)' }} />
      </div>

      {/* 본문 preview — 실제 원문을 그대로 2줄까지 */}
      <div className="flex-1 min-w-0 py-3.5 pl-2 pr-2">
        <p className="text-[13.5px] leading-[1.6] line-clamp-2 break-words" style={{ color: preview ? 'rgba(var(--text-rgb),0.88)' : 'var(--text-muted)' }}>
          {preview || '(내용 없음)'}
        </p>
        {(tags.length > 0 || meta) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {tags.map(t => (
              <span key={t} className="px-1.5 py-px rounded" style={{ background: 'rgba(var(--ink-rgb),0.05)', color: 'var(--text-secondary)' }}>{t}</span>
            ))}
            {meta && <span>{meta}</span>}
          </div>
        )}
      </div>

      {/* 우측: 삭제(hover) + 열기 */}
      <div className="flex-shrink-0 flex items-start gap-1 pr-3 pt-3">
        <button
          onClick={e => { e.stopPropagation(); onDelete(journal.date) }}
          className="text-[11px] px-1.5 py-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-red-400"
          style={{ color: 'var(--text-muted)' }}>
          삭제
        </button>
        <button
          onClick={e => { e.stopPropagation(); onOpen(journal) }}
          aria-label="회고 열기"
          className="w-6 h-6 flex items-center justify-center rounded text-[15px] leading-none transition-colors group-hover:text-[var(--text-primary)]"
          style={{ color: 'var(--text-muted)' }}>
          ›
        </button>
      </div>
    </div>
  )
}

/* ── 우측 사이드바 카드 ── */
function SideCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-4"
      style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center mb-3">
        <h2 className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  )
}

function MiniCalendar({ ym, onMove, journalDates, today, onPickDate, onPickMonth }: {
  ym: string
  onMove: (delta: number) => void
  journalDates: Set<string>
  today: string
  onPickDate: (date: string) => void
  onPickMonth: () => void
}) {
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const days = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = Array(first.getDay()).fill(null)
  for (let i = 1; i <= days; i++) cells.push(`${ym}-${String(i).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)

  const navBtn = 'w-6 h-6 flex items-center justify-center rounded text-[14px] leading-none transition-colors hover:bg-[var(--surface-hover-strong)]'
  return (
    <SideCard
      title="캘린더"
      right={
        <div className="flex items-center gap-0.5">
          <button onClick={() => onMove(-1)} aria-label="이전 달" className={navBtn} style={{ color: 'var(--text-secondary)' }}>‹</button>
          <button onClick={onPickMonth} title="이 달의 기록만 보기"
            className="text-[12px] font-semibold px-1.5 py-0.5 rounded tabular-nums transition-colors hover:bg-[var(--surface-hover-strong)]"
            style={{ color: 'var(--text-primary)' }}>
            {y}. {m}
          </button>
          <button onClick={() => onMove(1)} aria-label="다음 달" className={navBtn} style={{ color: 'var(--text-secondary)' }}>›</button>
        </div>
      }>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className="text-[10.5px] pb-1" style={{ color: i === 0 ? 'rgba(220,90,90,0.75)' : 'var(--text-muted)' }}>{w}</div>
        ))}
        {cells.map((ds, i) => {
          if (!ds) return <div key={`e${i}`} />
          const has = journalDates.has(ds)
          const isToday = ds === today
          return (
            <button key={ds} type="button" disabled={!has} onClick={() => onPickDate(ds)}
              title={has ? `${formatDateShort(ds)} 회고로 이동` : undefined}
              className={`relative h-8 flex flex-col items-center justify-center rounded-md text-[12px] tabular-nums transition-colors ${has ? 'cursor-pointer hover:bg-[var(--surface-hover-strong)]' : 'cursor-default'}`}
              style={{
                color: has ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: has || isToday ? 600 : 400,
                boxShadow: isToday ? 'inset 0 0 0 1px var(--border-strong)' : undefined,
              }}>
              {Number(ds.slice(8))}
              <span className="absolute bottom-[3px] w-1 h-1 rounded-full" style={{ background: has ? 'var(--accent-primary)' : 'transparent' }} />
            </button>
          )
        })}
      </div>
    </SideCard>
  )
}

/* ── 필터 정의 ── */
type FilterRange = 'all' | '7d' | '30d' | '90d'
const RANGES: { key: FilterRange; label: string; days: number }[] = [
  { key: 'all', label: '전체', days: 0 },
  { key: '7d',  label: '최근 7일', days: 7 },
  { key: '30d', label: '최근 30일', days: 30 },
  { key: '90d', label: '최근 90일', days: 90 },
]

const ghostBtn = 'text-[12px] px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap hover:bg-[var(--surface-hover-strong)]'

/* ── 메인 페이지 ── */
export default function JournalPage() {
  const [journals, setJournals]   = useState<DailyJournal[]>([])
  const [tasks, setTasks]         = useState<Task[]>([])
  const [meetings, setMeetings]   = useState<MeetingMin[]>([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [filterRange, setFilterRange] = useState<FilterRange>('all')
  const [scope, setScope] = useState<Scope | null>(null)
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [calYm, setCalYm] = useState(() => ymOf(new Date()))
  const [flashDate, setFlashDate] = useState<string | null>(null)
  const [pendingJump, setPendingJump] = useState<string | null>(null)
  const [editorState, setEditorState] = useState<{
    date: string
    journal: DailyJournal | null
    yesterday: DailyJournal | null
  } | null>(null)
  const datePickerRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const supabase = createClient()
  const today = todayStr()

  useEffect(() => {
    async function load() {
      const [{ data: j }, t, { data: m }] = await Promise.all([
        supabase.from('daily_journals').select('*').order('date', { ascending: false }),
        fetchAllTasks(),
        supabase.from('project_meetings').select('id, title, meeting_date').order('meeting_date', { ascending: false }).limit(100),
      ])
      setJournals((j ?? []) as DailyJournal[])
      setTasks(t)
      setMeetings((m ?? []) as MeetingMin[])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 에디터 열기 */
  function openEditor(date: string, journalData?: DailyJournal) {
    const journal = journalData ?? journals.find(j => j.date === date) ?? null
    const prevDate = getPrevDate(date)
    const yesterday = journals.find(j => j.date === prevDate) ?? null
    setEditorState({ date, journal, yesterday })
  }

  function openNewJournal() {
    openEditor(todayStr())
  }

  function handleEditorSaved(saved: DailyJournal) {
    setJournals(prev => {
      const exists = prev.find(j => j.date === saved.date)
      if (exists) return prev.map(j => j.date === saved.date ? saved : j)
      return [saved, ...prev].sort((a, b) => b.date.localeCompare(a.date))
    })
    setEditorState(null)
  }

  async function deleteJournal(date: string) {
    if (!confirm('회고를 삭제하시겠습니까?')) return
    await supabase.from('daily_journals').delete().eq('date', date)
    setJournals(prev => prev.filter(j => j.date !== date))
    setSelected(prev => { const s = new Set(prev); s.delete(date); return s })
  }

  function toggleSelect(date: string) {
    setSelected(prev => { const s = new Set(prev); s.has(date) ? s.delete(date) : s.add(date); return s })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  function handleDownload() {
    if (selected.size === 0) return
    const sorted = [...selected].sort()
    downloadMd(buildMarkdown(sorted, journals, tasks), sorted[0], sorted[sorted.length - 1])
  }

  function pickRange(key: FilterRange) {
    setFilterRange(key)
    setScope(null)
  }

  function pickScope(next: Scope) {
    setFilterRange('all')
    setScope(prev => (prev?.key === next.key ? null : next))
  }

  /* 캘린더 날짜 → 해당 회고 행으로 이동. 지금 필터에 가려져 있으면 필터를 풀고 이동 */
  function jumpToDate(date: string) {
    const visible = (filterRange === 'all' || date >= nDaysAgo(RANGES.find(r => r.key === filterRange)!.days))
      && (!scope || (date >= scope.from && date <= scope.to))
    if (!visible) { setFilterRange('all'); setScope(null) }
    setCollapsedMonths(prev => { if (!prev.has(date.slice(0, 7))) return prev; const s = new Set(prev); s.delete(date.slice(0, 7)); return s })
    setPendingJump(date)
  }

  const displayed = useMemo(() => {
    let list = journals
    if (filterRange !== 'all') {
      const cutoff = nDaysAgo(RANGES.find(r => r.key === filterRange)!.days)
      list = list.filter(j => j.date >= cutoff)
    }
    if (scope) list = list.filter(j => j.date >= scope.from && j.date <= scope.to)
    return list
  }, [journals, filterRange, scope])

  const monthGroups = useMemo(() => {
    const map = new Map<string, DailyJournal[]>()
    displayed.forEach(j => {
      const ym = j.date.slice(0, 7)
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym)!.push(j)
    })
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [displayed])

  useEffect(() => {
    if (!pendingJump) return
    const el = rowRefs.current.get(pendingJump)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashDate(pendingJump)
    setPendingJump(null)
  }, [pendingJump, displayed, collapsedMonths])

  useEffect(() => {
    if (!flashDate) return
    const t = setTimeout(() => setFlashDate(null), 1600)
    return () => clearTimeout(t)
  }, [flashDate])

  const journalDates = useMemo(() => new Set(journals.map(j => j.date)), [journals])
  const countBetween = (from: string, to: string) => journals.filter(j => j.date >= from && j.date <= to).length

  /* 우측 통계 — 전부 daily_journals 날짜에서 바로 센 값 */
  const calCount = countBetween(`${calYm}-01`, lastDayOfYm(calYm))
  const prevYm = shiftYm(calYm, -1)
  const prevCount = countBetween(`${prevYm}-01`, lastDayOfYm(prevYm))
  const calLatest = journals.find(j => j.date.startsWith(calYm))?.date ?? null
  const thisYm = ymOf(new Date())

  const exploreItems: Scope[] = useMemo(() => {
    const [tw0, tw1] = weekRange(0)
    const [lw0, lw1] = weekRange(-1)
    const lm = shiftYm(thisYm, -1)
    return [
      { key: 'w0', label: '이번 주', from: tw0, to: tw1 },
      { key: 'w-1', label: '지난주', from: lw0, to: lw1 },
      { key: 'm0', label: '이번 달', from: `${thisYm}-01`, to: lastDayOfYm(thisYm) },
      { key: 'm-1', label: '지난달', from: `${lm}-01`, to: lastDayOfYm(lm) },
    ]
  }, [thisYm])

  /* 월별 기록 현황 — 이번 달부터 최근 6개월 (기록 0건인 달도 실제 값으로 표시) */
  const monthlyStats = useMemo(() => {
    const rows = Array.from({ length: 6 }, (_, i) => {
      const ym = shiftYm(thisYm, -i)
      return { ym, count: journals.filter(j => j.date.startsWith(ym)).length }
    })
    const max = Math.max(1, ...rows.map(r => r.count))
    return { rows, max }
  }, [journals, thisYm])

  const allDisplayedSelected = displayed.length > 0 && displayed.every(j => selected.has(j.date))

  function toggleAllDisplayed() {
    const dates = displayed.map(j => j.date)
    if (allDisplayedSelected) {
      setSelected(prev => { const s = new Set(prev); dates.forEach(d => s.delete(d)); return s })
    } else {
      setSelected(prev => { const s = new Set(prev); dates.forEach(d => s.add(d)); return s })
    }
  }

  function toggleMonth(ym: string) {
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(ym) ? s.delete(ym) : s.add(ym); return s })
  }

  if (loading) return (
    <div className="p-6 flex flex-col gap-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-10 animate-pulse rounded-xl" style={{ background: 'rgba(var(--ink-rgb),0.06)' }} />
      ))}
    </div>
  )

  const showSelectBar = selectMode || selected.size > 0

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 풀스크린 에디터 */}
      {editorState && (
        <JournalFullscreenEditor
          selectedDate={editorState.date}
          current={editorState.journal}
          yesterday={editorState.yesterday}
          meetings={meetings}
          supabaseClient={supabase}
          onSaved={handleEditorSaved}
          onClose={() => setEditorState(null)}
        />
      )}

      {/* 헤더: 제목 + 기간 필터 | 총 건수 + 작성 */}
      <div className="flex-shrink-0 pt-1 pb-4 flex items-center gap-x-4 gap-y-3 flex-wrap">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>회고</h1>

        <div className="flex items-center gap-0.5 p-0.5 rounded-lg overflow-x-auto scrollbar-hide max-w-full"
          style={{ background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid var(--border-default)' }}>
          {RANGES.map(r => {
            const on = filterRange === r.key && !scope
            return (
              <button key={r.key} onClick={() => pickRange(r.key)}
                className="text-[12px] px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors"
                style={on
                  ? { background: 'var(--surface-primary)', color: 'var(--accent-text)', boxShadow: 'var(--shadow-card)' }
                  : { color: 'var(--text-secondary)' }}>
                {r.label}
                {r.key !== 'all' && (
                  <span className="ml-1 tabular-nums" style={{ opacity: 0.6 }}>
                    {journals.filter(j => j.date >= nDaysAgo(r.days)).length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] tabular-nums mr-1" style={{ color: 'var(--text-muted)' }}>총 {journals.length}건</span>
          <button onClick={() => openEditor(nDaysAgo(1))} className={ghostBtn} style={{ color: 'var(--text-secondary)' }}>
            어제 회고
          </button>
          <button onClick={() => datePickerRef.current?.showPicker?.()} className={ghostBtn} style={{ color: 'var(--text-secondary)' }}>
            날짜 선택
          </button>
          <input ref={datePickerRef} type="date" max={todayStr()} value=""
            onChange={e => { const v = e.target.value; if (v && v <= todayStr()) openEditor(v) }}
            className="sr-only" tabIndex={-1} aria-hidden />
          <button onClick={openNewJournal}
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90 whitespace-nowrap"
            style={{ background: 'var(--accent-primary)' }}>
            오늘 회고 작성
          </button>
        </div>
      </div>

      {/* 본문: 좌측 월별 타임라인 / 우측 인사이트 (lg 미만은 아래로) */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide lg:overflow-hidden flex flex-col lg:flex-row gap-5">

        {/* ── 좌측 ── */}
        <div className="lg:flex-1 min-w-0 lg:min-h-0 lg:overflow-y-auto scrollbar-hide">
          {/* 보기 상태 줄: 탐색 범위 칩 + 선택 도구 */}
          <div className="flex items-center gap-2 mb-3 min-h-[28px] flex-wrap">
            {scope ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium pl-2.5 pr-1 py-0.5 rounded-md"
                style={{ background: 'var(--surface-selected)', color: 'var(--accent-text)' }}>
                {scope.label} · {formatDateShort(scope.from)} – {formatDateShort(scope.to)}
                <button onClick={() => setScope(null)} aria-label="탐색 범위 해제"
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-[rgba(var(--ink-rgb),0.06)]">×</button>
              </span>
            ) : (
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {filterRange === 'all' ? '전체 기록' : RANGES.find(r => r.key === filterRange)!.label}
              </span>
            )}
            <span className="text-[12px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{displayed.length}건 표시</span>

            <div className="ml-auto flex items-center gap-1">
              {showSelectBar ? (
                <>
                  <span className="text-[12px] tabular-nums mr-1" style={{ color: 'var(--text-secondary)' }}>{selected.size}개 선택</span>
                  {displayed.length > 0 && (
                    <button onClick={toggleAllDisplayed} className={ghostBtn} style={{ color: 'var(--text-secondary)' }}>
                      {allDisplayedSelected ? '전체 해제' : '전체 선택'}
                    </button>
                  )}
                  <button onClick={handleDownload} disabled={selected.size === 0}
                    className={`${ghostBtn} disabled:opacity-40 disabled:pointer-events-none`} style={{ color: 'var(--accent-text)' }}>
                    MD 다운로드
                  </button>
                  <button onClick={exitSelectMode} className={ghostBtn} style={{ color: 'var(--text-secondary)' }}>완료</button>
                </>
              ) : (
                displayed.length > 0 && (
                  <button onClick={() => setSelectMode(true)} className={ghostBtn} style={{ color: 'var(--text-secondary)' }}>선택</button>
                )
              )}
            </div>
          </div>

          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 rounded-xl"
              style={{ border: '1px dashed var(--border-strong)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>기간 내 회고가 없습니다</p>
              <button onClick={openNewJournal} className={ghostBtn} style={{ color: 'var(--text-secondary)' }}>
                오늘 회고 작성
              </button>
            </div>
          ) : (
            <div className="space-y-6 pb-6">
              {monthGroups.map(([ym, items]) => {
                const isCollapsed = collapsedMonths.has(ym)
                const monthSelected = items.filter(j => selected.has(j.date)).length
                return (
                  <div key={ym}>
                    <button onClick={() => toggleMonth(ym)}
                      className="flex items-center gap-2 w-full text-left mb-2 px-1 group">
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {formatMonthLabel(ym)}
                      </span>
                      <span className="text-[12px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{items.length}건</span>
                      {monthSelected > 0 && (
                        <span className="text-[11px] px-1.5 py-px rounded" style={{ background: 'var(--surface-selected)', color: 'var(--accent-text)' }}>
                          {monthSelected}개 선택
                        </span>
                      )}
                      <span className="ml-auto text-[10px] transition-colors group-hover:text-[var(--text-secondary)]" style={{ color: 'var(--text-muted)' }}>
                        {isCollapsed ? '▶' : '▼'}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="rounded-xl overflow-hidden"
                        style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                        {items.map((j, idx) => (
                          <JournalRow
                            key={j.date}
                            journal={j}
                            isFirst={idx === 0}
                            isLast={idx === items.length - 1}
                            selectMode={selectMode}
                            selected={selected.has(j.date)}
                            flash={flashDate === j.date}
                            rowRef={el => { if (el) rowRefs.current.set(j.date, el); else rowRefs.current.delete(j.date) }}
                            onToggleSelect={toggleSelect}
                            onOpen={j => openEditor(j.date, j)}
                            onDelete={deleteJournal}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 우측 인사이트 ── */}
        <aside className="flex-shrink-0 lg:w-[27%] lg:min-w-[264px] lg:max-w-[320px] lg:min-h-0 lg:overflow-y-auto scrollbar-hide pb-6 grid sm:grid-cols-2 lg:flex lg:flex-col gap-3 content-start">
          <MiniCalendar
            ym={calYm}
            onMove={delta => setCalYm(prev => shiftYm(prev, delta))}
            journalDates={journalDates}
            today={today}
            onPickDate={jumpToDate}
            onPickMonth={() => pickScope({ key: `ym:${calYm}`, label: formatMonthLabel(calYm), from: `${calYm}-01`, to: lastDayOfYm(calYm) })}
          />

          <SideCard title={calYm === thisYm ? '이번 달 회고' : `${formatMonthLabel(calYm)} 회고`}>
            <div className="flex items-baseline gap-1">
              <span className="text-[26px] font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>{calCount}</span>
              <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>건</span>
            </div>
            <div className="mt-2.5 space-y-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              {prevCount > 0 && (
                <p>
                  지난달 {prevCount}건
                  {calCount !== prevCount && (
                    <span style={{ color: 'var(--text-muted)' }}> · {calCount > prevCount ? `${calCount - prevCount}건 많음` : `${prevCount - calCount}건 적음`}</span>
                  )}
                  {calCount === prevCount && <span style={{ color: 'var(--text-muted)' }}> · 같음</span>}
                </p>
              )}
              {calLatest && <p>마지막 작성 {formatDateShort(calLatest)}</p>}
              {calCount === 0 && <p style={{ color: 'var(--text-muted)' }}>이 달에는 기록이 없습니다</p>}
            </div>
          </SideCard>

          <SideCard title="기록 탐색">
            <div className="flex flex-col -mx-1.5">
              {exploreItems.map(it => {
                const n = countBetween(it.from, it.to)
                const on = scope?.key === it.key
                return (
                  <button key={it.key} onClick={() => pickScope(it)}
                    className="flex items-center px-1.5 py-1.5 rounded-md text-[12.5px] text-left transition-colors hover:bg-[var(--surface-hover-strong)]"
                    style={on ? { background: 'var(--surface-selected)', color: 'var(--accent-text)', fontWeight: 600 } : { color: 'var(--text-primary)' }}>
                    {it.label}
                    <span className="ml-auto tabular-nums text-[12px]" style={{ color: on ? 'var(--accent-text)' : 'var(--text-muted)' }}>{n}건</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>월별 기록 현황</p>
              <div className="flex flex-col -mx-1.5">
                {monthlyStats.rows.map(({ ym, count }) => {
                  const on = scope?.key === `ym:${ym}`
                  return (
                    <button key={ym} disabled={count === 0}
                      onClick={() => pickScope({ key: `ym:${ym}`, label: formatMonthLabel(ym), from: `${ym}-01`, to: lastDayOfYm(ym) })}
                      className="flex items-center gap-2 px-1.5 py-1 rounded-md text-[12px] text-left transition-colors enabled:hover:bg-[var(--surface-hover-strong)] disabled:cursor-default"
                      style={on ? { background: 'var(--surface-selected)' } : undefined}>
                      <span className="w-[52px] flex-shrink-0 tabular-nums" style={{ color: on ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                        {ym.slice(2, 4)}.{ym.slice(5)}
                      </span>
                      <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ink-rgb),0.05)' }}>
                        <span className="block h-full rounded-full"
                          style={{ width: `${(count / monthlyStats.max) * 100}%`, background: on ? 'var(--accent-primary)' : 'rgba(var(--ink-rgb),0.22)' }} />
                      </span>
                      <span className="w-7 text-right tabular-nums" style={{ color: count ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </SideCard>
        </aside>
      </div>
    </div>
  )
}
