// 일정 탭 고정회의(user_settings 'meeting_schedules')의 반복 규칙 판정 — 일정 탭·홈·회의 브리프가 같은 규칙을 쓴다.

export interface MeetingRecurrence {
  is_recurring: boolean
  recur_type?: 'weekly' | 'monthly'  // 없으면 'weekly' (하위호환)
  days_of_week?: number[]            // weekly: 0=일 ~ 6=토
  day_of_month?: number              // monthly: 1~31, 해당 월 말일 초과 시 말일로
  start_date?: string                // 반복 시작일 (없으면 제한 없음)
  repeat_until?: string              // 반복 종료일 (없으면 무한)
  date?: string                      // 단발성일 때 날짜
}

/** dateStr(YYYY-MM-DD)에 이 고정회의가 열리는가 */
export function scheduleOccursOn(s: MeetingRecurrence, dateStr: string): boolean {
  if (!s.is_recurring) return s.date === dateStr
  if (s.start_date && dateStr < s.start_date) return false
  if (s.repeat_until && dateStr > s.repeat_until) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  if (s.recur_type === 'monthly') {
    const dim = new Date(y, m, 0).getDate()
    return d === Math.min(s.day_of_month ?? 1, dim)
  }
  return (s.days_of_week ?? []).includes(new Date(y, m - 1, d).getDay())
}
