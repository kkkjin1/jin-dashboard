-- ============================================================
-- CANONICAL RECOVERY (DEV ONLY) — jin-dashboard dev Supabase project
--
-- Purpose: recreate the 28 canonical tables that should exist after running
-- supabase/combined-schema-for-dev.sql, but which a full information_schema
-- check confirmed are ALL MISSING (36 expected CREATE TABLE names / 0
-- present). Root cause: combined-schema-for-dev.sql wraps its entire 1124
-- lines in a single BEGIN;/COMMIT;, and one statement inside it (the
-- `agenda_sub_tasks` ALTER TABLE, since commented out — see "EXCLUDED"
-- section below) errored, rolling back everything.
--
-- This file:
--   - Has NO enclosing BEGIN;/COMMIT; wrapper (that was the bug).
--   - Uses CREATE TABLE IF NOT EXISTS everywhere (does not assume this alone
--     fixes structural drift on tables that already exist with a different
--     shape — irrelevant right now since 0 of the 36 exist, but stated for
--     the record per the work instructions).
--   - Reproduces supabase/combined-schema-for-dev.sql content as literally
--     as possible, in the same order (that order already respects every FK
--     dependency — no cycles were found; see report §2).
--   - Every section below is commented with the exact source file + line
--     range in combined-schema-for-dev.sql it was taken from.
--
-- DO NOT RUN THIS FROM AN AGENT / SCRIPT / MCP / migration tool. The user
-- runs this manually in the dev project's SQL Editor.
--
-- Target: DEV project only (vuxxanxuuwoduxmslrwh.supabase.co). Never run
-- against production.
-- ============================================================

