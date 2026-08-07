-- v32: /team-log에 '일정' 섹션 추가. 업무 항목/서브태스크/회의록에서 연동(추가) 가능.

CREATE TABLE team_log_schedule (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  event_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  source_type text CHECK (source_type IN ('item', 'subtask', 'meeting')),
  source_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_log_schedule_auth_all" ON team_log_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_schedule_date_idx ON team_log_schedule (event_date);
