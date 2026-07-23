'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Plus, FileText, Clock, NotebookPen } from 'lucide-react'
import type { TaskTodo, Meeting, QuickMemo, AgendaSubTask } from '@/types'
import { JournalFullscreenEditor, type DailyJournal } from '@/components/home/DailyJournalWidget'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────────────
type TodayTodo = Omit<TaskTodo, 'tasks'> & {
  tasks: { id: string; title: string; short_name: string | null; part: string } | null
}
type SubTaskWithContext = AgendaSubTask & {
  agenda_items: { id: string; title: string; agenda_groups: { name: string; color: string } | null } | null
}

// ── Design Tokens ──────────────────────────────────────────────────────────
const BG       = '#17181B'
const CARD     = '#202126'
const BORDER   = 'rgba(255,255,255,0.06)'
const DIVIDER  = 'rgba(255,255,255,0.05)'
const TEXT1    = 'rgba(226,232,240,0.92)'
const TEXT2    = 'rgba(226,232,240,0.55)'
const TEXT3    = 'rgba(226,232,240,0.28)'

// Mobile keeps previous visual
const SURFACE  = '#26282E'
const MSHADOW  =
  'inset 0 1px 0 rgba(255,255,255,0.06), ' +
  '0 0 0 1px rgba(255,255,255,0.06), ' +
  '0 18px 60px rgba(0,0,0,0.15)'
const MCARD: React.CSSProperties = { background: SURFACE, boxShadow: MSHADOW, borderRadius: 24 }

const CS: React.CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20 }

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  try { return format(parseISO(s), 'M.d (E)', { locale: ko }) } catch { return s }
}
function tagCls(part: string) {
  return part === '비즈'
    ? 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(249,115,22,0.15)] text-[#FDBA74]'
    : 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(59,130,246,0.15)] text-[#93C5FD]'
}
function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr()     { return localDateStr(new Date()) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) }

// ── Timeline Component ─────────────────────────────────────────────────────
const H_START = 9, H_END = 21, H_W = 96

