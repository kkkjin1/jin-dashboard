-- schema v65: sub task kind (task = execution item, record = planning record box)
-- additive only. every existing row becomes 'task' (same as today).

ALTER TABLE public.agenda_sub_tasks
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'task';

ALTER TABLE public.agenda_sub_tasks
  DROP CONSTRAINT IF EXISTS agenda_sub_tasks_kind_check;
ALTER TABLE public.agenda_sub_tasks
  ADD CONSTRAINT agenda_sub_tasks_kind_check CHECK (kind IN ('task', 'record'));

-- verify
SELECT kind, count(*) FROM public.agenda_sub_tasks GROUP BY kind;
