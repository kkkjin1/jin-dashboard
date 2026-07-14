-- 목표관리 테이블
-- Teams/groups (분기와 무관하게 영속)
create table if not exists obj_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#4A7FC0',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Quarterly objectives per group
create table if not exists obj_objectives (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references obj_groups(id) on delete cascade,
  title text not null,
  quarter text not null, -- e.g. '2026-Q3'
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Weekly meeting notes per objective
create table if not exists obj_entries (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references obj_objectives(id) on delete cascade,
  entry_date date not null default (now()::date),
  content text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists obj_objectives_quarter on obj_objectives(quarter);
create index if not exists obj_entries_objective on obj_entries(objective_id);
create index if not exists obj_entries_date on obj_entries(entry_date desc);
