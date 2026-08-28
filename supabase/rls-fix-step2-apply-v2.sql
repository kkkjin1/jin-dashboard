alter table public.agenda_sub_tasks enable row level security;
do $$ begin
  create policy "auth_all" on public.agenda_sub_tasks for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.sub_task_notes enable row level security;
do $$ begin
  create policy "auth_all" on public.sub_task_notes for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.project_meetings enable row level security;
do $$ begin
  create policy "auth_all" on public.project_meetings for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.objective_groups_v2 enable row level security;
do $$ begin
  create policy "auth_all" on public.objective_groups_v2 for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.objectives_v2 enable row level security;
do $$ begin
  create policy "auth_all" on public.objectives_v2 for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.objective_entries_v2 enable row level security;
do $$ begin
  create policy "auth_all" on public.objective_entries_v2 for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.obj_groups enable row level security;
do $$ begin
  create policy "auth_all" on public.obj_groups for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.obj_objectives enable row level security;
do $$ begin
  create policy "auth_all" on public.obj_objectives for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.obj_sub_items enable row level security;
do $$ begin
  create policy "auth_all" on public.obj_sub_items for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

alter table public.obj_sub_entries enable row level security;
do $$ begin
  create policy "auth_all" on public.obj_sub_entries for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;
