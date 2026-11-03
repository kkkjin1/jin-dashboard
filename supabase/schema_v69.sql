-- schema_v69: backup row-count check + read access for 3 archive tables (2026-11-03)
-- Problem found in first backup test: 3 archive tables had RLS on with no policy,
-- so the logged-in user saw them as empty (229 rows silently missing).
-- 1) backup_table_list() now also returns the true row count (security definer = owner,
--    not limited by RLS). The backup compares received rows to this and flags mismatches.
-- 2) The 3 archive tables get SELECT-only access for authenticated (no insert/update/delete).
-- Safe to re-run.

drop function if exists public.backup_table_list();

create function public.backup_table_list()
returns table (table_name text, row_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text,
         (xpath('/row/c/text()',
           query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')
         ))[1]::text::bigint
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
  order by c.relname;
$$;

revoke all on function public.backup_table_list() from public, anon;
grant execute on function public.backup_table_list() to authenticated;

drop policy if exists "auth_read" on public.agenda_sub_tasks_backup_v66;
create policy "auth_read" on public.agenda_sub_tasks_backup_v66 for select to authenticated using (true);
grant select on public.agenda_sub_tasks_backup_v66 to authenticated;

drop policy if exists "auth_read" on public.annual_goal_tasks_importance_backup_20261014;
create policy "auth_read" on public.annual_goal_tasks_importance_backup_20261014 for select to authenticated using (true);
grant select on public.annual_goal_tasks_importance_backup_20261014 to authenticated;

drop policy if exists "auth_read" on public.meeting_notes_legacy_backup;
create policy "auth_read" on public.meeting_notes_legacy_backup for select to authenticated using (true);
grant select on public.meeting_notes_legacy_backup to authenticated;

-- verify: expect 68 tables / 11873 rows (plus anything added since)
select count(*) as table_count, sum(row_count) as total_rows from public.backup_table_list();
