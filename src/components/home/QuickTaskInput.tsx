'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Part, Task, TaskTodo, TaskType } from '@/types'

// ── 파싱 ──────────────────────────────────────────────

function parseDate(text: string): { date: string | null; cleaned: string } {
  const today = new Date()
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }

  const dayMap: Record<string, number> = {
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
    '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6,
  }

  const nextWeekday = (target: number) => {
    const d = new Date(today)
    const diff = (target - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + diff)
    return d
  }
  const nextNextWeekday = (target: number) => {
    const d = nextWeekday(target); d.setDate(d.getDate() + 7); return d
  }

  const patterns: { re: RegExp; handler: (m: RegExpMatchArray) => string }[] = [
    { re: /(\d{1,2})\/(\d{1,2})/, handler: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /(\d{1,2})월\s*(\d{1,2})일/, handler: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /오늘/, handler: () => toISO(today) },
    { re: /내일/, handler: () => toISO(addDays(1)) },
    { re: /모레/, handler: () => toISO(addDays(2)) },
    { re: /이번\s*달\s*(말|끝)?/, handler: () => toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)) },
    { re: /이번\s*주\s*(내|말|끝|금요일|금)?/, handler: () => toISO(nextWeekday(5)) },
    {
      re: /이번\s*주\s*(월요일|화요일|수요일|목요일|토요일|일요일|월|화|수|목|토|일)/,
      handler: m => toISO(nextWeekday(dayMap[m[1].replace(/요일$/, '')] ?? 5)),
    },
    {
      re: /다음\s*주\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일|내|말|끝)?/,
      handler: m => {
        const key = (m[1] ?? '').replace(/요일$/, '')
        return toISO(nextNextWeekday(key && key in dayMap ? dayMap[key] : 5))
      },
    },
  ]

  for (const { re, handler } of patterns) {
    const m = text.match(re)
    if (m) {
      return { date: handler(m), cleaned: text.replace(re, '').replace(/\s{2,}/g, ' ').trim() }
    }
  }
  return { date: null, cleaned: text }
}

function parsePart(text: string): Part {
  if (/자회사|계열사|이지로지스|비즈/.test(text)) return '비즈'
  if (/팀장|임원|대표/.test(text)) return '팀장'
  if (/개인|학습|공부|스터디/.test(text)) return '개인'
  return '코어'
}

function parseType(text: string): TaskType {
  if (/회의|미팅|보고|발송|처리|참석|연락|회신|발급|재발급|서치펌|면접|전달/.test(text)) return '운영'
  if (/개선|수정|보완|변경|업데이트/.test(text)) return '개선'
  return '기획'
}

export function parseTaskInput(input: string) {
  const { date, cleaned } = parseDate(input)
  const title = cleaned || input
  return { title, part: parsePart(title), type: parseType(title), endDate: date }
}

// ── 스타일 ──────────────────────────────────────────────

const PART_COLORS: Record<Part, string> = {
  '코어': 'bg-emerald-50 text-emerald-700',
  '비즈': 'bg-blue-50 text-blue-700',
  '팀장': 'bg-purple-50 text-purple-700',
  '개인': 'bg-gray-100 text-gray-500',
}
const TYPE_COLORS: Record<TaskType, string> = {
  '기획': 'bg-amber-50 text-amber-700',
  '운영': 'bg-sky-50 text-sky-700',
  '개선': 'bg-rose-50 text-rose-700',
}

// ── Props ──────────────────────────────────────────────

interface Props {
  onAdded?: (task: Task, todo: TaskTodo | null) => void
}

export default function QuickTaskInput({ onAdded }: Props) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [recentTitles, setRecentTitles] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const trimmed = input.trim()
  const parsed = trimmed ? parseTaskInput(trimmed) : null

  async function handleSubmit() {
    if (!trimmed || saving) return
    setSaving(true)

    const { title, part, type, endDate } = parseTaskInput(trimmed)
    const now = new Date().toISOString().slice(0, 7)

    const { data: task } = await supabase
      .from('tasks')
      .insert({ title, part, type, status: '진행필요', end_date: endDate, work_months: [now] })
      .select()
      .single()

    let todo: TaskTodo | null = null
    if (task && endDate) {
      const { data: todoData } = await supabase
        .from('task_todos')
        .insert({ task_id: task.id, title, target_date: endDate, done: false, sort_order: 0 })
        .select('id, title, target_date, sort_order, task_id, done, tasks(id, title, short_name)')
        .single()
      todo = todoData as TaskTodo | null
    }

    setRecentTitles(prev => [title, ...prev].slice(0, 3))
    setInput('')
    setSaving(false)
    onAdded?.(task as Task, todo)
    inputRef.current?.focus()
  }

  return (
    <div className="flex-shrink-0">
      <div className={`bg-white border rounded-xl transition-colors ${trimmed ? 'border-emerald-200 shadow-sm' : 'border-gray-100'}`}>
        {/* 입력 줄 */}
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="text-gray-300 text-sm flex-shrink-0 font-light">+</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit() }}
            placeholder="업무 빠른 추가 — 예) 평가시뮬레이션 준비 7/3"
            className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent min-w-0"
          />
          {trimmed && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-shrink-0 text-[11px] bg-gray-900 text-white px-3 py-1 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {saving ? '저장 중…' : '추가 ↵'}
            </button>
          )}
        </div>

        {/* 파싱 결과 태그 줄 */}
        {parsed && (
          <div className="flex items-center gap-1.5 px-4 pb-2.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PART_COLORS[parsed.part]}`}>{parsed.part}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[parsed.type]}`}>{parsed.type}</span>
            {parsed.endDate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">
                마감 {parsed.endDate.slice(5).replace('-', '/')}
              </span>
            )}
            {!parsed.endDate && (
              <span className="text-[10px] text-gray-300">날짜 미지정 — "내일", "7/3" 등으로 추가 가능</span>
            )}
          </div>
        )}

        {/* 방금 추가된 항목 */}
        {recentTitles.length > 0 && !trimmed && (
          <div className="flex items-center gap-2 px-4 pb-2.5 flex-wrap">
            <span className="text-[10px] text-gray-300">추가됨:</span>
            {recentTitles.map((t, i) => (
              <span key={i} className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
