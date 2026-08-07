'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, getDay, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks, fetchMembers } from '@/lib/tasks'
import { useUserSetting } from '@/hooks/useUserSetting'
import { useOrgData } from '@/hooks/useOrgData'
import type { Task, Member, TaskStatus, Meeting, NoteEntry } from '@/types'
import { CATEGORY_PALETTE, MEETING_CATEGORY, FIXED_MEETING_TAGS, type CategoryColorKey, colorKeyFromName } from '@/lib/categoryColors'
import { GlassSelect } from '@/components/ui/GlassSelect'

interface MeetingSchedule {
  id: string
  title: string
  time: string
  is_recurring: boolean
  recur_type?: 'weekly' | 'monthly'  // 반복일 때: 매주(요일) / 매월(일). 없으면 'weekly'로 취급 (하위호환)
  days_of_week?: number[]            // recur_type 'weekly'
  day_of_month?: number              // recur_type 'monthly' (1~31, 해당 월 말일 초과시 clamp)
  start_date?: string                // 반복 시작 시점 (그 달의 1일). 없으면 제한 없음 (하위호환)
  repeat_until?: string              // 반복 종료 시점. 없으면 무한
  date?: string                      // 반복 아닐 때 (단발성) 날짜
  category?: string
  team_id?: string
}

interface RecurrenceFormValue {
  is_recurring: boolean
  recur_type: 'weekly' | 'monthly'
  days_of_week: number[]
  day_of_month: number
  start_date: string
  repeat_until: string | null
  date: string
}

