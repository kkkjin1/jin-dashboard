-- ============================================================
-- AUTOSAVE MIGRATION v1 — autosave_drafts + content_versions
-- Phase 1 of docs/autosave-db-design.md §7 migration plan.
--
-- Source of truth for every column/constraint/policy below:
--   docs/autosave-audit.md          (STEP 1/2 — inventory + verification)
--   docs/autosave-architecture.md   (STEP 3 — Option C hybrid design)
--   docs/autosave-db-design.md      (STEP 4 §2/§3/§8, STEP 5 pre-flight §18/§19)
--
-- Run this ONCE against the dev Supabase project's SQL Editor, AFTER
-- supabase/combined-schema-for-dev.sql has been applied (this migration
-- does not depend on the 12 out-of-scope tables noted in
-- docs/autosave-db-design.md §24 "Dev Environment Known Gaps" — it is
-- fully additive and self-contained: two new tables, zero FK to any
-- existing canonical table by design, see §2/§16 rationale).
--
-- Scope: Track A only (generic Draft + Version History). Track B
-- (normalizing meetings.notes/one_on_ones.notes/learning_resources.notes
-- jsonb arrays) is a separate, later piece of work — not part of this file.
--
-- Safety: no DROP, no ALTER on any existing table, no data mutation.
-- Purely additive — two new tables, their indexes, and their own RLS.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. autosave_drafts — mutable, one row per (entity, field, user, tab-scope)
--    (docs/autosave-db-design.md §2)
-- ============================================================

CREATE TABLE autosave_drafts (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Generic entity key. entity_id is TEXT (not uuid/bigint) because the
  -- 41+13 tables this must eventually address do not share one PK type,
  -- and 13 of them have literally unknown PK types from static analysis
  -- (docs/autosave-audit.md §13). No DB-level FK to any canonical table
  -- is possible or intended — deliberate (§2/§16 of db-design.md).
  entity_type        text            NOT NULL
                      CHECK (entity_type IN (
                        'quick_memo','meeting','meeting_note','project_item',
                        'agenda_sub_task','sub_task_note','agenda_group','task',
                        'task_note','task_todo','annual_goal_item',
                        'annual_goal_task','annual_goal_task_note',
                        'annual_goal_category_label','objective',
                        'objective_review','one_on_one','one_on_one_feedback',
                        'one_on_one_template','perf_review','daily_journal',
                        'persona_log','learning_resource','sketch_card',
                        'sketch_frame','manual_achievement','user_setting',
                        'user_preference'
                      )),
  entity_id          text            NOT NULL,
  field_key          text            NOT NULL,

  -- Ownership. auth.uid() is the Supabase Auth JWT subject; NOT nullable —
  -- an unauthenticated draft is never persisted server-side (client-side
  -- local buffer handles that case, per architecture Ch.10).
  user_id            uuid            NOT NULL DEFAULT auth.uid()
                                      REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Disambiguates concurrent tabs/devices for the same user editing the
  -- same field. Defaulted to a fixed literal (not NULL) because NULL
  -- participates unreliably in a UNIQUE constraint (NULL <> NULL).
  client_scope       text            NOT NULL DEFAULT 'default',

  -- Buffered content. jsonb to carry a {"schemaVersion":1,"value":"..."}
  -- envelope (architecture Ch.10) so a future buffer-format change has an
  -- explicit path instead of an undefined shape mismatch.
  content            jsonb           NOT NULL,

  -- CAS token (db-design.md §4). Monotonic, starts at 0 for a brand-new draft.
  version_no         integer         NOT NULL DEFAULT 0,

  -- State machine (architecture Ch.6).
  status             text            NOT NULL DEFAULT 'local-only'
                      CHECK (status IN ('local-only','syncing','synced','failed','conflict','recovered')),

  -- Optional sub-reason for 'failed' (architecture Ch.7 scenario G).
  failure_reason     text            CHECK (failure_reason IS NULL OR failure_reason IN ('network','server_error','auth_expired','conflict','quota_exceeded','unknown')),

  local_updated_at   timestamptz,     -- last time the CLIENT buffer changed
  server_received_at timestamptz,     -- last time this row was upserted server-side

  created_at         timestamptz     NOT NULL DEFAULT now(),
  updated_at         timestamptz     NOT NULL DEFAULT now(),

  -- Retention (db-design.md §5). 7-day rolling window from created_at.
  expires_at         timestamptz     NOT NULL DEFAULT (now() + interval '7 days'),

  -- One current draft per (entity, field, user, tab/device-scope).
  CONSTRAINT autosave_drafts_unique_key
    UNIQUE (entity_type, entity_id, field_key, user_id, client_scope)
);

CREATE INDEX idx_autosave_drafts_entity
  ON autosave_drafts (entity_type, entity_id, field_key);

CREATE INDEX idx_autosave_drafts_user_entity
  ON autosave_drafts (user_id, entity_type, entity_id, field_key);

CREATE INDEX idx_autosave_drafts_expires_at
  ON autosave_drafts (expires_at);

CREATE INDEX idx_autosave_drafts_status
  ON autosave_drafts (status) WHERE status IN ('failed','conflict');


-- ============================================================
-- 2. content_versions — append-only, 7-day history
--    (docs/autosave-db-design.md §3)
-- ============================================================

