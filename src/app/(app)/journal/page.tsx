'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task } from '@/types'
import { JournalFullscreenEditor } from '@/components/home/DailyJournalWidget'
import type { DailyJournal } from '@/components/home/DailyJournalWidget'

interface MeetingMin { id: string; title: string; meeting_date?: string | null }

function localDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr() { return localDateStr(new Date()) }

function nDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d)
}

function getPrevDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1)
  return localDateStr(dt)
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

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

function stripMd(s: string) {
  return s.replace(/##[^\n]*/g, '').replace(/\*\*[^*]*\*\*/g, '').replace(/\[.*?\]/g, '').replace(/\n+/g, ' ').trim()
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

const pill = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[#4C7FE0] text-white border-[#4C7FE0] shadow-sm'
const pOff = 'bg-white/[0.06] backdrop-blur-xl border-white/[0.09] text-white/50 hover:bg-white/[0.1] hover:text-[#E2E8F0]'

/* ── 행 컴포넌트 ── */
function JournalRow({ journal, selected, onToggleSelect, onOpen, onDelete }: {
  journal: DailyJournal
  selected: boolean
  onToggleSelect: (date: string) => void
  onOpen: (j: DailyJournal) => void
  onDelete: (date: string) => void
}) {
  const preview = stripMd(journal.content).slice(0, 160)
  return (
    <div
      onClick={() => onOpen(journal)}
      className={`group flex items-center gap-0 cursor-pointer select-none transition-colors ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
      style={{ padding: '9px 4px', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
      <input type="checkbox" checked={selected}
        onChange={e => { e.stopPropagation(); onToggleSelect(journal.date) }}
        onClick={e => e.stopPropagation()}
        className="w-3 h-3 rounded accent-gray-400 flex-shrink-0 cursor-pointer mr-3" />
      <div style={{ width: 2.5, height: 26, background: '#4C7FE0', flexShrink: 0, borderRadius: 2, marginRight: 8 }} />
      <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, width: 88, color: '#E2E8F0' }}>
        {formatDateShort(journal.date)}
      </span>
      <p style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#98A1B2', fontSize: 11 }}>
        {preview || '(내용 없음)'}
      </p>
      <button
        onClick={e => { e.stopPropagation(); onDelete(journal.date) }}
        className="text-[9px] text-white/[0.28] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-3">
        삭제
      </button>
    </div>
  )
}

/* ── 필터 정의 ── */
type FilterRange = 'all' | '7d' | '30d' | '90d'
const RANGES: { key: FilterRange; label: string; days: number }[] = [
  { key: 'all', label: '전체', days: 0 },
  { key: '7d',  label: '최근 7일', days: 7 },
  { key: '30d', label: '최근 30일', days: 30 },
  { key: '90d', label: '최근 90일', days: 90 },
]

/* ── 메인 페이지 ── */
export default function JournalPage() {
  const [journals, setJournals]   = useState<DailyJournal[]>([])
  const [tasks, setTasks]         = useState<Task[]>([])
  const [meetings, setMeetings]   = useState<MeetingMin[]>([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [filterRange, setFilterRange] = useState<FilterRange>('all')
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [editorState, setEditorState] = useState<{
    date: string
    journal: DailyJournal | null
    yesterday: DailyJournal | null
  } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [{ data: j }, t, { data: m }] = await Promise.all([
        supabase.from('daily_journals').select('*').order('date', { ascending: false }),
        fetchAllTasks(),
        supabase.from('project_meetings').select('id, title, meeting_date').order('meeting_date', { ascending: false }).limit(100),
      ])
      setJournals((j ?? []) as DailyJournal[])
      setTasks(t)
      setMeetings((m ?? []) as MeetingMin[])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 에디터 열기 */
  function openEditor(date: string, journalData?: DailyJournal) {
    const journal = journalData ?? journals.find(j => j.date === date) ?? null
    const prevDate = getPrevDate(date)
    const yesterday = journals.find(j => j.date === prevDate) ?? null
    setEditorState({ date, journal, yesterday })
  }

  function openNewJournal() {
    openEditor(todayStr())
  }

  function handleEditorSaved(saved: DailyJournal) {
    setJournals(prev => {
      const exists = prev.find(j => j.date === saved.date)
      if (exists) return prev.map(j => j.date === saved.date ? saved : j)
      return [saved, ...prev].sort((a, b) => b.date.localeCompare(a.date))
    })
    setEditorState(null)
  }

  async function deleteJournal(date: string) {
    if (!confirm('회고를 삭제하시겠습니까?')) return
    await supabase.from('daily_journals').delete().eq('date', date)
    setJournals(prev => prev.filter(j => j.date !== date))
    setSelected(prev => { const s = new Set(prev); s.delete(date); return s })
  }

  function toggleSelect(date: string) {
    setSelected(prev => { const s = new Set(prev); s.has(date) ? s.delete(date) : s.add(date); return s })
  }

  function handleDownload() {
    if (selected.size === 0) return
    const sorted = [...selected].sort()
    downloadMd(buildMarkdown(sorted, journals, tasks), sorted[0], sorted[sorted.length - 1])
  }

  const displayed = useMemo(() => {
    if (filterRange === 'all') return journals
    const cutoff = nDaysAgo(RANGES.find(r => r.key === filterRange)!.days)
    return journals.filter(j => j.date >= cutoff)
  }, [journals, filterRange])

  const monthGroups = useMemo(() => {
    const map = new Map<string, DailyJournal[]>()
    displayed.forEach(j => {
      const ym = j.date.slice(0, 7)
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym)!.push(j)
    })
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [displayed])

  const allDisplayedSelected = displayed.length > 0 && displayed.every(j => selected.has(j.date))

  function toggleAllDisplayed() {
    const dates = displayed.map(j => j.date)
    if (allDisplayedSelected) {
      setSelected(prev => { const s = new Set(prev); dates.forEach(d => s.delete(d)); return s })
    } else {
      setSelected(prev => { const s = new Set(prev); dates.forEach(d => s.add(d)); return s })
    }
  }

  function toggleMonth(ym: string) {
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(ym) ? s.delete(ym) : s.add(ym); return s })
  }

  if (loading) return (
    <div className="p-6 flex flex-col gap-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-10 animate-pulse rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
      ))}
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 풀스크린 에디터 */}
      {editorState && (
        <JournalFullscreenEditor
          selectedDate={editorState.date}
          current={editorState.journal}
          yesterday={editorState.yesterday}
          meetings={meetings}
          supabaseClient={supabase}
          onSaved={handleEditorSaved}
          onClose={() => setEditorState(null)}
        />
      )}

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#E2E8F0] mr-auto">회고</h1>
        {selected.size > 0 && (
          <>
            <span className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>{selected.size}개 선택</span>
            <button onClick={handleDownload} className={`${pill} ${pOn}`}>MD 다운로드</button>
          </>
        )}
        <span className="text-xs text-white/50 border border-white/[0.09] px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          총 {journals.length}건
        </span>
        <button onClick={openNewJournal}
          className="text-sm bg-[#4C7FE0]/40 text-[#A8C4F0] border border-[#4C7FE0]/50 px-4 py-2 rounded-full hover:bg-[#4C7FE0]/60 transition-colors">
          ✏️ 회고 작성하기
        </button>
      </div>

      {/* 필터 pills */}
      <div className="flex-shrink-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide mb-4 flex-wrap">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => setFilterRange(r.key)}
            className={`${pill} ${filterRange === r.key ? pOn : pOff}`}>
            {r.label}
            {r.key !== 'all' && (
              <span className="ml-1 opacity-60">
                {journals.filter(j => j.date >= nDaysAgo(r.days)).length}
              </span>
            )}
          </button>
        ))}
        {displayed.length > 0 && (
          <button onClick={toggleAllDisplayed} className={`${pill} ${pOff} ml-1`}>
            {allDisplayedSelected ? '전체 해제' : '전체 선택'}
          </button>
        )}
      </div>

      {/* 리스트 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <p className="text-sm" style={{ color: 'rgba(226,232,240,0.28)' }}>기간 내 회고가 없습니다</p>
            <button onClick={openNewJournal}
              className="text-xs border border-dashed border-white/[0.15] rounded-full px-4 py-2 text-white/40 hover:text-white/60 hover:border-white/25 transition-all">
              ✏️ 오늘 회고 작성하기
            </button>
          </div>
        ) : (
          <div className="space-y-6 pb-6">
            {monthGroups.map(([ym, items]) => {
              const isCollapsed = collapsedMonths.has(ym)
              const monthSelected = items.filter(j => selected.has(j.date)).length
              return (
                <div key={ym}>
                  <button onClick={() => toggleMonth(ym)}
                    className="flex items-center gap-2 w-full text-left group mb-2 py-1 pb-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-sm font-semibold text-white/70 group-hover:text-[#E2E8F0] transition-colors">
                      {formatMonthLabel(ym)}
                    </span>
                    <span className="text-xs text-white/50 border border-white/[0.09] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {items.length}건
                    </span>
                    {monthSelected > 0 && (
                      <span className="text-[10px] text-[#A8C4F0] border border-[#4C7FE0]/40 px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(27,58,107,0.2)' }}>
                        {monthSelected}개 선택
                      </span>
                    )}
                    <span className="text-xs text-white/[0.28] ml-auto group-hover:text-white/50 transition-colors">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  </button>
                  {!isCollapsed && items.map(j => (
                    <JournalRow
                      key={j.date}
                      journal={j}
                      selected={selected.has(j.date)}
                      onToggleSelect={toggleSelect}
                      onOpen={j => openEditor(j.date, j)}
                      onDelete={deleteJournal}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
