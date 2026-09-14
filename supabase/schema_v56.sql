-- ============================================================
-- v56: 업무보고(work-report) — final(확정) 보고서 DB 레벨 불변성
--
-- 배경: 2026-09-14 자동저장/보안 재검증에서, work_reports/work_report_entries의
-- RLS 정책이 "TO authenticated USING(true) WITH CHECK(true)"라 status 조건이
-- 없고, 클라이언트(ReportEditorPanel)의 readOnly 체크만으로 final 불변성을
-- 지키고 있음을 확인했다. 실측: 인증된 세션으로 직접 PATCH를 보내면 final
-- report/entry도 그대로 수정된다(HTTP 200) — "확정 후 절대 안 바뀐다"는 이
-- 기능의 핵심 설계 원칙이 DB에서는 전혀 강제되지 않는다.
--
-- work-report 화면의 "보고 확정" ↔ "편집 재개"(handleToggleFinalize,
-- src/app/(app)/work-report/page.tsx)는 final ⇄ draft 양방향 전환이 실제
-- 기능으로 존재한다 — 그래서 "final은 완전 불변"이 아니라 "final → draft
-- 전환(status/finalized_at 두 필드만)만 예외로 허용, 그 외 모든 UPDATE/DELETE는
-- 차단"으로 구현한다. carry-forward(handleNewReport)는 과거 report의 entry를
-- SELECT만 하고 UPDATE하지 않으므로 이 트리거의 영향을 받지 않는다.
--
-- entry 삭제(handleRemoveFromReport)는 이미 클라이언트에서 readOnly면 호출
-- 자체를 막고 있고, work_reports를 DELETE하는 코드 경로는 애초에 존재하지
-- 않는다 — 두 테이블 모두 대칭적으로 final 상태에서는 UPDATE/DELETE를 함께
-- 차단해 같은 종류의 우회를 막는다. INSERT는 이번 범위 밖(요청 범위: 확정된
-- 기존 행의 수정/삭제 차단).
--
-- 이 파일은 PRODUCTION Supabase에 아직 적용되지 않았다 — 검토 후 수동 실행할 것.
-- ============================================================

-- ============================================================
-- 1. work_reports — final 행은 "편집 재개"(final→draft, 다른 필드 불변)
--    전환 외 모든 UPDATE/DELETE 차단
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_final_work_report()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'final' THEN
      RAISE EXCEPTION 'work_reports: cannot delete a finalized report (id=%)', OLD.id
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.status = 'final' THEN
    -- 유일한 예외: "편집 재개" — status를 draft로, finalized_at을 null로
    -- 되돌리는 것 외에는 어떤 필드도 바뀌지 않는 UPDATE만 허용한다.
    IF NEW.status = 'draft'
       AND NEW.finalized_at IS NULL
       AND NEW.period_start = OLD.period_start
       AND NEW.period_end   = OLD.period_end
       AND NEW.summary      = OLD.summary
       AND NEW.issues       = OLD.issues
       AND NEW.next_steps   = OLD.next_steps
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'work_reports: cannot modify a finalized report (id=%) except to un-finalize it', OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_final_work_report_trigger ON public.work_reports;
CREATE TRIGGER protect_final_work_report_trigger
  BEFORE UPDATE OR DELETE ON public.work_reports
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_work_report();


-- ============================================================
-- 2. work_report_entries — 부모 report가 final이면 UPDATE/DELETE 차단
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_final_work_report_entry()
RETURNS trigger AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT status INTO parent_status FROM public.work_reports WHERE id = OLD.report_id;

  IF parent_status = 'final' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'work_report_entries: cannot delete an entry (id=%) whose parent report (id=%) is finalized', OLD.id, OLD.report_id
        USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'work_report_entries: cannot modify an entry (id=%) whose parent report (id=%) is finalized', OLD.id, OLD.report_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_final_work_report_entry_trigger ON public.work_report_entries;
CREATE TRIGGER protect_final_work_report_entry_trigger
  BEFORE UPDATE OR DELETE ON public.work_report_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_work_report_entry();

-- ============================================================
-- 적용 후 확인:
--   -- draft report는 정상 UPDATE 되는지
--   -- final report는 summary 등 UPDATE 시 예외 발생하는지
--   -- final report를 draft로 되돌리는 UPDATE(status/finalized_at만)는 되는지
--   -- final report 소속 entry UPDATE 시 예외 발생하는지
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid IN ('public.work_reports'::regclass, 'public.work_report_entries'::regclass)
--     AND NOT tgisinternal;
-- ============================================================
