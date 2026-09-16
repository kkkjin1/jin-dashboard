// 업무보고 탭 공용 스타일 토큰 + 헬퍼. jin-dashboard의 기존 dark palette
// (perf-review/objective-review 등에서 쓰는 rgba(226,232,240,x) 톤)를 그대로 따르되,
// Phase 2A부터는 globals.css의 --ink-rgb/--text-rgb(표면 틴트·텍스트의 raw RGB)를
// 통해 Light Theme에서도 자동으로 대응되도록 var() 참조로 구성한다. alpha(투명도)는
// 기존 값을 그대로 유지 — 값이 바뀌는 건 밝기(백/흑) 기준점 뿐이다.

export const S = {
  bg: 'var(--bg-page)',
  panel: 'var(--surface-panel)',
  card: 'rgba(var(--ink-rgb),0.04)',
  cardHover: 'rgba(var(--ink-rgb),0.06)',
  border: 'rgba(var(--ink-rgb),0.07)',
  borderStrong: 'rgba(var(--ink-rgb),0.12)',
  t1: 'rgba(var(--text-rgb),0.92)',
  t2: 'rgba(var(--text-rgb),0.68)',
  t3: 'rgba(var(--text-rgb),0.45)',
  t4: 'rgba(var(--text-rgb),0.28)',
  accent: 'var(--accent-primary)',
  accentDim: 'rgba(76,127,224,0.15)',
  accentBorder: 'rgba(76,127,224,0.28)',
  accentText: 'var(--accent-text)',
  danger: 'rgba(239,68,68,0.85)',
  r: '12px',
} as const

// "문서로 읽는" 화면(ReportDocument — 문서보기 모달/PT 문안 프리뷰) 전용 최대 폭이다.
// Writing Workspace(ReportEditorPanel)에는 더 이상 적용하지 않는다 — CENTER pane은
// LEFT/RIGHT 사이 가용 폭을 그대로 채워야 하고(Desktop IA), 이 상수를 그 영역에 쓰면
// ultra-wide에서 CENTER 오른쪽에 의미 없는 blank column이 생긴다.
export const CONTENT_MAX_WIDTH = 720

// Archive 비교 그리드(전체 비교/주제 히스토리 공용) — 첫 열(주제/섹션 라벨)은 sticky로
// 고정 폭, report 열은 이 최소 폭을 바닥으로 두고 남는 가로 공간을 나눠 채운다
// (grid-template-columns의 `repeat(N, minmax(REPORT, 1fr))`로 구현 — 열이 적으면 늘어나
// main 가용폭을 다 쓰고, 열이 많아지면 min-width에서 멈추고 wrapper가 가로 스크롤된다).
export const ARCHIVE_LABEL_COL_WIDTH = 200
export const ARCHIVE_REPORT_COL_MIN_WIDTH = 300

export const selectClass =
  'text-[12px] px-2.5 py-1.5 rounded-lg focus:outline-none [&>option]:bg-[var(--surface-elevated)]'

export const selectStyle: React.CSSProperties = {
  background: 'rgba(var(--ink-rgb),0.05)',
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

// "작성됨" 판정 — 헤더 진행률(6개 주제 · 4개 작성 · 2개 미작성)과 목차 dot(●/○/◉)이
// 동일 기준을 공유해야 두 표시가 서로 모순되지 않는다. working_memo는 "내 메모"일 뿐
// 보고 내용이 아니므로 의도적으로 기준에서 제외한다.
export function hasContent(text: string | null | undefined): boolean {
  return !!(text ?? '').trim()
}

export function isEntryWritten(entry: { report_text: string; executive_point: string; next_action: string }): boolean {
  return hasContent(entry.report_text) || hasContent(entry.executive_point) || hasContent(entry.next_action)
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
