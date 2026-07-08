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
  const qWords = q.split(/\s+/).filter(Boolean)
  const tWords = t.split(/\s+/).filter(Boolean)
  let matched = 0
  for (const qw of qWords) {
    if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) matched++
  }
  return matched === 0 ? 0 : (matched / qWords.length) * 60
}

function matchTasks(input: string, tasks: Task[]): Task[] {
  if (!input.trim()) return []
  return tasks
    .filter(t => t.status !== '완료')
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
  // 1단계: 업무 검색
  const [searchInput, setSearchInput] = useState('')
  const [matches, setMatches] = useState<Task[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)

  // 2단계: 할일 입력
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [todoInput, setTodoInput] = useState('')

  const [saving, setSaving] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const todoRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const phase = selectedTask ? 'todo' : 'search'
  const { date: endDate, cleaned: todoTitle } = todoInput.trim() ? parseDate(todoInput.trim()) : { date: null, cleaned: '' }

  // 검색어 변경 → 매칭
  useEffect(() => {
    if (!searchInput.trim()) { setMatches([]); setSelectedIdx(0); return }
    setMatches(matchTasks(searchInput, tasks))
    setSelectedIdx(0)
  }, [searchInput, tasks])

  // 마운트 시 검색창 자동 포커스
  useEffect(() => { searchRef.current?.focus() }, [])

  // 2단계 진입 시 할일 input에 포커스
  useEffect(() => {
    if (selectedTask) todoRef.current?.focus()
  }, [selectedTask])

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (matches[selectedIdx]) selectTask(matches[selectedIdx])
    }
    else if (e.key === 'Escape') { e.preventDefault(); setSearchInput(''); setMatches([]); searchRef.current?.blur() }
  }

  function handleTodoKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSelectedTask(null); setTodoInput(''); searchRef.current?.focus() }
  }

  function selectTask(task: Task) {
    setSelectedTask(task)
    setSearchInput('')
    setMatches([])
  }

  function reset() {
    setSearchInput(''); setMatches([]); setSelectedIdx(0)
    setSelectedTask(null); setTodoInput('')
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
    reset()
    setSaving(false)
    searchRef.current?.focus()
  }

  return (
    <div className="flex-shrink-0">
      <div className={`bg-white border rounded-xl transition-all ${(searchInput || selectedTask) ? 'border-[#BADEC8]/80 shadow-sm' : 'border-gray-100'}`}>

        {phase === 'search' && (
          <>
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="text-gray-300 text-sm flex-shrink-0">+</span>
              <input
                ref={searchRef}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="업무 검색 후 Enter로 선택 — 예) 평가시뮬, 보상"
                className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent min-w-0"
              />
            </div>

            {matches.length > 0 && (
              <div className="border-t border-gray-50 pb-1">
                {matches.map((task, i) => {
                  const isSelected = i === selectedIdx
                  return (
                    <button
                      key={task.id}
                      onMouseDown={e => { e.preventDefault(); selectTask(task) }}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${isSelected ? 'bg-[#BADEC8]/20' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-[#2D5A45]' : 'bg-gray-200'}`} />
                      <span className={`text-xs ${isSelected ? 'text-[#2D5A45] font-medium' : 'text-gray-500'}`}>{task.title}</span>
                      {isSelected && <span className="ml-auto text-[10px] text-gray-300 flex-shrink-0">Enter ↵</span>}
                    </button>
                  )
                })}
                {searchInput && matches.length === 0 && (
                  <p className="px-4 py-2 text-xs text-gray-300">일치하는 업무 없음</p>
                )}
              </div>
            )}
          </>
        )}

        {phase === 'todo' && selectedTask && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-medium text-[#2D5A45] bg-[#BADEC8]/25 px-2 py-0.5 rounded-md">{selectedTask.title}</span>
              <span className="text-gray-300 text-xs">›</span>
              <button onClick={reset} className="ml-auto text-[10px] text-gray-300 hover:text-gray-500">✕ 취소</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={todoRef}
                value={todoInput}
                onChange={e => setTodoInput(e.target.value)}
                onKeyDown={handleTodoKeyDown}
                placeholder="할일 입력 — 예) 자료 준비 7/3까지"
                className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent min-w-0"
              />
              {todoTitle && endDate && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                  {endDate.slice(5).replace('-', '/')}
                </span>
              )}
              {todoTitle && (
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-shrink-0 text-[11px] bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1 rounded-lg hover:bg-[#D5E6F7] disabled:opacity-40 transition-colors"
                >
                  {saving ? '저장…' : '추가 ↵'}
                </button>
              )}
            </div>
          </div>
        )}

        {!searchInput && !selectedTask && lastAdded && (
          <div className="px-4 pb-2.5 flex items-center gap-1.5">
            <span className="text-[10px] text-[#2D5A45]">✓</span>
            <span className="text-[10px] text-gray-400">{lastAdded}</span>
          </div>
        )}
      </div>
    </div>
  )
}
