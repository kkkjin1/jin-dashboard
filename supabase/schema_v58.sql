-- v58: work_report_items (3-1 operation / 3-2 issue / 3-3 decision) + final-report protection

CREATE TABLE IF NOT EXISTS public.work_report_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  section     text NOT NULL CHECK (section IN ('operation', 'issue', 'decision')),
  lineage_id  uuid NOT NULL DEFAULT gen_random_uuid(),
  title       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT '',
  owner       text NOT NULL DEFAULT '',
  summary     text NOT NULL DEFAULT '',
  detail      text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_report_items_status_check CHECK (
    status = ''
    OR (section = 'operation' AND status IN ('normal', 'caution'))
    OR (section = 'issue'     AND status IN ('open', 'resolved', 'on_hold'))
    OR (section = 'decision'  AND status IN ('requested', 'approved', 'rejected', 'on_hold'))
  ),
  CONSTRAINT work_report_items_report_lineage_uniq UNIQUE (report_id, lineage_id)
);

CREATE INDEX IF NOT EXISTS idx_work_report_items_report ON public.work_report_items (report_id, section, sort_order);
CREATE INDEX IF NOT EXISTS idx_work_report_items_lineage ON public.work_report_items (lineage_id);

ALTER TABLE public.work_report_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON public.work_report_items;
CREATE POLICY "auth_all" ON public.work_report_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS work_report_items_updated_at ON public.work_report_items;
CREATE TRIGGER work_report_items_updated_at BEFORE UPDATE ON public.work_report_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.protect_final_work_report_item()
RETURNS trigger AS $$
DECLARE
  parent_status text;
  target_report uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_report := NEW.report_id;
  ELSE
    target_report := OLD.report_id;
  END IF;
  SELECT status INTO parent_status FROM public.work_reports WHERE id = target_report;
  IF parent_status = 'final' THEN
    RAISE EXCEPTION 'work_report_items: parent report (id=%) is finalized', target_report USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.report_id <> OLD.report_id THEN
    RAISE EXCEPTION 'work_report_items: report_id cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_final_work_report_item_trigger ON public.work_report_items;
CREATE TRIGGER protect_final_work_report_item_trigger BEFORE INSERT OR UPDATE OR DELETE ON public.work_report_items FOR EACH ROW EXECUTE FUNCTION public.protect_final_work_report_item();

SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.work_report_items'::regclass AND NOT tgisinternal;
