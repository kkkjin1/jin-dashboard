'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchArchivedMembers, fetchMembers } from '@/lib/tasks'
import type { Member, OneOnOne, MyFeedback, FeedbackType } from '@/types'
import { format, parseISO, differenceInDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import dynamic from 'next/dynamic'
import MarkdownContent from '@/components/MarkdownContent'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

const FEEDBACK_TYPE_STYLE: Record<FeedbackType, string> = {
  긍정: 'bg-[#BADEC8]/40 text-[#2D5A45] border-[#BADEC8]/55',
  부정: 'bg-[#EBA698]/40 text-[#6B2D25] border-[#EBA698]/55',
  요청: 'bg-[#90A7D8]/30 text-[#1E3A6B] border-[#90A7D8]/45',
}
const ANALYSIS_TYPES: FeedbackType[] = ['긍정', '부정', '요청']

interface OrgPart { id: string; name: string }
interface OrgTeam { id: string; name: string; parts: OrgPart[] }

type Period = '이번 주' | '이번 달' | '3개월' | '전체'
const PERIODS: Period[] = ['이번 주', '이번 달', '3개월', '전체']

function getPeriodStart(period: Period): Date | null {
  if (period === '전체') return null
  const now = new Date()
  if (period === '이번 주') {
    const d = new Date(now)
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (period === '이번 달') return new Date(now.getFullYear(), now.getMonth(), 1)
  const d = new Date(now); d.setMonth(now.getMonth() - 3); return d
}

function inPeriod(dateStr: string | null | undefined, period: Period): boolean {
  if (!dateStr) return period === '전체'
  const start = getPeriodStart(period)
  if (!start) return true
  return new Date(dateStr) >= start
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[#4C7FE0] text-white border-[#4C7FE0] shadow-sm'
const pOff = 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]'

// ─── 경과일 배지 ──────────────────────────────────────────────────────────────
function daysBadgeClass(daysSince: number | null): string {
  if (daysSince === null || daysSince >= 30) return 'bg-[#EBA698]/40 text-[#6B2D25] border-[#EBA698]/55'
  if (daysSince >= 14) return 'bg-[#F3E482]/50 text-[#5A4A10] border-[#F3E482]/60'
  return 'bg-[#BADEC8]/40 text-[#2D5A45] border-[#BADEC8]/55'
}

function daysLabel(daysSince: number | null): string {
  if (daysSince === null) return '면담없음'
  if (daysSince === 0) return '오늘'
  return `${daysSince}일 전`
}

// ─── 팀원 행 ──────────────────────────────────────────────────────────────────
function MemberRow({ member, sessions, role, onNewSession }: {
  member: Member
  sessions: OneOnOne[]
  role: string | undefined
  onNewSession: (id: string) => void
}) {
  const memberSessions = sessions.filter(s => s.member_id === member.id)
  const last = memberSessions[0]
  const daysSince = last?.session_date
    ? differenceInDays(new Date(), parseISO(last.session_date))
    : null

  const roleStyle: React.CSSProperties | undefined =
    role === '팀장' ? { background: 'rgba(76,127,224,0.15)', color: '#A8C4F0', border: '1px solid rgba(76,127,224,0.25)' }
    : role === '파트장' ? { background: 'rgba(147,107,224,0.15)', color: '#C4A8F0', border: '1px solid rgba(147,107,224,0.25)' }
    : undefined

  return (
    <div className="flex items-center gap-3 px-4 py-3 group hover:bg-[rgba(255,255,255,0.025)] transition-colors"
      style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(226,232,240,0.6)' }}>
        {member.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>{member.name}</span>
          {roleStyle && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={roleStyle}>{role}</span>
          )}
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${daysBadgeClass(daysSince)}`}>
            {daysLabel(daysSince)}
          </span>
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(226,232,240,0.35)' }}>
          {last?.session_date ? format(parseISO(last.session_date), 'M/d (E)', { locale: ko }) : '기록없음'}
          {memberSessions.length > 0 && ` · ${memberSessions.length}회`}
        </p>
      </div>
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {memberSessions.length > 0 && (
          <Link href={`/one-on-one/${member.id}`}
            className="text-[10px] px-2.5 py-1 rounded-lg transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.5)' }}>
            기록
          </Link>
        )}
        <button onClick={() => onNewSession(member.id)}
          className="text-[10px] px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
          style={{ background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: '#A8C4F0' }}>
          + 신규
        </button>
      </div>
    </div>
  )
}

// ─── Availability 패널 ────────────────────────────────────────────────────────
function AvailabilityPanel({ members, sessions }: { members: Member[]; sessions: OneOnOne[] }) {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const stats = useMemo(() => {
    return members.map(m => {
      const memberSessions = sessions.filter(s => s.member_id === m.id)
      const last = memberSessions[0]
      const daysSince = last?.session_date ? differenceInDays(now, parseISO(last.session_date)) : null
      const hadThisMonth = memberSessions.some(s => s.session_date && parseISO(s.session_date) >= thisMonthStart)
      return { member: m, daysSince, lastDate: last?.session_date ?? null, hadThisMonth }
    })
  }, [members, sessions])

  const needsMeeting = useMemo(() =>
    stats.filter(s => s.daysSince === null || s.daysSince >= 30)
      .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999)),
    [stats]
  )
  const recentlyMet = useMemo(() =>
    stats.filter(s => s.daysSince !== null && s.daysSince < 14)
      .sort((a, b) => (a.daysSince ?? 0) - (b.daysSince ?? 0)),
    [stats]
  )
  const doneThisMonth = stats.filter(s => s.hadThisMonth).length
  const pct = members.length ? Math.round((doneThisMonth / members.length) * 100) : 0

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 16,
    padding: '12px 16px',
  }

  return (
    <div className="space-y-3">
      {/* 이번달 현황 */}
      <div style={card}>
        <p className="text-[10px] mb-2" style={{ color: 'rgba(226,232,240,0.4)' }}>
          {format(now, 'M월', { locale: ko })} 면담 현황
        </p>
        <div className="flex items-end gap-1 mb-2">
          <span className="text-2xl font-bold" style={{ color: '#E2E8F0' }}>{doneThisMonth}</span>
          <span className="text-sm mb-0.5" style={{ color: 'rgba(226,232,240,0.4)' }}>/ {members.length}명</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: pct === 100 ? '#BADEC8' : '#4C7FE0' }} />
        </div>
      </div>

      {/* 면담 필요 */}
      {needsMeeting.length > 0 && (
        <div style={card}>
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#EBA698' }} />
            <p className="text-[10px] font-semibold" style={{ color: 'rgba(226,232,240,0.5)' }}>면담 필요</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.35)' }}>
              {needsMeeting.length}명
            </span>
          </div>
          <div className="space-y-2">
            {needsMeeting.map(({ member, daysSince }) => (
              <div key={member.id} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.4)' }}>
                  {member.name[0]}
                </div>
                <span className="text-xs flex-1" style={{ color: 'rgba(226,232,240,0.7)' }}>{member.name}</span>
                <span className="text-[9px]" style={{ color: 'rgba(235,166,152,0.8)' }}>
                  {daysSince === null ? '기록없음' : `${daysSince}일`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 완료 */}
      {recentlyMet.length > 0 && (
        <div style={card}>
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#BADEC8' }} />
            <p className="text-[10px] font-semibold" style={{ color: 'rgba(226,232,240,0.5)' }}>최근 완료</p>
          </div>
          <div className="space-y-2">
            {recentlyMet.map(({ member, daysSince, lastDate }) => (
              <div key={member.id} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.4)' }}>
                  {member.name[0]}
                </div>
                <span className="text-xs flex-1" style={{ color: 'rgba(226,232,240,0.7)' }}>{member.name}</span>
                <span className="text-[9px]" style={{ color: 'rgba(186,222,200,0.8)' }}>
                  {lastDate ? format(parseISO(lastDate), 'M/d', { locale: ko }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 분석 패널 ────────────────────────────────────────────────────────────────
function AnalysisPanel({ feedbacks, onAssignType }: { feedbacks: MyFeedback[]; onAssignType: (id: string, type: FeedbackType | null) => void }) {
  if (feedbacks.length === 0) {
    return (
      <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl px-5 py-6">
        <p className="text-xs font-semibold text-[rgba(226,232,240,0.5)] mb-4">피드백 분석</p>
        <p className="text-sm text-[rgba(226,232,240,0.4)]">피드백이 없습니다</p>
      </div>
    )
  }

  const tagged = feedbacks.filter(f => f.feedback_type != null)
  const untagged = feedbacks.filter(f => f.feedback_type == null)
  const grouped = ANALYSIS_TYPES.map(type => ({
    type,
    items: tagged.filter(f => f.feedback_type === type),
  })).filter(g => g.items.length > 0)

  return (
    <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl px-5 py-4">
      <p className="text-xs font-semibold text-[rgba(226,232,240,0.5)] mb-4">피드백 분석</p>
      <div className="space-y-4">
        {grouped.map(({ type, items }) => (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${FEEDBACK_TYPE_STYLE[type]}`}>{type}</span>
              <span className="text-xs text-[rgba(226,232,240,0.4)]">{items.length}건</span>
            </div>
            <ul className="space-y-1.5 pl-1">
              {items.map(item => (
                <li key={item.id} className="group flex items-start gap-2 border-l-2 border-[rgba(255,255,255,0.09)] pl-2">
                  <div className="flex-1 text-xs leading-relaxed"><MarkdownContent content={item.content} dark className="text-xs" /></div>
                  <button onClick={() => onAssignType(item.id, null)}
                    className="flex-shrink-0 text-xs text-[rgba(226,232,240,0.2)] hover:text-[rgba(226,232,240,0.4)] opacity-0 group-hover:opacity-100 transition-all">해제</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {untagged.length > 0 && (
          <div>
            <p className="text-xs text-[rgba(226,232,240,0.4)] mb-2">미분류 ({untagged.length}건):</p>
            <ul className="space-y-2 pl-1">
              {untagged.map(item => (
                <li key={item.id} className="bg-[rgba(255,255,255,0.06)] rounded-2xl border border-[rgba(255,255,255,0.09)] p-2">
                  <div className="mb-1.5 leading-relaxed"><MarkdownContent content={item.content} dark className="text-xs" /></div>
                  <div className="flex gap-1">
                    {ANALYSIS_TYPES.map(t => (
                      <button key={t} onClick={() => onAssignType(item.id, t)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 ${FEEDBACK_TYPE_STYLE[t]}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 키워드 패널 ──────────────────────────────────────────────────────────────
const KO_STOPWORDS = new Set(['것', '이', '가', '을', '를', '은', '는', '에서', '에', '으로', '로', '의', '와', '과', '도', '하다', '합니다', '했습니다', '그리고', '하지만', '그런데', '등', '때', '때문에', '좀', '더', '같다', '같아', '같이', '이런', '저런', '그런', '어떤', '어떻게', '많이', '조금', '정말', '너무', '매우', '굉장히', '잘', '안', '못', '아주', '수', '제', '저', '그', '있', '없', '있는', '없는', '있어', '없어', '있습니다', '없습니다', '하는', '하고', '해서', '해요', '해줘', '같은', '위해', '통해', '대해', '부분', '경우', '생각', '느낌', '것들', '때문', '거의', '항상', '가끔', '보통', '되는', '되어', '되고', '이후', '이전', '또한', '그래서', '그래도', '하면', '하면서', '하지', '다시', '먼저', '같습니다'])

function KeywordsPanel({ feedbacks }: { feedbacks: MyFeedback[] }) {
  const keywords = useMemo(() => {
    const allText = feedbacks.map(f => stripHtml(f.content)).join(' ')
    const words = allText.split(/[\s,.\!\?:;()\[\]"'\n]+/)
      .map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, ''))
      .filter(w => w.length >= 2 && !KO_STOPWORDS.has(w))
    const freq = new Map<string, number>()
    words.forEach(w => freq.set(w, (freq.get(w) ?? 0) + 1))
    return Array.from(freq.entries()).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 16)
  }, [feedbacks])

  if (keywords.length === 0) return (
    <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl px-5 py-4">
      <p className="text-xs font-semibold text-[rgba(226,232,240,0.5)] mb-2">공통 키워드</p>
      <p className="text-xs text-[rgba(226,232,240,0.3)]">피드백이 쌓이면 키워드가 추출됩니다</p>
    </div>
  )

  return (
    <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-[rgba(226,232,240,0.5)]">공통 키워드</p>
        <span className="text-[10px] text-[rgba(226,232,240,0.3)]">2회 이상 등장</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {keywords.map(([word, count]) => (
          <span key={word} className={`text-xs px-2 py-0.5 rounded-full border ${
            count >= 5 ? 'bg-[#90A7D8]/25 border-[#90A7D8]/40 text-[#1E3A6B] font-semibold'
            : count >= 3 ? 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.7)]'
            : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.4)]'
          }`}>
            {word} <span className="opacity-50 text-[10px]">{count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 다음 질문 준비 패널 ──────────────────────────────────────────────────────
function NextQuestionsPanel() {
  const STORAGE_KEY = 'oneOnOne_nextQuestions'
  const [isOpen, setIsOpen] = useState(true)
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setQuestions(JSON.parse(saved))
    } catch {}
  }, [])

  function save(qs: { id: string; text: string }[]) {
    setQuestions(qs)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(qs)) } catch {}
  }

  function addQuestion() {
    if (!input.trim()) return
    save([...questions, { id: `${Date.now()}`, text: input.trim() }])
    setInput('')
  }

  return (
    <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl overflow-hidden">
      <button onClick={() => setIsOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.06)] transition-colors">
        <span className="text-xs font-semibold text-[rgba(226,232,240,0.7)]">다음 1on1 질문 준비</span>
        <div className="flex items-center gap-2">
          {questions.length > 0 && <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] px-2 py-0.5 rounded-full">{questions.length}개</span>}
          <span className="text-[10px] text-[rgba(226,232,240,0.3)]">{isOpen ? '▼' : '▶'}</span>
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-4 border-t border-[rgba(255,255,255,0.09)]">
          {questions.length === 0 ? (
            <p className="text-xs text-[rgba(226,232,240,0.3)] pt-3 pb-1">아직 준비된 질문이 없습니다</p>
          ) : (
            <ul className="space-y-1.5 pt-3 pb-1">
              {questions.map((q, i) => (
                <li key={q.id} className="group flex items-start gap-1.5">
                  <span className="text-xs text-[rgba(226,232,240,0.3)] flex-shrink-0 mt-0.5 w-4">{i + 1}.</span>
                  <span className="flex-1 text-xs text-[rgba(226,232,240,0.8)] leading-relaxed">{q.text}</span>
                  <button onClick={() => save(questions.filter(x => x.id !== q.id))}
                    className="flex-shrink-0 text-xs text-[rgba(226,232,240,0.2)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">삭제</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 mt-3">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addQuestion() }}
              placeholder="질문 입력 후 Enter"
              className="flex-1 text-xs bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 focus:outline-none placeholder-[rgba(226,232,240,0.3)]" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 내 피드백 뷰 ─────────────────────────────────────────────────────────────
function MyFeedbackView() {
  const supabase = createClient()
  const [feedbacks, setFeedbacks] = useState<MyFeedback[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('이번 달')
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set([currentMonth()]))
  const [addingMonth, setAddingMonth] = useState<string | null>(null)
  const [formContent, setFormContent] = useState('')
  const [formMember, setFormMember] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('my_feedback').select('id, month, content, feedback_type, feedback_date, from_member, created_at').order('created_at', { ascending: false }),
      fetchMembers(),
    ]).then(([{ data }, ms]) => {
      setFeedbacks((data ?? []) as MyFeedback[])
      setMembers(ms)
      setLoading(false)
    })
  }, [])

  const filteredFeedbacks = useMemo(() =>
    feedbacks.filter(f => inPeriod(f.feedback_date ?? f.created_at, period)),
    [feedbacks, period]
  )

  const months = useMemo(() => {
    const monthSet = new Set<string>(filteredFeedbacks.map(f => f.month))
    const start = getPeriodStart(period)
    if (!start || new Date() >= start) monthSet.add(currentMonth())
    return Array.from(monthSet).sort().reverse()
  }, [filteredFeedbacks, period])

  useEffect(() => {
    const latest = months[0] ?? currentMonth()
    setOpenMonths(new Set([latest]))
  }, [period])

  function toggleMonth(month: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month); else next.add(month)
      return next
    })
  }

  function openAddForm(month: string) {
    setAddingMonth(month); setFormContent(''); setFormMember('')
    setFormDate(new Date().toISOString().slice(0, 10))
    setOpenMonths(prev => new Set([...prev, month]))
  }

  async function saveAdd() {
    if (!addingMonth || !stripHtml(formContent)) return
    setSaving(true)
    const month = formDate.slice(0, 7)
    const { data, error } = await supabase.from('my_feedback')
      .insert({ month, feedback_date: formDate, from_member: formMember.trim() || null, content: formContent, feedback_type: null })
      .select('id, month, content, feedback_type, feedback_date, from_member, created_at').single()
    if (!error && data) { setFeedbacks(prev => [data as MyFeedback, ...prev]); setAddingMonth(null); setFormContent(''); setFormMember('') }
    setSaving(false)
  }

  async function deleteFeedback(id: string) {
    await supabase.from('my_feedback').delete().eq('id', id)
    setFeedbacks(prev => prev.filter(f => f.id !== id))
  }

  async function assignType(id: string, type: FeedbackType | null) {
    await supabase.from('my_feedback').update({ feedback_type: type }).eq('id', id)
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, feedback_type: type } : f))
  }

  if (loading) return <div className="p-8 text-sm text-[rgba(226,232,240,0.4)]">불러오는 중...</div>

  return (
    <div className="flex gap-6 w-full min-h-0">
      <div className="flex-[65] min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`${pill} ${period === p ? pOn : pOff}`}>{p}</button>
          ))}
          <span className="text-xs text-[rgba(226,232,240,0.4)] ml-auto">{filteredFeedbacks.length}건</span>
        </div>
        {addingMonth !== currentMonth() && (
          <button onClick={() => openAddForm(currentMonth())}
            className="text-xs bg-[rgba(255,255,255,0.06)] border border-dashed border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)] rounded-2xl px-4 py-2.5 w-full transition-colors">
            + 피드백 추가 ({formatMonth(currentMonth())})
          </button>
        )}
        <div className="space-y-2">
          {months.map((month, idx) => {
            const isOpen = openMonths.has(month)
            const items = filteredFeedbacks.filter(f => f.month === month)
            const isAddingHere = addingMonth === month
            return (
              <div key={month} className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <button onClick={() => toggleMonth(month)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="text-sm font-semibold text-[rgba(226,232,240,0.8)]">{isOpen ? '▼' : '▶'} {formatMonth(month)}</span>
                    <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] px-2 py-0.5 rounded-full">{items.length}건</span>
                    {idx === 0 && <span className="text-[10px] text-[#2D5A45] bg-[#BADEC8]/30 border border-[#BADEC8]/40 px-2 py-0.5 rounded-full">최신</span>}
                  </button>
                  {!isAddingHere && (
                    <button onClick={() => openAddForm(month)} className={`text-xs ${pOff} !text-[10px] !px-2.5 !py-1`}>+ 추가</button>
                  )}
                </div>
                {isAddingHere && (
                  <div className="px-5 pb-5 border-t border-[rgba(255,255,255,0.09)]">
                    <div className="pt-4 space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-[rgba(226,232,240,0.4)] mb-1 block">날짜</label>
                          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                            className="text-sm bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-2xl px-3 py-1.5 focus:outline-none w-full" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-[rgba(226,232,240,0.4)] mb-1 block">피드백 준 팀원</label>
                          <select value={formMember} onChange={e => setFormMember(e.target.value)}
                            className="text-sm bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-2xl px-3 py-1.5 focus:outline-none w-full text-[rgba(226,232,240,0.7)] [&>option]:bg-[#26282E]">
                            <option value="">선택 안 함</option>
                            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-2xl overflow-hidden">
                        <TiptapEditor dark value={formContent} onChange={setFormContent} onSubmit={saveAdd} autoFocus minHeight={80} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setAddingMonth(null); setFormContent('') }} className={`${pill} ${pOff}`}>취소</button>
                        <button onClick={saveAdd} disabled={saving || !stripHtml(formContent)} className={`${pill} ${pOn} disabled:opacity-40`}>
                          {saving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {isOpen && items.length > 0 && (
                  <div className="px-5 pb-4 space-y-2 border-t border-[rgba(255,255,255,0.09)] pt-3">
                    {items.sort((a, b) => (b.feedback_date ?? b.created_at).localeCompare(a.feedback_date ?? a.created_at)).map(item => (
                      <div key={item.id} className="group flex items-start gap-2 bg-[rgba(255,255,255,0.06)] rounded-2xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {item.feedback_type && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${FEEDBACK_TYPE_STYLE[item.feedback_type]}`}>{item.feedback_type}</span>
                            )}
                            {item.from_member && <span className="text-xs font-medium text-[rgba(226,232,240,0.5)]">{item.from_member}</span>}
                            {item.feedback_date && <span className="text-xs text-[rgba(226,232,240,0.4)]">{item.feedback_date.slice(5).replace('-', '/')}</span>}
                          </div>
                          <MarkdownContent content={item.content} dark className="text-sm leading-relaxed" />
                        </div>
                        <button onClick={() => deleteFeedback(item.id)}
                          className="flex-shrink-0 text-xs text-[rgba(226,232,240,0.3)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all px-1 py-0.5">삭제</button>
                      </div>
                    ))}
                  </div>
                )}
                {isOpen && items.length === 0 && !isAddingHere && (
                  <div className="px-5 pb-4 border-t border-[rgba(255,255,255,0.09)] pt-3">
                    <p className="text-xs text-[rgba(226,232,240,0.4)]">이 달의 피드백이 없습니다</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex-[35] min-w-0 space-y-4">
        <AnalysisPanel feedbacks={filteredFeedbacks} onAssignType={assignType} />
        <KeywordsPanel feedbacks={filteredFeedbacks} />
        <NextQuestionsPanel />
      </div>
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function OneOnOnePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([])
  const [sessions, setSessions] = useState<OneOnOne[]>([])
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({})
  const [view, setView] = useState<'team' | 'my-feedback'>('team')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [org, setOrg] = useState<OrgTeam[]>([])
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set())
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      fetchMembers(),
      fetchArchivedMembers(),
      supabase.from('one_on_ones').select('*').order('session_date', { ascending: false }),
      supabase.from('members').select('id, role').not('role', 'is', null),
    ]).then(([ms, archived, { data: sessData }, { data: roleData }]) => {
      setMembers(ms)
      setArchivedMembers(archived)
      setSessions((sessData ?? []) as OneOnOne[])
      const roles: Record<string, string> = {}
      for (const r of (roleData ?? []) as { id: string; role: string }[]) {
        if (r.role) roles[r.id] = r.role
      }
      setMemberRoles(roles)
    })

    const storedOrg = localStorage.getItem('dashboard_org')
    if (storedOrg) { try { setOrg(JSON.parse(storedOrg)) } catch {} }
    const storedHidden = localStorage.getItem('oneOnOne_hidden_teams')
    if (storedHidden) { try { setHiddenTeams(new Set(JSON.parse(storedHidden))) } catch {} }

    supabase.from('user_preferences').select('value').eq('key', 'org').single()
      .then(({ data }) => {
        if (data?.value) {
          setOrg(data.value as OrgTeam[])
          localStorage.setItem('dashboard_org', JSON.stringify(data.value))
        }
      })
  }, [])

  async function createSession(memberId: string) {
    const { data } = await supabase.from('one_on_ones').insert({ member_id: memberId }).select('id').single()
    if (data) router.push(`/one-on-one/${memberId}/${(data as { id: string }).id}`)
  }

  function toggleTeam(teamId: string) {
    setHiddenTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId); else next.add(teamId)
      localStorage.setItem('oneOnOne_hidden_teams', JSON.stringify(Array.from(next)))
      return next
    })
  }

  const grouped = useMemo(() => {
    if (org.length === 0) {
      const groups = [
        { label: '팀장', teamId: '팀장', list: members.filter(m => m.part === '팀장') },
        { label: '코어파트', teamId: '코어', list: members.filter(m => m.part === '코어') },
        { label: '비즈파트', teamId: '비즈', list: members.filter(m => m.part === '비즈') },
      ].filter(g => g.list.length > 0)
      return groups
    }
    const groups = org.map(team => {
      const list = members.filter(m =>
        team.parts.length === 0 ? m.part === team.id : team.parts.some(p => p.id === m.part)
      )
      return { label: team.name, teamId: team.id, list }
    }).filter(g => g.list.length > 0)
    const assignedIds = new Set(groups.flatMap(g => g.list.map(m => m.id)))
    const unassigned = members.filter(m => !assignedIds.has(m.id))
    if (unassigned.length > 0) groups.push({ label: '미배정', teamId: '__unassigned', list: unassigned })
    return groups
  }, [org, members])

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 20,
    overflow: 'hidden',
  }

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-4">
        <h1 className="text-xl font-bold text-[#E2E8F0]">1on1</h1>
        <div className="flex items-center bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-full p-1">
          <button onClick={() => setView('team')}
            className={`text-xs px-3.5 py-1.5 rounded-full transition-all font-medium ${view === 'team' ? 'bg-[#4C7FE0] text-white shadow-sm' : 'text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]'}`}>
            팀원 1on1
          </button>
          <button onClick={() => setView('my-feedback')}
            className={`text-xs px-3.5 py-1.5 rounded-full transition-all font-medium ${view === 'my-feedback' ? 'bg-[#4C7FE0] text-white shadow-sm' : 'text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]'}`}>
            내 피드백
          </button>
        </div>
        {view === 'team' && (
          <Link href="/one-on-one/template" className={`${pill} ${pOff} ml-auto`}>템플릿 관리</Link>
        )}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">

        {/* 팀원 1on1 뷰 */}
        {view === 'team' && (
          <div className="flex gap-5 pb-6">
            {/* LEFT: 팀별 팀원 리스트 */}
            <div className="flex-[58] min-w-0 flex flex-col gap-3">
              {/* 팀 필터 */}
              {grouped.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {grouped.map(g => (
                    <button key={g.teamId} onClick={() => toggleTeam(g.teamId)}
                      className={`${pill} ${!hiddenTeams.has(g.teamId) ? pOn : pOff}`}>
                      {g.label}
                      <span className="ml-1 opacity-60 text-[10px]">{g.list.length}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 팀별 섹션 */}
              {grouped.filter(g => !hiddenTeams.has(g.teamId)).map(({ label, list }) => (
                <div key={label} style={card}>
                  {/* 팀 헤더 */}
                  <div className="px-4 py-2.5 flex items-center gap-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'rgba(226,232,240,0.4)' }}>{label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(76,127,224,0.1)', color: '#A8C4F0', border: '1px solid rgba(76,127,224,0.18)' }}>
                      {list.length}명
                    </span>
                  </div>
                  {/* 팀원 행 목록 */}
                  {list.map(member => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      sessions={sessions}
                      role={memberRoles[member.id]}
                      onNewSession={createSession}
                    />
                  ))}
                </div>
              ))}

              {/* 퇴사자 아카이브 */}
              {archivedMembers.length > 0 && (
                <div style={card}>
                  <button onClick={() => setArchiveOpen(p => !p)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-[rgba(255,255,255,0.025)] transition-colors">
                    <span className="text-xs font-semibold" style={{ color: 'rgba(226,232,240,0.35)' }}>퇴사자 아카이브</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.3)' }}>
                        {archivedMembers.length}명
                      </span>
                      <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.3)' }}>{archiveOpen ? '▼' : '▶'}</span>
                    </div>
                  </button>
                  {archiveOpen && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {archivedMembers.map(member => {
                        const memberSessions = sessions.filter(s => s.member_id === member.id)
                        const last = memberSessions[0]
                        return (
                          <div key={member.id} className="flex items-center gap-3 px-4 py-2.5"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.25)' }}>
                              {member.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium" style={{ color: 'rgba(226,232,240,0.4)' }}>{member.name}</p>
                              <p className="text-[10px]" style={{ color: 'rgba(226,232,240,0.25)' }}>
                                {last?.session_date ? `마지막 ${format(parseISO(last.session_date), 'M/d', { locale: ko })}` : '기록없음'}
                                {memberSessions.length > 0 && ` · ${memberSessions.length}회`}
                              </p>
                            </div>
                            {memberSessions.length > 0 && (
                              <Link href={`/one-on-one/${member.id}`}
                                className="text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                                style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.35)' }}>
                                기록 열람
                              </Link>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Availability 패널 */}
            <div className="flex-[42] min-w-0">
              <AvailabilityPanel members={members} sessions={sessions} />
            </div>
          </div>
        )}

        {/* 내 피드백 뷰 */}
        {view === 'my-feedback' && <MyFeedbackView />}
      </div>
    </div>
  )
}
