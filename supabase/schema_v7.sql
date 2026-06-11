-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마 v7
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1on1 sessions: 제목 컬럼 추가
alter table one_on_ones add column if not exists title text;

-- 학습자료: 태그 배열 + 매체 구분 추가
alter table learning_resources add column if not exists tags text[] default '{}';
alter table learning_resources add column if not exists media_type text;
