-- ============================================
-- v45: one_on_one_template 다중 템플릿 지원
--
-- 배경: 지금까지 1on1 템플릿은 row 1개만 쓰는 걸 전제로 설계돼 있었는데
-- (schema_v4.sql 주석 "row 1개만 사용"), 상황별로 여러 템플릿(정기 1on1용,
-- 신규입사자 온보딩용, 성과 이슈 논의용 등)을 만들어 골라 쓸 수 있어야 한다는
-- 요청이 있었다. title 컬럼을 추가해 템플릿을 구분한다.
--
-- 기존 단일 row는 title 기본값('새 템플릿')으로 채워진 뒤 '기본 템플릿'으로
-- 다시 한 번 바꿔준다(WHERE 조건이 있어 재실행해도 다른 템플릿 제목을 덮어쓰지
-- 않음). Supabase SQL 에디터에서 그대로 실행.
-- ============================================

ALTER TABLE one_on_one_template ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '새 템플릿';

UPDATE one_on_one_template SET title = '기본 템플릿' WHERE title = '새 템플릿';

-- 템플릿이 여러 개가 되면서 개별 삭제가 필요해짐 — 기존엔 단일 row라 DELETE를
-- 안 열어뒀다(schema_v4.sql GRANT 주석 참고).
GRANT DELETE ON TABLE one_on_one_template TO authenticated;
