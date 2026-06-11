-- ============================================
-- 인사기획팀 생산성 앱 DB 스키마 v4
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1. tasks: 작업월 배열 + 성과분류 컬럼 추가
alter table tasks add column if not exists work_months text[] not null default '{}';
alter table tasks add column if not exists achievement_category text
  check (achievement_category in ('성과', '개선', '리소스', '수명', '기타'));

-- 2. members: 팀장 파트 허용
alter table members drop constraint if exists members_part_check;
alter table members add constraint members_part_check
  check (part in ('코어', '비즈', '팀장'));

-- 3. quick_memos: 공지 태그 추가
alter table quick_memos drop constraint if exists quick_memos_tag_check;
alter table quick_memos add constraint quick_memos_tag_check
  check (tag in ('업무관련', '회의관련', '아이디어', '공지'));

-- 4. 기존 v1 테이블 RLS 활성화 (보안)
alter table tasks enable row level security;
alter table notes enable row level security;
alter table attachments enable row level security;
alter table members enable row level security;
create policy if not exists "auth_all" on tasks for all to authenticated using (true) with check (true);
create policy if not exists "auth_all" on notes for all to authenticated using (true) with check (true);
create policy if not exists "auth_all" on attachments for all to authenticated using (true) with check (true);
create policy if not exists "auth_all" on members for all to authenticated using (true) with check (true);

-- 5. 1on1 세션 테이블
create table if not exists one_on_ones (
  id uuid default gen_random_uuid() primary key,
  member_id uuid not null references members(id) on delete cascade,
  session_date date,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table one_on_ones enable row level security;
create policy "auth_all" on one_on_ones for all to authenticated using (true) with check (true);
create trigger one_on_ones_updated_at before update on one_on_ones
  for each row execute function update_updated_at();

-- 6. 1on1 템플릿 테이블 (row 1개만 사용)
create table if not exists one_on_one_template (
  id uuid default gen_random_uuid() primary key,
  content text not null default '',
  updated_at timestamp with time zone default now()
);
alter table one_on_one_template enable row level security;
create policy "auth_all" on one_on_one_template for all to authenticated using (true) with check (true);
create trigger one_on_one_template_updated_at before update on one_on_one_template
  for each row execute function update_updated_at();

do $$
begin
  if not exists (select 1 from one_on_one_template) then
    insert into one_on_one_template (content) values (
      E'## 최근 업무 현황\n\n\n## 어려운 점 / 개선 요청\n\n\n## 성장 / 역량 개발\n\n\n## 기타 이야기'
    );
  end if;
end $$;
