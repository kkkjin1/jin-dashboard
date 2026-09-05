// 업무보고 탭 공용 스타일 토큰 + 헬퍼. jin-dashboard의 기존 dark palette
// (perf-review/objective-review 등에서 쓰는 rgba(226,232,240,x) 톤)를 그대로 따른다.

export const S = {
  bg: '#0F1319',
  panel: '#11151D',
  card: 'rgba(255,255,255,0.04)',
  cardHover: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  t1: 'rgba(226,232,240,0.92)',
  t2: 'rgba(226,232,240,0.68)',
  t3: 'rgba(226,232,240,0.45)',
  t4: 'rgba(226,232,240,0.28)',
  accent: '#4C7FE0',
  accentDim: 'rgba(76,127,224,0.15)',
  accentBorder: 'rgba(76,127,224,0.28)',
  accentText: '#7EB3FF',
  danger: 'rgba(239,68,68,0.85)',
  r: '12px',
} as const

export const selectClass =
  'text-[12px] px-2.5 py-1.5 rounded-lg focus:outline-none [color-scheme:dark] [&>option]:bg-[#1A2030]'

export const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${S.border}`,
  color: S.t2,
}

export function fmtDateShort(date: string | null | undefined): string {
  if (!date) return '—'
  const [, m, d] = date.split('-')
  return `${parseInt(m)}.${parseInt(d)}`
}

export function fmtDateFull(date: string | null | undefined): string {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return `${y}.${String(parseInt(m)).padStart(2, '0')}.${String(parseInt(d)).padStart(2, '0')}`
}

export function fmtPeriodLabel(start: string, end: string): string {
  return `${fmtDateFull(start)} ~ ${fmtDateShort(end)}`
}

export function truncate(text: string, len: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length <= len) return clean
  return clean.slice(0, len) + '…'
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export type TopicChangeBadge = 'new' | 'updated' | 'unchanged'

export const BADGE_LABEL: Record<TopicChangeBadge, string> = {
  new: 'NEW',
  updated: '업데이트됨',
  unchanged: '변화 없음',
}

export const BADGE_COLOR: Record<TopicChangeBadge, string> = {
  new: '#4ADE80',
  updated: '#F5C247',
  unchanged: 'rgba(226,232,240,0.28)',
}
