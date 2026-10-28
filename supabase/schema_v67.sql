-- schema v67: adhoc reports (separate from work_reports, additive only)

CREATE TABLE IF NOT EXISTS public.adhoc_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date  date NOT NULL DEFAULT CURRENT_DATE,
  title        text NOT NULL DEFAULT '',
  audience     text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  result       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.adhoc_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.adhoc_reports;
CREATE POLICY "auth_all" ON public.adhoc_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS adhoc_reports_updated_at ON public.adhoc_reports;
CREATE TRIGGER adhoc_reports_updated_at
  BEFORE UPDATE ON public.adhoc_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_adhoc_reports_date
  ON public.adhoc_reports (report_date DESC);

-- autosave: allow entity_type 'adhoc_report' (v54 list + 1)
ALTER TABLE public.autosave_drafts DROP CONSTRAINT IF EXISTS autosave_drafts_entity_type_check;
ALTER TABLE public.autosave_drafts ADD CONSTRAINT autosave_drafts_entity_type_check
  CHECK (entity_type IN (
    'quick_memo','meeting','meeting_note','project_item',
    'agenda_sub_task','sub_task_note','agenda_group','task',
    'task_note','task_todo','annual_goal_item',
    'annual_goal_task','annual_goal_task_note',
    'annual_goal_category_label','objective',
    'objective_review','one_on_one','one_on_one_feedback',
    'one_on_one_template','perf_review','daily_journal',
    'persona_log','learning_resource','sketch_card',
    'sketch_frame','manual_achievement','user_setting',
    'user_preference','work_report','work_report_entry',
    'sketch_note_element','sketch_board','adhoc_report'
  ));

ALTER TABLE public.content_versions DROP CONSTRAINT IF EXISTS content_versions_entity_type_check;
ALTER TABLE public.content_versions ADD CONSTRAINT content_versions_entity_type_check
  CHECK (entity_type IN (
    'quick_memo','meeting','meeting_note','project_item',
    'agenda_sub_task','sub_task_note','agenda_group','task',
    'task_note','task_todo','annual_goal_item',
    'annual_goal_task','annual_goal_task_note',
    'annual_goal_category_label','objective',
    'objective_review','one_on_one','one_on_one_feedback',
    'one_on_one_template','perf_review','daily_journal',
    'persona_log','learning_resource','sketch_card',
    'sketch_frame','manual_achievement','user_setting',
    'user_preference','work_report','work_report_entry',
    'sketch_note_element','sketch_board','adhoc_report'
  ));
