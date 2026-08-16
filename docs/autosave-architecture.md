# Autosave Architecture

**Status**: DESIGN ONLY — no code, migrations, or DB changes were made while producing this document. This is STEP 3 of a 4-step process; implementation requires explicit user approval and happens in a separate STEP 4.

**Inputs**: `docs/autosave-audit.md` (STEP 1 full inventory + STEP 2 verification, read in full and treated as read-only ground truth). Every factual claim about the current codebase below is traceable to a specific section/line citation in that document; where this document needed to re-confirm a fact, the audit's own citation is reused rather than re-deriving it.

**Two tracks.** This design explicitly separates two problems that the audit's own §14 (JSONB notes read-modify-write) proves are *not* the same problem:

- **TRACK A — Autosave / Draft / Recovery / Version History.** How and when content typed into an editor reaches durable storage, how a user recovers from a refresh/crash/network failure, and how a 7-day version history is created, browsed, and restored. This is a **timing and durability** problem: debounce, local buffering, retry, flush-on-navigation, version snapshots.
- **TRACK B — Concurrent Data Model (JSONB stale overwrite).** `meetings.notes`, `one_on_ones.notes`, `learning_resources.notes` are jsonb arrays that every writer must read-modify-write in full from a client-held copy (audit §8/§9 #5,#17,#18; confirmed 3 independent write surfaces for `meetings.notes` alone — meeting detail page, schedule widget, home brief widget). This is a **data modeling** problem: it would still cause silent lost updates even with a perfect, instantly-flushing autosave, because the race is "two clients rewrite the same whole column from two different stale copies," not "a save was too slow or got lost."

**A TRACK A fix does not fix TRACK B.** Making every keystroke durable, debounced, retried, and versioned does not stop two tabs from each holding a stale full copy of `meetings.notes` and overwriting each other's additions. The two tracks are designed separately below (Track A: chapters 5–16; Track B: chapter 17), with an explicit connection point: Track A's versioning/conflict-detection primitive (chapter 9) is the same mechanism Track B's recommended fix (chapter 17, Option B) needs for its own row-level optimistic locking — so building Track A's core first is *not wasted* even though it doesn't solve Track B by itself.

---

## 1. Executive Summary

The audit found **~15 independent hand-rolled autosave implementations** across 35 editor surfaces, **zero** version/history table anywhere in the schema, **zero** 7-day retention mechanism, 3 confirmed CRITICAL/P0 data-loss clusters (draft wiped after a failed insert on `/tasks/[id]`; failed save shown as success on `/meetings/[id]` and `MobileMemoSheet`; jsonb stale overwrite on `meetings`/`one_on_ones`/`learning_resources` notes), and a materially incomplete migration history (13 tables live in Supabase with no `CREATE TABLE` anywhere in the repo).

This document compares **4 candidate architectures** (Chapter 4) for Track A and recommends **Option C — Hybrid: generic autosave infrastructure + entity-specific canonical data, unchanged + generic versioned snapshot history**. In short: two new, small, generic tables (`autosave_drafts`, `content_versions`) keyed by `(entity_type, entity_id, field_key)` sit *alongside* the existing ~41 tables, which are not restructured. A shared `useAutosave()` hook/adapter (design only — not built in this STEP) replaces the ~15 hand-rolled debounce implementations. Existing canonical tables and existing manual "Save" buttons are preserved exactly as they are today; the new infrastructure adds a safety net (local buffer → server draft → version snapshot → 7-day history) underneath them, not a replacement of them.

For Track B (Chapter 17), the recommendation is **Option B — normalize the jsonb `notes` arrays into child tables**, following the pattern the codebase already uses successfully for `annual_goal_task_notes` / `sub_task_notes`. This is scoped, sequenced, and explicitly *not* assumed to be solved by Track A.

Top-5 reasons for the Track A recommendation are given in Chapter 5. Nothing in this document has been implemented; Chapter 24 lists what still needs explicit user approval before STEP 4 can begin.

---

## 2. Requirements

Priority key: **MUST** (blocks STEP 4 sign-off), **SHOULD** (strongly desired, may slip a phase), **OPTIONAL** (nice-to-have, explicitly descoped from v1 if time-constrained).

| # | Requirement | Priority | Note |
|---|---|---|---|
| 1 | 모든 편집화면 적용 | **MUST** | All 35 editor surfaces (audit §3) eventually move onto the shared primitive — but see Chapter 20 for phased rollout; "MUST" applies to the end-state, not STEP 4's first cut. |
| 2 | 실시간에 가까운 local persistence | **MUST** | Every keystroke (or near-every, see Ch.6) mirrors into a local recovery buffer before any network round-trip. |
| 3 | 짧은 debounce 후 server persistence | **MUST** | Standardize on ~600–800ms debounce for text fields (audit found 300–1500ms scattered across files); discrete-field edits (status/assignee/date) stay immediate, unchanged. |
| 4 | 저장실패시 유실 금지 | **MUST** | Directly targets audit P0 #3 (tasks/[id] draft wiped on failed insert) and P0 #1/#2 (failure shown as success). |
| 5 | 최소 7일 history 보존 | **MUST** | Currently 0 days anywhere (audit §5 LEVEL 3: confirmed absent). |
| 6 | history 언제든 조회 가능 | **MUST** | No history UI exists today at all (audit §6 req #5: FAIL). |
| 7 | 과거 version 복구 가능 | **MUST** | No restore mechanism exists today (audit §6 req #6: FAIL). |
| 8 | 새로고침 후 복구 | **MUST** | Currently PARTIAL — only 6 of ~35 screens have any localStorage draft (audit §11, §6 req #2). |
| 9 | 브라우저 종료 후 복구 | **MUST** | Same gap as #8; no `beforeunload` flush anywhere except an unrelated heartbeat cleanup (audit §1, `quickMemo.ts:46,50`). |
| 10 | 네트워크 오류 대응 | **MUST** | Currently FAIL for ~10 files (audit §2 #1/#10/#11). |
| 11 | Supabase 오류 대응 | **MUST** | Same root cause as #10 — Supabase JS resolves `{data:null, error}` rather than throwing, and it's not checked. |
| 12 | 인증만료 대응 | **SHOULD** | Cannot be fully solved client-side (session TTL/refresh config lives in Supabase Auth, outside repo — audit §13 #4); MUST-level requirement is narrowed to: *detect* a 401/JWT-expired error shape and surface a distinct "재로그인 필요" state rather than silently discarding it as an unknown network error. |
| 13 | 마지막 입력 flush 보장 | **MUST** | Targets audit P1 (unmount without flush, confirmed absent everywhere except the perf-review period-switch flush, audit §12). |
| 14 | 오래된 save가 최신 save 덮어쓰지 않음 | **MUST** | For Track A (draft/version layer): solved by per-field version compare-and-swap (Ch.9). For Track B (jsonb notes): a *separate* MUST, solved in Ch.17 — flagged here so it is not silently assumed solved by Ch.9 alone. |
| 15 | multi-tab 충돌 처리(가능하면) | **SHOULD** | Explicitly hedged "가능하면" in the source brief; recommendation (Ch.13) is conflict *detection + surfacing*, not automatic merge, for v1. |
| 16 | 기존 수동 Save 유지 | **MUST** | Every existing manual-save button/flow (quick memo, meeting new-note composer, template, etc.) keeps working exactly as today — see Ch.16. |
| 17 | Autosave/Final Save 구분 | **MUST** | New concept for ~10 LEVEL-2 screens that currently have no separate "final save" at all (Ch.16 defines how this is introduced without behavior change). |
| 18 | 기존 localStorage recovery 안전 migration | **MUST** | ~19 existing localStorage keys (audit §5) must not be silently orphaned; Ch.10 defines a compatibility read-path. |
| 19 | 7일 이전 cleanup 정책 | **SHOULD** | Correctness of the 7-day *window* is MUST; the *mechanism* that physically deletes rows past 7 days is SHOULD for v1 (a slightly-late cleanup is a storage-cost issue, not a data-loss issue — see Ch.14). |
| 20 | 자동저장 상태 확인 가능 | **MUST** | No screen today shows save-status beyond an ad hoc "저장됐어요" toast that is sometimes shown even on failure (audit P0 #2); Ch.15 defines the UI. |

---

## 3. Current-State Constraints

Everything in this chapter is a fact from `docs/autosave-audit.md`, cited by section, that the architecture in Chapters 4+ must be compatible with — not aspirational, not to be contradicted without re-checking the source.

**Scale and shape** (audit §1–§3): Next.js 15 App Router + Supabase (`@supabase/ssr`) + TipTap, single-user/small-team internal HR tool. 33 route files, 35 distinct editor surfaces, 41 distinct Supabase tables referenced from code. No `loading.tsx`/`error.tsx` anywhere.

**No shared autosave utility** (audit §4, §10 #1): exactly 3 hand-rolled "shapes" (A: debounce-then-fire-and-forget, ~15 occurrences; B: localStorage draft + manual save, ~7 occurrences; C: optimistic update + rollback, 4 occurrences, all in `SketchCanvas.tsx`). No central hook exists to fix once and inherit everywhere — the same bugs (no error check, no unmount flush) were independently reintroduced in ~10 files.

**Zero version/history mechanism** (audit §5 LEVEL 3, §6 req #4–#6): confirmed by grep across all 40 migration files for `draft|backup|history|revision|version_|autosave` — zero matches. `quick_memo_archive` (3-day/50-entry flat log) is the closest analog but is not per-record and not a true version list.

**Confirmed CRITICAL/P0 risk clusters** (audit §9, STEP 2 §2/§9 — all independently re-verified by direct re-read, not just STEP 1's draft):
**Numbering note (corrected in STEP 6.6 — the three items below are the official STEP 3.5 patch identifiers, unified across all project documents; a JSONB item was previously mislabeled `P0-3` here and has been renamed below to avoid colliding with the real `P0-3`, `MobileMemoSheet.tsx`):**
- **P0-1**: `tasks/[id]/page.tsx` `saveNote()` (lines 454-493) and `addTodo()` (~346-353) — insert error not destructured, then draft/input cleared **unconditionally**, regardless of whether the insert actually succeeded. This is the single most concrete, reproducible data-loss bug in the audit.
- **P0-2**: `meetings/[id]/page.tsx` `updateMeeting()` (lines 451-454) — write result never checked, local UI state (and the "저장됐어요"/"저장됨" indicator) updates unconditionally, so a failed save is indistinguishable from a successful one.
- **P0-3**: `MobileMemoSheet.tsx` `handleSave()` (lines 37-46) — same "write result never checked, success shown regardless" bug, on the mobile quick-memo sheet's own independent save path.
- **JSONB interim lock (미착수, Track B 관련 후속 과제)** — not a STEP 3.5 patch, not numbered P0-anything: `meetings.notes` / `one_on_ones.notes` / `learning_resources.notes` full-column read-modify-write from stale client state, confirmed 3 independent write surfaces for `meetings.notes` (meeting detail page, `schedule/page.tsx:297`, `MeetingBriefWidget.tsx:207-210`). This is Track B, not Track A (see intro).

**P1 risks** (audit §9 #7, #8/9, §4 class D): unmount-without-flush confirmed absent in every LEVEL-2 file checked (no `useEffect` cleanup fires the pending debounced write on unmount); refresh/tab-close during debounce loses input for every screen with no localStorage draft (the majority of "real" content fields — task/sub-task/project-item/annual-goal-task notes & descriptions, one-on-one session notes, learning notes, template); `one_on_one_template`'s select-then-branch (not a true upsert) can still double-insert across tabs despite a same-tab-only `insertInFlight` guard added since STEP 1.

**Schema drift** (audit §6b, §7, §13): 13 tables live in Supabase with **no `CREATE TABLE` anywhere** in the 40 committed migration files (`agenda_sub_tasks`, `sub_task_notes`, `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs`). None of these 13 has a TS interface in `src/types/index.ts` either. PK/FK/CHECK/RLS/trigger behavior for all 13 is **unknown from static analysis** — any architecture that assumes it knows their DB-level guarantees is guessing.

**Objectives duplication** (audit §6b #2, §13 #3): `obj_groups`/`obj_objectives`/`obj_sub_items`/`obj_sub_entries` (used only by `/objectives`) and `objective_groups_v2`/`objectives_v2`/`objective_entries_v2` (used only by `/objective-review`) are two structurally parallel, table-distinct schemas for what reads as the same "quarterly objectives" concept. Whether this is intentional or an abandoned-migration artifact **cannot be determined from code** — flagged as a product decision in Ch.19, not resolved here.

**Existing features that MUST be preserved as-is** (audit §12, STEP 2 §10 — re-verified): quick-memo popup's full draft lifecycle (per-window `qid` draft, orphan-draft recovery picker, checked-error-with-retained-draft, 3-day archive); the multi-window heartbeat mechanism (`lib/quickMemo.ts`); SketchCanvas's optimistic-update-with-rollback and drag-stop-only position persistence; `AgendaMatrix`/`AnnualRoadmap` drag-reorder error toasts; universal `JSON.parse` try/catch on every localStorage read; the `user_settings`/`user_preferences` dual-write-with-localStorage-fallback pattern; perf-review's period-switch flush (the one genuine existing "flush on transition" mechanism); `one-on-one/template`'s same-tab `insertInFlight` guard.

**RLS is not currently a design constraint for auth'd users** (audit §6a): every RLS policy found is `USING (true) WITH CHECK (true)` for `authenticated` — no row-level ownership model exists. New tables (`autosave_drafts`, `content_versions`) can follow this same permissive pattern initially without introducing new access-control complexity, though Ch.4's RLS-difficulty criterion still evaluates each option's *exposure* (how much new surface area needs a policy at all).

---

## 4. Architecture Options

Four candidates were evaluated for **Track A** (Track B options are separate, Chapter 17).

- **Option A — Generic Draft + Generic Version History.** One generic `autosave_drafts` table and one generic `content_versions` table, both keyed by `(entity_type, entity_id, field_key)`, used for *every* editor surface uniformly. Canonical per-entity tables are still the source of truth for "current" content; drafts/versions are metadata layered on top.
- **Option B — Entity-Specific Draft/History Tables.** Each entity type gets its own dedicated pair of tables mirroring its own schema, e.g. `task_notes_drafts`/`task_notes_history`, `meeting_notes_drafts`/`meeting_notes_history`, `learning_notes_drafts`/`learning_notes_history`, etc. — one pair per editable field-group, potentially 15-20+ new table pairs.
- **Option C — Hybrid (recommended).** Same generic `autosave_drafts` + `content_versions` tables as Option A (shared infra, one shared hook), but explicitly **does not touch or restructure any existing canonical table**. The generic tables are additive-only; every existing `.from(table).update(...)` call site keeps writing to its existing canonical table exactly as today, with the new hook wrapping that call rather than replacing it.
- **Option D — Event-Sourced / Append-Only Patch Log.** Instead of storing full-content snapshots, store diffs/patches per keystroke-batch in an append-only `content_events` table; "current" and "any past version" are both derived by folding events forward from a base state.

Comparison against the 16 requested criteria, evaluated specifically against jin-dashboard's actual structure (41 tables, 35 editor surfaces, single-user/small-team scale, no current schema-migration tooling beyond hand-written numbered SQL files):

| Criterion | A — Generic | B — Entity-Specific | C — Hybrid (recommended) | D — Event-Sourced |
|---|---|---|---|---|
| **구조** | 2 generic tables total, metadata-only | 15-20+ table pairs, one per entity/field-group | 2 generic tables total, metadata-only, canonical layer untouched | 1 append-only event table + replay logic |
| **DB 복잡도** | Low (2 tables) | Very high (30-40+ new tables to reach full coverage) | Low (2 tables) | Medium (1 table, but replay logic lives partly in DB/partly in app) |
| **구현 복잡도** | Medium — one hook, but needs a `field_key` registry mapping screens to entity_type/field_key | High — every screen needs its own bespoke draft/history wiring, defeating the "shared primitive" goal from the outset | Medium — same hook as A, plus a thin adapter per screen that already exists today (the debounce call site) | High — replay/reconstruction logic is unfamiliar to this codebase's current patterns (no CQRS/event-sourcing precedent anywhere in the 41 tables) |
| **기존코드 migration 난이도** | Medium — every screen's debounce call site needs to call the new hook, but canonical tables don't change | Very high — both the hook-call-site AND a bespoke new table pair per entity | Medium — identical migration cost to A at the call-site level, but *zero* risk to canonical tables since they're never touched | High — existing debounce-to-canonical-table writes must be reframed as "append an event," a bigger conceptual change for ~15 files at once |
| **데이터무결성** | Good — versions are exact snapshots, easy to reason about | Good — same, plus entity-specific constraints possible per pair | Good — same as A; canonical tables keep their existing (if imperfect) integrity untouched | Good in theory, but replay bugs are a real risk class this team has no prior experience debugging (no event-sourcing code exists anywhere in the repo today) |
| **7일 history 구현난이도** | Low — `expires_at = created_at + 7d` on one table, one cleanup query pattern reused everywhere | Low per-pair, but the *same* pattern must be re-implemented/re-verified 15-20+ times | Low — identical to A, single table, single cleanup query | Medium — "prune events older than 7 days" is unsafe unless a snapshot exists to replay from after pruning, adding a compaction step even for v1 |
| **recovery 난이도** | Low — one query shape (`SELECT * FROM autosave_drafts WHERE entity_type=... AND entity_id=...`) works for every screen | Low per-pair, but a recovery UI component must know which table to query per entity — no single query shape | Low — identical single query shape to A | Medium — recovery requires replaying events, not a single row read |
| **versioning** | Clean — integer/hash-based version per (entity,field) row, uniform | Clean, but duplicated logic per pair | Clean — same as A | Native to the model, but overkill for the mostly-single-field text edits this app has |
| **concurrency** | Handles via version compare-and-swap uniformly (Ch.9) | Same mechanism, but implemented N times with N chances to diverge | Same uniform mechanism as A | Naturally serializes via event order, but conflict *detection* still needs the same version-compare idea layered on top — no free lunch |
| **multi-tab** | Same detection primitive works everywhere (one `version` column shape) | Same primitive, N implementations | Same primitive, one implementation | Possible via event ordering, but harder to explain in a small-team UI ("what does 두 개의 patch가 동시에 왔다 mean to a non-engineer") |
| **offline** | Straightforward — one local queue shape drains against one generic endpoint | Straightforward per pair, but N queue shapes if not disciplined | Straightforward — one local queue shape, same as A | Naturally offline-friendly (append events locally, sync later) but the biggest lift to build correctly |
| **storage 비용** | Low — one narrow draft row + a handful of version rows per active field, capped at 7 days | Low per-pair, but 15-20+ tables each need their own cleanup/index maintenance — higher operational overhead even if raw bytes are similar | Low — identical bytes to A, one cleanup job | Potentially higher — a full log of every meaningfully-changed patch, not just consolidated snapshots |
| **query 복잡도** | Simple, uniform `WHERE entity_type= AND entity_id=` filters everywhere | Simple per table, but "show me all history for this task" requires knowing which of several tables to query | Simple, uniform, identical to A | More complex — reconstructing "content as of version N" requires folding events, not a single-row `SELECT` |
| **debugging** | Easy — one table to inspect for any screen's draft/history state | Harder — an engineer must remember which of 15-20+ tables backs a given screen | Easy — identical to A, and canonical-table behavior is unchanged from today (nothing new to relearn there) | Hardest — a bug can only be understood by replaying the event sequence, unfamiliar debugging model for this team |
| **신규 editor 추가 난이도** | Add one `entity_type` constant + one hook call — trivial | Add a new table pair every time — the "~15 hand-rolled implementations" problem recurs at the schema level instead of the code level | Add one `entity_type` constant + one hook call — identical to A, trivial | Add a new event-type enum + replay-fold logic — nontrivial |
| **Supabase RLS 적용난이도** | Trivial — 2 tables need one permissive policy each, matching the existing `USING (true)` pattern everywhere else (audit §6a) | Tedious — 15-20+ tables each need a policy, more surface area to get wrong or forget | Trivial — identical to A, 2 tables total | Trivial for the 1 event table, but any derived read-model tables (if added later) would need their own |
| **현재 앱과의 호환성** | High — additive, doesn't touch canonical tables | Medium — additive to canonical tables, but the *volume* of new schema is disproportionate to the app's actual size/team | **Highest** — additive only, canonical tables and all 35 existing screens' current persistence behavior are literally unchanged until each screen is explicitly migrated (Ch.20) | Low — no precedent for this pattern anywhere in the existing 41-table schema; would be the first and only event-sourced piece in an otherwise fully relational app |

**Why not A outright, if C looks identical in most rows?** A and C share the same two tables and the same hook. The distinction is a design *discipline*, not a schema difference: Option A as stated doesn't explicitly rule out later "simplifying" by having the generic draft table become the write target instead of the canonical table (collapsing draft and canonical). Option C makes that explicit non-goal a first-class constraint: **canonical tables are never bypassed**, the generic tables are strictly additive metadata. This matters given audit §10 #2 and #7 already show this codebase accumulating "two storage locations for the same concept" (jsonb notes + separate note tables; `user_settings` + `user_preferences`) — Option C is deliberately worded to not add a third instance of that anti-pattern.

**Why not D**, despite its theoretical elegance for versioning/offline: the codebase has zero event-sourcing precedent across all 41 tables, this is a single-user/small-team internal tool (not a domain where audit-log-grade event history has independent product value), and the "7-day retention + browse + restore" requirement is naturally a snapshot concept, not an event-replay concept. D's advantages (perfect offline queueing, natural conflict resolution) are real but solve problems this app doesn't strongly have, at a debugging-complexity cost this team has no prior experience absorbing.

---

## 5. Recommended Architecture

**Decision: Option C — Hybrid (generic autosave infrastructure + entity-specific canonical data, unchanged + generic versioned snapshot history).**

```
Editor → Autosave Adapter/Hook → Autosave Core
  (Local Recovery Buffer / Server Draft Persistence / Version Creation / Retry / Error State / Flush / Conflict Detection)
  → 7-Day Version History → History/Recovery UI
```

- **Editor**: any of the 35 existing screens/components (unchanged UI, unchanged TipTap/textarea/input components — audit §15 confirms all shared editor components are already pure controlled inputs with no save logic of their own, so this layer needs no change at all).
- **Autosave Adapter/Hook**: a single new `useAutosave({ entityType, entityId, fieldKey, value, onCanonicalWrite })`-shaped hook (design only, per this STEP's constraints — not implemented here) that every screen's existing debounce call site is migrated onto (Ch.20), replacing the ~15 hand-rolled `useRef<Timeout>` implementations one at a time.
- **Autosave Core**: the hook's internals — local recovery buffer (Ch.10), server draft persistence (Ch.11), version creation (Ch.8), retry (Ch.12), error/state model (Ch.7), flush-on-unmount/navigation (Ch.6), conflict detection (Ch.9/13).
- **7-Day Version History**: the `content_versions` table (Ch.8/14), populated by the Core on meaningful changes.
- **History/Recovery UI**: a new, generic history panel (Ch.15) that works identically for any `entity_type` since the underlying query shape never changes (Ch.4's "query 복잡도" row).
- **Final Save** is an explicitly separate lifecycle from Autosave (Ch.16) — it is not a step inside the diagram above, it is a parallel action some screens already have (quick memo, meeting new-note composer) and some don't (task notes) that this design adds uniformly without changing what "저장" means for screens that already have it.

**Draft-History relationship (Decision for Ch.7/Ch.8, stated here since it drives the option choice):**
- **Draft and History are separate tables**, not the same table with a status flag, and not a jsonb array bolted onto the canonical row. Reason: a draft is mutable/single-current-value-per-field (upserted continuously), while a version-history row is immutable-once-written (append-only, never updated). Conflating them would mean either (a) drafts silently accumulating unbounded rows if treated as append-only, or (b) history being destructively overwritten if treated as upserted — both wrong.
- **The canonical per-entity table remains the single "current value" source of truth for reads** everywhere in the app outside of the history panel — this is what makes Option C additive rather than a rearchitecture. `autosave_drafts` is a recovery buffer + in-flight state tracker, not a second copy of "the truth."

**Top-5 reasons for choosing Option C:**
1. **Zero risk to the 41 existing tables and ~15 existing save flows.** Every one of the audit's "must preserve" features (Ch.3) keeps working unmodified until its screen is explicitly migrated (Ch.20) — there is no big-bang cutover risk.
2. **One shared primitive genuinely replaces ~15 duplicated implementations**, directly fixing audit §10 #1 ("no shared autosave utility... same bug reintroduced in ~10 files") without also forcing ~15-20+ new bespoke tables (Option B's cost) or an unfamiliar event-sourcing model this team has never worked with (Option D's cost).
3. **The 7-day-history and recovery-UI requirements (Ch.2 #5-#7) get a single, uniform implementation** instead of 15-20+ near-duplicate implementations that would each need independent correctness verification (Option B) — directly the lowest score-card cost in "구현 복잡도"/"debugging"/"신규 editor 추가난이도" in Ch.4's matrix.
4. **It doesn't paper over Track B.** Because canonical tables are untouched, `meetings.notes` remains exactly as broken as the audit found it until Chapter 17's normalization is separately executed — this design does not create a false sense that "autosave fixed everything," which is precisely the trap the task brief warned against.
5. **Lowest RLS/schema-governance surface added at once** (2 new permissive-policy tables, consistent with the existing `USING (true)` pattern everywhere — audit §6a) — appropriate given 13 of the 41 existing tables are *already* undocumented drift (Ch.3); adding 15-20+ more schema objects at once (Option B) would compound that governance problem rather than help it.

---

## 6. Autosave Lifecycle

**Design intent, not implementation**: the sequence below describes what the Autosave Core (Ch.5 diagram) is responsible for; no timers, hooks, or components are being written in this STEP.

**On every input event**: the editor's existing controlled-input `onChange` fires as it does today → the Core updates in-memory state (as today) **and** synchronously mirrors the new value into the Local Recovery Buffer (Ch.10 — a localStorage write, cheap, matching the existing quick-memo pattern of "write to localStorage on every keystroke, no debounce, since it's local and cheap" — audit §8a). This satisfies Ch.2 req #2 (실시간에 가까운 local persistence) uniformly across all screens, not just the 6 that have it today.

**Server debounce**: a single timer per `(entityType, entityId, fieldKey)` resets on every keystroke (unchanged behavior from today's pattern — audit §9 risk #6 confirms "debounce loses last keystroke" is not applicable as currently coded, since every implementation already resets the timer). Recommended standardized window: **~700ms** for free-text fields (splitting the difference within today's observed 300–1500ms range, audit §4), left as a per-field-type tunable, not a hardcoded global constant. Discrete-field edits (status toggle, assignee/date picker, drag-reorder) are **not** debounced at all — they stay LEVEL 0 (immediate single `.update()` call, audit §5), unchanged, since last-write-wins is already correct/expected behavior there (audit §11).

**Continuous input, timer firing, and in-flight requests**: if a new keystroke arrives while a server request from a *previous* debounce firing is still in-flight, the Core does **not** fire a second concurrent request. It marks the newly-changed value as "superseded" and, when the in-flight request settles (success or failure), immediately checks whether the buffered value has changed since the request was issued — if so, it fires exactly one more request for the latest value, not one per keystroke that arrived meanwhile. This collapses "N keystrokes during a slow request" into at most 2 network round-trips (the one in flight, plus one more for whatever is newest once it returns), never more.

**Request-order inversion** (the audit's own scenario: request A built from v10 fires, then B built from v11 fires and lands first): handled structurally by the in-flight-request rule above for the *normal* single-tab case (there is only ever one in-flight request per field at a time, so A and B as described can't both be in flight from the same tab). The **cross-tab** version of this race (two different tabs/sessions each building their own v10→v11 style write) is a genuine concern and is handled by the version compare-and-swap described in Chapter 9, not by debounce sequencing — debounce ordering only protects a single tab against itself.

**Refresh immediately after the last keystroke**: since the Local Recovery Buffer write is synchronous and happens before the debounce timer would have fired, a refresh in this window still finds the latest keystroke's value in the buffer on reload, even if the server round-trip for it never completed. Recovery UI (Ch.15) surfaces this as a "복구 가능한 변경사항이 있습니다" banner rather than silently overwriting whatever the server-canonical value currently shows.

**Unmount flush**: when the editor component unmounts (route change, closing a detail panel, etc.), the Core's cleanup **fires the pending debounced write immediately** (not just clears the timer) if the buffered value differs from the last value successfully sent to the server — generalizing the one place this already exists correctly today (perf-review's period-switch flush, audit §12) into a universal rule, directly closing audit P1 risk #7.

**`pagehide`/`visibilitychange`/`beforeunload`**: recommend using **`pagehide`** (fires reliably on both tab-close and back/forward-cache navigation, unlike `beforeunload` which is increasingly unreliable/deprecated-in-spirit for mobile Safari and bfcache scenarios) as the trigger to attempt one last best-effort flush. `visibilitychange` (`document.visibilityState === 'hidden'`) is a **secondary** trigger for the same flush logic, since it also reliably fires on tab-switch/backgrounding on mobile where `pagehide` timing can be inconsistent. Plain `beforeunload` is **not** relied upon as the primary mechanism (it cannot be used reliably to block/await an async network requestanyway) — it may still show a native "변경사항이 저장되지 않았을 수 있습니다" confirmation prompt as a secondary UX safety net, but the actual data-safety mechanism is the Local Recovery Buffer (already durable, no confirmation dialog needed to "save" it) plus the best-effort `pagehide` flush attempt.

**`sendBeacon` necessity**: **not required.** `sendBeacon` matters when a page is being unloaded and you must guarantee an HTTP request is sent *after* the JS context may be torn down — but this design's actual safety net for the unload case is the **already-durable Local Recovery Buffer**, not a race to get one more network request out the door. The `pagehide` flush is a best-effort optimization to reduce how often recovery-from-buffer is needed on next load, not the last line of defense. Given Supabase writes need an authenticated fetch with the Supabase client (not a trivial beacon-shaped POST), and the actual durability guarantee comes from localStorage, `sendBeacon` adds implementation complexity (a parallel unauthenticated-looking transport, or a same-origin API route shim) for marginal benefit at this app's scale — explicitly descoped (OPTIONAL, revisit only if real-world data shows the recovery-buffer path is being hit often enough to matter for UX friction).

**Retry on failure**: see Chapter 12 for the full retry/offline design; in short, a failed server write does not clear the Local Recovery Buffer, transitions the field's state to `failed` (Ch.7), and schedules a backoff retry.

**State transition diagram** (per `(entityType, entityId, fieldKey)`, text form):

```
                    ┌─────────────┐
        (no change) │ local-only  │◄──────────────────────────┐
                     └──────┬──────┘                            │
                            │ debounce timer fires               │
                            ▼                                    │
                     ┌─────────────┐    request fails            │
                     │   syncing   │────────────────────►┌───────┴────┐
                     └──────┬──────┘                      │  failed    │
                            │ success (version compare OK) └───────┬────┘
                            ▼                                       │ retry succeeds
                     ┌─────────────┐                                │
                     │   synced    │◄───────────────────────────────┘
                     └──────┬──────┘
                            │ version compare fails (Ch.9: someone else's
                            │ write landed first — cross-tab/cross-device)
                            ▼
                     ┌─────────────┐
                     │  conflict   │──► surfaced in UI (Ch.13/15), user
                     └─────────────┘    chooses keep-mine / take-theirs / merge-manually

  On page load, if Local Recovery Buffer has a value newer than last known `synced`
  state for this field:
                     ┌─────────────┐
                     │  recovered  │──► shown as a recovery banner (Ch.15), user
                     └─────────────┘    confirms or discards before it becomes `local-only`
```

`pending` (the state named in the task brief) is folded into `local-only` (buffered, not yet due for a server attempt) vs `syncing` (server attempt in flight) — kept as two states rather than one generic "pending," since the UI (Ch.15) needs to distinguish "still typing, nothing sent yet" from "sent, waiting on Supabase" for an honest status indicator (Ch.2 req #20).

---

## 7. Draft Model

**What a "draft" is in this architecture**: the Local Recovery Buffer (client-side, Ch.10) plus its server-side mirror, the `autosave_drafts` row for a given `(entityType, entityId, fieldKey)`. A draft represents "the latest value the user typed, whether or not it has reached the canonical table yet." It is **not** a second copy of application data for normal reads — every screen's normal render path continues to read from the canonical table exactly as today; the draft is consulted only at mount time (to detect "is there a more recent unsynced value than what canonical currently shows") and by the recovery/history UI.

**`autosave_drafts` shape (conceptual, not a migration)**: one row per `(entity_type, entity_id, field_key, client_scope)`, holding the latest buffered content, a `status` matching Chapter 6's state machine, `local_updated_at`, `server_received_at`, and the `version` it was built against (Ch.9). `client_scope` exists to support the same-user-multiple-tabs case distinctly from a genuinely different session, informing Chapter 13's multi-tab design — not to create per-tab silos of truth.

**A–J states, as given in the task brief, mapped onto the state machine in Ch.6:**

| # | Scenario | Draft state | What happens to the data |
|---|---|---|---|
| A | 정상 온라인 | `local-only` → `syncing` → `synced` | Normal path; buffer written immediately, server write within ~700ms, buffer's job done once `synced`, but buffer content is *not deleted* — it's kept and just marked synced, so a later crash before the *next* edit still has something to fall back to. |
| B | 네트워크 끊김 | `local-only` → `syncing` → `failed` | Local Recovery Buffer keeps the value (never cleared on failure — this is the direct fix for audit P0-1/P0-3-style "cleared regardless of success" bugs). Retry scheduled per Ch.12. |
| C | Supabase 오류 (5xx/etc) | Same as B — `failed`, buffer retained, retry scheduled. The Core does not distinguish "network down" from "Supabase down" for the retry mechanism (both look like a failed request), only for the *message shown to the user* (Ch.15) where possible. |
| D | 새로고침 | Buffer survives (it's localStorage, unaffected by reload). On remount, Core compares buffer's `local_updated_at`/content against canonical's current value; if buffer is newer/different, state becomes `recovered` and the recovery banner shows (Ch.6/15). |
| E | 브라우저 종료 | Same as D — buffer is durable across process restarts by construction (localStorage), the `pagehide` best-effort flush (Ch.6) just reduces how often recovery is actually needed. |
| F | 재로그인 (same session resumed later) | Buffer keyed by entity/field, not by session — reappears and is evaluated the same as D once the user is back in the app. |
| G | 인증만료 mid-edit | The failed server write's error is inspected for an auth-expired shape (Ch.2 req #12); state becomes `failed` with a distinct sub-reason (`auth_expired`) so the UI (Ch.15) can show "재로그인이 필요합니다" instead of a generic retry message. Buffer is retained regardless — an expired session must never be the trigger for discarding unsent content. |
| H | 서버저장 성공 | State → `synced`. The version row is created/updated per Ch.8/9's dedup rule (not on every success blindly). |
| I | 서버저장 실패 | State → `failed`, buffer retained, exponential backoff retry begins (Ch.12), user sees a visible failure indicator (Ch.15) — directly closing audit P0-2 ("failure treated as success"). |
| J | localStorage quota 초과 | The buffer write itself can throw `QuotaExceededError` (audit §9 risk #14, confirmed currently unhandled/silently swallowed everywhere). This architecture requires the buffer writer to catch this specifically (not just a bare `try{}catch{}` that no-ops) and: (1) still attempt the server write immediately rather than waiting for the next debounce tick, since local buffering isn't available as a fallback right now, (2) surface a distinct "로컬 저장 공간 부족 — 서버에 직접 저장 시도 중" state, and (3) opportunistically prune old/expired local buffer entries before retrying the write once. This does not require IndexedDB (Ch.12 explains why) — it requires the existing quota-exceeded case to stop being silently swallowed. |

**Where failed data lives and in what state (explicit answer to the brief's question)**: at all times during states B/C/G/I, the authoritative unsent content lives in **(1)** the in-memory React state the user is still looking at (unchanged, nothing to do here) and **(2)** the Local Recovery Buffer in localStorage (durable across refresh/close). It is deliberately **not** required to have reached the server-side `autosave_drafts` table to be considered "safe" — the local buffer is the first line of defense precisely because it works even when every server interaction is failing. The server-side draft row and the version history are the *second* line of defense (device-independent recovery, and the 7-day browsable history), populated once connectivity returns.

---

## 8. Version History Model

**What creates a version**: not every debounced sync. A `content_versions` row is written when **(a)** a server sync succeeds (state `synced`, Ch.6/7) **and** **(b)** the new content's hash differs from the hash of the most recent existing version for that `(entity_type, entity_id, field_key)`. This directly answers the task brief's dedup question ("동일 내용 중복 version 방지법"): **content-hash comparison against the immediately-preceding version, skip insert on match.** No time-based sampling ("snapshot every N minutes") is used, because it would either miss a meaningful change that happens to land between samples or store meaningless duplicates that happen to coincide with a sample tick — hash-on-successful-sync is exact.

**Does every keystroke create a version?** No — only successful *server syncs* are candidate version points (already debounced to ~700ms, Ch.6), and only those whose content actually differs from the last stored version become a row. A user typing continuously for 5 minutes without pausing produces roughly one version every ~700ms **only if** the content keeps materially changing between syncs (normal typing does change the content each time, so in the worst case this can still be a lot of rows — Chapter 14 addresses whether this needs further throttling for the 7-day-retention storage budget).

**Final Save and version creation**: when a screen has an explicit Final Save action (Ch.16), that action **always** creates a version row (even if content-identical to the last autosave version), tagged `source: 'final'` rather than `source: 'auto'`. This is intentional, not a contradiction of the dedup rule above: a final save is a meaningful user-intent event ("I am done, this is confirmed") distinct from an autosave sync, and the history UI (Ch.15) uses the `source` tag to visually distinguish "확정 저장" points from the denser stream of autosave snapshots, so a user browsing history isn't just seeing an undifferentiated wall of near-identical entries.

**`content_versions` shape (conceptual)**: `(entity_type, entity_id, field_key, version_no, content, content_hash, source ['auto'|'final'], created_at, expires_at, created_by)`. `version_no` is a monotonic integer per `(entity_type, entity_id, field_key)` (not a global sequence), used both for ordering in the history UI and as the concurrency token described in Chapter 9 — the same integer serves both purposes rather than maintaining two separate counters.

**Relationship to the Draft table**: the draft (Ch.7) is mutable and represents "latest, possibly unsynced" state; a version is immutable once written and represents "a specific, confirmed-synced (or final-saved) point in time." A draft is promoted into a version only at the moment of a successful, content-changed sync — never before, since an in-flight/failed draft has no guarantee of correctness worth preserving as a permanent history entry (the buffer already preserves it for recovery purposes, per Ch.7; the *version* table is specifically for confirmed, durable snapshots, not for every transient local edit).

---

## 9. Versioning & Concurrency

**Options considered**: (1) integer version counter per field, (2) raw timestamp/`updated_at` comparison, (3) content hash alone, (4) optimistic-concurrency version column with compare-and-swap, (5) some combination.

**Recommendation: integer `version_no` per `(entity_type, entity_id, field_key)`, used as an optimistic-concurrency compare-and-swap token, plus `content_hash` for the separate dedup purpose already described in Ch.8.** Raw timestamps are explicitly **not** used as the concurrency mechanism (though `created_at`/`updated_at` are still stored for display and for the 7-day retention window in Ch.14) — clock skew between a client and server, or between two client devices, makes timestamp-based "who's newer" comparisons unreliable for a correctness-critical decision, whereas a server-issued monotonic integer has no such ambiguity.

**The race described in the task brief, worked through at query-condition level (conceptual, no SQL execution):**

- Request A is built by a client that last saw `version_no = 10`.
- Request B is built by a different client (or a different tab) that also last saw `version_no = 10`, but reaches the server first and successfully advances the stored row to `version_no = 11`.
- Request A then arrives. Its write is expressed conceptually as: *"update this row's content, **but only if its current `version_no` is still 10**; if so, set content and bump `version_no` to 11."*
- Since the server-side `version_no` is already `11` (B got there first), A's conditional update matches **zero rows** — not because of A's timestamp being "older" than B's, but because the row's actual current version no longer matches what A assumed when it started. A's write is rejected outright, never applied, regardless of the wall-clock order the two requests happen to arrive in.
- The client that issued A observes "0 rows affected" (or an equivalent conflict signal) and transitions that field to the `conflict` state from Chapter 6/7, rather than silently retrying with stale data or overwriting B's already-landed content.

This is the general shape of "optimistic concurrency control via a version compare-and-swap," described here only at the level of what condition the write is gated on — no actual SQL/migration is written or run in this STEP, per the task's constraints.

**Why this specific race matters more for drafts/versions than for canonical writes today**: today's canonical writes (audit-documented, Ch.3) are *already* last-write-wins with no version check at all for most fields — which is acceptable for single-column fields (status, assignee) per the audit's own judgment (§11: "last-write-wins is the correct/expected behavior there"). This architecture does **not** propose adding version-gating to every one of those existing single-value canonical writes (that would be a much larger, riskier change to 41 tables' write paths for marginal benefit). It **does** propose version-gating specifically at the **draft/version layer** this design adds, so that the *history* and *recovery* mechanisms this document is building are themselves internally consistent and race-free — and, separately, the same compare-and-swap primitive is what Chapter 17 reuses for Track B's jsonb-notes fix, which is where version-gating on the *canonical* write path actually is warranted (because that's where real, confirmed data loss occurs today, unlike a status toggle).

---

## 10. Local Persistence

**Local Recovery Buffer**: one localStorage entry per `(entity_type, entity_id, field_key)` (or a small number of consolidated entries per entity, to bound the number of distinct keys — implementation detail for STEP 4, not decided here), written synchronously on every input change per Chapter 6, following the existing quick-memo pattern (`memo/quick/page.tsx`'s `saveDraft`, audit §8a) of "write on every keystroke since it's cheap and local," generalized to every screen instead of just one.

**Migrating the ~19 existing localStorage keys (audit §5) safely (Ch.2 req #18)**: none of the existing keys are deleted or renamed in this design. Instead, the new generic buffer is introduced **alongside** them, and each screen's migration (Ch.20) includes a one-time **compatibility read**: on first mount after a screen is migrated onto the new hook, if an old-format key for that screen exists (e.g. `meeting_draft_${id}`, `JOURNAL_DRAFT_KEY`, `feedbackDraftKey(month)`) and the new generic buffer for the same entity has no value yet, the old value is read once, written into the new buffer format, and the old key is left in place untouched (not deleted) for at least one full release cycle, in case a user has an old browser tab/cached bundle still writing to it. Old keys are only removed in Migration Phase 6 (Ch.20), after the compatibility window has passed and telemetry (or simply elapsed time, given this app's scale doesn't have telemetry infra) confirms the new buffer is the active path.

**Format versioning for the buffer itself**: unlike today's keys (audit §7: "no key uses a version/schema field"), the new buffer's JSON shape includes an explicit `schemaVersion` field from day one, so a *future* format change to the buffer itself doesn't require guessing at parse time — a mismatched `schemaVersion` triggers a defined migration-or-discard path instead of an undefined shape mismatch silently producing `undefined` fields downstream (directly avoiding a repeat of audit §7's structural gap).

**Quota handling**: per Chapter 7 scenario J, quota-exceeded is caught specifically (not swallowed by a bare `try{}catch{}`), triggers an immediate server-write attempt in lieu of local buffering, and opportunistically prunes expired/synced buffer entries. This is a **behavioral requirement** carried into STEP 4's implementation, not a schema decision, so it's recorded here rather than in a table design chapter.

**Session vs local storage**: existing `sessionStorage` usage (`project-tab`, `annual-goals-tab`, `_qmc` — audit §5) is UI-preference state, not content-recovery state, and is explicitly **out of scope** for this architecture — it is not migrated onto the new buffer, since it was never a data-loss risk to begin with.

---

## 11. Server Persistence

**`autosave_drafts` as the server-side mirror of the Local Recovery Buffer**: written on the same ~700ms debounce as the canonical write (Ch.6), via a single upsert per `(entity_type, entity_id, field_key, client_scope)`. This exists specifically to satisfy Ch.2 req #9 (브라우저 종료 후 복구) and req #8 in the cross-device case: a localStorage buffer alone cannot recover a draft on a *different* browser/device, and the audit explicitly flags today's recovery as entirely single-browser-profile-scoped (audit §1: "no cross-device or cross-browser draft recovery anywhere") — the server draft row is what closes that specific gap.

**Relationship between the debounced canonical write (today's existing behavior) and the new draft write**: both fire from the same debounce tick, not two separate timers — the Core issues the draft upsert and the canonical write as part of one sync attempt, so there is exactly one round-trip pattern per debounce firing (draft write + canonical write), not a doubling of network chattiness per keystroke-pause. Whether these are two separate requests or combined into one transaction-like call is an implementation choice for STEP 4; conceptually they are the same "sync event."

**Ordering of writes within one sync attempt**: draft/version bookkeeping happens **after** the canonical write's version-gated compare-and-swap succeeds (Ch.9) — never before, and never independently of it succeeding, so that a version row is never created for content that didn't actually make it into the canonical table (this is what makes the version history trustworthy as "what was actually saved," not "what was attempted").

**Debounce timing recommendation recap** (tying together Ch.2 #3 and Ch.6): ~700ms standard for free-text fields, 0ms (immediate) for discrete-value fields, both configurable per `field_key` registration rather than hardcoded, so a future editor with different needs (e.g., a very large document vs. a short title field) isn't forced into one global constant.

---

## 12. Retry & Offline Strategy

**Options considered**: (1) simple immediate retry, (2) exponential backoff, (3) a persistent local queue (localStorage-backed), (4) an IndexedDB-backed queue.

**Recommendation: exponential backoff retry against the existing Local Recovery Buffer, without introducing IndexedDB.** The task brief explicitly warns not to assume "IndexedDB is required" just because it's the theoretically more capable choice — and at this app's actual scale (single-user/small-team, text-sized content, audit confirms **no** `indexedDB` usage anywhere today, §5) a dedicated queue store is disproportionate. The Local Recovery Buffer (Ch.10) already durably holds "the one current unsent value per field" — which is sufficient, because for any single field, only the *latest* value ever needs to be sent (an older superseded value is never worth retrying once a newer one exists, per the in-flight-request collapsing rule in Ch.6). A true offline **queue** (an ordered list of distinct pending operations to replay in order) is warranted for something like "a list of independent create-events," which this app's autosave use case doesn't structurally need — every retry target is "sync the current value of this one field," which the existing buffer already represents without needing a separate queue data structure.

**Backoff shape**: on failure, retry after 2s, then 4s, then 8s, then 15s, capped, up to roughly 5 attempts before settling into a slower background retry (e.g., once every 30s) while state stays `failed` and visibly so (Ch.15) — exact numbers are an implementation-tuning detail for STEP 4, the shape (exponential, capped, bounded fast-retry count, then a slow ongoing background retry rather than giving up entirely) is the architectural decision.

**Reconnect-triggered retry**: the browser's `online` event (and/or `visibilitychange` back to visible, Ch.6) immediately triggers a retry attempt for any field currently in `failed` state, rather than waiting for the next backoff tick — this shortens real-world recovery time without needing to poll.

**30-second network partition, step by step**:
1. User is mid-edit on some field; content is already in the Local Recovery Buffer (Ch.6, on every keystroke).
2. Debounce timer fires at ~700ms; the sync request goes out and the network is down — request fails/times out.
3. Field transitions to `failed` (Ch.6/7); buffer is retained unchanged; UI shows a visible "저장 실패 · 재시도 중" indicator (Ch.15), not a silent state.
4. User keeps typing during the outage; each new keystroke keeps updating the Local Recovery Buffer (still working — it's local); the debounce timer keeps resetting per normal behavior, but every sync attempt during the outage fails the same way, backoff scheduling per above.
5. At ~30s the network returns. Either the next scheduled backoff attempt lands, or (faster) the browser's `online` event fires and triggers an immediate retry.
6. The retry sync attempt sends the **latest** buffered content (not each of the intermediate failed attempts individually — there is one current value to send, per Ch.6's collapsing rule), succeeds, and the field transitions `failed → syncing → synced`. A version row is created per Ch.8's dedup rule if the content differs from the last stored version.
7. The user experiences this as: a brief visible "저장 실패" indicator during the outage, then it clears to "저장됨" once reconnected — no content lost at any point, no manual action required, no duplicate/out-of-order writes (only the latest value is ever what gets sent).

---

## 13. Multi-Tab Strategy

**Options considered**: (1) last-write-wins with no coordination (today's implicit behavior), (2) optimistic concurrency + conflict detection (Ch.9's mechanism, surfaced to the user rather than silently resolved), (3) full conflict-resolution UI (side-by-side diff/merge), (4) tab coordination via `BroadcastChannel`/Web Locks so only one tab is "active writer" at a time.

**Recommendation: Option 2 — reuse Chapter 9's version compare-and-swap for detection, surface a lightweight conflict banner, do not attempt automatic merge.** This matches the task brief's "가능하면" (SHOULD, not MUST, Ch.2 req #15) framing: this is a single-user/small-team internal tool (audit §1), and true concurrent-editing UX (live cursors, operational-transform merge, etc.) is disproportionate engineering effort for the realistic occurrence rate here — but *silently* letting one tab's save clobber another's (today's actual behavior for the jsonb fields, Ch.17) is worse than doing nothing, so detection-and-surface is the right middle ground.

**Mechanics**: both tabs share the same version-gated write path from Ch.9. If Tab B's write already advanced `version_no`, Tab A's next write attempt is rejected (0-row compare-and-swap match) and Tab A's field transitions to `conflict` (Ch.6). The conflict UI (Ch.15) shows: "다른 창/기기에서 이 항목이 변경되었습니다" with the current server content and Tab A's own unsent content, and lets the user pick keep-mine (re-attempt with a fresh version number, overwriting) / take-theirs (discard local unsent changes, adopt server content) / view-both (open the History panel to compare, Ch.15). No automatic three-way merge is attempted.

**`BroadcastChannel` vs Web Locks vs `storage` event, compared without implementing any of them**:
- **`BroadcastChannel`**: lets tabs on the same origin actively notify each other ("I just saved field X to version 11") the instant it happens, enabling the conflict banner to appear in Tab A *proactively* rather than only when Tab A itself next tries to save. Pro: fastest, most correct UX. Con: only works same-origin, same-browser — doesn't help the cross-device case (audit's own framing: recovery/conflict across devices matters as much as across tabs), so it can only ever be a UX *enhancement* layered on top of the version-compare mechanism, never a replacement for it.
- **Web Locks API**: could be used to elect a single "active writer" tab so only one tab's debounce timer ever actually fires a write for a given field, sidestepping the conflict case within a browser entirely. Pro: eliminates same-browser multi-tab conflicts by construction. Con: doesn't help cross-device conflicts either (same limitation as BroadcastChannel), adds a coordination mechanism whose failure modes (a lock holder tab crashing without releasing) this team has no prior experience with in this codebase, and browser support/consistency is less universally battle-tested in this app's existing patterns than a plain DB-level version check.
- **`storage` event**: fires when *another tab* writes to localStorage, giving a cheap way to detect "some other tab in this browser just changed the local buffer for a field I have open" — cheaper to reason about than BroadcastChannel/Web Locks since it needs no new API surface, but only fires for localStorage changes (not the actual server-confirmed state), so it can only hint "maybe check for a conflict," not authoritatively detect one.

**Recommendation for v1**: version-compare (Ch.9) is the authoritative mechanism (works same-tab, cross-tab, and cross-device uniformly, since it's a server-side check). `BroadcastChannel` is an **OPTIONAL** same-browser UX enhancement to make the conflict banner appear proactively instead of only on next-save-attempt — worth adding later if real usage shows same-browser multi-tab editing is common enough to be worth the snappier UX, but not required for correctness and not part of this STEP's recommended v1 scope.

---

## 14. 7-Day Retention

**Window definition**: **rolling 7×24 hours from each version's own `created_at`**, not a calendar-day bucket. Reason: a calendar-day definition ("keep everything from today back through 6 days ago") produces an inconsistent effective retention window depending on what time of day a version was created (a version created at 23:59 on day 1 would only get a few minutes of "day 1" credit before day-boundary logic ages it alongside content from 23 hours earlier) — a rolling 7×24h window from each row's own timestamp is simpler to reason about and consistent regardless of time-of-day.

**Mechanism**: `expires_at = created_at + interval '7 days'` computed and stored **at write time** on the `content_versions` row itself (not computed on every read), so that the retention query is always a simple `WHERE expires_at > now()` regardless of how the cleanup job is implemented — this also means the *reading/browsing* path (Ch.15) never needs to know the retention rule at all, only the cleanup job does.

**Cleanup subject**: client-side cleanup (the browser opportunistically deleting old rows while a user happens to have a tab open) is **not** viable as the primary mechanism — it depends entirely on someone having the app open, which an internal tool with sporadic usage cannot guarantee. The realistic options are a Supabase-side scheduled job (e.g., `pg_cron` if enabled on the project, or a Supabase Edge Function on a schedule) or an external scheduled trigger (e.g., a Vercel Cron Job hitting an authenticated API route that runs the delete). **Recommendation: whichever of these the Supabase project already has available should be used — this choice is deferred to STEP 4 as an infrastructure decision** (it depends on the actual Supabase plan/project configuration, which is outside what static code analysis in STEP 1/2 could determine, per audit §13). What's decided *here* is only that cleanup is a **server-side, schedule-driven job**, not a client-triggered one.

**Cleanup failure handling**: if a scheduled cleanup run fails or is skipped, the consequence is **only** a temporary storage-cost overrun (some rows live slightly past 7 days) — never a correctness problem, since every read path filters by `expires_at > now()` anyway (Ch.15's history UI simply won't show expired rows even if they technically still exist in the table for a while). This is why Ch.2 req #19 is marked SHOULD rather than MUST: a late cleanup is a cost/hygiene issue, not a data-safety issue.

**Version-creation frequency and storage cost**: per Chapter 8, a version is only created on a successful sync **and** a content-hash change from the immediately-preceding version — this already substantially throttles the naive "500 keystrokes = 500 versions" scenario the task brief specifically asks about, because at a ~700ms debounce, 500 raw input events collapse to however many distinct ~700ms-apart sync attempts actually occurred (typically far fewer than the keystroke count for continuous typing), and of *those*, only the ones whose content differs from the prior stored version persist a row. For a genuinely long, continuously-edited session (e.g., someone drafting a long note over 20 minutes with pauses), this could still realistically be dozens of version rows per field per day — evaluated below as acceptable at this app's scale, but flagged as the reason **version compaction is worth considering as a later, OPTIONAL enhancement**, not something this design solves now: compaction (e.g., collapsing same-day autosave-only versions down to a small number of representative checkpoints once they're more than, say, 24 hours old, while always preserving `source: 'final'` versions untouched) would reduce storage further without losing the 7-day *coverage* guarantee, but is not required for correctness and is explicitly deferred.

**Storage/performance judgment**: given this is a single-user/small-team tool with 35 editor surfaces and text-sized content (not media/binary), even a generous estimate of a few dozen version rows per actively-edited field per day, times a handful of actively-edited fields per day, times 7 days of retention, is a small enough row count and byte volume that it does not warrant a more complex storage strategy (e.g., diff-based storage instead of full-content snapshots) for v1 — full-content snapshots are simpler to implement, simpler to restore from (Ch.15), and simpler to debug (Ch.4's own scoring), at a storage cost this app's scale can absorb without difficulty.

---

## 15. Recovery UX

**A. Editor-inline indicator**: a small, always-visible status element near each autosave-backed field, cycling through the states from Chapter 6/7 with distinct, honest copy — "자동저장됨" (`synced`), "저장 중…" (`syncing`), "저장 실패 · 재시도 중" (`failed`, with a manual "지금 재시도" affordance), "오프라인 — 재연결 시 자동 저장" (`failed` + detected offline), "복구 가능한 변경사항이 있습니다" (`recovered`, on mount when the buffer is ahead of canonical). This directly replaces the current single ad hoc "저장됐어요" toast that today fires unconditionally regardless of actual success (audit P0-2) with a state-driven, always-accurate indicator (Ch.2 req #20).

**B. Settings-level status panel**: a new section in the existing `/settings` screen (already the natural home for cross-cutting preferences, audit §3 row 27) showing: overall autosave health (any fields currently `failed` across the app), last successful sync time, the 7-day retention policy in plain language, and an entry point into "전체 히스토리 보기" for power-user browsing across entities — not a replacement for the per-document History panel (C), but a global overview.

**C. Per-document History panel**: opened from within each editor screen (a button/icon near the inline indicator from A), showing a chronological list of `content_versions` rows for that entity/field: timestamp, `source` badge (자동/확정 저장, per Ch.8), and a content preview. Selecting an entry shows a read-only preview of that version's content, with a visible "현재 버전과 다름" / "현재 버전과 동일" comparison indicator (a simple diff highlight is a reasonable v1; a full side-by-side diff view is OPTIONAL, not required). This is a genuinely new UI surface — audit §6 confirmed no history-browsing UI exists anywhere today.

**D. Restore flow**: selecting "이 버전으로 복구" on a past version does **not** silently overwrite the canonical record. It: (1) shows an explicit confirmation ("현재 내용을 이 시점의 버전으로 되돌립니다. 계속하시겠습니까?"), (2) on confirm, writes the restored content through the **normal versioned write path** (Ch.9's compare-and-swap against the current version, same as any other save) rather than a special-cased bypass, which means restoring **creates a new version row** (tagged distinctly, e.g. `source: 'restore'` alongside `'auto'`/`'final'` from Ch.8) rather than deleting/rewriting history — so the fact that a restore happened is itself preserved in the history, and the pre-restore content is never lost (it's still the version immediately prior in the list). Restore is never available as a silent one-click action with no confirmation, precisely because the operation is otherwise indistinguishable in UI weight from a routine save, but has much larger blast radius.

**Where this fits jin-dashboard's existing UX**: the closest existing precedent is quick-memo's "최근 저장 기록" panel (audit §5 LEVEL 3 note) — a flat, unlinked save-event log. The History panel (C) generalizes that exact interaction pattern (a list of past saved states, openable from the editor) but ties each entry to a specific entity/field rather than being an app-wide flat log, and adds the restore affordance quick-memo's archive never had (its archive is copy-paste-back only, not a structured restore, per audit §6 req #6). This makes the new UX feel like a natural extension of an already-familiar pattern rather than an unrelated new concept bolted onto the app.

---

## 16. Autosave vs Final Save

**Definitions**: **Autosave** = continuous, low-friction preservation of in-progress content as a safety net (local buffer → server draft → version history), requiring no explicit user action. **Final Save** = an explicit, user-initiated confirmation that the current content is the intended, "done" state of a record — the same meaning it already has today wherever a manual Save button/action exists (quick memo's `handleSave`, meeting's `saveNote` for the new-note composer, the one-on-one template's `persist()`, etc., audit §4/§8).

**Two classes of existing screens, treated differently by design (this is the concrete resolution of Ch.2 req #17, "Autosave/Final Save 구분," for a codebase where roughly half the screens already have a manual save concept and half don't):**

- **Class 1 — screens with an existing manual Final Save action** (quick memo popup, memos-page composer, meeting new-note composer, daily journal widget, one-on-one my-feedback, decisions/persona-log, one-on-one template): **unchanged** in principle — the existing Save button/action remains the only thing that writes to the canonical table for these flows. What's added is that the *in-progress, not-yet-saved* content now also flows through the Autosave Core (local buffer + server draft + version history) while the user is composing, so if the browser closes before Final Save is clicked, the content is recoverable exactly as robustly as quick-memo's existing draft already is (audit §12) — generalizing quick-memo's own pattern to the other Class 1 screens, most of which today have a weaker version of the same idea (audit §4 class B).
- **Class 2 — screens where a debounced autosave *is* the only persistence mechanism today, with no separate manual save concept at all** (task/sub-task/project-item/annual-goal-task notes & descriptions, one-on-one session notes, learning notes, template edits, settings via `useUserSetting`): here, today's debounced write to the canonical table **is** effectively already "the save" — there is no existing Final Save to preserve. This design does **not** invent a mandatory new manual-save step for these screens (that would be a behavior change users didn't ask for and the task brief doesn't request removing today's convenience). Instead: each successful debounced sync continues to write to canonical exactly as today (labeled internally `source: 'auto'` in the version history), **and** an *additional, optional* explicit "지금 저장" / Ctrl+S-style action is introduced that immediately flushes the pending debounce and stamps the resulting version `source: 'final'` — giving power users an explicit "I'm confident this is my final version" checkpoint in the history (Ch.15's badge) without requiring anyone to use it. This satisfies req #17 (the *distinction* now exists and is visible in history) without regressing req #16 (existing implicit "autosave is my save" behavior for these screens keeps working exactly as today).

**Final Save's relationship to Draft and History**: Final Save always flushes any pending debounced write first (reusing the unmount-flush logic from Ch.6), then performs its own canonical write through the same version-gated path as any autosave sync (Ch.9) — there is no separate/bypass write path for Final Save, only a different `source` tag and the guarantee that it always produces a version row regardless of the content-hash dedup rule (Ch.8).

**What happens to the draft after Final Save**: the `autosave_drafts` row for that field is **not deleted immediately on Final Save success** — it is marked `synced` (same as any other successful sync, Ch.6) and a **new autosave session simply continues from that point**: the next keystroke after a Final Save starts buffering again exactly as before, with no special "session boundary" the user needs to think about. The reason the draft row isn't deleted is the same reason drafts are never deleted on *any* success (Ch.7, scenario H) — it exists as the recovery buffer's server mirror, and deleting it the instant of any success (final or autosave) would remove the exact safety net that scenario D/E (refresh, browser close) depends on for the *next* period of editing.

**Why draft deletion must wait for confirmed success, restated for Final Save specifically**: this generalizes the fix for audit P0-1/P0-3-style bugs (draft/input cleared unconditionally, sometimes before success was even confirmed) — Final Save is not exempt from this rule just because it's a more deliberate user action; if the network drops at the exact moment of a Final Save click, the draft must be retained exactly as it would be for a failed autosave sync (Ch.7 scenario B/C), not cleared optimistically because the user clicked a "final" button.

---

## 17. JSONB Concurrency Strategy (TRACK B)

This chapter is explicitly **Track B**, evaluated separately from Track A per this document's introduction — solving Chapters 5–16 does not solve this. The problem, restated precisely from the audit (§8/§9 #5/#17/#18, STEP 2 §8): `meetings.notes`, `one_on_ones.notes`, `learning_resources.notes` are jsonb arrays; every add-a-note operation is "read the whole array into client memory, append/modify locally, write the whole array back," with **no version/timestamp check** at write time — so two clients that both read the array before either one's write lands will silently clobber each other, with the loser's addition vanishing with no error, no conflict signal, and (per `meetings.notes` specifically) 3 independent UI surfaces capable of triggering this (meeting detail page, schedule widget, home brief widget — audit STEP 2 §2/§8).

**Options considered (minimum 3, per the task brief):**

- **Option A — Keep jsonb, add optimistic locking.** Add a `notes_version` (or reuse an `updated_at` compare) column to the parent row (`meetings`, `one_on_ones`, `learning_resources`); every read-modify-write of the `notes` array is gated by a compare-and-swap against that column (the same mechanism as Ch.9, applied here to the canonical write path instead of the draft/version layer). A losing writer gets a conflict signal instead of a silent overwrite.
- **Option B — Normalize into a child table.** Replace the jsonb array with a proper child table (e.g. `meeting_notes(id, meeting_id, content, sort_order, created_at, updated_at, created_by)`), exactly mirroring the pattern this same codebase **already uses successfully** for `annual_goal_task_notes` and `sub_task_notes` (audit §6a — both are normal one-to-many child tables today, not jsonb blobs). Adding a note becomes a single-row `INSERT`; editing an existing note becomes a single-row `UPDATE ... WHERE id = X` — no read-modify-write of a shared column at all, so the entire race class is structurally eliminated, not merely detected.
- **Option C — Note-item-level CRUD.** Functionally very close to Option B (each note becomes independently addressable), but framed as "keep the jsonb column but expose/require item-level operations" via, e.g., Postgres jsonb path-update functions targeting a single array element by an item ID embedded in each note. This avoids introducing a new table but is materially harder to query, harder to index, and still leaves the underlying column vulnerable to whole-array corruption from any code path that doesn't go through the disciplined item-level function — a much easier discipline to violate accidentally than "the column doesn't exist to misuse" in Option B.
- **Option D — Append-only event/version model.** Every note addition/edit becomes an immutable event row (`meeting_note_events(id, meeting_id, event_type, payload, created_at)`); the "current" set of notes for a meeting is derived by folding events. Removes the race entirely (appends never conflict) and gives a full edit history "for free," but requires a replay/materialization step this codebase has no precedent for anywhere (same objection as Option D in Chapter 4), and is a heavier lift than the problem — which is fundamentally "three sibling rows under a meeting," not an audit-log domain — actually requires.

**Comparison:**

| Criterion | A — Optimistic lock on jsonb | B — Normalize to child table (recommended) | C — Item-level jsonb CRUD | D — Event/append-only |
|---|---|---|---|---|
| 데이터무결성 | Good (prevents silent overwrite) but still a single blob any bug can corrupt wholesale | **Best** — normal relational integrity per note row | Good in theory, fragile in practice (easy to bypass the discipline) | Good, but correctness depends on replay logic being right |
| 구현난이도 | Low — smallest code change | Medium — new table + CRUD endpoints per note, but this is a **well-trodden pattern already proven in this exact codebase** (`annual_goal_task_notes`) | Medium-high — jsonb path-update functions are less familiar to this codebase's existing patterns than a plain child table | High — no precedent anywhere in the 41 existing tables |
| migration 난이도 | Low — one new column, no data reshaping | Medium — existing jsonb arrays must be exploded into rows (a one-time data migration script, not run in this STEP) | Medium — similar data reshaping needed as B, for less structural benefit | High — reshaping into events plus building replay logic |
| query 난이도 | Same as today (still reading/writing a whole array) | **Lowest** — plain relational `SELECT`/`INSERT`/`UPDATE`, matching every other note-like table in the app | Higher than B — jsonb path queries are less ergonomic than normal rows | Highest — "current state" requires a fold/replay query or a materialized view |
| autosave와의 궁합 | Workable, but every note-field autosave still has to resend the whole array | **Best** — each note becomes its own `(entity_type='meeting_note', entity_id=<note id>, field_key='content')`, fitting Chapter 5's generic Autosave Core with zero special-casing | Workable but awkward — the Core would need jsonb-path-aware write logic instead of a plain row update | Workable but conceptually redundant with Ch.8's own version-history model — two overlapping versioning systems for the same data |
| multi-user editing | Detects conflict, but still forces one "loser" per whole-array attempt | **Best** — two users adding *different* notes to the same meeting concurrently no longer conflict at all (they're different rows), only genuinely-concurrent edits *to the same note* need the Ch.9-style version check | Same theoretical benefit as B if item-level discipline is perfectly maintained everywhere, in practice weaker | Best in theory (pure appends never conflict), but edits-to-an-existing-note still need conflict handling layered on top |
| 기존기능호환성 | High — no schema/table change, just an added guard column | Medium — every read site (`meeting.notes` used directly as an array in multiple components, audit STEP 2 §8) needs to be updated to read from the new table instead, a real but bounded and precedented refactor | Medium — same read-site changes as B, for a less clean end state | Low — the "notes" concept becomes structurally different from how the rest of the app already models similar things |

**Recommendation: Option B.** It has the strongest data-integrity outcome (structural elimination of the race, not just detection), the best fit with the Track A Autosave Core (each note is just another normal entity the generic hook already knows how to handle), and — most importantly — it is not a novel pattern being introduced into this codebase: it is the **same shape this codebase's own authors already chose** for `annual_goal_task_notes` and `sub_task_notes` (audit §6a), which strongly suggests it was the right call there and is equally right for `meetings.notes`/`one_on_ones.notes`/`learning_resources.notes`. Option A is a reasonable **interim** patch (see Chapter 21 — it can plausibly ship as a P0 safety patch quickly, since it's a small, additive change) but is explicitly **not** the final architecture recommendation, since it leaves the structural fragility of "one blob any code path can corrupt wholesale" in place even after conflicts stop being silent.

**Explicitly not decided here (per the task brief's constraint)**: the actual migration script that explodes existing `meetings.notes`/`one_on_ones.notes`/`learning_resources.notes` jsonb arrays into rows in a new child table is **not written or run in this STEP** — this chapter recommends the target shape, Chapter 20 places it in the phased migration plan, and STEP 4 (after user approval) is where it would actually be executed.

---

## 18. Undocumented Tables Strategy

This chapter presents options only, per the task brief's explicit instruction not to decide here. The 13 tables with no `CREATE TABLE` anywhere in the repo (audit §6b/§7: `agenda_sub_tasks`, `sub_task_notes`, `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs`) have unknown PK/FK/CHECK/RLS/trigger behavior from static analysis alone.

**Options:**
1. **현재 table 유지 (do nothing now)** — lowest immediate risk, but the drift between "what's committed" and "what's live" keeps growing, and any future teammate/AI agent reading the repo continues to get a materially incomplete picture (audit §10 #4).
2. **Migration으로 schema 문서화 (reverse-engineer and commit `CREATE TABLE IF NOT EXISTS`-style migrations that document, without altering, the live schema)** — closes the documentation gap with the least risk of the "do something" options, since a correctly-written reverse-engineered migration that matches the live schema exactly should be a no-op against the actual database; risk is entirely in getting the reverse-engineered DDL *exactly* right (requires Dashboard/`information_schema` access this audit didn't have, per audit §13 #1).
3. **새 canonical table로 migration (redesign/rename/restructure these tables as part of adopting them formally)** — highest risk, couples an unrelated cleanup effort to whatever schema changes these 13 tables might need, and is exactly the kind of scope creep this document's introduction warns against for the autosave work itself.
4. **Adapter layer (introduce a repository/data-access layer in application code that abstracts over these 13 tables' current shape)** — reduces *future* migration risk (call sites depend on the adapter, not the raw table shape) without touching the database at all today; pairs naturally with the Autosave Core's own `(entity_type, entity_id, field_key)` abstraction (Ch.5), since these tables would just become additional `entity_type` values the Core already knows how to address generically.
5. **단계적 migration (do #2 first, decide #3 case-by-case later, informed by real Dashboard access and possibly the objectives product decision in Ch.19)** — sequences the lower-risk documentation step immediately, defers the higher-risk restructuring decision until it can be made with actual DDL/usage-data in hand rather than inferred from application code.

**Is it safe to touch these tables at the same time as building the Autosave Core?** **No, not for schema changes.** Building the generic `autosave_drafts`/`content_versions` tables (Ch.5) does not require altering any of these 13 tables — the Autosave Core only needs an `entity_type`/`entity_id` pair to key against, which these 13 tables already provide via their existing primary keys, whatever those turn out to be. Attempting to simultaneously restructure these 13 tables (option 3) while also rolling out a new cross-cutting autosave system would conflate two independent, both already-nontrivial change efforts, making it much harder to isolate the cause if something breaks during rollout. **Recommendation for sequencing (not a final decision, since this chapter is options-only per instruction): option 2 (reverse-document) can safely proceed in parallel with the Autosave Core build, since it's additive/read-only relative to the live schema; option 3/5's restructuring half should wait until after Track A's core rollout has stabilized**, purely to keep blast radius separable if something needs to be rolled back.

---

## 19. Objectives / Objective-Review Strategy

Per the task brief, this is judged **separately from the autosave project** and is **not** resolved here — it is a product-meaning question (audit §6b #2, §13 #3: are `obj_*` and `objective*_v2` two live, intentionally-separate features, or is one an abandoned migration artifact?), not a technical one this static analysis can answer.

**Options:**
- **A. 기존 유지** — leave both `/objectives` (backed by `obj_groups`/`obj_objectives`/`obj_sub_items`/`obj_sub_entries`) and `/objective-review` (backed by `objective_groups_v2`/`objectives_v2`/`objective_entries_v2`) exactly as they are, treating them as two genuinely distinct features that happen to look structurally similar.
- **B. 기존 통합** — merge the two schemas into one, on the theory that one is a superseded rewrite of the other and users would benefit from a single unified "objectives" concept instead of two parallel screens.
- **C. 새 canonical model** — design a fresh, third data model for "objectives" that both existing screens migrate onto, discarding both legacy schemas once migration is complete.
- **D. Adapter + 단계적 migration** — introduce an abstraction layer over both schemas so application code doesn't need to know which one is authoritative yet, deferring the actual consolidation decision until product intent is confirmed.
- **E. 기타** — e.g., formally rename one as "legacy/archived" without deleting it, if investigation reveals it's genuinely dead but still holds historical data worth keeping queryable.

**Does the Autosave Architecture require deciding this first?** **No.** Because the recommended Track A design (Ch.5, Option C — Hybrid) keys its generic `autosave_drafts`/`content_versions` tables on `(entity_type, entity_id, field_key)` rather than assuming any particular canonical schema, it can support autosave/draft/history for **either or both** of `obj_*` and `objective*_v2` without knowing today which one is the "real" one — each would simply register as its own `entity_type` value(s). This is a direct benefit of Option C's schema-agnostic design (Ch.4's "현재 앱과의 호환성" scoring) — it is compatible with this open product question remaining open for as long as it needs to.

**This document's position**: flagged explicitly as "제품 결정 필요" (product decision required), per the task brief's instruction not to guess. No option above is recommended over another here; whichever is eventually chosen, the Autosave Core built per Chapter 5 does not need to be revisited as a result.

---

## 20. Migration Plan

All phases below describe **future STEP 4 work, contingent on user approval (Ch.24)** — nothing in this chapter is executed as part of producing this document.

**Phase 0 — Safety patches.** Content: the 3 P0 immediate patches from Chapter 21 (tasks/[id] draft-wiped-on-failure; meetings/[id] & MobileMemoSheet failure-shown-as-success; an interim optimistic-lock guard on the 3 jsonb `notes` columns). Verification: manually reproduce each of the audit's documented repro steps (block the network request in devtools, attempt the save, confirm the draft/input is now retained and a failure state is shown) before/after the patch. Rollback: each patch is a small, independent diff (a few lines per file) — revertible individually via normal git revert with no schema/data dependency. Existing-feature preservation: no behavior changes for the success path at all; only the failure path changes (from "silently destructive" to "retained + visible").

**Phase 1 — Build Autosave Core.** Content: create the `autosave_drafts` and `content_versions` tables (Ch.7/8) and the shared `useAutosave()` hook/adapter (Ch.5), with **no existing screen migrated onto it yet**. Verification: unit/integration tests against the hook in isolation (state machine transitions from Ch.6, version compare-and-swap from Ch.9) using a throwaway test entity type, not any of the 35 real screens. Rollback: trivially safe — nothing in the existing app depends on these new tables/hook yet, so rollback is "drop the 2 new tables," zero blast radius on existing functionality. Existing-feature preservation: automatic — nothing existing is touched in this phase.

**Phase 2 — Quick Memo pilot migration.** Content: migrate the quick-memo popup (`memo/quick/page.tsx`) onto the new `useAutosave()` hook, since it already has the most sophisticated existing draft/error-handling logic (audit §12/§4 class A) and serves as the natural reference implementation and validation case for the Core built in Phase 1. Verification: re-run the audit's own quick-memo verification checklist (STEP 2 §3) against the migrated version — orphan-draft recovery, checked-error-with-retained-draft, the 3-day archive behavior — confirming zero regression of an already-good pattern, plus new coverage (7-day version history now available where none existed before). Rollback: quick-memo is a single, self-contained popup window not depended on by other screens' persistence — revertible independently. Existing-feature preservation: this phase is explicitly the proof that the new Core can reproduce quick-memo's existing guarantees before rolling out to riskier screens.

**Phase 3 — Meeting notes (Track A + Track B together).** Content: this is the one phase where Track A and Track B are deliberately **combined**, because Chapter 17 already established that autosave-ing a jsonb blob is architecturally awkward (poor fit in the "autosave와의 궁합" row of Ch.17's comparison table) — normalizing `meetings.notes` into a child table (Ch.17 Option B) is done *as part of* bringing meeting notes onto the new Autosave Core, rather than autosaving the old jsonb shape first and normalizing later. Verification: data-migration script correctness checked against a full export/row-count comparison before/after exploding the jsonb array into rows (not executed in this STEP); functional verification that all 3 existing write surfaces (meeting detail page, schedule widget, home brief widget — audit STEP 2 §2) correctly read/write the new child table with no regression in what a user sees. Rollback: keep the old `notes` jsonb column in place, unused-but-present, for at least one full release cycle as a rollback fallback before ever dropping it. Existing-feature preservation: users continue to see meeting notes exactly as before; only the storage shape and concurrency safety change underneath.

**Phase 4 — Task/Project detail-editor screens.** Content: the largest single bucket (audit §5 LEVEL 2) — `tasks/[id]`, `subtasks/[id]`, `project/items/[id]`, `annual-goals/tasks/[id]` notes/descriptions, `one-on-one/[memberId]/[sessionId]` session notes, `learning/[id]` notes, `one-on-one/template`, and `useUserSetting`-backed settings — migrated onto the Core one file at a time, in the order of P0/P1 severity from the audit (tasks/[id] first, since it's the confirmed concrete P0 bug site). Verification: per-file, confirm the specific audit-documented repro (e.g. tasks/[id]'s block-network-then-save-a-note scenario) now shows retained draft + visible failure instead of silent data loss. Rollback: per-file, since each screen's migration is an independent diff against its own debounce call site. Existing-feature preservation: the manual/no-manual-save distinction from Chapter 16 is applied per screen; no screen gains a *mandatory* new step, only an optional one.

**Phase 5 — Remaining editors.** Content: the rest of the 35 surfaces not yet covered — sketch canvas (already Class A/optimistic-rollback, audit §4; migration here is mostly about gaining version history and a consistent status indicator, not fixing an existing bug), home-dashboard widgets, settings page, decisions/persona-log, perf-review (generalizing its existing period-switch flush, audit §12, into the universal unmount-flush from Ch.6 rather than replacing it), objectives/objective-review screens (only if Ch.19's product decision has been made by this point — otherwise deferred, since Ch.19 explicitly doesn't block Track A). Verification: same per-screen pattern as Phase 4. Rollback: same per-file independence. Existing-feature preservation: SketchCanvas's optimistic-rollback and drag-stop-only timing (audit §12) are explicitly preserved, not replaced, by this migration — the Core wraps around them rather than overriding their already-correct behavior.

**Phase 6 — Legacy localStorage cleanup.** Content: after the compatibility-read window from Chapter 10 has elapsed (at least one full release cycle post-migration for each screen), remove the old, now-unused localStorage keys (`quick_memo_drafts`, `meeting_draft_${id}`, `JOURNAL_DRAFT_KEY`, `feedbackDraftKey(month)`, etc. — audit §5's full list). Verification: confirm via code search that no remaining read/write call sites reference the old keys before removing the constants/logic that wrote them. Rollback: since this phase only *removes* dead code paths (the new buffer has been the active path since each screen's respective Phase 2-5 migration), rollback is simply not deleting yet if any doubt remains — this phase is the lowest-urgency, most easily deferred of all six.

---

## 21. Immediate Safety Patches

These are evaluated per the task brief's explicit instruction: for each P0, is an immediate patch needed regardless of the larger architecture timeline, can it happen concurrently with Architecture work, and if so what's the minimal patch — **no patch is actually applied in this STEP.**

**P0-1 — `tasks/[id]/page.tsx` draft/input wiped after a failed `notes`/`task_todos` insert (audit §9 #3, STEP 2 §2 #3, lines ~454-493 and ~346-353).**
- Immediate patch needed? **Yes.** This is the audit's single most concrete, reproducible data-loss bug, reachable through ordinary use with no special conditions.
- Solvable by Architecture migration alone? Yes, eventually (Phase 4, Ch.20) — but that's phased in behind Phases 0-3, and this bug is severe enough not to wait.
- Minimal patch (conceptually, not applied here): destructure `{ error }` from the existing `insert(...).select().single()` calls in `saveNote()` and `addTodo()`; only clear the draft/input when `error` is null. This is a ~2-4 line change per call site with no schema dependency.
- Can this run concurrently with the larger Architecture build? **Yes, no conflict** — it's a pure error-check addition to existing code, doesn't touch the new `autosave_drafts`/`content_versions` tables at all, and is exactly the kind of independent, low-risk fix Phase 0 (Ch.20) is for.

**P0-2 — `meetings/[id]/page.tsx` `updateMeeting()` treats failure as success (audit §9 #1, STEP 2 §2 #1).**
- Immediate patch needed? **Yes** — same "failure indistinguishable from success" severity class as P0-1.
- Solvable by Architecture migration alone? Yes eventually (Phases 3/5), but same urgency argument as P0-1 applies.
- Minimal patch (conceptually): destructure `{ error }` from the existing `.update()` call; only run the "optimistic success" UI state update (`setMeeting`) inside the success branch, and show a distinct failure state otherwise. No schema change required.
- Can this run concurrently with Architecture work? **Yes** — same reasoning as P0-1, pure error-check addition.

**P0-3 — `MobileMemoSheet.tsx` `handleSave()` treats failure as success (audit §9 #2, STEP 2 §2 #2).**
- Immediate patch needed? **Yes** — same severity class as P0-1/P0-2, on the mobile quick-memo sheet's own independent save path.
- Solvable by Architecture migration alone? Yes eventually (Phase 2/5), but same urgency argument as P0-1/P0-2 applies.
- Minimal patch (conceptually): destructure `{ error }` from the existing `.insert()` call; only run `setSaved(true)` inside the success branch, and show a distinct failure state (sheet stays open, content preserved) otherwise. No schema change required.
- Can this run concurrently with Architecture work? **Yes** — same reasoning as P0-1/P0-2, pure error-check addition.

**JSONB interim lock (미착수, Track B 관련 후속 과제) — `meetings.notes`/`one_on_ones.notes`/`learning_resources.notes` stale-overwrite on concurrent edit (audit §9 #5/#17/#18, STEP 2 §8) — Track B. Not a STEP 3.5 patch, not numbered P0-anything (renamed in STEP 6.6 to stop colliding with the real P0-1/P0-2/P0-3 above).**
- Immediate patch needed? A **minimal interim mitigation** is worth doing immediately (reduce the window of silent loss), but the **full fix is not a "patch," it's the Chapter 17 normalization** — these are different scales of work and should not be conflated.
- Solvable by a small patch alone? **Only partially.** The minimal interim version is Chapter 17's Option A (add an optimistic-lock compare on the parent row before the read-modify-write of the jsonb array) — this converts "silent data loss" into "visible conflict, please retry," which is a real improvement, but does **not** achieve the structural fix (Option B, normalization) that removes the race entirely.
- Do the immediate patch and the full Architecture migration conflict, or can both proceed? They **can** both proceed, but should be sequenced deliberately: the interim optimistic-lock guard (small, low-risk, addable immediately) buys safety while Phase 3's normalization (Ch.20 — larger, requires a real data migration) is planned and executed. They are not mutually exclusive, but the interim patch must not be mistaken for "done" — Chapter 17 already flags Option A as explicitly not the final recommendation.
- Minimal interim patch (conceptually, not applied here): add an `updated_at`-or-version compare condition to each of the 3 tables' existing `.update({notes: ...})` call sites (meeting detail page, schedule widget, home brief widget for `meetings`; the one write surface each for `one_on_ones`/`learning_resources`) so a write only succeeds if the row hasn't changed since it was read; on a failed compare, surface a "다른 곳에서 방금 수정되었습니다 — 새로고침 후 다시 시도하세요" message instead of silently overwriting.

**Summary judgment**: P0-1, P0-2, and P0-3 are cheap, independent, immediately-actionable patches with zero schema dependency and zero conflict with the larger Architecture timeline — there is no good reason to wait on them. The JSONB interim lock's full fix is coupled to Chapter 17/20's larger normalization work, but an interim, much smaller mitigation is available now and should not wait either — the two JSONB-interim-lock efforts (interim patch now, full normalization in Phase 3) are complementary, not redundant.

---

## 22. Risks & Trade-offs

**Risk: the generic `(entity_type, entity_id, field_key)` model could become a dumping ground if not disciplined.** Because Option C (Ch.5) makes adding a new autosave-backed field trivial (Ch.4's own "신규 editor 추가난이도" scoring), there's a risk of it being used for things that don't actually need 7-day history/recovery (e.g., a UI preference toggle) simply because it's the path of least resistance. Mitigation: field_key registration (Ch.11) should be an explicit, reviewed list, not an ad hoc string sprinkled at call sites — a lightweight governance point, not a technical one.

**Risk: version-row volume growth is not fully bounded without compaction (Ch.14).** Explicitly accepted for v1 given this app's realistic scale (single-user/small team, text-sized content) — flagged as a revisit-later item, not a blocking concern, but a genuine trade-off of choosing full-snapshot storage (simple, debuggable) over diff-based storage (more storage-efficient, harder to build/debug, no precedent in this codebase).

**Risk: Phase 3 (meeting notes) is the highest-complexity single migration phase**, since it's the one place Track A and Track B are deliberately combined (Ch.20) — this concentrates risk into one phase rather than spreading it thin, which is a deliberate trade-off (better to combine them once, carefully, than autosave a jsonb blob first and normalize it later, which Ch.17 already judged to be a poor fit) but means Phase 3 needs the most scrutiny/testing of the whole plan.

**Risk: cross-device/cross-browser recovery (server draft table) is new attack surface for "which draft is right" confusion**, e.g., a user with the same account open on a phone and a laptop, editing the same field on both, could see two different `recovered` banners depending on which device's buffer is newer — this is a real UX edge case not fully designed here (it's subsumed into Chapter 13's conflict-surfacing mechanism, but the specific cross-device recovery-banner-vs-conflict-banner distinction deserves explicit UX design attention in STEP 4, not assumed away).

**Risk: the 13 undocumented tables (Ch.18) and the objectives duplication (Ch.19) remain unresolved by this document, by design** — this is the correct call per the task brief's explicit instruction not to guess at product decisions, but it does mean STEP 4 cannot achieve 100% coverage of "모든 편집화면 적용" (Ch.2 req #1) for the objectives screens until Ch.19 is resolved, and any autosave rollout touching the 13 undocumented tables inherits whatever unknown constraints those tables have (Ch.3) until Ch.18's reverse-documentation step happens.

**Trade-off: Option C's biggest strength (canonical tables untouched) is also its biggest limitation for Track B.** Because Option C is deliberately scoped to *not* restructure canonical tables, it cannot, by itself, fix the jsonb stale-overwrite problem — that strength (safety, low blast radius) and that limitation (doesn't solve Track B) are two sides of the same design choice, which is exactly why this document keeps the two tracks explicitly separate rather than presenting Option C as a total solution.

**Trade-off: detection-over-merge for multi-tab (Ch.13) trades UX polish for implementation simplicity.** A more sophisticated conflict-resolution UI (live merge, side-by-side diff-and-combine) would be objectively nicer for the rare case it's needed, but the task brief's own "가능하면" framing and this app's realistic usage pattern (small team, not simultaneous heavy co-editing) make that investment premature — explicitly revisitable later if real usage proves otherwise.

**Trade-off: no `sendBeacon`/no IndexedDB (Ch.6/12) simplifies the implementation at the cost of not having the theoretically most robust possible unload/offline handling.** Justified by this app's actual scale and the fact that the Local Recovery Buffer already provides the real safety guarantee in both cases — but explicitly flagged as revisitable if usage data later shows otherwise (both chapters mark this as OPTIONAL-to-revisit, not permanently closed).

---

## 23. Final Architecture Decision

1. **Architecture 선택**: Track A — Option C, Hybrid (generic `autosave_drafts` + `content_versions` tables, canonical tables and existing manual-save flows unchanged). Track B — Option B, normalize jsonb `notes` arrays into child tables, following the `annual_goal_task_notes`/`sub_task_notes` precedent already in this codebase.
2. **선택 이유**: Chapter 5's top-5 (zero risk to 41 existing tables/~15 existing save flows; one shared primitive genuinely replaces ~15 duplicated implementations; uniform 7-day-history/recovery-UI implementation instead of 15-20+ near-duplicates; doesn't paper over Track B; lowest added RLS/schema-governance surface given 13 tables are already undocumented drift).
3. **핵심 구성요소**: Autosave Adapter/Hook (`useAutosave()`, design-only), Local Recovery Buffer (localStorage, versioned-schema JSON), `autosave_drafts` table (server-side draft mirror), `content_versions` table (7-day version history), version compare-and-swap primitive (Ch.9, reused by Track B), History/Recovery UI (Ch.15).
4. **Data flow**: Editor → Adapter/Hook → [Local Buffer write (sync) ∥ debounced server sync (draft upsert + canonical write, version-gated)] → on success, dedup-checked version row → 7-Day History → Recovery/History UI reads either the buffer (on mount, for `recovered` detection) or `content_versions` (for browsing/restore).
5. **State model**: `local-only → syncing → synced`, with `failed` (retry loop, Ch.12), `conflict` (version-compare rejection, Ch.9/13), and `recovered` (buffer ahead of canonical on mount, Ch.6/7) as branches off that spine.
6. **Draft model**: separate from History (Ch.5/7) — mutable, upserted continuously, one row per `(entity_type, entity_id, field_key, client_scope)`, never deleted on success (only marked `synced`), retained unconditionally on any failure (direct fix for audit P0-1/P0-3-style bugs).
7. **History model**: immutable, append-only `content_versions`, one row per meaningful (hash-changed) successful sync or Final Save, tagged `source: 'auto' | 'final' | 'restore'`, `expires_at = created_at + 7d` computed at write time.
8. **Versioning**: monotonic integer `version_no` per `(entity_type, entity_id, field_key)`, used both for version-history ordering and as the optimistic-concurrency compare-and-swap token; content hash used separately, only for version-history dedup.
9. **Conflict handling**: version-compare rejection surfaces a `conflict` state and a conflict banner (Ch.13/15) with keep-mine/take-theirs/view-history choices — no automatic merge in v1.
10. **Retry/offline**: exponential backoff (2s→4s→8s→15s, capped) against the existing Local Recovery Buffer, no IndexedDB, `online`-event-triggered immediate retry, no dedicated offline queue data structure (only "latest value" ever needs sending, per Ch.6's in-flight collapsing rule).
11. **7-day retention**: rolling 7×24h from each version's own `created_at`, `expires_at` stored at write time, server-side scheduled cleanup job (exact mechanism — `pg_cron`/Edge Function/external cron — deferred to STEP 4 as an infra decision), late cleanup is a cost issue not a correctness issue since all reads filter by `expires_at`.
12. **Recovery**: on mount, compare buffer vs. canonical; if buffer newer/different, `recovered` state + banner (Ch.6/7/15), user confirms or discards, never silently auto-applied.
13. **History UI**: inline per-field status (A), settings-level global panel (B), per-document History panel with preview + diff-indicator (C), confirm-then-versioned-restore flow that itself creates a new version rather than silently overwriting (D) — Chapter 15.
14. **Final Save 관계**: separate lifecycle (Ch.16) — Class 1 screens (existing manual save) unchanged, gain a stronger draft safety net underneath; Class 2 screens (autosave-only today) keep working exactly as today, gain an *optional* explicit "지금 저장" action tagged `source: 'final'` in history, with no new mandatory step for anyone.
15. **JSONB concurrency 전략 (Track B)**: normalize to child tables (Ch.17, Option B), executed together with each affected screen's Track A migration (Ch.20 Phase 3 for meetings; equivalent treatment for `one_on_ones`/`learning_resources` in Phase 4/5) rather than as a separate, disconnected effort.
16. **Migration 전략**: 6 phases (Ch.20) — Phase 0 safety patches, Phase 1 Core build (no consumers yet), Phase 2 quick-memo pilot, Phase 3 meeting notes (Track A+B combined), Phase 4 task/project detail editors (largest bucket, P0/P1-ordered), Phase 5 remaining editors, Phase 6 legacy-localStorage cleanup.
17. **예상 위험**: generic-model dumping-ground risk without field_key governance; unbounded version-row growth without future compaction; Phase 3's concentrated Track A+B complexity; cross-device recovery-vs-conflict UX ambiguity; 13 undocumented tables and the objectives duplication remaining unresolved dependencies (Ch.22).
18. **예상 trade-off**: canonical-tables-untouched safety vs. not solving Track B by itself; detection-over-merge simplicity vs. multi-tab UX polish; no-IndexedDB/no-sendBeacon simplicity vs. theoretical max robustness (Ch.22) — all explicitly revisitable later, none permanently closed.
19. **구현 순서**: exactly the 6-phase order in Ch.20, with Phase 0's 3 cheap patches (P0-1, P0-2, P0-3) recommended to start immediately regardless of when the rest of the phased rollout begins (Ch.21), since they carry zero schema dependency and zero conflict with the larger timeline.
20. **구현 전 반드시 결정/승인 받아야 할 사항**: see Chapter 24 in full — nothing in this chapter is authorization to start STEP 4.

---

## 24. Approval Checklist

**Nothing below is decided or confirmed by this document — this chapter only enumerates what needs an explicit user decision/approval before STEP 4 (implementation) begins.**

- [ ] **Draft table 구조** — confirm the conceptual `autosave_drafts` shape (Ch.7) and its exact columns/types before any migration is written.
- [ ] **History table 구조** — confirm the conceptual `content_versions` shape (Ch.8) including the `source` enum values (`auto`/`final`/`restore`) before any migration is written.
- [ ] **Versioning 전략** — confirm integer `version_no` + compare-and-swap (Ch.9) as the concurrency mechanism, and content-hash-based dedup (Ch.8) as the version-creation rule.
- [ ] **Local storage 전략** — confirm the Local Recovery Buffer's schema-versioned JSON format (Ch.10) and the compatibility-read approach for the ~19 existing localStorage keys.
- [ ] **Server persistence 전략** — confirm the ~700ms standardized debounce for text fields (Ch.6/11) and that discrete-value fields stay immediate/undebounced.
- [ ] **Retry 정책** — confirm the exponential-backoff shape and thresholds (Ch.12) and the explicit decision *not* to build an IndexedDB-backed queue for v1.
- [ ] **Multi-tab 정책** — confirm detection-and-surface (not automatic merge) is the right v1 scope (Ch.13), and whether `BroadcastChannel` proactive notification is in-scope for v1 or deferred.
- [ ] **7-day retention 정책** — confirm rolling-7×24h-from-created_at (not calendar day) and decide the actual cleanup-job mechanism (`pg_cron` vs. Edge Function vs. external cron — Ch.14, an infra decision this audit couldn't determine).
- [ ] **History UI 위치** — confirm the 3-surface UX (inline indicator / settings panel / per-document history panel — Ch.15) matches user expectations before building it.
- [ ] **Restore 정책** — confirm restore-creates-a-new-version (never silently overwrites, Ch.15/16) is the intended behavior.
- [ ] **JSONB notes 해결 방향 (Track B)** — confirm normalization to child tables (Ch.17, Option B) over the interim optimistic-lock-only patch (Option A) as the *target* architecture, even though Option A may ship first as an interim safety patch (Ch.21).
- [ ] **Undocumented table migration 전략** — confirm sequencing (Ch.18): reverse-document first (safe, can start now), defer any restructuring decision until Dashboard/DDL access is available.
- [ ] **Objectives 중복 구조 처리 방향** — confirm this remains an open, separately-tracked product decision (Ch.19) and is not being silently forced by the autosave rollout.
- [ ] **단계적 migration 순서** — confirm the 6-phase order (Ch.20), and specifically confirm Phase 0's three P0 patches (Ch.21) may start immediately, independent of approval timing for the rest of the phases.
- [ ] **Final Save 개념 도입 범위** — confirm the Class 1/Class 2 treatment (Ch.16) — in particular, confirm it's acceptable that Class 2 screens (task notes, etc.) gain only an *optional* new "지금 저장" action, not a mandatory new step.
- [ ] **범위 확정** — confirm all 35 editor surfaces (audit §3) are in scope for eventual migration, or flag any that should be explicitly excluded (e.g., if the objectives screens end up out of scope pending Ch.19).

---

## 25. Open Questions

Carried forward from the audit (§13, unresolved by static analysis) plus new questions this design raises:

1. **Actual DDL for the 13 undocumented tables** (audit §13 #1) — still unknown; needed before Ch.18's reverse-documentation step can actually be executed accurately.
2. **`project_meetings`: view over `meetings`, or a genuine separate table?** (audit §13 #2) — matters for whether it needs its own `entity_type` in the Autosave Core or should be treated as an alias of `meetings`.
3. **`obj_*` vs. `objective*_v2`: which is live?** (audit §13 #3, Ch.19) — explicitly deferred as a product decision, not blocking Track A's rollout.
4. **Supabase Auth session TTL/refresh behavior** (audit §13 #4) — needed to tune how aggressively the `auth_expired` failure sub-state (Ch.7 scenario G) should trigger a forced re-login prompt vs. a passive retry.
5. **Storage bucket (`attachments`) policies** (audit §13 #5) — out of scope for this document (attachments aren't a text-autosave concern), noted only for completeness since it's an existing unknown.
6. **Is the Supabase project shared with the separated HRM/team-log repo?** (audit §13 #6) — relevant only if any new RLS policy work for `autosave_drafts`/`content_versions` needs to consider cross-project effects; unlikely but unconfirmed.
7. **Real production write-frequency per table** (audit §13 #7) — would sharpen Chapter 14's version-volume estimate and Chapter 20's phase-ordering (which screens actually see the most concurrent/rapid edits in practice, vs. this document's structural-risk-based ordering).
8. **Which scheduled-job mechanism does the actual Supabase project support** (`pg_cron` availability, Edge Functions, or reliance on an external cron) — needed to finalize Chapter 14's cleanup mechanism; this is an infrastructure/plan-tier fact, not something derivable from the repo.
9. **Cross-device recovered-vs-conflict UX** (Ch.22) — flagged as needing explicit UX design attention in STEP 4, not fully resolved by this document's conflict-surfacing mechanism alone.
10. **Field_key governance process** (Ch.22) — who reviews/approves new `entity_type`/`field_key` registrations as more screens are migrated, so the generic model doesn't become an ungoverned dumping ground over time.
11. **Version compaction threshold, if ever needed** (Ch.14) — explicitly deferred/OPTIONAL; only worth revisiting if real usage shows the uncompacted 7-day volume is a genuine storage or query-performance problem, which this document cannot predict from static analysis alone.

