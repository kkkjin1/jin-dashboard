-- v59: 연도별 목표 계획(YEAR x GOAL) + 프로젝트 ↔ 연도계획 연결
-- 배경: 연간목표를 PLAN 전용(영역 > 목표)으로 단순화하고, 목표의 우선순위를 연도별로 분리한다.
--       annual_goal_items는 장기 유지되는 HR Master이므로 priority를 items에 직접 두지 않는다.
-- 목적: 1) annual_goal_year_plans — (year, 목표)별 우선순위 1건
--       2) agenda_items.annual_goal_year_plan_id — 프로젝트(안건)가 어떤 연도 계획에서 파생됐는지(nullable)
--          값 있음 = 목표 연계 실무, NULL = 일반 실무
-- 원칙: additive only. 기존 annual_goal_* / agenda_* 행은 UPDATE/DELETE 하지 않는다.
--       초기 year plan 행은 넣지 않는다(기존 agreed_priority 등에서 추론 금지 — 사용자가 직접 판단).

-- 1. annual_goal_year_plans
CREATE TABLE IF NOT EXISTS public.annual_goal_year_plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year                 integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  annual_goal_item_id  uuid NOT NULL REFERENCES public.annual_goal_items(id) ON DELETE CASCADE,
  priority             text NOT NULL CHECK (priority IN ('excluded', 'normal', 'important', 'critical')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annual_goal_year_plans_year_item_uniq UNIQUE (year, annual_goal_item_id)
);

CREATE INDEX IF NOT EXISTS idx_annual_goal_year_plans_item ON public.annual_goal_year_plans (annual_goal_item_id);

ALTER TABLE public.annual_goal_year_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON public.annual_goal_year_plans;
CREATE POLICY "auth_all" ON public.annual_goal_year_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS annual_goal_year_plans_updated_at ON public.annual_goal_year_plans;
CREATE TRIGGER annual_goal_year_plans_updated_at BEFORE UPDATE ON public.annual_goal_year_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. agenda_items.annual_goal_year_plan_id (프로젝트 출처)
ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS annual_goal_year_plan_id uuid NULL
  REFERENCES public.annual_goal_year_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_items_year_plan ON public.agenda_items (annual_goal_year_plan_id);
