-- ============================================
-- v41: agenda_sub_tasks에 tags 컬럼 추가
-- 세부task ↔ 학습자료 태그 연계
-- Supabase SQL 에디터에서 실행
-- ============================================

alter table agenda_sub_tasks
  add column if not exists tags text[] not null default '{}';

create index if not exists agenda_sub_tasks_tags_idx
  on agenda_sub_tasks using gin(tags);
