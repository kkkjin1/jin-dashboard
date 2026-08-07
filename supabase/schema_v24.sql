-- v24: annual_goal_items에 목표 데드라인 컬럼 추가 (진척률 D-day 표시용)

ALTER TABLE annual_goal_items ADD COLUMN IF NOT EXISTS target_deadline date;
