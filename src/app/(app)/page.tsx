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
        { data: stData }, { data: tdData },
        { data: mData },  { data: mmData }, { data: jData },
      ] = await Promise.all([
        sb.current.from('agenda_sub_tasks').select('*, agenda_items(id, title, agenda_groups(name, color))').eq('status', 'active').order('sort_order').limit(20),
        sb.current.from('task_todos').select('*, tasks(id, title, short_name, part)').eq('schedule_tag', 'today').eq('done', false).order('sort_order').limit(15),
        sb.current.from('meetings').select('*').order('meeting_date', { ascending: false }).limit(20),
        sb.current.from('quick_memos').select('*').order('created_at', { ascending: false }).limit(100),
        sb.current.from('daily_journals').select('id, date, content, linked_task_ids, linked_meeting_ids, tags').in('date', [today, yesterday]),
      ])

      setSubTasks((stData ?? []) as SubTaskWithContext[])
      setTodayTodos((tdData ?? []) as TodayTodo[])
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
      <div className="md:hidden flex-1 overflow-y-auto px-4 pt-6 pb-36">
        <h2 className="text-base font-bold mb-4" style={{ color: TEXT1 }}>오늘의 할 일</h2>
        <div className="rounded-[20px] p-4" style={CARD_STYLE}>
          {todayTodos.length === 0 && <p className="text-sm py-2" style={{ color: TEXT2 }}>오늘 할 일이 없어요</p>}
          {todayTodos.map(t => (
            <div key={t.id} className="flex items-start gap-3 py-3" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <div className="w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium leading-snug" style={{ color: TEXT1 }}>{t.title}</p>
                {t.tasks && <p className="text-[11px] mt-0.5" style={{ color: TEXT2 }}>{t.tasks.short_name ?? t.tasks.title}</p>}
              </div>
              {t.tasks && <span className={tagCls(t.tasks.part)}>{t.tasks.part}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── 데스크톱: 1페이지 내 완전 고정 ── */}
      <div className="hidden md:flex flex-col flex-1 min-h-0">

        {/* Topbar */}
        <div className="flex-shrink-0 flex items-center justify-center h-12 -mx-8 px-8" style={{ background: BG, borderBottom: `1px solid ${DIVIDER}` }}>
          <div
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2.5 px-4 py-1.5 rounded-2xl w-full max-w-sm cursor-pointer transition-all duration-200"
            style={{ background: '#1A1C1F', boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04)' }}
          >
            <Search size={12} style={{ color: TEXT2 }} className="flex-shrink-0" />
            <span className="text-[13px] flex-1" style={{ color: TEXT3 }}>검색 (프로젝트, 안건, 회의록 등)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono" style={{ background: 'rgba(255,255,255,0.08)', color: TEXT3 }}>⌘ K</span>
          </div>
        </div>

        {/* Content: flex col, fills remaining height */}
        <div className="flex-1 flex flex-col min-h-0 max-w-[1400px] mx-auto w-full">

          {/* Row 2: 오늘의 주요업무 + 진행 중 과업 — shrink-0 */}
          <div ref={kpiGridRef} className="flex-shrink-0 grid gap-6 mt-6 mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>

            {/* 오늘의 주요 업무 */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.07em]" style={{ color: TEXT3 }}>오늘의 주요 업무</h2>
                <Link href="/tasks" className="flex items-center gap-1 text-[11px] font-medium" style={{ color: TEXT3 }}>
                  <Plus size={11} /><span>추가</span>
                </Link>
              </div>
              {loading ? (
                <div className="space-y-2">{skel(3)}</div>
              ) : todayTodos.length === 0 ? (
                <p className="text-[13px] py-3 text-center" style={{ color: TEXT3 }}>오늘 할 일이 없어요</p>
              ) : (
                <div>
                  {todayTodos.map((t, i) => {
                    const done = doneTasks.includes(t.id)
                    return (
                      <div key={t.id} className="flex items-center gap-3 py-2" style={{ borderBottom: i < todayTodos.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                        <button
                          onClick={() => toggleTask(t.id)}
                          className="flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all"
                          style={{ width: 16, height: 16, borderColor: done ? '#34D399' : 'rgba(255,255,255,0.2)', background: done ? '#34D399' : 'transparent' }}
                        >
                          {done && <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium transition-colors" style={{ color: done ? TEXT3 : TEXT1, textDecoration: done ? 'line-through' : 'none' }}>{t.title}</p>
                          {t.tasks && <p className="text-[11px]" style={{ color: TEXT2 }}>{t.tasks.short_name ?? t.tasks.title}</p>}
                        </div>
                        {t.tasks && <span className={tagCls(t.tasks.part)}>{t.tasks.part}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 진행 중 과업 (프로젝트 세부task) */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.07em]" style={{ color: TEXT3 }}>진행 중 과업</h2>
                <Link href="/project" className="text-[11px] font-medium" style={{ color: TEXT3 }}>전체 보기</Link>
              </div>
              {loading ? (
                <div className="space-y-2">{skel(4)}</div>
              ) : displaySubTasks.length === 0 ? (
                <p className="text-[13px] py-3 text-center" style={{ color: TEXT3 }}>진행 중인 과업이 없어요</p>
              ) : (
                <div className="overflow-y-auto scrollbar-hide max-h-[200px]">
                  {displaySubTasks.map((st, i) => {
                    const groupColor = st.agenda_items?.agenda_groups?.color ?? '#818CF8'
                    return (
                      <Link key={st.id} href={`/subtasks/${st.id}`}>
                        <div className="flex items-center gap-3 py-2 cursor-pointer" style={{ borderBottom: i < displaySubTasks.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: groupColor }} />
                          <span className="text-[13px] font-medium flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{st.title}</span>
                          {st.agenda_items && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 truncate max-w-[120px]"
                              style={{ background: `${groupColor}33`, color: groupColor }}>
                              {st.agenda_items.title}
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: 2×2 동일 크기 그리드, 나머지 높이 채움 */}
          <div className="flex-1 min-h-0 pb-5">
            <div className="grid grid-cols-2 gap-3 h-full" style={{ gridTemplateRows: '1fr 1fr' }}>

              {/* 1. 오늘의 일정 */}
              <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>오늘의 일정</h2>
                  <Link href="/schedule" className="text-[11px] font-medium" style={{ color: TEXT2 }}>전체</Link>
                </div>
                <div className="flex-1 overflow-hidden">
                  {loading ? (
                    <div className="space-y-2">{skel(2)}</div>
                  ) : todayMeetings.length === 0 ? (
                    <p className="text-[12px] pt-1" style={{ color: TEXT3 }}>오늘 일정 없음</p>
                  ) : (
                    <div>
                      {todayMeetings.map((m, i) => (
                        <div key={m.id} className="flex items-center gap-2.5 py-2" style={{ borderBottom: i < todayMeetings.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                          <Clock size={10} style={{ color: TEXT3 }} className="flex-shrink-0" />
                          <span className="text-[12px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{m.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. 최근 회의록 */}
              <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>최근 회의록</h2>
                  <Link href="/meetings" className="text-[11px] font-medium" style={{ color: TEXT2 }}>전체</Link>
                </div>
                <div className="flex-1 overflow-hidden">
                  {loading ? (
                    <div className="space-y-2">{skel(3)}</div>
                  ) : recentMeetings.length === 0 ? (
                    <p className="text-[12px] pt-1" style={{ color: TEXT3 }}>회의록이 없어요</p>
                  ) : (
                    <div>
                      {recentMeetings.map((m, i) => (
                        <Link key={m.id} href={`/meetings/${m.id}`}>
                          <div className="flex items-center gap-2.5 py-2 cursor-pointer" style={{ borderBottom: i < recentMeetings.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
                              <FileText size={11} strokeWidth={1.75} style={{ color: TEXT2 }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium truncate" style={{ color: TEXT1 }}>{m.title}</p>
                              <p className="text-[10px]" style={{ color: TEXT3 }}>{fmtDate(m.meeting_date)}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. 퀵메모 */}
              <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>퀵메모</h2>
                  <div className="flex items-center gap-1.5">
                    <Link href="/memos" className="text-[11px] font-medium" style={{ color: TEXT2 }}>전체</Link>
                    <Link href="/memos">
                      <button className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', color: TEXT2 }}>
                        <Plus size={10} />
                      </button>
                    </Link>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                  {loading ? (
                    <div className="space-y-2">{skel(3)}</div>
                  ) : memos.length === 0 ? (
                    <p className="text-[12px] pt-1" style={{ color: TEXT3 }}>메모가 없어요</p>
                  ) : (
                    <div>
                      {memos.map((memo, i) => {
                        const dots = ['#818CF8', '#60A5FA', '#34D399', '#FB923C']
                        return (
                          <Link key={memo.id} href={`/memos/${memo.id}`}>
                            <div className="flex items-center gap-2.5 py-2 cursor-pointer" style={{ borderBottom: i < memos.length - 1 ? `1px solid ${DIVIDER}` : 'none' }}>
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dots[i % 4] }} />
                              <span className="text-[12px] flex-1 min-w-0 truncate" style={{ color: TEXT1 }}>{memo.title}</span>
                              <span className="text-[10px] flex-shrink-0" style={{ color: TEXT3 }}>{fmtDate(memo.created_at)}</span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 4. 회고 — 입력란만, 클릭 시 풀스크린 에디터 */}
              <div className="p-4 min-h-0 flex flex-col overflow-hidden" style={CARD_STYLE}>
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h2 className="text-[13px] font-bold" style={{ color: TEXT1 }}>회고</h2>
                  {todayJournal && (
                    <button onClick={() => setShowJournal(true)} className="text-[11px] font-medium transition-colors" style={{ color: TEXT2 }}>
                      수정
                    </button>
                  )}
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  {todayJournal ? (
                    <button
                      onClick={() => setShowJournal(true)}
                      className="flex-1 text-left w-full overflow-hidden"
                    >
                      <p className="text-[12px] leading-relaxed line-clamp-6" style={{ color: TEXT2 }}>
                        {todayJournal.content}
                      </p>
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowJournal(true)}
                      className="flex-1 w-full flex flex-col items-center justify-center gap-2 rounded-xl transition-all"
                      style={{ border: '1px dashed rgba(255,255,255,0.1)' }}
                    >
                      <NotebookPen size={18} strokeWidth={1.5} style={{ color: TEXT3 }} />
                      <span className="text-[12px]" style={{ color: TEXT3 }}>오늘 회고 작성하기</span>
                    </button>
                  )}
                </div>
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
