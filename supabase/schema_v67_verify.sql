SELECT
  (SELECT count(*) FROM public.adhoc_reports) AS adhoc_rows,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'adhoc_reports') AS policies,
  (SELECT pg_get_constraintdef(oid) LIKE '%adhoc_report%' FROM pg_constraint WHERE conname = 'autosave_drafts_entity_type_check') AS autosave_ok,
  (SELECT pg_get_constraintdef(oid) LIKE '%adhoc_report%' FROM pg_constraint WHERE conname = 'content_versions_entity_type_check') AS versions_ok;
