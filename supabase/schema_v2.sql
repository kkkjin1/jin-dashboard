-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마 v2
-- 추가 테이블: quick_memos, meetings, learning_resources
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1. 빠른 메모 테이블
create table if not exists quick_memos (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null default '',
  tag text not null default '업무관련' check (tag in ('업무관련', '회의관련', '아이디어')),
  created_at timestamp with time zone default now()
);

-- 2. 회의록 테이블
--    notes: jsonb 배열 [{title, content, created_at}]
create table if not exists meetings (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  meeting_date date,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 3. 학습자료 테이블
--    notes: jsonb 배열 [{title, content, created_at}]
create table if not exists learning_resources (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  source text not null default '',
  notes jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 4. RLS 비활성화
alter table quick_memos disable row level security;
alter table meetings disable row level security;
alter table learning_resources disable row level security;

-- 5. updated_at 자동 갱신 트리거
--    update_updated_at() 함수는 schema.sql에 이미 정의됨
--    없을 경우를 대비해 create or replace로 재정의
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger meetings_updated_at
  before update on meetings
  for each row execute function update_updated_at();

create trigger learning_resources_updated_at
  before update on learning_resources
  for each row execute function update_updated_at();
