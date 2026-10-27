-- schema v63: sub task workspace (body doc + history box layout)
-- additive only. no existing row is changed or deleted.

-- 1. agenda_sub_tasks.body : one living document per sub task (left 70% editor)
ALTER TABLE public.agenda_sub_tasks
  ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';

-- 2. sub_task_notes layout for right-side history boxes
--    sort_order NULL = not reordered yet -> UI falls back to created_at desc
--    offset_x   = horizontal shift (px) inside its row, 0 = left aligned
ALTER TABLE public.sub_task_notes
  ADD COLUMN IF NOT EXISTS sort_order integer NULL,
  ADD COLUMN IF NOT EXISTS offset_x integer NOT NULL DEFAULT 0;

-- verify
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'agenda_sub_tasks' AND column_name = 'body')
    OR (table_name = 'sub_task_notes' AND column_name IN ('sort_order', 'offset_x')))
ORDER BY table_name, column_name;
