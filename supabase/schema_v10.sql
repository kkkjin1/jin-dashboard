-- schema_v10.sql
-- 1. my_feedback: 날짜 선택 + 피드백 제공자 추가
ALTER TABLE my_feedback ADD COLUMN IF NOT EXISTS feedback_date date;
ALTER TABLE my_feedback ADD COLUMN IF NOT EXISTS from_member text;

-- 2. one_on_ones: 다음 약속 컬럼 추가
ALTER TABLE one_on_ones ADD COLUMN IF NOT EXISTS next_appointment text;
