-- ============================================
-- v40: 즉석 할일 (quick_todos)
-- 홈 "오늘 업무"에서 프로젝트/안건에 속하지 않고 즉석으로 추가하는 가벼운 할일.
-- "일정" 탭(schedule)에서도 날짜별로 조회·추가 가능. Supabase SQL 에디터에서 전체 실행
-- ============================================

create table if not exists quick_todos (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  target_date  date not null,
  done         boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists quick_todos_target_date_idx on quick_todos(target_date);

-- updated_at 자동 갱신 트리거 — update_updated_at() 함수는 schema.sql/schema_v2.sql에 이미 정의됨
create trigger trg_quick_todos_updated_at
  before update on quick_todos
  for each row execute function update_updated_at();

alter table quick_todos enable row level security;
create policy "auth_all" on quick_todos for all to authenticated using (true) with check (true);
