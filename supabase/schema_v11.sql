-- schema_v11.sql
-- notes 테이블에 사용자 정의 제목 컬럼 추가
ALTER TABLE notes ADD COLUMN IF NOT EXISTS title text;
