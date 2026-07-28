-- v21: period_journals에 3필드 추가 (주간/월간 회고 구조화)
ALTER TABLE period_journals ADD COLUMN IF NOT EXISTS good       text NOT NULL DEFAULT '';
ALTER TABLE period_journals ADD COLUMN IF NOT EXISTS bad        text NOT NULL DEFAULT '';
ALTER TABLE period_journals ADD COLUMN IF NOT EXISTS next_focus text NOT NULL DEFAULT '';
