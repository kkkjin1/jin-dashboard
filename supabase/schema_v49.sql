-- v49: test-practice PoC (테스트실무)
-- 목적: 연간목표 1~3단계(annual_goal_items -> annual_goal_tasks)를 그대로 참조해서
-- 4단계 "실행 TASK"만 새로 저장하는 별도 테이블. agenda_*/annual_goal_* 구조는 무변경.
-- 최소 필드 원칙 — notes/attachments 연동은 이번 PoC 검증에 불필요해 제외.

CREATE TABLE IF NOT EXISTS public.test_practice_tasks (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  annual_goal_task_id  uuid NOT NULL REFERENCES public.annual_goal_tasks(id) ON DELETE CASCADE,
  title                text NOT NULL,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hold', 'done')),
  assignee_id          uuid REFERENCES public.members(id) ON DELETE SET NULL,
  start_date           date,
  due_date             date,
  description          text,
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE public.test_practice_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.test_practice_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER test_practice_tasks_updated_at
  BEFORE UPDATE ON public.test_practice_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_test_practice_tasks_goal_task
  ON public.test_practice_tasks (annual_goal_task_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_test_practice_tasks_assignee
  ON public.test_practice_tasks (assignee_id);
