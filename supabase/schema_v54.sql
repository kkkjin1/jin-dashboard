-- ============================================================
-- v54: 자유노트 - 캔버스(화이트보드)에서 문서형으로 전환
--
-- 배경: 자유노트를 열면 커서가 바로 깜빡이며 타이핑되는 문서(위에서 아래로 흐르는
-- 한 개의 본문)를 원함. 이미지/포스트잇 박스는 그 위에 자유롭게 뜨는
-- 오버레이로만 남고, 회전(자유 회전 핸들)이 추가된다.
--
--   - sketch_boards.note_body  : 자유노트 문서 본문(HTML). 기존 sketch_note_elements의
--                                 'text' 타입 요소를 대체한다.
--   - sketch_note_elements.type: 'text' 제거, 'image' | 'box'만 남음.
--   - sketch_note_elements.rotation: 오버레이 자유 회전(도, deg). 신규.
--
-- 기존 자유노트 보드에 만들어둔 text 요소는 새 구조로 옮길 방법이 없어
-- 삭제한다(사용자 확인 완료, 2026-09-10).
--
-- 이 파일은 PRODUCTION Supabase에 아직 적용되지 않았다. 검토 후 수동 실행할 것.
-- ============================================================

-- ============================================================
-- 1. sketch_boards.note_body
-- ============================================================
ALTER TABLE public.sketch_boards
  ADD COLUMN IF NOT EXISTS note_body text NOT NULL DEFAULT '';

-- ============================================================
-- 2. sketch_note_elements: text 타입 제거, rotation 추가
-- ============================================================
DELETE FROM public.sketch_note_elements WHERE type = 'text';

DO $droptype$
DECLARE
  cons record;
BEGIN
  FOR cons IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.sketch_note_elements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.sketch_note_elements DROP CONSTRAINT %I', cons.conname);
  END LOOP;
END $droptype$;

ALTER TABLE public.sketch_note_elements
  ADD CONSTRAINT sketch_note_elements_type_check CHECK (type IN ('image', 'box'));

ALTER TABLE public.sketch_note_elements
  ADD COLUMN IF NOT EXISTS rotation double precision NOT NULL DEFAULT 0;

-- ============================================================
-- 3. autosave_drafts / content_versions: entity_type CHECK에
--    'sketch_board' 추가 (문서 본문 note_body의 autosave용)
-- ============================================================
DO $dropautosave$
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
END $dropautosave$;

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
    'sketch_note_element','sketch_board'
  ));

DO $dropversions$
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
END $dropversions$;

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
    'sketch_note_element','sketch_board'
  ));

-- ============================================================
-- 적용 후 확인:
--   SELECT id, name, length(note_body) FROM public.sketch_boards WHERE board_type = 'freenote';
--   SELECT type, count(*) FROM public.sketch_note_elements GROUP BY type;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('public.sketch_note_elements'::regclass,
--     'public.autosave_drafts'::regclass, 'public.content_versions'::regclass)
--     AND contype = 'c';
-- ============================================================
