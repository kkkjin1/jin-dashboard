-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마 v8
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- tasks.part 에 '개인' 값 허용
alter table tasks drop constraint if exists tasks_part_check;
alter table tasks add constraint tasks_part_check
  check (part in ('코어', '비즈', '팀장', '개인'));