-- ================================================================
-- EXCLUDED FROM THIS FILE (see chat report for full reasoning):
--
-- 1. `agenda_sub_tasks` ALTER TABLE (combined-schema-for-dev.sql:729-739,
--    originally from schema_v27.sql) — there is no CREATE TABLE for
--    `agenda_sub_tasks` anywhere in schema.sql..schema_v39.sql (confirmed by
--    re-reading the full 1124-line file). It is one of the 13 undocumented
--    tables in docs/autosave-audit.md §6b, created directly against the live
--    prod DB outside of any committed migration. Already commented out in
--    the source file. Left OUT of this recovery entirely — tracked as a
--    separate Open Issue, not something this file can fix (there is nothing
--    to ALTER without a base CREATE TABLE, and inventing one would violate
--    "don't guess structure not in the source").
--
-- 2. team_log_entries / team_log_groups / team_log_items /
--    team_log_subtasks / team_log_notes / team_log_meetings /
--    team_log_schedule / team_log_members (combined-schema-for-dev.sql
--    lines 765-921, originally schema_v28.sql..schema_v33.sql) — re-verified
--    via `grep -rln "team_log_entries\|team_log_groups\|team_log_items\|
--    team_log_subtasks\|team_log_notes\|team_log_meetings\|
--    team_log_schedule\|team_log_members" src/` against the CURRENT
--    jin-dashboard src/ tree: 0 files matched. This confirms the earlier
--    docs/autosave-audit.md §6a note ("team-log was extracted into the
--    separate HRM project") still holds. Excluded from this recovery file.
--    If jin-dashboard ever needs these tables again, they can be copied
--    verbatim from combined-schema-for-dev.sql lines 765-921 — nothing here
--    prevents that; they are just not needed for jin-dashboard today.
-- ================================================================


-- ================================================================
-- SOURCE: schema.sql (combined-schema-for-dev.sql:22-103)
-- Tables: members, tasks, notes, attachments
-- ================================================================

create table if not exists members (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  part text not null check (part in ('코어', '비즈')),
  created_at timestamp with time zone default now()
);

create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  part text not null check (part in ('코어', '비즈')),
  type text not null check (type in ('기획', '개선', '운영')),
  assignee_id uuid references members(id) on delete set null,
  status text not null default '진행필요' check (status in ('진행필요', '진행중', '완료')),
  start_date date,
  mid_date date,
  end_date date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists notes (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create table if not exists attachments (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('파일', '링크')),
  url text not null,
  created_at timestamp with time zone default now()
);

-- RLS disabled here on purpose (matches source's original ordering) — it is
-- re-enabled with real policies below by schema_v4.sql's block. Reproducing
-- the disable-then-re-enable sequence exactly as the source does it.
alter table members disable row level security;
alter table tasks disable row level security;
alter table notes disable row level security;
alter table attachments disable row level security;

-- update_updated_at(): defined once here. The source also redefines it
-- identically (CREATE OR REPLACE, same body) in schema_v2.sql:159-165 —
-- deduped to a single definition since the body never changes between the
-- two; behavior is identical either way.
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();

insert into members (name, part) values
  ('김다슬', '코어'),
  ('최도담', '코어'),
  ('강은정', '코어'),
  ('기윤미', '비즈'),
  ('채미소', '비즈'),
  ('장연희', '비즈'),
  ('이재아', '비즈'),
  ('정희영', '비즈'),
  ('최보명', '비즈'),
  ('여도현', '비즈'),
  ('문혜윤', '비즈')
on conflict do nothing;


-- ================================================================
-- SOURCE: schema_v2.sql (combined-schema-for-dev.sql:107-173)
-- Tables: quick_memos, meetings, learning_resources
-- ================================================================

create table if not exists quick_memos (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null default '',
  tag text not null default '업무관련' check (tag in ('업무관련', '회의관련', '아이디어')),
  created_at timestamp with time zone default now()
);

create table if not exists meetings (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  meeting_date date,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists learning_resources (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  source text not null default '',
  notes jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table quick_memos enable row level security;
alter table meetings enable row level security;
alter table learning_resources enable row level security;

create policy "auth_all" on quick_memos for all to authenticated using (true) with check (true);
create policy "auth_all" on meetings for all to authenticated using (true) with check (true);
create policy "auth_all" on learning_resources for all to authenticated using (true) with check (true);

create trigger meetings_updated_at
  before update on meetings
  for each row execute function update_updated_at();

create trigger learning_resources_updated_at
  before update on learning_resources
  for each row execute function update_updated_at();


-- ================================================================
-- SOURCE: schema_v3.sql (combined-schema-for-dev.sql:176-196)
-- Table: task_meeting_links
-- ================================================================

create table if not exists task_meeting_links (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique(task_id, meeting_id)
);

alter table task_meeting_links enable row level security;
create policy "auth_all" on task_meeting_links for all to authenticated using (true) with check (true);


-- ================================================================
-- SOURCE: schema_v4.sql (combined-schema-for-dev.sql:199-275)
-- Alters tasks/members/quick_memos, re-enables RLS on v1 tables,
-- adds one_on_ones + one_on_one_template
-- ================================================================

alter table tasks add column if not exists work_months text[] not null default '{}';
alter table tasks add column if not exists achievement_category text
  check (achievement_category in ('성과', '개선', '리소스', '수명', '기타'));

alter table members drop constraint if exists members_part_check;
alter table members add constraint members_part_check
  check (part in ('코어', '비즈', '팀장'));

alter table quick_memos drop constraint if exists quick_memos_tag_check;
alter table quick_memos add constraint quick_memos_tag_check
  check (tag in ('업무관련', '회의관련', '아이디어', '공지'));

alter table tasks enable row level security;
alter table notes enable row level security;
alter table attachments enable row level security;
alter table members enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tasks' and policyname = 'auth_all') then
    create policy "auth_all" on tasks for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'notes' and policyname = 'auth_all') then
    create policy "auth_all" on notes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'attachments' and policyname = 'auth_all') then
    create policy "auth_all" on attachments for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'members' and policyname = 'auth_all') then
    create policy "auth_all" on members for all to authenticated using (true) with check (true);
  end if;
end $$;

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


-- ================================================================
-- SOURCE: schema_v5.sql (combined-schema-for-dev.sql:279-287)
-- ================================================================
alter table notes add column if not exists edited_at timestamp with time zone;

-- schema_v6.sql was empty in the source repo (combined-schema-for-dev.sql:291-293) — nothing to reproduce.


-- ================================================================
-- SOURCE: schema_v7.sql (combined-schema-for-dev.sql:296-309)
-- ================================================================
alter table one_on_ones add column if not exists title text;
alter table learning_resources add column if not exists tags text[] default '{}';
alter table learning_resources add column if not exists media_type text;


-- ================================================================
-- SOURCE: schema_v8.sql (combined-schema-for-dev.sql:312-323)
-- ================================================================
alter table tasks drop constraint if exists tasks_part_check;
alter table tasks add constraint tasks_part_check
  check (part in ('코어', '비즈', '팀장', '개인'));


-- ================================================================
-- SOURCE: schema_v9.sql (combined-schema-for-dev.sql:326-343)
-- Table: my_feedback
-- ================================================================
CREATE TABLE IF NOT EXISTS my_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month text NOT NULL,
  content text NOT NULL DEFAULT '',
  feedback_type text NOT NULL DEFAULT '일반',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE my_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "my_feedback_auth" ON my_feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retrospective jsonb;


-- ================================================================
-- SOURCE: schema_v10.sql (combined-schema-for-dev.sql:346-355)
-- ================================================================
ALTER TABLE my_feedback ADD COLUMN IF NOT EXISTS feedback_date date;
ALTER TABLE my_feedback ADD COLUMN IF NOT EXISTS from_member text;
ALTER TABLE one_on_ones ADD COLUMN IF NOT EXISTS next_appointment text;


-- ================================================================
-- SOURCE: schema_v11.sql (combined-schema-for-dev.sql:358-363)
-- ================================================================
ALTER TABLE notes ADD COLUMN IF NOT EXISTS title text;


-- ================================================================
-- SOURCE: schema_v12.sql (combined-schema-for-dev.sql:366-375)
-- Table: user_settings
-- NOTE (RLS gap, reported not fixed per instructions): the source file
-- never enables RLS on this table anywhere in schema.sql..schema_v39.sql
-- (confirmed by grepping the whole file for "user_settings" — only this
-- CREATE TABLE line matches). Left exactly as-is; see report §7/§9.
-- ================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);


