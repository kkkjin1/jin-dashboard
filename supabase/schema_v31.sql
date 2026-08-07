-- v31: /team-log에 '일상'(자유 메모 보드)과 '회의록' 섹션 추가
-- 기존 업무(그룹→항목→서브태스크) 구조는 그대로 유지, 이 두 테이블만 새로 추가.

CREATE TABLE team_log_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_log_meetings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  meeting_date date NOT NULL,
  attendees text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_log_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_log_notes_auth_all"    ON team_log_notes    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_log_meetings_auth_all" ON team_log_meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_meetings_date_idx ON team_log_meetings (meeting_date DESC);
