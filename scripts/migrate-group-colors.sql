-- objective_groups_v2.color → GROUP_COLORS 팔레트 마이그레이션
-- Supabase Dashboard > SQL Editor 에서 실행

-- 1. 실행 전 현재 상태 확인
SELECT id, name, sort_order, color FROM objective_groups_v2 ORDER BY sort_order;

-- 2. 색상 업데이트 (sort_order 순위 기반으로 GROUP_COLORS 매핑)
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (ORDER BY sort_order) - 1) % 7 AS idx
  FROM objective_groups_v2
)
UPDATE objective_groups_v2
SET color = CASE ranked.idx
  WHEN 0 THEN '#3B82F6'
  WHEN 1 THEN '#F59E0B'
  WHEN 2 THEN '#10B981'
  WHEN 3 THEN '#EF4444'
  WHEN 4 THEN '#8B5CF6'
  WHEN 5 THEN '#EC4899'
  WHEN 6 THEN '#9CA3AF'
END
FROM ranked
WHERE objective_groups_v2.id = ranked.id;

-- 3. 실행 후 결과 확인
SELECT id, name, sort_order, color FROM objective_groups_v2 ORDER BY sort_order;
