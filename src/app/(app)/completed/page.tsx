'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task, AchievementCategory } from '@/types'

const COLUMNS: { key: AchievementCategory | null; label: string; bg: string; dot: string }[] = [
  { key: null,     label: '미분류', bg: 'bg-gray-50 border-gray-100',          dot: 'bg-gray-300' },
  { key: '성과',   label: '성과',   bg: 'bg-[#BADEC8]/20 border-[#BADEC8]/35', dot: 'bg-[#BADEC8]' },
  { key: '개선',   label: '개선',   bg: 'bg-[#F3E482]/20 border-[#F3E482]/35', dot: 'bg-[#F3E482]' },
  { key: '리소스', label: '리소스', bg: 'bg-[#90A7D8]/15 border-[#90A7D8]/25', dot: 'bg-[#90A7D8]' },
  { key: '수명',   label: '수명',   bg: 'bg-[#BFE4B5]/20 border-[#BFE4B5]/35', dot: 'bg-[#BFE4B5]' },
  { key: '기타',   label: '기타',   bg: 'bg-gray-100/60 border-gray-200',       dot: 'bg-gray-300' },
]

function getTaskMonth(task: Task): string | null {
  if ((task.work_months ?? []).length > 0) return (task.work_months ?? []).at(-1)!
  if (task.end_date) return task.end_date.slice(0, 7)
  if (task.updated_at) return task.updated_at.slice(0, 7)
  return null
}

function formatYM(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

type QuickPeriod = '주간' | '당월' | '분기' | '상반기' | '하반기' | '포트폴리오'
const QUICK_PERIODS: QuickPeriod[] = ['주간', '당월', '분기', '상반기', '하반기', '포트폴리오']

function getPeriodMonths(period: Exclude<QuickPeriod, '주간' | '당월'>): string[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  if (period === '분기') {
    const q = Math.ceil(m / 3)
    const start = (q - 1) * 3 + 1
    return Array.from({ length: 3 }, (_, i) => `${y}-${String(start + i).padStart(2, '0')}`)
  }
  if (period === '상반기') return Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  return Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 7).padStart(2, '0')}`)
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekRange(ws: Date): string {
  const we = new Date(ws)
  we.setDate(we.getDate() + 6)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${ws.getFullYear()}년 ${fmt(ws)} ~ ${fmt(we)}`
}

interface WeekActiveTask { id: string; title: string; status: string; part: string; type: string; noteCount: number }
interface WeekCompletedTask { id: string; title: string; part: string; type: string }
interface WeekMeeting { id: string; title: string; meeting_date: string; notePreview: string | null }
interface WeekOneOnOne { id: string; session_date: string | null; member_id: string; member_name: string }

interface PeriodSummary {
  activeTasks: WeekActiveTask[]
  completedTasks: WeekCompletedTask[]
  meetings: WeekMeeting[]
  oneOnOnes: WeekOneOnOne[]
  loading: boolean
}

const EMPTY_SUMMARY: PeriodSummary = { activeTasks: [], completedTasks: [], meetings: [], oneOnOnes: [], loading: false }

