import { describe, it, expect } from 'vitest'
import { buildWeekBoard, shiftDateStr, dowOfDateStr, weekItemDone, type TodayTodo, type SubTaskWithContext, type MeetingSchedule } from './weekBoard'
import type { QuickTodo } from '@/types'

// 2026-11-24 = 화요일 → 이번 주 월 11-23 ~ 금 11-27, 지난주 월 11-16, 다음 주 11-30 ~ 12-06
const TODAY = '2026-11-24'
const todo = (id: string, target_date: string | null, done = false, schedule_tag: string | null = null) =>
  ({ id, title: `할일${id}`, target_date, done, schedule_tag, tasks: { id: 't', title: '과업', short_name: '약칭', part: '' } }) as unknown as TodayTodo
const quick = (id: string, target_date: string, done = false, deferred = false) =>
  ({ id, title: `즉석${id}`, target_date, done, deferred }) as unknown as QuickTodo
const st = (id: string, target_date: string | null, status: 'active' | 'done' = 'active', sort_order = 0) =>
  ({ id, title: `세부${id}`, target_date, status, sort_order, agenda_items: { id: 'a', title: '안건', agenda_groups: null } }) as unknown as SubTaskWithContext

const base = { today: TODAY, fixedSchedules: [] as MeetingSchedule[], taskTodos: [] as TodayTodo[], quickTodos: [] as QuickTodo[], subTasks: [] as SubTaskWithContext[] }
const keys = (items: { key: string }[]) => items.map(i => i.key)

describe('날짜 도우미', () => {
  it('월말·연말을 넘어 이동', () => {
    expect(shiftDateStr('2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftDateStr('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDateStr('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('요일 (0=일)', () => {
    expect(dowOfDateStr(TODAY)).toBe(2)
    expect(dowOfDateStr('2026-11-29')).toBe(0)
  })
})

describe('buildWeekBoard', () => {
  it('주 경계 계산', () => {
    const b = buildWeekBoard(base)
    expect(b.weekMonday).toBe('2026-11-23')
    expect(b.weekDays).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'])
    expect(b.prevMonday).toBe('2026-11-16')
    expect(b.nextMonday).toBe('2026-11-30')
    expect(b.nextSunday).toBe('2026-12-06')
  })
  it('일요일이 오늘이면 그 주 월요일 기준', () => {
    expect(buildWeekBoard({ ...base, today: '2026-11-29' }).weekMonday).toBe('2026-11-23')
  })

  it('날짜별 열 배치 — 직전주·요일·주말→금·다음주·범위 밖', () => {
    const b = buildWeekBoard({ ...base, taskTodos: [
      todo('prev', '2026-11-18'), todo('mon', '2026-11-23'), todo('tue', TODAY), todo('sat', '2026-11-28'),
      todo('next', '2026-12-02'), todo('far', '2026-12-10'), todo('old', '2026-11-01'), todo('none', null),
    ] })
    expect(keys(b.cols[0])).toEqual(['td_prev'])
    expect(keys(b.cols[1])).toEqual(['td_mon'])
    expect(keys(b.cols[2])).toEqual(['td_tue'])
    expect(keys(b.cols[5])).toEqual(['td_sat'])
    expect(keys(b.cols[6])).toEqual(['td_next'])
    expect(keys(b.olderItems)).toEqual(['td_old'])
    expect(b.cols.flat().some(i => i.key === 'td_far' || i.key === 'td_none')).toBe(false)
  })

  it('지난 주·그 이전의 완료분은 미완료 집계에서 뺀다 (이번 주 완료분은 취소선으로 남김)', () => {
    const b = buildWeekBoard({ ...base,
      taskTodos: [todo('pd', '2026-11-18', true), todo('od', '2026-11-01', true), todo('wd', TODAY, true)],
      quickTodos: [quick('pd', '2026-11-18', true)],
      subTasks: [st('pd', '2026-11-18', 'done'), st('wd', TODAY, 'done')],
    })
    expect(b.cols[0]).toEqual([])
    expect(b.olderItems).toEqual([])
    expect(keys(b.cols[2])).toEqual(['td_wd', 'st_wd'])
    expect(b.cols[2].every(weekItemDone)).toBe(true)
  })

  it('target_date 없는 구 할 일은 schedule_tag로 대체', () => {
    const b = buildWeekBoard({ ...base, taskTodos: [todo('a', null, false, 'today'), todo('b', null, false, 'tomorrow'), todo('c', null, false, 'this_week')] })
    expect(keys(b.cols[2])).toEqual(['td_a'])
    expect(keys(b.cols[3])).toEqual(['td_b'])
    expect(keys(b.cols[5])).toEqual(['td_c'])
  })

  it('연기된 즉석 할 일은 이번 주 요일이 아니라 다음주로 연기 열', () => {
    const b = buildWeekBoard({ ...base, quickTodos: [quick('d', '2026-11-25', false, true), quick('n', '2026-11-25')] })
    expect(keys(b.cols[6])).toEqual(['qt_d'])
    expect(keys(b.cols[3])).toEqual(['qt_n'])
    expect(b.cols[6][0].meta).toBe('연기')
  })

  it('고정회의는 열리는 요일에만, 시간순, 맨 앞에', () => {
    const fixed: MeetingSchedule[] = [
      { id: 'f2', title: '주간회의', time: '10:00', is_recurring: true, days_of_week: [1, 3] },
      { id: 'f1', title: '조회', time: '09:00', is_recurring: true, days_of_week: [1] },
    ]
    const b = buildWeekBoard({ ...base, fixedSchedules: fixed, taskTodos: [todo('m', '2026-11-23')] })
    expect(keys(b.cols[1])).toEqual(['fx_2026-11-23_f1', 'fx_2026-11-23_f2', 'td_m'])
    expect(keys(b.cols[3])).toEqual(['fx_2026-11-25_f2'])
    expect(b.cols[6]).toEqual([])
  })

  it('세부task는 sort_order 순, 직전주/다음주 열은 날짜순', () => {
    const b = buildWeekBoard({ ...base,
      subTasks: [st('b', TODAY, 'active', 2), st('a', TODAY, 'active', 1)],
      taskTodos: [todo('x', '2026-11-20'), todo('y', '2026-11-17')],
    })
    expect(keys(b.cols[2])).toEqual(['st_a', 'st_b'])
    expect(keys(b.cols[0])).toEqual(['td_y', 'td_x'])
  })

  it('weekOffset으로 다른 주 보기', () => {
    const b = buildWeekBoard({ ...base, weekOffset: 1, taskTodos: [todo('n', '2026-12-01')] })
    expect(b.weekMonday).toBe('2026-11-30')
    expect(keys(b.cols[2])).toEqual(['td_n'])
  })
})
