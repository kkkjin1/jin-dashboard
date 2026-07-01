'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────

interface DailyJournal {
  id: string
  date: string
  content: string
  linked_task_ids: string[]
  linked_meeting_ids: string[]
}

type Tab = 'list' | 'pattern' | 'selfeval'

// ── Korean text analysis ───────────────────────────────────────────────

const STOPWORDS = new Set([
  '이','가','을','를','은','는','에','의','와','과','도','에서','으로','로','이고','하고',
  '그리고','했','했고','있고','없고','것','수','더','아직','오늘','내일','어제','관련',
  '대한','위한','때문','통해','같은','있는','없는','하는','되는','이번','다음','해야',
  '필요','싶은','같이','함께','있어','없어','됨','했음','인데','인지','이나','이며',
  '하며','하여','해서','되어','되어서','했는데','있는데','없는데','그런데','그래서',
  '그러나','하지만','또한','또','다시','계속','아직도','여전히','이미','먼저','우선',
  '일단','결국','사실','실제','정말','진짜','너무','많이','조금','좀','약간','꽤',
])

function analyzeText(journals: DailyJournal[]) {
  const wordCount: Record<string, number> = {}
  const datesByWord: Record<string, string[]> = {}

  journals.forEach(j => {
    const words = j.content.match(/[가-힣]{2,6}/g) ?? []
    const seen = new Set<string>()
    words.forEach(w => {
      if (STOPWORDS.has(w)) return
      wordCount[w] = (wordCount[w] ?? 0) + 1
      if (!seen.has(w)) {
        datesByWord[w] = [...(datesByWord[w] ?? []), j.date]
        seen.add(w)
      }
    })
  })

  return Object.entries(wordCount)
    .filter(([, cnt]) => cnt >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count, dates: datesByWord[word] ?? [] }))
}

// ── Self-eval draft ────────────────────────────────────────────────────

const ACHIEVEMENT_HINTS = ['완료','해결','성공','마무리','완성','구현','확정','승인','통과']
const CHALLENGE_HINTS   = ['어려움','고민','막힘','문제','이슈','지연','복잡','불확실','애매']
const GROWTH_HINTS      = ['배움','학습','인사이트','깨달음','발견','개선','향상','성장']

