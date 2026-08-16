# Autosave DB Design (STEP 4)

**Status**: DESIGN ONLY. No SQL in this document has been executed. No Supabase table was created, altered, or dropped while producing this document. No existing source file was modified. No existing canonical-table RLS policy was read, created, altered, or dropped as part of this STEP (STEP 1's own findings on existing RLS are only *cited*, never re-verified against live Supabase, since Dashboard/service-role access is out of scope for this STEP as it was for STEP 1-3).

**Relationship to prior STEPs**: This document takes STEP 3's recommendation (`docs/autosave-architecture.md`, Ch.4/5/23 — **Track A = Option C, Hybrid**: two new generic tables, `autosave_drafts` and `content_versions`, additive-only, existing 41 canonical tables untouched) and specifies it down to physical-schema level: columns, types, constraints, indexes, the exact CAS update condition, retention/cleanup mechanics, restore flow, a re-sequenced migration plan, and — per this STEP's explicit mandate — a full RLS security analysis that is not allowed to declare a blanket "PASS" without justification.

---

## 1. Scope & Inputs

**Inputs read in full for this STEP** (both treated as read-only ground truth, neither modified):
- `docs/autosave-audit.md` — STEP 1 (full inventory) + STEP 2 (verification). Ground truth for: 35 editor surfaces, 3 confirmed P0 clusters, 13 undocumented tables, and — load-bearing for the RLS addendum below — **§6a**: *"All RLS policies found are **permissive**: `FOR ALL TO authenticated USING (true) WITH CHECK (true)`... There is no row-level ownership/ACL model — any authenticated session can read/write any row."* This is re-confirmed as the starting condition for every RLS judgment in §9-§14 below.
- `docs/autosave-architecture.md` — STEP 3. Ground truth for: Option C (Hybrid) as the chosen Track A architecture (Ch.4/5), the `(entity_type, entity_id, field_key)` generic key shape (Ch.5/7/8), the Draft/History separation (Ch.5/7/8), the version-compare-and-swap concept (Ch.9), the 7-day rolling retention definition (Ch.14), the restore-creates-a-new-version rule (Ch.15.D), and the 7-phase migration plan (Ch.20).

**Scope of this STEP**: Track A only (`autosave_drafts` + `content_versions`), taken to physical-schema depth. **Track B** (normalizing `meetings.notes`/`one_on_ones.notes`/`learning_resources.notes` jsonb arrays into child tables, architecture Ch.17) is explicitly out of scope for this document, exactly as it was carved out as a separate track in STEP 3 — nothing below alters or depends on Track B being done first, except where noted (§4 mentions the CAS primitive is shared conceptually, not schema-shared).

**Absolute constraints carried forward and re-affirmed for this STEP** (see task instructions): no source code changed, no new source code written, no Supabase table actually created/altered, no migration generated or run, no existing data modified, no existing canonical-table RLS touched, no Dashboard/service-role access, no dev/build commands run, and the only file this STEP produces is this one (`docs/autosave-db-design.md`). All SQL below is **design-only text** inside this markdown document — never executed, never saved as a `.sql` migration file.

**Key fact this document treats as a hard constraint on the RLS design (not a re-derivation — cited from audit §6a)**: every one of the ~41 existing canonical tables (plus the 13 undocumented ones, whose RLS is literally unknown per audit §6b/§13) is either `USING (true) WITH CHECK (true)` for `authenticated`, or unverifiable. This means **there is currently no canonical-entity-level access control to delegate to or check against** in this app. Section 9 below treats this as a first-class fact, not a footnote.

---

## 2. Physical Schema — `autosave_drafts`

Conceptual/design-only DDL. Not executed. Written as it would eventually be proposed as a migration, but this STEP produces no migration file.

```sql
-- DESIGN ONLY — NOT EXECUTED. For future migration reference only.

-- One row per (entity_type, entity_id, field_key, user_id, client_scope):
-- the "latest value the user typed, whether or not it has reached the
-- canonical table yet" (architecture Ch.7). Mutable — upserted continuously.
-- Never an append-only table (contrast content_versions, §3).

CREATE TABLE autosave_drafts (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Generic entity key (architecture Ch.5/7). entity_id is TEXT, not uuid/bigint,
  -- because the 41+13 tables this must eventually address (audit §6a/§6b) do not
  -- share a single PK type — some are uuid, some are bigint identity columns, and
  -- 13 tables' PK types are literally unknown from static analysis (audit §13 #1).
  -- Trade-off: no DB-level FK to any canonical table is possible with a generic
  -- entity_id (deliberate — Option C requires zero coupling to canonical schemas,
  -- architecture Ch.4 "현재 앱과의 호환성" row). Referential correctness for
  -- entity_id is an application-level (field_key registry, architecture Ch.22)
  -- responsibility, not a DB constraint, in this design.
  entity_type        text            NOT NULL,
  entity_id          text            NOT NULL,
  field_key          text            NOT NULL,

  -- Ownership. auth.uid() is the Supabase Auth JWT subject; NOT nullable —
  -- an unauthenticated draft has no owner and must not be persisted server-side
  -- (client-side Local Recovery Buffer, architecture Ch.10, handles that case).
  user_id            uuid            NOT NULL DEFAULT auth.uid()
                                      REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Disambiguates concurrent tabs/devices for the same user editing the same
  -- field (architecture Ch.7 "client_scope exists to support the same-user-
  -- multiple-tabs case"). Defaulted to a fixed literal instead of NULL because
  -- a NULL column participates unreliably in a UNIQUE constraint in Postgres
  -- (NULL <> NULL), which would silently allow duplicate "no scope" rows.
  client_scope       text            NOT NULL DEFAULT 'default',

  -- Buffered content. jsonb (not text) to carry the schema-versioned envelope
  -- described in architecture Ch.10 (`{"schemaVersion": 1, "value": "..."}`),
  -- so a future buffer-format change has an explicit migration/discard path
  -- instead of an undefined shape mismatch (the exact gap audit §7 found in
  -- today's unversioned localStorage keys).
  content            jsonb           NOT NULL,

  -- CAS token (§4). Represents "the version this draft was last known to be
  -- built against / successfully synced to." Monotonic, starts at 0 for a
  -- brand-new draft with no prior sync.
  version_no         integer         NOT NULL DEFAULT 0,

  -- State machine from architecture Ch.6. Stored so the History/Recovery UI
  -- (architecture Ch.15) and the field_key registry tooling can query state
  -- without re-deriving it from timestamps.
  status             text            NOT NULL DEFAULT 'local-only'
                      CHECK (status IN ('local-only','syncing','synced','failed','conflict','recovered')),

  -- Optional sub-reason for 'failed', used for the auth_expired UX branch
  -- (architecture Ch.7 scenario G) without overloading `status` itself.
  failure_reason     text            CHECK (failure_reason IS NULL OR failure_reason IN ('network','server_error','auth_expired','conflict','quota_exceeded','unknown')),

  local_updated_at   timestamptz,     -- last time the CLIENT buffer changed (architecture Ch.7)
  server_received_at timestamptz,     -- last time this row was upserted server-side

  created_at         timestamptz     NOT NULL DEFAULT now(),
  updated_at         timestamptz     NOT NULL DEFAULT now(),

  -- Retention (§5). A draft is not meant to outlive its own usefulness once
  -- superseded by canonical content + version history; expires_at bounds it
  -- the same way content_versions rows are bounded, for storage hygiene.
  expires_at         timestamptz     NOT NULL DEFAULT (now() + interval '7 days'),

  -- One current draft per (entity, field, user, tab/device-scope).
  CONSTRAINT autosave_drafts_unique_key
    UNIQUE (entity_type, entity_id, field_key, user_id, client_scope)
);

-- Primary lookup shape used everywhere (architecture Ch.4: "one query shape
-- works for every screen" — `WHERE entity_type = ... AND entity_id = ...`):
CREATE INDEX idx_autosave_drafts_entity
  ON autosave_drafts (entity_type, entity_id, field_key);

-- Ownership-scoped lookup (used by the per-user recovery-on-mount check,
-- architecture Ch.6 "on page load, compare buffer vs canonical"):
CREATE INDEX idx_autosave_drafts_user_entity
  ON autosave_drafts (user_id, entity_type, entity_id, field_key);

-- Cleanup job scan path (§5):
CREATE INDEX idx_autosave_drafts_expires_at
  ON autosave_drafts (expires_at);

-- Status dashboard query (architecture Ch.15.B "overall autosave health: any
-- fields currently failed across the app"):
CREATE INDEX idx_autosave_drafts_status
  ON autosave_drafts (status) WHERE status IN ('failed','conflict');
```

**Design notes not obvious from the DDL comments**:
- `content jsonb` rather than `text`: architecture Ch.10 requires a `schemaVersion` envelope on the client buffer; making the server mirror the same shape (rather than a bare string) keeps client and server representations structurally identical, so no serialize/deserialize asymmetry is introduced between the two halves of "the draft."
- No `FOREIGN KEY` from `entity_id` to any canonical table — this is a deliberate consequence of the generic-key design (Option C, architecture Ch.4), not an oversight. It is listed again in §16 (Risks) as the direct cost of genericity.
- `user_id` defaults to `auth.uid()` at the DB layer specifically so that even if application code forgets to set it explicitly on insert, the row is still correctly attributed (defense-in-depth for the RLS model in §8, not a substitute for it).

---

## 3. Physical Schema — `content_versions`

```sql
-- DESIGN ONLY — NOT EXECUTED. For future migration reference only.

-- Append-only. A row, once written, is never UPDATEd (only ever inserted or,
-- past its retention window, deleted by the cleanup job, §5). Represents "a
-- specific, confirmed-synced (or Final Save, or restore) point in time"
-- (architecture Ch.8).

CREATE TABLE content_versions (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type        text            NOT NULL,
  entity_id          text            NOT NULL,   -- same generic-key rationale as §2
  field_key          text            NOT NULL,

  -- Monotonic per (entity_type, entity_id, field_key) — NOT a global sequence.
  -- Same integer serves both version-history ordering (this table) and the
  -- CAS token on autosave_drafts (§4) — one counter, two uses, per
  -- architecture Ch.8's explicit design choice ("rather than maintaining two
  -- separate counters").
  version_no         integer         NOT NULL,

  content            jsonb           NOT NULL,

  -- Dedup key (architecture Ch.8): a version row is only inserted when this
  -- hash differs from the immediately-preceding version's hash for the same
  -- (entity_type, entity_id, field_key) — except for source='final'/'restore',
  -- which always insert regardless of hash match (§4/§6).
  content_hash       text            NOT NULL,

  -- Distinguishes an autosave snapshot from a deliberate user action, so the
  -- History UI (architecture Ch.15.C) can visually separate "확정 저장" /
  -- "복구 지점" from the denser stream of autosave snapshots.
  source             text            NOT NULL
                      CHECK (source IN ('auto','final','restore')),

  user_id            uuid            NOT NULL REFERENCES auth.users(id),

  created_at         timestamptz     NOT NULL DEFAULT now(),

  -- Computed AT WRITE TIME (architecture Ch.14), not derived on read, so every
  -- read-path query is a simple `WHERE expires_at > now()` regardless of how
  -- the cleanup job is implemented.
  expires_at         timestamptz     NOT NULL DEFAULT (now() + interval '7 days'),

  -- Monotonic version_no is unique per key — this is the invariant the CAS
  -- update in §4 relies on to detect "someone else already advanced past me."
  CONSTRAINT content_versions_unique_version
    UNIQUE (entity_type, entity_id, field_key, version_no)
);

-- History-browsing shape (architecture Ch.15.C: "chronological list of
-- content_versions rows for that entity/field"):
CREATE INDEX idx_content_versions_entity_history
  ON content_versions (entity_type, entity_id, field_key, created_at DESC);

-- Cleanup job scan path (§5):
CREATE INDEX idx_content_versions_expires_at
  ON content_versions (expires_at);

-- Dedup-check lookup ("what was the immediately-preceding version's hash for
-- this key" — architecture Ch.8):
CREATE INDEX idx_content_versions_latest
  ON content_versions (entity_type, entity_id, field_key, version_no DESC);
```

**Why `content_versions` has no `UPDATE`-shaped policy need at all**: because it is append-only by design (architecture Ch.8: "immutable once written"), the RLS design in §8/§13 defines `SELECT` and `INSERT` policies for it and **deliberately no `UPDATE` policy** — there is no legitimate application-level reason for any authenticated user to modify a version row after the fact; doing so would corrupt the history the whole feature exists to provide. `DELETE` is likewise not exposed to ordinary authenticated users (§13) — only the cleanup mechanism (§5) removes rows, and it does so past the retention window, not as an ad hoc user action.

---

## 4. Versioning & Compare-And-Swap

**Where the CAS actually happens**: `content_versions` is append-only, so the compare-and-swap itself is expressed as a conditional `UPDATE` against the **mutable** `autosave_drafts` row for the given `(entity_type, entity_id, field_key, user_id, client_scope)` — not against `content_versions` directly, which never receives an `UPDATE`. The draft row's `version_no` column is the CAS token; a successful CAS advances it, and only a successful CAS is allowed to produce a new `content_versions` INSERT stamped with the new `version_no`.

**Conceptual sync-attempt sequence** (design-only pseudocode, not executed, matches architecture Ch.9/11):

```sql
-- DESIGN ONLY — conceptual, not executed as part of this STEP.
-- Step 1: CAS against the draft row. `:expected_version` is the version_no
-- the client last observed (either from its own last successful sync, or
-- from the draft row's version_no at mount time).

UPDATE autosave_drafts
SET    content            = :new_content,
       version_no         = version_no + 1,
       status             = 'syncing',
       server_received_at = now(),
       updated_at         = now()
WHERE  entity_type  = :entity_type
  AND  entity_id    = :entity_id
  AND  field_key    = :field_key
  AND  user_id      = :user_id
  AND  client_scope = :client_scope
  AND  version_no   = :expected_version         -- <-- the CAS condition
RETURNING *;

-- If this returns 0 rows: the CAS failed — someone else's write already
-- advanced version_no past :expected_version. The client's write is REJECTED
-- outright (never retried blindly against the new version, never silently
-- overwritten) and the field transitions to the `conflict` state
-- (architecture Ch.6/9/13).

-- Step 2 (only reached if Step 1 returned exactly 1 row): the canonical
-- write (to whichever of the 41+13 existing tables this field_key maps to)
-- proceeds through its own existing update path — UNCHANGED by this design
-- (Option C, architecture Ch.4/5: canonical tables and their existing write
-- call sites are not touched). Only after the canonical write itself
-- succeeds does Step 3 run (architecture Ch.11: "draft/version bookkeeping
-- happens AFTER the canonical write's version-gated compare-and-swap
-- succeeds — never before").

-- Step 3: append a version row, but only if content_hash changed since the
-- immediately-preceding version for this key (architecture Ch.8 dedup rule),
-- OR if source is 'final'/'restore' (which always insert regardless of hash).

INSERT INTO content_versions
  (entity_type, entity_id, field_key, version_no, content, content_hash, source, user_id)
SELECT :entity_type, :entity_id, :field_key, :new_version_no, :new_content, :new_hash, :source, :user_id
WHERE  :source IN ('final','restore')
   OR  NOT EXISTS (
         SELECT 1 FROM content_versions
         WHERE entity_type = :entity_type AND entity_id = :entity_id AND field_key = :field_key
           AND version_no = (:new_version_no - 1)
           AND content_hash = :new_hash
       );
```

**Race scenario, reproduced exactly as specified (A built from v10, B built from v11 lands first)**:

1. **T0**: Draft row for `(entity_type='task', entity_id='42', field_key='notes', user_id=U, client_scope='default')` currently has `version_no = 10`.
2. **T1**: Tab/Device A reads the draft at `version_no = 10`, user edits, debounce fires. A's sync attempt is built as: *"CAS from 10 → 11."*
3. **T2**: Before A's request reaches the server, Tab/Device B (same user, different tab — or, in the cross-device recovery case, the same user's phone) also read the draft at `version_no = 10` (it hadn't yet seen A's edit), user edits differently, debounce fires. B's sync attempt is also built as: *"CAS from 10 → 11."*
4. **T3**: B's request reaches the server **first**. The CAS `UPDATE ... WHERE version_no = 10` matches (the row is still at 10) → succeeds, row becomes `version_no = 11`, content = B's content. `content_versions` row for `version_no = 11` is inserted with B's content.
5. **T4**: A's request now arrives, still carrying `:expected_version = 10` (built before A ever saw B's write). The CAS `UPDATE ... WHERE version_no = 10` now matches **zero rows**, because the actual stored `version_no` is already `11` — not because of wall-clock ordering, but because the row's *current* version no longer matches what A assumed when A's request was built.
6. **T5**: A's client observes 0 rows affected → **A's write is rejected outright**. It is never silently retried against the new version and never overwrites B's already-landed content. A's field transitions to the `conflict` state (architecture Ch.6/9). The conflict UI (architecture Ch.13/15) shows B's now-current content plus A's own still-unsent content, and offers keep-mine (re-attempt with a freshly-read version) / take-theirs / view-history — no automatic merge.

