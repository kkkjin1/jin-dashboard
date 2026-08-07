-- ============================================
-- v34: 팀명 자유화 (조직 개편 대응)
-- 배경: '코어'→'인사관리팀', '비즈'→'인재전략팀'으로 팀명 변경.
--       members.part / tasks.part 에 특정 팀명만 허용하는 CHECK 제약이 있어
--       앞으로 팀명이 또 바뀌어도 코드/DB 수정 없이 반영되도록 제약을 제거하고,
--       기존 데이터를 새 팀명으로 일괄 변경한다.
-- Supabase SQL 에디터에서 전체 실행
-- ============================================

-- 1. members.part / tasks.part / meetings.category: 특정 값만 허용하던 CHECK 제약 제거
--    (팀 목록은 이제 설정(user_preferences.org)에서 자유롭게 관리)
alter table members drop constraint if exists members_part_check;
alter table tasks drop constraint if exists tasks_part_check;
alter table meetings drop constraint if exists meetings_category_check;
alter table agenda_groups drop constraint if exists agenda_groups_category_check;

-- 2. 기존 데이터 일괄 rename: 코어 → 인사관리팀, 비즈 → 인재전략팀
update members set part = '인사관리팀' where part = '코어';
update members set part = '인재전략팀' where part = '비즈';

update tasks set part = '인사관리팀' where part = '코어';
update tasks set part = '인재전략팀' where part = '비즈';

update meetings set category = '인사관리팀' where category = '코어';
update meetings set category = '인재전략팀' where category = '비즈';

update agenda_groups set category = '인사관리팀' where category = '코어';
update agenda_groups set category = '인재전략팀' where category = '비즈';
