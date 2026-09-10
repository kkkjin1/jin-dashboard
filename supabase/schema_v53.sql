-- ============================================================
-- v53: 생각스케치 — 보드 타입(마인드맵/자유노트) + 자유노트 요소 테이블
--
-- 목적: 생각스케치 보드 생성 시 두 가지 타입 중 선택할 수 있게 한다.
--   - mindmap  : 기존 박스형 마인드맵(sketch_cards/sketch_frames/sketch_edges) 그대로.
--   - freenote : 새 무한 캔버스. 텍스트(배경 유무 선택 가능)/이미지(붙여넣기,
--                리사이즈)/박스(단순 사각 도형)를 자유 배치. 카드-카드 연결선,
--                프레임 그룹핑(자식 reparenting)은 이 타입에 없음 — 필요해지면
--                별도 후속 작업.
--
-- 보드 타입은 생성 시 고정이며 이후 전환 UI는 제공하지 않는다(두 타입의 데이터
-- 구조가 서로 다르기 때문).
--
-- 이 파일은 PRODUCTION Supabase에 아직 적용되지 않았다 — 검토 후 수동 실행할 것.
-- ============================================================

-- ============================================================
-- 1. sketch_boards.board_type
-- ============================================================
ALTER TABLE public.sketch_boards
  ADD COLUMN IF NOT EXISTS board_type text NOT NULL DEFAULT 'mindmap'
    CHECK (board_type IN ('mindmap', 'freenote'));

-- ============================================================
-- 2. sketch_note_elements — 자유노트 요소(텍스트/이미지/박스)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sketch_note_elements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid NOT NULL REFERENCES public.sketch_boards(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('text', 'image', 'box')),
  -- text: contentEditable HTML. image: Supabase Storage(attachments 버킷) public URL. box: 미사용.
  content         text NOT NULL DEFAULT '',
  -- text: 배경을 켰을 때의 카드 색(CATEGORY_PALETTE 키). box: 테두리/채우기 색. image: 미사용.
  color           text NOT NULL DEFAULT 'blue',
  -- text 전용 — false면 배경 없는 투명 텍스트, true면 카드형(배경 있는) 텍스트.
  has_background  boolean NOT NULL DEFAULT false,
  position_x      double precision NOT NULL DEFAULT 0,
  position_y      double precision NOT NULL DEFAULT 0,
  width           double precision NOT NULL DEFAULT 220,
  height          double precision NOT NULL DEFAULT 120,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sketch_note_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.sketch_note_elements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER sketch_note_elements_updated_at
  BEFORE UPDATE ON public.sketch_note_elements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_sketch_note_elements_board_id
  ON public.sketch_note_elements (board_id);

-- ============================================================
-- 3. autosave_drafts / content_versions — entity_type CHECK 확장
--    자유노트 텍스트 요소도 sketch_card/sketch_frame과 동일하게
--    useAutosave(텍스트 필드 우선 STEP 패턴)를 재사용한다.
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
    'user_preference','work_report','work_report_entry',
    'sketch_note_element'
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
    'user_preference','work_report','work_report_entry',
    'sketch_note_element'
  ));

-- ============================================================
-- 적용 후 확인:
--   SELECT board_type, count(*) FROM public.sketch_boards GROUP BY board_type;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('public.autosave_drafts'::regclass, 'public.content_versions'::regclass)
--     AND contype = 'c';
-- ============================================================
