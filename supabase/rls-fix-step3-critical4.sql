-- task_todos: 기존 public allow-all 정책을 제거하고 authenticated 전용으로 교체
-- (owner_all 정책은 이번 작업 범위 밖이라 건드리지 않음 — 이미 anon을 조건으로 막고 있어 안전)
drop policy if exists "allow_all_task_todos" on public.task_todos;
alter table public.task_todos enable row level security;
do $$ begin
  create policy "auth_all" on public.task_todos for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.obj_entries enable row level security;
do $$ begin
  create policy "auth_all" on public.obj_entries for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.sub_task_updates enable row level security;
do $$ begin
  create policy "auth_all" on public.sub_task_updates for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.meeting_agenda_links enable row level security;
do $$ begin
  create policy "auth_all" on public.meeting_agenda_links for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;
