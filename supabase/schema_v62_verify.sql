-- v62 verify (run after schema_v62.sql)
SELECT
  (SELECT count(*) FROM public.agenda_items WHERE status = 'done') AS done_items,
  (SELECT count(*) FROM public.agenda_items WHERE status = 'done' AND completed_at IS NULL) AS done_without_date,
  (SELECT count(*) FROM public.agenda_items WHERE status <> 'done' AND completed_at IS NOT NULL) AS not_done_with_date,
  (SELECT count(*) FROM public.agenda_retros) AS retros;
