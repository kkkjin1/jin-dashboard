-- v14: schedule_tag 추가 (일정 플래닝 레이어)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_tag TEXT CHECK (schedule_tag IN ('today', 'tomorrow', 'this_week'));
