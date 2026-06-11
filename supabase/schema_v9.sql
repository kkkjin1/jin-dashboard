-- schema_v9.sql
-- 1. my_feedback table (팀장 개인 피드백 수집)
CREATE TABLE IF NOT EXISTS my_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month text NOT NULL,          -- 'YYYY-MM'
  content text NOT NULL DEFAULT '',
  feedback_type text NOT NULL DEFAULT '일반',  -- '긍정' | '부정' | '요구사항' | '일반'
  created_at timestamptz DEFAULT now()
);
ALTER TABLE my_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "my_feedback_auth" ON my_feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. tasks.retrospective column (업무완료 회고)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retrospective jsonb;
