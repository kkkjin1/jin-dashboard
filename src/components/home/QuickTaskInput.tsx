'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Part, TaskType } from '@/types'

// ── 파싱 ──────────────────────────────────────────────

function parseDate(text: string): { date: string | null; cleaned: string } {
  const today = new Date()

  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
  const nextWeekday = (target: number) => {
    const d = new Date(today)
    const diff = (target - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + diff)
    return d
  }
  const nextNextWeekday = (target: number) => {
    const d = nextWeekday(target)
    d.setDate(d.getDate() + 7)
    return d
  }

  const dayMap: Record<string, number> = {
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
    '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6,
  }

  const patterns: { re: RegExp; handler: (m: RegExpMatchArray) => string }[] = [
    { re: /(\d{1,2})\/(\d{1,2})/, handler: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /(\d{1,2})월\s*(\d{1,2})일/, handler: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /오늘/, handler: () => toISO(today) },
    { re: /내일/, handler: () => toISO(addDays(1)) },
    { re: /모레/, handler: () => toISO(addDays(2)) },
    { re: /이번\s*달\s*(말|끝)/, handler: () => toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)) },
    { re: /이번\s*주\s*(내|말|금요일|금|끝)?/, handler: () => toISO(nextWeekday(5)) },
    {
      re: /다음\s*주\s*(월요일|화요일|수요일|목요일|금요일|일요일|월|화|수|목|금|일|내|말|끝)?/,
      handler: m => {
        const key = m[1]?.replace(/요일$/, '')
        const target = key && key in dayMap ? dayMap[key] : 5
        return toISO(nextNextWeekday(target))
      },
    },
    {
      re: /이번\s*주\s*(월요일|화요일|수요일|목요일|금요일|일요일|월|화|수|목|금|일)/,
      handler: m => {
        const key = m[1].replace(/요일$/, '')
        return toISO(nextWeekday(dayMap[key] ?? 5))
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
  return {
    title: cleaned || input,
    part: parsePart(cleaned || input),
    type: parseType(cleaned || input),
    endDate: date,
  }
}

// ── UI ──────────────────────────────────────────────

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

interface Props {
  onAdded?: () => void
}

export default function QuickTaskInput({ onAdded }: Props) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [recentTitles, setRecentTitles] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  const parsed = input.trim() ? parseTaskInput(input) : null

  async function handleSubmit() {
    if (!input.trim() || saving) return
    setSaving(true)
    const { title, part, type, endDate } = parseTaskInput(input)
    const now = new Date().toISOString().slice(0, 7)
    const { data } = await supabase.from('tasks').insert({
      title,
      part,
      type,
      status: '진행필요',
      end_date: endDate,
      work_months: [now],
    }).select('id').single()

    setRecentTitles(prev => [title, ...prev].slice(0, 3))
    setInput('')
    setSaving(false)
    onAdded?.()
    if (data?.id) router.refresh()
    inputRef.current?.focus()
  }

  return (
    <div className="flex-shrink-0">
      <div className={`bg-white border rounded-xl px-4 py-3 transition-colors ${input ? 'border-emerald-200 shadow-sm' : 'border-gray-100'}`}>
        <div className="flex items-center gap-3">
          <span className="text-gray-300 text-sm flex-shrink-0">+</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit() }}
            placeholder="업무 빠른 추가 — 예) 평가시뮬레이션 자료 준비 7/3까지"
            className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent"
          />
          {parsed && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PART_COLORS[parsed.part]}`}>{parsed.part}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[parsed.type]}`}>{parsed.type}</span>
              {parsed.endDate && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">
                  ~{parsed.endDate.slice(5).replace('-', '/')}
                </span>
              )}
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="text-[10px] bg-gray-900 text-white px-2.5 py-1 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {saving ? '저장 중' : 'Enter ↵'}
              </button>
            </div>
          )}
        </div>

        {recentTitles.length > 0 && !input && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-300">방금 추가:</span>
            {recentTitles.map((t, i) => (
              <span key={i} className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
