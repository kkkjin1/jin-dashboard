# Autosave Rollout Plan (STEP 6)

**Status: PLANNING ONLY.** No source file was modified while producing this document. No DB schema was changed, no migration was executed, no Supabase SQL was run, no RLS was changed, no production or dev Supabase project was written to. The only file this STEP creates is this one. Nothing in this document authorizes starting the next implementation phase — see §16/§17 for the explicit approval gate.

**Inputs (read in full, treated as read-only ground truth, never re-derived by guessing):**
- `docs/autosave-audit.md` — STEP 1 (35-surface inventory) + STEP 2 (line-level verification of the 6 CRITICAL clusters, quick-memo independent re-check, A/B/C/D classification, LEVEL 0-3 measurement, JSONB race analysis, P0-P3 priority list).
- `docs/autosave-architecture.md` — STEP 3 (Track A = Option C Hybrid; Track B = jsonb→child-table normalization; 6-phase migration plan Ch.20; Immediate Safety Patches Ch.21).
- `docs/autosave-db-design.md` — STEP 4/5 (physical schema for `autosave_drafts`/`content_versions`; CAS mechanism; 28 grounded `entity_type` values §19; RLS design + **real dev-project execution log** §20a, 12/11 tests all VERIFIED PASS; Canonical Tables RLS Security Audit registered as an independent follow-up task §21 with priorities carried verbatim; dev-project schema-cache gap §24).
- `docs/autosave-implementation.md` — STEP 5 Phase 2 (Quick Memo dev-pilot: real `useAutosave()` API §3, TEST A-L all PASS against the real dev Supabase project, the `createBrowserClient()` module-singleton bug and its `{isSingleton:false}` fix, the dev-project canonical-table schema-cache gap that forced TEST I's canonical insert to be mocked).

**What this STEP re-verified directly against the current source tree (not re-derived from the prior docs by assumption):**
- `Glob src/app/**/page.tsx` → **33 files** (matches audit §2's count). `route.ts` → **7 files** (matches). `layout.tsx` → **2 files** (matches). `loading.tsx`/`error.tsx`/`not-found.tsx` → **0 anywhere** (re-confirmed by both `Grep` and `Glob`, matches audit).
- `Grep "\.from\('[a-z0-9_]+'\)"` across `src/` → **44 files** contain at least one Supabase table reference (a larger number than the 35 "editor surfaces" because (a) several files are read-only — `src/hooks/useOrgData.ts` (`user_preferences`, `select` only), `src/lib/tasks.ts` (`tasks`/`members`, `select` only), `src/components/layout/Sidebar.tsx` (no insert/update/upsert/delete found on direct re-grep) — and (b) several editor screens are backed by more than one component file (e.g. meetings = page + `MeetingNotesNew.tsx` + `MeetingSection.tsx` + `SearchToolbar.tsx`). Re-confirms audit §3's 35-surface count is not an undercount or overcount from a different file-counting method.
- `git status`/`git diff --stat` baseline (recorded before any work in this STEP, re-confirmed unchanged after): 7 files show pre-existing uncommitted diffs — `src/app/(app)/meetings/[id]/page.tsx`, `src/app/(app)/tasks/[id]/page.tsx`, `src/app/memo/quick/page.tsx`, `src/components/meetings/MeetingNotesNew.tsx`, `src/components/meetings/MeetingSection.tsx`, `src/components/meetings/SearchToolbar.tsx`, `src/components/memo/MobileMemoSheet.tsx` — all of these are the **already-completed** Phase-0 P0 safety patches + the Quick Memo dev-pilot wiring documented in `docs/autosave-implementation.md`, not something this STEP touched. Confirmed via `git diff --stat` line counts matching the file list in `docs/autosave-implementation.md` §1/§7. This STEP added no new lines to any of them (verified again in §18 below).
- `Grep "createBrowserClient|createClient\("` across `src/` → **every** call site (33 files/call sites) calls the same `createClient()` from `src/lib/supabase/client.ts`, which always passes the **same** `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` pair (confirmed by reading `client.ts` directly — 8 lines, no branching). The `@supabase/ssr` module-level-singleton behavior that caused the Phase-2 production-request bug (`docs/autosave-implementation.md` §2) is therefore **harmless everywhere in the app's own 33 call sites**, because they never ask for a different URL/key — the bug only manifests when a *second, differently-configured* client is requested from the same module cache, which today happens in exactly one place: `src/lib/supabase/devPilotClient.ts` (already fixed with `{ isSingleton: false }`, re-read in full during this STEP and confirmed the fix is in place, lines 47-57). **No second occurrence of the singleton risk pattern was found anywhere else in the codebase** — this is the one Production Safety Checklist item from Phase 2 and it has exactly one call site to watch going forward (§14).
- `Grep "^\s*id\s+(uuid|bigint|integer|serial|bigserial)"` across `supabase/*.sql` → every documented table's primary key is `uuid DEFAULT gen_random_uuid()` (confirmed for all 28 documented tables' `CREATE TABLE` statements). This matters for §7 (Server Draft Identity / PK type risk): `autosave_drafts.entity_id`/`content_versions.entity_id` being generically typed `text` (db-design §2) is safe to hold a stringified uuid for all 28 documented tables; the 13 undocumented tables' PK type remains genuinely unverified (unchanged from db-design §15 #2 — not re-resolved here, since that requires Dashboard access this STEP does not have either).

**Reference implementation contract, taken as-built, not as-ideal** (`docs/autosave-implementation.md` §3 — real, dev-DB-verified API of `useAutosave()`): `status` is `'idle'|'local-saving'|'pending-sync'|'syncing'|'saved'|'retrying'|'error'|'conflict'` — this is **not identical** to architecture Ch.6's originally-designed state machine (`local-only|syncing|synced|failed|conflict|recovered`); the built version merges "recovered" into the `onRecoveredAvailable`/`recovered` return field instead of a distinct status enum value, splits "local-only" into `local-saving`/`pending-sync`, and renames `failed`→`error`/`retrying`. This is flagged here as an **Open Issue** (§17), not silently reconciled: the built contract is what actually exists and was verified against the real dev DB (TEST A-L, all PASS), so it — not architecture Ch.6's original prose — is the contract every subsequent phase in this plan rolls out against. Also carried forward as-built: one combined `value` per `(entityType, entityId, fieldKey)` (Quick Memo passes `{title, content, tag}` as a single JSON value under `fieldKey: 'draft'`, **not** three separate `field_key` registrations) — this is a real design choice made during Phase 2, not decided in architecture Ch.5/db-design §19, and is carried forward as precedent in §6/§8 below.

---

## 1. 전체 Edit Surface 재인벤토리 (35개, audit §3 numbering 유지)

**Two distinct counting units used throughout this document, kept explicit per instruction 17:**
- **35 "edit surfaces"** = screen/component level (audit §3's own count, re-verified above — unchanged). This is the unit §2/§3/§4/§12/§16 categorize and phase against, because instruction 3 requires "각 화면을 정확히 하나의 카테고리에만 배정."
- **28 "entity_type" values** = canonical-table level (db-design §19's own count, re-verified below — unchanged). One screen can map to 1-3 entity_types (e.g. task detail = `task`+`task_note`+`task_todo`); one entity_type can be written from >1 screen (e.g. `meeting_note`/`meetings.notes` from 3 surfaces). Both counts are correct simultaneously; they answer different questions (§17 verifies both independently).

**No new entity_type, table, or route was invented in this document.** Every row below is either a direct carry-forward of an audit/db-design citation (cited inline) or a re-grep performed in this STEP (marked "verified now").

### 1a. Identity — route/component, entity, canonical table, PK

| # | Screen / surface | Route/File(s) | Entity(ies) edited | `entity_type` (db-design §19) | Canonical table(s) | PK type |
|---|---|---|---|---|---|---|
| 1 | Home dashboard widgets | `src/app/(app)/page.tsx` + `src/components/home/*.tsx` | tasks, agenda items, sub-tasks, quick memos, daily journal, meeting notes | `task`, `agenda_sub_task`, `quick_memo`, `daily_journal`, `meeting_note` (multi, home widgets touch several) | `tasks`, `agenda_sub_tasks`, `quick_memos`, `daily_journals`, `meetings.notes` | uuid (tasks/quick_memos/meetings documented); `agenda_sub_tasks`/`daily_journals` undocumented, PK type unverified |
| 2 | Quick-memo popup | `src/app/memo/quick/page.tsx` | quick memo | `quick_memo` | `quick_memos` (+ `project_meetings`, `agenda_sub_tasks` branches) | uuid (`quick_memos` documented); `project_meetings`/`agenda_sub_tasks` unverified |
| 3 | Quick-memo floating button | `src/components/memo/QuickMemoPanel.tsx` | none (opens #2; own button-position localStorage only) | n/a — not a content editor | — | — |
| 4 | Quick-memo mobile bottom sheet | `src/components/memo/MobileMemoSheet.tsx` | quick memo | `quick_memo` | `quick_memos` | uuid |
| 5 | Memos list | `src/app/(app)/memos/page.tsx` | quick memo | `quick_memo` | `quick_memos` | uuid |
| 6 | Meetings list (create) | `src/components/meetings/MeetingNotesNew.tsx` | meeting | `meeting` | `meetings` | uuid |
| 7 | Meeting detail | `src/app/(app)/meetings/[id]/page.tsx` | meeting fields + notes array | `meeting`, `meeting_note` | `meetings`, `meetings.notes` (jsonb) | uuid |
| 8 | Project matrix | `src/components/meetings/AgendaMatrix.tsx` (route `/project`) | groups, items, sub-tasks | `agenda_group`, `project_item`, `agenda_sub_task` | `agenda_groups`, `agenda_items`, `agenda_sub_tasks` | uuid (`agenda_groups`/`agenda_items` documented); `agenda_sub_tasks` undocumented |
| 9 | Project item detail | `src/app/(app)/project/items/[id]/page.tsx` | item fields, sub-tasks, sub-task notes | `project_item`, `agenda_sub_task`, `sub_task_note` | `agenda_items`, `agenda_sub_tasks`, `sub_task_notes` | uuid / unverified / unverified |
| 10 | Sub-task detail | `src/app/(app)/subtasks/[id]/page.tsx` | sub-task fields + notes | `agenda_sub_task`, `sub_task_note` | `agenda_sub_tasks`, `sub_task_notes` | unverified / unverified |
| 11 | Tasks list | `src/app/(app)/tasks/page.tsx` | task fields | `task` | `tasks` | uuid |
| 12 | Task detail | `src/app/(app)/tasks/[id]/page.tsx` | task fields, notes, todos | `task`, `task_note`, `task_todo` | `tasks`, `notes`, `task_todos` | uuid |
| 13 | Annual-goals roadmap | `src/components/annual-goals/AnnualRoadmap.tsx` (route `/annual-goals`) | item fields | `annual_goal_item` | `annual_goal_items` | uuid |
| 14 | Annual-goals category rename | `src/app/(app)/annual-goals/page.tsx` | category label | `annual_goal_category_label` | `annual_goal_category_labels` | uuid |
| 15 | Annual-goal task detail | `src/app/(app)/annual-goals/tasks/[id]/page.tsx` | task fields + notes | `annual_goal_task`, `annual_goal_task_note` | `annual_goal_tasks`, `annual_goal_task_notes` | uuid |
| 16 | Objectives (quarterly) | `src/app/(app)/objectives/page.tsx` | groups/objectives/items/entries | `objective` | `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries` | unverified (all 4 undocumented) |
| 17 | Objective review | `src/app/(app)/objective-review/page.tsx` | groups/objectives/entries | `objective_review` | `objective_groups_v2`, `objectives_v2`, `objective_entries_v2` | unverified (all 3 undocumented) |
| 18 | One-on-one list + my-feedback | `src/app/(app)/one-on-one/page.tsx` | session list, feedback log | `one_on_one`, `one_on_one_feedback` | `one_on_ones`, `my_feedback` | uuid |
| 19 | One-on-one member page | `src/app/(app)/one-on-one/[memberId]/page.tsx` | none (read + delete only) | `one_on_one` (delete only, no field-edit) | `one_on_ones` | uuid |
| 20 | One-on-one session note editor | `src/app/(app)/one-on-one/[memberId]/[sessionId]/page.tsx` | session notes array | `one_on_one` | `one_on_ones.notes` (jsonb) | uuid |
| 21 | One-on-one template | `src/app/(app)/one-on-one/template/page.tsx` | singleton template content | `one_on_one_template` | `one_on_one_template` | uuid |
| 22 | Perf-review | `src/app/(app)/perf-review/page.tsx` | good/bad/next_focus fields | `perf_review` | `period_journals` | uuid |
| 23 | Daily journal list | `src/app/(app)/journal/page.tsx` | journal entries (delete only in this file) | `daily_journal` | `daily_journals` | unverified |
| 24 | Daily journal widget (home) | `src/components/home/DailyJournalWidget.tsx` | journal entry | `daily_journal` | `daily_journals` | unverified |
| 25 | Decisions / persona logs | `src/app/(app)/decisions/page.tsx` | persona-log entries, persona profile in `user_settings` | `persona_log`, `user_setting` | `persona_logs`, `user_settings` | unverified / uuid(?) — `user_settings` PK not re-confirmed this STEP, carried from audit §6a as documented |
| 26 | Schedule/timeline editor | `src/app/(app)/schedule/page.tsx` | meeting notes, todos, sub-tasks | `meeting_note`, `task_todo`, `agenda_sub_task` | `meetings.notes`, `task_todos`, `agenda_sub_tasks` | uuid / uuid / unverified |
| 27 | Settings | `src/app/(app)/settings/page.tsx` | org/menu/hidden-menu/member-role prefs | `user_preference` | `user_preferences`, `members` | uuid |
| 28 | Learning list (create) | `src/components/learning/LearningNew.tsx` (route `/learning`) | learning resource | `learning_resource` | `learning_resources` | uuid |
| 29 | Learning detail | `src/app/(app)/learning/[id]/page.tsx` | notes array, tags, media type | `learning_resource` | `learning_resources.notes` (jsonb) | uuid |
| 30 | Sketch board list | `src/components/sketch/SketchBoardList.tsx` (route `/sketch`) | board create/delete only (no update call found, verified §19 db-design) | `sketch_board` — **excluded from the 28** (db-design §19: no update call site found) | `sketch_boards` | uuid |
| 31 | Sketch canvas | `src/components/sketch/SketchCanvas.tsx` (route `/sketch/[id]`) | cards, frames, edges, position | `sketch_card`, `sketch_frame` | `sketch_cards`, `sketch_frames`, `sketch_edges` (link table, no autosave) | uuid |
| 32 | Completed / achievements | `src/app/(app)/completed/page.tsx` | achievement tagging | `manual_achievement`, `agenda_sub_task` (achievement_type field) | `manual_achievements`, `agenda_sub_tasks` | uuid / unverified |
| 33 | Global search overlay | `src/components/GlobalSearch.tsx` | none (delete only) | `meeting` (delete only, no field-edit) | `meetings` | uuid |
| 34 | Text-selection capture overlay | `src/components/TextSelectionCapture.tsx` | quick memo, sub-task note | `quick_memo`, `sub_task_note` | `quick_memos`, `sub_task_notes` | uuid / unverified |
| 35 | User setting sync hook (shared) | `src/hooks/useUserSetting.ts` | key/value setting | `user_setting` | `user_settings` | not re-verified this STEP (carried from audit §6a) |

**Re-verification note (instruction 9 — no invented entity_type/table)**: rows 25/35's `user_setting` and row 27's `user_preference` PK types were **not** independently re-confirmed via `Grep` in this STEP (the earlier PK-type grep in this document's intro covered `supabase/*.sql` broadly and did catch `user_settings`/`user_preferences` among the uuid-PK hits, but this document does not claim a table-by-table re-derivation beyond what's already cited from audit §6a). Flagged rather than silently asserted.

**Non-editor screens (confirmed no insert/update/upsert, re-affirmed, not part of the 35)**: `/archive`, `/intelligence`, `/login`, `/reset-password`, `/mockup` (audit §3, re-confirmed by this STEP's own `.from()` grep finding no new hits in those files beyond what audit already listed).

### 1b. Current save mechanics (audit §4/§8/STEP2 §4, cited not re-derived)

Shape/LEVEL/Class labels are audit's own vocabulary (§4 Shape A/B/C, §5 LEVEL 0-3, STEP2 §4 Class A/B/C/D) — reused verbatim so this document doesn't invent a second taxonomy for the same facts.

| # | Screen | Save shape | Debounce | Local draft | Recovery UI | Retry | Error checked? | Unmount flush | JSONB read-modify-write? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Home dashboard | Mixed (LEVEL0 quick-add inserts + Shape B journal preview) | varies, not unified | Heavy localStorage (mostly UI-state, not content-safety) | Partial | No | Not fully re-traced line-by-line (audit §3 row only, no §8 deep-dive) — **verification gap, flagged not guessed** | No | No (delegates jsonb risk to #7/#24) |
| 2 | Quick-memo popup | Shape B (Class A — the one fully-correct screen) | none (draft: every keystroke; save: manual) | **Yes**, per-window `qid`-scoped | **Yes**, orphan-draft picker | n/a (manual save, checked error, retained draft) | **Yes** (audit §8a, STEP2 §3) | n/a (draft is already durable) | No |
| 3 | Quick-memo floating button | n/a — not a content editor | — | button-position only | — | — | — | — | No |
| 4 | Quick-memo mobile bottom sheet | Class D at audit-time; **P0-3 fix now already applied, uncommitted** (see note below table) | none | **No** | No | No | **Fixed** — `error` now destructured, `saveError` shown, sheet stays open on failure (re-verified via `git diff` in this STEP, not yet committed) | No | No |
| 5 | Memos list | Shape B, Class B (draft present, inconsistent error-check) | debounced per composer | Yes (3 parallel draft timers) | Partial | No | Inconsistent within same file (update unchecked, insert checked) | No | No |
| 6 | Meetings list (create) | LEVEL0 (single insert) | none | No | No | No | Not individually re-traced beyond audit inclusion | n/a | No |
| 7 | Meeting detail | Shape A (existing-note edits) + Shape B (new-note composer) — **P0-2 fix already applied, uncommitted** (see note below table) | 1500ms (existing-note) | Yes (new-note composer only) | No (existing-note edits) | No | **Fixed for `updateMeeting`/`saveNote`/`editNote`** — all 3 now return/check a boolean and only clear input/mark-saved on success, `saveError` state added (re-verified via `git diff` in this STEP). `NoteAccordion`'s 1500ms debounce path also updated to only show "자동저장됨" on confirmed success. | **Still No** — none of the diff's `useEffect`s add an unmount-flush cleanup for `NoteAccordion.saveTimer` (re-confirmed by reading the diff; audit §9 #7 gap is unchanged) | **Still Yes — unchanged, 3 independent write surfaces.** The P0-2 patch adds error-checking to `updateMeeting` only; it does **not** add any version/`updated_at` compare-and-swap, and `MeetingBriefWidget.tsx`/`schedule/page.tsx` (the other 2 write surfaces) were **not modified at all** (confirmed absent from `git status`). The JSONB interim lock's mitigation (architecture Ch.21) remains fully unapplied. |
| 8 | Project matrix | Shape A (field edits, Class C) + reorder-with-toast (Class B, checked+4s toast) | not explicitly timed in audit | No | No | No | Inconsistent (reorder checked, field edits not) | No | No |
| 9 | Project item detail | Shape A, Class C | 500ms-class | No | No | No | **No** | No | No |
| 10 | Sub-task detail | Shape A, Class C | ~500ms | No | No | No | **No** | No | No |
| 11 | Tasks list | LEVEL0 | none | No | No | No | Not individually re-traced beyond inclusion | n/a | No |
| 12 | Task detail | Shape A — **P0-1 fix already applied, uncommitted** (see note below table) | varies | **No** (still no localStorage draft — the fix is error-checking, not draft-adding) | No | No | **Fixed for `saveNote()`/`addTodo()`** — both now destructure `{data, error}` and only clear `noteInput`/`todoInput` on success; a `toast` shows the failure message instead (re-verified via `git diff` in this STEP, not yet committed) | **Still No** — the fix does not add an unmount-flush cleanup | No |
| 13 | Annual-goals roadmap | Drag-reorder-with-toast, similar to #8 | n/a (reorder) | No | No | No | Checked for reorder, per audit §12 | No | No |
| 14 | Annual-goals category rename | LEVEL0 | none | No | No | No | Not individually re-traced | n/a | No |
| 15 | Annual-goal task detail | Shape A, Class C | 500-1500ms range | No | No | No | **No** | No | No |
| 16 | Objectives | Not fully line-traced (audit §13 #8 explicit gap — grep-level only) | Unknown | Unknown | Unknown | Unknown | ~15 call sites confirmed unchecked (audit §13 #8) | Unknown | No (relational, not jsonb) |
| 17 | Objective review | Not fully line-traced (audit §13 #8 explicit gap) | Unknown | Unknown | Unknown | Unknown | Confirmed unchecked at ~15 call sites (audit §13 #8, ground-truth table/call-site level only) | Unknown | No |
| 18 | One-on-one list + my-feedback | Shape B, Class B (feedback draft) | per-month draft | Yes (feedback) | Partial | No | Not fully re-traced for list-level saves | No | No |
| 19 | One-on-one member page | delete-only, no field edit | — | — | — | — | n/a | — | No |
| 20 | One-on-one session note editor | Shape A, Class C | not explicitly timed | No | No | No | **No** (STEP2 §2 #5/17/18) | No | **Yes** (1 write surface, audit STEP2 §8) |
| 21 | One-on-one template | Class D (select-then-branch, not true upsert) | none (immediate) | No | No | No | Partial (same-tab `insertInFlight` guard only, STEP2 §4) | n/a | No (but has its own duplicate-insert race, audit §9 #17/#19) |
| 22 | Perf-review | Shape A, Class C **with one genuine exception** (period-switch flush, audit §12) | 300ms/field | No | No | No | No | **Partial — the one real existing flush-on-transition mechanism in the app** (audit §12) | No |
| 23 | Daily journal list | delete-only in this file | — | — | — | — | n/a | — | No |
| 24 | Daily journal widget (home) | Shape B, Class B | debounced | Yes (`JOURNAL_DRAFT_KEY`) | Partial | No | Not confirmed checked (audit §4 class B note: "write not shown to be checked") | No | No |
| 25 | Decisions / persona logs | Shape B, Class B (persona-log draft) | per-persona-tab draft | Yes | Partial | No | Not individually re-traced for list-level saves | No | No |
| 26 | Schedule/timeline editor | Shape A (meeting notes branch, Class C) + LEVEL0 (todos/sub-tasks) | n/a for jsonb branch | No | No | No | **No** (jsonb branch is one of the 3 `meetings.notes` write surfaces, STEP2 §2/§8) | No | **Yes** (same `meetings.notes` race as #7) |
| 27 | Settings | LEVEL0-ish upserts, dual-write to localStorage | none | localStorage fallback (UX pattern, audit §12) | n/a | No | Not individually re-traced | n/a | No |
| 28 | Learning list (create) | LEVEL0 | none | No | No | No | Not individually re-traced | n/a | No |
| 29 | Learning detail | Shape A, Class C | ~500-1500ms | No | No | No | **No** | No | **Yes** (1 write surface, audit STEP2 §8) |
| 30 | Sketch board list | insert/delete only, no update found (db-design §19 negative-grep) | none | No | No | No | Not re-traced | n/a | No |
| 31 | Sketch canvas | Shape C (Class A — the other fully-correct screen) + drag-stop-only positions | 500ms (content only) | No | No | No | **Yes, checked + optimistic rollback** (audit §12) | No | No |
| 32 | Completed / achievements | LEVEL0-ish tagging | none | No | No | No | Not individually re-traced | n/a | No |
| 33 | Global search overlay | delete-only | — | — | — | — | n/a | — | No |
| 34 | Text-selection capture overlay | LEVEL0 insert | none | No | No | No | Not individually re-traced | n/a | No |
| 35 | User setting sync hook | Shape A, Class C | 400ms | No | No | No | **No** (`.then(() => {})`, result fully discarded — audit STEP2 §2 #1) | No | No |

### 1c. Risk, migration effort, and prerequisite work

"Data-loss risk" reuses audit's own severity language (CRITICAL/P0/P1/P2/P3, §9/STEP2 §9) — not re-graded here. "QuickMemo 적용난이도" is judged relative to the **as-built** `useAutosave()` contract (this document's intro), not an idealized one.

| # | Screen | 동시편집(multi-tab/device) 위험 | 현재 데이터유실 위험 | `useAutosave()` 적용 난이도 | 필요한 사전작업 |
|---|---|---|---|---|---|
| 1 | Home dashboard | Low-Medium (mostly LEVEL0 single fields; daily-journal sub-widget shares #24's risk) | Medium (widget-dependent) | High — composite of many sub-widgets, no single call site | Split into per-widget migration units before any single "home dashboard" migration is attempted |
| 2 | Quick-memo popup | Low (Class A) | Low (already-correct reference) | **Done** — this is the Phase-2 pilot itself | None — already migrated |
| 3 | Quick-memo floating button | n/a | n/a | n/a (not a content editor) | None |
| 4 | Quick-memo mobile bottom sheet | Medium (same table as #2, no draft) | **Reduced from High** — P0-3 (failure-shown-as-success) is now fixed uncommitted; **remaining risk is "no draft at all"** (refresh/close during the brief window before Save is clicked still loses input, since there's no localStorage buffer, unlike #2) | Low-Medium (single field, same entity_type as #2 — can reuse #2's `entity_type`/hook wiring almost directly) | Decide whether to bring to parity with #2 (add a draft) or explicitly accept the remaining no-draft risk (audit's own open question, §9 #6) — the P0-3 half of that question is now resolved |
| 5 | Memos list | Medium (jsonb? No — relational `quick_memos`, but inconsistent error-check) | Medium-High | Medium | Consolidate 3 parallel draft timers into one hook call before/during migration |
| 6 | Meetings list (create) | Low (create-only, no concurrent-edit surface) | Low | Low | None significant |
| 7 | Meeting detail | **Still High** (3 write surfaces on `meetings.notes`, unchanged) | **P0-2 resolved (uncommitted); the JSONB interim lock (jsonb stale-overwrite) unresolved and unchanged** — this is now purely a Track B / JSONB-CONFLICT risk, not a "failure shown as success" risk | **High** — combined Track A+B phase (architecture Ch.20 Phase 3) | Track B normalization (Ch.17 Option B) must land *with* this migration, not before/after in isolation. Confirm the uncommitted P0-2 patch gets **committed** before Phase 3 starts (§18) — an uncommitted fix is not a durable one. |
| 8 | Project matrix | Low-Medium | Medium (unchecked field edits) | Medium | `agenda_sub_tasks` table existence/shape must be confirmed (undocumented, §7/§13 open item) |
| 9 | Project item detail | Low-Medium | Medium-High (unchecked, no draft) | Medium-High (3 entity_types on one screen) | Same `agenda_sub_tasks`/`sub_task_notes` undocumented-table caveat as #8 |
| 10 | Sub-task detail | Low-Medium | Medium-High | Medium | Same undocumented-table caveat |
| 11 | Tasks list | Low | Low | Low | None significant |
| 12 | Task detail | Medium (no jsonb, but 3 entity_types) | **P0-1 (draft-wiped-on-failure) resolved, uncommitted** — remaining risk downgraded to Medium (LEVEL2: still no localStorage draft, still no unmount flush, so a refresh/close *before* the debounce/insert fires can still lose input — a different, lesser risk than the original P0) | Medium-High (3 entity_types, but `notes`/`task_todos` are simple relational tables — Track A alone suffices, no Track B needed) | Confirm the uncommitted P0-1 patch gets **committed** (§18); still a good Phase-4 candidate — now specifically **because** it's purely relational and already partially hardened, not because it's the worst-outstanding bug |
| 13 | Annual-goals roadmap | Low (reorder toast already checked) | Low-Medium | Low-Medium | None significant |
| 14 | Annual-goals category rename | Low | Low | Low | None |
| 15 | Annual-goal task detail | Low-Medium | Medium (LEVEL2, no draft) | Medium (2 entity_types) | None blocking |
| 16 | Objectives | Unknown (unresolved product duplication question, architecture Ch.19) | Unknown (not fully traced, audit §13 #8) | **Blocked** pending Ch.19 product decision + full line-trace | Ch.19 product decision (`obj_*` vs `_v2` live/dead) **and** a dedicated full-depth audit pass (audit §13 #8) before any migration |
| 17 | Objective review | Unknown (same duplication question) | Unknown (not fully traced) | **Blocked** pending Ch.19 + full line-trace | Same as #16 |
| 18 | One-on-one list + my-feedback | Low-Medium | Medium | Medium | None blocking |
| 19 | One-on-one member page | n/a (delete-only) | n/a | n/a | None |
| 20 | One-on-one session note editor | **High** (jsonb, 1 write surface but same structural race as #7) | **P0-class** (same jsonb pattern as #7, audit STEP2 §2/§8) | High (Track A+B combined, smaller scope than #7) | Track B normalization for `one_on_ones.notes` |
| 21 | One-on-one template | Medium (cross-tab duplicate-insert race, audit §9 #17/#19) | Medium (narrow condition, no data *content* loss, but duplicate rows) | Low-Medium (single singleton row, but needs a true `upsert` fix first) | Fix select-then-branch → true `upsert` (architecture Ch.21 lists this alongside the P0 patches conceptually, though audit itself doesn't rate it P0) |
| 22 | Perf-review | Low (single row per period, no multi-surface jsonb) | Medium (LEVEL2, no draft, but has the one existing flush mechanism) | Medium — **generalizing the existing period-switch flush into the universal unmount-flush is the one behavior to explicitly preserve, not regress** (architecture Ch.20 Phase 5) | None blocking |
| 23 | Daily journal list | Low (delete-only in this file) | Low | Low | None |
| 24 | Daily journal widget (home) | Low-Medium | Medium | Medium | None blocking |
| 25 | Decisions / persona logs | Low-Medium | Medium | Medium | None blocking |
| 26 | Schedule/timeline editor | **High** (shares #7's `meetings.notes` race) | **P0-class** (shares the JSONB interim lock issue, architecture Ch.21) | High (must migrate in lockstep with #7, not independently — same table, same race) | Must not be migrated to Track A independently of #7's Track A+B combined phase |
| 27 | Settings | Low (key/value, last-write-wins acceptable) | Low | Medium (dual-write-with-localStorage pattern is a UX feature to preserve, not a bug to fix, audit §12) | Decide whether `user_settings`/`user_preferences` consolidation (audit §10 #7) happens before or independently of autosave migration — **not** assumed solved by Track A |
| 28 | Learning list (create) | Low | Low | Low | None |
| 29 | Learning detail | **Medium-High** (jsonb, 1 write surface) | **P0-class pattern** (same jsonb read-modify-write shape as #7/#20, audit STEP2 §8) | High (Track A+B combined, smallest of the 3 jsonb screens) | Track B normalization for `learning_resources.notes` |
| 30 | Sketch board list | Low (no update path exists at all) | Low | n/a today (no update call site to migrate — confirm with product whether a rename feature is planned) | Confirm whether "rename" (audit's original description) is a live feature; if not, nothing to migrate |
| 31 | Sketch canvas | Low (Class A, drag-stop-only by construction) | Low (already-correct reference, alongside #2) | Low-Medium — mostly about *adding* version history on top of already-correct behavior, not fixing a bug | None blocking — good early Phase-B candidate precisely because it needs no behavior fix |
| 32 | Completed / achievements | Low-Medium | Medium | Medium | Depends on `agenda_sub_tasks` (undocumented) for the achievement_type branch |
| 33 | Global search overlay | n/a (delete-only) | n/a | n/a | None |
| 34 | Text-selection capture overlay | Low | Low-Medium | Low-Medium (2 entity_types, both simple inserts) | Depends on `sub_task_notes` (undocumented) for one branch |
| 35 | User setting sync hook | Low (key/value, last-write-wins acceptable) | Low-Medium (unchecked, but non-catastrophic content) | Low | None blocking |

### 1d. New finding this STEP — Phase 0 safety patches are already in the working tree, uncommitted

**This was not stated in any of the 4 prior documents and is grounded entirely in `git diff` reads performed during this STEP (read-only — no file was modified by this session).** The baseline `git status` (this document's intro) lists 7 files with pre-existing uncommitted changes. Reading each diff in full found:

- `src/app/(app)/tasks/[id]/page.tsx` — **architecture Ch.21's P0-1 patch is applied**: `addTodo()` and `saveNote()` now destructure `{data, error}` and only clear `todoInput`/`noteInput` (and only push the new row into local state) inside the success branch; on error, a `toast` message is shown and the function returns early, input preserved. This is exactly the "minimal patch" architecture Ch.21 described conceptually, now found actually implemented.
- `src/app/(app)/meetings/[id]/page.tsx` — **architecture Ch.21's P0-2 patch is applied for `updateMeeting`/`saveNote`/`editNote`**: `updateMeeting()` now returns `Promise<boolean>`, checks `{error}`, only applies the optimistic `setMeeting()` state update on success, and a new `saveError` state renders a visible failure message. `NoteAccordion`'s existing-note-edit paths (1500ms debounce, manual save button, blur-to-save title) were all updated to only flip UI state (`setAutoSaved`/`setEditingTitle`/`setEditing`) when `onEdit(...)` resolves `true`. **What is NOT in this diff**: no unmount-flush cleanup was added for `NoteAccordion.saveTimer` (audit §9 #7 gap unchanged), and — most importantly for this plan — **no version/`updated_at` compare-and-swap was added to the jsonb `notes` read-modify-write itself**, so the JSONB interim lock's stale-overwrite race is completely unaffected by this diff.
- `src/components/memo/MobileMemoSheet.tsx` — **architecture Ch.21's P0-3 patch is applied**: `handleSave()` now checks `{error}`, sets a `saveError` message, and returns before the "success" UI (`setSaved(true)`, sheet auto-close) fires.
- `src/components/meetings/MeetingNotesNew.tsx`, `MeetingSection.tsx`, `SearchToolbar.tsx` — **read and confirmed unrelated to autosave.** These are a UI/layout redesign (a right-hand meeting-preview panel, moving the search box, collapsed-vs-expanded section preview) with no `error`-handling or save-timing changes at all. `docs/autosave-implementation.md` §7's characterization of these 3 files as "STEP 3.5 P0 patches" is **imprecise** — flagged as a documentation inaccuracy in that prior doc (§17 below), not repeated here; this document's own classification (§1c) does not rely on them being autosave-related.

**Consequence for this plan**: the "Phase 0 — Safety patches" step in architecture Ch.20/21 is **substantially already done for P0-1, P0-2, and P0-3** (uncommitted). **The JSONB interim lock (the jsonb interim optimistic-lock mitigation) has not been started** — `MeetingBriefWidget.tsx` and `schedule/page.tsx`, the other 2 write surfaces for `meetings.notes`, are untouched. This changes this plan's Phase A content (§4) and is the reason rows #4/#7/#12's risk ratings above were revised from the audit's original (pre-patch) severity rather than copied verbatim — per instruction 9, this document reports what the code actually shows now, not what an earlier document said before this diff existed. **These patches are not yet committed to git** — this is itself the first, smallest action item this plan recommends (§16/§18), since an uncommitted fix provides no protection to anyone who isn't running off this exact working tree.

---

## 2. 4단계 위험 분류 (PILOT-READY / COMPLEX / JSONB-CONFLICT / HIGH-RISK)

**Definitions used (this document's own operationalization — the 4 names were given, the boundary rule was not re-specified verbatim in this STEP's brief, so it is stated explicitly here rather than assumed):**
- **PILOT-READY**: single (or trivial/no-op) entity_type, purely relational (no jsonb read-modify-write), no dependency on an undocumented table for its *main* save path, no unresolved product-level question blocking it, current data-loss risk Low/Low-Medium. Can adopt the Quick Memo (`useAutosave()`) pattern with little more than wiring — the same category Quick Memo itself (#2) and Sketch Canvas (#31) already sit in.
- **COMPLEX**: reachable and plannable, but has a real complicating factor that isn't jsonb and isn't a blocking unknown — multiple `entity_type`s on one screen needing coordinated migration, a dependency on one of the 13 undocumented tables (schema/PK unverified, and per db-design §24, **not creatable in the current dev project either** — a real Dev-DB-verifiability constraint, not just a paperwork gap), an existing special-case behavior that must be preserved (perf-review's flush), or a structural duplication needing a decision (settings' two tables) — none of these block starting, but each adds real sequencing/testing cost beyond a single-field pilot.
- **JSONB-CONFLICT**: the screen's single most important structural risk is the `meetings.notes`/`one_on_ones.notes`/`learning_resources.notes` stale-overwrite race (Track B, architecture Ch.17) — assigned here **instead of** HIGH-RISK per instruction 3's explicit rule not to double-bucket a jsonb screen into HIGH-RISK as well.
- **HIGH-RISK**: blocked on something this plan cannot resolve by itself — an open **product** decision (`obj_*` vs `objective*_v2`, architecture Ch.19), an audit **coverage gap** that must close before migration can even be scoped accurately (audit §13 #8: objectives/objective-review were only grep-level traced), or a **structural correctness bug that must be fixed first, not merely wrapped** (`one_on_one_template`'s select-then-branch cross-tab duplicate-insert race, audit §9 #17/#19, STEP2 §4 class D — `useAutosave()` cannot safely wrap a save path that can still create two canonical rows for one conceptual singleton).

**Every one of the 35 surfaces below is assigned to exactly one category** (instruction 3). Reasoning cites the single most important risk, not every risk the surface has (secondary risks are still recorded in §1c).

### PILOT-READY (14 surfaces)

| # | Screen | Why PILOT-READY (single most important reason) |
|---|---|---|
| 2 | Quick-memo popup | Already migrated (Phase 2 pilot); the reference implementation itself. |
| 3 | Quick-memo floating button | Not a content editor — no entity/field to migrate at all. |
| 4 | Quick-memo mobile bottom sheet | Single entity_type (`quick_memo`), same table as #2; P0-3 already fixed (uncommitted, §1d); only remaining gap is "no draft," a straightforward addition once #2's pattern exists. |
| 6 | Meetings list (create) | LEVEL0 create-only insert into `meetings`, single entity_type, no concurrent-edit surface. |
| 11 | Tasks list | LEVEL0, single entity_type (`task`), simple field edits. |
| 13 | Annual-goals roadmap | Single entity_type (`annual_goal_item`); reorder already checked with a toast (audit §12). |
| 14 | Annual-goals category rename | LEVEL0, single entity_type, documented table. |
| 19 | One-on-one member page | Delete-only in this file — no field-edit to migrate. |
| 23 | Daily journal list | Delete-only in this file — no field-edit to migrate (the actual editor is #24, classified separately). |
| 28 | Learning list (create) | LEVEL0 create-only, single entity_type. |
| 30 | Sketch board list | No `update` call site exists at all (db-design §19's own negative-grep finding, re-confirmed) — nothing to migrate unless a rename feature is added later. |
| 31 | Sketch canvas | Already the app's other fully-correct reference pattern (Class A, checked-error + optimistic rollback, drag-stop-only positions) — migration is additive (version history) not corrective. |
| 33 | Global search overlay | Delete-only — no field-edit to migrate. |
| 35 | User setting sync hook | Single entity_type (`user_setting`), simple key/value, LEVEL0-ish 400ms debounce, well-understood existing table. |

### COMPLEX (14 surfaces)

| # | Screen | Why COMPLEX (single most important reason) |
|---|---|---|
| 1 | Home dashboard | Composite of many sub-widgets with no single call site; partially depends on undocumented tables (`agenda_sub_tasks`, `daily_journals`) — needs to be split into per-widget migration units, not treated as one surface. |
| 5 | Memos list | 3 parallel draft timers with inconsistent error-checking in the same file — needs consolidation into one hook call before/during migration. |
| 8 | Project matrix | 3 entity_types on one screen (`agenda_group`/`project_item`/`agenda_sub_task`); `agenda_sub_tasks` is one of the 13 undocumented tables. |
| 9 | Project item detail | 3 entity_types on one screen; 2 of them (`agenda_sub_task`/`sub_task_note`) are undocumented tables. |
| 10 | Sub-task detail | 2 entity_types, both on undocumented tables. |
| 12 | Task detail | 3 entity_types on one screen (though purely relational, no jsonb); P0-1 already fixed (uncommitted, §1d) but the multi-entity_type coordination itself is the remaining complexity. |
| 15 | Annual-goal task detail | 2 entity_types on one screen (`annual_goal_task`/`annual_goal_task_note`). |
| 18 | One-on-one list + my-feedback | 2 entity_types on one screen (`one_on_one`/`one_on_one_feedback`), separate tables for what reads as one feature. |
| 22 | Perf-review | Must generalize the one genuine existing "flush on transition" mechanism (period-switch flush, audit §12) into the universal unmount-flush without regressing it — real behavioral care required, not a blank-slate wiring job. |
| 24 | Daily journal widget (home) | Canonical table `daily_journals` is one of the 13 undocumented tables — schema/PK unverified, and per db-design §24, **not creatable in the current dev project**, so Dev-DB verification for this screen needs a different environment or the reverse-documentation step first. |
| 25 | Decisions / persona logs | Canonical table `persona_logs` is undocumented, same constraint as #24. |
| 27 | Settings | `user_preferences`/`user_settings` two-tables-for-one-purpose duplication (audit §10 #7) is a real pre-existing inconsistency a migration plan must not silently paper over. |
| 32 | Completed / achievements | Depends on `agenda_sub_task` (undocumented) for its achievement_type branch. |
| 34 | Text-selection capture overlay | 2 entity_types; `sub_task_note` branch depends on an undocumented table. |

### JSONB-CONFLICT (4 surfaces)

| # | Screen | Why JSONB-CONFLICT (not HIGH-RISK — instruction 3's explicit rule) |
|---|---|---|
| 7 | Meeting detail | `meetings.notes` stale-overwrite race, **3 independent write surfaces** (this screen + #26 + `MeetingBriefWidget.tsx`) — the largest-blast-radius instance of Track B. P0-2 (failure-shown-as-success) is already fixed (§1d); the jsonb race itself is untouched and is this screen's single most important remaining risk. |
| 20 | One-on-one session note editor | `one_on_ones.notes` stale-overwrite race, 1 write surface. |
| 26 | Schedule/timeline editor | Its `meetings.notes` branch shares #7's exact race (same table, same jsonb column) — chosen as this screen's defining risk over its separate, lower-risk `agenda_sub_task`/`task_todo` branches (those are recorded as COMPLEX-grade secondary risk in §1c, not double-counted here). |
| 29 | Learning detail | `learning_resources.notes` stale-overwrite race, 1 write surface. |

### HIGH-RISK (3 surfaces)

| # | Screen | Why HIGH-RISK (blocking factor this plan cannot resolve alone) |
|---|---|---|
| 16 | Objectives | Blocked on architecture Ch.19's open product decision (`obj_*` vs `objective*_v2` — which is live) **and** audit §13 #8's own admitted coverage gap (only a grep-level pass, no line-level debounce/draft/unmount tracing was ever done) — migrating this screen onto `useAutosave()` before either is resolved would be designing against facts this plan does not actually have. |
| 17 | Objective review | Same two blockers as #16, mirrored onto the `_v2` schema. |
| 21 | One-on-one template | The select-then-branch pattern (not a true `upsert`) can still double-insert across tabs (audit §9 #17/#19, STEP2 §4 class D — the same-tab `insertInFlight` guard doesn't cover the cross-tab case) — wrapping this in `useAutosave()` before fixing the underlying write to a true `upsert` would autosave a screen that can still silently create two rows for a conceptual singleton, which is a correctness bug to fix first, not a behavior for the Autosave Core to paper over. |

**Self-check (instruction 17, done now — re-verified again in §17):** 14 + 14 + 4 + 3 = **35** = the full edit-surface count from §1. No surface appears in more than one category.

---

## 3. 적용 순서 (Phase A-E)

**Ordering criteria, applied in this priority** (per instruction 4): data-loss risk reduction achieved by migrating → implementation complexity → canonical-structure clarity (documented vs. undocumented table) → cross-screen impact (does fixing this unblock/inform others) → representativeness (does this phase teach a pattern reused later) → **Dev DB verifiability** — this last criterion surfaced a blocker not visible from the prior 4 documents alone (see the callout after the phase table): **every canonical table in the current dev pilot project currently 404s** (`PGRST205`, a PostgREST schema-cache gap, db-design §24/§6, re-affirmed here as still unresolved — no dev/build command was run in this STEP to check whether it has since cleared).

| Phase | # surfaces | Category | Order rationale | 선행조건 | 핵심 위험 | Dev DB 검증 방식 |
|---|---|---|---|---|---|---|
| **A** | 14 | PILOT-READY | Lowest risk, already-proven pattern (2 of the 14 — #2, #31 — are already the app's 2 correctly-behaving reference screens); establishes the `useAutosave()` wiring pattern on the remaining simple single-entity_type screens before anything harder is attempted. | Phase 1 Core build (architecture Ch.20) must already exist — it does not yet (only the Quick Memo pilot's own tables/hook exist, scoped to `entity_type='quick_memo'` per db-design §7 Phase 2 row). Commit the uncommitted P0-1/P0-2/P0-3 patches (§1d) first, so Phase A doesn't build on top of an unreviewed working-tree state. | Trivial-editor rows (#3/#19/#23/#30/#33) need no real migration — risk is near-zero by construction, not because it was fixed. | **Blocked today** by the canonical-table schema-cache gap (db-design §24) for any screen beyond Quick Memo's own already-tested `quick_memos` path — re-run `docs/autosave-db-design.md` §24's own diagnostic (a plain `select` against e.g. `tasks` from the dev project) before assuming any Phase A screen is Dev-DB-testable; if still 404ing, resolve or re-bootstrap the dev project first (§13/§14). |
| **B** | 6 (#5, #12, #15, #18, #22, #27) | COMPLEX, fully-documented canonical tables | Next-lowest risk: multiple `entity_type`s per screen or a special-case behavior to preserve, but every canonical table involved has a real `CREATE TABLE` in `supabase/*.sql` (audit §6a) — no schema-drift unknown to compound the migration risk. #12 (task detail) is prioritized first within this phase specifically because it carries the largest audit-documented risk reduction (P0-1, already patched uncommitted, §1d) among fully-documented-table screens. | Phase A's pattern proven; the uncommitted P0-1 patch on #12 committed (§18). | Multi-entity_type coordination on one screen (e.g. #12's `task`+`task_note`+`task_todo`, #18's `one_on_one`+`one_on_one_feedback`) — each entity_type still migrates as its own independent `useAutosave()` call per architecture Ch.5's "one hook call per field," but the screen-level testing must cover all of them together, not just one in isolation. | Should be Dev-DB-testable once the schema-cache gap (Phase A row) is resolved, since none of these tables are among the 13 undocumented ones. |
| **C** | 8 (#1, #8, #9, #10, #24, #25, #32, #34) | COMPLEX, undocumented-table-dependent | Same complexity class as Phase B, but every screen here depends on at least one of the 13 undocumented tables (`agenda_sub_tasks`, `sub_task_notes`, `daily_journals`, `persona_logs`) — held back one phase specifically so the reverse-documentation step (architecture Ch.18, option 2 — commit `CREATE TABLE IF NOT EXISTS` DDL matching the live schema) can happen in parallel with, and ideally ahead of, this phase, rather than migrating blind against an unverified schema. | Architecture Ch.18's reverse-documentation step for the specific tables this phase touches; confirmation that the current dev project can even create these tables at all (db-design §24 found the combined schema script **cannot** create `agenda_sub_tasks`/`sub_task_notes` — a real, not hypothetical, environment gap for Phase C specifically). | PK type unverified for every one of these tables — `autosave_drafts.entity_id`/`content_versions.entity_id` being generic `text` (db-design §2/§16) tolerates this, but the field_key registry (architecture Ch.22) cannot be reviewed with full confidence until the real column shape is known. | **Not currently possible in the existing dev project** for the affected branches (db-design §24's own finding, re-affirmed) — requires either the reverse-documentation migration to be applied to a dev project, or a fresh dev project bootstrap that includes these tables, before Phase C's Dev-DB verification step can run at all. |
| **D** | 4 (#7, #20, #26, #29) | JSONB-CONFLICT | Deliberately held until after Phase A/B/C have validated the Core against purely-relational screens, because this phase uniquely **combines** Track A (autosave) and Track B (jsonb→child-table normalization, architecture Ch.17 Option B) in one migration — architecture Ch.22 already flags this as "the highest-complexity single migration phase," and this plan does not dispute that judgment, only re-confirms it holds after re-inventorying the current code (§1d: P0-2 is now fixed for `meetings.notes`'s error-handling, but the jsonb race itself — the JSONB interim lock — is completely untouched, so this phase's actual scope is undiminished). #7 (`meetings.notes`, 3 write surfaces) goes first within this phase since it has the largest blast radius and the richest existing behavior (draft, orphan-recovery-adjacent patterns) to validate against. | Track B's own data-migration script (exploding jsonb arrays into child-table rows) designed and reviewed — **not done in this or any prior STEP**, explicitly listed as an Open Issue (§17). Old `notes` jsonb column kept in place, unused, for at least one release cycle post-migration (architecture Ch.20 Phase 3's own rollback plan). | Migrating 3 independent write surfaces (#7, #26, `MeetingBriefWidget.tsx`) onto one normalized child table simultaneously, without regressing any of the 3 UI entry points. | Requires a real row-count-comparison check before/after the jsonb-explode migration (architecture Ch.20 Phase 3) — this is a genuine data migration, not just a schema addition, so it needs its own before/after verification step distinct from the Phase 1 Core's throwaway-entity_type test. |
| **E** | 3 (#16, #17, #21) | HIGH-RISK | Last, by definition — none of these 3 can be migrated correctly until an external blocker clears: #16/#17 need architecture Ch.19's product decision (which objectives schema is live) plus the still-outstanding full line-level audit pass (audit §13 #8); #21 needs its own correctness fix (true `upsert`) shipped and verified *before* `useAutosave()` wraps it, or the wrapping would just add version history on top of a still-buggy save path. | For #16/#17: Ch.19's product decision, then a dedicated audit pass matching audit §1/§2's depth for the other 33 surfaces (currently only grep-level, audit §13 #8). For #21: a true `upsert`/`ON CONFLICT` rewrite of `persist()`, verified to close the cross-tab race, as its own independent small fix — not gated on the rest of this rollout plan. | Migrating #16/#17 while the underlying schema question is unresolved risks building `entity_type` registrations against a table that turns out to be dead code; migrating #21 before its upsert fix risks the Autosave Core faithfully versioning a duplicate-row bug instead of catching it. | Cannot begin until each surface's specific blocker clears — no generic Dev-DB verification plan is meaningful here yet; write one once the blocker for each specific surface is resolved. |

**Self-check**: 14 + 6 + 8 + 4 + 3 = **35** = the same total as §2's 4-category split (re-verified again in §17). "**한 화면 구현 → local 검증 → Dev DB 검증 → PASS → 다음 화면**" principle (instruction 4) applies within every phase above — no phase authorizes migrating more than one screen at a time; the phase table groups screens by *shared risk profile and sequencing rationale* only, not by "do these together."

---

## 4. JSONB 화면 별도 분석 (Track A ≠ Track B — 절대 하나로 섞지 않음)

**Restated from architecture Ch.17/intro and re-affirmed after re-reading the current code in this STEP: adopting `useAutosave()` (Track A) on any of the 3 screens below does NOT fix the stale-overwrite race described here. Track B (jsonb→child-table normalization) is a separate, structural fix.** This section evaluates each of the 3 jsonb `notes` columns individually, per instruction 5's specific field list.

| | `meetings.notes` (#7 + #26 + home widget) | `one_on_ones.notes` (#20) | `learning_resources.notes` (#29) |
|---|---|---|---|
| **읽기 경로** | `meetings/[id]/page.tsx` loads `meeting.notes` into React state on mount; `schedule/page.tsx` independently loads its own copy via a separate query; `MeetingBriefWidget.tsx` independently loads a third copy for the home screen. | `one-on-one/[memberId]/[sessionId]/page.tsx` loads `session.notes` on mount — **1 read path only**, confirmed (audit STEP2 §2/§8). | `learning/[id]/page.tsx` loads `resource.notes` on mount — **1 read path only**, confirmed. |
| **쓰기 경로** | 3 independent `supabase.from('meetings').update({notes: [...]})` call sites: `meetings/[id]/page.tsx`'s `saveNote()`/`editNote()` (now routed through the P0-2-patched `updateMeeting()`, §1d — still no version check), `schedule/page.tsx:297`, `MeetingBriefWidget.tsx:207-210`. | 1 call site: `one-on-one/[memberId]/[sessionId]/page.tsx` — `updateSession({notes: [...]})`-shaped update. | 1 call site: `learning/[id]/page.tsx:82-84`. |
| **동일 entity를 수정하는 component** | 3 distinct component files/screens, confirmed (audit STEP2 §2/§8) — the largest blast radius of the 3. | 1 component file — no cross-screen collision surface beyond 2 browser tabs/devices on the exact same session page. | 1 component file — same as `one_on_ones`. |
| **쓰기 호출 위치** | `meetings/[id]/page.tsx` lines ~456-490 (`saveNote`/`editNote`, both now boolean-returning post-patch, §1d); `schedule/page.tsx:297`; `MeetingBriefWidget.tsx:207-210`. | `one-on-one/[memberId]/[sessionId]/page.tsx:98-104`. | `learning/[id]/page.tsx:82-84`. |
| **Stale overwrite race** | **Confirmed reproducible T1-T4 sequence** (audit STEP2 §8): two of the 3 surfaces can each read the array before either write lands, then each write the full array back from their own stale copy — the loser's addition is silently gone, no error, no conflict signal. Highest likelihood of the 3 given 3 independent surfaces. | Same structural race, narrower — needs 2 tabs/devices open on the *same session* specifically. | Same structural race, narrower — needs 2 tabs/devices open on the *same resource* specifically. |
| **현재 optimistic lock 여부** | **None.** The P0-2 patch (§1d) added error-checking to `updateMeeting()`, not a version/`updated_at` compare-and-swap — re-confirmed by reading the diff in full; no `WHERE updated_at = :expected` or equivalent condition was added anywhere in the 3 write paths. | **None.** | **None.** |
| **Relational normalization 필요 여부** | **Yes** — architecture Ch.17 Option B (recommended), following the pattern this same codebase already uses for `annual_goal_task_notes`/`sub_task_notes` (audit §6a). | **Yes**, same recommendation, smaller scope (1 write surface). | **Yes**, same recommendation, smaller scope (1 write surface). |
| **Track A (autosave) 적용 가능 여부** | Only meaningfully applicable **after** Track B normalization — architecture Ch.17's own "autosave와의 궁합" scoring judged autosaving the raw jsonb array a poor fit (the Core would need jsonb-path-aware write logic instead of a plain row update). Track A on the *normalized* child-table rows is a clean fit (each note = its own entity, "zero special-casing," architecture Ch.17). | Same conclusion, smaller scope. | Same conclusion, smaller scope. |
| **Track B 선행 작업 필요 여부** | **Yes, and it is Phase D's entire premise (§3)** — the migration script that explodes the jsonb array into rows in a new child table is **not designed in this STEP either** (per this STEP's own scope limits) — it remains future work, tracked as an Open Issue (§17), not invented here. | Yes, same open item, smaller scope. | Yes, same open item, smaller scope. |

**Explicit non-conclusion, restated per instruction 5**: this section does **not** claim "applying `useAutosave()` to these 3 screens resolves the jsonb race" — it does not, and this document does not present Phase D (§3) as doing so either. Track B's actual data-migration script remains undesigned (an Open Issue, §17) — this section only re-confirms, against the current (patched) code, that the diagnosis and recommendation from architecture Ch.17 still hold unchanged.

---

## 5. 공용 `useAutosave()` Contract 검토 (as-built, `docs/autosave-implementation.md` §3 기준)

Answers below are grounded in the **real, dev-DB-verified** API (implementation.md §3, TEST A-L all PASS) — not architecture Ch.6-16's original design prose, which is cited only where the two agree or where they diverge (flagged explicitly).

| Question | Answer (as-built) |
|---|---|
| **entity_type/entity_id 전달 방식** | Passed as plain string props to the hook: `useAutosave({ entityType: 'quick_memo', entityId: qid, fieldKey: 'draft', ... })`. No registry/lookup table validates these client-side — the only real validation is the DB-level `CHECK` constraint (db-design §18, 28 values). |
| **field_key 정의 방식** | A free-string constant per logical field, e.g. `'draft'` for Quick Memo. **As-built precedent (new information this STEP surfaces, not decided in architecture/db-design):** Quick Memo does **not** register 3 separate `field_key`s for `title`/`content`/`tag` — it combines all 3 into **one** JSON `value` under a single `field_key: 'draft'`. This is a real design choice made during Phase 2 implementation, not something architecture Ch.5/db-design §19 specified either way — carried forward here as the working precedent future screens should follow *when a screen's fields are always saved/recovered together as one unit* (matches Quick Memo's own pre-existing per-window draft model). Screens whose fields have independent save cadences (e.g. task detail's `notes` vs `todos`, already 2 different entity_types per §1) should keep using separate `field_key`s/entity_types — the as-built hook supports both patterns, this is a per-screen judgment call, not a hook limitation. |
| **여러 field를 하나의 draft로 저장 가능 여부** | **Yes, confirmed as-built** (Quick Memo's `{title, content, tag}` combined value) — this answers architecture Ch.25's open question in the affirmative, empirically, not just in theory. |
| **Canonical save와 autosave 구분법** | The hook's `flush({ source })` parameter (`'auto'|'final'|'restore'`) is the mechanism — matches db-design §3/§6 exactly. Canonical save (Quick Memo's existing "Save" button) calls `flush({source:'final'})` **after** its own existing (unchanged) canonical insert succeeds — confirmed in implementation.md TEST I: "the post-success code path (`autosave.flush({source:'final'})`) ran ... confirmed via `verify-autosave-dev.mjs`: a `content_versions` row with `source='final'` was created exactly at Save time." This matches architecture Ch.16's Class-1/Class-2 design exactly — no divergence found. |
| **localStorage key naming** | `autosave_buffer_v1:<entityType>:<entityId>:<fieldKey>` — confirmed as-built (implementation.md §3: `autosave_buffer_v1:quick_memo:<qid>:draft`), matching this document's own §6 recommendation and architecture Ch.10's schema-versioned-envelope intent (the `v1` suffix serves that role). |
| **Draft recovery priority** | As-built: on mount, the hook compares its own buffer against the *initial value passed in* (i.e., whatever the screen's own existing state-initialization already produced) and exposes `recovered`/`onRecoveredAvailable` if different — it does **not** try to arbitrate between the hook's buffer and any *pre-existing legacy* localStorage key (e.g. Quick Memo's own `quick_memo_drafts`); that arbitration is left to the screen itself. Confirmed in implementation.md §4/§5 TEST C: "Full concatenated title text restored after reload (via existing legacy mechanism; hook's own buffer held matching content, no divergence)" — i.e., in practice the **legacy mechanism recovers first** (it's the screen's own pre-existing code, unchanged) and the hook's buffer is a secondary, currently-redundant safety net for Quick Memo specifically, becoming the *primary* one only for screens with no pre-existing draft (the majority of COMPLEX/Phase-B/C screens, §1c). This is a real, useful nuance not spelled out this precisely in architecture Ch.10 — recorded as an Open Issue for how future screens without a legacy draft should present the priority (§17). |
| **Retry policy** | Exponential backoff 2s→4s→8s→15s, then every 30s, `online`-event fast-path bypass — confirmed **exactly as architecture Ch.12 specified**, and dev-DB-verified (TEST F/H, both PASS). No divergence found. |
| **Conflict state API** | `conflict: { serverContent, serverVersionNo, localValue } | null`, `resolveConflict('keep-mine'|'take-theirs')` — confirmed as-built and dev-DB-verified against a **real, organically-produced** two-tab CAS race (TEST K), not a synthetic one. Matches architecture Ch.13's "detection + surfacing, no auto-merge" recommendation exactly. |
| **version_no 증가 시점** | On every successful CAS-gated canonical-adjacent sync (db-design §4's `UPDATE ... WHERE version_no = :expected`), confirmed dev-DB-verified (TEST D/F/K). |
| **content_versions 생성 기준** | Content-hash-deduped against the immediately-preceding version, except `source IN ('final','restore')` which always insert — confirmed as-built (implementation.md §3/§5 TEST D/I), matching db-design §4 Step 3 exactly. |
| **Unmount flush 방식** | Not separately itemized as its own TEST A-L row in implementation.md — **this is a real verification gap in the Phase-2 pilot, not something this STEP can close by re-testing (no dev/build command was run in this STEP).** Recorded as an Open Issue (§17): confirm unmount-flush behavior is actually exercised by a dedicated test before Phase A (§3) relies on it for any *other* screen — Quick Memo itself is a popup window whose "unmount" case is unusually conflated with "window close" (already covered by the durable local buffer, per architecture Ch.6's own reasoning for why Quick Memo never needed a `beforeunload` handler), so TEST A-L's coverage of Quick Memo specifically does not by itself prove the unmount-flush path for a screen with normal Next.js route-level unmounting (e.g. navigating from `/tasks/123` to `/tasks/456`). |
| **Canonical save-autosave race 방지** | As-built: Final Save (`flush({source:'final'})`) is called **after** the canonical write already succeeded (implementation.md §3/TEST I) — matches architecture Ch.16's "Final Save always flushes pending debounce first, then performs its own canonical write through the same version-gated path" **only partially**: the as-built Quick Memo integration does not itself perform the *canonical* write through the CAS path (Quick Memo's canonical `quick_memos` insert is its own pre-existing, unchanged code, per Ch.16's Class-1 treatment) — only the *autosave* draft/version bookkeeping goes through the CAS path. This is consistent with Option C (canonical tables never bypassed, architecture Ch.4/5), not a divergence — flagged here only so a future COMPLEX/Phase-B screen's migration doesn't mistakenly assume the hook itself performs canonical writes. |
| **Stale write 차단법** | The CAS `UPDATE ... WHERE version_no = :expected` (db-design §4) — dev-DB-verified via the real two-tab race in TEST K (Tab 1's CAS from v10 organically rejected because Tab 2 had already advanced to v11). No divergence from db-design §4/architecture Ch.9 found. |

**Where the as-built contract diverges from architecture Ch.6's original prose (Open Issue, not silently reconciled, per task instruction 6):** the status enum is `'idle'|'local-saving'|'pending-sync'|'syncing'|'saved'|'retrying'|'error'|'conflict'` (implementation.md §3) vs. architecture Ch.6's originally-designed `local-only|syncing|synced|failed|conflict|recovered` — different names, and `recovered` is a separate return field rather than a status value in the built version. Every future phase in this plan (§3) should code against the **as-built** enum, since it is the one that passed TEST A-L against the real dev DB — this document does not ask any future phase to reconcile the naming, only to be aware the two documents don't literally match (§17).

---

## 6. localStorage Key 규칙

**Common naming convention, confirmed as-built (not merely proposed)**: `autosave_buffer_v1:<entityType>:<entityId>:<fieldKey>` — this is the **actual** key Quick Memo's Phase-2 migration uses (`autosave_buffer_v1:quick_memo:<qid>:draft`, implementation.md §3), matching this plan's own recommendation, so no reconciliation is needed between "recommended" and "as-built" here (unlike §5's status-enum divergence). The `v1` segment is the schema-version envelope architecture Ch.10 called for.

**Every existing legacy localStorage key (audit §5), mapped**: no legacy key is deleted, renamed, or migrated by this document — this table is a **plan**, matching instruction 7's explicit "실제 migration 코드 작성 금지."

| Legacy key | Screen | New key (would-be) | Migration needed? | Backward compat plan | 기존 draft 삭제 시점 | 삭제하면 안 되는 경우 |
|---|---|---|---|---|---|---|
| `quick_memo_drafts` | #2 Quick-memo popup | `autosave_buffer_v1:quick_memo:<qid>:draft` | **Done** — this is the actual Phase-2 pattern; legacy key is untouched, both coexist (implementation.md §2/§4, confirmed "the existing legacy `quick_memo_drafts`/`quick_memo_archive`, orphan picker, heartbeat, Save/Discard) is untouched"). | Already live — legacy key still recovers first in practice (§5's recovery-priority finding). | Not yet — Phase 6 (architecture Ch.20) is explicitly the *last* phase, gated on a full compatibility-read window elapsing. | If any browser tab/cached bundle is still on pre-migration code (audit §7's own reasoning for why old keys are kept "at least one full release cycle"). |
| `quick_memo_archive` | #2 | n/a — **not migrated at all**, different purpose (a 3-day/50-entry save-event safety net, not a draft) | No | Kept permanently as-is — architecture §12/Ch.3 lists this as a "must preserve" existing feature, not a legacy artifact to retire. | Never (by design) | Always — this is not legacy debt, it's the app's best existing safety net. |
| `quick_memo_heartbeats`, `quick_memo_btn_pos` | #2/#3 | n/a — window-liveness/UI-position, not content | No | Unaffected | Never | Always — not content-recovery state (audit §12 "must preserve" list). |
| `meeting_draft_${id}` / `meeting_draft_title_${id}` | #7 Meeting detail (new-note composer only) | `autosave_buffer_v1:meeting:<id>:new_note_draft` (one combined `{title, content}` value, following the Quick Memo precedent from §5 rather than 2 separate field_keys) | Yes, when #7 migrates (Phase D, §3) | One-time compatibility read on first mount post-migration: if old key exists and new buffer is empty, copy old→new, leave old key in place (architecture Ch.10). | Phase 6, after Phase D has been stable for a full release cycle. | If any user still has an unsynced draft sitting only in the old key format when the migration ships. |
| `meetings_cat_order` | #6/#7 | n/a — UI tab-order preference, not content | No | Unaffected | Never | Always. |
| `QUICK_DRAFT_KEY` / `inline_draft_${tag}` | #5 Memos list | `autosave_buffer_v1:quick_memo:<new-compose-id>:draft` / `autosave_buffer_v1:quick_memo:<tag>:draft` | Yes, when #5 migrates (Phase B, §3) | Same one-time compatibility read pattern as above. | Phase 6 | Same reasoning as above. |
| `JOURNAL_DRAFT_KEY` | #24 Daily journal widget | `autosave_buffer_v1:daily_journal:<date>:draft` | Yes, when #24 migrates (Phase C, §3 — blocked on the undocumented-table gap first) | Same pattern | Phase 6 | Same reasoning. |
| `home_tl_*` family, `dash_st_cols_v9`, `memos_open_id`, `todo_assignees`, `oneOnOne_nextQuestions`, `PARTS_KEY`, `schedule_day_order`, `viewportKey(boardId)`, `dashboard_org`/`dashboard_hidden_menus`/`dashboard_menu_order`/`dashboard_member_roles` | various (#1, #27, cross-cutting) | n/a — **not migrated**, all are UI-layout/preference/cross-navigation-signal state, not content-recovery state (architecture Ch.10 explicitly excludes this class) | No | Unaffected | Never | Always — migrating these would be scope creep into UI-state management, not autosave. |
| `feedbackDraftKey(month)` | #18 One-on-one feedback | `autosave_buffer_v1:one_on_one_feedback:<month>:draft` | Yes, when #18 migrates (Phase B, §3) | Same compatibility-read pattern | Phase 6 | Same reasoning. |
| `logDraftKey(activeTab)` | #25 Decisions/persona logs | `autosave_buffer_v1:persona_log:<tab>:draft` | Yes, when #25 migrates (Phase C, §3 — blocked on the undocumented `persona_logs` table gap first) | Same pattern | Phase 6 | Same reasoning. |
| `project-tab`, `annual-goals-tab`, `_qmc` | #8/#13, cross-cutting | n/a — **`sessionStorage`**, UI-preference, explicitly out of scope (architecture Ch.10) | No | Unaffected | Never | Always. |

**Open item, not decided here (instruction 7 — plan only)**: whether `dashboard_org`/`user_preferences`-family keys (#27) should eventually get the generic autosave wrapping (they do have an `entity_type` registered, `user_preference`, §19-of-db-design) or should permanently keep their existing bespoke dual-write pattern instead — flagged again in §17, not resolved here, since architecture Ch.3/§12 explicitly lists the dual-write pattern as a "must preserve" UX feature, which could mean either "wrap it without changing the UX" or "leave it alone entirely."

---

## 7. Server Draft Identity — `(entity_type, entity_id, field_key)` 유일성 검증

**For the 30 of 35 surfaces with a normal single-row canonical target, identity is clean**: `(entity_type, entity_id, field_key)` uniquely identifies the editor, because `entity_id` is a real, stable relational primary key and each debounced field already has its own `entity_type`/`field_key` (§1a's per-row mapping). No composite-identity problem found for these — re-confirmed by this STEP's own re-grep of the call sites (§ intro), not merely assumed from the prior docs.

**Two genuine identity problems found, neither solved here (recorded only, per instruction 8):**

1. **jsonb `notes` arrays (#7/#20/#26/#29) — individual notes have no stable addressable identity today.** `(entity_type='meeting_note', entity_id=<meeting id>, field_key='notes')` identifies the *column*, not an individual note — two different notes inside the same `meetings.notes` array are only distinguished by their position in the array (audit STEP2 §8's race is exactly this: two writers each rewrite "the whole array" because there is no per-note row to target independently). **This is not a new finding — it is the same structural fact that already motivates Track B's normalization (§4)** — restated here specifically as a Server Draft Identity problem because it means `useAutosave()` cannot be given a meaningful per-note `entity_id` **until** Track B's normalization exists; before that, at most the *whole column* can be an autosave target, which architecture Ch.17 already judged a poor fit. No fix proposed here beyond "this is one more reason Track B must precede Track A for these 3 screens" (already Phase D's premise, §3).
2. **`objective`/`objective_review` entity_types (#16/#17) each cover 4 (or 3) structurally distinct tables under one `entity_type` value** — db-design §19 rows 15/16 register `entity_type='objective'` against **all four** of `obj_groups`/`obj_objectives`/`obj_sub_items`/`obj_sub_entries` (and `entity_type='objective_review'` against all three `_v2` tables) with no sub-discriminator. **This is a real ambiguity not flagged as such in db-design §19 itself** (that section grounds *which tables* map to the entity_type, but does not address whether one `entity_type` value can safely span 4 different PK spaces without an `entity_id` collision — e.g. an `obj_groups` row and an `obj_sub_entries` row could coincidentally share the same uuid value, and `(entity_type='objective', entity_id=<that uuid>)` would then be genuinely ambiguous about which table it refers to). **New finding this STEP, recorded not solved**: if/when architecture Ch.19's product decision unblocks #16/#17 (Phase E, §3), the `entity_type` grounding likely needs to be split finer (e.g. `objective_group`/`objective_item`/`objective_sub_item`/`objective_entry`, one per table) rather than reusing a single `objective` value across 4 tables — flagged as a required correction to db-design §19 at that time, not applied to db-design §19 itself in this STEP (that document is read-only per this STEP's absolute rules).

**Other sub-questions from instruction 8, answered directly:**
- **여러 editor가 같은 entity 수정하는 경우**: `meetings.notes` (3 UI surfaces, #7/#26/home widget) is the only confirmed instance — already covered above and in §4.
- **Title-body 별도 수정**: confirmed only for `meetings`' `NoteAccordion` (title blur-to-save vs. content debounce, both ultimately routed through the same per-note jsonb write) — subsumed under finding #1 above, not a separate identity problem once Track B normalizes notes into their own rows (title and content would then be two ordinary columns on one addressable row, no special handling needed).
- **Nested item/child entity**: sub-tasks under project items (#9/#10), notes under tasks/annual-goal-tasks (#12/#15) are **already** normalized child tables with their own PK — no identity problem, `entity_id` is simply the child row's own id, independent of the parent's id. This is exactly why these screens are COMPLEX (multi-entity_type coordination) rather than JSONB-CONFLICT or a new identity problem.
- **Composite identity 필요 여부**: not needed anywhere in the 33 surfaces outside the 2 findings above — `client_scope` (db-design §2) already covers the one legitimate "composite" need (same user, multiple tabs/devices), which is a per-user dimension, not a per-entity one.

**Additional finding this STEP — Quick Memo's own `entity_id` does not track forward to the canonical row it eventually creates.** Quick Memo's `entity_id` is the per-window `qid` (an ephemeral, client-generated compose-session id, audit §8a), **not** the real `quick_memos.id` the canonical INSERT eventually creates. This is fine for *recovery* (the whole point of `qid`-scoping is surviving a crash before the row exists at all) but means the draft/version history for a composed-and-saved memo is filed under an id that has no relationship to the saved row's own primary key — so a future per-document History panel (architecture Ch.15.C) opened *from the saved memo itself* (e.g. from `/memos`) would have no way to look up "the compose-time draft/version history that led to this row," only the reverse (opening the original popup window, if still open, could still see its own `qid`-scoped history). **Recorded as an Open Issue (§17), not solved** — this is a real consequence of Class 1's design (architecture Ch.16) that neither architecture Ch.7 nor db-design §2 called out explicitly for the create-new-record case specifically (their examples are mostly edit-an-existing-record cases, where `entity_id` = the real PK from the start).

---

## 8. Canonical Save ↔ Autosave 충돌 분석 (A-F)

**Class 1 vs. Class 2 (architecture Ch.16) behave differently here and must be analyzed separately, per this STEP's own re-reading of the as-built contract (§5):**
- **Class 1** (Quick Memo and the other screens with a pre-existing manual Save button, §1c): the Autosave Core's draft/version writes are **entirely separate** from the canonical write — canonical only ever gets written once, at Final Save, by the screen's own pre-existing (unchanged) code. The CAS mechanism (db-design §4) only ever gates the draft/version bookkeeping for these screens, never the canonical table.
- **Class 2** (task notes and the other LEVEL-2/no-manual-save screens once migrated, §1c Phase B/C/D candidates): "autosave" **is** the canonical write — per db-design §4 Step 1→2, the canonical update is only supposed to proceed *after* the draft row's CAS succeeds, meaning the canonical write itself would become version-gated for these screens, not just last-write-wins as it is today. **This exact mechanism has never been exercised by the real dev-DB tests** — TEST A-L (implementation.md) all ran against Quick Memo, a Class-1 screen whose canonical write (a one-time `INSERT`, no concurrent-edit surface for a not-yet-existing row) never goes through the CAS gate at all. **This is a genuine, previously-unstated verification gap**: the very mechanism that would make Class-2 canonical writes conflict-safe has design-level backing (db-design §4) but zero dev-DB evidence yet — flagged here and again in §12 (test strategy must add this as its own required test for the *first* Class-2 screen migrated, not assumed to work by extrapolation from Quick Memo).

| Scenario | 위험 여부 | 현재 방어 장치 | Quick Memo reference로 해결 가능? | 추가 guard 필요 여부 |
|---|---|---|---|---|
| **A — autosave 중 Save 클릭** (Class 1) | Low, by construction | Final Save reads current in-memory React state directly (not the autosave buffer) — the freshest keystroke is already reflected regardless of whether the debounce has fired yet, confirmed by re-reading Quick Memo's `handleSave()` call shape (implementation.md §2-3). | Yes — this is exactly how Quick Memo already behaves. | No additional guard needed for Class 1. **Class 2**: "Save" here means the new optional `flush({source:'final'})` action — the in-flight-request-collapsing rule (architecture Ch.6) already prevents a duplicate concurrent request; not yet dev-DB-tested for a Class-2 screen specifically (see intro above). |
| **B — Save 중 autosave 발생** | Low (Class 1: different write targets entirely, no shared row); Medium-untested (Class 2: same write target, relies on the in-flight-collapsing rule) | Architecture Ch.6's "never more than one in-flight request per field" rule. | Partially — Quick Memo's Class-1 shape doesn't exercise the Class-2 version of this scenario at all. | **Yes for Class 2**: add a dedicated test (§12) for "manual final-save flush fires while an autosave debounce timer is also about to fire for the same field" on the *first* Class-2 screen migrated, before trusting this scenario is actually safe in practice. |
| **C — Save 성공 후 오래된 autosave 도착** | Low, **by design** (this is exactly what the CAS mechanism is for) | Version compare-and-swap (db-design §4/architecture Ch.9) — a stale write (built from an old `version_no`) is rejected outright once a newer version has landed, regardless of arrival order; it cannot silently revert newer content. Dev-DB-verified for the draft/version layer (TEST K, real 2-tab race). | Yes for the draft/version layer. **Not yet verified for the canonical layer** (Class 2's "canonical write gated by CAS" — same untested-mechanism gap as row A/B). | Yes for Class 2 — same test recommendation as row B, specifically checking that a late-arriving stale request cannot revert a canonical field that a newer write already updated. |
| **D — Save 실패 후 autosave 성공** | Low for Class 1 (dev-DB-verified, TEST J: real 404 on canonical insert, draft/title/content retained, failure banner shown, no false success) | Canonical failure and draft/version bookkeeping are independent for Class 1 — a failed Final Save does not corrupt or clear the still-healthy draft. For Class 2, "Save" and "autosave" are the same operation, so this scenario collapses into ordinary retry (§ architecture Ch.12), not a distinct race. | Yes, directly (TEST J is exactly this scenario for Class 1). | No additional guard identified. |
| **E — 페이지 이동 중 autosave** | Medium — **defense exists in code intent (unmount flush, architecture Ch.6) but is not independently dev-DB-tested** (§5's own finding: not itemized as its own TEST A-L row; Quick Memo's popup-window "unmount" is unusually conflated with "window close," already covered by the durable local buffer, so its TEST A-L coverage doesn't prove a normal Next.js route-unmount case). | Unmount-flush logic (architecture Ch.6), as-built per the hook's stated design (implementation.md §3), but not empirically exercised by any of TEST A-L. | No — Quick Memo's own architecture sidesteps needing this exact case tested. | **Yes** — a dedicated "navigate away mid-debounce" test (§12) is required for the *first* normal (non-popup) screen migrated (a strong Phase-A candidate specifically to close this gap early, before Phase B/C/D depend on it). |
| **F — 두 탭 동시 수정** | Low for the draft/version layer (dev-DB-verified, TEST K, both `keep-mine`/`take-theirs` resolution paths real) | CAS + conflict UI (architecture Ch.13, db-design §4). | Yes for the draft/version layer. **Not yet verified for a Class-2 canonical row** — same "never tested for canonical" gap as rows A/B/C. | Yes for Class 2 — the *first* Class-2 screen's test plan (§12) should include a real 2-tab conflict specifically on its canonical field, not just the draft/version tables. |

---

## 9. 7일 History 적용 범위

**General rule (unchanged from architecture Ch.8/14, re-affirmed against the as-built dedup mechanism, §5)**: a `content_versions` row is created on **every successful sync whose content-hash differs from the immediately-preceding version**, not only on canonical/Final Save — Final Save (`source='final'`) is the one case that **always** inserts regardless of the hash-dedup rule. This applies uniformly to every surface that gets a real content field registered as a `field_key` — no per-screen exception is needed to the *rule itself*; what varies per screen is whether it's **worth** registering a field for history at all (below).

**35-surface applicability, by category (§2), not repeated row-by-row where the answer is uniform:**

| Category | History 필요 여부 | Version snapshot 크기 적절성 | 7일 보존 대상 | Recovery 가치 |
|---|---|---|---|---|
| **PILOT-READY** (14) | Yes for the 9 real content-editing surfaces (#2/#4/#6/#11/#13/#14/#28/#31/#35); **No** for the 5 trivial/non-editor rows (#3/#19/#23/#30/#33 — delete-only or not-a-content-editor, nothing to snapshot). | Small — single short text/JSON fields (memo title+content, sketch card text, a task title). No compaction needed at this app's scale (architecture Ch.14, re-affirmed, no new evidence this STEP changes that judgment). | Yes, for the 9 real editors. | High for #2/#4 (memo content), medium for the rest (mostly simple field edits where "recovery" mainly matters for the refresh/close case, not deep history browsing). |
| **COMPLEX** (14) | Yes, for every registered entity_type on these screens (each entity_type is its own history stream, §1a) — multi-entity_type screens (#12/#15/#18) get one independent history stream per entity_type, not one merged screen-level history. | Small-medium — task/annual-goal/feedback notes are longer free text than PILOT-READY's simple fields, but still well within architecture Ch.14's "small enough at this app's scale" judgment; no compaction required for v1. | Yes. | High for the note-type entity_types (#12's `task_note`, #15's `annual_goal_task_note`, #18's `one_on_one_feedback`) — these are exactly the fields audit flagged as having zero recovery today (LEVEL2, no draft). |
| **JSONB-CONFLICT** (4) | Yes, **but only once Track B's normalization exists** (§4/§7 finding #1) — history for an individual note only becomes meaningful once each note has its own stable `entity_id`; registering history against the *whole jsonb column* today would snapshot the entire array on every change, which is both wasteful and doesn't answer "what did note X look like 3 days ago" (the array's other notes would dominate every diff). | **Not applicable until Track B lands** — this is a real reason (not previously stated this explicitly) that Phase D (§3) should design history alongside normalization, not attempt to bolt history onto the raw jsonb column first. | Deferred until Track B. | High once available — these 3 tables carry the app's confirmed CRITICAL/P0-class concurrent-edit risk (§4), making per-note history and restore particularly valuable here, not just a nice-to-have. |
| **HIGH-RISK** (3) | Deferred — no history design should be built against `obj_*`/`objective*_v2` (#16/#17) before Ch.19's product decision (registering history against a schema that might be dead code is wasted design work), and #21's singleton-row template should get history only after its `upsert` correctness fix ships (versioning a row that can still duplicate itself is not a meaningful "history" yet). | n/a until unblocked. | Deferred. | Deferred. |

**일시적 UI state 제외 (instruction 10's explicit carve-out), re-confirmed against §6's full localStorage-key inventory**: every key in §6's "not migrated" row (`home_tl_*`, `dash_st_cols_v9`, `memos_open_id`, `todo_assignees`, `oneOnOne_nextQuestions`, `PARTS_KEY`, `schedule_day_order`, `viewportKey(boardId)`, plus `sessionStorage`-based `project-tab`/`annual-goals-tab`/`_qmc`) is UI layout/preference/cross-navigation state, not user-authored content — **excluded from history entirely**, matching architecture Ch.10's own reasoning ("it was never a data-loss risk to begin with"). No `entity_type`/`field_key` should ever be registered for these, regardless of how easy Option C's genericity makes it to do so (architecture Ch.22's own "dumping ground" risk warning, re-affirmed here as the concrete reason to hold this line).

---

## 10. Recovery UX 표준화 (설계만 — UI 구현하지 않음)

States below use the **as-built** status enum (§5) as the primary axis, with architecture Ch.15's 3-surface UX design (inline indicator / settings panel / per-document history) as the presentation layer — no UI is built in this STEP, this section only specifies intent.

| Common state | 사용자에게 보여줄 의미 | 보여줄 정보 | 다음 행동 | 데이터 안전성 |
|---|---|---|---|---|
| **자동저장 중** (`local-saving`/`pending-sync`/`syncing`) | "지금 입력한 내용을 저장하고 있습니다" | A subtle in-progress indicator — distinguishing "아직 로컬에만 있음" (`local-saving`/`pending-sync`) from "서버로 전송 중" (`syncing`) is worth keeping as 2 sub-states in the UI copy even though both read as "저장 중" at a glance, since a user who refreshes during `local-saving` needs different reassurance ("아직 전송 전이지만 이 브라우저에는 안전합니다") than one who refreshes during `syncing` ("전송 중이었습니다, 다음 로드 때 확인해 드릴게요"). | None required — this is an informational state. | Safe — content already lives in the durable local buffer regardless of which sub-state. |
| **자동저장됨** (`saved`) | "방금 입력한 내용이 서버에 안전하게 저장되었습니다" | Last-synced timestamp (relative, e.g. "방금 전"). | None required. | Safe — confirmed round-trip to the server, matching the version history. |
| **재시도 중** (`retrying`) | "저장에 실패해서 다시 시도하고 있습니다 — 입력하신 내용은 안전하게 보관 중입니다" | Retry attempt count or a simple spinner; the failure reason (`network`/`server_error`/`auth_expired`/`quota_exceeded`/`unknown`, db-design §2) should shape the copy specifically for `auth_expired` ("재로그인이 필요할 수 있습니다"), matching architecture Ch.7 scenario G — **not yet dev-DB-tested** for the `auth_expired` sub-case specifically (TEST E/F/H exercised generic network failure only, per implementation.md §5) — flagged as an Open Issue (§17), not assumed working. | User may keep typing; a manual "지금 재시도" affordance (architecture Ch.15.A) is optional, not required, since retry is already automatic. | Safe — local buffer retained throughout (dev-DB-verified, TEST E/F/G/H). |
| **저장 실패 · 로컬 보관** (`error`) | "서버 저장에 계속 실패하고 있지만, 입력하신 내용은 이 브라우저에 안전하게 보관되어 있습니다" | The specific failure reason, in plain language; whether this is Class 1 (canonical Final Save also failed, e.g. TEST J) or Class 2 (the autosave debounce itself is failing) changes the copy's urgency — Class 1's failure only affects the *confirmed/final* state, Class 2's failure means there is currently no server copy of the field at all. | User can wait for auto-retry or, if it's clearly `auth_expired`, be prompted to re-login. | Safe as long as the browser/tab isn't closed *and* the local buffer isn't cleared by a quota-exceeded event (architecture Ch.7 scenario J) — this is the one sub-case where "safe" has a real caveat, worth surfacing distinctly in copy if `failure_reason='quota_exceeded'`. |
| **복구 가능한 draft 있음** (`recovered`) | "이전에 입력하다가 저장되지 않은 내용이 있습니다 — 지금 보시는 내용과 다를 수 있습니다" | A preview of the recovered content vs. what's currently shown (architecture Ch.15's banner design). | User explicitly applies (적용) or discards (무시) — **never silently auto-applied** (architecture Ch.15.D's restore principle, extended here to recovery too, consistent with the as-built Quick Memo behavior, implementation.md §3 "does **not** auto-apply it"). | Safe — nothing is lost either way; declining to apply just means the buffer keeps holding the recovered value until explicitly discarded. |
| **충돌 발생** (`conflict`) | "다른 창/기기에서 이 항목이 방금 변경되었습니다" | Both the server's current content and the user's own unsent content, side by side or toggle-able (architecture Ch.15.C's diff-indicator idea, not required to be a full diff view for v1). | `keep-mine` (re-attempt, overwriting) / `take-theirs` (adopt server content, discard local) — both dev-DB-verified as real, working paths (TEST K). No automatic merge. | Safe — neither choice silently loses data; `keep-mine` explicitly overwrites (user's informed choice), `take-theirs` explicitly discards the local unsent edit (also an informed choice, not a silent one). |

**Where this differs from a literal reading of architecture Ch.15 (flagged, not silently reconciled)**: Ch.15 was written before the as-built status enum existed (§5) and before the Class-1/Class-2 distinction's downstream effects on copy were traced this precisely (§8) — this section is the reconciliation, and should be treated as authoritative over Ch.15's original prose for implementation purposes, per the same principle established in §5.

---

## 11. 테스트 전략

**Base checklist, named to match implementation.md's own TEST A-L lettering** so a future implementer can literally reuse that test script's structure rather than inventing new names: **A** typing→local write, **B** debounce collapses a keystroke burst to 1 request, **C** refresh mid-typing→draft recovery, **D** server sync success→row-level DB verification, **E** sync failure→local draft retained, **F** failure→automatic retry→recovery, **G** failure→refresh→input still recovered, **H** offline→typing→online→immediate retry, **I** canonical Save success→draft lifecycle correct, **J** canonical Save failure→draft/input preserved, **K** 2-tab conflict→both resolution paths, **L** P0-class regression check (draft/input preserved on a real, not synthetic, canonical failure). Three **new** letters this STEP adds, grounded in gaps §5/§8 found that TEST A-L (Quick Memo only) did not cover: **M** unmount-flush (navigate away mid-debounce, on a normal route — not a popup window), **N** canonical write actually rejected/gated when built from a stale `version_no` (the Class-2 "canonical-write-through-CAS" mechanism, db-design §4 Step 1→2, never yet exercised — §8), **O** `auth_expired` failure-reason classification specifically (architecture Ch.7 scenario G, not exercised by TEST A-L's generic-network-failure simulation).

| Category | 필수 테스트 (instruction 12's own differentiation) | 근거 |
|---|---|---|
| **PILOT-READY** | Minimum core: **A, B, D, E, F, I, J** (or the trivial-screen subset — n/a for #3/#19/#23/#30/#33). **M** is also required once, on the *first* PILOT-READY screen migrated after Quick Memo, specifically to close the unmount-flush verification gap (§5/§8) before any COMPLEX/JSONB-CONFLICT phase assumes it works. | Instruction 12: PILOT-READY gets "최소 핵심" — but M is promoted to mandatory-once here because it's a real, currently-open gap that every later phase implicitly depends on. |
| **COMPLEX** | Core (A/B/D/E/F/I/J) **plus** race/recovery: **C, G, H, K, N** — **N is mandatory for the *first* COMPLEX (Class-2) screen specifically** (§8's finding: the canonical-write-gated-by-CAS mechanism has zero dev-DB evidence yet, and every Class-2 screen relies on it structurally, unlike Quick Memo). **O** required at least once across this category (any screen is fine) to close the `auth_expired` gap. | Instruction 12: COMPLEX gets "핵심+race/recovery" — N/O map directly onto "race" (multi-writer canonical correctness) and are new requirements this STEP's own analysis surfaced, not carried from the prior docs. |
| **JSONB-CONFLICT** | **Track B tests precede any Track A test** (instruction 12's explicit ordering) — a data-migration row-count comparison before/after the jsonb-explode (architecture Ch.20 Phase 3), then functional re-verification of all 3 `meetings.notes` write surfaces (#7/#26/home widget) against the new child table, **before** A-O are run against the now-normalized per-note entities. Running A-O against the *raw jsonb column* is explicitly not attempted (§4/§7 finding #1 — no meaningful `entity_id` exists for an individual note pre-normalization). | Instruction 12: "JSONB-CONFLICT=Track B 테스트 선행" — literal application. |
| **HIGH-RISK** | **별도 승인 → 설계 → 검증 후 rollout** (instruction 12's own words) — no test checklist is written for #16/#17/#21 in this document at all, because writing one would imply a migration design exists, which this plan explicitly does not produce for HIGH-RISK surfaces (§2/§3). | Instruction 12's literal instruction; consistent with §3's Phase E treatment. |

**Not every test is forced onto every screen (instruction 12's explicit anti-goal)** — e.g. #31 (Sketch Canvas) already has its own correct optimistic-rollback/drag-stop-only behavior (audit §12); its test plan should focus on A/B/D/I (does the Core correctly add version history on top of already-correct behavior) rather than re-litigating E/F/G/H, which Sketch Canvas's existing Class-A design already handles differently (checked-error + rollback, not retry-with-backoff) — forcing the generic retry-test shape onto it would test the wrong mechanism.

---

## 12. Dev DB 검증 순서

**Sequence per screen, unchanged in principle from db-design §7/§20's own plan, restated as an explicit ordered checklist (instruction 13):**

```
1. 코드 변경 (한 화면, 하나의 useAutosave() 호출부만 — 여러 화면 동시 변경 금지)
2. Local test (tsc --noEmit, eslint, 브라우저에서 pilot flag ON 상태로 수동 조작)
3. Dev DB 연결 확인 (아래 "Phase 시작 전 확인목록" 전체 통과 후에만 진행)
4. autosave_drafts 검증 (해당 entity_type/entity_id/field_key로 실제 행이 생성/갱신되는지, verify-autosave-dev.mjs류 스크립트로 직접 조회)
5. content_versions 검증 (해시-dedup 규칙대로 버전이 쌓이는지, source 태그가 맞는지)
6. failure/recovery 검증 (§11의 카테고리별 테스트 체크리스트 실행 — E/F/G/H/J 최소, COMPLEX 이상은 K/N/M/O 포함)
7. 전부 PASS → 다음 화면으로 진행 (실패 시 그 화면 안에서 해결 — 다음 화면으로 절대 넘어가지 않음)
```

**Pre-flight blocker found in this STEP, applies before step 3 of *every* phase after Quick Memo**: db-design §24 recorded that, at the time of the Quick Memo pilot, **every canonical table in the current dev pilot project (`vuxxanxuuwoduxmslrwh.supabase.co`) returned `404 PGRST205`** ("Could not find the table ... in the schema cache") — a PostgREST schema-cache issue, not a missing-table issue (the tables exist; PostgREST's cache of the schema was never refreshed after they were created). This forced TEST I's canonical `quick_memos` insert to be mocked at the `fetch` layer rather than genuinely exercised end-to-end. **No dev/build command was run in this STEP to check whether this has since cleared** (this STEP's absolute rules forbid running dev/build commands) — so this must be **re-checked as the very first action of Phase A's next real screen** (a plain `select` against e.g. `tasks` from the dev project, exactly as db-design §24 diagnosed it originally), not assumed fixed. If still present, it must be resolved (a PostgREST schema-cache reload, or a fresh dev-project bootstrap) **before** step 3 can produce a meaningful result for *any* canonical write, on *any* screen — this is arguably the single most concrete, immediate blocker this entire plan depends on (see the final report's "가장 중요한 rollout blocker").

**Phase 시작 전 확인목록 (per instruction 13, every phase, every screen)**:
- [ ] Production URL이 사용되고 있지 않은지 확인 (browser network tab 또는 the `verify-autosave-dev.mjs`-style script's own target URL log)
- [ ] Dev URL이 실제로 맞는지 확인 (`NEXT_PUBLIC_SUPABASE_DEV_PILOT_URL` matches the intended dev project, re-read from `.env.development.local` each session, never hardcoded — matching `devPilotClient.ts`'s own documented contract, re-read in full this STEP)
- [ ] Production key가 사용되고 있지 않은지 확인
- [ ] Dev key가 실제로 맞는지 확인
- [ ] Supabase client가 **module-level singleton**이 아닌지 확인 for any *new* differently-configured client (`{ isSingleton: false }`) — re-confirmed this STEP that `devPilotClient.ts` is the **only** place in the codebase that needs this flag (§ intro); any *new* dev-only client introduced by a future phase must repeat this same guard, and this checklist item exists specifically so that repetition isn't forgotten.
- [ ] `.env.local`(production) vs. `.env.development.local`(dev pilot) 혼동 여부 확인 — re-confirm via the dev-server startup log (`Environments: .env.development.local, .env.local`, implementation.md §2) that `.env.development.local` is actually being loaded, and that `next build`/`next start` (which never load it) are not what's being tested.
- [ ] (new, this STEP) PostgREST schema-cache gap (above) re-checked and confirmed cleared for the specific canonical table(s) this screen touches, before trusting any "PASS" on step 4/5 above.

---

## 13. Production 안전장치

**The Phase-2 `createBrowserClient()` singleton bug (implementation.md §2), re-affirmed as this plan's central safety precedent**: `@supabase/ssr`'s `createBrowserClient()` caches a module-level singleton and silently returns it on every later call regardless of the url/key arguments passed, unless `{ isSingleton: false }` is explicitly set. This caused the dev-pilot client to initially and silently **be** the production client, and the first `autosave_drafts` request went to the real production URL (harmlessly 404'ing only because that table didn't exist there). Fixed in `devPilotClient.ts` with `{ isSingleton: false }` (re-read in full this STEP, confirmed in place, lines 47-57).

**Similar-pattern search performed this STEP (instruction 1's explicit ask — "유사 패턴이 있는지 찾아서 포함")**: `Grep "createBrowserClient|createClient\("` across all of `src/` (results in this document's intro) found **33 call sites, every one of which calls the same `createClient()` from `src/lib/supabase/client.ts`**, which always passes the identical `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` pair (confirmed by reading the 8-line file directly, no branching, no conditional env var selection). **The singleton pattern is provably harmless at every one of these 33 call sites**, because none of them ever asks the shared module cache for a *different* client — the bug only manifests when two different url/key pairs are requested from the same module cache, and `devPilotClient.ts` is the **only** file in the entire codebase that does this. **No second occurrence found.** This is a complete, re-verified negative result, not an assumption carried from the prior docs.

**Production-safety checklist, applying to every future phase (§3) that introduces or touches any dev/pilot-specific client code — verification method documented here, nothing executed in this STEP**:

| Checklist item | Verification method | Status as of this STEP |
|---|---|---|
| Client 생성 방식 | Read the exact file introducing any new Supabase client — does it call `createBrowserClient` directly, or go through the shared `createClient()`? | `devPilotClient.ts` is the only non-standard case; documented and fixed. |
| Module-level singleton 여부 | Check whether `{ isSingleton: false }` is passed whenever a *second, differently-configured* client is created anywhere in the same JS module graph. | Confirmed present in `devPilotClient.ts`; no other differently-configured client exists today (re-verified this STEP). |
| Runtime config 고정 시점 | Confirm env vars are read via `process.env.NEXT_PUBLIC_*` at call time, not cached at module-load time in a way that could stale-capture a wrong value across HMR/dev-server restarts. | Not independently re-verified this STEP beyond reading the two client files directly — flagged as an Open Issue (§17) if a future phase introduces more complex client-construction logic. |
| Dev URL 실제 사용 여부 | Browser network tab (or a `verify-autosave-dev.mjs`-style script) confirms requests target the dev project's own hostname. | Confirmed methodology in implementation.md §2/§7; not re-run in this STEP (no dev/build command permitted). |
| Production URL 요청 0건 여부 | Post-fix network-log scan for the production hostname across a full test session. | Confirmed methodology and a clean post-fix result in implementation.md §2/§7 (Phase 2 only); must be re-run fresh for every subsequent phase, not assumed to still hold from Phase 2's own run. |
| Production key 미사용 여부 | Confirm `.env.development.local`'s dev-pilot keys are distinct from `.env.local`'s production keys, and that the dev-pilot code path never falls back to reading the production key names. | `getDevPilotClient()`'s own explicit same-URL guard (`devPilotClient.ts` lines 41-45, re-read this STEP) is a real, working defense-in-depth check for this specific failure mode. |

**No new production-risk pattern was found in this STEP beyond the one already documented and already fixed.** This section's contribution is the **negative-result re-verification** (33/33 call sites clean) and formalizing the checklist as a per-phase gate, not a new finding of risk.

---

## 14. Canonical Tables RLS Security Audit — 별도 작업으로 재확인 (독립적, autosave rollout의 dependency 아님)

**Restated verbatim from db-design §9/§22, not re-derived, not re-prioritized (per this STEP's explicit instruction to carry the existing priority forward unchanged):**

> Autosave RLS가 안전하더라도 기존 canonical table의 RLS weakness는 별도로 존재한다. Autosave RLS의 안전성과 기존 canonical table의 접근통제는 서로 다른 보안 문제이며, 하나의 PASS가 다른 하나의 PASS를 의미하지 않는다.

**Scope (db-design §21, unchanged)**: all ~41 existing canonical tables — 28 documented (audit §6a) + 13 undocumented (audit §6b). **This document does not touch, test, or re-prioritize any canonical table's RLS** — no canonical RLS was read, queried, created, altered, or dropped while producing this STEP (verified in §18 below).

**Priority list, carried forward exactly as db-design §21 already established (instruction 15 — "재산정 금지")**:

| Priority | Tables |
|---|---|
| **P0** | `one_on_ones`, `my_feedback`, `period_journals`, `members` |
| **P1** | `annual_goal_tasks`/`annual_goal_task_notes`, `tasks`, `obj_*`/`objective*_v2` families |
| **P2** | `manual_achievements`, `persona_logs` |
| **P3** | All remaining tables (`quick_memos`, `meetings`, `learning_resources`, `sketch_*`, `agenda_*` structural tables, etc.) |

**Independence, restated for this rollout plan specifically**: the Canonical RLS Security Audit is **not** a dependency of any phase in §3 — Phase A-E can all proceed on their own schedule using the ownership-based `autosave_drafts`/`content_versions` RLS already designed and live-verified (db-design §8/§20a), regardless of whether or when the canonical audit above is ever started. Conversely, nothing in §3's phases performs any part of the canonical audit, and no phase's "PASS" (§11/§12) should be read as implying any progress on it. This document registers the task's continued existence and priority list — it does not schedule, staff, or begin it.

---

## 15. Rollout 완료 조건

**"완료"는 다음 전부가 참일 때만 선언한다** — 부분 완료를 완료로 보고하지 않는다는 원칙(사용자 지시)을 이 rollout 전체 레벨에도 동일하게 적용:

1. **Phase A-E의 35개 edit surface 전부**가 다음 중 하나의 확정 상태에 있다: (a) `useAutosave()`로 실제 migration 완료 + §11의 해당 category 테스트 전부 PASS + Dev DB 검증 완료, 또는 (b) 명시적으로 범위 제외(descope) 결정 + 그 이유가 문서화됨 (예: #30 Sketch board list — update 경로 자체가 없어 migration 대상 아님이라는 확정, 또는 #16/#17 — Ch.19 product decision이 "완전 폐기"로 결론나서 migration 대상에서 제외). **"아직 안 함"은 완료 조건을 만족하지 않는다.**
2. **JSONB-CONFLICT 4개 화면(#7/#20/#26/#29)**: Track B 정규화가 실제로 실행되고, `meetings.notes`의 3개 write surface 전부(#7/#26/home widget)가 새 child table을 통해 정상 동작함이 검증됨. Track A만 적용된 상태(정규화 없이 autosave만 씌운 상태)는 **완료로 간주하지 않는다** (§4의 명시적 non-conclusion).
3. **HIGH-RISK 3개 화면(#16/#17/#21)**: 각자의 blocker가 해소됨 — #16/#17은 Ch.19 product decision + 전체 line-level audit 완료, #21은 true `upsert` 수정 완료 및 검증. Blocker 해소 전 migration을 강행한 상태는 완료 조건을 만족하지 않는다.
4. **Phase 0 안전패치(P0-1/P0-2/P0-3, §1d)가 커밋됨** — 현재 uncommitted 상태로는 "완료"라 할 수 없다 (다른 세션/브랜치/배포에는 존재하지 않는 수정이므로).
5. **JSONB interim lock** (jsonb optimistic-lock, architecture Ch.21 — Track B 관련 후속 과제, STEP 3.5 patch 번호 체계와 무관) — Track B의 전체 정규화가 완료되기 전까지 최소한 이 interim patch라도 적용되어 있어야 "안전장치가 전혀 없는 상태"를 벗어났다고 할 수 있다. 현재는 JSONB interim lock도, 전체 정규화도 둘 다 미적용 상태 — 완료 조건 미충족.
6. **Legacy localStorage 정리 (Phase 6, §6)** — 모든 마이그레이션된 화면에 대해 호환성 read 기간이 지난 뒤 실행. Rollout 전체의 "완료"에는 이 정리까지 포함하되, §6에서 명시했듯 이는 가장 낮은 우선순위이며 지연되어도 데이터 안전성 자체에는 영향 없음(저장공간/코드정리 이슈).
7. **§11의 신규 테스트(M/N/O)가 최소 1회 이상 실제 Dev DB 대비 실행되어 PASS** — 이 3개는 이번 STEP에서 새로 발견된 검증 공백이며, 이들이 실행되지 않은 상태에서 "Autosave Core가 검증되었다"고 보고하지 않는다.
8. **Canonical Tables RLS Security Audit(§14)는 이 완료 조건에 포함되지 않는다** — 독립 작업이므로, autosave rollout이 위 1-7을 모두 만족해도 §14가 시작되지 않았다는 사실이 autosave rollout의 완료를 막지 않는다 (§14의 독립성 원칙 재확인).

**현재 상태 요약 (이 STEP 기준)**: 위 8개 조건 중 확실히 만족된 것은 없다 (Phase 2 pilot인 #2만 실질적으로 migration 완료 상태이나, 이는 35개 중 1개일 뿐이며 조건 1이 요구하는 "전부"에는 한참 못 미친다). 이 rollout은 **계획 단계**이며, 완료까지는 최소 6단계(Phase A-E + 정리)의 실제 구현·검증이 남아 있다.

---

## 16. Open Issues / 미결정 사항

**New findings from this STEP (not previously stated this precisely in the 4 prior documents):**
1. As-built `useAutosave()` status enum diverges from architecture Ch.6's original design (§5) — future phases should code against the as-built enum, not Ch.6's prose.
2. Quick Memo's `entity_id` (the per-window `qid`) never tracks forward to the real `quick_memos.id` created at Final Save — draft/version history for a saved memo is not reachable from the saved row itself (§7).
3. The canonical-write-gated-by-CAS mechanism (db-design §4 Step 1→2) — the very thing that would make Class-2 screens' canonical writes conflict-safe — has **zero dev-DB evidence**; Quick Memo (Class 1) never exercises it. Tests **N**/**M**/**O** (§11) are new requirements this STEP adds specifically to close this before Phase B relies on it.
4. Unmount-flush (architecture Ch.6) has never been independently dev-DB-tested on a normal (non-popup) route — Quick Memo's own architecture sidesteps needing it tested (§5/§8).
5. `auth_expired` `failure_reason` classification (architecture Ch.7 scenario G) has never been dev-DB-tested — TEST A-L only simulated generic network failure (§10/§11).
6. Draft-recovery priority between the new generic buffer and a screen's *pre-existing* legacy localStorage draft is untested for the majority case (a screen with **no** pre-existing draft) — only Quick Memo's redundant-legacy-draft case was exercised (§5).
7. Whether `entity_type='objective'`/`'objective_review'` should be split into finer per-table entity_types (e.g. `objective_group`/`objective_item`/...) once Ch.19 unblocks them — db-design §19's grounding does not address this ambiguity (§7).
8. Whether `user_preference`/`user_setting` (#27/#35) should get the generic autosave wrapping at all, or permanently keep their existing bespoke dual-write-with-localStorage-fallback UX pattern (§6).
9. ~~**Documentation inaccuracy found in `docs/autosave-implementation.md` §7**...~~ **STEP 6.5에서 정정 완료.** `docs/autosave-implementation.md`가 `MeetingNotesNew.tsx`/`MeetingSection.tsx`/`SearchToolbar.tsx`의 uncommitted diff를 "STEP 3.5 P0 patches"로 잘못 서술하던 문제(이 STEP 당시 `git diff` 직접 확인으로 발견 — 이 3개 파일은 저장/에러처리와 무관한 회의록 UI redesign)는 STEP 6.5 Precondition #4에서 해당 문서에 정확히 정정 완료됨(실제 STEP 3.5 P0 패치는 `tasks/[id]`/`meetings/[id]`/`MobileMemoSheet.tsx` 3건뿐이며, 이 3개 UI redesign 파일은 P0 patch 목록에서 완전히 분리됨). 추가로, `docs/autosave-architecture.md`/`docs/autosave-rollout-plan.md` 자체가 서로 다른 P0 번호 체계(architecture.md는 원래 P0-2=meetings+MobileMemoSheet 결합, P0-3=jsonb)를 쓰던 문제는 STEP 6.6에서 두 문서 모두 공식 체계(P0-1=tasks, P0-2=meetings, P0-3=MobileMemoSheet, jsonb는 "JSONB interim lock"으로 비-P0 명칭)로 통일 완료됨.
10. **A "STEP 3.5" is referenced by `docs/autosave-implementation.md` §7** ("pre-existing STEP 3.5 P0 patches from earlier in this project") but no `docs/autosave-step3.5*.md` or equivalent document was found or provided to this STEP. The actual P0-1/P0-2/P0-3 patches were independently confirmed by reading the `git diff` directly (§1d), so this plan does not depend on locating that document, but its absence is worth flagging for whoever manages this docs/ directory.
11. **The uncommitted Phase-0 patches (P0-1/P0-2/P0-3, §1d) are not yet committed to git.** This document recommends committing them as the first concrete action (§15 condition 4) but does not perform the commit itself (out of scope — this STEP's only permitted file write is this document).

**Carried forward, still unresolved (from audit/architecture/db-design, re-affirmed not re-solved here):**
12. The JSONB interim lock's interim optimistic-lock mitigation for the 3 jsonb `notes` columns (architecture Ch.21) — not applied (confirmed via `git diff` in this STEP — only `MeetingBriefWidget.tsx`/`schedule/page.tsx` remain fully unmodified, and `meetings/[id]`'s own patch adds error-checking only, not a version compare).
13. Track B's actual jsonb-explode-to-child-table data migration script — not designed in this or any prior STEP (architecture Ch.17's own explicit deferral, re-affirmed).
14. Whether the dev pilot project's PostgREST schema-cache gap (db-design §24) is still present — not re-checked in this STEP (no dev/build command permitted); must be the first action of Phase A's next real screen (§12).
15. Actual DDL/PK types for the 13 undocumented tables (audit §13 #1, architecture Ch.25 #1, db-design §15 #2) — still unknown.
16. `obj_*` vs. `objective*_v2` — which is live (architecture Ch.19, db-design §15 #6) — still an open product decision, blocking #16/#17 (Phase E).
17. `project_meetings` — view over `meetings` or a genuine separate table (audit §13 #2, architecture Ch.25 #2) — still unconfirmed.
18. Cleanup-job access model for `autosave_drafts`/`content_versions` retention deletes — `service_role` bypass vs. a narrowly-scoped `SECURITY DEFINER` function (db-design §13/§15 #5) — still undecided.
19. 7-day retention's "no keep-latest-forever floor" behavior (db-design §5/§15 #12) — still unconfirmed against user expectations.
20. Field_key/entity_type governance process — who reviews new registrations as Phase B/C/D roll out (architecture Ch.22/25 #10, db-design §15 #10) — still open.
21. Cross-device recovered-vs-conflict UX distinction (architecture Ch.22, db-design §16) — still not fully designed.
22. Whether `sketch_board` (#30) needs a rename feature at all (db-design §19's own negative-grep exclusion) — needs a product confirmation, not a code decision.
23. Live RLS testing was actually run against the real dev Supabase project directly, not local `supabase start` as db-design §20's original plan specified (db-design §20a's own documented deviation, judged equivalent and accepted there) — noted here only so a future implementer doesn't expect a local-only testing precedent that wasn't actually followed.

**Added by the follow-up "Quick Memo entity_id → canonical id rebind" design STEP (design-only — no source file was modified, no schema was created/altered, no production/dev data was written except throwaway rows created and reported on below; append-only per this STEP's own scope restriction):**

24. **Design review of item #2 above (Quick Memo's `qid` never tracking forward to `quick_memos.id`), against real dev-DB behavior.** Confirmed by direct code trace: the `qid` is a `crypto.randomUUID()` minted client-side in `src/app/memo/quick/page.tsx` (mount effect and the orphan-picker paths), persisted in the `quick_memo_drafts` localStorage map, and passed as `entityId` to `useAutosave()` unchanged through Final Save. Confirmed by live dev-DB query (`scripts/verify-autosave-dev.mjs`, entity_type='quick_memo'): `autosave_drafts`/`content_versions` rows are keyed entirely by this temp qid — no row's `entity_id` was ever observed equal to a `quick_memos.id`. A second, previously-undocumented consequence was found the same way: because `qidRef.current` is never regenerated after a successful save (`handleSave()` clears `title`/`content`/`tag` but not `qidRef.current`/`autosaveEntityId`), any further typing in the same popup window after a save continues to autosave under the **same** entity_id/version_no sequence as the just-saved memo (observed directly: `version_no` 9-13 for one qid continued past its own `version_no=8, source='final'` row) — i.e. today, a second memo typed in the same still-open popup shares autosave identity with the first, already-saved one. Any rebind fix must also mint a fresh qid immediately after a successful save, not only solve the canonical-id-linking problem in isolation.
    - **Live RLS/GRANT verification performed** (throwaway rows only, entity_type='quick_memo' — the only entity_type the dev DB's `CHECK` constraint in `supabase/autosave-migration-v1.sql` currently allows — entity_id prefixed `design-review-throwaway-`/`design-review-canonical-standin-`, created and inspected via a temporary script deleted immediately after use): `UPDATE`ing `entity_id` on a throwaway `autosave_drafts` row **succeeded** under the owner's own RLS. `UPDATE`ing (and separately `DELETE`ing) a throwaway `content_versions` row both returned **`42501 permission denied for table content_versions`** — a table-level `GRANT` denial, not merely an RLS row-filter miss — confirming db-design.md §3/§8/§13's "append-only, no UPDATE/DELETE policy for `authenticated`" design is actually enforced in the dev project, not just documented intent. **The throwaway `content_versions` row (entity_type='quick_memo', field_key='design-review-throwaway') could not be deleted by this session and remains in the dev DB** — flagged here honestly per this STEP's own cleanup instructions, exactly as db-design §8/§13 predicted would happen for any ordinary `authenticated` attempt.
    - **Conclusion carried into the design recommendation**: because `content_versions` cannot be `UPDATE`d (confirmed, not just designed), no rebind approach may rename `entity_id` on an existing `content_versions` row. The recommended shape instead (a) `UPDATE`s the existing `autosave_drafts` row's `entity_id` from the temp qid to the canonical id in the same CAS-gated write that lands the final content, and (b) `INSERT`s (never updates) a fresh `content_versions` row under the canonical id with `source='final'` — leaving pre-save autosave history permanently attached to the discarded qid (unreachable via the canonical id, ages out via normal 7-day retention, never surfaced in any UI today) as an accepted, disclosed limitation rather than a bug, since it is the direct and correct consequence of `content_versions`'s append-only guarantee — a guarantee this review's live test confirms is real, not aspirational, and should not be weakened to work around it.
25. **Generalization scope (judgment only, per this follow-up STEP's own task — not implemented or applied to any other screen's code).** This qid-to-canonical-id rebind need is not specific to Quick Memo: it applies to any screen that runs `useAutosave()` **before** the canonical row exists (a "create" flow using a temp client-side id), never to a screen that loads an already-real canonical id on mount (an "edit" flow) — the latter never needs a rebind. Within the 14 PILOT-READY (Phase A) surfaces in §2 above, the surfaces this could eventually matter for for canonical-table are: #4 Quick-memo mobile bottom sheet (same `quick_memos` table, its own independent creation flow), #6 Meetings list (create), #28 Learning list (create), and #30 Sketch board list (create) — **but only if/when a future phase adds a pre-save draft to any of them**; today none of the four has one (all four are LEVEL0/create-only per §1b, with no autosave-before-save behavior to rebind in the first place), so this is not an immediate blocker for Phase A as currently scoped. Recommendation: whatever rebind mechanism is eventually built for Quick Memo should be added to `useAutosave()` itself as a generic, reusable capability (not a Quick-Memo-only special case), consistent with the hook's existing generic-by-construction design (architecture Ch.5 Option C) — so any later "create" screen that adopts a pre-save draft can reuse it directly instead of re-solving the same problem. Not applied to any other screen's code in this follow-up STEP, per this STEP's own absolute rule restricting changes to Quick Memo only.

**Added by the "Precondition #2" implementation STEP that actually built items 24/25's recommendation (source files modified this time — scope restricted to Quick Memo + `useAutosave()` only, per that STEP's own absolute rules):**

26. **Item 24/25's recommended rebind mechanism is now implemented and dev-DB-verified, not just designed.** `useAutosave()` (`src/hooks/useAutosave.ts`) gained a `rebindEntityId()` capability, exposed through `flush({ source: 'final', rebindToEntityId })`: after the normal final-flush CAS-update/-insert succeeds, it `UPDATE`s the *existing* `autosave_drafts` row's `entity_id` from the temp qid to the canonical id (same CAS discipline — `entity_type`/`entity_id`/`field_key`/`user_id`/`client_scope`/`version_no` all matched, so it can only ever touch this exact draft), then `INSERT`s (never updates) a fresh `content_versions` row under the canonical id with `source='final'` — `content_versions` is never `UPDATE`d/`DELETE`d anywhere in this change, exactly as item 24's live RLS/GRANT finding required. `src/app/memo/quick/page.tsx`'s `handleSave()` now captures the real `quick_memos.id` from the canonical insert's `.select('id')`, passes it as `rebindToEntityId`, logs `quick_memo_autosave_rebind_failed` (qid/canonicalId/step/error/timestamp, no sensitive content) on rebind failure without rolling back the already-succeeded canonical Save, and — regardless of rebind outcome — immediately rotates `qidRef.current`/`autosaveEntityId` to a fresh `crypto.randomUUID()`, closing item 24's second finding (same-window continuation sharing identity with the just-saved memo). A related latent bug found and fixed in `useAutosave.ts` while wiring this: the entity-key bootstrap effect never reset `rowExistsRef`/`versionNoRef` when `entityId` changed within the same mounted hook instance — harmless before (entityId only ever changed once per mount, if at all) but would have broken the new post-save qid rotation (the next entity would incorrectly start from a stale CAS version, likely surfacing as a spurious `conflict`); now reset at the top of that effect. **Live dev-DB verification** (throwaway rows, cleaned up after — `quick_memos`/`autosave_drafts` test rows deleted, `content_versions` test rows left in place per its append-only design, 7 rows total: 4 under the discarded temp qid, 2 under the second same-window qid, 1 under the canonical id): real Final Save via the actual UI produced exactly the shape above — old-qid `autosave_drafts` row gone (rebound, not duplicated — same row `id`, only `entity_id` changed), canonical-id `autosave_drafts` row present, old-qid `content_versions` rows 1-4 untouched, new canonical-id `content_versions` row (`version_no=4`, `source='final'`) added, and typing a second memo in the same still-open popup started a clean new version_no sequence (1→2) under the rotated qid rather than continuing 4→5. Rebind-failure path verified at the DB/query level (fault injection against a nonexistent qid — 0 rows matched, no side effect) plus static code review (canonical Save is never rolled back on rebind failure); not exercised through the live UI itself, since forcing that through the real app would require deleting a row out from under an in-flight save.

27. **Phase A #1 (`#4 MobileMemoSheet.tsx`) 구현은 완료됐으나, UI 실행 경로(실제 코드 경로) 검증은 알려진 공백(known gap)으로 남아있다 — "메커니즘 검증"과 혼동하지 말 것.** 이 화면은 `window.innerWidth < 768 && window.matchMedia('(pointer: coarse)').matches`일 때만 마운트 시 자동으로 열리는데, 현재 사용 가능한 브라우저 자동화 도구(claude-in-chrome)에는 Chrome DevTools Device Mode에 대응하는 진짜 디바이스 에뮬레이션(viewport+touch 동시 설정) 기능이 없다 — `resize_window`는 순수 창 크기 조절만 하고 `pointer:coarse`에는 영향을 주지 않으며, `window.matchMedia`를 `javascript_tool`로 패치해도 새로고침 시 패치가 소실되어 mount effect가 원본 조건을 다시 읽는다(직접 검증 완료, 재현됨). 이 제약 때문에 자동화 도구만으로는 이 시트를 실제로 열 방법이 없다 — **React fiber 내부의 `useState` setter를 직접 호출해 게이트를 우회하는 방법이 시도됐으나, 이는 실제 코드 경로 실행으로 인정할 수 없다고 판단되어(사용자 결정) 기각됨.** 대신 dev-pilot 세션으로 `useAutosave.ts`의 `attemptSync()`/`rebindEntityId()`가 실행할 것과 동일한 REST 쿼리를 직접 재현하는 "메커니즘 검증"만 수행함(아래 참조) — 이건 "DB가 이 쿼리 패턴을 올바르게 처리하는가"만 확인하고, "`MobileMemoSheet.tsx`의 실제 코드가 그 쿼리를 정확히 만들어내는가"는 검증하지 못한다.
    - **메커니즘 검증 결과 (dev-pilot REST 직접 재현, MobileMemoSheet 코드 실행 아님)**: draft row 생성(ALLOW) → rebind UPDATE(같은 row id 유지, entity_id만 변경, ALLOW) → 기존 temp-qid row 소실 확인(중복 아님) → canonical id 기준 `content_versions` final INSERT(ALLOW) → `content_versions` UPDATE/DELETE 재확인(`42501 permission denied`로 여전히 차단, append-only 유지) → 타 사용자 RLS 스코핑 재확인(0 rows) — **전부 일치.** 이 메커니즘은 Quick Memo(`memo/quick/page.tsx`)에서 이미 검증된 것과 동일한 `useAutosave.ts` 코드를 그대로 재사용하므로 근본적으로 새로운 메커니즘이 아니며, 이번 재확인은 회귀 여부 점검에 가깝다.
    - **미검증(NOT VERIFIED)으로 남는 것**: TEST 1/3/4/5/6/9, S1~S5 전체 — `MobileMemoSheet.tsx`의 `handleSave()`/`useAutosave()` 배선이 실제 모바일 UI 경로를 통해 트리거됐을 때 올바르게 동작하는지는 검증되지 않았다. 이전 실행에서 이 항목들에 대해 "PASS"로 보고된 결과는 전부 fiber 우회로 얻어진 것이라 무효로 재분류됨(사용자 지시).
    - **재검증 방법**: 실제 물리 모바일 기기(또는 실제 터치 지원 태블릿)로 로컬 네트워크상의 dev 서버(`.env.development.local` 활성화 상태)에 직접 접속해서 진행하는 방법뿐이며, 이는 사용자의 직접 참여가 필요하다(자동화 불가로 확인됨). Phase A의 다른 화면 중 이 컴포넌트처럼 조건부 자동-오픈 UI 게이트(터치/뷰포트 감지)를 가진 화면이 있다면 동일한 제약이 반복될 것이므로, 이 gap과 그 확인 방법을 이 문서에 기록해 재발 시 참고하도록 한다.

---

## 17. 최종 검증 (자체 정합성 체크)

**Counts, re-tallied directly from this document's own tables (not re-asserted from memory):**

| Metric | Count | Source |
|---|---|---|
| `page.tsx` routes | 33 | Intro Glob, re-confirmed matches audit §2 |
| `layout.tsx` | 2 | Intro Glob |
| `route.ts` (API handlers) | 7 | Intro Glob |
| `loading.tsx`/`error.tsx`/`not-found.tsx` | 0 | Intro Glob+Grep |
| **Total edit surfaces** | **35** | §1a (rows 1-35) |
| **Total `entity_type` values** | **28** | db-design §19, re-cited in §1a; `sketch_board` explicitly excluded (no update call site) |
| PILOT-READY | 14 | §2 |
| COMPLEX | 14 | §2 |
| JSONB-CONFLICT | 4 | §2 |
| HIGH-RISK | 3 | §2 |
| Phase A | 14 | §3 |
| Phase B | 6 | §3 |
| Phase C | 8 | §3 |
| Phase D | 4 | §3 |
| Phase E | 3 | §3 |

**Identity check 1 (instruction 17's explicit requirement)**: PILOT-READY + COMPLEX + JSONB-CONFLICT + HIGH-RISK = 14 + 14 + 4 + 3 = **35** = total edit surfaces. ✅ **Holds.**

**Identity check 2 (instruction 17's explicit requirement)**: Phase A + B + C + D + E = 14 + 6 + 8 + 4 + 3 = **35** = total rollout-target surfaces. ✅ **Holds.**

**Cross-check 3 (this STEP's own addition — do the two partitions agree screen-by-screen, not just in total count?)**: re-walking §2/§3 row by row confirms Phase A = exactly the PILOT-READY set (#2,3,4,6,11,13,14,19,23,28,30,31,33,35 — 14 screens, identical membership); Phase B ∪ Phase C = exactly the COMPLEX set (#5,12,15,18,22,27 ∪ #1,8,9,10,24,25,32,34 — 6+8=14 screens, identical membership, split only by undocumented-table dependency per §3's own stated rationale); Phase D = exactly the JSONB-CONFLICT set (#7,20,26,29 — 4 screens); Phase E = exactly the HIGH-RISK set (#16,17,21 — 3 screens). **No screen was silently reassigned between §2's category and §3's phase.**

**No missing screen**: every one of #1 through #35 appears in exactly one row of §1a, exactly one category in §2, and exactly one phase in §3 — manually re-traced during this check, no gaps found.

**§14-§16 specificity check (instruction 17's explicit requirement that these sections match the earlier sections' concreteness)**: §14 cites db-design §21's exact table-level priority list (not a vague "audit RLS later"); §15 states 8 concrete, checkable completion conditions with an honest current-status summary (not "mostly done"); §16 lists 23 distinct, individually-sourced open issues (11 new to this STEP, 12 carried forward with their originating section cited) — none of the three sections is a placeholder paragraph.

**Was anything left un-migrated without explanation?** No — every HIGH-RISK/JSONB-CONFLICT surface has an explicit blocker and owner-action stated (§2/§3/§15); every trivial/non-editor surface (#3/#19/#23/#30/#33) has an explicit "why nothing to migrate" reason (§1c/§2), not a silent omission.

**This document does not report "완료" for the rollout itself** — per §15, 0 of 8 completion conditions are currently met (only #2's pilot is done, 1/35 surfaces). This STEP's own deliverable (the plan) is complete; the rollout it describes is not, and is not claimed to be.

---

## 18. 파일 변경 검증

**Final `git status --short` (re-run at the end of this STEP, compared against the baseline recorded in this document's intro):**

```
 M src/app/(app)/meetings/[id]/page.tsx
 M src/app/(app)/tasks/[id]/page.tsx
 M src/app/memo/quick/page.tsx
 M src/components/meetings/MeetingNotesNew.tsx
 M src/components/meetings/MeetingSection.tsx
 M src/components/meetings/SearchToolbar.tsx
 M src/components/memo/MobileMemoSheet.tsx
?? docs/autosave-architecture.md
?? docs/autosave-audit.md
?? docs/autosave-db-design.md
?? docs/autosave-implementation.md
?? docs/autosave-rollout-plan.md          ← the one new file this STEP was permitted to create
?? scripts/verify-autosave-dev.mjs
?? src/hooks/useAutosave.ts
?? src/lib/autosave/
?? src/lib/supabase/devPilotClient.ts
?? supabase/autosave-migration-v1-grants-fix.sql
?? supabase/autosave-migration-v1.sql
?? supabase/combined-schema-for-dev.sql
```

**Identical to the session-start baseline except for exactly one new untracked file: `docs/autosave-rollout-plan.md` (this document).**

**`git diff --stat` re-run, confirming byte-for-byte identical line counts to the session-start baseline**:
```
 src/app/(app)/meetings/[id]/page.tsx        |  53 +++++--
 src/app/(app)/tasks/[id]/page.tsx           |  22 ++-
 src/app/memo/quick/page.tsx                 | 238 ++++++++++++++++++++++++++--
 src/components/meetings/MeetingNotesNew.tsx | 132 +++++++++++++--
 src/components/meetings/MeetingSection.tsx  |  61 +++++--
 src/components/meetings/SearchToolbar.tsx   |  18 +--
 src/components/memo/MobileMemoSheet.tsx     |  14 +-
 7 files changed, 464 insertions(+), 74 deletions(-)
```

**Checklist (instruction 18), each verified directly, not asserted**:
- [x] 소스코드 변경 없음 — the 7 pre-existing diffs are byte-identical in size to the session-start baseline; this STEP only *read* them (via `git diff`) to ground §1d/§4/§8's findings, never edited them.
- [x] DB·migration 변경 없음 — no `supabase` SQL file was created, edited, or executed; the 3 existing `.sql` files under `supabase/` (`autosave-migration-v1.sql`, `autosave-migration-v1-grants-fix.sql`, `combined-schema-for-dev.sql`) are untracked leftovers from prior STEPs, untouched by this one (confirmed same `??` status, no diff possible for untracked files but file mtimes/sizes were not altered by any tool call this STEP made against them — this STEP never opened them).
- [x] 설정 파일 변경 없음 — no `.env*`, `package.json`, `tsconfig.json`, or similar file appears in the status output at all.
- [x] Package 파일 변경 없음 — same as above, confirmed absent from `git status`.
- [x] 기존 4개 autosave 문서 변경 없음 — `autosave-audit.md`, `autosave-architecture.md`, `autosave-db-design.md`, `autosave-implementation.md` all remain in their original untracked (`??`) state with no modification tooling ever invoked against them in this STEP (only `Read`).
- [x] 허용된 신규 파일은 `docs/autosave-rollout-plan.md` 하나뿐 — confirmed by diffing the full untracked-file list against the session-start baseline: the only addition is this document.

**No unexpected change found.**

---

# 최종 요약

이 STEP(STEP 6)은 **계획 수립**이며, **실제 구현은 수행하지 않았다.** 다음 STEP에서 실제 코드 변경(Phase A의 첫 화면 migration)이 시작되며, **사용자 승인 없이는 진행하지 않는다.** 이 문서가 기록한 8개 완료 조건(§15)과 23개 미결정 사항(§16) — 특히 (a) uncommitted Phase-0 패치의 커밋 여부, (b) dev 프로젝트의 PostgREST schema-cache gap 재확인, (c) `useAutosave()` 신규 테스트 M/N/O 실행 — 은 다음 STEP 착수 전 사용자와 먼저 확인되어야 할 항목이다.

---

# CONTENT/RICH TEXT 필드 Production 테스트 운영 원칙

**배경(STEP B-3 사고, 프로젝트탭 → 안건 상세 → 세부task note "타운홀 준비" 테스트 중 발생)**: note content(TipTap rich text) autosave 검증을 위해 실제 production의 기존 note에 테스트 문단을 추가했다가, 제거하는 과정에서 브라우저 DOM(Range 선택 + `execCommand('delete')`)을 직접 조작했고, TipTap/ProseMirror의 내부 문서 모델과 실제 DOM 편집 결과가 어긋나면서 원본보다 짧게(81자 부족) 잘려나간 상태로 canonical DB에 저장되어버렸다. 원본 전체 문자열을 사전에 별도 파일로 저장해두지 않고 브라우저 컨텍스트(`window` 변수)에만 잠깐 보관했다가 페이지 새로고침으로 소실된 것이 근본 원인이며, 이후 "화면상 새로고침해서 확인" 수준으로 복원 여부를 판단하려 한 것이 실제 손상을 놓친 원인이다. 사용자 승인 하에 해당 note는 현재 상태로 유지하고 더 이상 손대지 않기로 확정했다(그 note 자체를 다시 여는 작업 금지).

**이 사고를 계기로, title 등 짧은 plain text 필드와 content 등 긴 HTML/rich text 필드의 production 테스트를 다음과 같이 다르게 취급한다. STEP B-4 이후 이 저장소의 모든 STEP(Quick Memo, Meeting, 프로젝트탭 → 안건 상세 포함)에 적용한다.**

## 규칙

1. **plain text(title류)와 rich text(content류)를 다르게 취급한다.** title처럼 짧고 단순한 문자열은 화면에서 직접 읽어 기록해도 되지만, content처럼 길고 구조화된 HTML은 사람이 눈으로 옮겨적거나 화면 비교로 원본 여부를 판단하지 않는다.

2. **content류 필드를 production 테스트에 쓰기 전, 원본 전체를 반드시 별도 텍스트 파일로 저장한다.**
   - 브라우저 메모리(`window` 변수 등)에만 보관하지 않는다 — 새로고침/네비게이션으로 소실된다.
   - 원본 문자열 전체를 파일에 그대로 저장하고, 문자 수(length)와 체크섬을 같은 파일 또는 인접 metadata 파일에 함께 기록한다.
   - 이 파일 저장이 실제로 완료된 것을 확인하기 전에는 테스트를 시작하지 않는다.

3. **content/rich text 복원 시 브라우저 DOM을 직접 조작하지 않는다.** 금지: Range 선택 후 삭제, 마우스/키보드 기반 부분 삭제, TipTap/ProseMirror DOM 직접 조작, "화면상 비슷해 보이게" 수동 복원, 문자열 길이만 보고 원본 복원 여부를 판단하는 것. 복원이 필요하면 저장해둔 원본 파일의 정확한 문자열로 canonical UPDATE/PATCH를 한 번에 실행한다(부분 편집 아님).

4. **원본 파일로 복원하는 canonical UPDATE/PATCH도 production 데이터 변경이다.** 원본 파일이 있다고 해서 자동으로 복원을 실행하지 않는다 — 실행 전 반드시 사용자의 명시적 승인을 받는다.

5. **원본을 파일로 저장하지 못했다면 그 content 필드는 애초에 테스트 대상으로 선택하지 않는다.** 대신: (A) 다른 note/row로 테스트 대상 변경, (B) 신규 테스트용 note를 생성해 테스트(단, row 생성/삭제 자체가 production 데이터 변경이므로 사전 승인 필요), (C) production 테스트를 생략하고 다른 검증 방법 사용 — 중 하나를 선택한다.

6. **복원 후에는 저장해둔 원본 파일과 실제 canonical DB 값을 문자 단위로 비교한다.** 최소 문자 수·체크섬 일치, 가능하면 exact string 비교/diff까지 수행한다. "새로고침해서 보기에 맞다"는 복원 완료로 인정하지 않는다.

7. **원본과 DB 값의 정확한 일치가 확인되지 않으면 "RESTORED: YES"라고 보고하지 않는다.** `RESTORATION VERIFIED: NO` 또는 `RESTORATION: UNKNOWN`으로 보고하고 즉시 중단한다.

