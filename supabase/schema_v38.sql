-- ============================================
-- v38: 홈 타임라인 업무 일정 (schedule_items)
-- 특정 Task/안건에 종속되지 않는, 홈 "오늘의 타임라인" 업무 레인 전용
-- 가벼운 일정 블록. Supabase SQL 에디터에서 전체 실행
-- ============================================

create table if not exists schedule_items (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  item_date       date not null,
  start_hour      double precision not null default 9,
  duration_hours  double precision not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists schedule_items_item_date_idx on schedule_items(item_date);

-- updated_at 자동 갱신 트리거 — update_updated_at() 함수는 schema.sql/schema_v2.sql에 이미 정의됨
create trigger trg_schedule_items_updated_at
  before update on schedule_items
  for each row execute function update_updated_at();

alter table schedule_items enable row level security;
create policy "auth_all" on schedule_items for all to authenticated using (true) with check (true);
