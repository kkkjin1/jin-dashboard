-- ============================================
-- v61: quick_todos.deferred - 홈 금주 업무 '다음주로 연기' 표시
--
-- 날짜(target_date)는 원래 요일 그대로 두고 연기 여부만 표시한다.
-- 그 주 화면에서는 '다음주로 연기' 열, 다음 주 화면에서는 '직전주 미완료' 열에 보인다.
-- 기존 행은 모두 false (연기 아님) 로 채워진다.
-- ============================================

alter table quick_todos add column if not exists deferred boolean not null default false;
