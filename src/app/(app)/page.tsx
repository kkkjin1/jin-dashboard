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
const BG      = '#1F2023'
const SURFACE = '#26282E'
// Three-layer shadow — inner highlight + hairline + large ambient.
// No layer is heavy. Depth from the system, not the weight.
const SHADOW  =
  'inset 0 1px 0 rgba(255,255,255,0.06), ' +
  '0 0 0 1px rgba(255,255,255,0.06), ' +
  '0 18px 60px rgba(0,0,0,0.15)'
const TEXT1   = '#E5E7EB'
const TEXT2   = '#A1A7B3'
const TEXT3   = '#7B8290'
const DIVIDER = 'rgba(255,255,255,0.05)'

const CARD_STYLE: React.CSSProperties = { background: SURFACE, boxShadow: SHADOW, borderRadius: 24 }

// ── Timeline constants ──────────────────────────────────────────────────────
const TL_START = 8 * 60   // 08:00
const TL_END   = 21 * 60  // 21:00
const TL_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

function parseTimeMinutes(dateStr: string | null): number | null {
  if (!dateStr) return null
  try {
    const d = parseISO(dateStr)
    const h = d.getHours(), m = d.getMinutes()
    if (h === 0 && m === 0) return null
    return h * 60 + m
  } catch { return null }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function tagCls(part: string) {
  return part === '비즈'
    ? 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(249,115,22,0.15)] text-[#FDBA74]'
    : 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(59,130,246,0.15)] text-[#93C5FD]'
}
function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  try { return format(parseISO(s), 'M.d (E)', { locale: ko }) } catch { return s }
}
function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr() { return localDateStr(new Date()) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) }

