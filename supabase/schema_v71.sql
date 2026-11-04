-- schema_v71: content_versions(자동저장 기록 사본) 정리 규칙 (2026-11-04)
-- 규칙: 한 칸(entity_type, entity_id, field_key)을 마지막으로 고친 뒤 1시간 동안 변경이 없으면
--       가장 최근 기록 1개만 남기고 나머지를 지운다.
--       최근 1개를 남기는 이유: 다음에 그 칸을 열어 통째로 지웠을 때 "지우기 전 내용"이 남아 있어야 해서.
-- 본래 데이터(meetings, agenda_items 등)는 건드리지 않는다 — content_versions만 대상.
-- content_versions는 append-only(authenticated에 DELETE 권한 없음)라 security definer 함수로만 지운다.
-- 다시 실행해도 안전.

create or replace function public.purge_stale_content_versions()
returns integer
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select id,
           row_number() over (partition by entity_type, entity_id, field_key
                              order by version_no desc, created_at desc) as rn,
           max(created_at) over (partition by entity_type, entity_id, field_key) as last_at
    from content_versions
    where user_id = auth.uid()
  ),
  del as (
    delete from content_versions cv
    using ranked r
    where cv.id = r.id
      and r.rn > 1
      and r.last_at < now() - interval '1 hour'
    returning 1
  )
  select count(*)::int from del;
$$;

revoke all on function public.purge_stale_content_versions() from public, anon;
grant execute on function public.purge_stale_content_versions() to authenticated;


-- ── 1회 정리: 9월부터 쌓인 기록 (SQL 편집기에서는 auth.uid()가 비어 있어 위 함수가 아무것도 안 지움) ──
-- 같은 규칙을 전체 행에 한 번 적용한다. jin은 사용자 1명 앱.
with ranked as (
  select id,
         row_number() over (partition by entity_type, entity_id, field_key
                            order by version_no desc, created_at desc) as rn,
         max(created_at) over (partition by entity_type, entity_id, field_key) as last_at
  from content_versions
)
delete from content_versions cv
using ranked r
where cv.id = r.id
  and r.rn > 1
  and r.last_at < now() - interval '1 hour';


-- ── 확인 ──
select count(*) as rows_left,
       count(distinct (entity_type, entity_id, field_key)) as fields,
       pg_size_pretty(pg_total_relation_size('content_versions')) as total_size
from content_versions;
