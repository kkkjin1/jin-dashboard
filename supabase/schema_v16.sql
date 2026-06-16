-- v16: 태스크 단축명 + 할일 목표날짜 (날짜기반 일정 플래닝)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE task_todos ADD COLUMN IF NOT EXISTS target_date DATE;

-- 기존 schedule_tag → target_date 마이그레이션
UPDATE task_todos SET target_date = CURRENT_DATE WHERE schedule_tag = 'today' AND target_date IS NULL AND done = false;
UPDATE task_todos SET target_date = CURRENT_DATE + INTERVAL '1 day' WHERE schedule_tag = 'tomorrow' AND target_date IS NULL AND done = false;
UPDATE task_todos SET target_date = (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::DATE WHERE schedule_tag = 'this_week' AND target_date IS NULL AND done = false;
