-- v33: team-log 일정을 월별 다이어리 그리드(주차×담당자)로 재구성하기 위한 필드/테이블 추가

ALTER TABLE team_log_schedule ADD COLUMN assignee text NOT NULL DEFAULT '';
ALTER TABLE team_log_schedule ADD COLUMN tag text;

CREATE TABLE team_log_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_log_members_auth_all" ON team_log_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