function TimelineRow({ meetings, now }: { meetings: Meeting[]; now: Date }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hours = Array.from({ length: H_END - H_START + 1 }, (_, i) => H_START + i)
  const curH  = now.getHours() + now.getMinutes() / 60
  const inRange = curH >= H_START && curH <= H_END
  const curX  = Math.max(0, Math.min((H_END - H_START) * H_W, (curH - H_START) * H_W))

  useEffect(() => {
    if (scrollRef.current && inRange) scrollRef.current.scrollLeft = Math.max(0, curX - 280)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const EC = [
    { bg: 'rgba(79,130,230,0.12)',  bd: 'rgba(79,130,230,0.25)',  tx: 'rgba(147,197,253,0.9)' },
    { bg: 'rgba(52,211,153,0.10)',  bd: 'rgba(52,211,153,0.22)',  tx: 'rgba(110,231,183,0.9)' },
    { bg: 'rgba(251,146,60,0.10)',  bd: 'rgba(251,146,60,0.22)',  tx: 'rgba(253,186,116,0.9)' },
    { bg: 'rgba(167,139,250,0.10)', bd: 'rgba(167,139,250,0.22)', tx: 'rgba(196,181,253,0.9)' },
  ]

  return (
    <div style={{ ...CS, height: 184, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px 0' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT1 }}>오늘의 타임라인</span>
        <span style={{ fontSize: 12, color: TEXT3 }}>{format(now, 'M월 d일 (eee)', { locale: ko })}</span>
      </div>
      <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', height: 142, marginTop: 8, scrollbarWidth: 'none' }}>
        <div style={{ position: 'relative', width: (H_END - H_START) * H_W + 40, height: '100%', minHeight: 130 }}>

          {/* Hour labels */}
          {hours.map(h => (
            <span key={h} style={{ position: 'absolute', left: (h - H_START) * H_W + 4, top: 2, fontSize: 11, color: TEXT3, userSelect: 'none' }}>
              {h}:00
            </span>
          ))}

          {/* Grid lines */}
          {hours.map(h => (
            <div key={h} style={{ position: 'absolute', left: (h - H_START) * H_W, top: 0, bottom: 0, width: 1, background: DIVIDER }} />
          ))}

          {/* Past overlay */}
          {inRange && (
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: curX, background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }} />
          )}

          {/* Meeting events (spread evenly — no time data available) */}
          {meetings.map((m, i) => {
            const c = EC[i % 4]
            return (
              <Link key={m.id} href={`/meetings/${m.id}`}
                style={{ position: 'absolute', left: 8 + i * 130, top: 26, width: 118, height: 76, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 10, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 2, textDecoration: 'none', transition: 'background 180ms' }}>
                <span className="line-clamp-2" style={{ fontSize: 11, fontWeight: 600, color: c.tx, lineHeight: 1.4 }}>{m.title}</span>
                {m.category && <span style={{ fontSize: 10, color: TEXT3, marginTop: 'auto' }}>{m.category}</span>}
              </Link>
            )
          })}

          {meetings.length === 0 && (
            <p style={{ position: 'absolute', top: 62, left: 0, right: 40, textAlign: 'center', fontSize: 13, color: TEXT3 }}>오늘 일정 없음</p>
          )}

          {/* Current time indicator */}
          {inRange && <>
            <div style={{ position: 'absolute', left: curX, top: 0, bottom: 0, width: 1.5, background: '#4F8DFF', zIndex: 10 }} />
            <div style={{ position: 'absolute', left: curX - 3.5, top: 18, width: 8, height: 8, borderRadius: '50%', background: '#4F8DFF', zIndex: 10 }} />
          </>}

        </div>
      </div>
    </div>
  )
}

// ── Card Section ───────────────────────────────────────────────────────────
function CardSection({ title, link, linkLabel, children, extra }: {
  title: string
  link?: string
  linkLabel?: string
  children: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div style={{ ...CS, padding: 22, display: 'flex', flexDirection: 'column', minHeight: 200, maxHeight: 284 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT1 }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {extra}
          {link && (
            <Link href={link} style={{ fontSize: 12, color: TEXT3, textDecoration: 'none' }}>{linkLabel ?? '전체 →'}</Link>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="scrollbar-hide">
        {children}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [doneTasks,     setDoneTasks]     = useState<string[]>([])
  const [showJournal,   setShowJournal]   = useState(false)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [weekFilter,    setWeekFilter]    = useState<'all' | 'tomorrow' | 'this_week'>('all')
  const [now,           setNow]           = useState(new Date())
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

  // Clock tick every minute for timeline
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
        sb.current.from('agenda_sub_tasks').select('*, agenda_items(id, title, agenda_groups(name, color))').eq('status', 'active').order('sort_order').limit(20),
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

  function toggleTask(id: string) {
    setDoneTasks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  const today          = todayStr()
  const todayMeetings  = meetings.filter(m => m.meeting_date?.startsWith(today))
  const recentMeetings = meetings.slice(0, 4)
  const filteredWeek   = weekFilter === 'all' ? weekTodos : weekTodos.filter(t => t.schedule_tag === weekFilter)
  const meetingsForJournal = meetings.map(m => ({ id: m.id, title: m.title, meeting_date: m.meeting_date ?? undefined }))

  const skel = (n: number) => Array.from({ length: n }, (_, i) => (
    <div key={i} className="h-7 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
  ))
  const dots = ['#818CF8', '#60A5FA', '#34D399', '#FB923C']

  // ── Shared row item divider helper
  function rowDivider(i: number, len: number) {
    return i < len - 1 ? `1px solid ${DIVIDER}` : 'none'
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
                    <div key={t.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: rowDivider(i, todayTodos.length) }}>
                      <button onClick={() => toggleTask(t.id)} className="flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all"
                        style={{ width: 18, height: 18, borderColor: done ? '#34D399' : 'rgba(255,255,255,0.2)', background: done ? '#34D399' : 'transparent' }}>
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
                  const groupColor = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                  return (
                    <Link key={st.id} href={`/subtasks/${st.id}`}>
                      <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: rowDivider(i, subTasks.length) }}>
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: groupColor }} />
                        <span className="text-[13px] font-medium flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{st.title}</span>
                        {st.agenda_items && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 truncate max-w-[100px]"
                            style={{ background: `${groupColor}33`, color: groupColor }}>
                            {st.agenda_items.title}
                          </span>
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
                  <div key={m.id} className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: rowDivider(i, todayMeetings.length) }}>
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
                    <div className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: rowDivider(i, recentMeetings.length) }}>
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
                    className="flex items-center gap-2.5 py-2.5 cursor-pointer" style={{ borderBottom: rowDivider(i, Math.min(memos.length, 6)) }}>
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
            {todayJournal && (
              <button onClick={() => setShowJournal(true)} className="text-[11px]" style={{ color: TEXT3 }}>수정</button>
            )}
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
      <div className="hidden md:flex flex-col flex-1 min-h-0">

        {/* Topbar: search only */}
        <div className="flex-shrink-0 flex items-center justify-center h-12 px-8" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2.5 px-4 py-1.5 rounded-2xl w-full max-w-sm cursor-pointer"
            style={{ background: '#1A1C1F', border: `1px solid ${BORDER}`, transition: 'background 180ms' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#1e2024')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#1A1C1F')}
          >
            <Search size={12} style={{ color: TEXT2 }} className="flex-shrink-0" />
            <span className="text-[13px] flex-1" style={{ color: TEXT3 }}>검색 (과업, 안건, 회의록 등)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono" style={{ background: 'rgba(255,255,255,0.07)', color: TEXT3 }}>⌘K</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '24px 32px 40px' }}>

          {/* Row 1: Timeline */}
          <TimelineRow meetings={todayMeetings} now={now} />

          {/* Row 2: 진행중 과업 · 오늘 업무 · 금주 업무 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}>

            {/* 진행중 과업 */}
            <CardSection title="진행중 과업" link="/project" linkLabel="전체 →">
              {loading ? <div className="space-y-2">{skel(4)}</div>
                : subTasks.length === 0
                  ? <p style={{ fontSize: 13, color: TEXT3 }}>진행 중인 과업이 없어요</p>
                  : subTasks.map((st, i) => {
                      const gc = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                      return (
                        <Link key={st.id} href={`/subtasks/${st.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: rowDivider(i, subTasks.length) }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: gc, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: TEXT1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {st.title}
                            </span>
                            {st.agenda_items && (
                              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 100, background: `${gc}33`, color: gc, flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {st.agenda_items.title}
                              </span>
                            )}
                          </div>
                        </Link>
                      )
                    })
              }
            </CardSection>

            {/* 오늘 업무 */}
            <CardSection title="오늘 업무" link="/tasks" linkLabel="+ 추가">
              {loading ? <div className="space-y-2">{skel(4)}</div>
                : todayTodos.length === 0
                  ? <p style={{ fontSize: 13, color: TEXT3 }}>오늘 할 일이 없어요</p>
                  : todayTodos.map((t, i) => {
                      const done = doneTasks.includes(t.id)
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: rowDivider(i, todayTodos.length) }}>
                          <button
                            onClick={() => toggleTask(t.id)}
                            style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${done ? '#34D399' : 'rgba(255,255,255,0.2)'}`, background: done ? '#34D399' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 180ms' }}
                          >
                            {done && <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                            {t.tasks && <p style={{ fontSize: 11, color: TEXT2 }}>{t.tasks.short_name ?? t.tasks.title}</p>}
                          </div>
                          {t.tasks && <span className={tagCls(t.tasks.part)}>{t.tasks.part}</span>}
                        </div>
                      )
                    })
              }
            </CardSection>

            {/* 금주 업무 */}
            <CardSection
              title="금주 업무"
              extra={
                <div style={{ display: 'flex', gap: 3 }}>
                  {(['all', 'tomorrow', 'this_week'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setWeekFilter(f)}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8, border: `1px solid ${weekFilter === f ? 'rgba(255,255,255,0.14)' : 'transparent'}`, background: weekFilter === f ? 'rgba(255,255,255,0.07)' : 'transparent', color: weekFilter === f ? TEXT2 : TEXT3, cursor: 'pointer', transition: 'all 180ms' }}
                    >
                      {f === 'all' ? '전체' : f === 'tomorrow' ? '내일' : '금주'}
                    </button>
                  ))}
                </div>
              }
            >
              {loading ? <div className="space-y-2">{skel(4)}</div>
                : filteredWeek.length === 0
                  ? <p style={{ fontSize: 13, color: TEXT3 }}>해당 업무 없음</p>
                  : filteredWeek.map((t, i) => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: rowDivider(i, filteredWeek.length) }}>
                        <div style={{ width: 6, height: 6, borderRadius: 2, background: t.schedule_tag === 'tomorrow' ? '#60A5FA' : '#818CF8', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: TEXT1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: t.schedule_tag === 'tomorrow' ? 'rgba(96,165,250,0.12)' : 'rgba(129,140,248,0.12)', color: t.schedule_tag === 'tomorrow' ? '#93C5FD' : '#A5B4FC', flexShrink: 0 }}>
                          {t.schedule_tag === 'tomorrow' ? '내일' : '금주'}
                        </span>
                      </div>
                    ))
              }
            </CardSection>

          </div>

          {/* Row 3: 퀵메모 · 최근 회의록 · 회고 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}>

            {/* 퀵메모 */}
            <CardSection title="퀵메모" link="/memos" linkLabel="전체 →">
              {loading ? <div className="space-y-2">{skel(4)}</div>
                : memos.length === 0
                  ? <p style={{ fontSize: 13, color: TEXT3 }}>메모가 없어요</p>
                  : memos.slice(0, 8).map((memo, i) => (
                      <div key={memo.id} onClick={() => { localStorage.setItem('memos_open_id', memo.id); router.push('/memos') }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: rowDivider(i, Math.min(memos.length, 8)), cursor: 'pointer' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: dots[i % 4], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: TEXT1 }}>{memo.title}</span>
                        <span style={{ fontSize: 10, color: TEXT3, flexShrink: 0 }}>{fmtDate(memo.created_at)}</span>
                      </div>
                    ))
              }
            </CardSection>

            {/* 최근 회의록 */}
            <CardSection title="최근 회의록" link="/meetings" linkLabel="전체 →">
              {loading ? <div className="space-y-2">{skel(3)}</div>
                : recentMeetings.length === 0
                  ? <p style={{ fontSize: 13, color: TEXT3 }}>회의록이 없어요</p>
                  : recentMeetings.map((m, i) => (
                      <Link key={m.id} href={`/meetings/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: rowDivider(i, recentMeetings.length) }}>
                          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <FileText size={11} strokeWidth={1.75} style={{ color: TEXT2 }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                            <p style={{ fontSize: 11, color: TEXT3 }}>{fmtDate(m.meeting_date)}</p>
                          </div>
                        </div>
                      </Link>
                    ))
              }
            </CardSection>

            {/* 회고 */}
            <div style={{ ...CS, padding: 22, display: 'flex', flexDirection: 'column', minHeight: 200, maxHeight: 284 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT1 }}>회고</h2>
                {todayJournal && (
                  <button onClick={() => setShowJournal(true)} style={{ fontSize: 12, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer' }}>수정</button>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {todayJournal ? (
                  <button onClick={() => setShowJournal(true)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    <p className="line-clamp-[9]" style={{ fontSize: 13, lineHeight: 1.7, color: TEXT2 }}>
                      {todayJournal.content}
                    </p>
                  </button>
                ) : (
                  <button onClick={() => setShowJournal(true)}
                    style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'none', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12, cursor: 'pointer' }}>
                    <NotebookPen size={18} strokeWidth={1.5} style={{ color: TEXT3 }} />
                    <span style={{ fontSize: 12, color: TEXT3 }}>오늘 회고 작성하기</span>
                  </button>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* 검색 모달 */}
      {searchOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
            style={{ background: '#26282E', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.45)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <Search size={14} style={{ color: TEXT2 }} className="flex-shrink-0" />
              <input ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="과업, 회의록, 메모 검색..."
                className="flex-1 bg-transparent focus:outline-none text-[14px]" style={{ color: TEXT1 }} />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[11px]" style={{ color: TEXT3 }}>지우기</button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {searchQuery.trim() === '' ? (
                <p className="px-4 py-6 text-[13px] text-center" style={{ color: TEXT3 }}>검색어를 입력하세요</p>
              ) : searchResults.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-center" style={{ color: TEXT3 }}>검색 결과가 없어요</p>
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
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors" style={{ color: TEXT1 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: r.type === '세부task' ? 'rgba(99,102,241,0.2)' : r.type === '회의록' ? 'rgba(52,211,153,0.15)' : 'rgba(251,146,60,0.15)', color: r.type === '세부task' ? '#A5B4FC' : r.type === '회의록' ? '#6EE7B7' : '#FED7AA' }}>
                        {r.type}
                      </span>
                      <span className="text-[13px] truncate">{r.title}</span>
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
