-- schema_v12.sql
-- PC-모바일 연동: localStorage 데이터를 Supabase에 저장
CREATE TABLE IF NOT EXISTS user_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- 기본 행 미리 삽입 (없으면 upsert로 처리하므로 필수 아님)
