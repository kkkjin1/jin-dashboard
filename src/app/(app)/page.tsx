'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Plus, FileText, Clock, NotebookPen, Layers, CheckSquare, CalendarDays, StickyNote } from 'lucide-react'
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
const BG      = '#18191D'
const CARD    = '#202126'
const CHOVER  = '#24252B'
const DIVIDER = 'rgba(255,255,255,0.04)'
const TEXT1   = 'rgba(255,255,255,0.92)'
const TEXT2   = 'rgba(255,255,255,0.58)'
const TEXT3   = 'rgba(255,255,255,0.36)'

// Card base style — applied programmatically, not as a static const
const cardBase = (accent = false): React.CSSProperties => ({
  background: CARD,
  border: `1px solid ${accent ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)'}`,
  borderRadius: 22,
  boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
  transition: 'background 200ms ease-out, transform 200ms ease-out, box-shadow 200ms ease-out',
})
const cardHover = (): React.CSSProperties => ({
  background: CHOVER,
  transform: 'translateY(-2px)',
  boxShadow: '0 16px 40px rgba(0,0,0,0.30)',
})

// Mobile keeps previous visual
const SURFACE  = '#26282E'
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
    : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-[rgba(59,130,246,0.12)] text-[rgba(147,197,253,0.85)]'
}
function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr()     { return localDateStr(new Date()) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) }

// ── Empty State ────────────────────────────────────────────────────────────
function EmptyState({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '24px 0', opacity: 0.6 }}>
      <div style={{ color: TEXT3, opacity: 0.7 }}>{icon}</div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: TEXT2, fontWeight: 400 }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: TEXT3, marginTop: 3 }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── List Row wrapper (row-level hover) ──────────────────────────────────────
