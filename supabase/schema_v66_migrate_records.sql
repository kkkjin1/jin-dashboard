-- v66 data migration: sub tasks that have notes -> history record boxes (kind = 'record')
-- active ones also get a new plain todo (kind = 'task') with the same title, dates and assignee.
-- 1) backup first (whole table, about 70 rows)
CREATE TABLE IF NOT EXISTS public.agenda_sub_tasks_backup_v66 AS
  SELECT * FROM public.agenda_sub_tasks;

-- 2) new todo rows for active sub tasks that have notes (expected 12)
INSERT INTO public.agenda_sub_tasks (agenda_item_id, title, status, kind, sort_order, assignee_id, target_date, mid_date, due_date)
SELECT s.agenda_item_id, s.title, 'active', 'task', s.sort_order, s.assignee_id, s.target_date, s.mid_date, s.due_date
FROM public.agenda_sub_tasks s
WHERE s.kind = 'task' AND s.status = 'active'
  AND EXISTS (SELECT 1 FROM public.sub_task_notes n WHERE n.sub_task_id = s.id);

-- 3) every sub task that has notes becomes a history box (expected 29; new rows above have no notes)
UPDATE public.agenda_sub_tasks s
SET kind = 'record'
WHERE s.kind = 'task'
  AND EXISTS (SELECT 1 FROM public.sub_task_notes n WHERE n.sub_task_id = s.id);

-- 4) verify: expected task 53, record 29
SELECT kind, count(*) FROM public.agenda_sub_tasks GROUP BY kind;
