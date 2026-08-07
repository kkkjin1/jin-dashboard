'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import TiptapEditor from '@/components/TiptapEditor'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import type { Task, AchievementCategory, ManualAchievement } from '@/types'

const CATEGORY_COLOR_KEY: Record<AchievementCategory, CategoryColorKey> = {
  '성과':   'green',
  '개선':   'amber',
  '리소스': 'blue',
  '수명':   'teal',
  '기타':   'neutral',
}

function categoryStyle(key: AchievementCategory | null) {
  if (!key) return CATEGORY_PALETTE.neutral
  return CATEGORY_PALETTE[CATEGORY_COLOR_KEY[key]]
}

const COLUMNS: { key: AchievementCategory | null; label: string }[] = [
  { key: null,     label: '미분류' },
  { key: '성과',   label: '성과' },
  { key: '개선',   label: '개선' },
  { key: '리소스', label: '리소스' },
  { key: '수명',   label: '수명' },
  { key: '기타',   label: '기타' },
]

const ADD_CATEGORIES: AchievementCategory[] = ['성과', '개선', '리소스', '수명', '기타']

interface KanbanCard {
  id: string
  title: string
  category: AchievementCategory | null
  part?: string
  type?: string
  month: string | null
  manual: boolean
  content?: string
}

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
interface CompletedSubTaskItem { id: string; title: string; group_name: string; group_color: string }

interface PeriodSummary {
  activeTasks: WeekActiveTask[]
  completedTasks: WeekCompletedTask[]
  completedAgendaItems: CompletedAgendaItem[]
  completedSubTaskItems: CompletedSubTaskItem[]
  meetings: WeekMeeting[]
  oneOnOnes: WeekOneOnOne[]
  loading: boolean
}

const EMPTY_SUMMARY: PeriodSummary = { activeTasks: [], completedTasks: [], completedAgendaItems: [], completedSubTaskItems: [], meetings: [], oneOnOnes: [], loading: false }

