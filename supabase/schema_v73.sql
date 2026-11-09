-- schema_v73: 학습자료 책장 보기 (2026-11-09)
-- learning_resources에 책 기록용 칸 추가. 기존 자료는 빈 값 그대로, 다른 화면 영향 없음.
-- 상태(읽을/읽는 중/완독)는 기존처럼 tags의 _doing/_done을 그대로 쓴다.
-- 다시 실행해도 안전.

alter table public.learning_resources add column if not exists author text not null default '';
alter table public.learning_resources add column if not exists rating smallint;
alter table public.learning_resources add column if not exists finished_at date;
alter table public.learning_resources add column if not exists progress smallint;
alter table public.learning_resources add column if not exists takeaway text not null default '';
alter table public.learning_resources add column if not exists reason text not null default '';
alter table public.learning_resources add column if not exists quotes jsonb not null default '[]'::jsonb;
alter table public.learning_resources add column if not exists applies jsonb not null default '[]'::jsonb;
alter table public.learning_resources add column if not exists linked_agenda_ids uuid[] not null default '{}';

alter table public.learning_resources drop constraint if exists learning_resources_rating_check;
alter table public.learning_resources add constraint learning_resources_rating_check
  check (rating is null or rating between 1 and 5);

alter table public.learning_resources drop constraint if exists learning_resources_progress_check;
alter table public.learning_resources add constraint learning_resources_progress_check
  check (progress is null or progress between 0 and 100);

-- 확인
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'learning_resources'
  and column_name in ('author', 'rating', 'finished_at', 'progress', 'takeaway', 'reason', 'quotes', 'applies', 'linked_agenda_ids');
