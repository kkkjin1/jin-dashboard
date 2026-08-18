-- ============================================
-- v41: 연간목표 세부task ↔ 프로젝트(안건 매트릭스) 세부task 연동
-- '우선순위' 뷰(합의우선순위 1순위/2순위)에서 실제 실무 진행 중인
-- 프로젝트 세부task로 연결하기 위한 참조 컬럼. Supabase SQL 에디터에서 전체 실행
-- ============================================

alter table annual_goal_tasks
  add column if not exists linked_agenda_sub_task_id uuid references agenda_sub_tasks(id) on delete set null;

create index if not exists annual_goal_tasks_linked_agenda_sub_task_idx
  on annual_goal_tasks(linked_agenda_sub_task_id);
