-- ============================================
-- v48: sketch_cards.font_size — 카드별 텍스트 크기 조절 기능
--
-- 배경: 생각스케치 카드 내부 글씨 크기를 카드별로 확대/축소(A-/A+)할 수 있게
-- 하면서, 값을 카드 속성으로 영속화한다.
--
-- null이면 프론트(SketchCanvas.tsx DEFAULT_FONT_SIZE = 12.5)가 기존 디자인과
-- 동일한 기본 크기를 적용한다 — 기존 카드/데이터는 전부 null로 남아 영향 없음.
--
-- nullable 컬럼 추가뿐이라 기존 데이터/쿼리에는 영향 없음. Supabase SQL 에디터에서
-- 그대로 실행.
-- ============================================

ALTER TABLE sketch_cards ADD COLUMN IF NOT EXISTS font_size numeric;

COMMENT ON COLUMN sketch_cards.font_size IS
  'null = 기본 크기(12.5px, 프론트 DEFAULT_FONT_SIZE), 그 외 카드별 지정 px 값';
