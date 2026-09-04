-- v50: 테스트실무 전용 우선순위(P1/P2/P3) — annual_goal_tasks.agreed_priority와 완전히 분리
-- 배경: agreed_priority는 이미 /annual-goals 화면에서 정렬(priorityComparator)·필터(우선순위 뷰)
-- 기준으로 실사용 중이다. 테스트실무에서 P1/P2/P3를 바꿔도 그 화면에 영향을 주면 안 되므로,
-- annual_goal_tasks는 이번에도 무변경 원칙을 유지하고 별도 1:1 매핑 테이블만 추가한다.

CREATE TABLE IF NOT EXISTS public.test_practice_agenda_priority (
  annual_goal_task_id  uuid PRIMARY KEY REFERENCES public.annual_goal_tasks(id) ON DELETE CASCADE,
  priority              text NOT NULL DEFAULT 'P3' CHECK (priority IN ('P1', 'P2', 'P3')),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.test_practice_agenda_priority ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.test_practice_agenda_priority
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER test_practice_agenda_priority_updated_at
  BEFORE UPDATE ON public.test_practice_agenda_priority
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_test_practice_agenda_priority_priority
  ON public.test_practice_agenda_priority (priority);

-- 기존 annual_goal_tasks 전체에 P3 기본값 매핑 row를 미리 만들어 데이터 상태를 명확히 한다.
-- (화면 로직 자체는 매핑 row가 없어도 P3로 간주하도록 구현하므로 이 backfill은 필수는 아님)
INSERT INTO public.test_practice_agenda_priority (annual_goal_task_id)
SELECT id FROM public.annual_goal_tasks
ON CONFLICT (annual_goal_task_id) DO NOTHING;
