-- v20: period_journals — 주간/월간 회고 저장
-- period_key 형식: 'week_2026-07-28' (월요일 기준) | 'month_2026-07'

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
