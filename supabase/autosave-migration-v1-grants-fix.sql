-- ============================================================
-- GRANT FIX — autosave_drafts / content_versions
--
-- Root cause (confirmed via information_schema.role_table_grants, not
-- guessed): `authenticated` and `anon` had only REFERENCES/TRIGGER/TRUNCATE
-- on both tables — no SELECT/INSERT/UPDATE/DELETE grant existed at all.
-- RLS policies (already correctly created by autosave-migration-v1.sql)
-- only restrict WHICH rows a role can touch; they do nothing if the role
-- has no table-level privilege to attempt the operation in the first
-- place — hence "permission denied for table autosave_drafts" on Test #2,
-- which is a GRANT-layer error, not an RLS-policy verdict.
--
-- This file ONLY adds grants. It does not touch RLS, does not touch any
-- existing canonical table, and does not grant anything to `anon` or to
-- `service_role`/`postgres` roles.
-- ============================================================

BEGIN;

-- authenticated: full CRUD on the mutable draft table (matches the app's
-- actual need — a user creates, reads, updates, and deletes their own
-- drafts). RLS (already in place) still restricts every one of these to
-- rows where auth.uid() = user_id — this GRANT only unlocks the *ability*
-- to attempt the operation at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE autosave_drafts TO authenticated;

-- authenticated: SELECT + INSERT only on the append-only history table —
-- matches the design (docs/autosave-db-design.md §3/§8): no UPDATE, no
-- DELETE for ordinary users, by design (immutability). Not granting
-- UPDATE/DELETE here means even a future accidental CREATE POLICY for
-- UPDATE/DELETE on content_versions would still be blocked at the GRANT
-- layer as defense-in-depth, unless someone deliberately adds the GRANT
-- too — this is intentional belt-and-suspenders, not an oversight.
GRANT SELECT, INSERT ON TABLE content_versions TO authenticated;

-- Deliberately NOT granting anything to `anon` — unauthenticated access
-- must remain fully denied (Test #11), and it already is, since anon has
-- no grant at all (confirmed by the same query that found this gap).

-- Deliberately NOT granting/touching `service_role` or `postgres` — those
-- roles bypass RLS by Supabase convention already and must not be
-- referenced from `authenticated`'s privilege set in any way.

COMMIT;

-- ============================================================
-- Verification query to re-run after this file, to confirm the fix (same
-- shape as the diagnostic query already run):
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name IN ('autosave_drafts', 'content_versions')
--   AND grantee IN ('authenticated', 'anon')
-- ORDER BY table_name, grantee, privilege_type;
--
-- Expected after this file: authenticated has SELECT/INSERT/UPDATE/DELETE
-- (+ pre-existing REFERENCES/TRIGGER/TRUNCATE) on autosave_drafts, and
-- SELECT/INSERT (+ pre-existing REFERENCES/TRIGGER/TRUNCATE) on
-- content_versions. anon's row set should be unchanged from before.
-- ============================================================
