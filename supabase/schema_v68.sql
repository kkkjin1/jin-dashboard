-- schema_v68: backup table list function (2026-11-03)
-- Settings > Data backup button calls this to get every public table,
-- so newly added tables are included automatically (no hardcoded list).
-- Returns table names only. Row reads still go through each table's RLS.
-- Safe to re-run.

create or replace function public.backup_table_list()
returns table (table_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
  order by c.relname;
$$;

revoke all on function public.backup_table_list() from public, anon;
grant execute on function public.backup_table_list() to authenticated;

-- verify: should return the table list (run while logged in as postgres in SQL editor)
select count(*) as table_count from public.backup_table_list();