function SummaryGrid({ data }: { data: PeriodSummary }) {
  const fmt = (d: string) => d.slice(5).replace('-', '/')

  const allCompleted = [
    ...data.completedTasks.map(t => ({ key: t.id, href: `/tasks/${t.id}`, primary: t.title || '제목 없음', secondary: t.part })),
    ...data.completedAgendaItems.map(a => ({ key: `a-${a.id}`, href: `/project/items/${a.id}`, primary: a.title || '제목 없음', secondary: a.group_name })),
    ...data.completedSubTaskItems.map(st => ({ key: `st-${st.id}`, href: '/project', primary: st.title || '제목 없음', secondary: st.group_name })),
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
      bg: 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)]',
      numColor: 'text-[rgba(226,232,240,0.9)]',
      subColor: 'text-[rgba(226,232,240,0.4)]',
      divider: 'border-[rgba(255,255,255,0.06)]',
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
            <p className="text-xs text-[rgba(226,232,240,0.3)]">불러오는 중...</p>
          ) : card.items.length === 0 ? (
            <p className="text-xs text-[rgba(226,232,240,0.3)]">없음</p>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-hide">
              {card.items.map(item => (
                <Link key={item.key} href={item.href}
                  className="flex items-start justify-between text-xs py-1 hover:opacity-70 transition-opacity gap-2">
                  <span className="text-[rgba(226,232,240,0.8)] break-words leading-relaxed min-w-0">{item.primary}</span>
                  {item.secondary && <span className="text-[rgba(226,232,240,0.4)] flex-shrink-0">{item.secondary}</span>}
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
  const [manualItems, setManualItems] = useState<ManualAchievement[]>([])
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('주간')
  const [dragged, setDragged] = useState<{ id: string; manual: boolean } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

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

  // 주간/월간 회고 —— null = 로딩 중, string = 초기 에디터 내용
  const [weekJournal, setWeekJournal]         = useState<string | null>(null)
  const [monthJournal, setMonthJournal]       = useState<string | null>(null)
  const [weekJournalSaved,  setWeekJournalSaved]  = useState(false)
  const [monthJournalSaved, setMonthJournalSaved] = useState(false)
  const weekSaveRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    supabase
      .from('manual_achievements')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setManualItems((data ?? []) as ManualAchievement[]))
  }, [])

  async function addManualAchievement(input: { title: string; category: AchievementCategory; month: string; content: string }) {
    const { data, error } = await supabase.from('manual_achievements')
      .insert({ title: input.title.trim(), category: input.category, month: input.month, content: input.content.trim() })
      .select().single()
    if (error || !data) return
    setManualItems(prev => [data as ManualAchievement, ...prev])
    setShowAddModal(false)
  }

  async function deleteManualAchievement(id: string) {
    if (!confirm('직접 추가한 성과를 삭제하시겠습니까?')) return
    await supabase.from('manual_achievements').delete().eq('id', id)
    setManualItems(prev => prev.filter(m => m.id !== id))
  }

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
      supabase.from('agenda_sub_tasks').select('id, title, agenda_items(title, agenda_groups(name, color))').eq('status', 'done').gte('updated_at', wsISO).lt('updated_at', weISO),
    ]).then(async ([notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes, stRes]) => {
      setWeekData(await buildPeriodSummary(notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes, stRes))
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
      supabase.from('agenda_sub_tasks').select('id, title, agenda_items(title, agenda_groups(name, color))').eq('status', 'done').gte('updated_at', wsISO).lt('updated_at', weISO),
    ]).then(async ([notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes, stRes]) => {
      setMonthData(await buildPeriodSummary(notesRes, completedRes, meetingsRes, oo1Res, mbRes, agendaRes, stRes))
    })
  }, [quickPeriod, selectedMonth])

  // 주간 회고 fetch
  useEffect(() => {
    if (quickPeriod !== '주간') return
    setWeekJournal(null)
    const key = `week_${weekStart.toISOString().slice(0, 10)}`
    supabase.from('period_journals').select('content').eq('period_key', key).maybeSingle()
      .then(({ data }) => setWeekJournal(data?.content ?? ''))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickPeriod, weekStart])

  // 월간 회고 fetch
  useEffect(() => {
    if (quickPeriod !== '당월') return
    setMonthJournal(null)
    const key = `month_${selectedMonth}`
    supabase.from('period_journals').select('content').eq('period_key', key).maybeSingle()
      .then(({ data }) => setMonthJournal(data?.content ?? ''))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickPeriod, selectedMonth])

  function handleWeekJournalChange(content: string) {
    const key = `week_${weekStart.toISOString().slice(0, 10)}`
    if (weekSaveRef.current) clearTimeout(weekSaveRef.current)
    weekSaveRef.current = setTimeout(async () => {
      await supabase.from('period_journals').upsert({ period_key: key, period_type: 'weekly', content }, { onConflict: 'period_key' })
      setWeekJournalSaved(true)
      setTimeout(() => setWeekJournalSaved(false), 1500)
    }, 800)
  }

  function handleMonthJournalChange(content: string) {
    const key = `month_${selectedMonth}`
    if (monthSaveRef.current) clearTimeout(monthSaveRef.current)
    monthSaveRef.current = setTimeout(async () => {
      await supabase.from('period_journals').upsert({ period_key: key, period_type: 'monthly', content }, { onConflict: 'period_key' })
      setMonthJournalSaved(true)
      setTimeout(() => setMonthJournalSaved(false), 1500)
    }, 800)
  }

  const filtered = useMemo(() => {
    if (fromMonth && toMonth) return tasks.filter(t => { const m = getTaskMonth(t); return m ? m >= fromMonth && m <= toMonth : false })
    return tasks
  }, [tasks, fromMonth, toMonth])

  const filteredAgenda = useMemo(() => {
    if (fromMonth && toMonth) return agendaItems.filter(a => { const m = a.updated_at.slice(0, 7); return m >= fromMonth && m <= toMonth })
    return agendaItems
  }, [agendaItems, fromMonth, toMonth])

  const filteredManual = useMemo(() => {
    if (fromMonth && toMonth) return manualItems.filter(m => m.month >= fromMonth && m.month <= toMonth)
    return manualItems
  }, [manualItems, fromMonth, toMonth])

  const kanbanCards: KanbanCard[] = useMemo(() => [
    ...filtered.map((t): KanbanCard => ({ id: t.id, title: t.title, part: t.part, type: t.type, month: getTaskMonth(t), manual: false, category: t.achievement_category ?? null })),
    ...filteredManual.map((m): KanbanCard => ({ id: m.id, title: m.title, month: m.month, manual: true, content: m.content, category: m.category })),
  ], [filtered, filteredManual])

  function selectQuick(p: QuickPeriod) {
    setQuickPeriod(p)
    if (p === '주간') { setFromMonth(''); setToMonth(''); return }
    if (p === '당월') { setFromMonth(selectedMonth); setToMonth(selectedMonth); return }
    const months = getPeriodMonths(p)
    if (months.length > 0) { setFromMonth(months[0]); setToMonth(months[months.length - 1]) }
  }

  async function handleDrop(category: AchievementCategory | null) {
    if (!dragged) return
    const { id, manual } = dragged
    if (manual) {
      if (!category) { setDragged(null); setDragOverCol(null); return }
      await supabase.from('manual_achievements').update({ category }).eq('id', id)
      setManualItems(prev => prev.map(m => m.id === id ? { ...m, category } : m))
    } else {
      await supabase.from('tasks').update({ achievement_category: category }).eq('id', id)
      setTasks(prev => prev.map(t => t.id === id ? { ...t, achievement_category: category } : t))
    }
    setDragged(null); setDragOverCol(null)
  }

  function getColCards(key: AchievementCategory | null) {
    return kanbanCards.filter(c => c.category === key)
  }

  const totalCount = filtered.length + filteredManual.length
  const achieveCount = kanbanCards.filter(c => c.category === '성과').length
  const improveCount = kanbanCards.filter(c => c.category === '개선').length
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
            { label: '총 완료', value: totalCount, unit: '건', style: { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.9)' } },
            { label: '성과', value: achieveCount, unit: '건', style: { background: categoryStyle('성과').bg, borderColor: categoryStyle('성과').border, color: categoryStyle('성과').text } },
            { label: '개선', value: improveCount, unit: '건', style: { background: categoryStyle('개선').bg, borderColor: categoryStyle('개선').border, color: categoryStyle('개선').text } },
            {
              label: '회고 작성', unit: filtered.length > 0 ? `${Math.round(retroCount / filtered.length * 100)}%` : '—',
              value: retroCount, style: { background: categoryStyle('리소스').bg, borderColor: categoryStyle('리소스').border, color: categoryStyle('리소스').text },
            },
          ].map(card => (
            <div key={card.label} className="backdrop-blur-xl border rounded-3xl p-5" style={card.style}>
              <p className="text-xs font-medium mb-3 opacity-70">{card.label}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-bold leading-none">{card.value}</span>
                <span className="text-sm font-medium opacity-70">{card.unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide">
          {COLUMNS.map(col => {
            const colCards = getColCards(col.key)
            const colKey = col.key ?? '__null__'
            const st = categoryStyle(col.key)
            return (
              <div key={colKey}
                onDragOver={e => { e.preventDefault(); setDragOverCol(colKey) }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.key)}
                className="flex-shrink-0 w-56 bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border rounded-3xl p-4 transition-all"
                style={{ borderColor: dragOverCol === colKey ? st.border : 'rgba(255,255,255,0.09)', transform: dragOverCol === colKey ? 'scale(1.02)' : undefined }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: st.solid }} />
                    <h3 className="text-sm font-bold text-[rgba(226,232,240,0.8)]">{col.label}</h3>
                  </div>
                  <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full">{colCards.length}</span>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">
                  {colCards.map(card => (
                    <div key={card.id} draggable
                      onDragStart={() => setDragged({ id: card.id, manual: card.manual })}
                      onDragEnd={() => { setDragged(null); setDragOverCol(null) }}
                      className={`group/card relative bg-[rgba(255,255,255,0.06)] rounded-2xl border border-[rgba(255,255,255,0.09)] p-3 cursor-grab active:cursor-grabbing hover:border-[rgba(255,255,255,0.18)] transition-all ${dragged?.id === card.id ? 'opacity-40 scale-95' : ''}`}>
                      {card.manual ? (
                        <p className="text-xs font-semibold text-[rgba(226,232,240,0.9)] leading-snug mb-2 pr-4">
                          {card.title || <span className="text-[rgba(226,232,240,0.3)] italic">제목 없음</span>}
                        </p>
                      ) : (
                        <Link href={`/tasks/${card.id}`} onClick={e => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-[rgba(226,232,240,0.9)] leading-snug mb-2">
                            {card.title || <span className="text-[rgba(226,232,240,0.3)] italic">제목 없음</span>}
                          </p>
                        </Link>
                      )}
                      {card.content && <p className="text-[10px] text-[rgba(226,232,240,0.45)] leading-relaxed mb-2 line-clamp-2">{card.content}</p>}
                      <div className="flex items-center gap-1 flex-wrap">
                        {card.manual ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>직접입력</span>
                        ) : (
                          <>
                            <span className="text-[10px] text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full">{card.type}</span>
                            <span className="text-[10px] text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full">{card.part}</span>
                          </>
                        )}
                        {card.month && <span className="text-[10px] text-[rgba(226,232,240,0.3)]">{formatYM(card.month)}</span>}
                      </div>
                      {card.manual && (
                        <button onClick={() => deleteManualAchievement(card.id)}
                          className="absolute top-2.5 right-2.5 text-[10px] text-[rgba(226,232,240,0.25)] opacity-0 group-hover/card:opacity-100 hover:text-red-400 transition-all">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {colCards.length === 0 && (
                    <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-6 border border-dashed border-[rgba(255,255,255,0.09)] rounded-2xl">드롭</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {filteredAgenda.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-bold text-[rgba(226,232,240,0.9)]">완료 안건</h2>
              <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[#BADEC8]/30 px-2 py-0.5 rounded-full">{filteredAgenda.length}건</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredAgenda.map(a => (
                <Link key={a.id} href={`/project/items/${a.id}`}
                  className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-4 hover:bg-[rgba(255,255,255,0.06)] transition-all flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.group_color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[rgba(226,232,240,0.9)] leading-snug truncate">{a.title}</p>
                    <p className="text-xs text-[rgba(226,232,240,0.4)] mt-0.5">{a.group_name}</p>
                  </div>
                  <span className="text-[10px] text-[rgba(226,232,240,0.3)] flex-shrink-0">{a.updated_at.slice(0, 7)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-[rgba(226,232,240,0.9)]">회고 기록</h2>
            <span className="text-xs text-[rgba(226,232,240,0.4)]">잘한점 · 아쉬운점 · 개선점</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-[rgba(226,232,240,0.3)] text-center py-8">해당 기간에 완료된 업무가 없습니다</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filtered.map(task => (
                <Link key={task.id} href={`/tasks/${task.id}`}
                  className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-5 hover:bg-[rgba(255,255,255,0.06)] transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-[rgba(226,232,240,0.9)]">{task.title || '제목 없음'}</p>
                      <div className="flex gap-1.5 mt-1">
                        {task.part && <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded-full">{task.part}</span>}
                        {task.type && <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded-full">{task.type}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-[rgba(226,232,240,0.3)]">{getTaskMonth(task) ?? ''}</span>
                  </div>
                  {(task.retrospective?.good || task.retrospective?.bad || task.retrospective?.improvement) ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`rounded-2xl p-3 ${task.retrospective?.good ? 'bg-[#BADEC8]/25' : 'bg-[rgba(255,255,255,0.03)]'}`}>
                        <p className="text-[10px] font-semibold text-[#2D5A45] mb-1">잘한점</p>
                        <p className="text-xs text-[rgba(226,232,240,0.7)] leading-relaxed break-words">{task.retrospective?.good || <span className="text-[rgba(226,232,240,0.3)]">없음</span>}</p>
                      </div>
                      <div className={`rounded-2xl p-3 ${task.retrospective?.bad ? 'bg-[#EBA698]/18' : 'bg-[rgba(255,255,255,0.03)]'}`}>
                        <p className="text-[10px] font-semibold text-[#6B2D25] mb-1">아쉬운점</p>
                        <p className="text-xs text-[rgba(226,232,240,0.7)] leading-relaxed break-words">{task.retrospective?.bad || <span className="text-[rgba(226,232,240,0.3)]">없음</span>}</p>
                      </div>
                      <div className={`rounded-2xl p-3 ${task.retrospective?.improvement ? 'bg-[#F3E482]/25' : 'bg-[rgba(255,255,255,0.03)]'}`}>
                        <p className="text-[10px] font-semibold text-[#5A4A10] mb-1">개선점</p>
                        <p className="text-xs text-[rgba(226,232,240,0.7)] leading-relaxed break-words">{task.retrospective?.improvement || <span className="text-[rgba(226,232,240,0.3)]">없음</span>}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[rgba(226,232,240,0.3)] italic">회고 미작성 → 업무 상세에서 작성 가능</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </>
    )
  }

  const defaultAddMonth = quickPeriod === '당월' ? selectedMonth : nowYM

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {showAddModal && (
        <AddAchievementModal
          defaultMonth={defaultAddMonth}
          onSave={addManualAchievement}
          onClose={() => setShowAddModal(false)}
        />
      )}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#E2E8F0]">완료 성과</h1>
        <div className="flex items-center gap-3">
          {quickPeriod !== '주간' && quickPeriod !== '당월' && (
            <span className="text-sm text-[rgba(226,232,240,0.4)]">총 {filtered.length}건</span>
          )}
          <button onClick={() => setShowAddModal(true)}
            className="text-sm bg-[#4C7FE0]/40 text-[#A8C4F0] border border-[#4C7FE0]/50 px-4 py-2 rounded-full hover:bg-[#4C7FE0]/60 transition-colors">
            + 직접 추가
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap mb-5">
        {QUICK_PERIODS.map(p => (
          <button key={p} onClick={() => selectQuick(p)}
            className={`text-sm px-4 py-2 rounded-full font-medium transition-all whitespace-nowrap border ${
              quickPeriod === p
                ? 'bg-[#4C7FE0] text-white border-[#4C7FE0] shadow-sm'
                : 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)]'
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
                className="text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] px-3 py-1.5 rounded-full bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.06)] transition-all text-sm">←</button>
              <span className="text-sm font-semibold text-[rgba(226,232,240,0.8)]">{formatWeekRange(weekStart)}</span>
              <button onClick={() => shiftWeek(1)}
                className="text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] px-3 py-1.5 rounded-full bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.06)] transition-all text-sm">→</button>
            </div>
            <SummaryGrid data={weekData} />
            {weekJournal !== null && (
              <RetroSection
                label="이번 주 회고"
                hint="이번 주 성과와 아쉬웠던 점, 다음 주 개선 방향을 기록하세요"
                editorKey={`week_${weekStart.toISOString().slice(0, 10)}`}
                initialContent={weekJournal}
                onChange={handleWeekJournalChange}
                autoSaved={weekJournalSaved}
              />
            )}
          </div>
        )}

        {quickPeriod === '당월' && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => shiftMonth(-1)}
                className="text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] px-3 py-1.5 rounded-full bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.06)] transition-all text-sm">←</button>
              <span className="text-sm font-semibold text-[rgba(226,232,240,0.8)]">{formatYM(selectedMonth)}</span>
              <button onClick={() => shiftMonth(1)}
                className="text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] px-3 py-1.5 rounded-full bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.06)] transition-all text-sm">→</button>
              <input type="month" value={selectedMonth}
                onChange={e => { const v = e.target.value; if (v) { setSelectedMonth(v); setFromMonth(v); setToMonth(v) } }}
                className="text-xs text-[rgba(226,232,240,0.6)] bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 ml-1 focus:outline-none focus:border-[rgba(76,127,224,0.5)] transition-colors"
                style={{ colorScheme: 'dark' }} />
            </div>
            <SummaryGrid data={monthData} />
            {monthJournal !== null && (
              <RetroSection
                label={`${formatYM(selectedMonth)} 회고`}
                hint="이번 달 성과와 아쉬웠던 점, 다음 달 방향을 기록하세요"
                editorKey={`month_${selectedMonth}`}
                initialContent={monthJournal}
                onChange={handleMonthJournalChange}
                autoSaved={monthJournalSaved}
              />
            )}
            {renderKanban()}
          </div>
        )}

        {(quickPeriod === '분기' || quickPeriod === '상반기' || quickPeriod === '하반기') && renderKanban()}

        {quickPeriod === '포트폴리오' && (
          <div className="flex flex-col gap-6">
            {agendaItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-[rgba(226,232,240,0.9)]">완료 안건</h2>
                  <span className="text-xs text-[rgba(226,232,240,0.4)] bg-[#BADEC8]/30 px-2 py-0.5 rounded-full">{agendaItems.length}건</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {agendaItems.map(a => (
                    <Link key={a.id} href={`/project/items/${a.id}`}
                      className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-4 hover:bg-[rgba(255,255,255,0.06)] transition-all flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.group_color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[rgba(226,232,240,0.9)] leading-snug truncate">{a.title}</p>
                        <p className="text-xs text-[rgba(226,232,240,0.4)] mt-0.5">{a.group_name}</p>
                      </div>
                      <span className="text-[10px] text-[rgba(226,232,240,0.3)] flex-shrink-0">{a.updated_at.slice(0, 7)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {tasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-[rgba(226,232,240,0.9)]">완료 업무</h2>
                  <span className="text-xs text-[rgba(226,232,240,0.4)]">{tasks.length}건</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tasks.map(t => (
                    <Link key={t.id} href={`/tasks/${t.id}`}
                      className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-5 hover:bg-[rgba(255,255,255,0.06)] transition-all flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-[rgba(226,232,240,0.9)] leading-snug">{t.title}</span>
                        <span className="text-[10px] text-[rgba(226,232,240,0.4)] flex-shrink-0 bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full">{t.part}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">{t.type}</span>
                        {t.end_date && <span className="text-[10px] text-[rgba(226,232,240,0.4)]">{t.end_date.slice(0, 7)} 완료</span>}
                      </div>
                      {t.retrospective && (t.retrospective.good || t.retrospective.bad) && (
                        <p className="text-xs text-[rgba(226,232,240,0.5)] line-clamp-2 leading-relaxed border-t border-[rgba(255,255,255,0.09)] pt-2">
                          {t.retrospective.good || t.retrospective.bad}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {manualItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-[rgba(226,232,240,0.9)]">직접 추가한 성과</h2>
                  <span className="text-xs text-[rgba(226,232,240,0.4)]">{manualItems.length}건</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {manualItems.map(m => {
                    const st = categoryStyle(m.category)
                    return (
                      <div key={m.id}
                        className="group/card relative bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-[rgba(226,232,240,0.9)] leading-snug pr-4">{m.title}</span>
                          <span className="text-[10px] flex-shrink-0 px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>{m.category}</span>
                        </div>
                        {m.content && <p className="text-xs text-[rgba(226,232,240,0.5)] leading-relaxed">{m.content}</p>}
                        <span className="text-[10px] text-[rgba(226,232,240,0.3)]">{formatYM(m.month)} · 직접입력</span>
                        <button onClick={() => deleteManualAchievement(m.id)}
                          className="absolute top-3 right-3 text-xs text-[rgba(226,232,240,0.25)] opacity-0 group-hover/card:opacity-100 hover:text-red-400 transition-all">
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {agendaItems.length === 0 && tasks.length === 0 && manualItems.length === 0 && (
              <p className="text-sm text-[rgba(226,232,240,0.3)] text-center py-12">완료된 안건/업무가 없습니다</p>
            )}
            <div className="flex justify-end">
              <Link href="/journal?tab=selfeval"
                className="text-sm text-[rgba(226,232,240,0.5)] bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] px-4 py-2 rounded-full hover:bg-[rgba(255,255,255,0.06)] transition-all">
                → 자기평가 초안 만들기
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function AddAchievementModal({
  defaultMonth, onSave, onClose,
}: {
  defaultMonth: string
  onSave: (input: { title: string; category: AchievementCategory; month: string; content: string }) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<AchievementCategory>('성과')
  const [month, setMonth] = useState(defaultMonth)
  const [content, setContent] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    if (!title.trim()) { titleRef.current?.focus(); return }
    onSave({ title, category, month, content })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div
        className="backdrop-blur-xl rounded-3xl p-6 w-full max-w-md flex flex-col gap-4"
        style={{ background: 'rgba(30,33,42,0.95)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.07) inset' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[rgba(226,232,240,0.9)]">성과 직접 추가</h2>
          <button onClick={onClose} className="text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] text-lg leading-none transition-colors">×</button>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {ADD_CATEGORIES.map(c => {
            const st = categoryStyle(c)
            const on = category === c
            return (
              <button key={c} onClick={() => setCategory(c)}
                className="text-xs px-3 py-1.5 rounded-full border font-medium transition-all"
                style={on
                  ? { background: st.solid, color: st.on, borderColor: st.solid }
                  : { background: st.bg, color: st.text, borderColor: st.border, opacity: 0.6 }}>
                {c}
              </button>
            )
          })}
        </div>

        <input ref={titleRef} autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave() }}
          placeholder="제목 (필수)"
          className="w-full text-sm font-semibold text-[#E2E8F0] focus:outline-none pb-2 bg-transparent placeholder:text-white/30"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }} />

        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder="설명 (선택)" rows={3}
          className="w-full text-sm text-[#E2E8F0] bg-transparent focus:outline-none resize-none placeholder:text-white/25 p-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />

        <div className="flex items-center justify-between">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="text-xs text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 focus:outline-none"
            style={{ colorScheme: 'dark' }} />
          <div className="flex gap-2">
            <button onClick={onClose}
              className="text-xs px-4 py-2 rounded-full border bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.1)] transition-all">
              취소
            </button>
            <button onClick={handleSave} disabled={!title.trim()}
              className="text-xs px-4 py-2 rounded-full border bg-[#4C7FE0] border-[#4C7FE0] text-white shadow-sm disabled:opacity-40 transition-all">
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RetroSection({
  label, hint, editorKey, initialContent, onChange, autoSaved,
}: {
  label: string
  hint: string
  editorKey: string
  initialContent: string
  onChange: (v: string) => void
  autoSaved: boolean
}) {
  return (
    <div className="mb-6 backdrop-blur-xl rounded-3xl p-5"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold" style={{ color: 'rgba(226,232,240,0.9)' }}>{label}</h2>
        <span className="text-[11px] transition-opacity duration-300"
          style={{ color: 'rgba(226,232,240,0.4)', opacity: autoSaved ? 1 : 0 }}>
          자동저장됨
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: 'rgba(226,232,240,0.35)' }}>{hint}</p>
      <div className="rounded-xl px-3 py-2"
        style={{ background: '#13171F', border: '1px solid rgba(255,255,255,0.07)' }}>
        <TiptapEditor
          key={editorKey}
          value={initialContent}
          onChange={onChange}
          dark
          minHeight={200}
        />
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
  stRes?: { data: unknown[] | null },
): Promise<PeriodSummary> {
  const supabase = createClient()
  const completedTasks = (completedRes.data ?? []) as WeekCompletedTask[]
  const completedAgendaItems: CompletedAgendaItem[] = ((agendaRes?.data ?? []) as { id: string; title: string; updated_at: string; agenda_groups: { name: string; color: string }[] | { name: string; color: string } | null }[])
    .map(a => { const g = Array.isArray(a.agenda_groups) ? a.agenda_groups[0] : a.agenda_groups; return { id: a.id, title: a.title, updated_at: a.updated_at, group_name: g?.name ?? '', group_color: g?.color ?? '#9CA3AF' } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completedSubTaskItems: CompletedSubTaskItem[] = ((stRes?.data ?? []) as any[])
    .map(st => {
      const ai = Array.isArray(st.agenda_items) ? st.agenda_items[0] : st.agenda_items
      const g = ai ? (Array.isArray(ai.agenda_groups) ? ai.agenda_groups[0] : ai.agenda_groups) : null
      return { id: st.id, title: st.title, group_name: g?.name ?? '', group_color: g?.color ?? '#9CA3AF' }
    })
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
  return { activeTasks, completedTasks, completedAgendaItems, completedSubTaskItems, meetings, oneOnOnes, loading: false }
}
