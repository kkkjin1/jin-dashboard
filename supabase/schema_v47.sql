-- ============================================
-- v47: task_todos의 남은 public role 정책 제거
--
-- 배경: v46에서 13개 테이블의 public+조건식 패턴을 authenticated로 표준화할 때
-- task_todos는 대상에 없었다(critical-4 작업에서 owner_all을 범위 밖이라 남겨둠).
-- rls_audit()가 이후 이 테이블을 FAIL로 계속 잡아내고 있어 정리한다.
--
-- 코드 확인 결과 task_todos를 쓰는 곳은 전부 (app) 로그인 그룹 안이고, 이미
-- auth_all(TO authenticated, USING(true), WITH CHECK(true))이 모든 CRUD를
-- 커버하므로 owner_all(TO public, USING(auth.uid() IS NOT NULL)) 제거는
-- 접근 범위에 변화가 없다.
-- ============================================

drop policy if exists "owner_all" on public.task_todos;
