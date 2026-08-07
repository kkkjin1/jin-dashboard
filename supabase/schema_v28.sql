-- v28: 공통업무 팀 로그 (team-log) — 팀원 4명 공용, 비로그인 접근용 독립 테이블
-- 기존 테이블과 완전히 분리. RLS로 anon은 이 테이블만 select/insert 가능,
-- 다른 모든 테이블은 여전히 authenticated 전용이라 접근 불가.

CREATE TABLE team_log_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('업무기록', '보고일정')),
  entry_date date NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_entries ENABLE ROW LEVEL SECURITY;

-- anon(비로그인) 접근 허용 — 이 테이블에만 한정. 다른 테이블은 영향 없음.
CREATE POLICY "team_log_anon_select" ON team_log_entries FOR SELECT TO anon USING (true);
CREATE POLICY "team_log_anon_insert" ON team_log_entries FOR INSERT TO anon WITH CHECK (true);

-- 기존 로그인 계정도 동일하게 조회/작성 가능
CREATE POLICY "team_log_auth_all" ON team_log_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_entries_date_idx ON team_log_entries (entry_date DESC);