// ── Main Component ────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [doneTasks,     setDoneTasks]     = useState<string[]>([])
  const [showJournal,   setShowJournal]   = useState(false)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const kpiGridRef = useRef<HTMLDivElement>(null)

  const [subTasks,       setSubTasks]       = useState<SubTaskWithContext[]>([])
  const [todayTodos,     setTodayTodos]     = useState<TodayTodo[]>([])
  const [weekTodos,      setWeekTodos]      = useState<TodayTodo[]>([])
  const [meetings,       setMeetings]       = useState<Meeting[]>([])
  const [memos,          setMemos]          = useState<QuickMemo[]>([])
  const [todayJournal,   setTodayJournal]   = useState<DailyJournal | null>(null)
  const [yesterJournal,  setYesterJournal]  = useState<DailyJournal | null>(null)
  const [loading,        setLoading]        = useState(true)
  const sb = useRef(createClient())

  useEffect(() => {
    async function load() {
      const today     = todayStr()
      const yesterday = yesterdayStr()
      const [
        { data: stData }, { data: tdData }, { data: wdData },
        { data: mData },  { data: mmData }, { data: jData },
      ] = await Promise.all([
        sb.current.from('agenda_sub_tasks').select('*, agenda_items(id, title, agenda_groups(name, color))').eq('status', 'active').order('sort_order').limit(20),
        sb.current.from('task_todos').select('*, tasks(id, title, short_name, part)').eq('schedule_tag', 'today').eq('done', false).order('sort_order').limit(15),
        sb.current.from('task_todos').select('*, tasks(id, title, short_name, part)').eq('schedule_tag', 'this_week').eq('done', false).order('sort_order').limit(15),
        sb.current.from('meetings').select('*').order('meeting_date', { ascending: false }).limit(20),
        sb.current.from('quick_memos').select('*').order('created_at', { ascending: false }).limit(100),
        sb.current.from('daily_journals').select('id, date, content, linked_task_ids, linked_meeting_ids, tags').in('date', [today, yesterday]),
      ])

      setSubTasks((stData ?? []) as SubTaskWithContext[])
      setTodayTodos((tdData ?? []) as TodayTodo[])
      setWeekTodos((wdData ?? []) as TodayTodo[])
      setMeetings((mData ?? []) as Meeting[])
      setMemos((mmData ?? []) as QuickMemo[])
      const jList = (jData ?? []) as DailyJournal[]
      setTodayJournal(jList.find(j => j.date === today) ?? null)
      setYesterJournal(jList.find(j => j.date === yesterday) ?? null)
      setLoading(false)
    }
    load()
  }, [])

  // Ctrl+K 검색
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
      if (st.title.toLowerCase().includes(q))
        res.push({ type: '세부task', title: st.title, href: `/subtasks/${st.id}` })
    })
    meetings.forEach(m => {
      if (m.title.toLowerCase().includes(q))
        res.push({ type: '회의록', title: m.title, href: `/meetings/${m.id}` })
    })
    memos.forEach(m => {
      if ((m.title ?? '').toLowerCase().includes(q))
        res.push({ type: '메모', title: m.title ?? '제목 없음', href: `/memos/${m.id}` })
    })
    return res.slice(0, 8)
  }, [searchQuery, subTasks, meetings, memos])

  function toggleTask(id: string) {
    setDoneTasks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  const today           = todayStr()
  const todayMeetings   = meetings.filter(m => m.meeting_date?.startsWith(today))
  const recentMeetings  = meetings.slice(0, 4)
  const displaySubTasks = subTasks

  const skel = (n: number) => Array.from({ length: n }, (_, i) => (
    <div key={i} className="h-7 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
  ))

  // 회고 풀스크린 에디터용 meetings 형식 변환
  const meetingsForJournal = meetings.map(m => ({ id: m.id, title: m.title, meeting_date: m.meeting_date ?? undefined }))

  return (
    <div className="font-sans flex flex-col" style={{ height: '100%', background: BG }}>

      {/* ── 모바일 ── */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 pt-5 pb-36 space-y-4">

        {/* 오늘의 할 일 */}
        <div className="rounded-[20px] p-4" style={CARD_STYLE}>
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
                    <div key={t.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: i < todayTodos.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
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

        {/* 진행 중 과업 */}
        <div className="rounded-[20px] p-4" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>진행 중 과업</h2>
            <Link href="/project" className="text-[11px]" style={{ color: TEXT3 }}>전체 보기</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : displaySubTasks.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>진행 중인 과업이 없어요</p>
              : displaySubTasks.map((st, i) => {
                  const groupColor = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                  return (
                    <Link key={st.id} href={`/subtasks/${st.id}`}>
                      <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: i < displaySubTasks.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
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

        {/* 오늘의 일정 */}
        <div className="rounded-[20px] p-4" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>오늘의 일정</h2>
            <Link href="/schedule" className="text-[11px]" style={{ color: TEXT3 }}>전체</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(2)}</div>
            : todayMeetings.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>오늘 일정 없음</p>
              : todayMeetings.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: i < todayMeetings.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                    <Clock size={11} style={{ color: TEXT3 }} className="flex-shrink-0" />
                    <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{m.title}</span>
                  </div>
                ))
          }
        </div>

        {/* 최근 회의록 */}
        <div className="rounded-[20px] p-4" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>최근 회의록</h2>
            <Link href="/meetings" className="text-[11px]" style={{ color: TEXT3 }}>전체</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : recentMeetings.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>회의록이 없어요</p>
              : recentMeetings.map((m, i) => (
                  <Link key={m.id} href={`/meetings/${m.id}`}>
                    <div className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: i < recentMeetings.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
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

        {/* 퀵메모 */}
        <div className="rounded-[20px] p-4" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>퀵메모</h2>
            <Link href="/memos" className="text-[11px]" style={{ color: TEXT3 }}>전체</Link>
          </div>
          {loading ? <div className="space-y-2">{skel(3)}</div>
            : memos.length === 0
              ? <p className="text-[13px] py-1" style={{ color: TEXT3 }}>메모가 없어요</p>
              : memos.slice(0, 6).map((memo, i) => {
                  const dots = ['#818CF8', '#60A5FA', '#34D399', '#FB923C']
                  return (
                    <Link key={memo.id} href={`/memos/${memo.id}`}>
                      <div className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: i < Math.min(memos.length, 6) - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dots[i % 4] }} />
                        <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{memo.title}</span>
                        <span className="text-[10px] flex-shrink-0" style={{ color: TEXT3 }}>{fmtDate(memo.created_at)}</span>
                      </div>
                    </Link>
                  )
                })
          }
        </div>

        {/* 회고 */}
        <div className="rounded-[20px] p-4" style={CARD_STYLE}>
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
            <button onClick={() => setShowJournal(true)}
              className="w-full py-5 flex flex-col items-center justify-center gap-2 rounded-xl"
              style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
              <NotebookPen size={18} strokeWidth={1.5} style={{ color: TEXT3 }} />
              <span className="text-[12px]" style={{ color: TEXT3 }}>오늘 회고 작성하기</span>
            </button>
          )}
        </div>

      </div>

      {/* ── 데스크톱 ── */}
      <div className="hidden md:flex flex-col flex-1 min-h-0">

        {/* Header: 인사 + KPI chips + 검색 */}
        <div className="flex-shrink-0 pt-4 pb-3" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h1 className="text-[17px] font-bold tracking-tight" style={{ color: TEXT1 }}>안녕하세요, 진일님 👋</h1>
              <p className="text-[12px] mt-0.5" style={{ color: TEXT3 }}>오늘도 집중해서 딱 한 가지 보내세요.</p>
            </div>
            <div onClick={() => setSearchOpen(true)} className="flex items-center gap-2.5 px-4 py-1.5 rounded-2xl cursor-pointer transition-all" style={{ background: '#1A1C1F', boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04)' }}>
              <Search size={12} style={{ color: TEXT2 }} className="flex-shrink-0" />
              <span className="text-[12px]" style={{ color: TEXT3 }}>검색 (제목, 안건, 회의록 등)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono" style={{ background: 'rgba(255,255,255,0.08)', color: TEXT3 }}>⌘ K</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: '안건', val: `${subTasks.length}건`, dot: '#818CF8', bg: 'rgba(99,102,241,0.13)' },
              { label: '업무', val: `${todayTodos.length}건`, dot: '#60A5FA', bg: 'rgba(59,130,246,0.13)' },
              { label: '진행중 과업', val: `${subTasks.length}건`, dot: '#34D399', bg: 'rgba(52,211,153,0.13)' },
            ].map(({ label, val, dot, bg }) => (
              <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: bg, color: dot }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                {label} {val}
              </div>
            ))}
            <button onClick={() => setShowJournal(true)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(251,146,60,0.13)', color: '#FB923C' }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#FB923C' }} />
              회고 {todayJournal ? '수정' : '해석'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col max-w-[1400px] mx-auto w-full pt-3 pb-4 gap-3">

          {/* 오늘의 타임라인 */}
          {(() => {
            const now = new Date()
            const nowMin = now.getHours() * 60 + now.getMinutes()
            const nowPct = Math.max(0, Math.min(100, (nowMin - TL_START) / (TL_END - TL_START) * 100))
            const events = todayMeetings
              .map(m => ({ ...m, mins: parseTimeMinutes(m.meeting_date) }))
              .filter(m => m.mins !== null)
              .map(m => ({ ...m, pct: (m.mins! - TL_START) / (TL_END - TL_START) * 100 }))
              .filter(m => m.pct >= 0 && m.pct <= 96)
            return (
              <div className="flex-shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: TEXT3 }}>오늘의 타임라인</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: TEXT3 }}>{format(now, 'M월 d일 (E)', { locale: ko })}</span>
                    <Link href="/schedule" className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: TEXT2 }}>+ 추가</Link>
                  </div>
                </div>
                <div className="relative rounded-xl overflow-hidden" style={{ background: SURFACE, boxShadow: SHADOW, height: 68 }}>
                  {TL_HOURS.map(h => {
                    const pct = (h * 60 - TL_START) / (TL_END - TL_START) * 100
                    return (
                      <div key={h} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                        <span className="absolute top-2 text-[9px] pl-0.5" style={{ color: TEXT3 }}>{h}</span>
                        <div className="absolute top-5 bottom-0" style={{ width: 1, background: DIVIDER }} />
                      </div>
                    )
                  })}
                  {events.map(m => (
                    <Link key={m.id} href={`/meetings/${m.id}`}>
                      <div className="absolute rounded-md flex items-center px-2 cursor-pointer"
                        style={{ left: `${m.pct}%`, top: 20, bottom: 10, minWidth: 60, maxWidth: 160, background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.42)' }}>
                        <span className="text-[10px] font-semibold truncate" style={{ color: '#A5B4FC' }}>{m.title}</span>
                      </div>
                    </Link>
                  ))}
                  {events.length === 0 && todayMeetings.length > 0 && (
                    <div className="absolute left-3 flex items-center gap-2" style={{ top: 20, bottom: 10 }}>
                      {todayMeetings.slice(0, 5).map(m => (
                        <Link key={m.id} href={`/meetings/${m.id}`}>
                          <div className="h-full rounded-md flex items-center px-2" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.42)', minWidth: 72 }}>
                            <span className="text-[10px] font-semibold truncate" style={{ color: '#A5B4FC' }}>{m.title}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  {events.length === 0 && todayMeetings.length === 0 && (
                    <div className="absolute inset-0 flex items-end pb-3 pl-3">
                      <span className="text-[11px]" style={{ color: TEXT3 }}>오늘 일정이 없어요</span>
                    </div>
                  )}
                  {nowMin >= TL_START && nowMin <= TL_END && (
                    <div className="absolute top-4 bottom-1" style={{ left: `${nowPct}%`, width: 1.5, background: 'rgba(129,140,248,0.9)', zIndex: 10 }}>
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ background: '#818CF8' }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Row A: 진행중 과업 | 오늘 업무 | 금주 업무 */}
          <div className="flex-[3] min-h-0 grid grid-cols-3 gap-3">

            {/* 진행중 과업 */}
            <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>진행중 과업</h2>
                <Link href="/project" className="text-[11px] font-medium" style={{ color: TEXT2 }}>전체 →</Link>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {loading ? <div className="space-y-2">{skel(3)}</div>
                  : displaySubTasks.length === 0
                    ? <p className="text-[12px] pt-1" style={{ color: TEXT3 }}>진행 중인 과업이 없어요</p>
                    : displaySubTasks.map((st, i) => {
                        const groupColor = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                        const statusLabel = st.status === 'done' ? '완료과업' : st.status === 'hold' ? '보류과업' : '진행과업'
                        const statusColor = st.status === 'done' ? '#34D399' : st.status === 'hold' ? '#FB923C' : groupColor
                        return (
                          <Link key={st.id} href={`/subtasks/${st.id}`}>
                            <div className="flex items-center gap-2 py-2 cursor-pointer" style={{ borderBottom: i < displaySubTasks.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: groupColor }} />
                              <span className="text-[12px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{st.title}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${statusColor}20`, color: statusColor }}>{statusLabel}</span>
                            </div>
                          </Link>
                        )
                      })
                }
              </div>
            </div>

            {/* 오늘 업무 */}
            <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>오늘 업무</h2>
                <Link href="/tasks" className="text-[11px] font-medium" style={{ color: TEXT2 }}>+ 추가</Link>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {loading ? <div className="space-y-2">{skel(3)}</div>
                  : todayTodos.length === 0
                    ? (
                      <div className="h-full flex flex-col items-center justify-center gap-1.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <NotebookPen size={14} strokeWidth={1.5} style={{ color: TEXT3 }} />
                        </div>
                        <p className="text-[12px] font-medium" style={{ color: TEXT3 }}>오늘 업무가 없어요.</p>
                        <p className="text-[11px]" style={{ color: TEXT3 }}>세부 업무를 추가해 주세요.</p>
                      </div>
                    )
                    : todayTodos.map((t, i) => {
                        const done = doneTasks.includes(t.id)
                        return (
                          <div key={t.id} className="flex items-center gap-2.5 py-2" style={{ borderBottom: i < todayTodos.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                            <button onClick={() => toggleTask(t.id)} className="flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all" style={{ width: 15, height: 15, borderColor: done ? '#34D399' : 'rgba(255,255,255,0.2)', background: done ? '#34D399' : 'transparent' }}>
                              {done && <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </button>
                            <span className="text-[12px] flex-1 min-w-0 truncate" style={{ color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</span>
                            {t.tasks && <span className={tagCls(t.tasks.part)}>{t.tasks.part}</span>}
                          </div>
                        )
                      })
                }
              </div>
            </div>

            {/* 금주 업무 */}
            <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>금주 업무</h2>
                <Link href="/tasks" className="text-[11px] font-medium" style={{ color: TEXT2 }}>전체</Link>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {loading ? <div className="space-y-2">{skel(3)}</div>
                  : weekTodos.length === 0
                    ? (
                      <div className="h-full flex flex-col items-center justify-center gap-1.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <NotebookPen size={14} strokeWidth={1.5} style={{ color: TEXT3 }} />
                        </div>
                        <p className="text-[12px] font-medium" style={{ color: TEXT3 }}>해당 업무가 없습니다.</p>
                      </div>
                    )
                    : weekTodos.map((t, i) => {
                        const done = doneTasks.includes(t.id)
                        return (
                          <div key={t.id} className="flex items-center gap-2.5 py-2" style={{ borderBottom: i < weekTodos.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                            <button onClick={() => toggleTask(t.id)} className="flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all" style={{ width: 15, height: 15, borderColor: done ? '#34D399' : 'rgba(255,255,255,0.2)', background: done ? '#34D399' : 'transparent' }}>
                              {done && <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </button>
                            <span className="text-[12px] flex-1 min-w-0 truncate" style={{ color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</span>
                            {t.tasks && <span className={tagCls(t.tasks.part)}>{t.tasks.part}</span>}
                          </div>
                        )
                      })
                }
              </div>
            </div>
          </div>

          {/* Row B: 퀵메모 | 최근 회의록 | 회고 */}
          <div className="flex-[2] min-h-0 grid grid-cols-3 gap-3">

            {/* 퀵메모 */}
            <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>퀵메모</h2>
                <div className="flex items-center gap-1.5">
                  <Link href="/memos" className="text-[11px] font-medium" style={{ color: TEXT2 }}>전체</Link>
                  <Link href="/memos"><button className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', color: TEXT2 }}><Plus size={10} /></button></Link>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {loading ? <div className="space-y-2">{skel(3)}</div>
                  : memos.length === 0 ? <p className="text-[12px] pt-1" style={{ color: TEXT3 }}>메모가 없어요</p>
                  : memos.map((memo, i) => {
                      const dots = ['#818CF8', '#60A5FA', '#34D399', '#FB923C']
                      return (
                        <Link key={memo.id} href={`/memos/${memo.id}`}>
                          <div className="flex items-center gap-2.5 py-1.5 cursor-pointer" style={{ borderBottom: i < memos.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dots[i % 4] }} />
                            <span className="text-[12px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{memo.title}</span>
                            <span className="text-[10px] flex-shrink-0" style={{ color: TEXT3 }}>{fmtDate(memo.created_at)}</span>
                          </div>
                        </Link>
                      )
                    })
                }
              </div>
            </div>

            {/* 최근 회의록 */}
            <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>최근 회의록</h2>
                <Link href="/meetings" className="text-[11px] font-medium" style={{ color: TEXT2 }}>전체</Link>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {loading ? <div className="space-y-2">{skel(3)}</div>
                  : recentMeetings.length === 0 ? <p className="text-[12px] pt-1" style={{ color: TEXT3 }}>회의록이 없어요</p>
                  : recentMeetings.map((m, i) => (
                      <Link key={m.id} href={`/meetings/${m.id}`}>
                        <div className="flex items-center gap-2.5 py-1.5 cursor-pointer" style={{ borderBottom: i < recentMeetings.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
                            <FileText size={10} strokeWidth={1.75} style={{ color: TEXT2 }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium truncate" style={{ color: TEXT1 }}>{m.title}</p>
                            <p className="text-[10px]" style={{ color: TEXT3 }}>{fmtDate(m.meeting_date)}</p>
                          </div>
                        </div>
                      </Link>
                    ))
                }
              </div>
            </div>

            {/* 회고 */}
            <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>회고</h2>
                {todayJournal && <button onClick={() => setShowJournal(true)} className="text-[11px] font-medium" style={{ color: TEXT2 }}>수정</button>}
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                {todayJournal ? (
                  <button onClick={() => setShowJournal(true)} className="flex-1 text-left w-full overflow-hidden">
                    <p className="text-[12px] leading-relaxed line-clamp-5" style={{ color: TEXT2 }}>{todayJournal.content}</p>
                  </button>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2">
                    <p className="text-[12px]" style={{ color: TEXT3 }}>아직 오늘 회고가 없다고...</p>
                    <button onClick={() => setShowJournal(true)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all" style={{ background: 'rgba(255,255,255,0.07)', color: TEXT2 }}>
                      회고 작성하기
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 검색 모달 — body portal */}
      {searchOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
            style={{ background: '#26282E', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.45)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 검색 입력 */}
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <Search size={14} style={{ color: TEXT2 }} className="flex-shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="과업, 회의록, 메모 검색..."
                className="flex-1 bg-transparent focus:outline-none text-[14px]"
                style={{ color: TEXT1 }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[11px]" style={{ color: TEXT3 }}>지우기</button>
              )}
            </div>
            {/* 결과 */}
            <div className="max-h-[360px] overflow-y-auto">
              {searchQuery.trim() === '' ? (
                <p className="px-4 py-6 text-[13px] text-center" style={{ color: TEXT3 }}>검색어를 입력하세요</p>
              ) : searchResults.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-center" style={{ color: TEXT3 }}>검색 결과가 없어요</p>
              ) : (
                <div className="py-1">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => { router.push(r.href); setSearchOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{ color: TEXT1 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: r.type === '과업' ? 'rgba(99,102,241,0.2)' : r.type === '회의록' ? 'rgba(52,211,153,0.15)' : 'rgba(251,146,60,0.15)',
                          color: r.type === '과업' ? '#A5B4FC' : r.type === '회의록' ? '#6EE7B7' : '#FED7AA' }}>
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

      {/* 회고 풀스크린 에디터 — body portal */}
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
