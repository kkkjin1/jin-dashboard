# 새 테이블/마이그레이션 체크리스트

이 프로젝트에서 발생했던 보안 사고(agenda_sub_tasks 등 10개+4개 테이블이 RLS 없이
anon에 노출)의 근본 원인은 전부 "Supabase 대시보드 SQL 에디터에서 테이블을 직접
만들고 커밋된 migration 파일을 남기지 않은 것"이었다. 아래 체크리스트는 그 재발을
막기 위한 최소 규칙이다.

## 새 테이블을 만들 때 (대시보드에서 만들더라도)

1. **같은 세션에 반드시 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`와
   `CREATE POLICY`를 함께 실행한다.** 테이블만 만들고 정책을 나중으로 미루지 않는다.
2. 이 앱은 조직 전체 공유 모델이다(개인 소유 데이터가 아닌 이상):
   ```sql
   ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "auth_all" ON public.<table>
     FOR ALL TO authenticated USING (true) WITH CHECK (true);
   ```
   `TO` 절을 빼먹으면 기본값이 `PUBLIC`(anon 포함)이 된다 — `task_todos` 사고가
   정확히 이 실수였다(schema_v15.sql).
3. 실제로 사용자별 소유 데이터라면(예: `autosave_drafts`, `content_versions`처럼
   `user_id` 컬럼이 있는 경우) `auth.uid() = user_id` 기반 정책을 쓴다. `TO public`
   + 조건식으로 막는 방식은 쓰지 않는다(v46에서 이 패턴 13개를 전부 제거했다).
4. **실행한 SQL을 `supabase/schema_vNN.sql`로 커밋한다.** 대시보드에서만 실행하고
   git에 기록을 남기지 않으면, 다음 전수조사 때까지 아무도 이 테이블의 존재/정책을
   모르게 된다.
5. 새 테이블을 만든 뒤 `npm run db:security-check`를 로컬에서 한 번 실행해
   RLS가 켜져 있고 anon/public 정책이 없는지 바로 확인한다(설정 방법은
   `scripts/db-security-check.mjs` 상단 주석 참고). 이 스크립트는
   `.github/workflows/db-security-check.yml`을 통해 매일 + `supabase/**` 변경 시
   자동으로도 실행된다.

## 의도적으로 anon/public 접근을 허용해야 하는 테이블이 생기면

`supabase/schema_v46.sql`의 `rls_audit()` 함수 안 `allowlist` 배열에 테이블명을
추가하고, 그 커밋 메시지에 왜 공개되어야 하는지 이유를 남긴다. 이유 없이 그냥
목록에만 추가하지 않는다 — 이후 감사(audit) 때 이 근거를 다시 확인해야 한다.
