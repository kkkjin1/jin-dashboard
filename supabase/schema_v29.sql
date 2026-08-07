-- v29: team_log_entries를 마스터키(service role) 전용으로 전환
-- API가 이제 service role 키로 직접 접근하므로(RLS 우회), anon에게 열어줬던
-- select/insert 정책을 제거한다. 이제 브라우저의 anon key로는 이 테이블도 직접 못 건드린다.

DROP POLICY IF EXISTS "team_log_anon_select" ON team_log_entries;
DROP POLICY IF EXISTS "team_log_anon_insert" ON team_log_entries;
