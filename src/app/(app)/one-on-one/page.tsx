'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchMembers } from '@/lib/tasks'
import type { Member, OneOnOne, MyFeedback, FeedbackType } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// ─── 피드백 타입 스타일 ───────────────────────────────────────────────────────
const FEEDBACK_TYPE_STYLE: Record<FeedbackType, string> = {
  긍정: 'bg-[#BADEC8]/40 text-[#2D5A45]',
  부정: 'bg-[#EBA698]/40 text-[#6B2D25]',
  요청: 'bg-[#90A7D8]/30 text-[#1E3A6B]',
}
const ANALYSIS_TYPES: FeedbackType[] = ['긍정', '부정', '요청']

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

// ─── 분석 패널 ────────────────────────────────────────────────────────────────
function AnalysisPanel({ feedbacks, onAssignType }: { feedbacks: MyFeedback[]; onAssignType: (id: string, type: FeedbackType | null) => void }) {
  if (feedbacks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 px-5 py-6">
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
    <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 mb-4">피드백 분석</p>
      <div className="space-y-4">
        {grouped.map(({ type, items }) => (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${FEEDBACK_TYPE_STYLE[type]}`}>
                {type}
              </span>
              <span className="text-xs text-gray-400">{items.length}건</span>
            </div>
            <ul className="space-y-1.5 pl-1">
              {items.map(item => (
                <li key={item.id} className="group flex items-start gap-2 border-l-2 border-gray-100 pl-2">
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
                <li key={item.id} className="border border-gray-100 rounded-md p-2">
                  <p className="text-xs text-gray-600 mb-1.5 leading-relaxed">{item.content}</p>
                  <div className="flex gap-1">
                    {ANALYSIS_TYPES.map(t => (
                      <button key={t} onClick={() => onAssignType(item.id, t)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors hover:opacity-80 ${FEEDBACK_TYPE_STYLE[t]}`}>
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
    <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 mb-2">공통 키워드</p>
      <p className="text-xs text-gray-300">피드백이 쌓이면 키워드가 추출됩니다</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
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
              ? 'bg-gray-100 border-gray-200 text-gray-600'
              : 'bg-gray-50 border-gray-100 text-gray-400'
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
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={() => setIsOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <span className="text-xs font-semibold text-gray-500">다음 1on1 질문 준비</span>
        <div className="flex items-center gap-2">
          {questions.length > 0 && <span className="text-xs text-gray-300">{questions.length}개</span>}
          <span className="text-[10px] text-gray-300">{isOpen ? '▼' : '▶'}</span>
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-4 border-t border-gray-50">
          {questions.length === 0 ? (
            <p className="text-xs text-gray-300 pt-2 pb-1">아직 준비된 질문이 없습니다</p>
          ) : (
            <ul className="space-y-1.5 pt-2 pb-1">
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
          <div className="flex gap-2 mt-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addQuestion() }}
              placeholder="질문 입력 후 Enter"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400 placeholder-gray-300"
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

  const months = useMemo(() => {
    const monthSet = new Set<string>(feedbacks.map(f => f.month))
    monthSet.add(currentMonth())
    return Array.from(monthSet).sort().reverse()
  }, [feedbacks])

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
    <div className="flex gap-6 w-full">
      {/* LEFT: 월별 아코디언 */}
      <div className="flex-[65] min-w-0">
        {addingMonth !== currentMonth() && (
          <div className="mb-4">
            <button onClick={() => openAddForm(currentMonth())}
              className="text-xs border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 rounded-md px-4 py-2 w-full transition-colors">
              + 피드백 추가 ({formatMonth(currentMonth())})
            </button>
          </div>
        )}

        <div className="space-y-3">
          {months.map(month => {
            const isOpen = openMonths.has(month)
            const items = feedbacks.filter(f => f.month === month)
            const isAddingHere = addingMonth === month
            return (
              <div key={month} className="bg-white rounded-lg border border-gray-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <button onClick={() => toggleMonth(month)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="text-sm font-bold text-gray-700">
                      {isOpen ? '▼' : '▶'} {formatMonth(month)}
                    </span>
                    <span className="text-xs text-gray-400">{items.length}건</span>
                  </button>
                  {!isAddingHere && (
                    <button onClick={() => openAddForm(month)}
                      className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50 transition-colors">
                      + 추가
                    </button>
                  )}
                </div>

                {/* 인라인 추가 폼 */}
                {isAddingHere && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    <div className="pt-3 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 mb-1 block">날짜</label>
                          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none w-full" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 mb-1 block">피드백 준 팀원</label>
                          <select value={formMember} onChange={e => setFormMember(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none w-full bg-white text-gray-600">
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
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-gray-400" />
                      <p className="text-xs text-gray-400">분류(긍정/부정/요청)는 오른쪽 분석 패널에서 지정합니다</p>
                      <div className="flex gap-2 justify-end">
                        <button onClick={cancelAdd}
                          className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          취소
                        </button>
                        <button onClick={saveAdd} disabled={saving || !formContent.trim()}
                          className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40">
                          {saving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 피드백 목록 */}
                {isOpen && items.length > 0 && (
                  <div className="px-4 pb-3 space-y-2 border-t border-gray-50">
                    {items
                      .sort((a, b) => {
                        const da = a.feedback_date ?? a.created_at
                        const db = b.feedback_date ?? b.created_at
                        return db.localeCompare(da)
                      })
                      .map(item => (
                        <div key={item.id} className="group flex items-start gap-2 pt-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
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
                  <div className="px-4 pb-3 border-t border-gray-50">
                    <p className="text-xs text-gray-400 pt-2">이 달의 피드백이 없습니다</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT: 분석 패널 + 키워드 + 다음 질문 */}
      <div className="flex-[35] min-w-0 space-y-4">
        <AnalysisPanel feedbacks={feedbacks} onAssignType={assignType} />
        <KeywordsPanel feedbacks={feedbacks} />
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
    if (daysSince === null || daysSince >= 30) return 'bg-[#EBA698]/40 text-[#6B2D25]'
    if (daysSince >= 14) return 'bg-[#F3E482]/50 text-[#5A4A10]'
    return 'bg-[#BADEC8]/40 text-[#2D5A45]'
  }

  function daysLabel(daysSince: number | null): string {
    return daysSince === null ? '없음' : `${daysSince}일 전`
  }

  return (
    <div className="p-4 md:p-8 w-full">
      {/* 헤더: 제목 + 탭 + 템플릿 관리 */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">1on1</h1>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('team')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                view === 'team'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              팀원 1on1
            </button>
            <button
              onClick={() => setView('my-feedback')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                view === 'my-feedback'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              내 피드백
            </button>
          </div>
        </div>
        {view === 'team' && (
          <Link
            href="/one-on-one/template"
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors">
            템플릿 관리
          </Link>
        )}
      </div>

      {/* 팀원 1on1 뷰 */}
      {view === 'team' && (
        <div className="flex flex-col md:flex-row gap-6 w-full">
          {/* LEFT: grouped member list */}
          <div className="min-w-0 md:flex-[60]">
            {grouped.map(({ label, list }) => (
              <div key={label} className="mb-8">
                <h2 className="text-sm font-semibold text-gray-500 mb-3">{label}</h2>
                <div className="space-y-2">
                  {list.map(member => {
                    const last = getLastSession(member.id)
                    const months = getSessionMonths(member.id)
                    const memberSessions = sessions.filter(s => s.member_id === member.id)
                    return (
                      <div key={member.id} className="bg-white rounded-lg border border-gray-100 px-5 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                              member.part === '코어' ? 'bg-[#BADEC8]/60 text-[#2D5A45]' :
                              member.part === '비즈' ? 'bg-[#90A7D8]/60 text-[#1E3A6B]' :
                              'bg-[#EBA698]/40 text-[#5A2D25]'
                            }`}>
                              {member.name[0]}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{member.name}</p>
                              <p className="text-xs text-gray-400">
                                {last
                                  ? `마지막: ${last.session_date ? format(parseISO(last.session_date), 'yyyy년 M월 d일', { locale: ko }) : '날짜 미지정'} · 총 ${memberSessions.length}회`
                                  : '1on1 없음'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {memberSessions.length > 0 && (
                              <Link href={`/one-on-one/${member.id}`}
                                className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50 transition-colors">
                                목록
                              </Link>
                            )}
                            <button onClick={() => createSession(member.id)}
                              className="text-xs bg-gray-900 text-white px-3 py-1 rounded-md hover:bg-gray-800 transition-colors">
                              + 새 1on1
                            </button>
                          </div>
                        </div>
                        {months.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {months.slice(0, 6).map(m => {
                              const [y, mo] = m.split('-')
                              return (
                                <span key={m} className="text-xs bg-gray-50 text-gray-400 px-2 py-0.5 rounded">
                                  {y}.{mo}
                                </span>
                              )
                            })}
                          </div>
                        )}
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
              <div className="bg-[#EBA698]/20 rounded-lg px-5 py-4">
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
                    className="flex-shrink-0 text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors whitespace-nowrap">
                    + 바로 진행
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#BADEC8]/20 rounded-lg border border-[#BADEC8]/40 px-5 py-4">
                <p className="text-sm font-semibold text-[#2D5A45]">✓ 이번 달 모두 진행됨</p>
              </div>
            )}

            <div className="bg-white rounded-lg border border-gray-100 px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">전체 현황</p>
              <div className="space-y-2">
                {memberStats.map(({ member, daysSince }) => (
                  <div key={member.id} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                      member.part === '코어' ? 'bg-[#BADEC8]/60 text-[#2D5A45]' :
                      member.part === '비즈' ? 'bg-[#90A7D8]/60 text-[#1E3A6B]' :
                      'bg-[#EBA698]/40 text-[#5A2D25]'
                    }`}>
                      {member.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">{member.name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{member.part}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded flex-shrink-0 ${daysBadgeClass(daysSince)}`}>
                      {daysLabel(daysSince)}
                    </span>
                    <Link href={`/one-on-one/${member.id}`}
                      className="text-xs text-gray-400 hover:text-gray-700 flex-shrink-0 whitespace-nowrap">
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
  )
}
