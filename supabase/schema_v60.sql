-- schema v60: annual_goal_year_plans schedule
-- additive only. existing rows keep NULL.

ALTER TABLE public.annual_goal_year_plans
  ADD COLUMN IF NOT EXISTS start_date date NULL,
  ADD COLUMN IF NOT EXISTS end_date   date NULL;

NOTIFY pgrst, 'reload schema';
