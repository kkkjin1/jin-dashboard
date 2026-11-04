-- schema_v72: 팀원관찰 메모 (2026-11-04)
-- quick_memos에 관찰 대상 팀원(여러 명)과 종류(칭찬/개선) 칸 추가. 기존 메모는 빈 값 그대로.
-- 다시 실행해도 안전.

alter table public.quick_memos add column if not exists observed_member_ids uuid[] not null default '{}';
alter table public.quick_memos add column if not exists observation_kind text;

alter table public.quick_memos drop constraint if exists quick_memos_observation_kind_check;
alter table public.quick_memos add constraint quick_memos_observation_kind_check
  check (observation_kind is null or observation_kind in ('칭찬', '개선'));

create index if not exists idx_quick_memos_observed_members
  on public.quick_memos using gin (observed_member_ids);

-- 확인
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'quick_memos'
  and column_name in ('observed_member_ids', 'observation_kind');