-- ================================================================
-- SOURCE: schema_v13.sql (combined-schema-for-dev.sql:380-390)
-- ================================================================
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE attachments ALTER COLUMN task_id DROP NOT NULL;
-- Storage bucket "attachments" is dashboard-created, not SQL — out of scope for this file.


-- ================================================================
-- SOURCE: schema_v14.sql (combined-schema-for-dev.sql:393-397)
-- ================================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_tag TEXT CHECK (schedule_tag IN ('today', 'tomorrow', 'this_week'));


-- ================================================================
-- SOURCE: schema_v15.sql (combined-schema-for-dev.sql:400-417)
-- Table: task_todos
-- NOTE (RLS gap, reported not fixed): policy has no "TO authenticated"
-- clause (defaults to PUBLIC role), unlike every other table's "TO
-- authenticated" pattern. Reproduced exactly as-is; see report §7/§9.
-- ================================================================
CREATE TABLE IF NOT EXISTS task_todos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  schedule_tag TEXT CHECK (schedule_tag IN ('today', 'tomorrow', 'this_week')),
  done BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

ALTER TABLE task_todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_task_todos" ON task_todos FOR ALL USING (true) WITH CHECK (true);


-- ================================================================
-- SOURCE: schema_v16.sql (combined-schema-for-dev.sql:420-430)
-- ================================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE task_todos ADD COLUMN IF NOT EXISTS target_date DATE;

