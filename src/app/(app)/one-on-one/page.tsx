'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchArchivedMembers, fetchMembers } from '@/lib/tasks'
import type { Member, OneOnOne, MyFeedback, FeedbackType } from '@/types'
import { format, parseISO, differenceInDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import dynamic from 'next/dynamic'
import MarkdownContent from '@/components/MarkdownContent'
import { useOrgData } from '@/hooks/useOrgData'
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

type Period = '이번 주' | '이번 달' | '3개월' | '전체'
const PERIODS: Period[] = ['이번 주', '이번 달', '3개월', '전체']

function getPeriodStart(period: Period): Date | null {
  if (period === '전체') return null
  const now = new Date()
  if (period === '이번 주') {
    const d = new Date(now); const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); d.setHours(0, 0, 0, 0); return d
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

function daysBadgeClass(d: number | null) {
  if (d === null || d >= 30) return 'bg-[#EBA698]/40 text-[#6B2D25] border-[#EBA698]/55'
  if (d >= 14) return 'bg-[#F3E482]/50 text-[#5A4A10] border-[#F3E482]/60'
  return 'bg-[#BADEC8]/40 text-[#2D5A45] border-[#BADEC8]/55'
}

function daysLabel(d: number | null) {
  if (d === null) return '면담없음'
  if (d === 0) return '오늘'
  return `${d}일 전`
}

// ─── 팀원 행 ──────────────────────────────────────────────────────────────────
function MemberRow({ member, sessions, role, onNewSession }: {
  member: Member; sessions: OneOnOne[]; role?: string; onNewSession: (id: string) => void
}) {
  const ms = sessions.filter(s => s.member_id === member.id)
  const last = ms[0]
  const days = last?.session_date ? differenceInDays(new Date(), parseISO(last.session_date)) : null

  const roleStyle: React.CSSProperties | undefined =
    role === '팀장' ? { background: 'rgba(76,127,224,0.15)', color: '#A8C4F0', border: '1px solid rgba(76,127,224,0.25)' }
    : role === '파트장' ? { background: 'rgba(147,107,224,0.15)', color: '#C4A8F0', border: '1px solid rgba(147,107,224,0.25)' }
    : undefined

  return (
    <div className="group flex items-center gap-3 px-5 py-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }}>

      {/* 아바타 */}
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(226,232,240,0.55)' }}>
        {member.name[0]}
      </div>

      {/* 이름 + 직책 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>{member.name}</span>
          {roleStyle && <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={roleStyle}>{role}</span>}
        </div>
      </div>

      {/* 마지막 면담 + 횟수 (항상 표시, 고정폭) */}
      <div className="flex-shrink-0 text-right" style={{ width: 80 }}>
        <p className="text-[10px]" style={{ color: 'rgba(226,232,240,0.38)' }}>
          {last?.session_date ? format(parseISO(last.session_date), 'M/d (E)', { locale: ko }) : '—'}
        </p>
        <p className="text-[9px] mt-0.5" style={{ color: 'rgba(226,232,240,0.22)' }}>
          {ms.length > 0 ? `${ms.length}회` : '기록없음'}
        </p>
      </div>

      {/* 경과일 배지 (고정폭, 항상 같은 위치) */}
      <div className="flex-shrink-0 flex justify-end" style={{ width: 64 }}>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${daysBadgeClass(days)}`}>
          {daysLabel(days)}
        </span>
      </div>

      {/* 액션 버튼 (고정폭 — 기록 버튼 없을 땐 빈 공간으로 너비 유지) */}
      <div className="flex-shrink-0 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: 88 }}>
        {ms.length > 0 ? (
          <Link href={`/one-on-one/${member.id}`}
            className="text-[10px] px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
            style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.5)' }}>
            기록
          </Link>
        ) : (
          <span className="text-[10px] px-2.5 py-1 whitespace-nowrap invisible">기록</span>
        )}
        <button onClick={() => onNewSession(member.id)}
          className="text-[10px] px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
          style={{ flex: 1, background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: '#A8C4F0' }}>
          + 신규
        </button>
      </div>
    </div>
  )
}

// ─── 분석 패널 ────────────────────────────────────────────────────────────────
function AnalysisPanel({ feedbacks, onAssignType }: { feedbacks: MyFeedback[]; onAssignType: (id: string, type: FeedbackType | null) => void }) {
  const tagged = feedbacks.filter(f => f.feedback_type != null)
  const untagged = feedbacks.filter(f => f.feedback_type == null)
  const grouped = ANALYSIS_TYPES.map(type => ({ type, items: tagged.filter(f => f.feedback_type === type) })).filter(g => g.items.length > 0)

  if (feedbacks.length === 0) return (
    <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-3xl px-5 py-6">
      <p className="text-xs font-semibold text-[rgba(226,232,240,0.5)] mb-2">피드백 분석</p>
      <p className="text-xs text-[rgba(226,232,240,0.35)]">피드백이 없습니다</p>
    </div>
  )

  return (
    <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-3xl px-5 py-4">
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
                  <button onClick={() => onAssignType(item.id, null)} className="flex-shrink-0 text-xs text-[rgba(226,232,240,0.2)] hover:text-[rgba(226,232,240,0.4)] opacity-0 group-hover:opacity-100 transition-all">해제</button>
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
                  <div className="mb-1.5"><MarkdownContent content={item.content} dark className="text-xs" /></div>
                  <div className="flex gap-1">
                    {ANALYSIS_TYPES.map(t => (
                      <button key={t} onClick={() => onAssignType(item.id, t)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 ${FEEDBACK_TYPE_STYLE[t]}`}>{t}</button>
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
const KO_STOPWORDS = new Set(['것','이','가','을','를','은','는','에서','에','으로','로','의','와','과','도','하다','합니다','했습니다','그리고','하지만','그런데','등','때','때문에','좀','더','같다','같아','같이','이런','저런','그런','어떤','어떻게','많이','조금','정말','너무','매우','굉장히','잘','안','못','아주','수','제','저','그','있','없','있는','없는','있어','없어','있습니다','없습니다','하는','하고','해서','해요','해줘','같은','위해','통해','대해','부분','경우','생각','느낌','것들','때문','거의','항상','가끔','보통','되는','되어','되고','이후','이전','또한','그래서','그래도','하면','하면서','하지','다시','먼저','같습니다'])

function KeywordsPanel({ feedbacks }: { feedbacks: MyFeedback[] }) {
  const keywords = useMemo(() => {
    const words = feedbacks.map(f => stripHtml(f.content)).join(' ')
      .split(/[\s,.\!\?:;()\[\]"'\n]+/).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(w => w.length >= 2 && !KO_STOPWORDS.has(w))
    const freq = new Map<string, number>()
    words.forEach(w => freq.set(w, (freq.get(w) ?? 0) + 1))
    return Array.from(freq.entries()).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 16)
  }, [feedbacks])

  return (
    <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-3xl px-5 py-4">
      <p className="text-xs font-semibold text-[rgba(226,232,240,0.5)] mb-1">공통 키워드</p>
      {keywords.length === 0
        ? <p className="text-xs text-[rgba(226,232,240,0.3)] mt-2">피드백이 쌓이면 추출됩니다</p>
        : <div className="flex flex-wrap gap-1.5 mt-3">
            {keywords.map(([word, count]) => (
              <span key={word} className={`text-xs px-2 py-0.5 rounded-full border ${count >= 5 ? 'bg-[#90A7D8]/25 border-[#90A7D8]/40 text-[#1E3A6B] font-semibold' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)]'}`}>
                {word} <span className="opacity-40 text-[10px]">{count}</span>
              </span>
            ))}
          </div>
      }
    </div>
  )
}

// ─── 다음 질문 준비 ───────────────────────────────────────────────────────────
function NextQuestionsPanel() {
  const [isOpen, setIsOpen] = useState(true)
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    try { const s = localStorage.getItem('oneOnOne_nextQuestions'); if (s) setQuestions(JSON.parse(s)) } catch {}
  }, [])

  function save(qs: { id: string; text: string }[]) {
    setQuestions(qs); try { localStorage.setItem('oneOnOne_nextQuestions', JSON.stringify(qs)) } catch {}
  }

  return (
    <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-3xl overflow-hidden">
      <button onClick={() => setIsOpen(p => !p)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.04)] transition-colors">
        <span className="text-xs font-semibold text-[rgba(226,232,240,0.7)]">다음 1on1 질문 준비</span>
        <div className="flex items-center gap-2">
          {questions.length > 0 && <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] px-2 py-0.5 rounded-full">{questions.length}개</span>}
          <span className="text-[10px] text-[rgba(226,232,240,0.3)]">{isOpen ? '▼' : '▶'}</span>
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-4 border-t border-[rgba(255,255,255,0.09)]">
          {questions.length === 0
            ? <p className="text-xs text-[rgba(226,232,240,0.3)] pt-3 pb-1">준비된 질문이 없습니다</p>
            : <ul className="space-y-1.5 pt-3 pb-1">
                {questions.map((q, i) => (
                  <li key={q.id} className="group flex items-start gap-1.5">
                    <span className="text-xs text-[rgba(226,232,240,0.3)] flex-shrink-0 mt-0.5 w-4">{i + 1}.</span>
                    <span className="flex-1 text-xs text-[rgba(226,232,240,0.8)] leading-relaxed">{q.text}</span>
                    <button onClick={() => save(questions.filter(x => x.id !== q.id))} className="flex-shrink-0 text-xs text-[rgba(226,232,240,0.2)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">삭제</button>
                  </li>
                ))}
              </ul>
          }
          <div className="flex gap-2 mt-3">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key !== 'Enter' || !input.trim()) return; save([...questions, { id: `${Date.now()}`, text: input.trim() }]); setInput('') }}
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
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function feedbackDraftKey(month: string) { return `feedback_draft_${month}` }
  function loadFeedbackDraft(month: string): { content: string; member: string; date: string } | null {
    try {
      const raw = localStorage.getItem(feedbackDraftKey(month))
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }
  function clearFeedbackDraft(month: string) {
    try { localStorage.removeItem(feedbackDraftKey(month)) } catch {}
  }
  function openAddForm(month: string) {
    const draft = loadFeedbackDraft(month)
    setAddingMonth(month)
    setFormContent(draft?.content ?? '')
    setFormMember(draft?.member ?? '')
    setFormDate(draft?.date ?? new Date().toISOString().slice(0, 10))
    setOpenMonths(p => new Set([...p, month]))
  }

  // 작성 중 초안 로컬 백업 — 저장 없이 이동/닫기 해도 폼을 다시 열면 복원됨
  useEffect(() => {
    if (!addingMonth) return
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(feedbackDraftKey(addingMonth), JSON.stringify({ content: formContent, member: formMember, date: formDate }))
      } catch {}
    }, 500)
    return () => clearTimeout(draftTimer.current)
  }, [formContent, formMember, formDate, addingMonth])

  useEffect(() => {
    Promise.all([
      supabase.from('my_feedback').select('id,month,content,feedback_type,feedback_date,from_member,created_at').order('created_at', { ascending: false }),
      fetchMembers(),
    ]).then(([{ data }, ms]) => { setFeedbacks((data ?? []) as MyFeedback[]); setMembers(ms); setLoading(false) })
  }, [])

  const filteredFeedbacks = useMemo(() => feedbacks.filter(f => inPeriod(f.feedback_date ?? f.created_at, period)), [feedbacks, period])
  const months = useMemo(() => {
    const s = new Set<string>(filteredFeedbacks.map(f => f.month))
    const start = getPeriodStart(period); if (!start || new Date() >= start) s.add(currentMonth())
    return Array.from(s).sort().reverse()
  }, [filteredFeedbacks, period])

  useEffect(() => { setOpenMonths(new Set([months[0] ?? currentMonth()])) }, [period])

  function toggleMonth(m: string) { setOpenMonths(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n }) }

  async function saveAdd() {
    if (!addingMonth || !stripHtml(formContent)) return; setSaving(true)
    const month = formDate.slice(0, 7)
    const { data, error } = await supabase.from('my_feedback').insert({ month, feedback_date: formDate, from_member: formMember.trim() || null, content: formContent, feedback_type: null }).select('id,month,content,feedback_type,feedback_date,from_member,created_at').single()
    if (!error && data) { setFeedbacks(prev => [data as MyFeedback, ...prev]); clearFeedbackDraft(addingMonth); setAddingMonth(null); setFormContent(''); setFormMember('') }
    setSaving(false)
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
          {PERIODS.map(p => <button key={p} onClick={() => setPeriod(p)} className={`${pill} ${period === p ? pOn : pOff}`}>{p}</button>)}
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
              <div key={month} className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-3xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <button onClick={() => toggleMonth(month)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="text-sm font-semibold text-[rgba(226,232,240,0.8)]">{isOpen ? '▼' : '▶'} {formatMonth(month)}</span>
                    <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] px-2 py-0.5 rounded-full">{items.length}건</span>
                    {idx === 0 && <span className="text-[10px] text-[#2D5A45] bg-[#BADEC8]/30 border border-[#BADEC8]/40 px-2 py-0.5 rounded-full">최신</span>}
                  </button>
                  {!isAddingHere && <button onClick={() => openAddForm(month)} className={`text-xs ${pOff} !text-[10px] !px-2.5 !py-1`}>+ 추가</button>}
                </div>
                {isAddingHere && (
                  <div className="px-5 pb-5 border-t border-[rgba(255,255,255,0.09)]">
                    <div className="pt-4 space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-[rgba(226,232,240,0.4)] mb-1 block">날짜</label>
                          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="text-sm bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-2xl px-3 py-1.5 focus:outline-none w-full" style={{ colorScheme: 'dark', color: 'rgba(226,232,240,0.8)' }} />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-[rgba(226,232,240,0.4)] mb-1 block">피드백 준 팀원</label>
                          <select value={formMember} onChange={e => setFormMember(e.target.value)} className="text-sm bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-2xl px-3 py-1.5 focus:outline-none w-full text-[rgba(226,232,240,0.7)] [&>option]:bg-[#26282E]">
                            <option value="">선택 안 함</option>
                            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-2xl overflow-hidden">
                        <TiptapEditor dark value={formContent} onChange={setFormContent} onSubmit={saveAdd} autoFocus minHeight={80} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { if (addingMonth) clearFeedbackDraft(addingMonth); setAddingMonth(null); setFormContent('') }} className={`${pill} ${pOff}`}>취소</button>
                        <button onClick={saveAdd} disabled={saving || !stripHtml(formContent)} className={`${pill} ${pOn} disabled:opacity-40`}>{saving ? '저장 중...' : '저장'}</button>
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
                            {item.feedback_type && <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${FEEDBACK_TYPE_STYLE[item.feedback_type]}`}>{item.feedback_type}</span>}
                            {item.from_member && <span className="text-xs font-medium text-[rgba(226,232,240,0.5)]">{item.from_member}</span>}
                            {item.feedback_date && <span className="text-xs text-[rgba(226,232,240,0.4)]">{item.feedback_date.slice(5).replace('-', '/')}</span>}
                          </div>
                          <MarkdownContent content={item.content} dark className="text-sm leading-relaxed" />
                        </div>
                        <button onClick={async () => { await supabase.from('my_feedback').delete().eq('id', item.id); setFeedbacks(prev => prev.filter(f => f.id !== item.id)) }}
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
  const [members, setMembers]           = useState<Member[]>([])
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([])
  const [sessions, setSessions]         = useState<OneOnOne[]>([])
  const [memberRoles, setMemberRoles]   = useState<Record<string, string>>({})
  const [view, setView]                 = useState<'team' | 'my-feedback'>('team')
  const { org } = useOrgData()
  const [selectedTeamId, setSelectedTeamId] = useState<string>('__all')
  const [archiveOpen, setArchiveOpen]   = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      fetchMembers(),
      fetchArchivedMembers(),
      supabase.from('one_on_ones').select('*').order('session_date', { ascending: false }),
      supabase.from('members').select('id,role').not('role', 'is', null),
    ]).then(([ms, archived, { data: sessData }, { data: roleData }]) => {
      setMembers(ms)
      setArchivedMembers(archived)
      setSessions((sessData ?? []) as OneOnOne[])
      const roles: Record<string, string> = {}
      for (const r of (roleData ?? []) as { id: string; role: string }[]) { if (r.role) roles[r.id] = r.role }
      setMemberRoles(roles)
    })
  }, [])

  async function createSession(memberId: string) {
    const { data } = await supabase.from('one_on_ones').insert({ member_id: memberId }).select('id').single()
    if (data) router.push(`/one-on-one/${memberId}/${(data as { id: string }).id}`)
  }

  const grouped = useMemo(() => {
    if (org.length === 0) {
      return members.length > 0 ? [{ label: '미배정', teamId: '__unassigned', list: members }] : []
    }
    const groups = org.map(team => ({
      label: team.name,
      teamId: team.id,
      list: members.filter(m => team.parts.length === 0 ? m.part === team.id : team.parts.some(p => p.id === m.part)),
    })).filter(g => g.list.length > 0)
    const assignedIds = new Set(groups.flatMap(g => g.list.map(m => m.id)))
    const unassigned = members.filter(m => !assignedIds.has(m.id))
    if (unassigned.length > 0) groups.push({ label: '미배정', teamId: '__unassigned', list: unassigned })
    return groups
  }, [org, members])

  // 통계
  const stats = useMemo(() => {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const needsMeeting = members.filter(m => {
      const last = sessions.find(s => s.member_id === m.id)
      if (!last?.session_date) return true
      return differenceInDays(now, parseISO(last.session_date)) >= 30
    })
    const doneThisMonth = members.filter(m =>
      sessions.some(s => s.member_id === m.id && s.session_date && parseISO(s.session_date) >= thisMonthStart)
    )
    return { total: members.length, doneThisMonth: doneThisMonth.length, needsMeeting: needsMeeting.length }
  }, [members, sessions])

  const visibleGroups = selectedTeamId === '__all'
    ? grouped
    : grouped.filter(g => g.teamId === selectedTeamId)

  const sidebarItem = (id: string, label: string, count: number) => {
    const active = selectedTeamId === id
    return (
      <button key={id} onClick={() => setSelectedTeamId(id)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left"
        style={{
          background: active ? 'rgba(76,127,224,0.14)' : 'transparent',
          color: active ? '#A8C4F0' : 'rgba(226,232,240,0.5)',
        }}>
        <span className="text-xs font-medium truncate">{label}</span>
        <span className="text-[10px] flex-shrink-0 ml-1.5 tabular-nums"
          style={{ color: active ? 'rgba(168,196,240,0.7)' : 'rgba(226,232,240,0.28)' }}>{count}</span>
      </button>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* ══ 상단 헤더 영역 ══════════════════════════════════════════════ */}
      <div className="flex-shrink-0 pt-6 pb-0">
        {/* 타이틀 + 버튼 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold" style={{ color: '#E2E8F0' }}>1on1</h1>
          {view === 'team' && (
            <Link href="/one-on-one/template" className={`${pill} ${pOff}`}>템플릿 관리</Link>
          )}
        </div>

        {/* 통계 카드 3종 */}
        {view === 'team' && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: '전체 팀원', value: stats.total, unit: '명', accent: 'rgba(76,127,224,0.18)', border: 'rgba(76,127,224,0.25)', color: '#A8C4F0' },
              { label: '이번달 완료', value: stats.doneThisMonth, unit: `/ ${stats.total}명`, accent: 'rgba(186,222,200,0.12)', border: 'rgba(186,222,200,0.25)', color: '#BADEC8' },
              { label: '면담 필요', value: stats.needsMeeting, unit: '명', accent: 'rgba(235,166,152,0.12)', border: 'rgba(235,166,152,0.25)', color: '#EBA698' },
            ].map(c => (
              <div key={c.label} className="rounded-2xl px-4 py-3"
                style={{ background: c.accent, border: `1px solid ${c.border}` }}>
                <p className="text-[10px] mb-1" style={{ color: 'rgba(226,232,240,0.45)' }}>{c.label}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</span>
                  <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.35)' }}>{c.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 탭 바 */}
        <div className="flex items-center gap-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {(['team', 'my-feedback'] as const).map((v, i) => {
            const label = v === 'team' ? '팀원 1on1' : '내 피드백'
            const active = view === v
            return (
              <button key={v} onClick={() => setView(v)}
                className="relative px-4 py-2.5 text-sm font-semibold transition-colors"
                style={{ color: active ? '#E2E8F0' : 'rgba(226,232,240,0.38)' }}>
                {label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                    style={{ background: '#4C7FE0' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ══ 콘텐츠 ════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* 팀원 1on1 */}
        {view === 'team' && (
          <div className="flex h-full gap-0">

            {/* 좌측 사이드바 */}
            <div className="flex-shrink-0 flex flex-col pt-4 pb-4 pr-2"
              style={{ width: 168, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest px-3 mb-2"
                style={{ color: 'rgba(226,232,240,0.25)' }}>팀</p>
              {sidebarItem('__all', '전체', members.length)}
              <div className="my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
              {grouped.map(g => sidebarItem(g.teamId, g.label, g.list.length))}

              {/* 구분선 + 퇴사자 */}
              {archivedMembers.length > 0 && (
                <>
                  <div className="mt-auto pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button onClick={() => setSelectedTeamId('__archived')}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left"
                      style={{
                        background: selectedTeamId === '__archived' ? 'rgba(255,255,255,0.06)' : 'transparent',
                        color: 'rgba(226,232,240,0.3)',
                      }}>
                      <span className="text-xs font-medium">퇴사자</span>
                      <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.2)' }}>{archivedMembers.length}</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 우측 콘텐츠 */}
            <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide pt-4 pb-6 pl-5">

              {/* 퇴사자 선택 시 */}
              {selectedTeamId === '__archived' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3"
                    style={{ color: 'rgba(226,232,240,0.35)' }}>퇴사자 아카이브</p>
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.04)' }}>
                    {archivedMembers.map((member, idx) => {
                      const ms = sessions.filter(s => s.member_id === member.id)
                      const last = ms[0]
                      return (
                        <div key={member.id} className="flex items-center gap-3 px-5 py-3"
                          style={idx !== 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : {}}>
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.25)' }}>
                            {member.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'rgba(226,232,240,0.4)' }}>{member.name}</p>
                            <p className="text-[10px]" style={{ color: 'rgba(226,232,240,0.25)' }}>
                              {last?.session_date ? `마지막 ${format(parseISO(last.session_date), 'M/d', { locale: ko })}` : '기록없음'}
                              {ms.length > 0 && ` · ${ms.length}회`}
                            </p>
                          </div>
                          {ms.length > 0 && (
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
                </div>
              )}

              {/* 팀원 목록 */}
              {selectedTeamId !== '__archived' && (
                <div className="space-y-5">
                  {visibleGroups.map(({ label, teamId, list }) => {
                    const teamDone = list.filter(m => {
                      const last = sessions.find(s => s.member_id === m.id)
                      if (!last?.session_date) return false
                      return differenceInDays(new Date(), parseISO(last.session_date)) < 30
                    }).length
                    return (
                      <div key={teamId}>
                        {/* 팀 섹션 헤더 */}
                        <div className="flex items-center gap-3 mb-2 px-1">
                          <span className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: 'rgba(226,232,240,0.38)' }}>{label}</span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                          <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.28)' }}>
                            {teamDone}/{list.length}명 완료
                          </span>
                        </div>
                        {/* 팀원 행들 */}
                        <div className="rounded-2xl overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {list.map(member => (
                            <MemberRow key={member.id} member={member} sessions={sessions}
                              role={memberRoles[member.id]} onNewSession={createSession} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 내 피드백 */}
        {view === 'my-feedback' && (
          <div className="h-full overflow-y-auto scrollbar-hide pt-4">
            <MyFeedbackView />
          </div>
        )}
      </div>
    </div>
  )
}
