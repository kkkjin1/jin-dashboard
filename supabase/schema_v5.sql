-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마 v5
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1. notes: 수정 일시 컬럼 추가
alter table notes add column if not exists edited_at timestamp with time zone;
