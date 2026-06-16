-- v13: 첨부파일 meeting_id 추가 + task_id nullable 처리
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE attachments ALTER COLUMN task_id DROP NOT NULL;

-- Supabase Storage 버킷 생성 (대시보드에서 직접 수행):
-- Storage > New bucket > 이름: "attachments" > Public 체크 > Create
-- 또는 아래 SQL 실행 (storage 스키마 접근 가능한 경우):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true) ON CONFLICT DO NOTHING;
