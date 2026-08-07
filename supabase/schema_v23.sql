-- v23: annual goals (yeongan-mokpyo)
-- category (5 fixed values, pill filter) -> annual_goal_items (mid-tier "agenda") -> annual_goal_tasks (leaf "subtask")
-- fully independent of agenda_* tables

-- 1. annual_goal_items
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

-- 2. annual_goal_tasks
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

-- 3. annual_goal_task_notes (mirrors sub_task_notes)
CREATE TABLE IF NOT EXISTS annual_goal_task_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES annual_goal_tasks(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  edited_at timestamptz
);

-- 4. reuse attachments table
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS annual_goal_item_id uuid REFERENCES annual_goal_items(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS annual_goal_task_id uuid REFERENCES annual_goal_tasks(id) ON DELETE CASCADE;

-- 5. RLS
ALTER TABLE annual_goal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_goal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_goal_task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON annual_goal_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON annual_goal_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON annual_goal_task_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. updated_at triggers (reuses update_updated_at() from base schema.sql)
CREATE TRIGGER annual_goal_items_updated_at BEFORE UPDATE ON annual_goal_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER annual_goal_tasks_updated_at BEFORE UPDATE ON annual_goal_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. indexes
CREATE INDEX IF NOT EXISTS idx_annual_goal_items_category ON annual_goal_items (category, sort_order);
CREATE INDEX IF NOT EXISTS idx_annual_goal_tasks_item ON annual_goal_tasks (item_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_annual_goal_tasks_assignee ON annual_goal_tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_annual_goal_task_notes_task ON annual_goal_task_notes (task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_annual_goal_item ON attachments (annual_goal_item_id);
CREATE INDEX IF NOT EXISTS idx_attachments_annual_goal_task ON attachments (annual_goal_task_id);