// ─── 4열 요약 그리드 (주간/당월 공용) ────────────────────────────────────────
function SummaryGrid({ data }: { data: PeriodSummary }) {
  const fmt = (d: string) => d.slice(5).replace('-', '/')
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {/* 완료한 업무 */}
      <div className="rounded-xl border p-4 bg-[#BADEC8]/20 border-[#BADEC8]/35">
        <p className="text-xs font-semibold text-[#2D5A45] mb-3">
          완료한 업무{data.completedTasks.length > 0 && <span className="font-normal opacity-70 ml-1">{data.completedTasks.length}건</span>}
        </p>
        {data.loading ? (
          <p className="text-xs text-gray-300 py-2">불러오는 중...</p>
        ) : data.completedTasks.length === 0 ? (
          <p className="text-xs text-gray-300 py-2">완료된 업무 없음</p>
        ) : (
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {data.completedTasks.map(t => (
              <Link key={t.id} href={`/tasks/${t.id}`}
                className="block text-xs text-gray-700 hover:text-gray-900 py-1 border-b border-[#BADEC8]/30 last:border-0 truncate transition-colors">
                {t.title || '제목 없음'}
                {t.part && <span className="text-gray-400 ml-1">· {t.part}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 기록한 업무 */}
      <div className="rounded-xl border p-4 bg-white border-gray-100">
        <p className="text-xs font-semibold text-gray-600 mb-3">
          기록한 업무{data.activeTasks.length > 0 && <span className="font-normal text-gray-400 ml-1">{data.activeTasks.length}건</span>}
        </p>
        {data.loading ? (
          <p className="text-xs text-gray-300 py-2">불러오는 중...</p>
        ) : data.activeTasks.length === 0 ? (
          <p className="text-xs text-gray-300 py-2">기록된 업무 없음</p>
        ) : (
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {data.activeTasks.map(t => (
              <Link key={t.id} href={`/tasks/${t.id}`}
                className="flex items-center justify-between text-xs text-gray-700 hover:text-gray-900 py-1 border-b border-gray-100 last:border-0 transition-colors gap-2">
                <span className="truncate">{t.title || '제목 없음'}</span>
                <span className="text-gray-300 flex-shrink-0">노트 {t.noteCount}건</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 회의 */}
      <div className="rounded-xl border p-4 bg-[#90A7D8]/15 border-[#90A7D8]/25">
        <p className="text-xs font-semibold text-[#1E3A6B] mb-3">
          회의{data.meetings.length > 0 && <span className="font-normal opacity-70 ml-1">{data.meetings.length}건</span>}
        </p>
        {data.loading ? (
          <p className="text-xs text-gray-300 py-2">불러오는 중...</p>
        ) : data.meetings.length === 0 ? (
          <p className="text-xs text-gray-300 py-2">회의 없음</p>
        ) : (
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {data.meetings.map(m => (
              <Link key={m.id} href={`/meetings/${m.id}`}
                className="block py-1.5 border-b border-[#90A7D8]/20 last:border-0 transition-colors group">
                <div className="flex items-baseline gap-1 truncate">
                  <span className="text-xs text-gray-700 group-hover:text-gray-900 truncate">{m.title || '제목 없음'}</span>
                  <span className="text-gray-400 text-[10px] flex-shrink-0">{fmt(m.meeting_date)}</span>
                </div>
                {m.notePreview && (
                  <p className="text-[10px] text-gray-400 leading-relaxed mt-0.5 line-clamp-2">{m.notePreview}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 1on1 */}
      <div className="rounded-xl border p-4 bg-[#EDE9FE]/40 border-[#C4B5FD]/30">
        <p className="text-xs font-semibold text-[#5B21B6] mb-3">
          1on1{data.oneOnOnes.length > 0 && <span className="font-normal opacity-70 ml-1">{data.oneOnOnes.length}건</span>}
        </p>
        {data.loading ? (
          <p className="text-xs text-gray-300 py-2">불러오는 중...</p>
        ) : data.oneOnOnes.length === 0 ? (
          <p className="text-xs text-gray-300 py-2">1on1 없음</p>
        ) : (
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {data.oneOnOnes.map(s => (
              <Link key={s.id} href={`/one-on-one/${s.member_id}/${s.id}`}
                className="flex items-center justify-between text-xs py-1 border-b border-[#C4B5FD]/20 last:border-0 transition-colors group gap-2">
                <span className="text-gray-700 group-hover:text-gray-900 font-medium truncate">{s.member_name}</span>
                {s.session_date && (
                  <span className="text-gray-400 flex-shrink-0 text-[10px]">{fmt(s.session_date)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CompletedPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('주간')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const nowYM = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const [fromMonth, setFromMonth] = useState<string>(nowYM)
  const [toMonth, setToMonth] = useState<string>(nowYM)

  // 주간 state
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [weekData, setWeekData] = useState<PeriodSummary>(EMPTY_SUMMARY)
  const [weekReflection, setWeekReflection] = useState('')
  const [weekSaved, setWeekSaved] = useState(false)

  // 당월 state
  const [selectedMonth, setSelectedMonth] = useState<string>(nowYM)
  const [monthData, setMonthData] = useState<PeriodSummary>(EMPTY_SUMMARY)

  const supabase = createClient()

  useEffect(() => {
    fetchAllTasks().then(all => setTasks(all.filter(t => t.status === '완료')))
  }, [])

  // 주간 데이터 로드
  useEffect(() => {
    if (quickPeriod !== '주간') return

    const reflectionKey = `weekly_reflection_${weekStart.toISOString().slice(0, 10)}`
    const saved = typeof window !== 'undefined' ? localStorage.getItem(reflectionKey) : null
    setWeekReflection(saved ?? '')
    setWeekSaved(false)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const wsISO = weekStart.toISOString()
    const weISO = weekEnd.toISOString()
    const wsDate = weekStart.toISOString().slice(0, 10)
    const weDate = weekEnd.toISOString().slice(0, 10)

    setWeekData(prev => ({ ...prev, loading: true }))

    Promise.all([
      supabase.from('notes').select('task_id').gte('created_at', wsISO).lt('created_at', weISO),
      supabase.from('tasks').select('id, title, part, type').eq('status', '완료').gte('updated_at', wsISO).lt('updated_at', weISO),
      supabase.from('meetings').select('id, title, meeting_date, notes').gte('meeting_date', wsDate).lt('meeting_date', weDate).order('meeting_date'),
      supabase.from('one_on_ones').select('id, session_date, member_id').gte('session_date', wsDate).lt('session_date', weDate).order('session_date'),
      supabase.from('members').select('id, name'),
    ]).then(async ([notesRes, completedRes, meetingsRes, oo1Res, mbRes]) => {
      setWeekData(await buildPeriodSummary(notesRes, completedRes, meetingsRes, oo1Res, mbRes))
    })
  }, [quickPeriod, weekStart])

  // 당월 데이터 로드
  useEffect(() => {
    if (quickPeriod !== '당월') return

    const [y, m] = selectedMonth.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 1)
    const wsISO = start.toISOString()
    const weISO = end.toISOString()
    const wsDate = start.toISOString().slice(0, 10)
    const weDate = end.toISOString().slice(0, 10)

    setMonthData(prev => ({ ...prev, loading: true }))

    Promise.all([
      supabase.from('notes').select('task_id').gte('created_at', wsISO).lt('created_at', weISO),
      supabase.from('tasks').select('id, title, part, type').eq('status', '완료').gte('updated_at', wsISO).lt('updated_at', weISO),
      supabase.from('meetings').select('id, title, meeting_date, notes').gte('meeting_date', wsDate).lt('meeting_date', weDate).order('meeting_date'),
      supabase.from('one_on_ones').select('id, session_date, member_id').gte('session_date', wsDate).lt('session_date', weDate).order('session_date'),
      supabase.from('members').select('id, name'),
    ]).then(async ([notesRes, completedRes, meetingsRes, oo1Res, mbRes]) => {
      setMonthData(await buildPeriodSummary(notesRes, completedRes, meetingsRes, oo1Res, mbRes))
    })
  }, [quickPeriod, selectedMonth])

  // 주간 회고 자동저장
  useEffect(() => {
    if (quickPeriod !== '주간') return
    const reflectionKey = `weekly_reflection_${weekStart.toISOString().slice(0, 10)}`
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(reflectionKey, weekReflection)
        setWeekSaved(true)
        setTimeout(() => setWeekSaved(false), 2000)
      } catch { /* ignore */ }
    }, 800)
    return () => clearTimeout(timer)
  }, [weekReflection, quickPeriod, weekStart])

  const filtered = useMemo(() => {
    if (fromMonth && toMonth) return tasks.filter(t => { const m = getTaskMonth(t); return m ? m >= fromMonth && m <= toMonth : false })
    return tasks
  }, [tasks, fromMonth, toMonth])

  function selectQuick(p: QuickPeriod) {
    setQuickPeriod(p)
    if (p === '주간') { setFromMonth(''); setToMonth(''); return }
    if (p === '당월') { setFromMonth(selectedMonth); setToMonth(selectedMonth); return }
    const months = getPeriodMonths(p)
    if (months.length > 0) { setFromMonth(months[0]); setToMonth(months[months.length - 1]) }
  }

  async function handleDrop(category: AchievementCategory | null) {
    if (!draggedId) return
    await supabase.from('tasks').update({ achievement_category: category }).eq('id', draggedId)
    setTasks(prev => prev.map(t => t.id === draggedId ? { ...t, achievement_category: category } : t))
    setDraggedId(null); setDragOverCol(null)
  }

  function getColTasks(key: AchievementCategory | null) {
    return filtered.filter(t => (t.achievement_category ?? null) === key)
  }

  const achieveCount = filtered.filter(t => t.achievement_category === '성과').length
  const improveCount = filtered.filter(t => t.achievement_category === '개선').length
  const retroCount = filtered.filter(t => t.retrospective?.good || t.retrospective?.bad || t.retrospective?.improvement).length

  function shiftWeek(delta: number) {
    setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + delta * 7); return d })
  }

  function shiftMonth(delta: number) {
    setSelectedMonth(prev => {
      const [y, m] = prev.split('-').map(Number)
      const d = new Date(y, m - 1 + delta, 1)
      const newYM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      setFromMonth(newYM)
      setToMonth(newYM)
      return newYM
    })
  }

  // 칸반 + 회고 섹션 (당월/분기/상반기/하반기 공용)
  function renderKanban() {
    return (
      <>
        {/* stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-100 p-5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-2">총 완료</p>
            <p className="text-4xl font-bold text-gray-800 mb-1">{filtered.length}</p>
            <p className="text-xs text-gray-400">건</p>
          </div>
          <div className="bg-[#BADEC8]/25 rounded-lg border border-[#BADEC8]/40 p-5">
            <p className="text-xs text-[#2D5A45] font-medium mb-2">성과</p>
            <p className="text-4xl font-bold text-[#2D5A45] mb-1">{achieveCount}</p>
            <p className="text-xs text-[#2D5A45]">건</p>
          </div>
          <div className="bg-[#F3E482]/25 rounded-lg border border-[#F3E482]/45 p-5">
            <p className="text-xs text-[#5A4A10] font-medium mb-2">개선</p>
            <p className="text-4xl font-bold text-[#5A4A10] mb-1">{improveCount}</p>
            <p className="text-xs text-[#5A4A10]">건</p>
          </div>
          <div className="bg-[#90A7D8]/20 rounded-lg border border-[#90A7D8]/35 p-5">
            <p className="text-xs text-[#1E3A6B] font-medium mb-2">회고 작성</p>
            <p className="text-4xl font-bold text-[#1E3A6B] mb-1">{retroCount}</p>
            <p className="text-xs text-[#1E3A6B]">
              {filtered.length > 0 ? `${Math.round(retroCount / filtered.length * 100)}%` : '—'}
            </p>
          </div>
        </div>

        {/* 칸반 (드래그앤드롭) */}
        <div className="flex gap-5 overflow-x-auto pb-4 mb-8">
          {COLUMNS.map(col => {
            const colTasks = getColTasks(col.key)
            const colKey = col.key ?? '__null__'
            return (
              <div key={colKey}
                onDragOver={e => { e.preventDefault(); setDragOverCol(colKey) }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.key)}
                className={`flex-shrink-0 w-56 rounded-lg border p-4 transition-all ${col.bg} ${dragOverCol === colKey ? 'scale-[1.02] opacity-90' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <h3 className="text-sm font-bold text-gray-700">{col.label}</h3>
                  </div>
                  <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">{colTasks.length}</span>
                </div>
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
                  {colTasks.map(task => (
                    <div key={task.id} draggable
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => { setDraggedId(null); setDragOverCol(null) }}
                      className={`bg-white rounded-md border border-gray-100 p-2.5 cursor-grab active:cursor-grabbing hover:border-gray-200 transition-all ${draggedId === task.id ? 'opacity-50' : ''}`}>
                      <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                        <p className="text-xs font-semibold text-gray-800 leading-snug mb-1.5">
                          {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                        </p>
                      </Link>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{task.type}</span>
                        <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{task.part}</span>
                        {getTaskMonth(task) && <span className="text-xs text-gray-300">{formatYM(getTaskMonth(task)!)}</span>}
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-4">여기에 드롭</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 회고 기록 */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-gray-800">회고 기록</h2>
            <span className="text-xs text-gray-400">완료 업무의 잘한점 · 아쉬운점 · 개선점</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-8">해당 기간에 완료된 업무가 없습니다</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filtered.map(task => (
                <Link key={task.id} href={`/tasks/${task.id}`}
                  className="bg-white rounded-lg border border-gray-100 p-4 hover:border-gray-200 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{task.title || '제목 없음'}</p>
                      <div className="flex gap-1.5 mt-1">
                        {task.part && <span className="text-xs text-gray-400">{task.part}</span>}
                        {task.type && <span className="text-xs text-gray-400">· {task.type}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-300">{getTaskMonth(task) ?? ''}</span>
                  </div>
                  {(task.retrospective?.good || task.retrospective?.bad || task.retrospective?.improvement) ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`rounded-lg p-3 ${task.retrospective?.good ? 'bg-[#BADEC8]/25' : 'bg-gray-50'}`}>
                        <p className="text-[10px] font-semibold text-[#2D5A45] mb-1">잘한점</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.good || <span className="text-gray-300">없음</span>}</p>
                      </div>
                      <div className={`rounded-lg p-3 ${task.retrospective?.bad ? 'bg-[#EBA698]/20' : 'bg-gray-50'}`}>
                        <p className="text-[10px] font-semibold text-[#6B2D25] mb-1">아쉬운점</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.bad || <span className="text-gray-300">없음</span>}</p>
                      </div>
                      <div className={`rounded-lg p-3 ${task.retrospective?.improvement ? 'bg-[#F3E482]/25' : 'bg-gray-50'}`}>
                        <p className="text-[10px] font-semibold text-[#5A4A10] mb-1">개선점</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.improvement || <span className="text-gray-300">없음</span>}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 italic">회고 미작성 → 업무 상세에서 작성 가능</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold text-gray-900">완료 성과</h1>
        {quickPeriod !== '주간' && quickPeriod !== '당월' && (
          <span className="text-sm text-gray-400">총 {filtered.length}건</span>
        )}
      </div>

      {/* 탭 바 */}
      <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto scrollbar-hide w-fit max-w-full">
        {QUICK_PERIODS.map(p => (
          <button key={p} onClick={() => selectQuick(p)}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
              quickPeriod === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {p}
          </button>
        ))}
      </div>

      {/* ── 주간 뷰 ── */}
      {quickPeriod === '주간' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => shiftWeek(-1)}
              className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm">←</button>
            <span className="text-sm font-semibold text-gray-700">{formatWeekRange(weekStart)}</span>
            <button onClick={() => shiftWeek(1)}
              className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm">→</button>
          </div>

          <SummaryGrid data={weekData} />

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">주간 회고</h2>
              <span className={`text-xs transition-opacity ${weekSaved ? 'text-emerald-500 opacity-100' : 'opacity-0'}`}>저장됨</span>
            </div>
            <textarea
              value={weekReflection}
              onChange={e => setWeekReflection(e.target.value)}
              placeholder={"이번 주를 돌아보며 자유롭게 작성하세요\n\n한 일 / 배운 것 / 다음 주 준비..."}
              className="w-full text-sm text-gray-700 leading-relaxed focus:outline-none resize-none placeholder-gray-300"
              style={{ minHeight: 220 }}
            />
          </div>
        </div>
      )}

      {/* ── 당월 뷰 ── */}
      {quickPeriod === '당월' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => shiftMonth(-1)}
              className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm">←</button>
            <span className="text-sm font-semibold text-gray-700">{formatYM(selectedMonth)}</span>
            <button onClick={() => shiftMonth(1)}
              className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm">→</button>
          </div>

          <SummaryGrid data={monthData} />

          {renderKanban()}
        </div>
      )}

      {/* ── 분기/상반기/하반기 뷰 ── */}
      {(quickPeriod === '분기' || quickPeriod === '상반기' || quickPeriod === '하반기') && renderKanban()}

      {/* ── 포트폴리오 뷰 ── */}
      {quickPeriod === '포트폴리오' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-400">완료한 업무 전체 — 업무 단위 성과 아카이브</p>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-12">완료된 업무가 없습니다</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tasks.map(t => (
                <Link key={t.id} href={`/tasks/${t.id}`}
                  className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-300 hover:shadow-sm transition-all flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-800 leading-snug">{t.title}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 bg-gray-50 px-1.5 py-0.5 rounded">{t.part}</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">{t.type}</span>
                    {t.end_date && <span className="text-[10px] text-gray-400">{t.end_date.slice(0, 7)} 완료</span>}
                  </div>
                  {t.retrospective && (t.retrospective.good || t.retrospective.bad) && (
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed border-t border-gray-50 pt-2">
                      {t.retrospective.good || t.retrospective.bad}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <Link href="/journal?tab=selfeval"
              className="text-sm text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:border-gray-400 transition-colors">
              → 자기평가 초안 만들기
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 공통 기간 데이터 빌더 ────────────────────────────────────────────────────
async function buildPeriodSummary(
  notesRes: { data: unknown[] | null },
  completedRes: { data: unknown[] | null },
  meetingsRes: { data: unknown[] | null },
  oo1Res: { data: unknown[] | null },
  mbRes: { data: unknown[] | null },
): Promise<PeriodSummary> {
  const supabase = createClient()

  const completedTasks = (completedRes.data ?? []) as WeekCompletedTask[]

  const meetings: WeekMeeting[] = ((meetingsRes.data ?? []) as { id: string; title: string; meeting_date: string; notes: { title: string; content: string }[] }[])
    .map(m => ({
      id: m.id, title: m.title, meeting_date: m.meeting_date,
      notePreview: m.notes?.[0]?.content?.replace(/\n/g, ' ').slice(0, 80) ?? null,
    }))

  const memberMap: Record<string, string> = {}
  for (const mb of (mbRes.data ?? []) as { id: string; name: string }[]) memberMap[mb.id] = mb.name

  const oneOnOnes: WeekOneOnOne[] = ((oo1Res.data ?? []) as { id: string; session_date: string | null; member_id: string }[])
    .map(s => ({ ...s, member_name: memberMap[s.member_id] ?? '알 수 없음' }))

  const noteCountMap: Record<string, number> = {}
  for (const n of (notesRes.data ?? []) as { task_id: string }[]) noteCountMap[n.task_id] = (noteCountMap[n.task_id] ?? 0) + 1
  const activeTaskIds = Object.keys(noteCountMap)

  let activeTasks: WeekActiveTask[] = []
  if (activeTaskIds.length > 0) {
    const { data: atData } = await supabase.from('tasks').select('id, title, status, part, type').in('id', activeTaskIds)
    activeTasks = ((atData ?? []) as Omit<WeekActiveTask, 'noteCount'>[])
      .map(t => ({ ...t, noteCount: noteCountMap[t.id] ?? 0 }))
      .sort((a, b) => b.noteCount - a.noteCount)
  }

  return { activeTasks, completedTasks, meetings, oneOnOnes, loading: false }
}
