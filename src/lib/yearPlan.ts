import type { YearPlanPriority } from '@/types'

// v59 연도계획(annual_goal_year_plans) 공용 상수 — 연간목표(PLAN)와 프로젝트(EXECUTION) 양쪽에서 쓴다.
// 행이 없는 목표는 "미설정"으로 보여주고, 기존 agreed_priority 등에서 추론하지 않는다.
export const YEAR_PLAN_PRIORITIES: YearPlanPriority[] = ['critical', 'important', 'normal', 'excluded']

export const YEAR_PLAN_LABEL: Record<YearPlanPriority, string> = {
  critical: '최우선',
  important: '중요',
  normal: '일반',
  excluded: '제외',
}

// GlassSelect dot 색 — 기존 우선순위 팔레트(PRIORITY_OPTIONS/PRIORITY_STYLE)에서 쓰던 hex를 재사용
export const YEAR_PLAN_COLOR: Record<YearPlanPriority, string> = {
  critical: '#F87171',
  important: '#F59E0B',
  normal: '#3B82F6',
  excluded: '#6B7280',
}

export const YEAR_PLAN_OPTIONS = YEAR_PLAN_PRIORITIES.map(p => ({ value: p, label: YEAR_PLAN_LABEL[p], color: YEAR_PLAN_COLOR[p] }))

// 제외·미설정 목표에는 프로젝트를 만들지 않는다(연도계획의 "프로젝트 후보"만).
export function canCreateProject(priority: YearPlanPriority | null | undefined): boolean {
  return !!priority && priority !== 'excluded'
}

export function catLabel(cat: string, labels?: Record<string, string>): string {
  return labels?.[cat] ?? cat.replace(/^\d+\.\s*/, '')
}

/** "2027 · 인재 확보 > 인력계획 · 최우선" — 목표 연계 프로젝트의 출처 표기 */
export function yearPlanSourceLabel(
  plan: { year: number; priority: YearPlanPriority },
  item: { category: string; title: string } | null | undefined,
  labels?: Record<string, string>,
): string {
  const goal = item ? `${catLabel(item.category, labels)} > ${item.title}` : '(삭제된 목표)'
  return `${plan.year} · ${goal} · ${YEAR_PLAN_LABEL[plan.priority]}`
}