This is the same shape whether "A" and "B" are two browser tabs, two devices on the same account, or (per this app's stated single-user-focused RLS scope, §11) two different authenticated users editing the same entity's field — the CAS condition doesn't know or care which; it only knows "the version I assumed vs. the version that is actually there."

**Why this doesn't need to touch canonical tables' concurrency semantics**: per audit §11 and architecture Ch.9, most canonical single-column fields (status, assignee, dates) are intentionally last-write-wins today, and that is judged correct/expected there — this CAS mechanism is scoped to the **draft/version layer only** (this document's two new tables), not retrofitted onto all 41 canonical tables' existing write paths. The one place this CAS primitive is expected to be reused on a canonical write path is Track B's jsonb-notes fix (architecture Ch.17, Option B/child-table normalization) — out of scope for this STEP, noted only for continuity.

---

## 5. Retention & Cleanup (7-day)

**Window definition (re-affirmed from architecture Ch.14)**: rolling **7 × 24 hours from each row's own `created_at`**, not a calendar-day bucket — a version created at 23:59 should get the same ~7-day coverage as one created at 00:01, which a calendar-day rule would not guarantee.

**`expires_at` computation**: computed and stored **at write time** on both tables (`DEFAULT (now() + interval '7 days')` in §2/§3's DDL, or explicitly set by the application to `created_at + interval '7 days'` if the application layer computes `created_at` itself rather than relying on the column default) — never computed at read time. This keeps every read-path query (History UI browsing, recovery-on-mount check) a simple `WHERE expires_at > now()` with zero retention-rule knowledge required outside the write path and the cleanup job.

**Cleanup query shape (design-only, not executed)**:

```sql
-- DESIGN ONLY — NOT EXECUTED. Illustrates the shape only.
DELETE FROM content_versions WHERE expires_at <= now();
DELETE FROM autosave_drafts  WHERE expires_at <= now();
```

A version row that is also the most recent version for its key is **not** given special "keep at least one" treatment past 7 days in this design — architecture Ch.14 defines the retention requirement as a 7-day *window*, not "the last N versions forever." If a field hasn't been touched in 7+ days, its version history ages out entirely, which is consistent with "7-day history," not "permanent history." (This is worth flagging explicitly in the Approval Checklist, §17, since it's a plausible point of user surprise if a different expectation exists.)

**Cleanup subject — options compared (decision deferred to STEP 4/infra, per architecture Ch.14, not decided in this document)**:

| Option | Description | Pros | Cons |
|---|---|---|---|
| `pg_cron` (if enabled on the Supabase project) | A scheduled SQL job running the DELETEs above on an interval (e.g. daily) directly inside Postgres | Simplest, no external moving part, transactional with the DB itself | Requires the `pg_cron` extension to be enabled on this specific Supabase project/plan — unverified from static analysis (audit §13, out of this repo's reach) |
| Supabase Edge Function on a schedule | A Deno-based scheduled function calling the same DELETEs via the Supabase client/service role | Works regardless of `pg_cron` availability, lives in the Supabase project itself | Needs its own deploy/monitoring, another moving part outside plain SQL |
| External scheduled trigger (e.g. a Vercel Cron Job hitting an authenticated API route) | An app-level `route.ts` (this app already has a `route.ts` pattern, audit §2) invoked on a schedule by the hosting platform, running the DELETEs via a service-role client | No dependency on Supabase-side scheduling features at all | Couples cleanup correctness to the hosting platform's cron reliability and the app's own deploy being live; another authenticated code path to secure |

**Recommendation carried forward unchanged from architecture Ch.14**: whichever of these the actual Supabase project/plan already supports should be used; this is an infrastructure fact this STEP (like STEP 1-3) cannot determine without Dashboard access (audit §13), so it remains an Open Question (§15) rather than a decision made here.

**Cleanup failure handling**: a missed or failed cleanup run only causes a **temporary storage-cost overrun** (some rows live slightly past 7 days) — never a correctness problem, because every read path already filters by `expires_at > now()` regardless of whether the row has physically been deleted yet. This is why the *mechanism* is SHOULD-priority (architecture Ch.2 req #19) while the *window correctness* itself is MUST.

**Deletion failure inside a single cleanup run** (e.g., the job errors out partway through a large batch): recommended pattern (design-only) is to run the DELETE in reasonably small, retriable batches (e.g. `DELETE ... WHERE expires_at <= now() LIMIT 500` in a loop, or a batched CTE) rather than one unbounded statement, so a mid-run failure leaves a partially-cleaned table rather than an all-or-nothing transaction that could lock a large number of rows or time out — this is an implementation detail for STEP 4, not a schema decision, but recorded here since it affects whether "cleanup failure" is graceful or not.

**Version generation frequency and the need for compaction (re-affirmed from architecture Ch.14)**: the dedup rule in §4 (only insert a version when `content_hash` differs from the immediately-preceding version, except `final`/`restore`) already substantially throttles naive "one version per keystroke" growth. At this app's actual scale (single-user/small-team, text-sized content, audit §1), even a generous few dozen version rows per actively-edited field per day, across a handful of actively-edited fields, times 7 days, is a small enough volume that **compaction is not required for this STEP's design** — it remains an explicitly deferred, OPTIONAL future enhancement (collapsing same-day `source='auto'` versions into fewer checkpoints after they age past ~24h, while never touching `source='final'`/`'restore'` rows), consistent with architecture Ch.14/22.

---

## 6. Restore Flow

**Principle carried forward unchanged from architecture Ch.15.D, made concrete at the schema level**: restoring a past version **never** directly overwrites the current draft or canonical row in place, and never deletes or mutates the `content_versions` row being restored from (it stays immutable). Restore is expressed as a **new write through the exact same CAS path described in §4**, not a special-cased bypass.

**Restore, step by step (design-only, conceptual)**:

1. User selects a past version `V_old` (some `version_no = k`) from the History panel (architecture Ch.15.C) for a given `(entity_type, entity_id, field_key)`.
2. UI shows an explicit confirmation (architecture Ch.15.D: "현재 내용을 이 시점의 버전으로 되돌립니다. 계속하시겠습니까?") — restore is never a silent one-click action, precisely because it has a much larger blast radius than a routine save despite looking like one.
3. On confirm, the client reads the **current** `version_no` for that key from the draft row (call it `n`) — this is the CAS `:expected_version` for the restore write, exactly as any other sync attempt in §4.
4. The restore write runs through **Step 1-3 of §4's sequence unchanged**: `UPDATE autosave_drafts SET content = V_old.content, version_no = n + 1, ... WHERE version_no = n` (CAS gated exactly like any other write — if someone else changed the row between the user opening the History panel and confirming restore, the CAS fails and the restore attempt itself becomes a `conflict`, same as any other race, rather than blindly clobbering whatever is now current).
5. If the CAS succeeds, the canonical write proceeds through the existing (unchanged) canonical write path for that field, exactly as any other sync (architecture Ch.5/11 — Option C never bypasses the canonical table).
6. A new `content_versions` row is inserted at `version_no = n + 1` with `content = V_old.content` and **`source = 'restore'`** — always inserted regardless of the content-hash dedup rule (§4 Step 3's `WHERE :source IN ('final','restore') OR ...` clause), so a restore is always visible as its own distinct history entry, never silently merged away as "identical to the previous version" even if the restored content happens to match something recent.

**Does restore create a new version, or reuse the old one?** **Always creates a new version** (`version_no = n + 1`, `source = 'restore'`). The old version (`V_old`, still at its original `version_no = k`) is left completely untouched in `content_versions` — restoring does not move, rename, renumber, or delete it. This means the history after a restore reads, in order: `..., k (source=auto, the content just restored from), ..., n (whatever was current right before restore), n+1 (source=restore, content = V_old's content)` — the fact that a restore happened is itself part of the permanent record, and the pre-restore content (`n`) is never lost, exactly as architecture Ch.15.D specifies.

**Immediate-overwrite is explicitly disallowed by this design**: there is no "fast path" restore SQL that writes directly to the canonical table or to `content_versions` without going through the draft row's CAS gate — this is deliberate, not an oversight, since a restore skipping the CAS check would reintroduce exactly the kind of silent-overwrite race this whole document exists to prevent (§4), just triggered by a restore button instead of ordinary typing.

---

## 7. Migration Plan (design-only)

**Nothing in this section is executed.** This re-sequences architecture Ch.20's 7 phases (Phase 0 through Phase 6) at the DB-design level this STEP adds — i.e., which of *this document's* schema objects (§2/§3) and RLS policies (§8/§13) come into existence in which phase, and what verification each phase needs before the next begins. Track B (jsonb-notes normalization) content in Phase 3 is summarized only for continuity — its own design detail is architecture Ch.17, not re-derived here.

| Phase | DB-design content (this document's scope) | Non-DB content (carried from architecture Ch.20/21) | Verification before proceeding | Rollback |
|---|---|---|---|---|
| **Phase 0 — Safety patches** | **No new schema.** Zero dependency on `autosave_drafts`/`content_versions` existing. | The 3 P0 immediate code patches (architecture Ch.21): tasks/[id] draft-wiped-on-failure, meetings/[id] & MobileMemoSheet failure-shown-as-success, interim optimistic-lock guard on the 3 jsonb `notes` columns (Track B interim, not the full normalization). | Manually reproduce each audit-documented repro step before/after; confirm draft/input now retained and failure visibly surfaced. | Each patch is an independent few-line diff, revertible via normal git revert; zero schema/data dependency. |
| **Phase 1 — Build Autosave Core (DB)** | **Both tables created** exactly as §2/§3, all indexes and constraints in place. **RLS enabled and all policies from §8/§13 applied** at this point — RLS should not be an afterthought bolted on after data exists, it is part of the table's initial creation. | The shared `useAutosave()` hook/adapter (design only, not built in this STEP either — architecture Ch.5). No existing screen migrated onto it yet. | Test the CAS update (§4) and both tables' RLS policies (§8/§13, test matrix §12) against a throwaway `entity_type` value — not any of the 35 real screens — before anything real depends on these tables. | Trivially safe: `DROP TABLE autosave_drafts, content_versions` — nothing in the existing 41+13-table app references them yet. Zero blast radius on existing functionality. |
| **Phase 2 — Quick Memo pilot** | No new schema; first real `entity_type` value (`'quick_memo'` or similar) is registered and exercised against the Phase 1 tables/RLS. | Migrate `memo/quick/page.tsx` onto the new hook (architecture Ch.20 Phase 2 — chosen as pilot because it already has the most sophisticated existing draft/error logic, audit §12). | Re-run the audit's own quick-memo verification checklist (STEP 2 §3) against the migrated version; confirm zero regression plus new 7-day version history now available. | Quick-memo is a self-contained popup, not depended on by other screens' persistence — revertible independently; falling back means simply not calling the new hook, old localStorage-only path still intact until Phase 6. |
| **Phase 3 — Meeting notes (Track A + Track B combined)** | New `entity_type` values registered per normalized meeting-note row (architecture Ch.17 Option B: each note becomes its own addressable entity for the Autosave Core, "zero special-casing" per Ch.17's own comparison table). **This document's tables need no schema change for this** — the generic key shape already accommodates a new entity_type value; only Track B's own child-table migration (out of this STEP's scope) is new schema, and it is not designed here. | Track B's jsonb→child-table normalization (architecture Ch.17/20 Phase 3) executed together with bringing meeting notes onto the Core. | Data-migration row-count comparison before/after exploding the jsonb array (Track B, not this document); functional check that all 3 existing write surfaces (meeting page, schedule widget, home brief widget) work against the new shape with no user-visible regression. | Keep the old `notes` jsonb column in place, unused, for at least one release cycle (Track B's own rollback plan) before ever dropping it; this document's 2 tables are unaffected either way. |
| **Phase 4 — Task/Project detail-editor screens** | No new schema; largest batch of new `entity_type`/`field_key` registrations (tasks/[id], subtasks/[id], project/items/[id], annual-goals/tasks/[id], one-on-one session notes, learning notes, template, `useUserSetting`-backed settings), migrated file-by-file in P0/P1 severity order (tasks/[id] first, per its confirmed concrete P0 bug). | Per-file hook migration (architecture Ch.20 Phase 4). | Per-file: confirm the specific audit-documented repro now shows retained draft + visible failure instead of silent loss. | Per-file independent diffs against each screen's own debounce call site. |
| **Phase 5 — Remaining editors** | No new schema; remaining `entity_type`/`field_key` registrations (sketch canvas, home-dashboard widgets, settings page, decisions/persona-log, perf-review, objectives/objective-review **only if** architecture Ch.19's product decision on `obj_*` vs `objective*_v2` has been made — otherwise deferred without blocking anything else in this plan, since the generic key shape doesn't require knowing which schema is "the real one," per architecture Ch.19). | Same per-screen migration pattern as Phase 4; SketchCanvas's existing optimistic-rollback/drag-stop-only timing explicitly preserved, wrapped rather than replaced. | Same per-screen verification pattern. | Same per-file independence. |
| **Phase 6 — Legacy localStorage cleanup** | No schema change; this is a code-only cleanup (removing now-dead localStorage key read/write call sites) after the compatibility-read window from architecture Ch.10 has elapsed for every migrated screen. | Remove old constants/logic that wrote the ~19 legacy localStorage keys (audit §5), once code-search confirms no remaining reader depends on them. | Confirm via code search no read/write call sites reference old keys before removing them. | Lowest-urgency phase; rollback is simply not deleting yet if any doubt remains. |

**Note on RLS placement in this sequencing (specific to this STEP's addendum)**: unlike architecture Ch.20 (which didn't need to specify RLS timing since it wasn't the DB-design STEP), this plan places **all of §8/§13's RLS policies at Phase 1**, applied at table-creation time, not retrofitted after Phase 2+ starts writing real user data into these tables. This avoids ever having a window where `autosave_drafts`/`content_versions` exist with data in them but no RLS — a state this document's own security analysis (§9-§14) would have to treat as an active gap, not just a design question.

---

## 8. RLS Design — Autosave Tables

**Scope of this section**: RLS for the **two new tables only** (`autosave_drafts`, `content_versions`). This section evaluates whether these two tables' own access control is sound. It does **not** by itself answer whether a user's access to an autosave draft correctly mirrors their access to the underlying canonical entity — that question is evaluated separately and explicitly in §9-§11, per this STEP's instruction not to conflate the two.

**Scale context carried from the audit/architecture and re-affirmed here**: this app is single-user/small-team internal use (audit §1); the task brief instructs against designing unnecessary organization/team-level authorization. The RLS design below is intentionally an **ownership model** (`auth.uid() = user_id`), not a role/org/team model — anything more is over-engineering for this app's actual scale, per the task's explicit instruction.

```sql
-- DESIGN ONLY — NOT EXECUTED.

ALTER TABLE autosave_drafts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- autosave_drafts — mutable, owner-only, full CRUD by the owner
-- ============================================================

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

-- UPDATE needs BOTH USING and WITH CHECK (see §13 for why USING-only is a
-- vulnerability): USING gates which existing rows can be targeted (must
-- already belong to me), WITH CHECK gates what the row is allowed to look
-- like AFTER the write (must still belong to me) — without WITH CHECK, a
-- malicious/buggy client could UPDATE ... SET user_id = <someone_else> and
-- effectively donate/hijack ownership of a row.
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

-- No policy at all is granted to the `anon` role — Postgres RLS default-denies
-- any operation for which no permissive policy matches, so unauthenticated
-- access requires no explicit "DENY" policy, only the absence of an ALLOW one.

-- ============================================================
-- content_versions — append-only, owner-scoped SELECT/INSERT, NO UPDATE,
-- NO ordinary-user DELETE (immutability is enforced by policy absence)
-- ============================================================

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

-- Deliberately NO UPDATE policy for `authenticated` — a version row must
-- never be mutated after insert (§3's immutability requirement). Absence of
-- a policy is itself the enforcement mechanism under RLS's default-deny model.

-- Deliberately NO DELETE policy for `authenticated` either — ordinary users
-- never delete their own history rows directly; only the retention cleanup
-- job (§5) removes rows, and it is expected to run as `service_role` (which
-- bypasses RLS entirely by Supabase convention) or via a SECURITY DEFINER
-- function scoped narrowly to the expires_at <= now() condition — NOT via a
-- general "authenticated users may delete their own versions" policy, which
-- would let a user destroy their own audit trail (undesirable even though
-- it's "their own" data, since the whole point of the history feature is an
-- honest, tamper-resistant record of what was actually saved).
```

**Why ownership (`user_id`), not `entity_type`/`entity_id`, is the RLS predicate**: this is the crux of the security addendum (§9-§11) and is deliberately *not* buried in this section — it is called out again explicitly there. The short version: gating solely by `user_id` correctly isolates *draft/version rows* between users, but says nothing about whether the *canonical entity* itself (e.g. a specific `task` row) is something this user should be able to see at all — because, per audit §6a, canonical RLS currently grants that to every authenticated user unconditionally anyway.

**RLS exposure vs. architecture Ch.4's original scoring**: architecture Ch.4 scored Option C's "Supabase RLS 적용난이도" as "Trivial — 2 tables need one permissive policy each, matching the existing `USING (true)` pattern everywhere else." **This document does not adopt that permissive `USING (true)` pattern for the new tables** — it deliberately upgrades to an ownership-scoped policy (`auth.uid() = user_id`) instead, specifically because this STEP's task brief requires treating draft/history data (which can contain partially-typed, unconfirmed personal notes) as more sensitive than "trivially matching the existing lax pattern," even though the existing canonical tables (§9) are not being retroactively hardened to match. This is a considered deviation from architecture Ch.4's original scoring, not an inconsistency with it — Ch.4's scoring was evaluating implementation *effort*, not asserting that `USING (true)` was the *correct* choice for these specific tables.

---

## 9. Canonical RLS Security Gap

**This section is intentionally verbatim-equivalent to the task brief's required text, per instruction:**

> ## Canonical RLS Security Gap
> 현재 기존 canonical table의 RLS가 사실상 USING(true)인 구조이므로,
> 새 autosave table의 RLS를 강화하는 것만으로 기존 canonical data의
> 접근통제가 해결되는 것은 아니다. 따라서 autosave table 자체의 RLS 보안과
> canonical entity의 접근통제는 별개의 보안 문제로 취급한다.
> 이번 STEP 4에서는 기존 canonical table의 RLS를 임의로 변경하지 않는다.
> 기존 canonical RLS hardening은 별도의 후속 작업으로 기록한다.

**Elaboration, grounded in the specific facts this STEP inherited**:

- **The fact**: audit §6a, directly re-cited (not re-derived) here: *"All RLS policies found are permissive: `FOR ALL TO authenticated USING (true) WITH CHECK (true)`... There is no row-level ownership/ACL model — any authenticated session can read/write any row."* This applies to all 28 documented canonical tables; the 13 undocumented tables' RLS is not even *knowable* from this repo (audit §6b/§13 #1) — so at minimum 28 tables are confirmed wide-open to any authenticated session, and 13 more are of unknown but unverified posture.
- **The consequence for this STEP's design**: §8's ownership-scoped RLS on `autosave_drafts`/`content_versions` is strictly **stricter** than every existing canonical table's RLS in this app. That is a real security improvement **for the two new tables themselves** — it correctly prevents User B from reading User A's draft/version rows (verified in §10/§12). But it does **not**, and cannot, retroactively make the *canonical* `tasks`/`meetings`/etc. rows any less open than they already are today. Anyone who can authenticate to this app can already read and write **every** canonical entity in the 41+13-table schema, regardless of anything designed in this document.
- **Restated explicitly, as required**: **새 autosave table의 RLS를 안전하게 설계하는 것과 기존 canonical table의 접근통제를 안전하게 만드는 것은 별개의 문제다.** ("Designing the new autosave table's RLS safely and making the existing canonical table's access control safe are separate problems.") This sentence is repeated verbatim here and cross-checked again in §14/§15 per the task's self-verification requirement.
- **What this STEP does and does not do about it**: this STEP does **not** touch, alter, tighten, or add any policy to any of the 41+13 existing canonical tables — per the absolute rules governing this STEP. The canonical RLS weakness is recorded here as a **Security Gap** and again in Open Questions (§15) with candidate follow-up strategies (§11) — it is explicitly not resolved, not silently assumed away, and not something this document claims credit for fixing.

---

## 10. Attack Scenario Analysis

**Scope**: does knowing only an `entity_id` (or a `draft_id`/`version_id`, i.e. this table's own primary key) let User B read User A's autosave data, under the RLS design in §8? Each sub-scenario below is evaluated against the **designed** policies in §8 (this is a design-time analysis of the SQL text in §8 — it has not been executed or tested against a live Supabase instance, since no table was actually created in this STEP).

**Setup**: User A has a draft: `autosave_drafts` row with `entity_type='task', entity_id='123', user_id=A`. User B is a different authenticated user (or has guessed/been told `entity_id=123`, e.g. via a shared URL — the audit found no ID-obscurity mechanism anywhere in this app, so entity IDs should be assumed guessable/knowable across users in general).

| Scenario | User B's query (conceptual) | Result under §8's RLS design | Why |
|---|---|---|---|
| **entity_id only** | `SELECT * FROM autosave_drafts WHERE entity_id = '123'` | **Empty result set** for User A's row (User B only sees rows where `user_id = B`, if any exist) | RLS is applied as an implicit `AND` on every row Postgres would otherwise consider, **regardless of which columns appear in the query's own `WHERE` clause**. The query's `WHERE entity_id='123'` narrows candidate rows; RLS then filters that candidate set down to `user_id = auth.uid()`. User A's row (`user_id=A`) never appears to User B, no matter what other predicate the query uses. |
| **entity_type + entity_id only** | `SELECT * FROM autosave_drafts WHERE entity_type='task' AND entity_id='123'` | Same as above — **empty** for User A's row | Identical reasoning; adding `entity_type` to the WHERE clause changes nothing about the RLS predicate itself. |
| **draft `id` (this table's own PK) known** | `SELECT * FROM autosave_drafts WHERE id = '<A's draft uuid>'` | **Empty** — even knowing the exact primary key of A's row | RLS applies to `SELECT` regardless of whether the query targets a row by its own primary key or by any other column. Knowing a UUID does not grant access; UUIDs are not a secondary auth mechanism here, ownership is. |
| **version `id` (content_versions PK) known** | `SELECT * FROM content_versions WHERE id = '<A's version uuid>'` | **Empty**, same reasoning as the draft-id case, applied to `content_versions_select_own` | Identical RLS shape on the second table. |
| **`content_versions` via entity_id only** | `SELECT * FROM content_versions WHERE entity_type='task' AND entity_id='123'` | **Empty** for User A's version rows | Same reasoning as the first two rows, applied to the second table. |
| **UPDATE by entity_id or draft id, no ownership** | `UPDATE autosave_drafts SET content=... WHERE entity_id='123'` (or `WHERE id=...`) | **0 rows affected** | `autosave_drafts_update_own`'s `USING` clause filters candidate rows to `user_id = auth.uid()` before the UPDATE can touch them — User A's row is not a candidate for User B's UPDATE regardless of the WHERE clause used to target it. |
| **DELETE by entity_id or draft id, no ownership** | `DELETE FROM autosave_drafts WHERE entity_id='123'` | **0 rows affected** | Same `USING`-clause reasoning, on `autosave_drafts_delete_own`. |

**Conclusion for this attack class, under the §8 design**: **knowing `entity_id`, `entity_type+entity_id`, a draft's own `id`, or a version's own `id` does not, by itself, expose another user's autosave draft or version data**, because every policy's predicate is `auth.uid() = user_id`, applied uniformly regardless of what the query's own WHERE clause contains. This is the direct benefit of an ownership-column-based policy over an "obscurity via unguessable ID" approach (audit found no such reliance anywhere, and this design does not introduce one either — it doesn't need to, since RLS is the real gate).

**What this analysis does *not* cover (the actual gap, restated from §9)**: this analysis only concerns the **draft/version rows themselves**. It says nothing about whether User B, having learned `entity_id=123` refers to a real `task` row, can go read that task's **canonical** content directly via `SELECT * FROM tasks WHERE id=123` — and per §9/audit §6a, the answer to *that* question is **yes, unconditionally**, because canonical RLS is `USING (true)`. So: the autosave layer is not the weak point in this attack path; the canonical layer already was, before this document existed, and remains so after it. An attacker who wants entity content doesn't need to attack `autosave_drafts` at all — they can simply query the canonical table directly, today, with no change from this STEP either enabling or preventing that.

---

## 11. Canonical Entity Authorization Options (A/B/C/D)

**The question**: should a user be able to see/query an entity's autosave draft/history **without independently verifying they have legitimate access to that entity's canonical row**? Given audit §6a (canonical RLS is `USING (true)` for all authenticated users on all 28 documented tables, and unknown-but-unverified for the 13 undocumented ones), this question currently has an unusual answer: **canonical access is already granted to every authenticated user unconditionally**, so there is, at present, no meaningful "legitimate access" boundary at the canonical layer to check against in the first place. The four options below are compared on that basis — not against an ACL model this app doesn't currently have.

| | **Option A — Ownership only** (`user_id` on the draft/version row, §8's actual design) | **Option B — Canonical entity access check in RLS** | **Option C — Common authorization function** | **Option D — Harden canonical RLS first, then apply autosave RLS** |
|---|---|---|---|---|
| **Description** | Autosave/version row visibility gated solely by who created that specific draft/version row. | The autosave RLS policy itself queries/joins against the relevant canonical table to check the requesting user has "access" to that entity, in addition to draft ownership. | Introduce one shared SQL function (e.g. `can_access_entity(entity_type, entity_id)`) called from every autosave RLS policy, centralizing whatever the access rule ends up being. | Before applying any RLS to `autosave_drafts`/`content_versions`, first retrofit real ownership/ACL policies onto the 41+13 canonical tables (replacing `USING (true)`), then have autosave RLS reference that now-real canonical ACL. |
| **보안성 (security)** | Correctly isolates *draft rows* between users (§10) but is **decoupled** from canonical access — a user could in principle have a draft-visible entity they can't "really" access if a real canonical ACL existed (moot today, since canonical is `USING(true)` for everyone). | Strongest *in principle* — draft visibility would track real entity access — but only as strong as the canonical check it delegates to; today that check would evaluate to "always true" per audit §6a, so it provides **no additional security over Option A right now**, only future-proofing. | Same ceiling as B (only as strong as the underlying canonical rule, which is currently `true`), with the benefit of one reviewable place to update later. | Highest **eventual** ceiling (real canonical ACL + consistent autosave check) — but is a different, larger, and separately-scoped project (retrofitting 41+13 tables' access model) that this STEP is explicitly forbidden from doing (absolute rule #5). |
| **구현 복잡도 (implementation complexity)** | Lowest — a single `auth.uid() = user_id` predicate, no cross-table reference. | Higher — every autosave policy needs a subquery/join into the relevant canonical table per `entity_type`, which given the generic `(entity_type, entity_id)` design (§2/§3) would require a dynamic per-type dispatch (e.g. a `CASE entity_type WHEN 'task' THEN EXISTS(SELECT 1 FROM tasks WHERE id=entity_id ...) WHEN 'meeting' THEN ...`) that must be kept in sync with all 41+13 tables' own (currently nonexistent) access rules. | Centralizes B's complexity into one function, but the function itself is exactly as complex as B's per-type dispatch — moves the complexity, doesn't reduce it. | Complexity of B/C, **plus** the complexity of designing and rolling out real ACLs across 41+13 canonical tables first — a substantially larger scope than this STEP. |
| **성능 (performance)** | Fastest — a single indexed equality check (`user_id = auth.uid()`), no joins. | Slower — a join/subquery against a canonical table (some of which, like `objective-review`'s tables, are large/complex per audit §6b) evaluated per row on every RLS-gated query. | Same performance cost as B (it's the same check, just named). | Same as B/C once implemented, plus whatever cost the new canonical ACL checks themselves add to every canonical-table query app-wide (a much larger surface than just the 2 autosave tables). |
| **유지보수 (maintainability)** | Simplest to reason about and audit — one predicate, no per-entity-type special-casing to keep current as new entity types are added (architecture Ch.22's field_key registry already needs governance; Option A doesn't add a second governance surface on top of it). | Every new `entity_type` registered for autosave (architecture Ch.20's phased rollout adds ~35 of these over time) needs its own canonical-access-check branch added and kept correct — a recurring maintenance cost that scales with rollout, not a one-time cost. | Same recurring cost as B, marginally better organized (one function to update instead of N inline policy clauses), but the underlying per-entity-type knowledge still has to be added and maintained as new entity types roll out. | Requires maintaining both the canonical ACL model *and* the autosave-side check referencing it — the union of B/C's maintenance cost and a new canonical-ACL maintenance cost that doesn't exist today. |
| **현재 프로젝트 적합성 (fit for this project, today)** | **Best fit today**: matches the task brief's explicit instruction not to over-engineer org/team authorization for a single-user/small-team app; provides real, verifiable protection for the actual sensitive content (a draft is arguably *more* sensitive than a saved canonical row, since it may contain half-typed, not-yet-reviewed text) without requiring a canonical ACL model this app doesn't have. | **Poor fit today** — the extra complexity buys no actual additional security right now (canonical check would just evaluate `true`), since there's no real canonical ACL to check against yet; it's complexity paid for now against a benefit that only materializes once Option D's prerequisite is separately done. | Same poor-fit reasoning as B for *today*, though somewhat better positioned as a **future** landing spot if/when Option D's canonical hardening happens — the function could initially just wrap `true` and be swapped later without touching every policy again. | **Correct sequencing in principle, wrong scope for this STEP** — hardening 41+13 canonical tables' RLS is a large, separate, high-blast-radius project explicitly forbidden by this STEP's absolute rules; cannot be "the answer" for STEP 4 even if it's the right eventual destination. |

**This document's position (a recommendation for *this table's own RLS*, not a resolution of the canonical gap — consistent with §9)**: **Option A** is what §8 actually implements, and is judged the right choice *for now*, specifically because (a) it is the only option that doesn't require touching or depending on the canonical RLS this STEP is forbidden from changing, (b) it provides real, non-theatrical protection for the draft/version data itself (§10 confirms no ID-guessing bypass), and (c) options B/C's extra complexity would currently purchase zero additional security given canonical RLS is `USING(true)` — they'd be "checking against a check that always passes," which is complexity without benefit until Option D's prerequisite work happens separately. **This is not a claim that Option A "solves" canonical authorization** — per §9, it explicitly does not, and cannot. Option C (common authorization function, initially wrapping a `true`/ownership-only check, swappable later) is flagged as the most promising **future** landing spot if/when canonical hardening (Option D's prerequisite) is separately undertaken, since it would let the eventual real check be introduced in one place rather than N inline policies — but that is a recommendation for a *future* STEP, not a decision made here.

---

## 12. RLS Test Matrix (10 tests)

All tests evaluate the **designed** SQL in §8 (conceptual/design-time reasoning — no live Supabase instance was created or queried to run these tests in this STEP, per the absolute rule against creating tables). "ALLOW"/"DENY" describes the row-count outcome the policy text implies, not an executed test result.

| # | Test | Actor | Action | Verdict | Why (schema/RLS reasoning) |
|---|---|---|---|---|---|
| 1 | User A → own draft SELECT | User A | `SELECT` own `autosave_drafts` row | **ALLOW** | `autosave_drafts_select_own`'s `USING (auth.uid() = user_id)` matches — the row's `user_id` is A, `auth.uid()` is A. |
| 2 | User A → own draft UPDATE | User A | `UPDATE` own `autosave_drafts` row (e.g. new content, same user_id) | **ALLOW** | `autosave_drafts_update_own`'s `USING` matches the existing row (owned by A); `WITH CHECK` matches the post-write row too, since `user_id` is not being changed. |
| 3 | User B → User A draft SELECT | User B | `SELECT` targeting User A's row (by any column) | **DENY** | `USING (auth.uid() = user_id)` evaluates `auth.uid()=B` against `user_id=A` → false → row excluded from the result set entirely (returns empty, not an error). |
| 4 | User B → User A draft UPDATE | User B | `UPDATE` targeting User A's row | **DENY** | `autosave_drafts_update_own`'s `USING` clause excludes the row as a candidate before any `SET` is considered → 0 rows affected. |
| 5 | User B → User A draft DELETE | User B | `DELETE` targeting User A's row | **DENY** | `autosave_drafts_delete_own`'s `USING (auth.uid() = user_id)` excludes the row → 0 rows affected. |
| 6 | User B → User A content_versions SELECT | User B | `SELECT` targeting User A's version row | **DENY** | `content_versions_select_own`'s `USING (auth.uid() = user_id)` excludes the row, identical mechanism to test 3, applied to the second table. |
| 7 | User B → entity_id only, draft SELECT | User B | `SELECT * FROM autosave_drafts WHERE entity_id = <A's entity_id>` | **DENY** | Per §10's attack analysis: RLS is applied regardless of which columns the query's WHERE clause references; `entity_id` is not part of any policy's predicate, so it provides no bypass. |
| 8 | User B → draft_id known, SELECT | User B | `SELECT * FROM autosave_drafts WHERE id = <A's draft PK>` | **DENY** | Same reasoning as test 7 — knowing the table's own primary key does not satisfy `auth.uid() = user_id` if User B is not that row's owner. |
| 9 | User B → version_id known, SELECT | User B | `SELECT * FROM content_versions WHERE id = <A's version PK>` | **DENY** | Same reasoning as tests 7/8, applied to `content_versions_select_own`. |
| 10 | Unauthenticated → any autosave access | `anon` / no session | Any `SELECT`/`INSERT`/`UPDATE`/`DELETE` on either table | **DENY** | No policy in §8 grants any privilege to the `anon` role — RLS's default-deny model means the absence of a matching permissive policy is itself a denial, with no explicit "deny anon" policy needed. Additionally, `auth.uid()` evaluates to `NULL` for an unauthenticated request, so even a hypothetical policy using `auth.uid() = user_id` would never match (`NULL = anything` is `NULL`, not `true`, in SQL's three-valued logic) — a second, independent reason access is denied even if a policy mistakenly targeted `anon`. |

**Summary**: all 10 tests resolve as expected under the §8 design — owner ALLOW (tests 1-2), cross-user DENY regardless of which identifier is used to attempt the access (tests 3-9), and unauthenticated DENY by both policy-absence and `auth.uid()` NULL-semantics (test 10). This matrix is a **design-time verification of the SQL text**, not a substitute for actually running these 10 tests against a real Supabase instance with test users once Phase 1 (§7) creates the tables — that live verification is listed in the Approval Checklist (§17) as still required before Phase 2 depends on this RLS being correct in practice, not just on paper.

---

## 13. RLS Policy SQL Review (design-only)

Per-policy review of every policy in §8's design, focused specifically on the task brief's flagged risk: **USING without a matching WITH CHECK on UPDATE, and DELETE's USING condition.**

| Policy | Table | Command | USING | WITH CHECK | Security purpose | Review finding |
|---|---|---|---|---|---|---|
| `autosave_drafts_select_own` | `autosave_drafts` | SELECT | `auth.uid() = user_id` | n/a (SELECT has no WITH CHECK) | Restrict visibility to the row's own creator. | Sound — SELECT only needs USING. |
| `autosave_drafts_insert_own` | `autosave_drafts` | INSERT | n/a (INSERT has no USING) | `auth.uid() = user_id` | Prevent a user from inserting a draft row attributed to someone else. | Sound — INSERT only needs WITH CHECK; without it, User B could `INSERT ... (user_id) VALUES (A)` and plant a row that then displays as A's draft (a form of forgery, even if B still can't *read* it back per test 3). |
| `autosave_drafts_update_own` | `autosave_drafts` | UPDATE | `auth.uid() = user_id` | `auth.uid() = user_id` | Restrict *which* rows can be targeted (USING) **and** restrict what the row is allowed to become after the write (WITH CHECK). | **This is the specific case the task brief flags.** If this policy had `USING (auth.uid() = user_id)` **without** a `WITH CHECK`, Postgres RLS would still correctly restrict *which existing rows* can be updated (only A's own), but would **not** restrict what those rows can be changed *to* — meaning User A could `UPDATE autosave_drafts SET user_id = <B>, content = <malicious> WHERE id = <A's own row>`, reassigning ownership of their own row to another user, effectively "gifting" or (more concerning) framing content as belonging to B, or more subtly, a bug in the hook's own code could accidentally clear/reassign `user_id` on an update without RLS catching it. **With `WITH CHECK (auth.uid() = user_id)` present** (as designed in §8), any UPDATE that would result in a row where `user_id ≠ auth.uid()` is rejected outright, regardless of whether the *pre*-update row was correctly owned. **Confirmed present in this design — not a gap.** |
| `autosave_drafts_delete_own` | `autosave_drafts` | DELETE | `auth.uid() = user_id` | n/a (DELETE has no WITH CHECK) | Restrict deletion to the row's own owner. | Sound — DELETE only needs USING (there's no "what does the row become" question for a delete). Reviewed specifically per the task brief's instruction to check DELETE's USING condition: it correctly excludes non-owned rows as delete candidates (test 5, §12). |
| `content_versions_select_own` | `content_versions` | SELECT | `auth.uid() = user_id` | n/a | Restrict history visibility to the row's own creator. | Sound, same shape as the drafts SELECT policy. |
| `content_versions_insert_own` | `content_versions` | INSERT | n/a | `auth.uid() = user_id` | Prevent a user from inserting a version row attributed to someone else. | Sound — same forgery-prevention reasoning as the drafts INSERT policy. |
| *(no UPDATE policy)* | `content_versions` | UPDATE | — | — | Enforce immutability of history rows. | **By design, not a gap.** RLS default-denies any command with no matching permissive policy — the complete absence of an UPDATE policy for `authenticated` means no authenticated user, owner or not, can modify a version row post-insert. This is the correct way to express "append-only" at the RLS layer. |
| *(no DELETE policy for `authenticated`)* | `content_versions` | DELETE | — | — | Prevent ordinary users from destroying their own history (tamper-resistance), while still allowing the retention cleanup job (§5) to remove expired rows. | **By design.** Cleanup is expected to run as `service_role` (bypasses RLS by Supabase convention) or a narrowly-scoped `SECURITY DEFINER` function — not as a general `authenticated`-role DELETE policy. If a future implementer *adds* a DELETE policy for `authenticated` "for convenience," that would re-introduce the ability for a user to erase their own audit trail — flagged here explicitly so it isn't done accidentally during STEP 4 implementation. |

**Overall SQL review verdict for §8's policy set**: no USING-without-WITH-CHECK gap found on the UPDATE policy (the specific vulnerability class the task brief warned about is checked and confirmed absent); DELETE's USING condition is correctly ownership-scoped on `autosave_drafts` and correctly *absent* (by design) for ordinary users on `content_versions`. This is a review of the **design text only** — §17's Approval Checklist still lists actually applying and then live-testing these exact policies against a real Supabase instance as a pre-implementation requirement, since a design review cannot substitute for execution against the real Postgres RLS engine.

---

## 14. Final Security Verdict (3-way split)

As required, **not** collapsed into a single blanket judgment:

```
1. Autosave table RLS:              PASS (design-level)
2. Canonical entity authorization:   PARTIAL / NOT FULLY VERIFIED
3. Overall Autosave Security:        PARTIAL
```

**1. Autosave table RLS — PASS (design-level)**: §8's policy design, reviewed in §13 and exercised against the 10-test matrix in §12, correctly isolates `autosave_drafts`/`content_versions` rows by owner (`auth.uid() = user_id`), correctly requires `WITH CHECK` alongside `USING` on the one UPDATE policy where its absence would be exploitable, correctly omits `UPDATE`/`DELETE` policies for `authenticated` on the append-only `content_versions` table, and correctly denies access via `entity_id`, `draft_id`, or `version_id` alone (§10) as well as to unauthenticated requests (test 10, §12). **Caveat, stated explicitly rather than glossed over**: this is a **design-level** PASS — no table was actually created and no policy was actually applied or tested against a live Supabase instance in this STEP (per the absolute rule against creating tables). The Approval Checklist (§17) lists live verification against a real instance with real test users as a required step before Phase 2 (§7) proceeds to depend on this being correct in practice.

**2. Canonical entity authorization — PARTIAL / NOT FULLY VERIFIED**: this is **not** a PASS, for the reason required by the task brief: canonical RLS across the 41+13 existing tables is `USING (true)` (documented tables, audit §6a) or of entirely unknown posture (13 undocumented tables, audit §6b/§13). There is, today, no real canonical-entity access-control boundary for autosave to correctly delegate to, verify against, or be consistent with — so the question "does autosave access correctly reflect canonical access" cannot be answered PASS, because the canonical side of that comparison is not a meaningful access-control boundary in the first place. It is also not judged a hard FAIL, because §8's design does not *create* a new privilege-escalation path relative to today's baseline — if anything, autosave's ownership scoping is *more* restrictive than the canonical tables it sits alongside, not less. **UNKNOWN** would also be a defensible label for this row; PARTIAL is used here to reflect that the situation is at least partially characterized (§9-§11 above) rather than entirely opaque, but it is explicitly **not** PASS, per the task's instruction not to declare this solved.

**3. Overall Autosave Security — PARTIAL**: because component 2 is not a clean PASS, the overall verdict cannot be a clean PASS either, per the task brief's explicit instruction ("canonical RLS가 USING(true)인 상태이므로 근거 없이 전체를 PASS로 판정하지 마라"). The new tables' own RLS is sound at the design level (component 1), but the system this document's tables live inside (the other 41+13 tables) has a pre-existing, unresolved, and un-remediated access-control gap that this STEP was explicitly forbidden from touching (absolute rule #5, §9). "Overall Autosave Security" necessarily inherits that unresolved state as long as it is evaluated honestly against the whole system rather than just the two new tables in isolation.

---

## 15. Open Questions

Carried forward from architecture Ch.25 (unresolved by static analysis there) where still relevant to this DB-design STEP, plus new questions this STEP's RLS addendum raises. **The canonical-RLS question required by this STEP's task brief is listed first and is not optional to omit:**

1. **기존 canonical tables의 RLS가 사실상 `USING(true)`인 상태에서, autosave entity 접근권한을 canonical entity의 실제 접근권한과 어떻게 연결할 것인가?** (Required by this STEP's addendum, §F.) Four candidate follow-up strategies, **not decided here** (per instruction — options only):
   - **전략 A — Canonical RLS hardening 먼저, 그 다음 autosave 적용** (architecture-doc's Option D, §11 above): highest eventual security ceiling, but is a large, separately-scoped project (retrofitting real ACLs onto 41+13 tables) that this STEP is explicitly forbidden from starting; risk of indefinitely blocking autosave rollout if treated as a hard prerequisite.
   - **전략 B — Autosave ownership 우선 적용** (Option A, what §8 actually implements): ships now, provides real protection for the new tables' own data, but knowingly leaves the canonical-authorization question open, relying on the fact that it doesn't make anything *worse* than today's baseline.
   - **전략 C — Entity별 authorization function 구축** (Option C, §11): centralizes the eventual real check in one reviewable place; low value until canonical hardening (전략 A) happens, but cheap to prepare a "wraps `true` today" version of the function now so autosave policies can be re-pointed at it later without a second migration.
   - **전략 D — 단계적 canonical RLS hardening** (Option D but phased, e.g. table-by-table instead of all-at-once): reduces the all-or-nothing risk of 전략 A, but means the canonical-authorization gap closes unevenly and slowly, and autosave's own policies would need periodic re-evaluation against an ACL model that's only partially real at any given point.
   - No decision is made among these four in this document, per instruction.
2. **Actual DDL for the 13 undocumented tables** (audit §13 #1, architecture Ch.25 #1) — still unknown; also directly relevant to this STEP's own §2 design note that `entity_id` had to be typed generically (`text`) partly *because* these 13 tables' PK types are unverifiable.
3. **Which scheduled-job mechanism (`pg_cron`/Edge Function/external cron) does the actual Supabase project support** (architecture Ch.14/25 #8) — needed to finalize §5's cleanup mechanism; an infra fact this repo cannot determine.
4. **Live RLS verification against a real Supabase instance** (new to this STEP) — §12's test matrix and §13's policy review are design-time/text-level analysis only; running the actual 10 tests with real test users against a real deployed `autosave_drafts`/`content_versions` schema has not been done (and could not be done in this STEP, which created no tables) and should happen before Phase 2 (§7) depends on it.
5. **Should `service_role`/cleanup-job access itself be scoped more narrowly than a blanket RLS bypass?** (new to this STEP, follows from §13's DELETE-policy discussion) — Supabase's `service_role` bypasses RLS entirely by convention; whether the cleanup job should instead run through a narrowly-scoped `SECURITY DEFINER` function (limited to `... WHERE expires_at <= now()`) instead of a raw service-role connection is a hardening question worth deciding before Phase 1 implementation, not resolved here.
6. **`obj_*` vs. `objective*_v2`: which is live?** (audit §13 #3, architecture Ch.19/25 #3) — still an open product decision, still not blocking for this document's design (the generic `(entity_type, entity_id, field_key)` key shape accommodates either or both, per architecture Ch.19's own reasoning, re-affirmed here).
7. **Supabase Auth session TTL/refresh behavior** (audit §13 #4, architecture Ch.25 #4) — relevant to how the `auth_expired` `failure_reason` value on `autosave_drafts` (§2) should actually be triggered/surfaced; not determinable from this repo.
8. **Is the Supabase project shared with the separated HRM/team-log repo?** (audit §13 #6, architecture Ch.25 #6) — relevant to whether `autosave_drafts`/`content_versions`'s RLS design needs to consider any cross-project effects; unlikely but unconfirmed, unchanged from architecture Ch.25's framing.
9. **Real production write-frequency per table** (audit §13 #7, architecture Ch.25 #7) — would sharpen §5's version-volume/compaction judgment; not derivable from static analysis.
10. **Field_key/entity_type governance process** (architecture Ch.22/25 #10) — who reviews new registrations as Phase 4/5 (§7) rolls out more screens; unchanged from architecture Ch.25, re-affirmed as still open.
11. **Version compaction threshold, if ever needed** (architecture Ch.14/25 #11) — still explicitly deferred/OPTIONAL, unchanged.
12. **Retention-window "at least keep the latest version forever" expectation** (new to this STEP, §5) — this design lets a field's *entire* version history age out past 7 days of inactivity, including what was its most recent version; confirm this matches user expectations for "7-day history" before Phase 1 ships, since a different (and equally reasonable) reading of "7일 보존" could mean "always keep at least the last version, plus 7 days of history on top."

---

## 16. Risks & Trade-offs

Carried forward from architecture Ch.22 where still applicable, plus new risks specific to this STEP's physical-schema/RLS design:

- **No DB-level `FOREIGN KEY` from `entity_id` to any canonical table** (§2/§3): a deliberate consequence of the generic-key design needed to span 41+13 tables with heterogeneous/partially-unknown PK types. Trade-off: the DB cannot itself guarantee an `autosave_drafts` row's `entity_id` actually refers to a real, still-existing canonical row (e.g. after a canonical row is deleted, its orphaned drafts/versions would silently persist until the 7-day retention window ages them out) — referential correctness is pushed entirely to the application layer (the field_key registry, architecture Ch.22), not enforced by Postgres.
- **Ownership-scoped RLS (§8) is stricter than the canonical tables it sits beside** (§9): a deliberate choice, but it does mean the two new tables have a **different, inconsistent security posture** from the other 41+13 tables in the same database — a future engineer auditing "what's our RLS story" needs to know these two tables are the exception, not the rule, until (if ever) canonical hardening (§11/§15 #1) brings the rest of the schema up to the same standard.
- **Generic `entity_type`/`field_key` model can become a dumping ground without governance** (architecture Ch.22, re-affirmed) — Option C's own strength (trivial to add a new autosave-backed field) is a risk if not paired with a reviewed registry, exactly as architecture Ch.22 already flagged; this STEP's schema design doesn't add a technical guard against this (e.g., no allow-list table of valid `entity_type`/`field_key` pairs is proposed here), which is itself worth flagging as a possible future addition (a `field_key_registry` table with its own `USING (true)`-for-`SELECT`/admin-only-write RLS, cheap to add later, not designed here).
- **7-day retention with no "keep at least the latest version" floor** (§5, §15 #12): a field untouched for 7+ days loses its entire version history, not just the versions older than 7 days — flagged as a possible mismatch with user expectations, not yet confirmed either way.
- **Cleanup job's access model (`service_role` bypass vs. scoped `SECURITY DEFINER`) not decided** (§13/§15 #5): a real hardening question left open; a blanket `service_role` connection for a cron job is a broader-than-necessary credential to operate continuously, even though it is a common and accepted Supabase pattern.
- **Phase 3's combined Track A + Track B complexity** (architecture Ch.20/22, re-affirmed via §7's table): remains the single highest-complexity migration phase, unchanged from architecture Ch.22's own risk framing — this document doesn't reduce that risk, only re-confirms it in the phase table.
- **Cross-device recovery-vs-conflict UX ambiguity** (architecture Ch.22, re-affirmed) — still not fully resolved; the CAS mechanism (§4) correctly *detects* the race regardless of whether it's cross-tab or cross-device, but which UI framing ("recovered" vs. "conflict") a user sees in the cross-device case is still a UX design question for STEP 4/5's implementation, not this document's schema.
- **Trade-off, restated for this STEP specifically**: choosing ownership-scoped RLS (§8) over matching the existing lax `USING(true)` pattern (as architecture Ch.4 originally scored as "trivial") trades a small amount of implementation/governance overhead (an extra `user_id` column, ownership checks on every policy) for materially better protection of what is arguably more sensitive data (unconfirmed drafts) than the canonical rows sitting next to them with no such protection — a trade-off this document makes deliberately, not by default.

---

## 17. Approval Checklist

**Nothing below is decided or confirmed by this document** — this chapter only enumerates what needs explicit user decision/approval before implementation (an eventual future STEP) begins. Extends architecture Ch.24 with this STEP's schema/RLS-specific items.

- [ ] **`autosave_drafts` 컬럼/타입/제약 확정** — confirm the exact column set, `entity_id` as `text` (not `uuid`/`bigint`), the `(entity_type, entity_id, field_key, user_id, client_scope)` uniqueness constraint, and the `status`/`failure_reason` enum values (§2) before any migration is written.
- [ ] **`content_versions` 컬럼/타입/제약 확정** — confirm the exact column set, the `(entity_type, entity_id, field_key, version_no)` uniqueness constraint, and the `source` enum (`auto`/`final`/`restore`) (§3).
- [ ] **CAS 메커니즘 확정** — confirm the draft-row-as-CAS-token design (§4) — i.e., that `version_no` lives on the mutable `autosave_drafts` row (not on `content_versions`, which is append-only) — matches the intended concurrency model.
- [ ] **Retention 정책 확정** — confirm rolling-7×24h-from-`created_at` (§5), confirm or reject the "no keep-latest-forever floor" behavior (§15 #12), and decide the actual cleanup-job mechanism (`pg_cron` vs. Edge Function vs. external cron, §5 — an infra decision this document cannot make).
- [ ] **Cleanup job 권한 모델 확정** — decide `service_role` bypass vs. a narrowly-scoped `SECURITY DEFINER` function for the retention DELETE (§13/§15 #5).
- [ ] **Restore 정책 확정** — confirm restore-always-creates-a-new-version-via-the-same-CAS-path (§6), never a bypass write, is the intended behavior.
- [ ] **Migration phase 순서 확정** — confirm the 7-phase table in §7 (in particular, that all RLS is applied at Phase 1, before Phase 2 pilot data exists) matches the intended rollout order from architecture Ch.20.
- [ ] **Autosave RLS 모델 확정 (Option A) 승인** — confirm ownership-only (`auth.uid() = user_id`) RLS (§8/§11 Option A) is the accepted v1 approach for the two new tables, understanding explicitly that it does **not** resolve canonical entity authorization (§9/§14).
- [ ] **Canonical RLS Security Gap 인지 확인** — confirm the user has read and acknowledges §9/§14's finding that canonical tables remain `USING(true)` and that this STEP does not change that; confirm which of the four follow-up strategies (§15 #1) to pursue, if any, and on what timeline — **explicitly not required to be decided now**, but the gap itself must not be silently ignored going forward.
- [ ] **Live RLS test-matrix execution** — confirm that, once Phase 1 (§7) actually creates these tables in a real (e.g. staging) Supabase environment, the 10 tests in §12 will be re-run as live tests with real test users before Phase 2 depends on the RLS being correct — this document's verification is design/text-level only (§12/§13/§14).
- [ ] **`entity_id` 타입 설계 승인** — confirm the no-FK, generic-`text`-typed `entity_id` design (§2/§16) is an acceptable trade-off given the 13 undocumented tables' unknown PK types, or decide this should wait on architecture Ch.18's reverse-documentation step first.
- [ ] **Field_key/entity_type governance** — confirm who owns reviewing new `entity_type`/`field_key` registrations as Phase 4/5 (§7) rolls out, and whether a `field_key_registry` guard table (§16) is worth adding before rollout scales up.
- [ ] **범위 재확인** — confirm this document's Track-A-only scope (§1) is still correct, and that Track B (§7 Phase 3's non-DB content) continues to be tracked separately per architecture Ch.17, not folded into this document's approval.

---

# STEP 5 PRE-FLIGHT SECURITY AMENDMENT (§18-§23)

**Status of everything below**: same as the rest of this document — **design/planning only**. No SQL below was executed. No Supabase table was created, altered, or dropped. No existing canonical-table RLS was read, created, altered, or dropped as part of writing this amendment. No source file was modified. This amendment only adds new sections (§18-§23) after the existing §1-§17; nothing above this line was changed.

**Why this amendment exists**: before STEP 5 (actual migration + actual implementation) begins, three things this document's §8-§17 left as open/deferred need to be pinned down at the planning level: (1) exactly which `entity_type` values are real, and how their integrity is enforced at the DB layer; (2) an explicit, executable-later test plan for the §12 RLS test matrix, since §12/§14 were design-time-only reasoning about SQL text, never run against a live instance; (3) formal promotion of the canonical-RLS gap (§9) into its own tracked, separately-scoped follow-up security task, so it does not get silently treated as "handled" just because the autosave tables' own RLS (§8) is sound.

---

## 18. STEP 5 Pre-Flight — entity_type Integrity Decision

**Question**: how should `autosave_drafts.entity_type` and `content_versions.entity_type` (both `text NOT NULL`, §2/§3) be constrained so that a typo or an unregistered value can't silently create drafts/versions for an entity concept that doesn't actually exist in this app?

**Decision: OPTION B — `CHECK` constraint, using the actual codebase-grounded value list in §19.**

```sql
-- DESIGN ONLY — NOT EXECUTED. Illustrative shape for a future migration, not
-- a migration produced by this STEP.

ALTER TABLE autosave_drafts
  ADD CONSTRAINT autosave_drafts_entity_type_check
  CHECK (entity_type IN (
    'quick_memo','meeting','meeting_note','project_item','agenda_sub_task',
    'sub_task_note','agenda_group','task','task_note','task_todo',
    'annual_goal_item','annual_goal_task','annual_goal_task_note',
    'annual_goal_category_label','objective','objective_review','one_on_one',
    'one_on_one_feedback','one_on_one_template','perf_review','daily_journal',
    'persona_log','learning_resource','sketch_card','sketch_frame',
    'manual_achievement','user_setting','user_preference'
  ));

ALTER TABLE content_versions
  ADD CONSTRAINT content_versions_entity_type_check
  CHECK (entity_type IN ( /* identical list — kept in lockstep with the drafts constraint */ ));
```

**Reason**: this app is single-user/small-team (audit §1) with a bounded, enumerable set of editor surfaces (35 rows, audit §3). A `CHECK` constraint gives real DB-level protection against typos/unregistered values (the exact failure mode a free-text column invites) without introducing a second table (registry) that this app's actual scale doesn't justify, and without ENUM's transactional-DDL friction (below) for what is expected to be an occasionally-growing list as Phase 4/5 (§7) rolls out more screens.

**Alternatives considered**:

| Option | Description | Verdict for this app |
|---|---|---|
| **A — Postgres `ENUM` type** | `CREATE TYPE entity_type_enum AS ENUM (...)`, column typed as the enum. | Rejected as primary choice. Same DB-level protection as CHECK, but adding a new value requires `ALTER TYPE entity_type_enum ADD VALUE '...'`, which in Postgres **cannot run inside the same transaction as other schema/data changes that use the new value** (pre-PG12 this failed outright; PG12+ allows the `ADD VALUE` itself in a transaction but the new value cannot be *used* until that transaction commits) — an awkward constraint for a Phase 4/5 rollout (§7) that's expected to add several new `entity_type` values across multiple migrations over time. |
| **B — `CHECK` constraint** ✅ chosen | `CHECK (entity_type IN (...))`, a plain list literal. | **Chosen.** Adding a value is `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... CHECK (...)` — an ordinary DDL statement, no cross-transaction restriction, trivially scriptable, and reviewable as a one-line diff in a migration file. Cost: mildly more verbose to add a value (drop+recreate vs. `ADD VALUE`), but this is a minor, well-understood operation. |
| **C — registry table** (e.g. `entity_type_registry(entity_type text PRIMARY KEY, label text, created_at timestamptz)`, FK'd from both `autosave_drafts.entity_type`/`content_versions.entity_type`) | Strongest for a large or multi-tenant system needing runtime-configurable entity types, audit trail of who registered what, or admin UI-driven registration. | **Rejected as over-engineering for this app's scale** — task brief explicitly steers away from unnecessary complexity given 15-35 editor screens and single-user use (audit §1). A registry table adds a third table, a join on every insert-path validation, and governance overhead (who approves a new registry row) that buys nothing this app needs today. Revisit only if this app grows into a genuinely multi-tenant/plugin-style entity model — not indicated by anything in the audit. |
| **D — free `TEXT`, no constraint** | No DB-level restriction at all; correctness relies entirely on application code (the field_key registry, architecture Ch.22) never passing a bad value. | **Rejected.** This is the status quo the CHECK constraint is meant to improve on — a single typo in a `useAutosave('taks', ...)` call site would silently create an orphaned, permanently-invisible `entity_type` bucket with no DB-level signal, discoverable only by manual inspection. Given the whole point of this STEP's addendum is closing exactly this kind of quiet integrity gap before real implementation starts, Option D is rejected as the one option that doesn't actually solve the problem it's being evaluated against. |

**Explicit migration-impact trade-off (required by the task brief)**:

| Option | Does adding a new editor's `entity_type` require a migration? |
|---|---|
| A — ENUM | **Yes** — `ALTER TYPE ... ADD VALUE`, with the cross-transaction caveat above. |
| B — CHECK (chosen) | **Yes** — `DROP CONSTRAINT` + `ADD CONSTRAINT` with the expanded list. Same "yes" as ENUM, but without ENUM's transactional restriction, so it composes more cleanly with a single migration file that also does other things for the same new editor (e.g. registering its `field_key`s). |
| C — registry table | **No schema migration** — a new entity type is just a new row (`INSERT INTO entity_type_registry ...`), not a DDL change. This is the one real advantage registry has over B, but it is judged not worth the added table/governance overhead at this app's current scale (rejected above). |
| D — free TEXT | **No** — but "no migration needed" here is a symptom of "no integrity check exists," not a benefit. |

So: **Phase 4/5 (§7) rollout, under the chosen Option B, will require a small migration each time (or each batch of) new editor screens are wired onto the autosave core** — this is an accepted, explicit cost of choosing real integrity checking over either a heavier registry table or no checking at all.

---

## 19. STEP 5 Pre-Flight — Actual entity_type Inventory (codebase-grounded)

**Method**: every row below is derived from `docs/autosave-audit.md` §3 (Editor Inventory, 35 rows, each independently grep-verified in STEP 1 to contain an `insert/update/upsert/delete` call or `localStorage` draft) cross-referenced with §4 (Autosave Architecture Map) and §6a/§6b (Supabase Structure). Where the audit's screen-level grouping conflated more than one persisted table under a single screen row, this inventory splits by **table/content-concept**, not by screen, because `entity_type` in this design's schema (§2/§3) keys off "which canonical row this draft/version belongs to," not "which screen the user was on" — a single screen (e.g. task detail, audit row #12) legitimately maps to more than one `entity_type` (`task`, `task_note`, `task_todo`) because it writes to three different tables with three different PK spaces. Two additional source-code greps (not in the original audit) were run in this STEP to resolve ambiguous cases — see the "Verification note" rows below.

**28 entity_type values, grounded**:

| # | `entity_type` | Canonical table(s) | Source screen(s) (audit §3 row #) | Grounding |
|---|---|---|---|---|
| 1 | `quick_memo` | `quick_memos` | #2, #3, #4, #5 | Popup, floating button, mobile sheet, memos list — all persist to `quick_memos` (audit §3, §6a). |
| 2 | `meeting` | `meetings` | #6, #7 | Meeting create/detail — title, category, description-append (audit §3 #7, §6a `meetings`). |
| 3 | `meeting_note` | `meetings.notes` (jsonb array element) | #7 | Existing-note edits inside a meeting, debounced 1500ms (audit §4 Shape A, `NoteAccordion.handleChange`, `meetings/[id]/page.tsx:100-110`). Track B (architecture Ch.17) is the eventual normalization of this jsonb array into its own child table — this `entity_type` is written to work against either shape per architecture Ch.17's "zero special-casing" claim. |
| 4 | `project_item` | `agenda_items` | #8, #9 | Project matrix + project item detail (audit §3 #8/#9, §6a `agenda_items`). |
| 5 | `agenda_sub_task` | `agenda_sub_tasks` | #8, #9, #10 | Sub-task rows inside project matrix/item detail/sub-task detail (audit §3 #8-10, §6b — undocumented table). |
| 6 | `sub_task_note` | `sub_task_notes` | #9, #10, #34 | Sub-task notes, also written from text-selection capture (audit §3 #9/#10/#34, §6b — undocumented table). |
| 7 | `agenda_group` | `agenda_groups` | #8 | Group name/category/roadmap_period fields — **verified in this STEP** via `Grep` on `src/components/meetings/AgendaMatrix.tsx`: `updateGroup()` (line 199-201, name/color), `updateGroupCat()` (line 161-162, category), `updateGroupRoadmapPeriod()` (line 298-301, roadmap_period) all call `supabase.from('agenda_groups').update(...)`. |
| 8 | `task` | `tasks` | #11, #12 | Task list/detail — title, status, dates, assignee, etc. (audit §3 #11/#12, §6a `tasks`). |
| 9 | `task_note` | `notes` (task notes) | #12 | Task detail's separate `notes` table rows — the exact table involved in audit's CRITICAL risk #3 (`tasks/[id]/page.tsx:468`, draft wiped on failed insert). |
| 10 | `task_todo` | `task_todos` | #12 | Task detail's todo checklist rows (audit §3 #12, §6a `task_todos`). |
| 11 | `annual_goal_item` | `annual_goal_items` | #13 | Annual-goals roadmap inline edit (audit §3 #13, §6a `annual_goal_items`). |
| 12 | `annual_goal_task` | `annual_goal_tasks` | #15 | Annual-goal task detail (audit §3 #15, §6a `annual_goal_tasks`, Shape A example `annual-goals/tasks/[id]/page.tsx:128-129,191-192`). |
| 13 | `annual_goal_task_note` | `annual_goal_task_notes` | #15 | Same screen's separate notes table (audit §3 #15, §6a `annual_goal_task_notes`). |
| 14 | `annual_goal_category_label` | `annual_goal_category_labels` | #14 | Category rename — **verified in this STEP** via `Grep` on `src/app/(app)/annual-goals/page.tsx`: line 42, `supabase.from('annual_goal_category_labels').upsert({ category_key: key, name: trimmed })`. |
| 15 | `objective` | `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries` | #16 | Quarterly objectives (audit §3 #16, §6b — undocumented `obj_*` family). **Flagged**: audit §6b/§15 open question #6 notes `obj_*` and `objectives_v2`/`objective_groups_v2`/`objective_entries_v2` are structurally parallel but table-distinct, and it is *not determinable from code alone* whether both are live or one is dead. This `entity_type` and the next one (`objective_review`) are kept **separate** in this inventory precisely because the underlying tables are separate and undocumented — collapsing them into one `entity_type` would be a guess this document is not entitled to make. |
| 16 | `objective_review` | `objective_groups_v2`, `objectives_v2`, `objective_entries_v2` | #17 | Objective review (audit §3 #17, §6b — undocumented `_v2` family). See note on #15. |
| 17 | `one_on_one` | `one_on_ones` | #18, #19, #20 | One-on-one list, member page, session note editor (audit §3 #18-20, §6a `one_on_ones`). |
| 18 | `one_on_one_feedback` | `my_feedback` | #18 | My-feedback log, distinct table from `one_on_ones` (audit §3 #18, §6a `my_feedback`; localStorage draft `feedbackDraftKey(month)`, audit §5). |
| 19 | `one_on_one_template` | `one_on_one_template` | #21 | Global singleton template (audit §3 #21, §6a `one_on_one_template`; audit risk #19 — duplicate-insert race on this exact table). |
| 20 | `perf_review` | `period_journals` | #22 | Weekly/monthly journal, 300ms per-field debounce (audit §3 #22, §4 Shape A example `perf-review/page.tsx:374-408`, §6a `period_journals`). |
| 21 | `daily_journal` | `daily_journals` | #23, #24 | Daily journal list + home widget (audit §3 #23/#24, §6b — undocumented table; localStorage draft `JOURNAL_DRAFT_KEY`, audit §5). |
| 22 | `persona_log` | `persona_logs` | #25 | Decisions/persona logs, per-persona-tab draft (audit §3 #25, §6b — undocumented table; localStorage draft `logDraftKey(activeTab)`, audit §5). |
| 23 | `learning_resource` | `learning_resources` | #28, #29 | Learning list/detail (audit §3 #28/#29, §6a `learning_resources`). |
| 24 | `sketch_card` | `sketch_cards` | #31 | Card content, 500ms debounce (audit §3 #31, §4 Shape A example `SketchCanvas.tsx:87-103`, §6a `sketch_cards`). |
| 25 | `sketch_frame` | `sketch_frames` | #31 | Frame title/collapsed state — **verified in this STEP** via `Grep` on `src/components/sketch/SketchCanvas.tsx`: `handleFrameTitleChange` (line 363-366) calls `supabase.from('sketch_frames').update({ title })`; a separate `collapsed` toggle (line 380) does the same. |
| 26 | `manual_achievement` | `manual_achievements` | #32 | Completed/achievements tagging (audit §3 #32, §6a `manual_achievements`). |
| 27 | `user_setting` | `user_settings` | #35 | Shared `useUserSetting.ts` hook — key/value settings incl. persona profile fields used by the decisions page (audit §3 #35, §4 Shape A example `useUserSetting.ts:33-39`, §6a `user_settings`). |
| 28 | `user_preference` | `user_preferences` | #27 | Settings page — org/menu-order/hidden-menus/member-role fields (audit §3 #27, §6a `user_preferences`). **Deliberately kept distinct from `user_setting` (#27 above)** — `user_settings` and `user_preferences` are two separate tables in this app (audit §5's note on `dashboard_org` etc. being "dual-written to both `localStorage` and `user_preferences`/`members`"); collapsing them into one `entity_type` would misrepresent which table a given draft/version actually targets. This existing two-tables-for-one-purpose situation is itself flagged as a pre-existing inconsistency in the app (not something this STEP's entity_type design fixes or should fix). |

**Count: 28**, within the 15-35 range the task brief anticipated (audit §3's 35 editor surfaces, collapsed/split by canonical table rather than by screen).

**Candidates explicitly considered and excluded, with reasoning** (so the omission isn't mistaken for an oversight):

- **`sketch_board`** (`sketch_boards` table, audit §3 #30, described there as "create/rename/delete board") — **excluded after verification in this STEP**: `Grep` on `src/components/sketch/SketchBoardList.tsx` found only `.insert(...)` (line 33) and `.delete(...)` (line 40) calls against `sketch_boards`; **no `.update(...)` call site was found**, meaning the audit's "rename" description for this row is not (or no longer) backed by a database write this repo can see. Since this design's `entity_type` values are meant to back actual autosave-eligible field edits, and no update path was confirmed, `sketch_board` is left out rather than speculatively added. If a rename feature is added later, this is a one-line `entity_type` registration (§18's accepted migration cost), not a blocker.
- **`project_meetings`** (audit §6b) — excluded because the audit explicitly flags this as "strongly suspected to be a Supabase VIEW over `meetings`, not a separate base table" (audit §6b) — if that suspicion is correct, drafts/versions for it belong under the `meeting` `entity_type` (#2 above), not a separate one; this is listed in Open Questions (§15 of the base document, carried forward, not re-litigated here) as still unconfirmed.
- **Link/junction tables** (`task_meeting_links`, `meeting_agenda_links`, `sketch_edges`, `agenda_updates`) — excluded because these represent relationships, not freeform content a user types into; nothing in audit §3/§4 shows a debounced text field backed by any of these tables. `agenda_updates` is additionally confirmed unused (audit §6a: "no `src/` file references `agenda_updates`").
- **`attachments`, `members`** — excluded: attachment rows are file-upload metadata, not typed/debounced content (audit §8c notes attachment upload error-checking is already distinct from content-save error-checking); `members` role/archived_at fields are administrative toggles, not shown anywhere in audit §3/§4 as a debounced draft-worthy text field.
- **`team_log_*` family** (7 tables, audit §6a) — excluded: audit §6a confirms `grep -rl "team_log" src/` returns zero files; these tables are vestigial for this repo (extracted to the separate HRM project per project memory) and are not editor surfaces of this app at all.

---

## 20. STEP 5 Pre-Flight — RLS Real-Execution Verification Requirement

**Re-affirmed, explicitly, before anything else in this section**: every verdict in this base document's **§12 (RLS Test Matrix)** and **§14 (Final Security Verdict)** is, and always was, **design-level reasoning about SQL policy text** — a close reading of the `CREATE POLICY` statements in §8 and a walkthrough of what Postgres's RLS evaluation model implies those statements do. **No live Supabase instance was created, and no RLS policy was actually applied or queried, in STEP 4 or in this amendment.** §12 says this of itself ("no live Supabase instance was created or queried to run these tests in this STEP"); §14 says this of itself ("no table was actually created and no policy was actually applied or tested against a live Supabase instance"). This amendment does not change that status — it exists specifically to make the *actual execution* of that verification an explicit, named, tracked requirement of STEP 5, rather than something that could be silently skipped because the design-level reasoning "sounded right."

**The 11 tests below are the STEP 5 real-execution requirement.** They are a superset/refinement of §12's original 10-test matrix (adding an explicit standalone `INSERT` test rather than folding it into the general reasoning, and separating the two "identifier known" DENY cases into their own numbered items exactly as this amendment's task brief specifies). Every one of them is currently:

**`NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능)`**

| # | Test | Expected verdict (design-level, per base §8/§12) | Current status |
|---|---|---|---|
| 1 | 자신 draft SELECT | ALLOW | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 2 | 자신 draft INSERT | ALLOW | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 3 | 자신 draft UPDATE | ALLOW | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 4 | 자신 draft DELETE | ALLOW | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 5 | 타인 draft SELECT | DENY | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 6 | 타인 draft UPDATE | DENY | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 7 | 타인 draft DELETE | DENY | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 8 | 타인 content_versions SELECT | DENY | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 9 | draft_id 직접접근 (다른 식별자로 자기 것이 아닌 row를 알고 있을 때) | DENY | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 10 | version_id 직접접근 | DENY | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |
| 11 | unauthenticated access (anon role, no session) | DENY | NOT VERIFIED (실제 테이블이 아직 존재하지 않음 — 실제 migration 실행 후에만 검증 가능) |

**Per-clause verification requirement (not just per-test)**: beyond the 11 row-level tests above, each of the following individual policy clauses from §8 must itself be exercised, not merely assumed correct because the surrounding test passed:

- **`SELECT ... USING (auth.uid() = user_id)`** — must be confirmed to actually filter rows (not merely "not error") when queried by a non-owning authenticated session. **NOT VERIFIED — real migration required first.**
- **`INSERT ... WITH CHECK (auth.uid() = user_id)`** — must be confirmed to actually reject an attempted insert where the client supplies a `user_id` different from its own `auth.uid()` (the forgery case §13 discusses), not merely the "normal" case where the app always sets it correctly. **NOT VERIFIED — real migration required first.**
- **`UPDATE ... USING (auth.uid() = user_id)`** — must be confirmed to exclude non-owned rows as update *candidates* (0 rows affected), specifically distinguished from the WITH CHECK case below. **NOT VERIFIED — real migration required first.**
- **`UPDATE ... WITH CHECK (auth.uid() = user_id)`** — must be confirmed to reject an update that *would* result in `user_id` changing away from the current `auth.uid()` (the ownership-reassignment/self-hijack case §13 flags), tested as its own case distinct from the USING clause (a naive test could pass USING and never actually exercise WITH CHECK if the test never attempts to change `user_id`). **NOT VERIFIED — real migration required first.**
- **`DELETE ... USING (auth.uid() = user_id)`** — must be confirmed to exclude non-owned rows as delete candidates. **NOT VERIFIED — real migration required first.**

**Execution plan (design-only — a plan for STEP 5, not performed now)**:

1. **Environment**: use Supabase local dev (`supabase start`, local Postgres + local Auth emulation) rather than the live/production Supabase project, so this verification never touches real user data or the live canonical tables — consistent with this document's (and this amendment's) absolute rule against touching the real project.
2. **Apply the migration**: run the actual `CREATE TABLE`/`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`/`CREATE POLICY` statements from §2/§3/§8/§18 (with the §18 CHECK constraint) against the local instance only — this is the one point where "actually execute the SQL" is appropriate, because it's local/throwaway, not the live project.
3. **Create two local test identities**: e.g. via the local Auth emulator's sign-up, obtain two distinct `auth.uid()` values, call them Test-User-A and Test-User-B (conceptually corresponding to "User A"/"User B" in base-doc §10/§12).
4. **Seed one draft row and one version row as Test-User-A**, using a throwaway `entity_type` value (e.g. `'test_entity'`, not one of the 28 real values in §19 — matching base-doc §7 Phase 1's own guidance to test "against a throwaway `entity_type` value ... before anything real depends on these tables").
5. **Run each of the 11 tests in the table above** as an authenticated request under Test-User-A's session (tests 1-4), then again under Test-User-B's session against Test-User-A's row (tests 5-9), then again with `anon`/no session (test 11) — using either the Supabase JS client configured against the local instance, or direct `psql`/`SET request.jwt.claims` session-variable manipulation for a lower-level check of the same RLS behavior (conceptual note: Supabase's `auth.uid()` reads from a JWT claim set via `SET LOCAL request.jwt.claims`, so a `psql`-level test can simulate "as user X" without needing the full HTTP/Auth stack, if that's more convenient during implementation).
6. **Record actual pass/fail per test**, replacing every "NOT VERIFIED" row above with an actual "VERIFIED — PASS" or "VERIFIED — FAIL (details)" — this replacement is explicitly a STEP 5 deliverable, not something this amendment can do.
7. **Only after all 11 tests + 5 per-clause checks show VERIFIED — PASS** does base-doc §7 Phase 2 (Quick Memo pilot) proceed to depend on this RLS being correct in practice, per base-doc §17's own Approval Checklist item ("Live RLS test-matrix execution").

**Nothing in steps 1-7 above was executed as part of producing this amendment.** They are written here as the concrete plan STEP 5 must follow, per this STEP's absolute rule against running any actual Supabase table creation or RLS query.

---

## 20a. STEP 5 — Real-Execution Log (actual results, replacing the plan above)

**Recorded**: 2026-08-14. Environment: the dev Supabase project (`vuxxanxuuwoduxmslrwh.supabase.co`), not local `supabase start` (deviation from §20 step 1's original plan — the dev project was already bootstrapped from `supabase/combined-schema-for-dev.sql` per user instruction, and using it directly was judged equivalent for this purpose: still not the live/production project, still zero real user data at risk). Migration applied: `supabase/autosave-migration-v1.sql`, run by the user directly in the dev project's SQL Editor (not by this session — no direct DB/service-role/CLI credential was ever used by this session, consistent with every prior STEP's absolute rules).

**Test identities**: two real Supabase Auth accounts, `jintest@naver.com` (Test-User-A) and `jintest2@naver.com` (Test-User-B), authenticated via `supabase-js`'s `signInWithPassword` — i.e. real JWT sessions under the actual `authenticated` Postgres role, not a `psql`-level `SET LOCAL request.jwt.claims` simulation and not a `service_role`/`postgres`-role connection. This satisfies §20's own requirement ("실제 authenticated role + 실제 auth.uid() 컨텍스트") and the task brief's explicit condition that a simulated `auth.uid()` does not count as a real execution test.

**Finding #1 — GRANT gap (discovered on first execution attempt, not anticipated by §8/§18's design)**: the first run failed at Test #2 with `permission denied for table autosave_drafts` — a Postgres table-level GRANT error, not an RLS policy verdict. Diagnosed via a read-only `information_schema.role_table_grants` query (run by the user in the SQL Editor, since this session has no catalog access via the anon-key REST API): `authenticated` and `anon` had only `REFERENCES`/`TRIGGER`/`TRUNCATE` on both new tables — no `SELECT`/`INSERT`/`UPDATE`/`DELETE` grant existed at all. **This is a real gap in `autosave-migration-v1.sql` as originally written** — §8's `CREATE POLICY` statements were correct, but the migration never included the base table-level `GRANT` that RLS policies presuppose (the existing 41+13 canonical tables apparently rely on a project-level default-privilege grant that this dev project did not have configured the same way). Fixed via `supabase/autosave-migration-v1-grants-fix.sql` (`GRANT SELECT, INSERT, UPDATE, DELETE ON autosave_drafts TO authenticated`; `GRANT SELECT, INSERT ON content_versions TO authenticated`; nothing granted to `anon`; `autosave-migration-v1.sql` itself was also patched with the same GRANTs for any future from-scratch run). This is now recorded as a **new structural lesson for the Migration Plan (§7)**: Phase 1's "apply RLS at table-creation time" guidance must explicitly include table-level GRANTs as part of the same step, not just `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` — RLS alone does not imply the base grant exists.

**Finding #2 — test-harness classification bug (not a security finding)**: the first post-GRANT-fix run showed Test #11 as a false mismatch (expected DENY, computed as ALLOW) because the test script's own logic treated "the query returned a Postgres error" as equivalent to "ALLOW" for the DENY-expected tests, when in fact `anon`'s `permission denied for table` error **is** a correct DENY (blocked at the GRANT layer, even before RLS gets to filter it — a stronger denial than an RLS-layer empty-result filter, not a weaker one). Fixed in the test script (not in any schema/policy file) and all 11 tests + 1 bonus check were re-run clean from scratch afterward.

**Results (all against real `authenticated` sessions, per the above)**:

| # | Test | Expected | Actual | Mechanism | Status |
|---|---|---|---|---|---|
| 1 | 자신 draft SELECT | ALLOW | ALLOW | — | **VERIFIED — PASS** |
| 2 | 자신 draft INSERT | ALLOW | ALLOW | — | **VERIFIED — PASS** (after GRANT fix; see Finding #1) |
| 3 | 자신 draft UPDATE | ALLOW | ALLOW | — | **VERIFIED — PASS** |
| 4 | 자신 draft DELETE | ALLOW | ALLOW | — | **VERIFIED — PASS** (run last, doubled as test-row cleanup) |
| 5 | 타인 draft SELECT | DENY | DENY | RLS-filter (0 rows, no error) | **VERIFIED — PASS** |
| 6 | 타인 draft UPDATE | DENY | DENY | RLS-filter (0 rows affected) | **VERIFIED — PASS** |
| 7 | 타인 draft DELETE | DENY | DENY | RLS-filter (0 rows affected) | **VERIFIED — PASS** |
| 8 | 타인 content_versions SELECT | DENY | DENY | RLS-filter (0 rows) | **VERIFIED — PASS** |
| 9 | draft_id 직접접근 | DENY | DENY | RLS-filter (0 rows) — confirms §10's attack-scenario analysis empirically | **VERIFIED — PASS** |
| 10 | version_id 직접접근 | DENY | DENY | RLS-filter (0 rows) — confirms §10 empirically | **VERIFIED — PASS** |
| 11 | unauthenticated access (anon) | DENY | DENY | GRANT-layer error (`permission denied for table autosave_drafts`) | **VERIFIED — PASS** |
| bonus (not one of the 11, but flagged in §20's per-clause list) | UPDATE `WITH CHECK` self-hijack — Test-User-A attempts `UPDATE ... SET user_id = Test-User-B` on their own row | DENY | DENY (`new row violates row-level security policy for table "autosave_drafts"`) | RLS `WITH CHECK` rejection | **VERIFIED — PASS** — empirically confirms §13's `autosave_drafts_update_own` analysis: ownership reassignment is actually rejected, not just reasoned to be. |

**Per-clause verification status, updated from §20's list**:
- `SELECT ... USING (auth.uid() = user_id)` — **VERIFIED — PASS** (tests 5/8/9/10).
- `INSERT ... WITH CHECK (auth.uid() = user_id)` — **VERIFIED — PASS**, both sub-cases: the "app sets it correctly" path (test 2, via the column default), and the forgery sub-case (Test #12, below — client explicitly supplies a `user_id` different from its own `auth.uid()`). The residual gap noted after the first execution run (this forgery sub-case not yet separately exercised) is now closed.
- `UPDATE ... USING (auth.uid() = user_id)` — **VERIFIED — PASS** (test 6: 0 rows affected when Test-User-B targets Test-User-A's row).
- `UPDATE ... WITH CHECK (auth.uid() = user_id)` — **VERIFIED — PASS** (bonus test: Test-User-A's own-row self-hijack attempt was rejected, exercising WITH CHECK specifically, not just USING).
- `DELETE ... USING (auth.uid() = user_id)` — **VERIFIED — PASS** (test 7).

**Test #12 — INSERT forgery (recorded 2026-08-14, same dev project/session methodology as above)**:

| # | Test | Expected | Actual | Mechanism | Result |
|---|---|---|---|---|---|
| 12 | INSERT self-authenticated session + forged `user_id` — Test-User-A's own real JWT session attempts `INSERT INTO autosave_drafts (..., user_id) VALUES (..., <Test-User-B's uid>)` | DENY | DENY (`new row violates row-level security policy for table "autosave_drafts"`) | RLS `INSERT ... WITH CHECK (auth.uid() = user_id)` (`autosave_drafts_insert_own`) | **VERIFIED — PASS** |

Executed under Test-User-A's real `authenticated` JWT session (via `supabase-js` `signInWithPassword`), exactly as tests 1-11 and the bonus check were — no `service_role`, no `postgres` role, no `SET LOCAL request.jwt.claims` simulation. Residue check after the DENY (queried under Test-User-A's own session, filtered to this test's unique throwaway `entity_id`) confirmed **zero rows** — the rejected INSERT left no partial or orphaned row behind, so no cleanup was required (unlike the Finding #1/#2 runs above, this test needed no forged-row cleanup because the INSERT never committed).

**Updated conclusion**: all 11 §20 tests, the UPDATE-side self-hijack check, and the INSERT-side forgery check (Test #12) are now **VERIFIED — PASS**. Both sub-cases of the task brief's flagged "USING without WITH CHECK" risk class — UPDATE self-hijack and INSERT forgery — have been empirically exercised and confirmed rejected, not just reasoned about. No residual gap remains in the per-clause verification list above.

**Conclusion**: all 11 §20 tests + the WITH CHECK self-hijack check are **VERIFIED — PASS** against the real dev Supabase project, using real `authenticated` sessions for two distinct real users. Per §20 step 7's own gate, `docs/autosave-architecture.md`/base-doc §7 Phase 2 (Quick Memo pilot depending on this RLS) may now proceed with respect to the RLS-correctness gate specifically — **this does not change §9's Canonical RLS Security Gap finding in any way**: this verification is scoped entirely to the two new tables' own RLS, exactly as §9/§22 require it to be treated separately from canonical-table access control (still `USING (true)`, still unaudited beyond this document's own citations of audit §6a).

**One residual test-data note**: the `content_versions` row created during this test run (a throwaway row under `entity_type='quick_memo'`, a clearly-marked test `entity_id`) was **not** deleted — by design, no `DELETE` policy/grant exists for `authenticated` on `content_versions` (§3/§8, reaffirmed by this run). It will remain until the (not-yet-implemented) 7-day retention cleanup job removes it, or until manually deleted with elevated access. This is expected behavior, not a leftover bug.

---

## 21. Canonical Tables RLS Security Audit (separate follow-up security task)

**This section registers a new, independent task — it is not part of the Autosave migration plan (base-doc §7), and does not block it.** See §22 for the explicit independence statement.

**Scope**: all ~41 existing canonical tables identified in the audit — the **28 documented tables** (audit §6a: 21 in current use by jin-dashboard + 7 belonging to the separated HRM/team-log project, though the latter are vestigial per §6a's own note) plus the **13 undocumented tables** (audit §6b: `agenda_sub_tasks`, `sub_task_notes`, `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs`). **This STEP does not touch, modify, or test any of their actual RLS** — the items below are an audit *plan*, not an audit *performed*.

**Per-table investigation checklist** (to be executed, per table, in the actual follow-up task — not in this STEP):

1. **RLS enabled?** (`relrowsecurity` on `pg_class`, or `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` present in the table's migration, where one exists).
2. **Policies present**: does a `SELECT`/`INSERT`/`UPDATE`/`DELETE` policy exist for each operation, or is the table relying on a single `FOR ALL` policy (the pattern audit §6a found universally for the 28 documented tables: `FOR ALL TO authenticated USING (true) WITH CHECK (true)`)?
3. **`USING`/`WITH CHECK` conditions**: literal text of each — is it `true` (no real restriction), or does it reference `auth.uid()` or any other column?
4. **`auth.uid()` relationship**: does the table have any `user_id`/`owner_id`/`created_by`-shaped column at all that a future ownership policy could even be built on top of, or would adding real RLS require a schema change (a new column) first?
5. **Actual application access path**: which screens/files (cross-referenced against audit §3) read/write this table, and do any of them assume today's `USING(true)` behavior in a way that would break if RLS were tightened (e.g. a shared-viewing feature that currently works *because* any authenticated user can see any row)?
6. **Sensitive-data classification**: does this table contain personal, evaluative, or compensation-adjacent data (see priority candidates below)?
7. **Real exposure likelihood**: given this is a single-user/small-team internal app (audit §1) — is the realistic threat model "another authenticated teammate accessing something they shouldn't" (plausible, since multiple `members` exist) or "an external/unauthenticated attacker" (audit §6a's finding is scoped to `authenticated`, so external exposure depends on separate factors like whether signup is open, not audited here)?
8. **Priority**: P0/P1/P2/P3 (see below).

**Priority candidates — grounded in audit findings, not guessed**:

| Table | Why it's a priority candidate | Audit grounding |
|---|---|---|
| `one_on_ones` (P0 candidate) | Session notes about a specific team member's 1:1 conversations — the single most obviously HR-sensitive content in this schema (performance/personal discussion content, tied to `member_id`). | audit §6a: `one_on_ones` — "member_id→members, session_date, notes jsonb[]"; audit §3 #18-20 (one-on-one screens). |
| `my_feedback` (P0 candidate) | Feedback log explicitly about members (`from_member`, `feedback_type`) — evaluative content about specific people. | audit §6a: `my_feedback` — "month, content, feedback_type, feedback_date (v10), from_member (v10)". |
| `period_journals` (P0 candidate) | Weekly/monthly performance-review journal content (perf-review screen, audit §3 #22) — self-evaluative/managerial content, the closest thing in this schema to a formal review record. | audit §6a: `period_journals` — "period_key (unique), period_type, content, good/bad/next_focus (v21)"; audit §3 #22 `perf-review/page.tsx`. |
| `members` (P0/P1 candidate) | The roster itself — name, part, role, archived_at — is the join target nearly every other sensitive table (`one_on_ones`, `my_feedback`, `tasks.assignee_id`, `annual_goal_tasks.assignee_id`) hangs off of; if `members` itself is `USING(true)`, every table that references a member by ID inherits the same exposure for "who is this record about." | audit §6a: `members` — "name, part, role (v22), archived_at (v18, soft-delete)". |
| `annual_goal_tasks` / `annual_goal_task_notes` (P1 candidate) | Carries `assignee_id` (per-person planning/performance-tracking fields, audit §6a: "many planning fields, assignee_id") — task-level performance/assignment data tied to a specific person. | audit §6a: `annual_goal_tasks` — "item_id→annual_goal_items, title, status, many planning fields, assignee_id". |
| `tasks` (P1 candidate) | Carries `assignee_id→members` — work-assignment data tied to a specific person; less inherently sensitive than `one_on_ones`/`my_feedback` but still personally attributable. | audit §6a: `tasks` — "assignee_id→members". |
| `manual_achievements` (P1/P2 candidate) | `achievement_type`, `content` — evaluation-adjacent (used by the "completed/achievements" screen, audit §3 #32), plausibly feeds into performance assessment even if not a formal review record itself. | audit §6a: `manual_achievements` — "achievement_type, month, content"; audit §3 #32. |
| `objective_groups_v2`/`objectives_v2`/`objective_entries_v2` and `obj_groups`/`obj_objectives`/`obj_sub_items`/`obj_sub_entries` (P1/P2 candidate) | Quarterly objectives/OKR-style content — potentially performance-adjacent, and additionally these are among the **13 undocumented tables** (audit §6b), so their RLS posture is not even knowable without direct Supabase inspection, compounding the priority. | audit §6b: undocumented `obj_*`/`_v2` families; audit §3 #16/#17. |
| `persona_logs` (P2 candidate) | Personal reflective/decision-log content (audit §3 #25: "decisions/persona logs") — personal in nature even if not formally HR/comp data, and also one of the 13 undocumented tables (audit §6b). | audit §6b: `persona_logs` — "date, persona/tab-scoped, title, content". |
| All remaining tables (task/project/content tables with no obvious personal/evaluative dimension — e.g. `quick_memos`, `meetings`, `learning_resources`, `sketch_*`, `agenda_*` structural tables) (P2/P3 candidate) | Still worth auditing for completeness (audit §6a's blanket `USING(true)` finding applies to all of them too), but lower sensitivity than the rows above — no member-identifying or evaluative dimension found in audit §6a/§6b for these. | audit §6a/§6b generally. |

**Explicitly not decided here**: the exact P0/P1/P2/P3 assignment above is a **candidate classification for the follow-up audit to confirm or revise**, not a final verdict — the follow-up task's own investigation (item 6, "sensitive-data classification," above) is what actually assigns final priorities, informed by whoever owns that work actually looking at real data sensitivity, not just table/column names. **No canonical table's RLS is read, tested, or modified as part of registering this task in this STEP.**

---

## 22. Security Track Independence (Autosave vs Canonical)

**This is stated as its own section, verbatim, so it cannot be missed or assumed away in a future STEP:**

> **Autosave RLS가 안전하더라도 기존 canonical table의 RLS weakness는 별도로 존재한다.**
>
> **Autosave RLS의 안전성과 기존 canonical table의 접근통제는 서로 다른 보안 문제이며, 하나의 PASS가 다른 하나의 PASS를 의미하지 않는다.**

**Elaboration**:

- **Autosave implementation (base-doc §1-§17 + this amendment's §18-§20) is one track.** It can proceed on its own schedule, using the ownership-based RLS design already specified in base-doc §8 (Option A, base-doc §11), once STEP 5's actual migration is approved and the §20 live-verification plan is executed. It does not need to wait for, or be blocked by, any canonical-RLS remediation.
- **Canonical Tables RLS Security Audit (§21) is a separate, independently-scoped track.** It can start, proceed, or be deprioritized on its own timeline without affecting whether Autosave ships. Nothing in Autosave's design (base-doc §2-§8) depends on any canonical table's RLS being hardened — base-doc §9/§11 already established this (Autosave's ownership scoping doesn't require, reference, or delegate to canonical RLS at all, per Option A).
- **A PASS on one is not evidence for the other.** Base-doc §14 already establishes this internally to STEP 4 ("Autosave table RLS: PASS (design-level)" vs. "Canonical entity authorization: PARTIAL / NOT FULLY VERIFIED" vs. "Overall Autosave Security: PARTIAL") — this amendment extends the same non-conflation principle explicitly to the **new** §21 task: a future "Canonical Tables RLS Security Audit: PASS" (if canonical hardening is ever completed) would not retroactively need to be re-stated as part of Autosave's own approval, and conversely, Autosave's own RLS being verified live (§20) in STEP 5 does not constitute any progress on, or substitute for, §21's separate audit.
- **Practical consequence for STEP 5 planning**: STEP 5 (actual Autosave migration + implementation) can be explicitly scoped to **exclude** any canonical RLS changes, and the user's approval of STEP 5 should be understood as approval of the Autosave track only — §21's task remains open, unscheduled, and un-blocking, unless and until the user separately decides to prioritize it.

---

## 23. STEP 5 Pre-Flight Checklist

**Legend**: `[x]` = actually confirmed/decided by this amendment (STEP 5 Pre-Flight). `[ ] OPEN` / `[ ] NOT VERIFIED` = not resolved by this amendment, carried forward as a real gap — not silently checked off.

```
[x] entity_type 무결성 방식 결정
    → DECIDED: Option B (CHECK constraint), §18. Reason, alternatives (A/C/D),
      and the migration-impact trade-off are all recorded in §18. This is a
      genuine decision made in this amendment, not deferred.

[x] 실제 entity_type 목록 코드베이스 기준 확인
    → DECIDED: 28 entity_type values enumerated in §19, each grounded in
      audit §3/§4/§6a/§6b citations, plus 2 additional in-STEP source greps
      (agenda_groups, sketch_frames) and one explicit exclusion grounded in
      a negative grep result (sketch_board — no update call found).

[ ] OPEN — RLS 실제 실행 테스트 방법 확인 (방법 자체는 문서화됨, 실행 결과는 없음)
    → PARTIALLY ADDRESSED: the *procedure* (§20's 7-step execution plan —
      Supabase local dev, two test identities, throwaway entity_type, 11
      tests + 5 per-clause checks) is fully documented and ready to execute
      in STEP 5. But per this amendment's own instruction, "방법 확인" (the
      plan existing) is distinct from "실행 결과" (the plan having been run)
      — the latter has NOT happened and cannot be marked done here. Left as
      OPEN/NOT VERIFIED for the actual test *results*; the test *plan* itself
      is the one part of this line item that can honestly be called done.

[x] canonical RLS security audit task 등록
    → DECIDED: registered as its own section, §21, with a scope (41 tables),
      an 8-item per-table investigation checklist, and a grounded priority
      candidate list (P0: one_on_ones, my_feedback, period_journals, members;
      P1: annual_goal_tasks/notes, tasks, obj_*/​_v2 families; P2: manual_
      achievements, persona_logs; P3: remaining tables). The audit itself has
      NOT been performed — only the task and its plan are registered.

[x] 기존 canonical RLS를 변경하지 않는 것 확인
    → CONFIRMED: no canonical table's RLS was read, queried, created, altered,
      or dropped while producing this amendment (see final git verification
      in the chat response). §22 explicitly states the independence of this
      fact from Autosave's own RLS status.

[ ] NOT VERIFIED — RLS 11개 테스트 실제 실행 결과
    → All 11 tests in §20 remain "NOT VERIFIED (실제 테이블이 아직 존재하지
      않음 — 실제 migration 실행 후에만 검증 가능)". This cannot be checked
      off until STEP 5 actually creates the tables (even in a local/throwaway
      Supabase instance) and runs the §20 procedure for real.
```

**What this means for proceeding to STEP 5**: the two items still marked OPEN/NOT VERIFIED above (live RLS execution results, and — implicitly — the canonical-RLS audit's actual findings) are **not blockers to starting STEP 5's Autosave implementation**, per §22's independence statement — but the live-RLS-execution item specifically **is** a Phase 1 gate within STEP 5 itself (base-doc §7 Phase 1: "Test the CAS update and both tables' RLS policies ... against a throwaway `entity_type` value ... before anything real depends on these tables"). In other words: STEP 5 can *start*, but base-doc §7 Phase 2 (real user data) should not *proceed* until the §20 test plan has actually been run and every row in §20's table has moved from "NOT VERIFIED" to an actual pass/fail result.

## 24. Dev Environment Known Gaps (bootstrap via `supabase/combined-schema-for-dev.sql`)

**Recorded**: 2026-08-14, while bootstrapping a dev Supabase project from `supabase/combined-schema-for-dev.sql` (schema.sql + schema_v2..v39 concatenated in order, per user request — see chat history, not a docs/autosave-audit.md or -architecture.md revision).

Running the combined script against a fresh dev project surfaced, in practice, exactly the gap STEP 1/STEP 2 already predicted from static analysis (§6b of `docs/autosave-audit.md`, reconfirmed in `docs/autosave-audit.md` STEP 2 §"Supabase migration 불일치 검증"): **13 tables the application code reads/writes have no `CREATE TABLE` anywhere in the 40 committed schema files**, because they were created in the real/prod project through some path outside this SQL history (Table Editor UI, an unrecorded ad-hoc script, etc.).

**What actually happened on first run**: the script errored at the `ALTER TABLE agenda_sub_tasks ADD COLUMN ...` statement from `schema_v27.sql`, because `agenda_sub_tasks` (one of the 13) was never `CREATE TABLE`'d in any file. Cross-checking all 13 against every `schema*.sql` file found:

| Result | Tables | Consequence for this dev project |
|---|---|---|
| **Executable statement references it → script errors** | `agenda_sub_tasks` (1 table) | Fixed by commenting out the offending `ALTER TABLE agenda_sub_tasks ...` block in `supabase/combined-schema-for-dev.sql` (schema_v27.sql section) so the rest of the script can complete. The table itself is still **not created** — only the specific statement that referenced it was neutralized. |
| **Mentioned only in a code comment, no executable SQL** | `sub_task_notes` (1 table) | No script error, but the table still does not exist after running the script. |
| **Never referenced anywhere in any schema file** | `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs` (11 tables) | No script error, table does not exist after running the script. |

**Decision (per explicit user instruction)**: these 12 tables (`agenda_sub_tasks` + the 11 never-referenced ones; `sub_task_notes` makes 13 total absent, but only 12 have *editor screens* that depend on them being absent — see below) are **out of test scope for this dev environment**. No attempt is made in this dev project to reverse-engineer their `CREATE TABLE` statements right now. This is a scope decision, not a technical limitation — `docs/autosave-audit.md` §7 already has the column-level detail needed to reverse-engineer all 13 if/when that becomes worth doing (tracked as Open Question in `docs/autosave-audit.md` §"다음 Architecture Questions" #13).

**Screens/editors that are consequently NOT testable in this dev project** (their canonical read/write path touches one of the 13 missing tables — cross-referenced against `docs/autosave-audit.md` §3 Editor Inventory):

- Home dashboard widgets that touch `agenda_sub_tasks` / `daily_journals` (quick task add, quick agenda add, daily journal widget, timeline drag-blocks)
- Quick-memo popup (`memo/quick/page.tsx`) — its `project_meetings` / `agenda_sub_tasks` branches specifically (the plain `quick_memos` insert path is unaffected and **is** testable)
- Meeting detail (`meetings/[id]/page.tsx`) — its `meeting_agenda_links` branch specifically (the `meetings.notes` autosave path covered by STEP 3.5's P0-2 fix is unaffected and **is** testable)
- Project matrix (`/project`, `AgendaMatrix.tsx`) and Project item detail (`project/items/[id]`) — depend on `agenda_sub_tasks`/`sub_task_notes`
- Sub-task detail (`subtasks/[id]/page.tsx`) — depends on `agenda_sub_tasks`/`sub_task_notes`
- Objectives (`/objectives`) — depends on `obj_groups`/`obj_objectives`/`obj_sub_items`/`obj_sub_entries`
- Objective review (`/objective-review`) — depends on `objective_groups_v2`/`objectives_v2`/`objective_entries_v2`
- Daily journal list (`/journal`) and its home widget — depend on `daily_journals` (+ reads `project_meetings`)
- Decisions/persona logs (`/decisions`) — depends on `persona_logs`
- Schedule/timeline editor (`/schedule`) — its `agenda_sub_tasks` branch specifically
- Completed/achievements tagging (`/completed`) — its `agenda_sub_tasks` (achievement_type) branch specifically (the `manual_achievements` table itself **is** created by the combined script and **is** testable)
- Text-selection capture overlay — its `sub_task_notes` branch specifically (its `quick_memos` branch is unaffected and **is** testable)

**Why this doesn't block the Quick Memo pilot (STEP 5's actual scope)**: none of the above is Quick Memo's core save path. `quick_memos` itself has a real `CREATE TABLE` (schema_v2.sql) and is fully creatable/testable in this dev project. The STEP 5 Quick Memo migration target and this gap are independent — recorded here only so a future attempt to test a *different* editor in this same dev project doesn't waste time before checking this table first.
