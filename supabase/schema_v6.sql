-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마 v6
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- meetings: 구분 카테고리 컬럼 추가
alter table meetings add column if not exists category text
  check (category in ('코어', '비즈', '경영진', '본부장', '타팀'));
