-- ============================================================
-- v52: 업무보고(work-report) 탭 — canonical 3 tables
--
-- 목적: 격주 경영진 정기보고를 매번 새로 작성하지 않고, 동일한 업무 주제를
-- report(보고 회차)와 분리해 계속 이어서 갱신할 수 있게 한다.
--
-- 핵심 원칙: "보고서"와 "주제"를 분리한다.
--   work_report_topics  — 업무 주제 master. history를 위해 실제 삭제하지 않고 archive만 함.
--   work_reports        — 격주 보고서 1건(핵심요약/이슈/다음단계 + 기간 + 상태).
--   work_report_entries — 특정 report에서 특정 topic에 무엇을 보고했는지(N:M 연결 레코드).
--                          과거 final report의 entry는 topic이 나중에 수정돼도 절대 변하지 않는다
--                          (entry가 그 시점 보고 내용의 스냅샷 그 자체이기 때문 — topic은 연결고리일 뿐).
--
-- 다른 canonical 테이블과 동일하게 owner 컬럼 없는 조직 공용 데이터로 취급하고
-- (schema_v49.sql의 test_practice_tasks와 동일한 convention), 기존
-- "TO authenticated USING (true) WITH CHECK (true)" RLS 패턴을 그대로 적용한다.
--
-- 이 파일은 PRODUCTION Supabase에 아직 적용되지 않았다 — 검토 후 수동 실행할 것.
-- ============================================================

-- ============================================================
-- 1. work_report_topics — 업무 주제 master
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_report_topics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

ALTER TABLE public.work_report_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.work_report_topics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER work_report_topics_updated_at
  BEFORE UPDATE ON public.work_report_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_work_report_topics_status
  ON public.work_report_topics (status);


-- ============================================================
-- 2. work_reports — 격주 보고서
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  summary       text NOT NULL DEFAULT '',
  issues        text NOT NULL DEFAULT '',
  next_steps    text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  finalized_at  timestamptz
);

ALTER TABLE public.work_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.work_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER work_reports_updated_at
  BEFORE UPDATE ON public.work_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_work_reports_period
  ON public.work_reports (period_start);


-- ============================================================
-- 3. work_report_entries — report x topic 연결 레코드 (핵심 테이블)
--    과거 report의 entry는 그 report_id/topic_id에 영구히 귀속되는 스냅샷이며,
--    이후 topic 제목이 바뀌어도 이 row의 report_text 등은 변하지 않는다.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_report_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id             uuid NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  topic_id              uuid NOT NULL REFERENCES public.work_report_topics(id) ON DELETE CASCADE,
  sort_order            integer NOT NULL DEFAULT 0,
  -- 이 entry가 생성된 시점(또는 draft 상태에서 topic이 rename된 시점)의 topic 제목 스냅샷.
  -- work_report_topics.title은 언제든 바뀔 수 있는 master 값이라, final 처리된 report의
  -- 화면(전체보기/기간 matrix/이번 보고 목차 등 "당시 보고 내용"을 보여주는 곳)이 나중에
  -- topic 제목이 바뀌어도 절대 변하면 안 되므로 이 컬럼을 별도로 둔다.
  topic_title_snapshot  text NOT NULL DEFAULT '',
  report_text           text NOT NULL DEFAULT '',
  executive_point       text NOT NULL DEFAULT '',
  next_action           text NOT NULL DEFAULT '',
  working_memo          text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_report_entries_unique_topic UNIQUE (report_id, topic_id)
);

ALTER TABLE public.work_report_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.work_report_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER work_report_entries_updated_at
  BEFORE UPDATE ON public.work_report_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_work_report_entries_report
  ON public.work_report_entries (report_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_work_report_entries_topic
  ON public.work_report_entries (topic_id, created_at);


-- ============================================================
-- 4. autosave_drafts / content_versions — entity_type CHECK 확장
--
-- 이 화면은 src/hooks/useAutosave.ts(기존 공용 autosave core)를 그대로 재사용한다.
-- 두 테이블 모두 entity_type에 인라인 CHECK 제약이 걸려 있어(autosave-migration-v1.sql),
-- 'work_report'/'work_report_entry' 값을 쓰려면 그 CHECK를 새 목록으로 교체해야 한다.
--
-- 제약 이름이 실제로 autosave_drafts_entity_type_check /
-- content_versions_entity_type_check 인지 프로덕션에서 검증되지 않았으므로,
-- 이름에 의존하지 않고 entity_type을 검사하는 CHECK 제약을 pg_constraint에서
-- 찾아 동적으로 DROP한 뒤 새 CHECK를 추가한다.
-- ============================================================

DO $$
DECLARE
  cons record;
BEGIN
  FOR cons IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.autosave_drafts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.autosave_drafts DROP CONSTRAINT %I', cons.conname);
  END LOOP;
END $$;

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
    'user_preference','work_report','work_report_entry'
  ));

DO $$
DECLARE
  cons record;
BEGIN
  FOR cons IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.content_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.content_versions DROP CONSTRAINT %I', cons.conname);
  END LOOP;
END $$;

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
    'user_preference','work_report','work_report_entry'
  ));

-- ============================================================
-- 적용 후 확인:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('public.autosave_drafts'::regclass, 'public.content_versions'::regclass)
--     AND contype = 'c';
-- ============================================================
