// 연간목표 로드맵의 연간/주간 줌 렌더링이 공유하는 날짜 그리드 유틸.
// objective-review/page.tsx의 getMondayOf/getWeekCols 패턴을 "임의 구간을 덮는 모든 주"로 일반화.

import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

export const MONTH_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export type PeriodKey = 'H1' | 'H2' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'full'

export interface DateRange { start: string; end: string } // 'yyyy-MM-dd'

function pad2(n: number): string { return String(n).padStart(2, '0') }
function ymd(year: number, month1to12: number, day: number): string {
  return `${year}-${pad2(month1to12)}-${pad2(day)}`
}
function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate() // month(1-12)의 다음달 0일 = 그 달 말일
}

export function monthToDateRange(year: number, month1to12: number): DateRange {
  return {
    start: ymd(year, month1to12, 1),
    end: ymd(year, month1to12, lastDayOfMonth(year, month1to12)),
  }
}

const PERIOD_MONTHS: Record<PeriodKey, [number, number]> = {
  H1: [1, 6], H2: [7, 12],
  Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12],
  full: [1, 12],
}

export function periodToDateRange(year: number, key: PeriodKey): DateRange {
  const [startM, endM] = PERIOD_MONTHS[key]
  return {
    start: ymd(year, startM, 1),
    end: ymd(year, endM, lastDayOfMonth(year, endM)),
  }
}

export function getMondayOf(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  date.setHours(0, 0, 0, 0)
  return date
}

export interface WeekCol {
  start: string     // 'yyyy-MM-dd' 월요일
  end: string        // 'yyyy-MM-dd' 일요일
  label: string       // '7/20 ~ 7/26'
  monthLabel: string  // 이 주가 속한 달 (시작일 기준) — 헤더 상단 그룹핑용
}

// [rangeStart, rangeEnd]를 월~일 경계로 스냅해 완전히 덮는 주 컬럼 배열 생성
export function getWeekColumnsBetween(rangeStart: string, rangeEnd: string): WeekCol[] {
  const start = getMondayOf(new Date(rangeStart + 'T00:00:00'))
  const endAnchor = new Date(rangeEnd + 'T00:00:00')
  const cols: WeekCol[] = []
  let mon = start
  while (mon <= endAnchor) {
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    cols.push({
      start: format(mon, 'yyyy-MM-dd'),
      end: format(sun, 'yyyy-MM-dd'),
      label: `${format(mon, 'M/d', { locale: ko })} ~ ${format(sun, 'M/d', { locale: ko })}`,
      monthLabel: format(mon, 'M월', { locale: ko }),
    })
    const next = new Date(mon)
    next.setDate(next.getDate() + 7)
    mon = next
  }
  return cols
}

// 바(barStart~barEnd)가 컬럼(colStart~colEnd) 구간과 겹치는지 — 월 컬럼/주 컬럼 공통 사용
export function overlapsRange(
  barStart: string | null | undefined,
  barEnd: string | null | undefined,
  colStart: string,
  colEnd: string,
): boolean {
  if (!barStart || !barEnd) return false
  return barStart <= colEnd && barEnd >= colStart
}
