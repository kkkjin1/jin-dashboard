-- ============================================================
-- v55: 자유노트 — 마인드맵 카드 + 표 카드
--
-- 목적: B안(포스트잇처럼 놓는 카드 한 종류) 목업에서 검증된 두 가지 카드 타입을
--   sketch_note_elements에 추가한다.
--
--   - mindmap: 자유노트 위에 놓는 "마인드맵 카드". content 컬럼에 자식
--     sketch_boards.id(board_type='mindmap')를 저장한다 — 카드 자체는 읽기전용
--     미리보기이고, 실제 편집은 그 자식 보드를 기존 SketchCanvas로 그대로 연다.
--     sketch_boards.parent_board_id가 그 자식 보드를 가리키며, 목록 화면
--     (SketchBoardList)에서는 parent_board_id가 있는 보드를 숨긴다.
--   - table: 셀 편집 · 행/열 추가삭제 · 열 너비 조절을 지원하는 엑셀형 표.
--     table_data(jsonb)에 { headerRow, transparentBg, colWidths, rows } 형태로
--     저장한다. content 컬럼은 표 타입에서는 미사용.
--
-- 이 파일은 PRODUCTION Supabase에 아직 적용되지 않았다 — 검토 후 수동 실행할 것.
-- ============================================================

-- ============================================================
-- 1. sketch_note_elements.type — 'mindmap' | 'table' 추가
-- ============================================================
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
  ADD CONSTRAINT sketch_note_elements_type_check CHECK (type IN ('image', 'box', 'mindmap', 'table'));

-- ============================================================
-- 2. sketch_note_elements.table_data — 표 카드 전용 구조 데이터
--    { headerRow: boolean, transparentBg: boolean, colWidths: number[], rows: string[][] }
--    mindmap/image/box 타입에서는 null.
-- ============================================================
ALTER TABLE public.sketch_note_elements
  ADD COLUMN IF NOT EXISTS table_data jsonb;

-- ============================================================
-- 3. sketch_boards.parent_board_id — 마인드맵 카드가 가리키는 자식 보드
--    부모 보드(자유노트) 삭제 시 자식 마인드맵 보드도 함께 삭제된다.
--    목록 화면은 parent_board_id가 NULL인 보드만 보여준다.
-- ============================================================
ALTER TABLE public.sketch_boards
  ADD COLUMN IF NOT EXISTS parent_board_id uuid REFERENCES public.sketch_boards(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sketch_boards_parent_board_id
  ON public.sketch_boards (parent_board_id);

-- ============================================================
-- 적용 후 확인:
--   SELECT type, count(*) FROM public.sketch_note_elements GROUP BY type;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.sketch_note_elements'::regclass AND contype = 'c';
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'sketch_boards' AND column_name = 'parent_board_id';
-- ============================================================
