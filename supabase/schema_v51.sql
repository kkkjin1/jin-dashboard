-- v51: 실행 TASK(test_practice_tasks) 완료일 추적
-- 배경: 오늘 업무 카드의 "완료" 버튼이 상태만 done으로 바꾸고 언제 완료했는지는 남기지 않아
-- 완료성과/회고 등 날짜 기반 조회에 실행 TASK 완료 내역이 전혀 반영되지 않았다.
-- 상태가 done으로 바뀌는 시점의 날짜를 completed_at에 기록해, 이후 완료성과/회고 화면에서
-- 기간별로 조회할 수 있게 한다.

ALTER TABLE public.test_practice_tasks
  ADD COLUMN IF NOT EXISTS completed_at date;

CREATE INDEX IF NOT EXISTS idx_test_practice_tasks_completed_at
  ON public.test_practice_tasks (completed_at);
