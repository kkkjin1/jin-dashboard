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
import { Search, Users, CheckCircle2, AlertCircle } from 'lucide-react'
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

// 팀원 행의 "오른쪽 메타 클러스터" 컬럼 구조 — 팀 · 진행 상태 · 다음 일정 · 메모 · 구분선 · 액션.
// 정체성(아바타+이름) 영역은 이 grid 밖에서 flex-1로 남는 폭을 흡수하고, 이 grid는 항상
// 고정폭이라 화면이 아무리 넓어져도 팀/진행상태/다음일정/메모/액션이 모든 행에서 같은
// x좌표에 정렬된다. Header와 Row가 이 상수를 그대로 공유한다.
const MEMBER_META_COLS = '72px 92px 90px 58px 1px 172px'

function daysRingColor(d: number | null) {
  if (d === null || d >= 30) return 'rgba(235,166,152,0.45)'
  if (d >= 14) return 'rgba(243,228,130,0.45)'
  return 'rgba(186,222,200,0.45)'
}

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

// ─── 팀원 목록 컬럼 헤더 (MemberRow와 동일한 구조/그리드 공유) ──────────────────
function MemberListHeader() {
  const col = 'text-[9px] font-semibold uppercase tracking-wide text-center'
  const colStyle = { color: 'rgba(226,232,240,0.28)' }
  return (
    <div className="flex items-center justify-between gap-4 px-5 pb-1.5">
      <div className="flex items-center gap-3 min-w-[150px] max-w-[480px]" style={{ flex: '1 1 260px' }}>
        <span className="w-[38px] h-[38px] flex-shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap" style={colStyle}>팀원</span>
      </div>
      <div className="grid items-center gap-2.5 flex-shrink-0" style={{ gridTemplateColumns: MEMBER_META_COLS }}>
        <span className={col} style={colStyle}>팀</span>
        <span className={col} style={colStyle}>진행 상태</span>
        <span className={col} style={colStyle}>다음 일정</span>
        <span className={col} style={colStyle}>메모</span>
        <span />
        <span />
      </div>
    </div>
  )
}