UPDATE task_todos SET target_date = CURRENT_DATE WHERE schedule_tag = 'today' AND target_date IS NULL AND done = false;
UPDATE task_todos SET target_date = CURRENT_DATE + INTERVAL '1 day' WHERE schedule_tag = 'tomorrow' AND target_date IS NULL AND done = false;
UPDATE task_todos SET target_date = (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::DATE WHERE schedule_tag = 'this_week' AND target_date IS NULL AND done = false;


-- ================================================================
-- SOURCE: schema_v17.sql (combined-schema-for-dev.sql:433-437)
-- ================================================================
ALTER TABLE task_todos ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;


-- ================================================================
-- SOURCE: schema_v18.sql (combined-schema-for-dev.sql:440-444)
-- ================================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;


-- ================================================================
-- SOURCE: schema_v19.sql (combined-schema-for-dev.sql:447-520)
-- Tables: agenda_groups, agenda_items, agenda_updates
-- ================================================================
CREATE TABLE IF NOT EXISTS agenda_groups (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  category   text    NOT NULL,
  name       text    NOT NULL,
  color      text    NOT NULL DEFAULT '#9CA3AF',
  sort_order integer NOT NULL DEFAULT 0,
  is_open    boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (category, name)
);

CREATE TABLE IF NOT EXISTS agenda_items (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id        uuid    NOT NULL REFERENCES agenda_groups(id) ON DELETE CASCADE,
  title           text    NOT NULL,
  item_type       text    NOT NULL DEFAULT 'do'
                          CHECK (item_type IN ('do', 'fb', 'rp', 'ag')),
  status          text    NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'hold', 'done')),
  linked_task_id  uuid    REFERENCES tasks(id) ON DELETE SET NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  hidden          boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- NOTE (unused-but-restored): grep of src/ found zero references to
-- `agenda_updates` (superseded by an undocumented table `meeting_agenda_links`
-- per docs/autosave-audit.md §6a/§6b). Restored anyway per instructions —
-- it has a real CREATE TABLE in the source and is not team_log_*/
-- agenda_sub_tasks, so it is not one of the tables this file is authorized
-- to drop. See report §3/§7.
CREATE TABLE IF NOT EXISTS agenda_updates (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agenda_item_id uuid NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  meeting_id     uuid NOT NULL REFERENCES meetings(id)     ON DELETE CASCADE,
  note           text NOT NULL DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (agenda_item_id, meeting_id)
);

ALTER TABLE agenda_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON agenda_groups  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON agenda_items   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON agenda_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER agenda_items_updated_at
  BEFORE UPDATE ON agenda_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agenda_updates_updated_at
  BEFORE UPDATE ON agenda_updates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_agenda_groups_category  ON agenda_groups  (category, sort_order);
