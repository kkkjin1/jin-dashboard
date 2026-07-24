'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task } from '@/types'

interface DailyJournal {
  id: string
  date: string
  content: string
  linked_task_ids: string[]
  linked_meeting_ids: string[]
}

function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function todayStr() { return localDateStr(new Date()) }

function nDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d)
}

function formatDateFull(ds: string) {
  const d = new Date(ds + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

function formatDateShort(ds: string) {
  const d = new Date(ds + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

function buildMarkdown(selected: string[], journals: DailyJournal[], tasks: Task[]) {
  const journalMap = new Map(journals.map(j => [j.date, j]))
  const sorted = [...selected].sort()

  const lines: string[] = []
  lines.push(`# 회고 기록 (${sorted[0]} ~ ${sorted[sorted.length - 1]})`)
  lines.push(`> 내보낸 일자 수: ${sorted.length}건`)
  lines.push('')

  for (const ds of sorted) {
    const j = journalMap.get(ds)
    lines.push(`## ${formatDateFull(ds)}`)
    if (!j) {
      lines.push('(기록 없음)')
    } else {
      lines.push(j.content)
      if (j.linked_task_ids.length > 0) {
        lines.push('')
        lines.push('**연결된 업무:**')
        j.linked_task_ids.forEach(id => {
          const t = tasks.find(x => x.id === id)
          if (t) lines.push(`- ${t.title} [${t.status}]`)
        })
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

function downloadMd(content: string, from: string, to: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `회고_${from}_${to}.md`
  a.click()
  URL.revokeObjectURL(url)
}

const QUICK_RANGES = [
  { label: '최근 7일', from: nDaysAgo(7), to: todayStr() },
  { label: '최근 30일', from: nDaysAgo(30), to: todayStr() },
  { label: '최근 90일', from: nDaysAgo(90), to: todayStr() },
]

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 20px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.07) inset',
  borderRadius: 20,
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.09)',
  color: '#E2E8F0',
  colorScheme: 'dark',
}

export default function JournalPage() {
  const TODAY = todayStr()
  const [journals, setJournals] = useState<DailyJournal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState(nDaysAgo(30))
  const [toDate, setToDate] = useState(TODAY)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<string | null>(null)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inRange = journals.filter(j => j.date >= fromDate && j.date <= toDate)

  function selectRange(from: string, to: string) {
    setFromDate(from)
    setToDate(to)
    setSelected(new Set())
    setPreview(null)
  }

  function toggleDate(ds: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(ds)) next.delete(ds)
      else next.add(ds)
      return next
    })
    setPreview(null)
  }

  function selectAll() {
    setSelected(new Set(inRange.map(j => j.date)))
    setPreview(null)
  }

  function clearAll() {
    setSelected(new Set())
    setPreview(null)
  }

  function handlePreview() {
    if (selected.size === 0) return
    setPreview(buildMarkdown([...selected], journals, tasks))
  }

  function handleDownload() {
    const sorted = [...selected].sort()
    const md = buildMarkdown(sorted, journals, tasks)
    downloadMd(md, sorted[0], sorted[sorted.length - 1])
  }

  if (loading) return (
    <div style={{ background: '#0F1319', minHeight: '100%' }} className="p-6 flex flex-col gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16 }} className="h-20 animate-pulse" />
      ))}
    </div>
  )

  return (
    <div style={{ background: '#0F1319', minHeight: '100%' }} className="h-full overflow-y-auto p-5 md:p-6 flex flex-col gap-5 font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0">
        <h1 className="text-xl font-bold" style={{ color: '#E2E8F0' }}>회고 내보내기</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(226,232,240,0.5)' }}>기간을 설정하고 원하는 날짜를 선택해 MD 파일로 내보내세요</p>
      </div>

      {/* Step 1: 기간 설정 */}
      <div className="flex-shrink-0 p-4 flex flex-col gap-3" style={CARD_STYLE}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(226,232,240,0.5)' }}>Step 1 · 기간 설정</p>

        {/* 빠른 선택 */}
        <div className="flex gap-2">
          {QUICK_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => selectRange(r.from, r.to)}
              className="text-xs px-3 py-1.5 rounded-full transition-all"
              style={
                fromDate === r.from && toDate === r.to
                  ? { background: '#1B3A6B', color: '#fff', border: '1px solid #1B3A6B' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.7)', border: '1px solid rgba(255,255,255,0.09)' }
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* 직접 입력 */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            max={toDate}
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setSelected(new Set()); setPreview(null) }}
            className="text-xs rounded-lg px-3 py-2 focus:outline-none"
            style={INPUT_STYLE}
          />
          <span className="text-sm" style={{ color: 'rgba(226,232,240,0.5)' }}>~</span>
          <input
            type="date"
            min={fromDate}
            max={TODAY}
            value={toDate}
            onChange={e => { setToDate(e.target.value); setSelected(new Set()); setPreview(null) }}
            className="text-xs rounded-lg px-3 py-2 focus:outline-none"
            style={INPUT_STYLE}
          />
          <span className="text-xs ml-1" style={{ color: 'rgba(226,232,240,0.5)' }}>{inRange.length}건</span>
        </div>
      </div>

      {/* Step 2: 날짜 선택 */}
      <div className="flex-shrink-0 p-4 flex flex-col gap-3" style={CARD_STYLE}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(226,232,240,0.5)' }}>Step 2 · 날짜 선택</p>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-[11px] transition-colors" style={{ color: 'rgba(226,232,240,0.5)' }}>전체 선택</button>
            <span className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>|</span>
            <button onClick={clearAll} className="text-[11px] transition-colors" style={{ color: 'rgba(226,232,240,0.5)' }}>초기화</button>
          </div>
        </div>

        {inRange.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'rgba(226,232,240,0.28)' }}>
            선택한 기간에 회고가 없어요 —{' '}
            <Link href="/" className="text-blue-400 hover:underline">홈에서 작성</Link>
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
            {inRange.map(j => {
              const isSelected = selected.has(j.date)
              const preview80 = j.content.slice(0, 60).replace(/\n/g, ' ')
              return (
                <button
                  key={j.date}
                  onClick={() => toggleDate(j.date)}
                  className="text-left p-2.5 rounded-xl transition-all"
                  style={
                    isSelected
                      ? { background: '#1B3A6B', border: '1px solid #1B3A6B', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#E2E8F0' }
                  }
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center text-[9px]"
                      style={
                        isSelected
                          ? { background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff' }
                          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'transparent' }
                      }
                    >✓</span>
                    <span className="text-[11px] font-semibold" style={{ color: isSelected ? '#fff' : '#E2E8F0' }}>
                      {formatDateShort(j.date)}
                    </span>
                  </div>
                  <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'rgba(226,232,240,0.5)' }}>
                    {preview80}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Step 3: 내보내기 */}
      <div className="flex-shrink-0 p-4 flex flex-col gap-3" style={CARD_STYLE}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(226,232,240,0.5)' }}>Step 3 · 내보내기</p>

        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'rgba(226,232,240,0.5)' }}>
            {selected.size > 0 ? (
              <><strong style={{ color: '#E2E8F0' }}>{selected.size}개</strong> 선택됨</>
            ) : (
              <span style={{ color: 'rgba(226,232,240,0.28)' }}>날짜를 선택하세요</span>
            )}
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handlePreview}
              disabled={selected.size === 0}
              className="text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.7)', background: 'rgba(255,255,255,0.06)' }}
            >
              미리보기
            </button>
            <button
              onClick={handleDownload}
              disabled={selected.size === 0}
              className="text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: '#1B3A6B', color: '#fff' }}
            >
              MD 다운로드
            </button>
          </div>
        </div>

        <p className="text-[11px]" style={{ color: 'rgba(226,232,240,0.5)' }}>
          MD 파일을 ChatGPT · Claude 등에 붙여넣어 원하는 분석을 요청하세요
        </p>
      </div>

      {/* 미리보기 */}
      {preview && (
        <div className="flex-shrink-0 p-4 flex flex-col gap-2" style={CARD_STYLE}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(226,232,240,0.5)' }}>미리보기</p>
            <button
              onClick={() => { navigator.clipboard.writeText(preview) }}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: 'rgba(226,232,240,0.5)', border: '1px solid rgba(255,255,255,0.09)' }}
            >
              복사
            </button>
          </div>
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap font-mono rounded-xl p-3 max-h-80 overflow-y-auto"
            style={{ color: '#E2E8F0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {preview}
          </pre>
        </div>
      )}

    </div>
  )
}