CREATE TABLE content_versions (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type        text            NOT NULL
                      CHECK (entity_type IN (
                        'quick_memo','meeting','meeting_note','project_item',
                        'agenda_sub_task','sub_task_note','agenda_group','task',
                        'task_note','task_todo','annual_goal_item',
                        'annual_goal_task','annual_goal_task_note',
                        'annual_goal_category_label','objective',
                        'objective_review','one_on_one','one_on_one_feedback',
                        'one_on_one_template','perf_review','daily_journal',
                        'persona_log','learning_resource','sketch_card',
                        'sketch_frame','manual_achievement','user_setting',
                        'user_preference'
                      )),
  entity_id          text            NOT NULL,
  field_key          text            NOT NULL,

  -- Monotonic per (entity_type, entity_id, field_key) — NOT a global
  -- sequence. Same integer serves both version-history ordering (this
  -- table) and the CAS token on autosave_drafts (db-design.md §4/§8).
  version_no         integer         NOT NULL,

  content            jsonb           NOT NULL,

  -- Dedup key (db-design.md §4): a version row is only inserted when this
  -- hash differs from the immediately-preceding version's hash for the
  -- same key — except source='final'/'restore', which always insert.
  content_hash       text            NOT NULL,

  -- Distinguishes an autosave snapshot from a deliberate user action.
  source             text            NOT NULL
                      CHECK (source IN ('auto','final','restore')),

  user_id            uuid            NOT NULL REFERENCES auth.users(id),

  created_at         timestamptz     NOT NULL DEFAULT now(),

  -- Computed AT WRITE TIME (db-design.md §5), not derived on read.
  expires_at         timestamptz     NOT NULL DEFAULT (now() + interval '7 days'),

  -- Monotonic version_no is unique per key — the invariant the CAS
  -- update relies on to detect "someone else already advanced past me."
  CONSTRAINT content_versions_unique_version
    UNIQUE (entity_type, entity_id, field_key, version_no)
);

CREATE INDEX idx_content_versions_entity_history
  ON content_versions (entity_type, entity_id, field_key, created_at DESC);

CREATE INDEX idx_content_versions_expires_at
  ON content_versions (expires_at);

CREATE INDEX idx_content_versions_latest
  ON content_versions (entity_type, entity_id, field_key, version_no DESC);


-- ============================================================
-- 3. RLS — ownership model (auth.uid() = user_id), NOT the existing
--    canonical-table USING(true) pattern. See docs/autosave-db-design.md
--    §8/§9 for why this is a deliberate, stricter deviation, and why it
--    does NOT retroactively secure any existing canonical table.
--
--    IMPORTANT (docs/autosave-db-design.md §20): the RLS test matrix in
--    §12 of that document was design-level reasoning only, since no table
--    existed yet. Once this migration is applied, run the 11-test
--    real-execution procedure from §20 against these two tables with two
--    real test users BEFORE any real screen depends on them (Phase 1 gate,
--    §7 of that document).
-- ============================================================

ALTER TABLE autosave_drafts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions  ENABLE ROW LEVEL SECURITY;

-- autosave_drafts — mutable, owner-only, full CRUD by the owner

CREATE POLICY autosave_drafts_select_own
  ON autosave_drafts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY autosave_drafts_insert_own
  ON autosave_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE needs BOTH USING and WITH CHECK: USING gates which existing rows
-- can be targeted (must already belong to me), WITH CHECK gates what the
-- row is allowed to look like AFTER the write (must still belong to me) —
-- without WITH CHECK, a user could UPDATE ... SET user_id = <someone_else>
-- and hijack/reassign ownership of their own row.
CREATE POLICY autosave_drafts_update_own
  ON autosave_drafts
  FOR UPDATE
  TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY autosave_drafts_delete_own
  ON autosave_drafts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No policy granted to `anon` — RLS default-denies any operation with no
-- matching permissive policy, so unauthenticated access needs no explicit
-- deny policy, only the absence of an allow one.

-- content_versions — append-only: owner-scoped SELECT/INSERT, deliberately
-- NO UPDATE policy (a version row must never be mutated after insert) and
-- NO ordinary-user DELETE policy (only the retention cleanup job, run as
-- service_role or a narrowly-scoped SECURITY DEFINER function, removes
-- expired rows — never an ad hoc "delete my own history" user action).

CREATE POLICY content_versions_select_own
  ON content_versions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY content_versions_insert_own
  ON content_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 4. Table-level GRANTs — REQUIRED, not optional. RLS policies alone do
--    nothing if the role has no base table privilege to attempt the
--    operation at all (confirmed the hard way in a dev run of this
--    migration: without these grants, `authenticated` got
--    "permission denied for table autosave_drafts" on a plain INSERT,
--    even though the INSERT policy above was already correctly in place —
--    see docs/autosave-db-design.md §20 real-execution test log for the
--    root-cause diagnosis). Not granting anything to `anon`, and not
--    touching `service_role`/`postgres` in any way.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE autosave_drafts TO authenticated;
GRANT SELECT, INSERT ON TABLE content_versions TO authenticated;

COMMIT;

-- ============================================================
-- After running this file, per docs/autosave-db-design.md §7 Phase 1:
--   1. Confirm both tables + indexes + constraints exist (\d autosave_drafts,
--      \d content_versions, or Table Editor).
--   2. Confirm RLS is enabled and all policies above are listed
--      (Database > Policies in the Supabase dashboard, or
--      SELECT * FROM pg_policies WHERE tablename IN ('autosave_drafts','content_versions')).
--   3. Run the §20 real-execution RLS test procedure with two real test
--      users and a throwaway entity_type/entity_id BEFORE any real screen
--      (Quick Memo pilot) depends on these tables.
-- ============================================================
