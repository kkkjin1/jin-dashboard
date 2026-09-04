import type { AgendaPriority } from '@/types'

// 기존 페이지의 하드코딩 다크 팔레트를 그대로 재사용 — 새 색상값 추가 없이
// 이미 쓰이던 hex를 우선순위 의미에 맞게 재배치한다.
// P1: 기존 danger-zone 빨강(#F87171 / rgba(239,68,68,x)), P2: 기존 STATUS_DOT.hold 앰버(#F59E0B),
// P3: 기존 muted 텍스트 톤(rgba(226,232,240,x)).
export const PRIORITY_ORDER: AgendaPriority[] = ['P1', 'P2', 'P3']

export const PRIORITY_STYLE: Record<AgendaPriority, { bg: string; text: string; border: string; borderWidth: number }> = {
  P1: { bg: 'rgba(239,68,68,0.14)',  text: '#F87171', border: '#F87171',              borderWidth: 3 },
  P2: { bg: 'rgba(245,158,11,0.14)', text: '#F59E0B', border: '#F59E0B',              borderWidth: 2 },
  P3: { bg: 'rgba(226,232,240,0.1)', text: 'rgba(226,232,240,0.55)', border: 'rgba(255,255,255,0.14)', borderWidth: 1 },
}

export function priorityRank(p: AgendaPriority): number {
  return PRIORITY_ORDER.indexOf(p)
}
