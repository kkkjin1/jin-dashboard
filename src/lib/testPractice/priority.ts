import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgendaPriority } from '@/types'

const DEFAULT_PRIORITY: AgendaPriority = 'P3'

// annual_goal_tasks.agreed_priority는 손대지 않는다 — 이 모듈은 test_practice_agenda_priority
// 매핑 테이블만 다룬다. 매핑 row가 없는 안건은 화면에서 P3로 간주한다.
export async function fetchAgendaPriorities(
  supabase: SupabaseClient,
  annualGoalTaskIds: string[]
): Promise<Record<string, AgendaPriority>> {
  const map: Record<string, AgendaPriority> = {}
  if (annualGoalTaskIds.length === 0) return map

  const { data } = await supabase
    .from('test_practice_agenda_priority')
    .select('annual_goal_task_id, priority')
    .in('annual_goal_task_id', annualGoalTaskIds)

  ;(data ?? []).forEach(row => { map[row.annual_goal_task_id] = row.priority as AgendaPriority })
  annualGoalTaskIds.forEach(id => { if (!(id in map)) map[id] = DEFAULT_PRIORITY })
  return map
}

export async function setAgendaPriority(
  supabase: SupabaseClient,
  annualGoalTaskId: string,
  priority: AgendaPriority
): Promise<boolean> {
  const { error } = await supabase
    .from('test_practice_agenda_priority')
    .upsert({ annual_goal_task_id: annualGoalTaskId, priority }, { onConflict: 'annual_goal_task_id' })
  if (error) { console.error('[테스트실무] 우선순위 저장 실패:', error.message); return false }
  return true
}
