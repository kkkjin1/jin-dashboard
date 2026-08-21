-- ============================================
-- v44: sketch_edges.kind — Tab 자식-생성 기능의 위계 연결 표시용 컬럼
--
-- 배경: 생각스케치 캔버스에 "카드 선택 후 Tab → 자식 카드 자동 생성" 기능을
-- 추가하면서, Tab으로 만든 부모→자식 엣지를 드래그로 만든 수동 연결과 나중에
-- 구분(예: 위계 연결만 다른 선 스타일로 표시)할 수 있게 여지를 남겨둔다.
--
-- 지금 당장은 아무 스타일도 다르게 그리지 않는다 — 프론트는 kind 값을 Edge.data로
-- 그대로 실어 보내기만 하고(SketchCanvas.tsx edgeFromRow), Tab으로 만든 엣지에만
-- kind='hierarchy'를 채운다. 기존 수동 연결 로우들은 전부 NULL로 남는다(=수동).
--
-- nullable 컬럼 추가뿐이라 기존 데이터/쿼리에는 영향 없음. Supabase SQL 에디터에서
-- 그대로 실행.
-- ============================================

ALTER TABLE sketch_edges ADD COLUMN IF NOT EXISTS kind text;

COMMENT ON COLUMN sketch_edges.kind IS
  'null = 드래그로 만든 수동 연결, ''hierarchy'' = Tab으로 만든 부모→자식 연결';
