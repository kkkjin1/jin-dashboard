'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task, TaskTodo } from '@/types'

// ── 날짜 파싱 ─────────────────────────────────────────

function parseDate(text: string): { date: string | null; cleaned: string } {
  const today = new Date()
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
  const dayMap: Record<string, number> = {
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
    '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6,
  }
  const nextWeekday = (t: number) => {
    const d = new Date(today); d.setDate(d.getDate() + ((t - d.getDay() + 7) % 7 || 7)); return d
  }
  const nextNextWeekday = (t: number) => {
    const d = nextWeekday(t); d.setDate(d.getDate() + 7); return d
  }

  const patterns: { re: RegExp; fn: (m: RegExpMatchArray) => string }[] = [
    { re: /(\d{1,2})\/(\d{1,2})/, fn: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /(\d{1,2})월\s*(\d{1,2})일/, fn: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /오늘/, fn: () => toISO(today) },
    { re: /내일/, fn: () => toISO(addDays(1)) },
    { re: /모레/, fn: () => toISO(addDays(2)) },
    { re: /이번\s*달\s*(말|끝)?/, fn: () => toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)) },
    { re: /이번\s*주\s*(내|말|끝|금요일|금)?/, fn: () => toISO(nextWeekday(5)) },
    { re: /이번\s*주\s*(월|화|수|목|토|일|월요일|화요일|수요일|목요일|토요일|일요일)/, fn: m => toISO(nextWeekday(dayMap[m[1].replace(/요일$/, '')] ?? 5)) },
    { re: /다음\s*주\s*(월|화|수|목|금|토|일|월요일|화요일|수요일|목요일|금요일|토요일|일요일|내|말|끝)?/, fn: m => toISO(nextNextWeekday(dayMap[(m[1] ?? '').replace(/요일$/, '')] ?? 5)) },
  ]

  for (const { re, fn } of patterns) {
    const m = text.match(re)
    if (m) return { date: fn(m), cleaned: text.replace(re, '').replace(/\s{2,}/g, ' ').trim() }
  }
  return { date: null, cleaned: text }
}

// ── 퍼지 매칭 ─────────────────────────────────────────

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return 100 + (q.length / t.length) * 50
  // 단어 단위 부분 일치
  const qWords = q.split(/\s+/).filter(Boolean)
  const tWords = t.split(/\s+/).filter(Boolean)
  let matched = 0
  for (const qw of qWords) {
    if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) matched++
  }
  if (matched === 0) return 0
  return (matched / qWords.length) * 60
}

function matchTasks(input: string, tasks: Task[]): Task[] {
  if (!input.trim()) return []
  const active = tasks.filter(t => t.status !== '완료')
  return active
    .map(t => ({ t, score: fuzzyScore(input, t.title) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.t)
}

// ── 컴포넌트 ──────────────────────────────────────────

interface Props {
  tasks: Task[]
  onAdded?: (todo: TaskTodo) => void
}

export default function QuickTaskInput({ tasks, onAdded }: Props) {
  const [input, setInput] = useState('')
  const [matches, setMatches] = useState<Task[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const { date: endDate, cleaned: todoTitle } = input.trim() ? parseDate(input.trim()) : { date: null, cleaned: '' }
  const selectedTask = matches[selectedIdx] ?? null

  useEffect(() => {
    if (!todoTitle) { setMatches([]); setSelectedIdx(0); return }
    const next = matchTasks(todoTitle, tasks)
    setMatches(next)
    setSelectedIdx(0)
  }, [todoTitle, tasks])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      setInput('')
    }
  }

  async function handleSubmit() {
    if (!todoTitle || !selectedTask || saving) return
    setSaving(true)
    const { data } = await supabase
      .from('task_todos')
      .insert({ task_id: selectedTask.id, title: todoTitle, target_date: endDate, done: false, sort_order: 0 })
      .select('id, title, target_date, sort_order, task_id, done, tasks(id, title, short_name)')
      .single()

    if (data) {
      setLastAdded(`${selectedTask.title} › ${todoTitle}`)
      onAdded?.(data as unknown as TaskTodo)
    }
    setInput('')
    setSaving(false)
    inputRef.current?.focus()
  }

  const hasInput = input.trim().length > 0
  const noMatch = hasInput && matches.length === 0

  return (
    <div className="flex-shrink-0">
      <div className={`bg-white border rounded-xl transition-all ${hasInput ? 'border-emerald-200 shadow-sm' : 'border-gray-100'}`}>

        {/* 입력 */}
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="text-gray-300 text-sm flex-shrink-0">+</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="할일 빠른 추가 — 예) 평가시뮬 자료준비 7/3"
            className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent min-w-0"
          />
        </div>

        {/* 매칭 결과 */}
        {hasInput && (
          <div className="border-t border-gray-50 pb-1">
            {noMatch ? (
              <p className="px-4 py-2 text-xs text-gray-300">일치하는 업무 없음 — 업무 목록에서 먼저 업무를 만들어주세요</p>
            ) : (
              matches.map((task, i) => {
                const isSelected = i === selectedIdx
                return (
                  <button
                    key={task.id}
                    onClick={() => { setSelectedIdx(i); handleSubmit() }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${isSelected ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium ${isSelected ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {task.title}
                      </span>
                      {isSelected && todoTitle && (
                        <span className="text-xs text-gray-400 ml-1">› {todoTitle}</span>
                      )}
                    </div>
                    {isSelected && endDate && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                        {endDate.slice(5).replace('-', '/')}
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] text-gray-300 flex-shrink-0">
                        {saving ? '저장 중…' : 'Enter ↵'}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}

        {/* 방금 추가 */}
        {!hasInput && lastAdded && (
          <div className="px-4 pb-2.5 flex items-center gap-1.5">
            <span className="text-[10px] text-emerald-500">✓</span>
            <span className="text-[10px] text-gray-400">{lastAdded}</span>
          </div>
        )}
      </div>
    </div>
  )
}
