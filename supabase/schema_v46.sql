-- ============================================
-- v46: RLS 정책 표준화 + 재발 방지용 rls_audit() 함수
--
-- 배경(정책 표준화): attachments/daily_journals/learning_resources/meetings/
-- members/my_feedback/notes/one_on_one_template/one_on_ones/persona_logs/
-- quick_memos/tasks/user_settings 13개 테이블이 TO public 정책 +
-- USING(auth.uid() IS NOT NULL) (또는 auth.role()='authenticated') 조건식으로
-- anon을 막고 있었다. 실측 결과 현재 anon 노출은 없지만, role 자체가
-- public(anon 포함)이라 조건식이 나중에 실수로 느슨해지면 즉시 열리는 구조다.
-- 이 앱의 지배적 컨벤션인 TO authenticated로 표준화한다.
--
-- 코드/스키마 확인 결과 13개 테이블 전부 user_id/owner_id 컬럼이 없고 쿼리도
-- 사용자별로 필터링하지 않는 "조직 전체 공유" 모델이므로(개인 소유 데이터 아님),
-- 전부 TO authenticated / USING(true) / WITH CHECK(true)로 표준화해도 기존
-- 접근 범위가 넓어지지 않는다 — 원래도 로그인만 하면 전체 접근 가능했다.
--
-- attachments/learning_resources/meetings/members/my_feedback/notes/
-- one_on_one_template/one_on_ones/quick_memos/tasks 10개는 이미 별도의
-- TO authenticated 정책(auth_all 또는 my_feedback_auth)이 존재해 실질 접근권한에
-- 변화가 없다 — 여기서는 중복/위험한 public 정책만 제거한다.
--
-- daily_journals/persona_logs/user_settings 3개는 public 정책이 유일한
-- 정책이라, 제거와 동시에 동일한 의미의 authenticated 정책으로 교체한다.
-- ============================================

drop policy if exists "owner_all" on public.attachments;
drop policy if exists "owner_all" on public.learning_resources;
drop policy if exists "owner_all" on public.meetings;
drop policy if exists "owner_all" on public.members;
drop policy if exists "owner_all" on public.my_feedback;
drop policy if exists "owner_all" on public.notes;
drop policy if exists "owner_all" on public.one_on_one_template;
drop policy if exists "owner_all" on public.one_on_ones;
drop policy if exists "owner_all" on public.quick_memos;
drop policy if exists "owner_all" on public.tasks;

drop policy if exists "allow all for authenticated" on public.daily_journals;
do $$ begin
  create policy "auth_all" on public.daily_journals for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

drop policy if exists "auth users" on public.persona_logs;
do $$ begin
  create policy "auth_all" on public.persona_logs for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

drop policy if exists "owner_all" on public.user_settings;
do $$ begin
  create policy "auth_all" on public.user_settings for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ============================================
-- 재발 방지: rls_audit() — public schema 전체를 훑어 RLS 누락/anon-public
-- 정책을 찾아내는 함수. service_role만 호출 가능(일반 로그인 사용자에게
-- 스키마/보안 정보를 노출하지 않기 위함). scripts/db-security-check.mjs가
-- 이 함수를 호출한다.
--
-- team_log_* (HRM 소속)는 이 앱의 점검 대상이 아니므로 명시적으로 제외한다.
--
-- allowlist: 앞으로 "anon에게 의도적으로 공개해야 하는 테이블"이 생기면
-- 아래 배열에 이름을 추가하고, 왜 공개되어야 하는지 이유를 이 파일을 수정하는
-- 커밋 메시지에 남긴다. 2026-08-28 전수조사 기준으로는 그런 테이블이 없다.
-- ============================================

create or replace function public.rls_audit()
returns table (
  table_name text,
  kind text,
  rls_enabled boolean,
  has_public_or_anon_policy boolean,
  policy_summary text,
  allowlisted boolean,
  status text
)
language sql
security definer
set search_path = public
as $$
  with allowlist as (
    select array[]::text[] as names
  ),
  base as (
    select
      c.relname as table_name,
      case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' else c.relkind::text end as kind,
      c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','v','m')
      and c.relname not like 'team_log_%'
  ),
  pol as (
    select
      tablename as table_name,
      bool_or(roles::text ilike '%public%' or roles::text ilike '%anon%') as has_public_or_anon_policy,
      string_agg(policyname || '(' || array_to_string(roles, ',') || ')', ', ') as policy_summary
    from pg_policies
    where schemaname = 'public'
    group by tablename
  )
  select
    b.table_name,
    b.kind,
    b.rls_enabled,
    coalesce(p.has_public_or_anon_policy, false),
    coalesce(p.policy_summary, '(no policies)'),
    (b.table_name::text = any(a.names)),
    case
      when b.kind <> 'table' then 'SKIP (view/matview - 별도 검토 필요)'
      when b.table_name::text = any(a.names) then 'ALLOWLISTED'
      when not b.rls_enabled then 'FAIL: RLS disabled'
      when coalesce(p.has_public_or_anon_policy, false) then 'FAIL: anon/public role policy'
      else 'OK'
    end
  from base b
  cross join allowlist a
  left join pol p on p.table_name = b.table_name
  order by b.table_name;
$$;

revoke all on function public.rls_audit() from public, anon, authenticated;
grant execute on function public.rls_audit() to service_role;
