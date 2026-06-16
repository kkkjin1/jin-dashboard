-- v17: task_todos 완료 시각 추가 (홈탭 금주 완료 아카이빙)
ALTER TABLE task_todos ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;