function RecurrenceFields({ value, onChange }: { value: RecurrenceFormValue; onChange: (patch: Partial<RecurrenceFormValue>) => void }) {
  const [customMonths, setCustomMonths] = useState('3')

  function shiftStartMonth(delta: number) {
    const d = parseISO(value.start_date)
    const next = new Date(d.getFullYear(), d.getMonth() + delta, 1)
    onChange({ start_date: format(next, 'yyyy-MM-dd') })
  }
  function applyDuration(months: number | null) {
    if (months === null) { onChange({ repeat_until: null }); return }
    const start = parseISO(value.start_date)
    const until = new Date(start.getFullYear(), start.getMonth() + months, 0)
    onChange({ repeat_until: format(until, 'yyyy-MM-dd') })
  }

  if (!value.is_recurring) {
    return (
      <input
        type="date"
        value={value.date}
        onChange={e => onChange({ date: e.target.value })}
        className="text-xs border border-[rgba(255,255,255,0.09)] rounded px-1.5 py-0.5 focus:outline-none text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)]"
      />
    )
  }

  const pillOff = 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.07)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.08)]'
  const pillOn  = 'bg-[rgba(76,127,224,0.15)] border-[rgba(76,127,224,0.3)] text-[#9DBEF5]'

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(['weekly', 'monthly'] as const).map(t => (
          <button key={t} type="button" onClick={() => onChange({ recur_type: t })}
            className={`text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors ${
              value.recur_type === t ? 'bg-[#4C7FE0] text-white' : 'bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.08)]'
            }`}>
            {t === 'weekly' ? '매주' : '매월'}
          </button>
        ))}
      </div>

      {value.recur_type === 'monthly' ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[rgba(226,232,240,0.5)]">매월</span>
          <input type="number" min={1} max={31} value={value.day_of_month}
            onChange={e => onChange({ day_of_month: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) })}
            className="w-12 text-xs border border-[rgba(255,255,255,0.09)] rounded px-1.5 py-0.5 focus:outline-none text-center text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)]" />
          <span className="text-xs text-[rgba(226,232,240,0.5)]">일</span>
        </div>
      ) : (
        <div className="flex gap-1">
          {DOW_LABELS_SCHED.map((label, d) => (
            <button key={d} type="button"
              onClick={() => onChange({
                days_of_week: value.days_of_week.includes(d)
                  ? value.days_of_week.filter(x => x !== d)
                  : [...value.days_of_week, d],
              })}
              className={`text-[9px] w-6 h-6 rounded-full font-medium transition-colors ${
                value.days_of_week.includes(d) ? 'bg-[#4C7FE0] text-white' : 'bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.08)]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-[rgba(226,232,240,0.35)] whitespace-nowrap">시작</span>
        <button type="button" onClick={() => shiftStartMonth(-1)} className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] px-1">◀</button>
        <span className="text-[11px] text-[rgba(226,232,240,0.7)] flex-1 text-center">{format(parseISO(value.start_date), 'yyyy년 M월')}</span>
        <button type="button" onClick={() => shiftStartMonth(1)} className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] px-1">▶</button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] text-[rgba(226,232,240,0.35)] w-full">종료</span>
        <button type="button" onClick={() => applyDuration(1)} className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${pillOff}`}>1개월</button>
        <button type="button" onClick={() => applyDuration(2)} className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${pillOff}`}>2개월</button>
        <div className="flex items-center gap-0.5">
          <input type="number" min={1} value={customMonths} onChange={e => setCustomMonths(e.target.value.replace(/\D/g, ''))}
            className="w-9 text-[9px] border border-[rgba(255,255,255,0.09)] rounded px-1 py-0.5 focus:outline-none text-center text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)]" />
          <button type="button" onClick={() => applyDuration(Math.max(1, parseInt(customMonths) || 1))}
            className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${pillOff}`}>개월</button>
        </div>
        <button type="button" onClick={() => applyDuration(null)}
          className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${value.repeat_until === null ? pillOn : pillOff}`}>
          무한
        </button>
      </div>
    </div>
  )
}

const DOW_LABELS_SCHED = ['일', '월', '화', '수', '목', '금', '토']

function todayStrSched(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function startOfThisMonthStr(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), '01'].join('-')
}

interface MeetFormShape {
  title: string
  time: string
  is_recurring: boolean
  recur_type: 'weekly' | 'monthly'
  days_of_week: number[]
  day_of_month: number
  start_date: string
  repeat_until: string | null
  date: string
  category: string
  team_id: string
}

function defaultMeetForm(): MeetFormShape {
  return {
    title: '', time: '09:00', is_recurring: true,
    recur_type: 'weekly', days_of_week: [], day_of_month: 1,
    start_date: startOfThisMonthStr(), repeat_until: null,
    date: todayStrSched(), category: '', team_id: '',
  }
}

const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']

interface DayTask {
  task: Task
  dateType: 'mid' | 'end'
}

interface ScheduledTodo {
  id: string
  title: string
  target_date: string | null
  schedule_tag: string | null
  task: { id: string; title: string; short_name: string | null; part: string }
}

interface ScheduledOneOnOne {
  id: string
  member_id: string
  member_name: string
  next_appointment_date: string
}

export default function SchedulePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category' | 'notes'>[]>([])
  const [scheduledTodos, setScheduledTodos] = useState<ScheduledTodo[]>([])
  const [current, setCurrent] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string>('전체')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | '전체'>('전체')
  const [partFilter, setPartFilter] = useState<string>('전체')
  const [viewFilter, setViewFilter] = useState<'전체' | '업무만' | '회의만'>('전체')
  const [reportFilter, setReportFilter] = useState<'전체' | '중간공유' | '최종보고'>('전체')
  const [showPrevCal, setShowPrevCal] = useState(false)
  const [showNextCal, setShowNextCal] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysisPeriod, setAnalysisPeriod] = useState<'이번주' | '이번달' | '직전월'>('이번달')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<MeetFormShape>(defaultMeetForm())
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dayOrder, setDayOrder] = useState<Record<string, string[]>>({})
  // 할일별 담당자 (task detail 페이지에서 localStorage 공유)
  const [todoAssigneeMap, setTodoAssigneeMap] = useState<Record<string, string>>({})
  // 예정 1on1 (next_appointment_date 기준)
  const [scheduledOneOnOnes, setScheduledOneOnOnes] = useState<ScheduledOneOnOne[]>([])
  const router = useRouter()
  const { org, flatParts } = useOrgData()
  const meetingCategories = [...org.map(t => t.name), ...FIXED_MEETING_TAGS]

  // 고정 회의 관리
  const { value: schedules, save: saveSchedules } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [meetForm, setMeetForm] = useState<MeetFormShape>(defaultMeetForm())

  function buildScheduleFromForm(id: string, form: MeetFormShape): MeetingSchedule {
    return {
      id,
      title: form.title.trim(),
      time: form.time,
      is_recurring: form.is_recurring,
      ...(form.is_recurring
        ? {
            recur_type: form.recur_type,
            ...(form.recur_type === 'monthly' ? { day_of_month: form.day_of_month } : { days_of_week: form.days_of_week }),
            start_date: form.start_date,
            ...(form.repeat_until ? { repeat_until: form.repeat_until } : {}),
          }
        : { date: form.date }),
      ...(form.category ? { category: form.category } : {}),
      ...(form.team_id ? { team_id: form.team_id } : {}),
    }
  }

  function addMeetingSchedule() {
    if (!meetForm.title.trim()) return
    const item = buildScheduleFromForm(Date.now().toString(), meetForm)
    saveSchedules([...schedules, item])
    setMeetForm(defaultMeetForm())
    setShowMeetingForm(false)
  }

  function removeMeetingSchedule(id: string) {
    saveSchedules(schedules.filter(s => s.id !== id))
    if (editingId === id) setEditingId(null)
  }

  function startEdit(s: MeetingSchedule) {
    setEditingId(s.id)
    setEditForm({
      title: s.title,
      time: s.time,
      is_recurring: s.is_recurring,
      recur_type: s.recur_type ?? 'weekly',
      days_of_week: s.days_of_week ?? [],
      day_of_month: s.day_of_month ?? 1,
      start_date: s.start_date ?? startOfThisMonthStr(),
      repeat_until: s.repeat_until ?? null,
      date: s.date ?? todayStrSched(),
      category: s.category ?? '',
      team_id: s.team_id ?? '',
    })
  }

  function saveEdit() {
    if (!editingId || !editForm.title.trim()) return
    const updated = buildScheduleFromForm(editingId, editForm)
    saveSchedules(schedules.map(s => s.id !== editingId ? s : updated))
    setEditingId(null)
  }

  // 안건 사전 메모 상태 (key: `${scheduleId}_${dateStr}`)
  const [fixedMemoOpen,   setFixedMemoOpen]   = useState<Record<string, boolean>>({})
  const [fixedMemoText,   setFixedMemoText]   = useState<Record<string, string>>({})
  const [fixedMemoSaving, setFixedMemoSaving] = useState<Record<string, boolean>>({})
  const [fixedMemoSaved,  setFixedMemoSaved]  = useState<Record<string, boolean>>({})

  async function saveScheduleFixedMemo(schedule: MeetingSchedule, dateStr: string) {
    const key = `${schedule.id}_${dateStr}`
    const text = (fixedMemoText[key] ?? '').trim()
    if (!text) return
    setFixedMemoSaving(p => ({ ...p, [key]: true }))
    const newNote: NoteEntry = { title: '사전 메모', content: text, created_at: new Date().toISOString(), is_prep: true }
    const category = schedule.category ?? '기타'
    const existing = meetings.find(m => m.title === schedule.title && m.meeting_date?.startsWith(dateStr))
    if (existing) {
      const prev = (existing.notes ?? []) as NoteEntry[]
      await supabase.from('meetings').update({ notes: [...prev, newNote] }).eq('id', existing.id)
      setMeetings(ms => ms.map(m => m.id === existing.id ? { ...m, notes: [...(m.notes ?? []), newNote] } : m))
    } else {
      const { data } = await supabase.from('meetings').insert({ title: schedule.title, meeting_date: dateStr, category, notes: [newNote] }).select('id, title, meeting_date, category, notes').single()
      if (data) setMeetings(ms => [...ms, data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category' | 'notes'>])
    }
    setFixedMemoText(p => ({ ...p, [key]: '' }))
    setFixedMemoSaving(p => ({ ...p, [key]: false }))
    setFixedMemoSaved(p => ({ ...p, [key]: true }))
    setTimeout(() => setFixedMemoSaved(p => ({ ...p, [key]: false })), 2500)
  }

  // 고정회의(반복일정) 클릭 → 그날의 회의록으로 이동. 없으면 새로 만들어서 이동.
  async function goToFixedMeeting(schedule: MeetingSchedule, dateStr: string) {
    const existing = meetings.find(m => m.title === schedule.title && m.meeting_date?.startsWith(dateStr))
    if (existing) { router.push(`/meetings/${existing.id}`); return }
    const category = schedule.category ?? '기타'
    const { data } = await supabase.from('meetings').insert({ title: schedule.title, meeting_date: dateStr, category, notes: [] }).select('id, title, meeting_date, category, notes').single()
    if (data) {
      const created = data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category' | 'notes'>
      setMeetings(ms => [...ms, created])
      router.push(`/meetings/${created.id}`)
    }
  }

  const supabase = createClient()

  function loadData() {
    Promise.all([
      fetchAllTasks(),
      fetchMembers(),
      supabase.from('meetings').select('id, title, meeting_date, category, notes').not('meeting_date', 'is', null),
      supabase.from('task_todos').select('*, tasks(id, title, short_name, part)').eq('done', false).limit(500),
      supabase.from('agenda_sub_tasks').select('id, title, target_date, agenda_items(id, title, agenda_groups(category))').not('target_date', 'is', null).neq('status', 'done'),
    ]).then(([t, m, { data: mtgs, error: mtgErr }, { data: allTodos, error: todosErr }, { data: subTaskData, error: stErr }]) => {
      if (mtgErr) console.error('[schedule] meetings error:', mtgErr)
      if (todosErr) console.error('[schedule] todos error:', todosErr)
      if (stErr) console.error('[schedule] subtasks error:', stErr)
      setTasks(t); setMembers(m)
      setMeetings((mtgs ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category' | 'notes'>[])
      // task_todos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todoItems: ScheduledTodo[] = (allTodos ?? [])
        .filter((r: any) => (r.target_date || r.schedule_tag) && r.tasks)
        .map((r: any) => ({ id: r.id, title: r.title, target_date: r.target_date ?? null, schedule_tag: r.schedule_tag ?? null, task: r.tasks }))
      // agenda_sub_tasks (오늘/내일/금주 버튼으로 target_date 설정된 항목)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subTaskItems: ScheduledTodo[] = (subTaskData ?? [])
        .filter((r: any) => r.agenda_items)
        .map((r: any) => ({
          id: `agst_${r.id}`,
          title: r.title,
          target_date: r.target_date,
          schedule_tag: null,
          task: { id: r.agenda_items.id, title: r.agenda_items.title, short_name: null, part: r.agenda_items.agenda_groups?.category ?? '' },
        }))
      setScheduledTodos([...todoItems, ...subTaskItems])
    })
  }

  useEffect(() => {
    loadData()

    // 할일별 담당자 맵 (task detail과 localStorage 공유)
    try {
      const raw = localStorage.getItem('todo_assignees') ?? ''
      if (raw) setTodoAssigneeMap(JSON.parse(raw) as Record<string, string>)
    } catch {}

    // 예정 1on1 (next_appointment_date 설정된 것)
    supabase
      .from('one_on_ones')
      .select('id, member_id, next_appointment_date, members(name)')
      .not('next_appointment_date', 'is', null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        if (data) setScheduledOneOnOnes((data as any[]).map(r => ({
          id: r.id,
          member_id: r.member_id,
          member_name: r.members?.name ?? '팀원',
          next_appointment_date: r.next_appointment_date,
        })))
      })

    function onFocus() { loadData() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'KeyQ') setPartFilter(p => {
        const cycle = ['전체', ...flatParts.map(fp => fp.id)]
        const idx = cycle.indexOf(p)
        return cycle[(idx + 1) % cycle.length]
      })
      if (e.code === 'KeyW') setStatusFilter(s => s === '전체' ? '진행필요' : s === '진행필요' ? '진행중' : s === '진행중' ? '완료' : '전체')
      if (e.code === 'KeyE') setReportFilter(r => r === '전체' ? '중간공유' : r === '중간공유' ? '최종보고' : '전체')
      if (e.code === 'KeyR') setViewFilter(v => v === '전체' ? '업무만' : v === '업무만' ? '회의만' : '전체')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onMeetingCreated(e: Event) {
      const m = (e as CustomEvent).detail as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category' | 'notes'>
      if (m?.meeting_date) setMeetings(prev => [...prev, m])
    }
    window.addEventListener('quick-meeting-created', onMeetingCreated)
    return () => window.removeEventListener('quick-meeting-created', onMeetingCreated)
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('schedule_day_order')
      if (saved) setDayOrder(JSON.parse(saved))
    } catch {}
  }, [])

  const filtered = tasks.filter(t => {
    if (assigneeFilter !== '전체' && t.assignee_id !== assigneeFilter) return false
    if (statusFilter !== '전체' && t.status !== statusFilter) return false
    if (partFilter !== '전체' && t.part !== partFilter) return false
    return true
  })

  const start = startOfMonth(current)
  const end = endOfMonth(current)
  const days = eachDayOfInterval({ start, end })
  const startDow = getDay(start)

  const prevMonth = subMonths(current, 1)
  const prevDays = startDow > 0
    ? Array.from({ length: startDow }, (_, i) => {
        const d = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), getDaysInMonth(prevMonth) - startDow + 1 + i)
        return d
      })
    : []

  const totalCells = prevDays.length + days.length
  const nextCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
  const nextMonth = addMonths(current, 1)
  const nextDays = Array.from({ length: nextCount }, (_, i) => new Date(nextMonth.getFullYear(), nextMonth.getMonth(), i + 1))

  function getDayTasks(day: Date): DayTask[] {
    if (viewFilter === '회의만') return []
    const result: DayTask[] = []
    filtered.forEach(t => {
      if (t.mid_date && isSameDay(parseISO(t.mid_date), day)) {
        if (reportFilter === '전체' || reportFilter === '중간공유')
          result.push({ task: t, dateType: 'mid' })
      }
      if (t.end_date && isSameDay(parseISO(t.end_date), day)) {
        if (reportFilter === '전체' || reportFilter === '최종보고')
          result.push({ task: t, dateType: 'end' })
      }
    })
    return result
  }

  function getDayMeetings(day: Date) {
    if (viewFilter === '업무만') return []
    return meetings.filter(m => m.meeting_date && isSameDay(parseISO(m.meeting_date), day))
  }

  function getEffectiveTodoDate(t: ScheduledTodo): Date | null {
    if (t.target_date) return parseISO(t.target_date)
    if (t.schedule_tag) {
      const d = new Date()
      if (t.schedule_tag === 'today') return d
      if (t.schedule_tag === 'tomorrow') { d.setDate(d.getDate() + 1); return d }
      if (t.schedule_tag === 'this_week') {
        const daysToFri = (5 - d.getDay() + 7) % 7
        d.setDate(d.getDate() + (daysToFri === 0 ? 0 : daysToFri))
        return d
      }
    }
    return null
  }

  function getDayScheduledTodos(day: Date): ScheduledTodo[] {
    if (viewFilter === '회의만') return []
    const result = scheduledTodos.filter(t => {
      const effectiveDate = getEffectiveTodoDate(t)
      if (!effectiveDate || !isSameDay(effectiveDate, day)) return false
      const effectiveAssignee = todoAssigneeMap[t.id]
      if (assigneeFilter !== '전체' && effectiveAssignee !== assigneeFilter) return false
      if (partFilter !== '전체' && t.task.part !== partFilter) return false
      return true
    })
    return result
  }

  function getDayOneOnOnes(day: Date): ScheduledOneOnOne[] {
    if (viewFilter === '업무만') return []
    return scheduledOneOnOnes.filter(o => isSameDay(parseISO(o.next_appointment_date), day))
  }

  function getDayFixedMeetings(day: Date): MeetingSchedule[] {
    if (viewFilter === '업무만') return []
    const dow = getDay(day)
    const dateStr = format(day, 'yyyy-MM-dd')
    return schedules.filter(s => {
      if (partFilter !== '전체' && s.team_id && s.team_id !== partFilter) return false
      if (!s.is_recurring) return s.date === dateStr
      if (s.start_date && dateStr < s.start_date) return false
      if (s.repeat_until && dateStr > s.repeat_until) return false
      if (s.recur_type === 'monthly') {
        const dim = getDaysInMonth(day)
        const dom = Math.min(s.day_of_month ?? 1, dim)
        return day.getDate() === dom
      }
      return (s.days_of_week ?? []).includes(dow)
    }).sort((a, b) => a.time.localeCompare(b.time))
  }

  const selectedDayTasks = selectedDay ? getDayTasks(selectedDay) : []
  const selectedDayMeetings = selectedDay ? getDayMeetings(selectedDay) : []
  const selectedDayTodos = selectedDay ? getDayScheduledTodos(selectedDay) : []
  const selectedDayOneOnOnes = selectedDay ? getDayOneOnOnes(selectedDay) : []
  const selectedDayFixedMeetings = selectedDay ? getDayFixedMeetings(selectedDay) : []

  type DayListItem =
    | { itemId: string; type: 'task'; data: DayTask }
    | { itemId: string; type: 'meeting'; data: Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'> }
    | { itemId: string; type: 'todo'; data: ScheduledTodo }

  function getOrderedDayItems(): DayListItem[] {
    const all: DayListItem[] = [
      ...selectedDayMeetings.map(m => ({ itemId: `meeting-${m.id}`, type: 'meeting' as const, data: m })),
      ...selectedDayTasks.map(dt => ({ itemId: `task-${dt.task.id}-${dt.dateType}`, type: 'task' as const, data: dt })),
      ...selectedDayTodos.map(t => ({ itemId: `todo-${t.id}`, type: 'todo' as const, data: t })),
    ]
    if (!selectedDay) return all
    const key = format(selectedDay, 'yyyy-MM-dd')
    const savedOrder = dayOrder[key]
    if (!savedOrder || savedOrder.length === 0) return all
    const itemMap = new Map(all.map(item => [item.itemId, item]))
    const ordered: DayListItem[] = []
    for (const id of savedOrder) {
      const item = itemMap.get(id)
      if (item) { ordered.push(item); itemMap.delete(id) }
    }
    ordered.push(...itemMap.values())
    return ordered
  }

  function handleDayDrop(targetId: string) {
    if (!dragItemId || !selectedDay || dragItemId === targetId) return
    const key = format(selectedDay, 'yyyy-MM-dd')
    const items = getOrderedDayItems()
    const ids = items.map(i => i.itemId)
    const fromIdx = ids.indexOf(dragItemId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const newIds = [...ids]
    newIds.splice(fromIdx, 1)
    newIds.splice(toIdx, 0, dragItemId)
    const newOrder = { ...dayOrder, [key]: newIds }
    setDayOrder(newOrder)
    localStorage.setItem('schedule_day_order', JSON.stringify(newOrder))
    setDragItemId(null); setDragOverId(null)
  }

  function countWeekdays(start: Date, end: Date): number {
    let count = 0
    const cur = new Date(start)
    while (cur <= end) { const dow = cur.getDay(); if (dow !== 0 && dow !== 6) count++; cur.setDate(cur.getDate() + 1) }
    return count
  }

  function getPeriodRange(period: '이번주' | '이번달' | '직전월'): [Date, Date] {
    const today = new Date()
    if (period === '이번달') return [startOfMonth(today), endOfMonth(today)]
    if (period === '직전월') { const prev = subMonths(today, 1); return [startOfMonth(prev), endOfMonth(prev)] }
    const dow = today.getDay()
    const diffToMon = (dow === 0 ? -6 : 1 - dow)
    const mon = new Date(today); mon.setDate(today.getDate() + diffToMon); mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999)
    return [mon, sun]
  }

  function countMonthEvents(monthDate: Date): { meetings: number; tasks: number } {
    const mStart = startOfMonth(monthDate); const mEnd = endOfMonth(monthDate)
    const inRange = (dateStr: string | null | undefined) => { if (!dateStr) return false; const d = parseISO(dateStr); return d >= mStart && d <= mEnd }
    return { meetings: meetings.filter(m => inRange(m.meeting_date)).length, tasks: tasks.filter(t => inRange(t.mid_date) || inRange(t.end_date)).length }
  }

  function computeAnalysis(period: '이번주' | '이번달' | '직전월') {
    const [pStart, pEnd] = getPeriodRange(period)
    const inRange = (dateStr: string | null | undefined) => { if (!dateStr) return false; const d = parseISO(dateStr); return d >= pStart && d <= pEnd }
    const workDays = countWeekdays(pStart, pEnd)
    const meetingCount = meetings.filter(m => inRange(m.meeting_date)).length
    const taskDeadlines = tasks.filter(t => inRange(t.mid_date) || inRange(t.end_date)).length
    const totalHours = workDays * 8
    const meetingHours = meetingCount * 1
    const focusHours = Math.max(0, totalHours - meetingHours)
    return { workDays, meetingCount, taskDeadlines, totalHours, meetingHours, focusHours }
  }

  const prevMonthNav = subMonths(current, 1)
  const nextMonthNav = addMonths(current, 1)
  const analysis = computeAnalysis(analysisPeriod)

  function getMeetingStyle(category: string | null | undefined): CSSProperties {
    const key: CategoryColorKey = MEETING_CATEGORY[category ?? ''] ?? colorKeyFromName(category ?? '기타')
    return { background: CATEGORY_PALETTE[key].bg, color: 'rgba(226,232,240,0.9)' }
  }

  function renderDay(day: Date, isOtherMonth: boolean) {
    const dayTasks = getDayTasks(day)
    const dayMeetings = getDayMeetings(day)
    const dayTodos = getDayScheduledTodos(day)
    const dayOneOnOnes = getDayOneOnOnes(day)
    const dayFixed = getDayFixedMeetings(day)
    // 실제 meeting 레코드가 있는 고정 회의는 중복 제외
    const dayFixedFiltered = dayFixed.filter(
      s => !dayMeetings.some(m => m.title === s.title)
    )
    const allItems = [
      ...dayTasks.map(dt => ({ type: 'task' as const, dt })),
      ...dayMeetings.map(m => ({ type: 'meeting' as const, m })),
      ...dayFixedFiltered.map(s => ({ type: 'fixed' as const, s })),
      ...dayTodos.map(t => ({ type: 'todo' as const, t })),
      ...dayOneOnOnes.map(o => ({ type: 'one-on-one' as const, o })),
    ]
    const isToday = isSameDay(day, new Date())
    const isSelected = selectedDay && isSameDay(day, selectedDay)
    return (
      <div key={day.toISOString()}
        onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
        className={`min-h-24 p-1.5 rounded-2xl cursor-pointer transition-colors ${isToday ? 'ring-1 ring-[#BADEC8] ring-inset' : ''} ${isSelected ? 'bg-[rgba(255,255,255,0.06)]' : isOtherMonth ? 'bg-[rgba(255,255,255,0.06)] opacity-40' : 'hover:bg-[rgba(255,255,255,0.06)]'}`}>
        <p className={`text-xs text-center mb-1.5 w-6 h-6 flex items-center justify-center rounded-full mx-auto ${
          isToday ? 'bg-[#2D5A45] text-white font-bold' : isOtherMonth ? 'text-[rgba(226,232,240,0.3)]' : 'text-[rgba(226,232,240,0.7)]'
        }`}>
          {format(day, 'd')}
        </p>
        <div className="space-y-0.5">
          {allItems.slice(0, 4).map((item, idx) => {
            if (item.type === 'task') {
              const { dt } = item
              return (
                <button key={`task-${dt.task.id}-${dt.dateType}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/tasks/${dt.task.id}`) }}
                  className={`w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 font-medium ${
                    dt.dateType === 'mid' ? 'bg-[#F3E482]/65 text-[rgba(226,232,240,0.9)]' : 'bg-[#90A7D8]/45 text-[rgba(226,232,240,0.9)]'
                  }`}
                  title={`${dt.dateType === 'mid' ? '중간공유' : '최종보고'} | ${dt.task.title}`}>
                  <span className="opacity-70">{dt.dateType === 'mid' ? '중간' : '최종'}</span>
                  {' '}{dt.task.title}
                </button>
              )
            } else if (item.type === 'meeting') {
              const { m } = item
              return (
                <button key={`meeting-${m.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/meetings/${m.id}`) }}
                  className="w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 font-medium"
                  style={getMeetingStyle(m.category)}
                  title={`회의 | ${m.title}`}>
                  {m.title}
                </button>
              )
            } else if (item.type === 'todo') {
              const { t } = item
              return (
                <button key={`todo-${t.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/tasks/${t.task.id}`) }}
                  className="w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 bg-violet-50/80 text-violet-800"
                  title={`할일 | ${t.title}`}>
                  <span className="opacity-50 mr-0.5">·</span>{t.title}
                </button>
              )
            } else if (item.type === 'fixed') {
              const { s } = item
              return (
                <button key={`fixed-${s.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); goToFixedMeeting(s, format(day, 'yyyy-MM-dd')) }}
                  className="w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 bg-emerald-900/40 text-emerald-300 border border-emerald-700/40"
                  title={`고정회의 | ${s.title} ${s.time} (클릭하면 회의록으로 이동)`}>
                  <span className="opacity-60 mr-0.5">↺</span>{s.time} {s.title}
                </button>
              )
            } else {
              const { o } = item
              return (
                <button key={`oo-${o.id}-${idx}`}
                  onClick={e => { e.stopPropagation(); router.push(`/one-on-one/${o.member_id}`) }}
                  className="w-full text-left rounded-lg px-1.5 py-0.5 truncate text-[11px] leading-tight hover:opacity-80 bg-purple-100/70 text-purple-800"
                  title={`1on1 | ${o.member_name}`}>
                  <span className="opacity-60 mr-0.5 text-[9px]">1:1</span>{o.member_name}
                </button>
              )
            }
          })}
          {allItems.length > 4 && <p className="text-[10px] text-[rgba(226,232,240,0.4)] text-center">+{allItems.length - 4}</p>}
        </div>
      </div>
    )
  }

  const pillBase = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
  const pillActive = 'bg-[#4C7FE0] text-white border-[#4C7FE0] shadow-sm'
  const pillInactive = 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)]'

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#E2E8F0]">일정</h1>
      </div>

      {/* 필터 pills */}
      <div className="flex-shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-hide mb-4">
        <select value={partFilter} onChange={e => setPartFilter(e.target.value)}
          className={`${pillBase} bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] focus:outline-none cursor-pointer [&>option]:bg-[#26282E] [&>option]:text-[rgba(226,232,240,0.8)]`}
          style={{ colorScheme: 'dark' }}>
          <option value="전체">전체 파트</option>
          {flatParts.map(fp => <option key={fp.id} value={fp.id}>{fp.label}</option>)}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskStatus | '전체')}
          className={`${pillBase} bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] focus:outline-none cursor-pointer [&>option]:bg-[#26282E] [&>option]:text-[rgba(226,232,240,0.8)]`}
          style={{ colorScheme: 'dark' }}>
          <option value="전체">전체 상태</option>
          <option value="진행필요">진행필요</option>
          <option value="진행중">진행중</option>
          <option value="완료">완료</option>
        </select>

        <select value={reportFilter} onChange={e => setReportFilter(e.target.value as '전체' | '중간공유' | '최종보고')}
          className={`${pillBase} bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] focus:outline-none cursor-pointer [&>option]:bg-[#26282E] [&>option]:text-[rgba(226,232,240,0.8)]`}
          style={{ colorScheme: 'dark' }}>
          <option value="전체">보고구분</option>
          <option value="중간공유">중간공유</option>
          <option value="최종보고">최종보고</option>
        </select>

        <select value={viewFilter} onChange={e => setViewFilter(e.target.value as '전체' | '업무만' | '회의만')}
          className={`${pillBase} bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] focus:outline-none cursor-pointer [&>option]:bg-[#26282E] [&>option]:text-[rgba(226,232,240,0.8)]`}
          style={{ colorScheme: 'dark' }}>
          <option value="전체">업무+회의</option>
          <option value="업무만">업무만</option>
          <option value="회의만">회의만</option>
        </select>

        <GlassSelect
          value={assigneeFilter === '전체' ? '' : assigneeFilter}
          onChange={v => setAssigneeFilter(v || '전체')}
          options={members.map(m => ({ value: m.id, label: m.name }))}
          placeholder="전체 담당자"
          variant="pill"
          activeWhenFilled
        />

      </div>

      {/* 메인 그리드 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">

          {/* 캘린더 */}
          <div className="md:col-span-2 bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[rgba(226,232,240,0.9)]">{format(current, 'yyyy년 M월', { locale: ko })}</h2>
              <div className="flex items-center gap-1 bg-[rgba(255,255,255,0.06)] rounded-full p-1 border border-[rgba(255,255,255,0.09)]">
                <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="px-2.5 py-1 text-sm text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] hover:bg-[rgba(255,255,255,0.06)] rounded-full transition-all">←</button>
                <button onClick={() => setCurrent(new Date())}
                  className="px-2.5 py-1 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] hover:bg-[rgba(255,255,255,0.06)] rounded-full transition-all font-medium">오늘</button>
                <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="px-2.5 py-1 text-sm text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] hover:bg-[rgba(255,255,255,0.06)] rounded-full transition-all">→</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px flex-1">
              {['일','월','화','수','목','금','토'].map(d => (
                <div key={d} className="text-center text-xs text-[rgba(226,232,240,0.4)] font-medium py-2">{d}</div>
              ))}
              {prevDays.map(d => renderDay(d, true))}
              {days.map(d => renderDay(d, false))}
              {nextDays.map(d => renderDay(d, true))}
            </div>

            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[rgba(255,255,255,0.09)] flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-[#F3E482]/60 rounded border border-[#F3E482]/80" />
                <span className="text-xs text-[rgba(226,232,240,0.4)]">중간공유</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-[#90A7D8]/40 rounded border border-[#90A7D8]/60" />
                <span className="text-xs text-[rgba(226,232,240,0.4)]">최종보고</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <div className="w-2 h-2.5 bg-[#BADEC8]/50 rounded" />
                  <div className="w-2 h-2.5 bg-[#F3E482]/55 rounded" />
                  <div className="w-2 h-2.5 bg-[#90A7D8]/40 rounded" />
                </div>
                <span className="text-xs text-[rgba(226,232,240,0.4)]">회의</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-violet-50/80 rounded border border-violet-200/50" />
                <span className="text-xs text-[rgba(226,232,240,0.4)]">할일</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-purple-100/70 rounded border border-purple-200/50" />
                <span className="text-xs text-[rgba(226,232,240,0.4)]">1on1</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2.5 bg-emerald-900/40 rounded border border-emerald-700/40" />
                <span className="text-xs text-[rgba(226,232,240,0.4)]">고정회의</span>
              </div>
              <div className="ml-auto">
                <button onClick={() => setShowAnalysis(v => !v)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${showAnalysis ? pillActive : pillInactive}`}>
                  ⏱ 시간 분석
                </button>
              </div>
            </div>

            {showAnalysis && (
              <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.09)]">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-[rgba(226,232,240,0.4)] mr-1">기간</span>
                  {(['이번주', '이번달', '직전월'] as const).map(p => (
                    <button key={p} onClick={() => setAnalysisPeriod(p)}
                      className={`text-xs px-3 py-1 rounded-full transition-all ${analysisPeriod === p ? pillActive : 'bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.5)] border border-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.06)]'}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: '업무일', value: analysis.workDays, unit: '일', cls: 'bg-[rgba(255,255,255,0.06)]' },
                    { label: '회의 건수', value: analysis.meetingCount, unit: '건', cls: 'bg-rose-50/60' },
                    { label: '업무 마감', value: analysis.taskDeadlines, unit: '건', cls: 'bg-slate-50/60' },
                  ].map(s => (
                    <div key={s.label} className={`${s.cls} rounded-2xl border border-[rgba(255,255,255,0.09)] p-3 text-center`}>
                      <p className="text-xs text-[rgba(226,232,240,0.4)] mb-1">{s.label}</p>
                      <p className="text-lg font-bold text-[rgba(226,232,240,0.9)]">{s.value}<span className="text-xs font-normal text-[rgba(226,232,240,0.4)] ml-0.5">{s.unit}</span></p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex h-3.5 rounded-full overflow-hidden bg-[rgba(255,255,255,0.06)]">
                    {analysis.totalHours > 0 && (
                      <>
                        <div className="bg-rose-300 transition-all" style={{ width: `${Math.min(100, (analysis.meetingHours / analysis.totalHours) * 100)}%` }} />
                        <div className="bg-[#BADEC8]/70 transition-all" style={{ width: `${Math.min(100, (analysis.focusHours / analysis.totalHours) * 100)}%` }} />
                      </>
                    )}
                  </div>
                  <p className="text-xs text-[rgba(226,232,240,0.5)]">
                    총 <span className="font-semibold text-[rgba(226,232,240,0.8)]">{analysis.totalHours}h</span>{' · '}
                    회의 <span className="font-semibold text-rose-500">{analysis.meetingHours}h</span>{' · '}
                    집중 <span className="font-semibold text-[#2D5A45]">{analysis.focusHours}h</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 우측 패널 */}
          <div className="space-y-3">

            {/* 고정 회의 설정 */}
            <div id="meetings" className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[rgba(226,232,240,0.8)]">📋 고정 회의</h3>
                <button
                  onClick={() => setShowMeetingForm(p => !p)}
                  className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] transition-colors">
                  {showMeetingForm ? '취소' : '+ 추가'}
                </button>
              </div>

              {showMeetingForm && (
                <div className="mb-3 p-2.5 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-xl space-y-2">
                  <input
                    autoFocus
                    value={meetForm.title}
                    onChange={e => setMeetForm(p => ({ ...p, title: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addMeetingSchedule() }}
                    placeholder="회의명"
                    className="w-full text-xs focus:outline-none border-b border-[rgba(255,255,255,0.06)] pb-1 bg-transparent text-[rgba(226,232,240,0.8)] placeholder:text-[rgba(226,232,240,0.3)]"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={meetForm.time}
                      onChange={e => setMeetForm(p => ({ ...p, time: e.target.value }))}
                      className="text-xs border border-[rgba(255,255,255,0.09)] rounded px-1.5 py-0.5 focus:outline-none text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)]"
                    />
                    <label className="flex items-center gap-1 text-[10px] text-[rgba(226,232,240,0.5)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={meetForm.is_recurring}
                        onChange={e => setMeetForm(p => ({ ...p, is_recurring: e.target.checked }))}
                        className="w-3 h-3"
                      />
                      반복
                    </label>
                  </div>
                  <RecurrenceFields value={meetForm} onChange={patch => setMeetForm(p => ({ ...p, ...patch }))} />
                  <div className="space-y-1">
                    <p className="text-[9px] text-[rgba(226,232,240,0.35)]">회의록 범주</p>
                    <div className="flex flex-wrap gap-1">
                      {meetingCategories.map(cat => {
                        const ck = MEETING_CATEGORY[cat] ?? colorKeyFromName(cat)
                        const p = CATEGORY_PALETTE[ck]
                        const sel = meetForm.category === cat
                        return (
                          <button key={cat} type="button" onClick={() => setMeetForm(prev => ({ ...prev, category: sel ? '' : cat }))}
                            style={{ background: sel ? p.bg : 'rgba(255,255,255,0.04)', border: `1px solid ${sel ? p.border : 'rgba(255,255,255,0.07)'}`, color: sel ? p.text : 'rgba(226,232,240,0.4)' }}
                            className="text-[9px] px-2 py-0.5 rounded-full transition-all">
                            {cat}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {flatParts.length > 0 && (
                    <select
                      value={meetForm.team_id}
                      onChange={e => setMeetForm(p => ({ ...p, team_id: e.target.value }))}
                      className="w-full text-xs border border-[rgba(255,255,255,0.09)] rounded px-1.5 py-0.5 focus:outline-none text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)] [&>option]:bg-[#26282E]">
                      <option value="">팀/파트 선택 (선택사항)</option>
                      {flatParts.map(fp => (
                        <option key={fp.id} value={fp.id}>{fp.label}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button onClick={() => setShowMeetingForm(false)}
                      className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]">취소</button>
                    <button onClick={addMeetingSchedule} disabled={!meetForm.title.trim()}
                      className="text-[10px] bg-[#4C7FE0] text-white px-2.5 py-1 rounded-full disabled:opacity-40">
                      저장
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {schedules.length === 0 ? (
                  <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-2">등록된 고정 회의 없음</p>
                ) : (
                  schedules.map(s => {
                    if (editingId === s.id) {
                      return (
                        <div key={s.id} className="p-2.5 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] rounded-xl space-y-2">
                          <input
                            autoFocus
                            value={editForm.title}
                            onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                            className="w-full text-xs focus:outline-none border-b border-[rgba(255,255,255,0.06)] pb-1 bg-transparent text-[rgba(226,232,240,0.9)] placeholder:text-[rgba(226,232,240,0.3)]"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={editForm.time}
                              onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))}
                              className="text-xs border border-[rgba(255,255,255,0.09)] rounded px-1.5 py-0.5 focus:outline-none text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)]"
                            />
                            <label className="flex items-center gap-1 text-[10px] text-[rgba(226,232,240,0.5)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editForm.is_recurring}
                                onChange={e => setEditForm(p => ({ ...p, is_recurring: e.target.checked }))}
                                className="w-3 h-3"
                              />
                              반복
                            </label>
                          </div>
                          <RecurrenceFields value={editForm} onChange={patch => setEditForm(p => ({ ...p, ...patch }))} />
                          <div className="space-y-1">
                            <p className="text-[9px] text-[rgba(226,232,240,0.35)]">회의록 범주</p>
                            <div className="flex flex-wrap gap-1">
                              {meetingCategories.map(cat => {
                                const ck = MEETING_CATEGORY[cat] ?? colorKeyFromName(cat)
                                const p2 = CATEGORY_PALETTE[ck]
                                const sel = editForm.category === cat
                                return (
                                  <button key={cat} type="button" onClick={() => setEditForm(p => ({ ...p, category: sel ? '' : cat }))}
                                    style={{ background: sel ? p2.bg : 'rgba(255,255,255,0.04)', border: `1px solid ${sel ? p2.border : 'rgba(255,255,255,0.07)'}`, color: sel ? p2.text : 'rgba(226,232,240,0.4)' }}
                                    className="text-[9px] px-2 py-0.5 rounded-full transition-all">
                                    {cat}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          {flatParts.length > 0 && (
                            <select
                              value={editForm.team_id}
                              onChange={e => setEditForm(p => ({ ...p, team_id: e.target.value }))}
                              className="w-full text-xs border border-[rgba(255,255,255,0.09)] rounded px-1.5 py-0.5 focus:outline-none text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)] [&>option]:bg-[#26282E]">
                              <option value="">팀/파트 없음</option>
                              {flatParts.map(fp => (
                                <option key={fp.id} value={fp.id}>{fp.label}</option>
                              ))}
                            </select>
                          )}
                          <div className="flex justify-end gap-1.5 pt-0.5">
                            <button onClick={() => setEditingId(null)}
                              className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]">취소</button>
                            <button onClick={saveEdit} disabled={!editForm.title.trim()}
                              className="text-[10px] bg-[#4C7FE0] text-white px-2.5 py-1 rounded-full disabled:opacity-40">
                              저장
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={s.id} className="group flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors">
                        <span className="text-[11px] font-mono text-[rgba(226,232,240,0.4)] w-10 flex-shrink-0">{s.time}</span>
                        <span className="flex-1 text-[11px] text-[rgba(226,232,240,0.8)] truncate">{s.title}</span>
                        {s.category && (() => {
                          const ck = MEETING_CATEGORY[s.category] ?? colorKeyFromName(s.category)
                          const cp = CATEGORY_PALETTE[ck]
                          return <span className="text-[8px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: cp.bg, color: cp.text, border: `1px solid ${cp.border}` }}>{s.category}</span>
                        })()}
                        {s.team_id && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-900/40 text-emerald-400 flex-shrink-0">
                            {flatParts.find(fp => fp.id === s.team_id)?.label ?? s.team_id}
                          </span>
                        )}
                        <span className="text-[8px] text-[rgba(226,232,240,0.3)] flex-shrink-0">
                          {!s.is_recurring
                            ? s.date
                            : s.recur_type === 'monthly'
                              ? `매월 ${s.day_of_month ?? 1}일`
                              : (s.days_of_week ?? []).map(d => DOW_LABELS_SCHED[d]).join('')}
                          {s.is_recurring && s.repeat_until && ` (~${s.repeat_until.slice(5)})`}
                        </span>
                        <button
                          onClick={() => startEdit(s)}
                          className="text-[9px] text-[rgba(226,232,240,0.2)] hover:text-[rgba(226,232,240,0.6)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 px-0.5">
                          ✎
                        </button>
                        <button
                          onClick={() => removeMeetingSchedule(s.id)}
                          className="text-[9px] text-[rgba(226,232,240,0.2)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          ×
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* 전월 */}
            <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 text-xs text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                onClick={() => setShowPrevCal(v => !v)}>
                <span>{format(prevMonthNav, 'yy년 M월', { locale: ko })} (전월)</span>
                <span className="text-[rgba(226,232,240,0.3)]">{showPrevCal ? '▲' : '▼'}</span>
              </button>
              {showPrevCal && (
                <div className="px-3 pb-3">
                  <MiniCalInline monthDate={prevMonthNav} onClick={() => setCurrent(prevMonthNav)} />
                </div>
              )}
            </div>

            {/* 익월 */}
            <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 text-xs text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                onClick={() => setShowNextCal(v => !v)}>
                <span>{format(nextMonthNav, 'yy년 M월', { locale: ko })} (익월)</span>
                <span className="text-[rgba(226,232,240,0.3)]">{showNextCal ? '▲' : '▼'}</span>
              </button>
              {showNextCal && (
                <div className="px-3 pb-3">
                  <MiniCalInline monthDate={nextMonthNav} onClick={() => setCurrent(nextMonthNav)} />
                </div>
              )}
            </div>

            {/* 선택한 날 일정 */}
            <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-4">
              <h3 className="text-sm font-semibold text-[rgba(226,232,240,0.8)] mb-3">
                {selectedDay ? `${format(selectedDay, 'M월 d일 (E)', { locale: ko })} 일정` : '날짜를 선택하세요'}
              </h3>
              {!selectedDay ? (
                <p className="text-xs text-[rgba(226,232,240,0.3)] leading-relaxed">캘린더에서 날짜를 클릭하면 해당일 일정을 볼 수 있습니다</p>
              ) : (selectedDayTasks.length === 0 && selectedDayMeetings.length === 0 && selectedDayTodos.length === 0 && selectedDayOneOnOnes.length === 0 && selectedDayFixedMeetings.length === 0) ? (
                <p className="text-xs text-[rgba(226,232,240,0.3)]">예정된 일정이 없습니다</p>
              ) : (
                <div className="divide-y divide-[rgba(255,255,255,0.05)]">
                  {getOrderedDayItems().map(item => {
                    const dotColor = item.type === 'meeting' ? '#BADEC8'
                      : item.type === 'todo' ? '#A78BFA'
                      : (item.data as DayTask).dateType === 'mid' ? '#F3E482' : '#90A7D8'
                    const title = item.type === 'meeting'
                      ? (item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).title
                      : item.type === 'todo' ? (item.data as ScheduledTodo).title
                      : (item.data as DayTask).task.title
                    const sub = item.type === 'todo'
                      ? ((item.data as ScheduledTodo).task.short_name ?? (item.data as ScheduledTodo).task.title)
                      : item.type === 'task' ? (item.data as DayTask).task.short_name ?? ''
                      : ''
                    return (
                      <div key={item.itemId}
                        onClick={() => {
                          if (item.type === 'meeting') router.push(`/meetings/${(item.data as Pick<Meeting, 'id' | 'title' | 'meeting_date' | 'category'>).id}`)
                          else if (item.type === 'todo') router.push(`/tasks/${(item.data as ScheduledTodo).task.id}`)
                          else router.push(`/tasks/${(item.data as DayTask).task.id}`)
                        }}
                        className="flex items-center gap-2 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors px-1">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                        <span className="text-[12px] text-[rgba(226,232,240,0.85)] truncate flex-1">{title}</span>
                        {sub && <span className="text-[10px] text-[rgba(226,232,240,0.3)] flex-shrink-0 truncate max-w-[4rem]">{sub}</span>}
                      </div>
                    )
                  })}
                  {selectedDayOneOnOnes.map(o => (
                    <div key={`oo-panel-${o.id}`}
                      onClick={() => router.push(`/one-on-one/${o.member_id}`)}
                      className="flex items-center gap-2 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] rounded-lg transition-colors px-1">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#C084FC' }} />
                      <span className="text-[12px] text-[rgba(226,232,240,0.85)] truncate flex-1">{o.member_name}</span>
                      <span className="text-[10px] text-purple-400 flex-shrink-0">1on1</span>
                    </div>
                  ))}
                  {selectedDayFixedMeetings
                    .filter(s => !selectedDayMeetings.some(m => m.title === s.title))
                    .map(s => {
                      const dateStr = format(selectedDay!, 'yyyy-MM-dd')
                      const key = `${s.id}_${dateStr}`
                      const isOpen = fixedMemoOpen[key] ?? false
                      const text   = fixedMemoText[key] ?? ''
                      const saving = fixedMemoSaving[key] ?? false
                      const saved  = fixedMemoSaved[key] ?? false
                      const linked = meetings.find(m => m.title === s.title && m.meeting_date?.startsWith(dateStr))
                      const prepNotes = ((linked?.notes ?? []) as NoteEntry[]).filter(n => n.is_prep)
                      return (
                        <div key={`fixed-panel-${s.id}`} className="px-1 pb-1">
                          <div className="flex items-center gap-2 py-2">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#6EE7B7' }} />
                            {s.time && <span className="text-[10px] font-mono text-emerald-400 flex-shrink-0">{s.time}</span>}
                            <span
                              onClick={() => goToFixedMeeting(s, dateStr)}
                              className="text-[12px] text-[rgba(226,232,240,0.85)] truncate flex-1 cursor-pointer hover:underline"
                              title="클릭하면 회의록으로 이동">
                              {s.title}
                            </span>
                            {saved ? (
                              <span className="text-[10px] text-emerald-400 flex-shrink-0">저장됨 ✓</span>
                            ) : (
                              <button
                                onClick={() => setFixedMemoOpen(p => ({ ...p, [key]: !p[key] }))}
                                className="text-[10px] px-2 py-0.5 rounded flex-shrink-0 transition-all"
                                style={{ border: `1px solid ${isOpen ? 'rgba(56,190,152,0.35)' : 'rgba(255,255,255,0.1)'}`, background: isOpen ? 'rgba(56,190,152,0.12)' : 'transparent', color: isOpen ? '#6EE7B7' : 'rgba(226,232,240,0.4)' }}>
                                {prepNotes.length > 0 ? `안건 ${prepNotes.length}` : '안건'}
                              </button>
                            )}
                          </div>
                          {prepNotes.length > 0 && !isOpen && (
                            <div className="ml-5 mb-1.5 space-y-0.5">
                              {prepNotes.slice(-3).map((n, ni) => (
                                <p key={ni} className="text-[11px] text-[rgba(226,232,240,0.4)] truncate">· {n.content}</p>
                              ))}
                            </div>
                          )}
                          {isOpen && (
                            <div className="ml-5 mb-2 flex gap-2">
                              <textarea
                                autoFocus
                                value={text}
                                onChange={e => setFixedMemoText(p => ({ ...p, [key]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveScheduleFixedMemo(s, dateStr) }
                                  if (e.key === 'Escape') setFixedMemoOpen(p => ({ ...p, [key]: false }))
                                }}
                                placeholder="회의 안건 메모... (Ctrl+Enter)"
                                rows={2}
                                className="flex-1 text-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.09)] rounded-lg px-2.5 py-1.5 text-[rgba(226,232,240,0.85)] resize-none outline-none placeholder:text-[rgba(226,232,240,0.25)]"
                                style={{ fontFamily: 'inherit', lineHeight: 1.5 }}
                              />
                              <button
                                onClick={() => saveScheduleFixedMemo(s, dateStr)}
                                disabled={!text.trim() || saving}
                                className="text-[11px] px-3 py-1 rounded-lg self-end transition-all"
                                style={{ background: text.trim() ? 'rgba(56,190,152,0.16)' : 'rgba(255,255,255,0.04)', border: `1px solid ${text.trim() ? 'rgba(56,190,152,0.3)' : 'rgba(255,255,255,0.07)'}`, color: text.trim() ? '#6EE7B7' : 'rgba(226,232,240,0.3)', cursor: text.trim() ? 'pointer' : 'default' }}>
                                {saving ? '…' : '저장'}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

const KR_HOLIDAYS = new Set([
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-01', '2025-05-05', '2025-06-06', '2025-08-15',
  '2025-10-03', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', '2025-10-09',
  '2025-12-25',
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-01', '2026-03-02', '2026-05-05',
  '2026-06-06', '2026-08-15',
  '2026-09-23', '2026-09-24', '2026-09-25',
  '2026-10-03', '2026-10-09', '2026-12-25',
])

function isKoreanHoliday(d: Date): boolean {
  return KR_HOLIDAYS.has(format(d, 'yyyy-MM-dd'))
}

function MiniCalInline({ monthDate, onClick }: { monthDate: Date; onClick: () => void }) {
  const mStart = startOfMonth(monthDate)
  const mEnd = endOfMonth(monthDate)
  const mDays = eachDayOfInterval({ start: mStart, end: mEnd })
  const mStartDow = getDay(mStart)
  const today = new Date()
  return (
    <div className="grid grid-cols-7 text-center cursor-pointer" onClick={onClick}>
      {['일','월','화','수','목','금','토'].map((d, i) => (
        <div key={d} className={`text-[9px] pb-0.5 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-[rgba(226,232,240,0.3)]'}`}>{d}</div>
      ))}
      {Array.from({ length: mStartDow }, (_, i) => <div key={`p${i}`} />)}
      {mDays.map(d => {
        const dow = getDay(d)
        const holiday = isKoreanHoliday(d)
        const isToday_ = isSameDay(d, today)
        return (
          <div key={d.toISOString()} className={`text-[10px] h-6 flex items-center justify-center rounded-full ${isToday_ ? 'bg-red-500 text-white font-bold' : (dow === 0 || holiday) ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-[rgba(226,232,240,0.4)]'}`}>
            {format(d, 'd')}
          </div>
        )
      })}
    </div>
  )
}