CREATE INDEX IF NOT EXISTS idx_agenda_items_group      ON agenda_items   (group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_agenda_updates_item     ON agenda_updates (agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_agenda_updates_meeting  ON agenda_updates (meeting_id);

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS category text;


-- ================================================================
-- SOURCE: schema_v20.sql (combined-schema-for-dev.sql:523-545)
-- Table: period_journals
-- ================================================================
CREATE TABLE IF NOT EXISTS period_journals (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  period_key  text    NOT NULL UNIQUE,
  period_type text    NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  content     text    NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE period_journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON period_journals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER period_journals_updated_at
  BEFORE UPDATE ON period_journals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_period_journals_key ON period_journals (period_key);


-- ================================================================
-- SOURCE: schema_v21.sql (combined-schema-for-dev.sql:548-554)
-- ================================================================
ALTER TABLE period_journals ADD COLUMN IF NOT EXISTS good       text NOT NULL DEFAULT '';
ALTER TABLE period_journals ADD COLUMN IF NOT EXISTS bad        text NOT NULL DEFAULT '';
ALTER TABLE period_journals ADD COLUMN IF NOT EXISTS next_focus text NOT NULL DEFAULT '';


-- ================================================================
-- SOURCE: schema_v22.sql (combined-schema-for-dev.sql:557-574)
-- Table: user_preferences
-- ================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON user_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT '팀원';


-- ================================================================
-- SOURCE: schema_v23.sql (combined-schema-for-dev.sql:577-662)
-- Tables: annual_goal_items, annual_goal_tasks, annual_goal_task_notes
-- ================================================================
CREATE TABLE IF NOT EXISTS annual_goal_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('1. 인재 확보', '2. 검증과 정렬', '3. 유지와 보상', '4. 지속가능성', '5. 확장 기반')),
  title text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  sort_order integer NOT NULL DEFAULT 0,
  is_open boolean NOT NULL DEFAULT true,
  roadmap_start_date date,
  roadmap_end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (category, title)
);

CREATE TABLE IF NOT EXISTS annual_goal_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES annual_goal_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hold', 'done')),
  description text,
  maturity_level integer CHECK (maturity_level BETWEEN 1 AND 3),
  maturity_rationale text,
  track text CHECK (track IN ('A', 'B', 'C')),
  hr_importance text CHECK (hr_importance IN ('상', '중', '하')),
  hr_urgency text CHECK (hr_urgency IN ('상', '중', '하')),
  suggested_period text,
  hrm_function text,
  notes text,
  exec_importance text CHECK (exec_importance IN ('상', '중', '하')),
  agreed_priority text CHECK (agreed_priority IN ('1순위', '2순위', '유예')),
  roadmap_start_date date,
  roadmap_end_date date,
  roadmap_rank integer,
  assignee_id uuid REFERENCES members(id) ON DELETE SET NULL,
  mid_date date,
  due_date date,
  target_date date,
  sort_order integer NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS annual_goal_task_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES annual_goal_tasks(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  edited_at timestamptz
);

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS annual_goal_item_id uuid REFERENCES annual_goal_items(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS annual_goal_task_id uuid REFERENCES annual_goal_tasks(id) ON DELETE CASCADE;

ALTER TABLE annual_goal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_goal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_goal_task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON annual_goal_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON annual_goal_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON annual_goal_task_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER annual_goal_items_updated_at BEFORE UPDATE ON annual_goal_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER annual_goal_tasks_updated_at BEFORE UPDATE ON annual_goal_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_annual_goal_items_category ON annual_goal_items (category, sort_order);
CREATE INDEX IF NOT EXISTS idx_annual_goal_tasks_item ON annual_goal_tasks (item_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_annual_goal_tasks_assignee ON annual_goal_tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_annual_goal_task_notes_task ON annual_goal_task_notes (task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_annual_goal_item ON attachments (annual_goal_item_id);
CREATE INDEX IF NOT EXISTS idx_attachments_annual_goal_task ON attachments (annual_goal_task_id);


-- ================================================================
-- SOURCE: schema_v24.sql (combined-schema-for-dev.sql:665-670)
-- ================================================================
ALTER TABLE annual_goal_items ADD COLUMN IF NOT EXISTS target_deadline date;


-- ================================================================
-- SOURCE: schema_v25.sql (combined-schema-for-dev.sql:673-699)
-- Table: annual_goal_category_labels
-- ================================================================
CREATE TABLE IF NOT EXISTS annual_goal_category_labels (
  category_key text PRIMARY KEY,
  name text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE annual_goal_category_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON annual_goal_category_labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER annual_goal_category_labels_updated_at BEFORE UPDATE ON annual_goal_category_labels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO annual_goal_category_labels (category_key, name) VALUES
  ('1. 인재 확보', '인재 확보'),
  ('2. 검증과 정렬', '검증과 정렬'),
  ('3. 유지와 보상', '유지와 보상'),
  ('4. 지속가능성', '지속가능성'),
  ('5. 확장 기반', '확장 기반')
ON CONFLICT (category_key) DO NOTHING;


-- ================================================================
-- SOURCE: schema_v26.sql + schema_v27.sql
-- (combined-schema-for-dev.sql:702-755)
-- Table: manual_achievements
--
-- COLLAPSED PER TASK INSTRUCTIONS: the source defines manual_achievements
-- TWICE — once at combined-schema-for-dev.sql:707 (schema_v26.sql, columns:
-- id, title, category CHECK IN ('성과','개선','리소스','수명','기타'),
-- content, month, created_at), then DROPs it and recreates it at line 743
-- (schema_v27.sql, columns: id, group_id→agenda_groups, title,
-- achievement_type CHECK IN ('기획','운영','개선'), month, content,
-- created_at). Since the source runs DROP TABLE IF EXISTS manual_achievements
-- (line 741) between the two, the v26 shape never survives to the final
-- schema — only the line-743 (v27) definition is canonical. On this empty
-- dev DB there is nothing to drop, so the v26 CREATE + the DROP are both
-- skipped here as redundant; only the final v27 shape is created, using
-- CREATE TABLE IF NOT EXISTS per this file's own rule (the source's line 743
-- omits IF NOT EXISTS — added here for safety, no structural change).
-- ================================================================
CREATE TABLE IF NOT EXISTS manual_achievements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES agenda_groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  achievement_type text CHECK (achievement_type IN ('기획', '운영', '개선')),
  month text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE manual_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON manual_achievements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- NOTE: the `agenda_sub_tasks` ALTER TABLE that originally followed this
-- section in schema_v27.sql (combined-schema-for-dev.sql:729-739) is
-- deliberately NOT reproduced here — see "EXCLUDED FROM THIS FILE" header.


-- ================================================================
-- team_log_* (schema_v28.sql..schema_v33.sql, combined-schema-for-dev.sql:
-- 758-921) — DELIBERATELY EXCLUDED. See "EXCLUDED FROM THIS FILE" header
-- for the grep evidence (0 references in src/). Not reproduced below.
-- ================================================================


-- ================================================================
-- SOURCE: schema_v34.sql (combined-schema-for-dev.sql:924-954)
-- Team-name freeform migration — drops old CHECK constraints, renames
-- existing seed data. Operates on rows inserted by schema.sql's seed above.
-- ================================================================
alter table members drop constraint if exists members_part_check;
alter table tasks drop constraint if exists tasks_part_check;
alter table meetings drop constraint if exists meetings_category_check;
alter table agenda_groups drop constraint if exists agenda_groups_category_check;

update members set part = '인사관리팀' where part = '코어';
update members set part = '인재전략팀' where part = '비즈';

update tasks set part = '인사관리팀' where part = '코어';
update tasks set part = '인재전략팀' where part = '비즈';

update meetings set category = '인사관리팀' where category = '코어';
update meetings set category = '인재전략팀' where category = '비즈';

update agenda_groups set category = '인사관리팀' where category = '코어';
update agenda_groups set category = '인재전략팀' where category = '비즈';


-- ================================================================
-- SOURCE: schema_v35.sql (combined-schema-for-dev.sql:957-1007)
-- Tables: sketch_boards, sketch_cards
-- ================================================================
create table if not exists sketch_boards (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists sketch_cards (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references sketch_boards(id) on delete cascade,
  content text not null default '',
  color text not null default 'blue'
    check (color in ('blue', 'purple', 'teal', 'amber', 'pink', 'green', 'cyan', 'lilac', 'neutral')),
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  width double precision not null default 220,
  height double precision not null default 140,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists sketch_cards_board_id_idx on sketch_cards(board_id);

alter table sketch_boards enable row level security;
alter table sketch_cards enable row level security;

create policy "auth_all" on sketch_boards for all to authenticated using (true) with check (true);
create policy "auth_all" on sketch_cards for all to authenticated using (true) with check (true);

create trigger sketch_boards_updated_at
  before update on sketch_boards
  for each row execute function update_updated_at();

create trigger sketch_cards_updated_at
  before update on sketch_cards
  for each row execute function update_updated_at();


-- ================================================================
-- SOURCE: schema_v36.sql (combined-schema-for-dev.sql:1010-1030)
-- Table: sketch_edges
-- ================================================================
create table if not exists sketch_edges (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references sketch_boards(id) on delete cascade,
  source_card_id uuid not null references sketch_cards(id) on delete cascade,
  target_card_id uuid not null references sketch_cards(id) on delete cascade,
  created_at timestamp with time zone default now()
);

create index if not exists sketch_edges_board_id_idx on sketch_edges(board_id);

alter table sketch_edges enable row level security;
create policy "auth_all" on sketch_edges for all to authenticated using (true) with check (true);


-- ================================================================
-- SOURCE: schema_v37.sql (combined-schema-for-dev.sql:1033-1076)
-- Table: sketch_frames + sketch_cards.frame_id
-- ================================================================
create table if not exists sketch_frames (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references sketch_boards(id) on delete cascade,
  title       text not null default '제목 없는 프레임',
  position_x  double precision not null default 0,
  position_y  double precision not null default 0,
  width       double precision not null default 400,
  height      double precision not null default 300,
  collapsed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sketch_frames_board_id_idx on sketch_frames(board_id);

create or replace function update_sketch_frames_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_sketch_frames_updated_at
  before update on sketch_frames
  for each row execute function update_sketch_frames_updated_at();

alter table sketch_frames enable row level security;
create policy "auth_all" on sketch_frames for all to authenticated using (true) with check (true);

alter table sketch_cards add column if not exists
  frame_id uuid references sketch_frames(id) on delete set null;

create index if not exists sketch_cards_frame_id_idx on sketch_cards(frame_id);


-- ================================================================
-- SOURCE: schema_v38.sql (combined-schema-for-dev.sql:1079-1105)
-- Table: schedule_items
-- ================================================================
create table if not exists schedule_items (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  item_date       date not null,
  start_hour      double precision not null default 9,
  duration_hours  double precision not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists schedule_items_item_date_idx on schedule_items(item_date);

create trigger trg_schedule_items_updated_at
  before update on schedule_items
  for each row execute function update_updated_at();

alter table schedule_items enable row level security;
create policy "auth_all" on schedule_items for all to authenticated using (true) with check (true);


-- ================================================================
-- SOURCE: schema_v39.sql (combined-schema-for-dev.sql:1108-1131)
-- quick_memos.tag: text -> text[]
-- ================================================================
alter table quick_memos drop constraint if exists quick_memos_tag_check;

alter table quick_memos alter column tag drop default;
alter table quick_memos alter column tag type text[] using array[tag]::text[];
alter table quick_memos alter column tag set default array['업무관련']::text[];
alter table quick_memos alter column tag set not null;


-- ================================================================
-- GRANTS (not present anywhere in combined-schema-for-dev.sql — 0 GRANT
-- statements found by grepping the whole file). Added here per task
-- instructions §6, because supabase/autosave-migration-v1-grants-fix.sql
-- is a CONFIRMED real precedent on THIS SAME dev project: RLS policies
-- alone did not grant table-level privileges to `authenticated`/`anon` —
-- both roles had only REFERENCES/TRIGGER/TRUNCATE by default, and every
-- operation failed with "permission denied for table X" until an explicit
-- GRANT was run. Without this section, every one of the 28 tables below
-- would likely reproduce that same outage the first time the app tries to
-- read/write them on this dev project.
--
-- Privileges are the minimum the app's own code (grep of src/.from(table))
-- was confirmed to use, not a blanket "ALL". None of these tables are
-- granted to `anon` — every screen in this app operates through a logged-in
-- (`authenticated`) Supabase session (confirmed in docs/autosave-audit.md:
-- "single-user/small-team internal HR planning dashboard", login-gated).
-- No `service_role`/`postgres` grants are touched (those roles bypass RLS
-- by Supabase convention already, per the grants-fix file's own comment).
-- ================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notes TO authenticated;
GRANT SELECT, INSERT, DELETE          ON TABLE attachments TO authenticated; -- no UPDATE call site found in src/
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE quick_memos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE meetings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE learning_resources TO authenticated;
GRANT SELECT, INSERT, DELETE          ON TABLE task_meeting_links TO authenticated; -- link table, no UPDATE in src/
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE one_on_ones TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON TABLE one_on_one_template TO authenticated; -- single-row template, no DELETE in src/
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE my_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON TABLE user_settings TO authenticated; -- no DELETE call site found in src/; table has no RLS at all (see note above)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE task_todos TO authenticated; -- policy is PUBLIC-scoped in source; app itself only ever uses `authenticated`
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE agenda_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE agenda_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE agenda_updates TO authenticated; -- currently unreferenced by src/, granted to match its RLS scope
GRANT SELECT, INSERT, UPDATE          ON TABLE period_journals TO authenticated; -- upsert-only in src/, no DELETE call site found
GRANT SELECT, INSERT, UPDATE          ON TABLE user_preferences TO authenticated; -- upsert-only in src/, no DELETE call site found
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE annual_goal_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE annual_goal_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON TABLE annual_goal_task_notes TO authenticated; -- no DELETE call site found in src/
GRANT SELECT, INSERT, UPDATE          ON TABLE annual_goal_category_labels TO authenticated; -- upsert-only in src/, no DELETE call site found
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE manual_achievements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sketch_boards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sketch_cards TO authenticated;
GRANT SELECT, INSERT, DELETE          ON TABLE sketch_edges TO authenticated; -- link table, no UPDATE in src/
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sketch_frames TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE schedule_items TO authenticated;

-- ============================================================
-- END OF FILE. Do not append a COMMIT; — there is no BEGIN; to match.
-- ============================================================
