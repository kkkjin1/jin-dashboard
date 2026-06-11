-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1. 팀원 테이블
create table if not exists members (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  part text not null check (part in ('코어', '비즈')),
  created_at timestamp with time zone default now()
);

-- 2. 업무 테이블
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  part text not null check (part in ('코어', '비즈')),
  type text not null check (type in ('기획', '개선', '운영')),
  assignee_id uuid references members(id) on delete set null,
  status text not null default '진행필요' check (status in ('진행필요', '진행중', '완료')),
  start_date date,
  mid_date date,
  end_date date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 3. 맥락/노트 테이블
create table if not exists notes (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default now()
);

-- 4. 첨부파일 테이블
create table if not exists attachments (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('파일', '링크')),
  url text not null,
  created_at timestamp with time zone default now()
);

-- 5. RLS 비활성화 (단일 사용자 앱 — 앱 레벨 auth로 보호)
alter table members disable row level security;
alter table tasks disable row level security;
alter table notes disable row level security;
alter table attachments disable row level security;

-- 6. updated_at 자동 갱신 트리거
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();

-- 7. 팀원 초기 데이터
insert into members (name, part) values
  ('김다슬', '코어'),
  ('최도담', '코어'),
  ('강은정', '코어'),
  ('기윤미', '비즈'),
  ('채미소', '비즈'),
  ('장연희', '비즈'),
  ('이재아', '비즈'),
  ('정희영', '비즈'),
  ('최보명', '비즈'),
  ('여도현', '비즈'),
  ('문혜윤', '비즈')
on conflict do nothing;
