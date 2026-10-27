// 안건 상세 B "기획 기록" 박스 색 — agenda_sub_tasks.color에 키로 저장, null = 유리(기본).
// 라이트/다크 둘 다 자연스럽도록 배경·테두리는 반투명, 점(dot)만 진한 색. 보라 계열 제외.
export const PLAN_BOX_COLORS = {
  sky:   { label: '하늘', dot: '#4C82E0', bg: 'rgba(76,130,224,0.10)',  line: 'rgba(76,130,224,0.28)' },
  mint:  { label: '민트', dot: '#2FA37A', bg: 'rgba(47,163,122,0.10)',  line: 'rgba(47,163,122,0.28)' },
  peach: { label: '피치', dot: '#E27B4E', bg: 'rgba(226,123,78,0.10)',  line: 'rgba(226,123,78,0.28)' },
  lemon: { label: '레몬', dot: '#D4A515', bg: 'rgba(212,165,21,0.12)',  line: 'rgba(212,165,21,0.32)' },
  aqua:  { label: '아쿠아', dot: '#2E9BA6', bg: 'rgba(46,155,166,0.10)', line: 'rgba(46,155,166,0.28)' },
  coral: { label: '코랄', dot: '#E0675A', bg: 'rgba(224,103,90,0.10)',  line: 'rgba(224,103,90,0.28)' },
  sand:  { label: '모래', dot: '#C9965A', bg: 'rgba(201,150,90,0.12)',  line: 'rgba(201,150,90,0.30)' },
  gray:  { label: '회색', dot: '#8A919C', bg: 'rgba(138,145,156,0.12)', line: 'rgba(138,145,156,0.30)' },
} as const

export type PlanBoxColorKey = keyof typeof PLAN_BOX_COLORS
export const PLAN_BOX_COLOR_KEYS = Object.keys(PLAN_BOX_COLORS) as PlanBoxColorKey[]

export function planBoxColor(key: string | null | undefined) {
  return key && key in PLAN_BOX_COLORS ? PLAN_BOX_COLORS[key as PlanBoxColorKey] : null
}
