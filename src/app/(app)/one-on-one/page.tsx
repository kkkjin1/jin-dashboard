'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchMembers } from '@/lib/tasks'
import type { Member, OneOnOne, MyFeedback, FeedbackType } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

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
const pOn  = 'bg-gray-900 text-white border-gray-900 shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

// ─── 분석 패널 ────────────────────────────────────────────────────────────────
function AnalysisPanel({ feedbacks, onAssignType }: { feedbacks: MyFeedback[]; onAssignType: (id: string, type: FeedbackType | null) => void }) {
  if (feedbacks.length === 0) {
    return (
      <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl px-5 py-6">
        <p className="text-xs font-semibold text-gray-500 mb-4">피드백 분석</p>
        <p className="text-sm text-gray-400">피드백이 없습니다</p>
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
    <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 mb-4">피드백 분석</p>
      <div className="space-y-4">
        {grouped.map(({ type, items }) => (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${FEEDBACK_TYPE_STYLE[type]}`}>
                {type}
              </span>
              <span className="text-xs text-gray-400">{items.length}건</span>
            </div>
            <ul className="space-y-1.5 pl-1">
              {items.map(item => (
                <li key={item.id} className="group flex items-start gap-2 border-l-2 border-white/60 pl-2">
                  <span className="flex-1 text-xs text-gray-600 leading-relaxed">{item.content}</span>
                  <button onClick={() => onAssignType(item.id, null)}
                    className="flex-shrink-0 text-xs text-gray-200 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-all">해제</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {untagged.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">미분류 ({untagged.length}건) — 분류하기:</p>
            <ul className="space-y-2 pl-1">
              {untagged.map(item => (
                <li key={item.id} className="bg-white/50 rounded-2xl border border-white/70 p-2">
                  <p className="text-xs text-gray-600 mb-1.5 leading-relaxed">{item.content}</p>
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

// ─── 공통 키워드 패널 ─────────────────────────────────────────────────────────
const KO_STOPWORDS = new Set(['것', '이', '가', '을', '를', '은', '는', '에서', '에', '으로', '로', '의', '와', '과', '도', '하다', '합니다', '했습니다', '그리고', '하지만', '그런데', '등', '때', '때문에', '좀', '더', '같다', '같아', '같이', '이런', '저런', '그런', '어떤', '어떻게', '많이', '조금', '정말', '너무', '매우', '굉장히', '잘', '안', '못', '아주', '수', '제', '저', '그', '있', '없', '있는', '없는', '있어', '없어', '있습니다', '없습니다', '하는', '하고', '해서', '해요', '해줘', '같은', '위해', '통해', '대해', '부분', '경우', '생각', '느낌', '것들', '때문', '거의', '항상', '가끔', '보통', '되는', '되어', '되고', '이후', '이전', '또한', '그래서', '그래도', '하면', '하면서', '하지', '다시', '먼저', '같습니다'])

function KeywordsPanel({ feedbacks }: { feedbacks: MyFeedback[] }) {
  const keywords = useMemo(() => {
    const allText = feedbacks.map(f => f.content).join(' ')
    const words = allText
      .split(/[\s,.\!\?:;()\[\]"'\n]+/)
      .map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, ''))
      .filter(w => w.length >= 2 && !KO_STOPWORDS.has(w))
    const freq = new Map<string, number>()
    words.forEach(w => freq.set(w, (freq.get(w) ?? 0) + 1))
    return Array.from(freq.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
  }, [feedbacks])

  if (keywords.length === 0) return (
    <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 mb-2">공통 키워드</p>
      <p className="text-xs text-gray-300">피드백이 쌓이면 키워드가 추출됩니다</p>
    </div>
  )

  return (
    <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-gray-500">공통 키워드</p>
        <span className="text-[10px] text-gray-300">2회 이상 등장</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {keywords.map(([word, count]) => (
          <span key={word} className={`text-xs px-2 py-0.5 rounded-full border ${
            count >= 5
              ? 'bg-[#90A7D8]/25 border-[#90A7D8]/40 text-[#1E3A6B] font-semibold'
              : count >= 3
              ? 'bg-white/60 border-white/80 text-gray-600'
              : 'bg-white/40 border-white/60 text-gray-400'
          }`}>
            {word} <span className="opacity-50 text-[10px]">{count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 다음 질문 준비 패널 ───────────────────────────────────────────────────────
function NextQuestionsPanel() {
  const STORAGE_KEY = 'oneOnOne_nextQuestions'
  const [isOpen, setIsOpen] = useState(true)
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setQuestions(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  function save(qs: { id: string; text: string }[]) {
    setQuestions(qs)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(qs)) } catch { /* ignore */ }
  }

  function addQuestion() {
    if (!input.trim()) return
    save([...questions, { id: `${Date.now()}`, text: input.trim() }])
    setInput('')
  }

  function deleteQuestion(id: string) {
    save(questions.filter(q => q.id !== id))
  }

  return (
    <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden">
      <button onClick={() => setIsOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/20 transition-colors">
        <span className="text-xs font-semibold text-gray-600">다음 1on1 질문 준비</span>
        <div className="flex items-center gap-2">
          {questions.length > 0 && <span className="text-xs text-gray-400 bg-white/60 border border-white/70 px-2 py-0.5 rounded-full">{questions.length}개</span>}
          <span className="text-[10px] text-gray-300">{isOpen ? '▼' : '▶'}</span>
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-4 border-t border-white/40">
          {questions.length === 0 ? (
            <p className="text-xs text-gray-300 pt-3 pb-1">아직 준비된 질문이 없습니다</p>
          ) : (
            <ul className="space-y-1.5 pt-3 pb-1">
              {questions.map((q, i) => (
                <li key={q.id} className="group flex items-start gap-1.5">
                  <span className="text-xs text-gray-300 flex-shrink-0 mt-0.5 w-4">{i + 1}.</span>
                  <span className="flex-1 text-xs text-gray-700 leading-relaxed">{q.text}</span>
                  <button onClick={() => deleteQuestion(q.id)}
                    className="flex-shrink-0 text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">삭제</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 mt-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addQuestion() }}
              placeholder="질문 입력 후 Enter"
              className="flex-1 text-xs bg-white/50 border border-white/70 rounded-full px-3 py-1.5 focus:outline-none placeholder-gray-300"
            />
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
      supabase.from('my_feedback')
        .select('id, month, content, feedback_type, feedback_date, from_member, created_at')
        .order('created_at', { ascending: false }),
      fetchMembers(),
    ]).then(([{ data }, ms]) => {
      setFeedbacks((data ?? []) as MyFeedback[])
      setMembers(ms)
      setLoading(false)
    })
  }, [])

  // 기간 필터 적용
  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter(f => inPeriod(f.feedback_date ?? f.created_at, period))
  }, [feedbacks, period])

  const months = useMemo(() => {
    const monthSet = new Set<string>(filteredFeedbacks.map(f => f.month))
    const start = getPeriodStart(period)
    if (!start || new Date() >= start) monthSet.add(currentMonth())
    return Array.from(monthSet).sort().reverse()
  }, [filteredFeedbacks, period])

  // 필터 변경 시 최신 월만 자동 펼침
  useEffect(() => {
    const latest = months[0] ?? currentMonth()
    setOpenMonths(new Set([latest]))
  }, [period])

  function toggleMonth(month: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  function openAddForm(month: string) {
    setAddingMonth(month)
    setFormContent('')
    setFormMember('')
    setFormDate(new Date().toISOString().slice(0, 10))
    setOpenMonths(prev => new Set([...prev, month]))
  }

  function cancelAdd() {
    setAddingMonth(null)
    setFormContent('')
    setFormMember('')
  }

  async function saveAdd() {
    if (!addingMonth || !formContent.trim()) return
    setSaving(true)
    const month = formDate.slice(0, 7)
    const { data, error } = await supabase
      .from('my_feedback')
      .insert({
        month,
        feedback_date: formDate,
        from_member: formMember.trim() || null,
        content: formContent.trim(),
        feedback_type: null,
      })
      .select('id, month, content, feedback_type, feedback_date, from_member, created_at')
      .single()
    if (!error && data) {
      setFeedbacks(prev => [data as MyFeedback, ...prev])
      cancelAdd()
    }
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

  if (loading) return <div className="p-8 text-sm text-gray-400">불러오는 중...</div>

  return (
    <div className="flex gap-6 w-full min-h-0">
      {/* LEFT: 기간 필터 + 월별 아코디언 */}
      <div className="flex-[65] min-w-0 flex flex-col gap-3">
        {/* 기간 필터 */}
        <div className="flex items-center gap-1.5">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`${pill} ${period === p ? pOn : pOff}`}>{p}</button>
          ))}
          <span className="text-xs text-gray-400 ml-auto">{filteredFeedbacks.length}건</span>
        </div>

        {/* 추가 버튼 */}
        {addingMonth !== currentMonth() && (
          <button onClick={() => openAddForm(currentMonth())}
            className="text-xs bg-white/40 backdrop-blur-xl border border-dashed border-white/60 text-gray-500 hover:bg-white/60 hover:border-white/80 hover:text-gray-700 rounded-2xl px-4 py-2.5 w-full transition-colors">
            + 피드백 추가 ({formatMonth(currentMonth())})
          </button>
        )}

        {/* 월별 아코디언 */}
        <div className="space-y-2">
          {months.map((month, idx) => {
            const isOpen = openMonths.has(month)
            const items = filteredFeedbacks.filter(f => f.month === month)
            const isAddingHere = addingMonth === month
            const isLatest = idx === 0
            return (
              <div key={month} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <button onClick={() => toggleMonth(month)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="text-sm font-semibold text-gray-700">{isOpen ? '▼' : '▶'} {formatMonth(month)}</span>
                    <span className="text-xs text-gray-400 bg-white/60 border border-white/70 px-2 py-0.5 rounded-full">{items.length}건</span>
                    {isLatest && <span className="text-[10px] text-[#2D5A45] bg-[#BADEC8]/30 border border-[#BADEC8]/40 px-2 py-0.5 rounded-full">최신</span>}
                  </button>
                  {!isAddingHere && (
                    <button onClick={() => openAddForm(month)}
                      className={`text-xs ${pOff} !text-[10px] !px-2.5 !py-1`}>
                      + 추가
                    </button>
                  )}
                </div>

                {/* 인라인 추가 폼 */}
                {isAddingHere && (
                  <div className="px-5 pb-5 border-t border-white/40">
                    <div className="pt-4 space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 mb-1 block">날짜</label>
                          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                            className="text-sm bg-white/50 border border-white/70 rounded-2xl px-3 py-1.5 focus:outline-none w-full" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 mb-1 block">피드백 준 팀원</label>
                          <select value={formMember} onChange={e => setFormMember(e.target.value)}
                            className="text-sm bg-white/50 border border-white/70 rounded-2xl px-3 py-1.5 focus:outline-none w-full text-gray-600">
                            <option value="">선택 (선택)</option>
                            {members.filter(m => m.part !== '팀장').map(m => (
                              <option key={m.id} value={m.name}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <textarea autoFocus value={formContent} onChange={e => setFormContent(e.target.value)}
                        placeholder="피드백 내용을 자유롭게 입력하세요"
                        rows={3}
                        className="w-full text-sm bg-white/50 border border-white/70 rounded-2xl px-3 py-2 resize-none focus:outline-none" />
                      <p className="text-xs text-gray-400">분류(긍정/부정/요청)는 오른쪽 분석 패널에서 지정합니다</p>
                      <div className="flex gap-2 justify-end">
                        <button onClick={cancelAdd} className={`${pill} ${pOff}`}>취소</button>
                        <button onClick={saveAdd} disabled={saving || !formContent.trim()} className={`${pill} ${pOn} disabled:opacity-40`}>
                          {saving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 피드백 목록 */}
                {isOpen && items.length > 0 && (
                  <div className="px-5 pb-4 space-y-2 border-t border-white/40 pt-3">
                    {items
                      .sort((a, b) => {
                        const da = a.feedback_date ?? a.created_at
                        const db = b.feedback_date ?? b.created_at
                        return db.localeCompare(da)
                      })
                      .map(item => (
                        <div key={item.id} className="group flex items-start gap-2 bg-white/30 rounded-2xl px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {item.feedback_type && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${FEEDBACK_TYPE_STYLE[item.feedback_type]}`}>
                                  {item.feedback_type}
                                </span>
                              )}
                              {item.from_member && (
                                <span className="text-xs font-medium text-gray-500">{item.from_member}</span>
                              )}
                              {item.feedback_date && (
                                <span className="text-xs text-gray-400">{item.feedback_date.slice(5).replace('-', '/')}</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed">{item.content}</p>
                          </div>
                          <button onClick={() => deleteFeedback(item.id)}
                            className="flex-shrink-0 text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all px-1 py-0.5">
                            삭제
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {isOpen && items.length === 0 && !isAddingHere && (
                  <div className="px-5 pb-4 border-t border-white/40 pt-3">
                    <p className="text-xs text-gray-400">이 달의 피드백이 없습니다</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT: 분석 패널 + 키워드 + 다음 질문 */}
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
  const [sessions, setSessions] = useState<OneOnOne[]>([])
  const [view, setView] = useState<'team' | 'my-feedback'>('team')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      fetchMembers(),
      supabase.from('one_on_ones').select('*').order('session_date', { ascending: false }),
    ]).then(([ms, { data }]) => {
      setMembers(ms)
      setSessions((data ?? []) as OneOnOne[])
    })
  }, [])

  function getLastSession(memberId: string): OneOnOne | undefined {
    return sessions.filter(s => s.member_id === memberId)[0]
  }

  function getSessionMonths(memberId: string): string[] {
    const months = new Set<string>()
    sessions.filter(s => s.member_id === memberId).forEach(s => {
      if (s.session_date) months.add(s.session_date.slice(0, 7))
    })
    return Array.from(months).sort().reverse()
  }

  async function createSession(memberId: string) {
    const { data } = await supabase.from('one_on_ones').insert({ member_id: memberId }).select('id').single()
    if (data) router.push(`/one-on-one/${memberId}/${(data as { id: string }).id}`)
  }

  const grouped = [
    { label: '팀장', list: members.filter(m => m.part === '팀장') },
    { label: '코어파트', list: members.filter(m => m.part === '코어') },
    { label: '비즈파트', list: members.filter(m => m.part === '비즈') },
  ].filter(g => g.list.length > 0)

  const memberStats = useMemo(() => {
    const now = Date.now()
    return members
      .map(member => {
        const last = sessions.find(s => s.member_id === member.id)
        const daysSince =
          last?.session_date != null
            ? Math.floor((now - new Date(last.session_date).getTime()) / 86400000)
            : null
        return { member, daysSince }
      })
      .sort((a, b) => {
        if (a.daysSince === null && b.daysSince === null) return 0
        if (a.daysSince === null) return -1
        if (b.daysSince === null) return 1
        return b.daysSince - a.daysSince
      })
  }, [members, sessions])

  const urgentStat = useMemo(() => {
    return memberStats.find(({ daysSince }) => daysSince === null || daysSince >= 30) ?? null
  }, [memberStats])

  function daysBadgeClass(daysSince: number | null): string {
    if (daysSince === null || daysSince >= 30) return 'bg-[#EBA698]/40 text-[#6B2D25] border-[#EBA698]/55'
    if (daysSince >= 14) return 'bg-[#F3E482]/50 text-[#5A4A10] border-[#F3E482]/60'
    return 'bg-[#BADEC8]/40 text-[#2D5A45] border-[#BADEC8]/55'
  }

  function daysLabel(daysSince: number | null): string {
    return daysSince === null ? '없음' : `${daysSince}일 전`
  }

  function memberAvatarColor(part: string): string {
    if (part === '코어') return 'bg-[#BADEC8]/60 text-[#2D5A45]'
    if (part === '비즈') return 'bg-[#90A7D8]/60 text-[#1E3A6B]'
    return 'bg-[#EBA698]/40 text-[#5A2D25]'
  }

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-4">
        <h1 className="text-xl font-bold text-gray-900">1on1</h1>
        <div className="flex items-center bg-white/40 backdrop-blur-xl border border-white/60 rounded-full p-1">
          <button onClick={() => setView('team')}
            className={`text-xs px-3.5 py-1.5 rounded-full transition-all font-medium ${
              view === 'team' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            팀원 1on1
          </button>
          <button onClick={() => setView('my-feedback')}
            className={`text-xs px-3.5 py-1.5 rounded-full transition-all font-medium ${
              view === 'my-feedback' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            내 피드백
          </button>
        </div>
        {view === 'team' && (
          <Link href="/one-on-one/template"
            className={`${pill} ${pOff} ml-auto`}>
            템플릿 관리
          </Link>
        )}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">

        {/* 팀원 1on1 뷰 */}
        {view === 'team' && (
          <div className="flex flex-col md:flex-row gap-6 w-full pb-6">
            {/* LEFT: 프로필 카드 그리드 */}
            <div className="min-w-0 md:flex-[60]">
              {grouped.map(({ label, list }) => (
                <div key={label} className="mb-7">
                  <h2 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">{label}</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {list.map(member => {
                      const last = getLastSession(member.id)
                      const months = getSessionMonths(member.id)
                      const memberSessions = sessions.filter(s => s.member_id === member.id)
                      const stat = memberStats.find(ms => ms.member.id === member.id)
                      const daysSince = stat?.daysSince ?? null
                      return (
                        <div key={member.id} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-5 flex flex-col gap-3">
                          {/* 아바타 + 이름 */}
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${memberAvatarColor(member.part)}`}>
                              {member.name[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-800 truncate">{member.name}</p>
                              <p className="text-xs text-gray-400">{member.part}</p>
                            </div>
                          </div>

                          {/* 마지막 세션 + 배지 */}
                          <div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                              {last && last.session_date
                                ? `마지막: ${format(parseISO(last.session_date), 'M월 d일', { locale: ko })}`
                                : '아직 1on1 없음'}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${daysBadgeClass(daysSince)}`}>
                                {daysLabel(daysSince)}
                              </span>
                              {memberSessions.length > 0 && (
                                <span className="text-[10px] text-gray-400 bg-white/50 border border-white/70 px-2 py-0.5 rounded-full">
                                  총 {memberSessions.length}회
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 월 히스토리 */}
                          {months.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {months.slice(0, 4).map(m => {
                                const [y, mo] = m.split('-')
                                return (
                                  <span key={m} className="text-[10px] bg-white/50 border border-white/70 text-gray-400 px-2 py-0.5 rounded-full">
                                    {y}.{mo}
                                  </span>
                                )
                              })}
                            </div>
                          )}

                          {/* 액션 버튼 */}
                          <div className="flex gap-1.5 mt-auto">
                            {memberSessions.length > 0 && (
                              <Link href={`/one-on-one/${member.id}`}
                                className="text-xs bg-white/50 border border-white/70 text-gray-500 px-3 py-1.5 rounded-full hover:bg-white/70 transition-all whitespace-nowrap">
                                목록
                              </Link>
                            )}
                            <button onClick={() => createSession(member.id)}
                              className="flex-1 text-xs bg-gray-900 text-white px-3 py-1.5 rounded-full hover:bg-gray-800 transition-colors text-center whitespace-nowrap">
                              + 새 1on1
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* RIGHT: alert panel */}
            <div className="min-w-0 md:flex-[40] flex flex-col gap-4">
              {urgentStat ? (
                <div className="bg-[#EBA698]/15 backdrop-blur-xl border border-[#EBA698]/40 rounded-3xl px-5 py-4">
                  <p className="text-xs font-semibold text-[#6B2D25] mb-3">30일 미진행 긴급</p>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{urgentStat.member.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{urgentStat.member.part}</p>
                      <p className="text-sm text-[#6B2D25] mt-2">
                        마지막 1on1:{' '}
                        {urgentStat.daysSince === null ? '기록 없음' : `${urgentStat.daysSince}일 전`}
                      </p>
                    </div>
                    <button
                      onClick={() => createSession(urgentStat.member.id)}
                      className="flex-shrink-0 text-xs bg-gray-900 text-white px-3 py-1.5 rounded-full hover:bg-gray-800 transition-colors whitespace-nowrap">
                      + 바로 진행
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#BADEC8]/15 backdrop-blur-xl border border-[#BADEC8]/40 rounded-3xl px-5 py-4">
                  <p className="text-sm font-semibold text-[#2D5A45]">✓ 이번 달 모두 진행됨</p>
                </div>
              )}

              <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl px-5 py-4">
                <p className="text-xs font-semibold text-gray-500 mb-4">전체 현황</p>
                <div className="space-y-2.5">
                  {memberStats.map(({ member, daysSince }) => (
                    <div key={member.id} className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${memberAvatarColor(member.part)}`}>
                        {member.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">{member.name}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{member.part}</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${daysBadgeClass(daysSince)}`}>
                        {daysLabel(daysSince)}
                      </span>
                      <Link href={`/one-on-one/${member.id}`}
                        className="text-xs text-gray-400 hover:text-gray-700 flex-shrink-0 whitespace-nowrap transition-colors">
                        1on1 →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 내 피드백 뷰 */}
        {view === 'my-feedback' && <MyFeedbackView />}
      </div>
    </div>
  )
}
