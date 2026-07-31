-- v22: user_preferences — 설정 DB 동기화 (메뉴 순서/가시성, 조직 구조)
-- localStorage 의존 제거 → Mac/Windows 간 설정 공유 가능

CREATE TABLE IF NOT EXISTS user_preferences (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON user_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- members 테이블에 role 컬럼 추가 (직책: 팀원/파트장/팀장)
ALTER TABLE members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT '팀원';
