'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task, AchievementCategory } from '@/types'

const COLUMNS: { key: AchievementCategory | null; label: string; dot: string; accent: string }[] = [
  { key: null,     label: '미분류', dot: 'bg-gray-300',     accent: 'border-gray-200/60' },
  { key: '성과',   label: '성과',   dot: 'bg-[#BADEC8]',   accent: 'border-[#BADEC8]/40' },
  { key: '개선',   label: '개선',   dot: 'bg-[#F3E482]',   accent: 'border-[#F3E482]/40' },
  { key: '리소스', label: '리소스', dot: 'bg-[#90A7D8]',   accent: 'border-[#90A7D8]/40' },
  { key: '수명',   label: '수명',   dot: 'bg-[#BFE4B5]',   accent: 'border-[#BFE4B5]/40' },
  { key: '기타',   label: '기타',   dot: 'bg-gray-300',     accent: 'border-gray-200/60' },
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
interface CompletedAgendaItem { id: string; title: string; group_name: string; group_color: string; updated_at: string }

interface PeriodSummary {
  activeTasks: WeekActiveTask[]
  completedTasks: WeekCompletedTask[]
  completedAgendaItems: CompletedAgendaItem[]
  meetings: WeekMeeting[]
  oneOnOnes: WeekOneOnOne[]
  loading: boolean
}

const EMPTY_SUMMARY: PeriodSummary = { activeTasks: [], completedTasks: [], completedAgendaItems: [], meetings: [], oneOnOnes: [], loading: false }

function SummaryGrid({ data }: { data: PeriodSummary }) {
  const fmt = (d: string) => d.slice(5).replace('-', '/')

  const allCompleted = [
    ...data.completedTasks.map(t => ({ key: t.id, href: `/tasks/${t.id}`, primary: t.title || '제목 없음', secondary: t.part })),
    ...data.completedAgendaItems.map(a => ({ key: `a-${a.id}`, href: `/project/items/${a.id}`, primary: a.title || '제목 없음', secondary: a.group_name })),
  ]

  const cards = [
    {
      title: '완료한 안건',
      count: allCompleted.length,
      bg: 'bg-[#BADEC8]/25 border-[#BADEC8]/45',
      numColor: 'text-[#2D5A45]',
      subColor: 'text-[#2D5A45]/55',
      divider: 'border-[#BADEC8]/30',
      items: allCompleted,
    },
    {
      title: '기록한 업무',
      count: data.activeTasks.length,
      bg: 'bg-white/40 border-white/60',
      numColor: 'text-gray-800',
      subColor: 'text-gray-400',
      divider: 'border-gray-100/80',
      items: data.activeTasks.map(t => ({
        key: t.id, href: `/tasks/${t.id}`,
        primary: t.title || '제목 없음', secondary: `노트 ${t.noteCount}`,
      })),
    },
    {
      title: '회의',
      count: data.meetings.length,
      bg: 'bg-[#90A7D8]/18 border-[#90A7D8]/30',
      numColor: 'text-[#1E3A6B]',
      subColor: 'text-[#1E3A6B]/50',
      divider: 'border-[#90A7D8]/20',
      items: data.meetings.map(m => ({
        key: m.id, href: `/meetings/${m.id}`,
        primary: m.title || '제목 없음', secondary: fmt(m.meeting_date),
      })),
    },
    {
      title: '1on1',
      count: data.oneOnOnes.length,
      bg: 'bg-[#EDE9FE]/35 border-[#C4B5FD]/30',
      numColor: 'text-[#5B21B6]',
      subColor: 'text-[#5B21B6]/50',
      divider: 'border-[#C4B5FD]/20',
      items: data.oneOnOnes.map(s => ({
        key: s.id, href: `/one-on-one/${s.member_id}/${s.id}`,
        primary: s.member_name, secondary: s.session_date ? fmt(s.session_date) : '',
      })),
    },
  ]

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {cards.map(card => (
        <div key={card.title} className={`backdrop-blur-xl border rounded-3xl p-5 ${card.bg}`}>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className={`text-5xl font-bold leading-none ${card.numColor}`}>{card.count}</span>
            <span className={`text-sm font-medium ${card.subColor}`}>건</span>
          </div>
          <p className={`text-xs font-semibold mb-4 ${card.subColor}`}>{card.title}</p>
          <div className={`border-t mb-3 ${card.divider}`} />
          {data.loading ? (
            <p className="text-xs text-gray-300">불러오는 중...</p>
          ) : card.items.length === 0 ? (
            <p className="text-xs text-gray-300">없음</p>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-hide">
              {card.items.map(item => (
                <Link key={item.key} href={item.href}
                  className="flex items-start justify-between text-xs py-1 hover:opacity-70 transition-opacity gap-2">
                  <span className="text-gray-700 break-words leading-relaxed min-w-0">{item.primary}</span>
                  {item.secondary && <span className="text-gray-400 flex-shrink-0">{item.secondary}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function CompletedPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [agendaItems, setAgendaItems] = useState<CompletedAgendaItem[]>([])
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('주간')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const nowYM = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const [fromMonth, setFromMonth] = useState<string>(nowYM)
  const [toMonth, setToMonth] = useState<string>(nowYM)

  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [weekData, setWeekData] = useState<PeriodSummary>(EMPTY_SUMMARY)

  const [selectedMonth, setSelectedMonth] = useState<string>(nowYM)
  const [monthData, setMonthData] = useState<PeriodSummary>(EMPTY_SUMMARY)

  const supabase = createClient()

  useEffect(() => {
    fetchAllTasks().then(all => setTasks(all.filter(t => t.status === '완료')))
    supabase
      .from('agenda_items')
      .select('id, title, updated_at, agenda_groups(name, color)')
      .eq('status', 'done')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setAgendaItems((data ?? []).map((a: { id: string; title: string; updated_at: string; agenda_groups: { name: string; color: string }[] | { name: string; color: string } | null }) => {
          const g = Array.isArray(a.agenda_groups) ? a.agenda_groups[0] : a.agenda_groups
          return { id: a.id, title: a.title, updated_at: a.updated_at, group_name: g?.name ?? '', group_color: g?.color ?? '#9CA3AF' }
        }))
      })
  }, [])

  useEffect(() => {
    if (quickPeriod !== '주간') return
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
      supabase.from('agenda_items').select('id, title, updated_at, agenda_groups(name, color)').eq('status', 'done').gte('updated_at', wsISO).lt('updated_at', weISO),
    ]).then(async ([notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes]) => {
      setWeekData(await buildPeriodSummary(notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes))
    })
  }, [quickPeriod, weekStart])

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
      supabase.from('agenda_items').select('id, title, updated_at, agenda_groups(name, color)').eq('status', 'done').gte('updated_at', wsISO).lt('updated_at', weISO),
    ]).then(async ([notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes]) => {
      setMonthData(await buildPeriodSummary(notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes))
    })
  }, [quickPeriod, selectedMonth])

  const filtered = useMemo(() => {
    if (fromMonth && toMonth) return tasks.filter(t => { const m = getTaskMonth(t); return m ? m >= fromMonth && m <= toMonth : false })
    return tasks
  }, [tasks, fromMonth, toMonth])

  const filteredAgenda = useMemo(() => {
    if (fromMonth && toMonth) return agendaItems.filter(a => { const m = a.updated_at.slice(0, 7); return m >= fromMonth && m <= toMonth })
    return agendaItems
  }, [agendaItems, fromMonth, toMonth])

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
      setFromMonth(newYM); setToMonth(newYM)
      return newYM
    })
  }

  function renderKanban() {
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: '총 완료', value: filtered.length, unit: '건', bg: 'bg-white/40 border-white/60', numCls: 'text-gray-800' },
            { label: '성과', value: achieveCount, unit: '건', bg: 'bg-[#BADEC8]/25 border-[#BADEC8]/40', numCls: 'text-[#2D5A45]' },
            { label: '개선', value: improveCount, unit: '건', bg: 'bg-[#F3E482]/25 border-[#F3E482]/45', numCls: 'text-[#5A4A10]' },
            {
              label: '회고 작성', unit: filtered.length > 0 ? `${Math.round(retroCount / filtered.length * 100)}%` : '—',
              value: retroCount, bg: 'bg-[#90A7D8]/18 border-[#90A7D8]/30', numCls: 'text-[#1E3A6B]',
            },
          ].map(card => (
            <div key={card.label} className={`backdrop-blur-xl border rounded-3xl p-5 ${card.bg}`}>
              <p className={`text-xs font-medium mb-3 opacity-60 ${card.numCls}`}>{card.label}</p>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-5xl font-bold leading-none ${card.numCls}`}>{card.value}</span>
                <span className={`text-sm font-medium opacity-60 ${card.numCls}`}>{card.unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
          {COLUMNS.map(col => {
            const colTasks = getColTasks(col.key)
            const colKey = col.key ?? '__null__'
            return (
              <div key={colKey}
                onDragOver={e => { e.preventDefault(); setDragOverCol(colKey) }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.key)}
                className={`flex-shrink-0 w-52 bg-white/40 backdrop-blur-xl border rounded-3xl p-4 transition-all ${col.accent} ${dragOverCol === colKey ? 'scale-[1.02] bg-white/60' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <h3 className="text-sm font-bold text-gray-700">{col.label}</h3>
                  </div>
                  <span className="text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">
                  {colTasks.map(task => (
                    <div key={task.id} draggable
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => { setDraggedId(null); setDragOverCol(null) }}
                      className={`bg-white/60 rounded-2xl border border-white/80 p-3 cursor-grab active:cursor-grabbing hover:bg-white/80 transition-all ${draggedId === task.id ? 'opacity-40 scale-95' : ''}`}>
                      <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                        <p className="text-xs font-semibold text-gray-800 leading-snug mb-2">
                          {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                        </p>
                      </Link>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-gray-400 bg-gray-100/80 px-1.5 py-0.5 rounded-full">{task.type}</span>
                        <span className="text-[10px] text-gray-400 bg-gray-100/80 px-1.5 py-0.5 rounded-full">{task.part}</span>
                        {getTaskMonth(task) && <span className="text-[10px] text-gray-300">{formatYM(getTaskMonth(task)!)}</span>}
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-6 border border-dashed border-gray-200/60 rounded-2xl">드롭</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {filteredAgenda.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-bold text-gray-800">완료 안건</h2>
              <span className="text-xs text-gray-400 bg-[#BADEC8]/30 px-2 py-0.5 rounded-full">{filteredAgenda.length}건</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredAgenda.map(a => (
                <Link key={a.id} href={`/project/items/${a.id}`}
                  className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4 hover:bg-white/60 transition-all flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.group_color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.group_name}</p>
                  </div>
                  <span className="text-[10px] text-gray-300 flex-shrink-0">{a.updated_at.slice(0, 7)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-gray-800">회고 기록</h2>
            <span className="text-xs text-gray-400">잘한점 · 아쉬운점 · 개선점</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-8">해당 기간에 완료된 업무가 없습니다</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filtered.map(task => (
                <Link key={task.id} href={`/tasks/${task.id}`}
                  className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-5 hover:bg-white/60 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{task.title || '제목 없음'}</p>
                      <div className="flex gap-1.5 mt-1">
                        {task.part && <span className="text-xs text-gray-400 bg-gray-100/80 px-2 py-0.5 rounded-full">{task.part}</span>}
                        {task.type && <span className="text-xs text-gray-400 bg-gray-100/80 px-2 py-0.5 rounded-full">{task.type}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-300">{getTaskMonth(task) ?? ''}</span>
                  </div>
                  {(task.retrospective?.good || task.retrospective?.bad || task.retrospective?.improvement) ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`rounded-2xl p-3 ${task.retrospective?.good ? 'bg-[#BADEC8]/25' : 'bg-gray-50/60'}`}>
                        <p className="text-[10px] font-semibold text-[#2D5A45] mb-1">잘한점</p>
                        <p className="text-xs text-gray-600 leading-relaxed break-words">{task.retrospective?.good || <span className="text-gray-300">없음</span>}</p>
                      </div>
                      <div className={`rounded-2xl p-3 ${task.retrospective?.bad ? 'bg-[#EBA698]/18' : 'bg-gray-50/60'}`}>
                        <p className="text-[10px] font-semibold text-[#6B2D25] mb-1">아쉬운점</p>
                        <p className="text-xs text-gray-600 leading-relaxed break-words">{task.retrospective?.bad || <span className="text-gray-300">없음</span>}</p>
                      </div>
                      <div className={`rounded-2xl p-3 ${task.retrospective?.improvement ? 'bg-[#F3E482]/25' : 'bg-gray-50/60'}`}>
                        <p className="text-[10px] font-semibold text-[#5A4A10] mb-1">개선점</p>
                        <p className="text-xs text-gray-600 leading-relaxed break-words">{task.retrospective?.improvement || <span className="text-gray-300">없음</span>}</p>
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
    <div className="h-full flex flex-col overflow-hidden font-sans">
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">완료 성과</h1>
        {quickPeriod !== '주간' && quickPeriod !== '당월' && (
          <span className="text-sm text-gray-400">총 {filtered.length}건</span>
        )}
      </div>

      <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap mb-5">
        {QUICK_PERIODS.map(p => (
          <button key={p} onClick={() => selectQuick(p)}
            className={`text-sm px-4 py-2 rounded-full font-medium transition-all whitespace-nowrap border ${
              quickPeriod === p
                ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                : 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'
            }`}>
            {p}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">

        {quickPeriod === '주간' && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => shiftWeek(-1)}
                className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-full bg-white/40 backdrop-blur-xl border border-white/60 hover:bg-white/60 transition-all text-sm">←</button>
              <span className="text-sm font-semibold text-gray-700">{formatWeekRange(weekStart)}</span>
              <button onClick={() => shiftWeek(1)}
                className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-full bg-white/40 backdrop-blur-xl border border-white/60 hover:bg-white/60 transition-all text-sm">→</button>
            </div>
            <SummaryGrid data={weekData} />
          </div>
        )}

        {quickPeriod === '당월' && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => shiftMonth(-1)}
                className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-full bg-white/40 backdrop-blur-xl border border-white/60 hover:bg-white/60 transition-all text-sm">←</button>
              <span className="text-sm font-semibold text-gray-700">{formatYM(selectedMonth)}</span>
              <button onClick={() => shiftMonth(1)}
                className="text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-full bg-white/40 backdrop-blur-xl border border-white/60 hover:bg-white/60 transition-all text-sm">→</button>
            </div>
            <SummaryGrid data={monthData} />
            {renderKanban()}
          </div>
        )}

        {(quickPeriod === '분기' || quickPeriod === '상반기' || quickPeriod === '하반기') && renderKanban()}

        {quickPeriod === '포트폴리오' && (
          <div className="flex flex-col gap-6">
            {agendaItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-800">완료 안건</h2>
                  <span className="text-xs text-gray-400 bg-[#BADEC8]/30 px-2 py-0.5 rounded-full">{agendaItems.length}건</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {agendaItems.map(a => (
                    <Link key={a.id} href={`/project/items/${a.id}`}
                      className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4 hover:bg-white/60 transition-all flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.group_color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-snug truncate">{a.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{a.group_name}</p>
                      </div>
                      <span className="text-[10px] text-gray-300 flex-shrink-0">{a.updated_at.slice(0, 7)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {tasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-800">완료 업무</h2>
                  <span className="text-xs text-gray-400">{tasks.length}건</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tasks.map(t => (
                    <Link key={t.id} href={`/tasks/${t.id}`}
                      className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-5 hover:bg-white/60 transition-all flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-800 leading-snug">{t.title}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 bg-white/60 px-1.5 py-0.5 rounded-full">{t.part}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">{t.type}</span>
                        {t.end_date && <span className="text-[10px] text-gray-400">{t.end_date.slice(0, 7)} 완료</span>}
                      </div>
                      {t.retrospective && (t.retrospective.good || t.retrospective.bad) && (
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed border-t border-white/60 pt-2">
                          {t.retrospective.good || t.retrospective.bad}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {agendaItems.length === 0 && tasks.length === 0 && (
              <p className="text-sm text-gray-300 text-center py-12">완료된 안건/업무가 없습니다</p>
            )}
            <div className="flex justify-end">
              <Link href="/journal?tab=selfeval"
                className="text-sm text-gray-500 bg-white/40 backdrop-blur-xl border border-white/60 px-4 py-2 rounded-full hover:bg-white/60 transition-all">
                → 자기평가 초안 만들기
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

async function buildPeriodSummary(
  notesRes: { data: unknown[] | null },
  completedRes: { data: unknown[] | null },
  meetingsRes: { data: unknown[] | null },
  oo1Res: { data: unknown[] | null },
  mbRes: { data: unknown[] | null },
  agendaRes?: { data: unknown[] | null },
): Promise<PeriodSummary> {
  const supabase = createClient()
  const completedTasks = (completedRes.data ?? []) as WeekCompletedTask[]
  const completedAgendaItems: CompletedAgendaItem[] = ((agendaRes?.data ?? []) as { id: string; title: string; updated_at: string; agenda_groups: { name: string; color: string }[] | { name: string; color: string } | null }[])
    .map(a => { const g = Array.isArray(a.agenda_groups) ? a.agenda_groups[0] : a.agenda_groups; return { id: a.id, title: a.title, updated_at: a.updated_at, group_name: g?.name ?? '', group_color: g?.color ?? '#9CA3AF' } })
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
  return { activeTasks, completedTasks, completedAgendaItems, meetings, oneOnOnes, loading: false }
}
