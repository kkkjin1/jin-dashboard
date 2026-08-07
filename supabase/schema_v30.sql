-- v30: /team-log을 '프로젝트' 탭 스타일(그룹 → 항목 → 서브태스크)로 재구성.
-- 회의록 매트릭스(agenda_updates류)와 로드맵 뷰는 이 팀 로그에는 두지 않음 — 3단 구조만.
-- v28의 flat entries 구조는 이걸로 대체되어 더 이상 쓰지 않으므로 제거.

DROP TABLE IF EXISTS team_log_entries;

CREATE TABLE team_log_groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#4C7FE0',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES team_log_groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hold', 'done')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_subtasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES team_log_items(id) ON DELETE CASCADE,
  author text NOT NULL,
  entry_type text NOT NULL DEFAULT '업무기록' CHECK (entry_type IN ('업무기록', '보고일정')),
  entry_date date NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_subtasks ENABLE ROW LEVEL SECURITY;

-- anon 정책 없음 — service role(마스터키)로만 접근. 기존 로그인 계정은 authenticated로 계속 접근 가능.
CREATE POLICY "team_log_groups_auth_all"   ON team_log_groups   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_log_items_auth_all"    ON team_log_items    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_log_subtasks_auth_all" ON team_log_subtasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_items_group_idx    ON team_log_items (group_id, sort_order);
CREATE INDEX team_log_subtasks_item_idx  ON team_log_subtasks (item_id, sort_order);
CREATE INDEX team_log_subtasks_date_idx  ON team_log_subtasks (entry_date DESC);