// ─── 팀원 행 ──────────────────────────────────────────────────────────────────
function MemberRow({ member, sessions, role, teamLabel, onNewSession }: {
  member: Member; sessions: OneOnOne[]; role?: string; teamLabel: string; onNewSession: (id: string) => void
}) {
  const ms = sessions.filter(s => s.member_id === member.id)
  const last = ms[0]
  const days = last?.session_date ? differenceInDays(new Date(), parseISO(last.session_date)) : null
  const noteCount = last?.notes?.length ?? 0

  const roleStyle: React.CSSProperties | undefined =
    role === '팀장' ? { background: 'rgba(76,127,224,0.15)', color: '#A8C4F0', border: '1px solid rgba(76,127,224,0.25)' }
    : role === '파트장' ? { background: 'rgba(147,107,224,0.15)', color: '#C4A8F0', border: '1px solid rgba(147,107,224,0.25)' }
    : undefined

  const chipStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }}>

      {/* 정체성: 아바타 + 이름 + 직책 + "마지막 O/O · N회" 한 줄 요약 — 남는 폭을 흡수하되 480px 상한 */}
      <div className="flex items-center gap-3 min-w-[150px] max-w-[480px]" style={{ flex: '1 1 260px' }}>
        <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(226,232,240,0.6)', boxShadow: `0 0 0 2px ${daysRingColor(days)}` }}>
          {member.name[0]}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold truncate" style={{ color: '#E2E8F0' }}>{member.name}</span>
            {roleStyle && <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={roleStyle}>{role}</span>}
          </div>
          <p className="text-[11px] truncate" style={{ color: 'rgba(226,232,240,0.35)' }}>
            {last?.session_date
              ? <>마지막 {format(parseISO(last.session_date), 'M/d (E)', { locale: ko })}<span className="mx-1 opacity-50">·</span>{ms.length}회</>
              : (ms.length > 0 ? `기록 ${ms.length}회 · 최근 날짜 없음` : '아직 진행한 1on1이 없음')}
          </p>
        </div>
      </div>

      {/* 오른쪽 메타 클러스터: 팀 · 진행 상태 · 다음 일정 · 메모 · 액션 — Header와 동일한 grid */}
      <div className="grid items-center gap-2.5 flex-shrink-0" style={{ gridTemplateColumns: MEMBER_META_COLS }}>
        <div className="flex justify-center">
          <span className="text-[10px] px-2.5 py-1 rounded-full truncate max-w-full" style={{ ...chipStyle, color: 'rgba(226,232,240,0.45)' }}>
            {teamLabel}
          </span>
        </div>

        <div className="flex justify-center">
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${daysBadgeClass(days)}`}>
            {daysLabel(days)}
          </span>
        </div>

        <div className="flex justify-center">
          {last?.next_appointment_date ? (
            <span className="text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap" style={{ ...chipStyle, color: 'rgba(226,232,240,0.55)' }}>
              {format(parseISO(last.next_appointment_date), 'M/d (E)', { locale: ko })}
            </span>
          ) : (
            <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.2)' }}>—</span>
          )}
        </div>

        <div className="flex justify-center">
          {noteCount > 0 ? (
            <span className="text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap" style={{ ...chipStyle, color: 'rgba(226,232,240,0.45)' }}>
              {noteCount}건
            </span>
          ) : (
            <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.2)' }}>—</span>
          )}
        </div>

        <div className="w-px h-5 justify-self-center" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* 액션 버튼 — 항상 노출(hover 조건 제거). "기록 보기"는 세션이 없으면 invisible로
            자리만 유지 — 그래야 앞의 팀/진행상태/다음일정/메모 컬럼이 행마다 밀리지 않는다. */}
        <div className="flex items-center justify-end gap-1.5">
          {ms.length > 0 ? (
            <Link href={`/one-on-one/${member.id}`}
              className="text-[10px] px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
              style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.5)' }}>
              기록 보기
            </Link>
          ) : (
            <span className="text-[10px] px-2.5 py-1 whitespace-nowrap invisible">기록 보기</span>
          )}
          <button onClick={() => onNewSession(member.id)}
            className="text-[10px] px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap font-semibold"
            style={{ background: 'rgba(76,127,224,0.15)', border: '1px solid rgba(76,127,224,0.3)', color: '#A8C4F0' }}>
            1on1 진행
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 우선순위 패널의 한 줄 (아바타 + 이름 + 오른쪽 정보) ─────────────────────────
function PriorityRow({ member, right }: { member: Member; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(226,232,240,0.55)' }}>
        {member.name[0]}
      </div>
      <span className="flex-1 text-[11.5px] truncate" style={{ color: 'rgba(226,232,240,0.75)' }}>{member.name}</span>
      {right}
    </div>
  )
}

// ─── 우선순위 패널 — 면담 필요 상위 / 다가오는 1on1 / 면담 최다 TOP3 ───────────────
// 팀원 목록 카드와 항상 같은 높이로 늘어나며(부모 flex의 기본 stretch), 늘어난 높이는
// 3개 섹션에 고르게 분배된다.
function PriorityPanel({ members, sessions }: { members: Member[]; sessions: OneOnOne[] }) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const withDays = members.map(m => {
    const last = sessions.find(s => s.member_id === m.id)
    const days = last?.session_date ? differenceInDays(now, parseISO(last.session_date)) : null
    return { member: m, days }
  })

  // 면담 필요 상위 3명 — daysBadgeClass의 노랑/빨강 기준(14일 이상 또는 기록 없음)과 동일한 기준으로 필터
  const needingAttention = withDays
    .filter(x => x.days === null || x.days >= 14)
    .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity))
    .slice(0, 3)

  const upcomingTop3 = members
    .map(m => ({ member: m, date: sessions.find(s => s.member_id === m.id)?.next_appointment_date }))
    .filter((x): x is { member: Member; date: string } => !!x.date && x.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)

  const mostActive = members
    .map(m => ({ member: m, count: sessions.filter(s => s.member_id === m.id).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  const sections: { title: string; empty: string; items: React.ReactNode[] }[] = [
    {
      title: '🔴 면담 필요 상위',
      empty: '면담이 필요한 팀원이 없습니다',
      items: needingAttention.map(({ member, days }) => (
        <PriorityRow key={member.id} member={member}
          right={<span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${daysBadgeClass(days)}`}>{daysLabel(days)}</span>} />
      )),
    },
    {
      title: '📅 다가오는 1on1',
      empty: '예정된 일정이 없습니다',
      items: upcomingTop3.map(({ member, date }) => (
        <PriorityRow key={member.id} member={member}
          right={<span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.4)' }}>{format(parseISO(date), 'M/d (E)', { locale: ko })}</span>} />
      )),
    },
    {
      title: '⭐ 면담 최다 TOP3',
      empty: '아직 진행된 1on1이 없습니다',
      items: mostActive.map(({ member, count }) => (
        <PriorityRow key={member.id} member={member}
          right={<span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap"
            style={{ background: 'rgba(186,222,200,0.4)', color: '#2D5A45', borderColor: 'rgba(186,222,200,0.55)' }}>{count}회</span>} />
      )),
    },
  ]

  return (
    <div className="flex-[1_1_0%] min-w-[280px] rounded-3xl p-[18px] flex flex-col"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <p className="text-[12.5px] font-bold mb-0.5" style={{ color: '#E2E8F0' }}>우선순위</p>
      <p className="text-[10.5px] mb-3.5" style={{ color: 'rgba(226,232,240,0.35)' }}>이번 주 챙길 팀원</p>
      <div className="flex-1 flex flex-col justify-between">
        {sections.map((s, i) => (
          <div key={s.title} className={i > 0 ? 'mt-4 pt-3.5' : ''} style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.07)' } : undefined}>
            <p className="text-[10.5px] font-semibold mb-2" style={{ color: 'rgba(226,232,240,0.5)' }}>{s.title}</p>
            <div className="space-y-1">
              {s.items.length > 0 ? s.items : <p className="text-[10.5px]" style={{ color: 'rgba(226,232,240,0.25)' }}>{s.empty}</p>}
            </div>
          </div>
        ))}
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
                      <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-2xl overflow-hidden px-3 py-2">
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
  const [memberQuery, setMemberQuery]   = useState('')
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

  const visibleGroups = useMemo(() => {
    const base = selectedTeamId === '__all' ? grouped : grouped.filter(g => g.teamId === selectedTeamId)
    const q = memberQuery.trim()
    if (!q) return base
    return base.map(g => ({ ...g, list: g.list.filter(m => m.name.includes(q)) })).filter(g => g.list.length > 0)
  }, [grouped, selectedTeamId, memberQuery])

  function teamPill(id: string, label: string, count: number) {
    const active = selectedTeamId === id
    return (
      <button key={id} onClick={() => setSelectedTeamId(id)} className={`${pill} ${active ? pOn : pOff}`}>
        {label} <span className="opacity-60">{count}</span>
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

        {/* 탭 바 */}
        <div className="flex items-center gap-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {(['team', 'my-feedback'] as const).map(v => {
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
          <div className="h-full overflow-y-auto scrollbar-hide pt-4 pb-6">
            {/* Summary / 필터 / 팀원 목록이 동일한 콘텐츠 폭 기준을 공유 (셋 다 이 안에서 정렬) */}
            <div className="w-full">

            {/* 통계 카드 3종 */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: '전체 팀원', value: stats.total, unit: '명', accent: 'rgba(76,127,224,0.14)', border: 'rgba(76,127,224,0.22)', color: '#A8C4F0', icon: Users },
                { label: '이번달 완료', value: stats.doneThisMonth, unit: `/ ${stats.total}명`, accent: 'rgba(186,222,200,0.1)', border: 'rgba(186,222,200,0.22)', color: '#BADEC8', icon: CheckCircle2 },
                { label: '면담 필요', value: stats.needsMeeting, unit: '명', accent: 'rgba(235,166,152,0.1)', border: 'rgba(235,166,152,0.22)', color: '#EBA698', icon: AlertCircle },
              ].map(c => (
                <div key={c.label} className="rounded-2xl px-4 py-2.5 flex items-center gap-2.5"
                  style={{ background: c.accent, border: `1px solid ${c.border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <c.icon size={14} style={{ color: c.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] mb-0.5 truncate" style={{ color: 'rgba(226,232,240,0.45)' }}>{c.label}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold" style={{ color: c.color }}>{c.value}</span>
                      <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.35)' }}>{c.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 필터 + 검색 바 (팀 필터 · 퇴사자 · 검색을 한 줄로 통합) — 필터 묶음은 컨트롤로, 상태 배지는 데이터로 구분 */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <div className="flex items-center gap-1 flex-wrap rounded-full p-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
                {teamPill('__all', '전체', members.length)}
                {grouped.map(g => teamPill(g.teamId, g.label, g.list.length))}
                {archivedMembers.length > 0 && teamPill('__archived', '퇴사자', archivedMembers.length)}
              </div>
              <div className="relative ml-auto" style={{ width: 200 }}>
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(226,232,240,0.3)' }} />
                <input value={memberQuery} onChange={e => setMemberQuery(e.target.value)} placeholder="팀원 검색"
                  className="w-full text-xs bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full pl-8 pr-3 py-1.5 focus:outline-none placeholder-[rgba(226,232,240,0.3)]"
                  style={{ color: 'rgba(226,232,240,0.8)' }} />
              </div>
            </div>

            <div className="flex gap-6 items-stretch">
              {/* 메인: 팀원 목록 / 퇴사자 아카이브 */}
              <div className={`min-w-0 ${selectedTeamId !== '__archived' ? 'flex-[3_1_0%]' : 'w-full'}`}>

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
                  visibleGroups.length === 0 ? (
                    <p className="text-xs px-1 py-6 text-center" style={{ color: 'rgba(226,232,240,0.3)' }}>검색 결과가 없습니다</p>
                  ) : (
                    <div className="space-y-5">
                      {visibleGroups.map(({ label, teamId, list }) => {
                        // 미배정 그룹은 섹션 타이틀을 "팀원목록"으로 (실제 팀이 생기면 그 팀명은 그대로 유지).
                        // teamLabel prop(각 행의 "팀" 칩)은 계속 원래 label을 써서 팀 배정 여부를 정확히 표시.
                        const sectionTitle = teamId === '__unassigned' ? '팀원목록' : label
                        return (
                          <div key={teamId}>
                            {/* 섹션 타이틀 + 컬럼 헤더 + 팀원 행을 전부 같은 박스 안에 넣는다 — 타이틀이 박스 밖에
                                있으면 그만큼 목록 카드가 옆 우선순위 패널보다 짧아 보였음. overflow-x-auto는 컨테이너가
                                컬럼 최소폭보다 좁아지는 극단적인 경우에도 깨지지 않고 가로 스크롤로 대응하는
                                안전장치(평소엔 트리거 안 됨). */}
                            <div className="overflow-x-auto scrollbar-hide">
                              <div style={{ width: 'max-content', minWidth: '100%' }}>
                                <div className="rounded-2xl overflow-hidden"
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                  <div className="flex items-center gap-3 px-5 pt-4 pb-2">
                                    <span className="text-xs font-semibold uppercase tracking-wide"
                                      style={{ color: 'rgba(226,232,240,0.38)' }}>{sectionTitle}</span>
                                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                                  </div>
                                  <MemberListHeader />
                                  {list.map(member => (
                                    <MemberRow key={member.id} member={member} sessions={sessions}
                                      role={memberRoles[member.id]} teamLabel={label} onNewSession={createSession} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>

              {/* 보조: 우선순위 패널 — 항상 노출, 목록 카드와 같은 높이로 늘어남 */}
              {selectedTeamId !== '__archived' && (
                <PriorityPanel members={members} sessions={sessions} />
              )}
            </div>
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
