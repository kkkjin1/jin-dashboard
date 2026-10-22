-- schema v62: agenda completion date + work retro (4 fields)
-- additive only. no existing row is deleted.

-- 1. agenda_items.completed_at
ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS completed_at date NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_items_completed_at ON public.agenda_items (completed_at);

-- backfill: already-done items get their last updated date (triggers off so updated_at stays as is)
SET session_replication_role = replica;
UPDATE public.agenda_items
  SET completed_at = (updated_at AT TIME ZONE 'Asia/Seoul')::date
  WHERE status = 'done' AND completed_at IS NULL;
SET session_replication_role = origin;

-- 2. agenda_retros (one per agenda item)
CREATE TABLE IF NOT EXISTS public.agenda_retros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id  uuid NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,
  outcome         text NOT NULL DEFAULT '',
  feedback        text NOT NULL DEFAULT '',
  changes         text NOT NULL DEFAULT '',
  lessons         text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_retros_item_uniq UNIQUE (agenda_item_id)
);

ALTER TABLE public.agenda_retros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON public.agenda_retros;
CREATE POLICY "auth_all" ON public.agenda_retros FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS agenda_retros_updated_at ON public.agenda_retros;
CREATE TRIGGER agenda_retros_updated_at BEFORE UPDATE ON public.agenda_retros FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
