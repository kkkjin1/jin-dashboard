-- v15: task_todos 테이블 생성 (업무 내 할일 단위, 일정 플래닝 레이어)
-- v14의 tasks.schedule_tag는 사용하지 않으므로 실행하지 않아도 됩니다.
CREATE TABLE IF NOT EXISTS task_todos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  schedule_tag TEXT CHECK (schedule_tag IN ('today', 'tomorrow', 'this_week')),
  done BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- RLS (tasks와 동일 패턴)
ALTER TABLE task_todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_task_todos" ON task_todos FOR ALL USING (true) WITH CHECK (true);
