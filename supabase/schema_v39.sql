-- ============================================
-- v39: quick_memos.tag 단일 문자열 → 다중 태그(text[])로 마이그레이션
-- Supabase SQL 에디터에서 전체 실행 (수동 반영 필요 — 이 파일은 앱이 자동으로 적용하지 않음)
--
-- 기존 값은 1개짜리 배열로 감싸서 그대로 보존한다 (`using array[tag]`).
-- 예: '업무관련' → ARRAY['업무관련']
-- ============================================

-- 1. 단일값 전제 체크 제약 제거 (schema_v4.sql에서 추가된 것)
alter table quick_memos drop constraint if exists quick_memos_tag_check;

-- 2. 컬럼 타입 변경: text → text[] (기존 값은 1개짜리 배열로 보존)
alter table quick_memos alter column tag drop default;
alter table quick_memos alter column tag type text[] using array[tag]::text[];
alter table quick_memos alter column tag set default array['업무관련']::text[];
alter table quick_memos alter column tag set not null;

-- 참고: 요소 값 자체에 대한 체크 제약(업무관련/회의관련/아이디어/공지/완료)은
-- 배열 타입에서는 표준 체크로 걸기 까다로워 생략 — 값 검증은 애플리케이션(MemoTag[]) 레벨에서 유지.
