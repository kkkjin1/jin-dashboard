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
export const CONTENT_MAX_WIDTH = 720

// Writing Workspace(ReportEditorPanel) CENTER pane 안의 실제 "읽고 쓰는" content column
// 폭. CENTER pane 자체(flex-1)와는 별개 개념이다 — pane은 LEFT/RIGHT 사이 가용폭을 그대로
// 갖되, 그 안의 textarea/제목/직전 보고 블록은 이 폭에서 멈춘다. LEFT 바로 다음(컨테이너
// px-8=32px)에서 좌측 정렬로 시작하고, auto margin으로 가운데에 띄우지 않는다 — 남는
// 가변폭은 content 오른쪽, RIGHT 이전의 여백으로만 쌓인다. 1366~1440처럼 pane 폭이 이
// 값보다 좁으면 cap이 그냥 no-op이 된다.
export const WRITING_CONTENT_WIDTH = 880

// Archive 비교 그리드(전체 비교/주제 히스토리 공용) 컬럼 폭 — report가 몇 개든 "화면을
// 채우는 폭"이 아니라 "한 회차를 읽기 좋은 고정 폭"으로 설계한다. label 열은 sticky로
// 고정, report 열도 고정폭 × N개를 그대로 나열한다(grid-template-columns:
// `${LABEL}px repeat(N, ${REPORT}px)`, 그리드 자체를 width:fit-content로 둬서 stretch하지
// 않음) — report가 적으면 오른쪽이 비어도 되고, 많아지면 wrapper가 가로 스크롤된다.
export const ARCHIVE_LABEL_COL_WIDTH = 220
export const ARCHIVE_REPORT_COL_WIDTH = 380

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
