-- v57: work_reports.report_date + final-report protection includes report_date

ALTER TABLE public.work_reports ADD COLUMN IF NOT EXISTS report_date date;

SET session_replication_role = replica;

UPDATE public.work_reports SET report_date = period_end WHERE report_date IS NULL;

SET session_replication_role = origin;

CREATE INDEX IF NOT EXISTS idx_work_reports_report_date ON public.work_reports (report_date);

CREATE OR REPLACE FUNCTION public.protect_final_work_report()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'final' THEN
      RAISE EXCEPTION 'work_reports: cannot delete a finalized report (id=%)', OLD.id USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'final' THEN
    IF NEW.status = 'draft' AND NEW.finalized_at IS NULL AND NEW.period_start = OLD.period_start AND NEW.period_end = OLD.period_end AND NEW.report_date IS NOT DISTINCT FROM OLD.report_date AND NEW.summary = OLD.summary AND NEW.issues = OLD.issues AND NEW.next_steps = OLD.next_steps THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'work_reports: cannot modify a finalized report (id=%) except to un-finalize it', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT id, period_start, period_end, report_date, status FROM public.work_reports ORDER BY period_start;

SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.work_reports'::regclass AND NOT tgisinternal;
