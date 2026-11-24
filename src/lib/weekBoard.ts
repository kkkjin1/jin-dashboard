// 금주 업무 — 홈 7열과 업무보고(수시보고) 오른쪽 세로 패널이 같이 쓰는 "요일별 분류" 계산.
// 새 조회 없이 이미 읽어 온 task_todos / quick_todos / agenda_sub_tasks / 고정회의를 날짜(target_date)로만 나눈다.
import type { TaskTodo, AgendaSubTask, QuickTodo } from '@/types'
import { scheduleOccursOn, type MeetingRecurrence } from '@/lib/meetingSchedule'

export interface MeetingSchedule extends MeetingRecurrence {
  id: string
  title: string
  time: string
  category?: string
}
export type TodayTodo = Omit<TaskTodo, 'tasks'> & {
  tasks: { id: string; title: string; short_name: string | null; part: string } | null
}
export type SubTaskWithContext = AgendaSubTask & {
  updated_at?: string | null
  agenda_items: { id: string; title: string; agenda_groups: { name: string; color: string; category: string } | null } | null
  sub_task_notes?: { created_at: string; edited_at: string | null; content: string | null }[]
}

export type WeekItem = {
  key: string; kind: 'todo' | 'quick' | 'agenda' | 'fixed'; title: string; meta: string; date: string
  todo?: TodayTodo; quick?: QuickTodo; st?: SubTaskWithContext; fixed?: MeetingSchedule; fixedKey?: string
}

export function shiftDateStr(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}
export function dowOfDateStr(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export interface WeekBoard {
  weekMonday: string; prevMonday: string; weekSunday: string; nextMonday: string; nextSunday: string
  weekDays: string[]          // 월~금
  /** 0 = 직전주 미완료, 1~5 = 월~금(이번 주 토·일은 금으로), 6 = 다음주로 연기 */
  cols: WeekItem[][]
  /** 지난주보다 이전 날짜의 미완료 */
  olderItems: WeekItem[]
}

export function buildWeekBoard(input: {
  today: string
  weekOffset?: number
  fixedSchedules: MeetingSchedule[]
  taskTodos: TodayTodo[]
  quickTodos: QuickTodo[]
  subTasks: SubTaskWithContext[]   // 진행중 + 최근 완료분
}): WeekBoard {
  const { today, weekOffset = 0, fixedSchedules, taskTodos, quickTodos, subTasks } = input
  const weekMonday = shiftDateStr(today, 7 * weekOffset - ((dowOfDateStr(today) + 6) % 7))
  const prevMonday = shiftDateStr(weekMonday, -7)
  const weekDays = [0, 1, 2, 3, 4].map(i => shiftDateStr(weekMonday, i))
  const weekSunday = shiftDateStr(weekMonday, 6)
  const nextMonday = shiftDateStr(weekMonday, 7)
  const nextSunday = shiftDateStr(weekMonday, 13)
  const tomorrow = shiftDateStr(today, 1)

  // 0 = 직전주 미완료, 1~5 = 월~금, 6 = 다음주, -1 = 표시 안 함, -2 = 지난주 이전 미완료
  function weekCol(date: string | null | undefined): number {
    if (!date) return -1
    if (date < prevMonday) return -2
    if (date < weekMonday) return 0
    if (date <= weekSunday) { const i = weekDays.indexOf(date); return i >= 0 ? i + 1 : 5 }
    if (date >= nextMonday && date <= nextSunday) return 6
    return -1
  }
  const cols: WeekItem[][] = [[], [], [], [], [], [], []]
  const olderItems: WeekItem[] = []
  // 고정회의 — 보고 있는 주의 월~금 각 날짜에 일정 탭과 같은 규칙으로 (다음주로 연기 열엔 넣지 않음)
  weekDays.forEach((date, i) => {
    fixedSchedules
      .filter(s => scheduleOccursOn(s, date))
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach(s => cols[i + 1].push({ key: `fx_${date}_${s.id}`, kind: 'fixed', title: s.title, meta: s.time, date, fixed: s, fixedKey: `${date}_${s.id}` }))
  })
  for (const t of taskTodos) {
    // target_date 없는 구 데이터는 schedule_tag 스냅샷으로 대체
    const date = t.target_date ?? (t.schedule_tag === 'today' ? today : t.schedule_tag === 'tomorrow' ? tomorrow : t.schedule_tag === 'this_week' ? weekDays[4] : null)
    const c = weekCol(date)
    if (t.done && (c === 0 || c === -2)) continue   // 직전주/이전 '미완료' 집계에서 완료분 제외
    const it: WeekItem = { key: `td_${t.id}`, kind: 'todo', title: t.title, meta: t.tasks?.short_name ?? t.tasks?.title ?? '', date: date!, todo: t }
    if (c === -2) olderItems.push(it)
    if (c >= 0) cols[c].push(it)
  }
  for (const q of quickTodos) {
    // 연기된 항목은 원래 날짜가 속한 주에서는 요일 대신 '다음주로 연기' 열로
    const raw = weekCol(q.target_date)
    const c = q.deferred && raw >= 1 && raw <= 5 ? 6 : raw
    if (q.done && (c === 0 || c === -2)) continue
    const it: WeekItem = { key: `qt_${q.id}`, kind: 'quick', title: q.title, meta: q.deferred ? '연기' : '즉석 할 일', date: q.target_date!, quick: q }
    if (c === -2) olderItems.push(it)
    if (c >= 0) cols[c].push(it)
  }
  for (const st of [...subTasks].sort((a, b) => a.sort_order - b.sort_order)) {
    const c = weekCol(st.target_date)
    if (st.status === 'done' && (c === 0 || c === -2)) continue
    const it: WeekItem = { key: `st_${st.id}`, kind: 'agenda', title: st.title, meta: st.agenda_items?.title ?? '', date: st.target_date!, st }
    if (c === -2) olderItems.push(it)
    if (c >= 0) cols[c].push(it)
  }
  cols[0].sort((a, b) => a.date.localeCompare(b.date))
  cols[6].sort((a, b) => a.date.localeCompare(b.date))
  return { weekMonday, prevMonday, weekSunday, nextMonday, nextSunday, weekDays, cols, olderItems }
}

/** 완료(취소선) 여부 — 고정회의는 완료 개념 없음 */
export function weekItemDone(it: WeekItem): boolean {
  if (it.kind === 'todo') return !!it.todo?.done
  if (it.kind === 'quick') return !!it.quick?.done
  if (it.kind === 'agenda') return it.st?.status === 'done'
  return false
}
