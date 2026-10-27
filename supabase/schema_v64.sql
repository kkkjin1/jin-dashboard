-- schema v64: agenda detail left memo as sketch freenote + sub task box color
-- additive only. no existing row is changed or deleted.

-- 1. hidden freenote board per agenda item (overlay boxes/images/tables/mindmap cards).
--    body text itself stays in agenda_items.description.
ALTER TABLE public.sketch_boards
  ADD COLUMN IF NOT EXISTS agenda_item_id uuid NULL
  REFERENCES public.agenda_items(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS sketch_boards_agenda_item_uniq
  ON public.sketch_boards (agenda_item_id)
  WHERE agenda_item_id IS NOT NULL;

-- 2. sub task box color (right side history boxes). NULL = default color
ALTER TABLE public.agenda_sub_tasks
  ADD COLUMN IF NOT EXISTS color text NULL;

-- verify
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'sketch_boards' AND column_name = 'agenda_item_id')
    OR (table_name = 'agenda_sub_tasks' AND column_name = 'color'))
ORDER BY table_name, column_name;