function ListRow({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  const [h, setH] = useState(false)
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      style={{
        borderRadius: 8,
        marginLeft: -8, marginRight: -8,
        paddingLeft: 8, paddingRight: 8,
        background: h ? 'rgba(255,255,255,0.03)' : 'transparent',
        transition: 'background 180ms ease-out',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Card Section ───────────────────────────────────────────────────────────
function CardSection({
  title, link, linkLabel, children, extra, accent,
}: {
  title: string
  link?: string
  linkLabel?: string
  children: React.ReactNode
  extra?: React.ReactNode
  accent?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardBase(accent),
        ...(hovered ? cardHover() : {}),
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 200,
        maxHeight: 284,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: TEXT1, letterSpacing: '-0.015em' }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {extra}
          {link && (
            <Link href={link} style={{ fontSize: 12, color: TEXT3, textDecoration: 'none', transition: 'color 180ms' }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = TEXT2)}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = TEXT3)}
            >{linkLabel ?? '전체 →'}</Link>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="scrollbar-hide">
        {children}
      </div>
    </div>
  )
}

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

  // Glass-tinted event color sets (subtle, not loud)
  const EC = [
    { bg: 'rgba(79,130,230,0.10)',  bd: 'rgba(79,130,230,0.18)',  tx: 'rgba(147,197,253,0.88)' },
    { bg: 'rgba(52,211,153,0.08)',  bd: 'rgba(52,211,153,0.16)',  tx: 'rgba(110,231,183,0.88)' },
    { bg: 'rgba(251,146,60,0.08)',  bd: 'rgba(251,146,60,0.16)',  tx: 'rgba(253,186,116,0.88)' },
    { bg: 'rgba(167,139,250,0.08)', bd: 'rgba(167,139,250,0.16)', tx: 'rgba(196,181,253,0.88)' },
  ]

  return (
    <div style={{ ...cardBase(), height: 184, overflow: 'hidden', transition: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px 0' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: TEXT1, letterSpacing: '-0.015em' }}>오늘의 타임라인</span>
        <span style={{ fontSize: 12, color: TEXT3 }}>{format(now, 'M월 d일 (eee)', { locale: ko })}</span>
      </div>
      <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', height: 140, marginTop: 10, scrollbarWidth: 'none' }}>
        <div style={{ position: 'relative', width: (H_END - H_START) * H_W + 40, height: '100%', minHeight: 124 }}>

          {/* Hour labels */}
          {hours.map(h => (
            <span key={h} style={{ position: 'absolute', left: (h - H_START) * H_W + 4, top: 2, fontSize: 10.5, color: TEXT3, opacity: 0.7, userSelect: 'none', letterSpacing: '0.01em' }}>
              {h}:00
            </span>
          ))}

          {/* Grid lines — very faint */}
          {hours.map(h => (
            <div key={h} style={{ position: 'absolute', left: (h - H_START) * H_W, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.028)' }} />
          ))}

          {/* Past overlay */}
          {inRange && (
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: curX, background: 'rgba(0,0,0,0.16)', pointerEvents: 'none' }} />
          )}

          {/* Meeting events — glass surface */}
          {meetings.map((m, i) => {
            const c = EC[i % 4]
            return (
              <Link key={m.id} href={`/meetings/${m.id}`}
                style={{
                  position: 'absolute', left: 8 + i * 130, top: 24,
                  width: 118, height: 76,
                  background: c.bg,
                  border: `1px solid ${c.bd}`,
                  backdropFilter: 'blur(8px)',
                  borderRadius: 11,
                  padding: '7px 11px',
                  display: 'flex', flexDirection: 'column', gap: 2,
                  textDecoration: 'none',
                  transition: 'opacity 180ms ease-out',
                }}>
                <span className="line-clamp-2" style={{ fontSize: 11.5, fontWeight: 500, color: c.tx, lineHeight: 1.4 }}>{m.title}</span>
                {m.category && <span style={{ fontSize: 10, color: TEXT3, marginTop: 'auto', opacity: 0.8 }}>{m.category}</span>}
              </Link>
            )
          })}

          {meetings.length === 0 && (
            <p style={{ position: 'absolute', top: 56, left: 0, right: 40, textAlign: 'center', fontSize: 13, color: TEXT3 }}>오늘 일정 없음</p>
          )}

          {/* Current time indicator */}
          {inRange && <>
            <div style={{ position: 'absolute', left: curX, top: 0, bottom: 0, width: 1.5, background: '#4F8DFF', opacity: 0.9, zIndex: 10 }} />
            <div style={{ position: 'absolute', left: curX - 3.5, top: 17, width: 8, height: 8, borderRadius: '50%', background: '#4F8DFF', zIndex: 10 }} />
          </>}

        </div>
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
  const [journalHover,  setJournalHover]  = useState(false)
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
    <div key={i} className="h-8 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', marginBottom: 6 }} />
  ))
  const dots = ['#818CF8', '#60A5FA', '#34D399', '#FB923C']

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
      <div className="hidden md:flex flex-col flex-1 min-h-0">

        {/* Topbar: search only */}
        <div className="flex-shrink-0 flex items-center justify-center h-12 px-8"
          style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
          <div
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2.5 px-4 py-2 rounded-xl w-full max-w-[360px] cursor-pointer"
            style={{ background: '#1c1d21', border: '1px solid rgba(255,255,255,0.05)', transition: 'background 200ms ease-out' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#1f2025')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#1c1d21')}
          >
            <Search size={13} style={{ color: TEXT3, opacity: 0.75, flexShrink: 0 }} />
            <span className="text-[13px] flex-1" style={{ color: TEXT3 }}>검색 (과업, 안건, 회의록 등)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: 'rgba(255,255,255,0.06)', color: TEXT3 }}>⌘K</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '24px 32px 44px' }}>

          {/* Row 1: Timeline — first impression, full width */}
          <TimelineRow meetings={todayMeetings} now={now} />

          {/* Row 2 — 진행중 과업(accent) · 오늘업무 · 금주업무 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}>

            {/* 진행중 과업 — visual accent for hierarchy */}
            <CardSection title="진행중 과업" link="/project" linkLabel="전체 →" accent>
              {loading ? <div>{skel(4)}</div>
                : subTasks.length === 0
                  ? <EmptyState
                      icon={<Layers size={20} strokeWidth={1.5} />}
                      label="진행 중인 과업이 없습니다."
                      sub="새로운 과업을 시작해보세요."
                    />
                  : subTasks.map((st, i) => {
                      const gc = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                      return (
                        <Link key={st.id} href={`/subtasks/${st.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <ListRow style={{ ...rd(i, subTasks.length) }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: gc, flexShrink: 0, opacity: 0.9 }} />
                              <span style={{ fontSize: 14, fontWeight: 500, color: TEXT1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {st.title}
                              </span>
                              {st.agenda_items && (
                                <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 100, background: `${gc}22`, color: gc, opacity: 0.85, flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {st.agenda_items.title}
                                </span>
                              )}
                            </div>
                          </ListRow>
                        </Link>
                      )
                    })
              }
            </CardSection>

            {/* 오늘 업무 */}
            <CardSection title="오늘 업무" link="/tasks" linkLabel="+ 추가">
              {loading ? <div>{skel(4)}</div>
                : todayTodos.length === 0
                  ? <EmptyState
                      icon={<CheckSquare size={20} strokeWidth={1.5} />}
                      label="오늘 업무가 없습니다."
                      sub="새로운 업무를 추가해보세요."
                    />
                  : todayTodos.map((t, i) => {
                      const done = doneTasks.includes(t.id)
                      return (
                        <ListRow key={t.id} style={{ ...rd(i, todayTodos.length) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                            <button
                              onClick={() => toggleTask(t.id)}
                              style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${done ? '#34D399' : 'rgba(255,255,255,0.18)'}`, background: done ? '#34D399' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 200ms ease-out' }}
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
                    })
              }
            </CardSection>

            {/* 금주 업무 */}
            <CardSection
              title="금주 업무"
              extra={
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['all', 'tomorrow', 'this_week'] as const).map(f => (
                    <button key={f} onClick={() => setWeekFilter(f)}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 7, border: `1px solid ${weekFilter === f ? 'rgba(255,255,255,0.12)' : 'transparent'}`, background: weekFilter === f ? 'rgba(255,255,255,0.06)' : 'transparent', color: weekFilter === f ? TEXT2 : TEXT3, cursor: 'pointer', transition: 'all 180ms ease-out' }}>
                      {f === 'all' ? '전체' : f === 'tomorrow' ? '내일' : '금주'}
                    </button>
                  ))}
                </div>
              }
            >
              {loading ? <div>{skel(4)}</div>
                : filteredWeek.length === 0
                  ? <EmptyState
                      icon={<CalendarDays size={20} strokeWidth={1.5} />}
                      label="해당 업무가 없습니다."
                    />
                  : filteredWeek.map((t, i) => (
                      <ListRow key={t.id} style={{ ...rd(i, filteredWeek.length) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                          <div style={{ width: 5, height: 5, borderRadius: 1.5, background: t.schedule_tag === 'tomorrow' ? '#60A5FA' : '#818CF8', flexShrink: 0, opacity: 0.85 }} />
                          <span style={{ fontSize: 14, fontWeight: 500, color: TEXT1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                          <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 7, background: t.schedule_tag === 'tomorrow' ? 'rgba(96,165,250,0.1)' : 'rgba(129,140,248,0.1)', color: t.schedule_tag === 'tomorrow' ? 'rgba(147,197,253,0.8)' : 'rgba(165,180,252,0.8)', flexShrink: 0 }}>
                            {t.schedule_tag === 'tomorrow' ? '내일' : '금주'}
                          </span>
                        </div>
                      </ListRow>
                    ))
              }
            </CardSection>

          </div>

          {/* Row 3 — 퀵메모 · 최근회의록 · 회고 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}>

            {/* 퀵메모 */}
            <CardSection title="퀵메모" link="/memos" linkLabel="전체 →">
              {loading ? <div>{skel(4)}</div>
                : memos.length === 0
                  ? <EmptyState
                      icon={<StickyNote size={20} strokeWidth={1.5} />}
                      label="저장된 메모가 없습니다."
                      sub="Ctrl+3으로 빠르게 추가하세요."
                    />
                  : memos.slice(0, 8).map((memo, i) => (
                      <ListRow key={memo.id} onClick={() => { localStorage.setItem('memos_open_id', memo.id); router.push('/memos') }}
                        style={{ ...rd(i, Math.min(memos.length, 8)) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: dots[i % 4], flexShrink: 0, opacity: 0.85 }} />
                          <span style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: TEXT1, fontWeight: 400 }}>{memo.title}</span>
                          <span style={{ fontSize: 11, color: TEXT3, flexShrink: 0 }}>{fmtDate(memo.created_at)}</span>
                        </div>
                      </ListRow>
                    ))
              }
            </CardSection>

            {/* 최근 회의록 */}
            <CardSection title="최근 회의록" link="/meetings" linkLabel="전체 →">
              {loading ? <div>{skel(3)}</div>
                : recentMeetings.length === 0
                  ? <EmptyState
                      icon={<FileText size={20} strokeWidth={1.5} />}
                      label="회의록이 없습니다."
                      sub="첫 번째 회의록을 작성해보세요."
                    />
                  : recentMeetings.map((m, i) => (
                      <Link key={m.id} href={`/meetings/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                        <ListRow style={{ ...rd(i, recentMeetings.length) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.055)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <FileText size={13} strokeWidth={1.5} style={{ color: TEXT2, opacity: 0.75 }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 500, color: TEXT1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                              <p style={{ fontSize: 12, color: TEXT3, marginTop: 1 }}>{fmtDate(m.meeting_date)}</p>
                            </div>
                          </div>
                        </ListRow>
                      </Link>
                    ))
              }
            </CardSection>

            {/* 회고 */}
            <div
              onMouseEnter={() => setJournalHover(true)}
              onMouseLeave={() => setJournalHover(false)}
              style={{
                ...cardBase(),
                ...(journalHover ? cardHover() : {}),
                padding: 24,
                display: 'flex', flexDirection: 'column',
                minHeight: 200, maxHeight: 284,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: TEXT1, letterSpacing: '-0.015em' }}>회고</h2>
                {todayJournal && (
                  <button onClick={() => setShowJournal(true)}
                    style={{ fontSize: 12, color: TEXT3, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 180ms' }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = TEXT2)}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = TEXT3)}>
                    수정
                  </button>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {todayJournal ? (
                  <button onClick={() => setShowJournal(true)}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    <p className="line-clamp-[9]" style={{ fontSize: 14, lineHeight: 1.75, color: TEXT2, fontWeight: 400 }}>
                      {todayJournal.content}
                    </p>
                  </button>
                ) : (
                  <button onClick={() => setShowJournal(true)}
                    style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'none', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 14, cursor: 'pointer', transition: 'border-color 200ms' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
>
                    <NotebookPen size={20} strokeWidth={1.5} style={{ color: TEXT3, opacity: 0.7 }} />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: TEXT2, fontWeight: 400 }}>오늘 회고 작성하기</p>
                      <p style={{ fontSize: 12, color: TEXT3, marginTop: 3 }}>하루를 돌아보며 기록하세요.</p>
                    </div>
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
