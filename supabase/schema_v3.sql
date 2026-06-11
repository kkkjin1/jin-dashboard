-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마 v3
-- 업무-회의록 양방향 연동 (junction table)
-- Supabase SQL 에디터에서 실행
-- ============================================

-- 업무 ↔ 회의록 연동 테이블
create table if not exists task_meeting_links (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique(task_id, meeting_id)
);

-- RLS 활성화 + 인증된 사용자만 접근
alter table task_meeting_links enable row level security;
create policy "auth_all" on task_meeting_links for all to authenticated using (true) with check (true);