function extractSentences(text: string, hints: string[]): string[] {
  return text.split(/[.。\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 5 && hints.some(h => s.includes(h)))
    .slice(0, 3)
}

function buildSelfEval(journals: DailyJournal[], tasks: Task[], fromDate: string, toDate: string) {
  const filtered = journals.filter(j => j.date >= fromDate && j.date <= toDate)
  const completedTasks = tasks.filter(t => t.status === '완료')

  const achievements: string[] = []
  const challenges: string[] = []
  const growths: string[] = []

  filtered.forEach(j => {
    achievements.push(...extractSentences(j.content, ACHIEVEMENT_HINTS))
    challenges.push(...extractSentences(j.content, CHALLENGE_HINTS))
    growths.push(...extractSentences(j.content, GROWTH_HINTS))
  })

  const lines: string[] = []
  lines.push('■ 주요 성과')
  completedTasks.slice(0, 5).forEach(t => lines.push(`  · ${t.title} 완료`))
  if (achievements.length > 0) {
    achievements.slice(0, 3).forEach(s => lines.push(`  · ${s}`))
  }
  lines.push('')
  lines.push('■ 어려웠던 점 / 개선 필요')
  if (challenges.length > 0) {
    challenges.slice(0, 3).forEach(s => lines.push(`  · ${s}`))
  } else {
    lines.push('  (회고 기록에서 추출된 내용 없음 — 직접 작성)')
  }
  lines.push('')
  lines.push('■ 성장 / 배운 것')
  if (growths.length > 0) {
    growths.slice(0, 3).forEach(s => lines.push(`  · ${s}`))
  } else {
    lines.push('  (회고 기록에서 추출된 내용 없음 — 직접 작성)')
  }
  lines.push('')
  lines.push(`■ 기간: ${fromDate} ~ ${toDate} (회고 ${filtered.length}건 기반)`)

  return lines.join('\n')
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth()+1}/${d.getDate()}`
}

function monthStr(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return d.toISOString().slice(0, 7)
}

// ── Component ──────────────────────────────────────────────────────────

export default function JournalPage() {
  const [journals, setJournals] = useState<DailyJournal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState<Tab>('list')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [evalFrom, setEvalFrom] = useState(monthStr(-2).slice(0, 7) + '-01')
  const [evalTo, setEvalTo] = useState(new Date().toISOString().slice(0, 10))
  const [evalText, setEvalText] = useState('')
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [{ data: j }, t] = await Promise.all([
        supabase.from('daily_journals').select('*').order('date', { ascending: false }),
        fetchAllTasks(),
      ])
      setJournals((j ?? []) as DailyJournal[])
      setTasks(t)
      setLoading(false)
    }
    load()
  }, [])

  const patterns = useMemo(() => analyzeText(journals), [journals])

  function generateEval() {
    setEvalText(buildSelfEval(journals, tasks, evalFrom, evalTo))
  }

  function copyEval() {
    navigator.clipboard.writeText(evalText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="p-6 flex flex-col gap-4">
      {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 h-20 animate-pulse" />)}
    </div>
  )

  return (
    <div className="p-5 md:p-6 flex flex-col gap-5 h-full overflow-y-auto">

      {/* 헤더 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">회고 기록</h1>
          <p className="text-sm text-gray-400 mt-0.5">총 {journals.length}건</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-shrink-0">
        {([['list','전체 목록'],['pattern','패턴 분석'],['selfeval','자기평가 초안']] as [Tab,string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 전체 목록 */}
      {tab === 'list' && (
        <div className="flex flex-col gap-2">
          {journals.length === 0 && (
            <p className="text-sm text-gray-300 text-center py-12">
              아직 회고가 없어요 —{' '}
              <Link href="/" className="text-emerald-500 hover:underline">홈에서 작성</Link>
            </p>
          )}
          {journals.map(j => {
            const isOpen = expanded === j.id
            return (
              <div key={j.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : j.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-xs font-mono text-gray-400 flex-shrink-0 mt-0.5 w-10">{fmt(j.date)}</span>
                  <p className={`text-sm text-gray-700 flex-1 leading-relaxed ${isOpen ? '' : 'line-clamp-2'}`}>
                    {j.content}
                  </p>
                  <span className="text-gray-300 text-xs flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (j.linked_task_ids.length > 0 || j.linked_meeting_ids.length > 0) && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {j.linked_task_ids.map(id => {
                      const t = tasks.find(x => x.id === id)
                      return t ? (
                        <Link key={id} href={`/tasks/${id}`}
                          className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100">
                          {t.title}
                        </Link>
                      ) : null
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 패턴 분석 */}
      {tab === 'pattern' && (
        <div className="flex flex-col gap-4">
          {patterns.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-12">회고가 2건 이상 있어야 패턴을 분석할 수 있어요</p>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">자주 등장한 키워드</h3>
                <div className="flex flex-wrap gap-2">
                  {patterns.map(({ word, count, dates }) => (
                    <div key={word} className="flex flex-col items-center gap-0.5">
                      <span
                        className="px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
                        style={{ fontSize: `${Math.min(14, 10 + count)}px` }}
                      >
                        {word}
                      </span>
                      <span className="text-[9px] text-gray-400">{count}회</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">반복 언급 키워드별 날짜</h3>
                <div className="space-y-2">
                  {patterns.slice(0, 8).map(({ word, count, dates }) => (
                    <div key={word} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-700 w-16 flex-shrink-0">{word}</span>
                      <div className="flex flex-wrap gap-1 flex-1">
                        {dates.map(d => (
                          <span key={d} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{fmt(d)}</span>
                        ))}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{count}회</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-700 mb-2">액션 제안</h3>
                <ul className="space-y-1.5">
                  {patterns.slice(0, 3).map(({ word, count }) => {
                    const relatedTask = tasks.find(t => t.title.includes(word) && t.status !== '완료')
                    return (
                      <li key={word} className="text-xs text-amber-800 flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5">→</span>
                        <span>
                          <strong>{word}</strong>이(가) {count}회 반복됨.
                          {relatedTask
                            ? <> <Link href={`/tasks/${relatedTask.id}`} className="underline">{relatedTask.title}</Link> 업무 확인 필요</>
                            : ' 이 주제로 별도 업무/의사결정 등록을 고려해보세요'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* 자기평가 초안 */}
      {tab === 'selfeval' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-gray-700">기간 설정</h3>
            <div className="flex items-center gap-3">
              <input type="date" value={evalFrom} onChange={e => setEvalFrom(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400" />
              <span className="text-gray-400 text-sm">~</span>
              <input type="date" value={evalTo} onChange={e => setEvalTo(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400" />
              <button onClick={generateEval}
                className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
                초안 생성
              </button>
            </div>
            <p className="text-xs text-gray-400">
              회고 기록 + 완료 업무 기반으로 자기평가 초안을 만들어요. 직접 수정해서 사용하세요.
            </p>
          </div>

          {evalText && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">자기평가 초안</h3>
                <button onClick={copyEval}
                  className="text-xs text-gray-500 border border-gray-200 px-3 py-1 rounded-lg hover:border-gray-400 transition-colors">
                  {copied ? '복사됨 ✓' : '복사'}
                </button>
              </div>
              <textarea
                value={evalText}
                onChange={e => setEvalText(e.target.value)}
                className="text-sm text-gray-700 leading-relaxed resize-none focus:outline-none font-mono w-full"
                rows={Math.max(10, evalText.split('\n').length + 2)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
