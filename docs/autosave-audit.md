# Autosave System Audit

**Scope**: Static, read-only code audit. No source files were modified. No dev/build commands were run. No Supabase writes were performed. `.env.local` values were not read — only key names were confirmed to exist (masked).

**Method note**: This audit was produced by the coordinating agent's own direct reading of the Supabase migration history (all 40 SQL files), the auth/session layer (`src/proxy.ts`, `src/lib/supabase/*`), and the full route/component tree, combined with five parallel sub-agent passes each assigned a disjoint set of screens for full line-level tracing (home dashboard + widgets; meetings/agenda; tasks/subtasks/project-items/annual-goals/objectives; one-on-one/perf-review/learning/sketch; memos/journal/settings/shared editor infra). The coordinating agent then cross-checked the sub-agent findings against each other and against direct re-reads of the source, and corrected several factual errors introduced during drafting (see the corrections marked below, e.g. §9 risk #3, §1/§6 table counts). Two of the five sub-agents did not follow instructions to report back in plain text only and instead wrote directly to this file; their draft was kept as the base and then verified/corrected rather than discarded, since spot-checks confirmed the underlying file reads were real. `objective-review/page.tsx` (1459 lines) and `objectives/page.tsx` (889 lines) received only a partial/grep-level pass, not full line-level tracing — flagged explicitly in §13 rather than presented as fully verified.

---

## 1. Scope Summary

- Next.js 15 (App Router) + Supabase (`@supabase/ssr`) + TipTap rich-text editor, single-user/small-team internal HR planning dashboard.
- **33** `page.tsx` route files, **2** `layout.tsx` files, **0** `loading.tsx`/`error.tsx`/`not-found.tsx` files anywhere in `src/app`, **7** API route handlers (`route.ts`).
- **41** distinct Supabase tables are referenced from application code (ground truth via `grep -rhoE "\.from\('[a-z0-9_]+'\)" src/ | sort -u`, cross-checked against every `CREATE TABLE` in `supabase/schema.sql` + `schema_v2.sql`...`schema_v39.sql`). **28** of these have a corresponding `CREATE TABLE` somewhere in the 40 SQL files (21 belonging to this app + 7 belonging to the separated `team_log_*`/HRM project, confirmed unused here). The remaining **13 have no corresponding `CREATE TABLE` anywhere in the repo**: `agenda_sub_tasks`, `sub_task_notes`, `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs` — i.e. the checked-in migration history is materially behind the live/actual database schema (details in §6/§13). This is the single most important finding for STEP 2 planning: the repo's SQL files cannot be trusted as a complete source of truth for the current schema.
- There is **no dedicated autosave/draft/history/backup/version table anywhere in the database** (confirmed by grep across all 40 migration files for `draft|backup|history|revision|version_|autosave` — zero matches). Every "draft" or "recovery" mechanism in the app is implemented client-side in `localStorage`, scoped to a single browser profile. There is no cross-device or cross-browser draft recovery anywhere.
- There is **no `beforeunload`/`pagehide`/`visibilitychange` handler anywhere in the codebase that flushes a pending debounced save**. The only `beforeunload` listener found (`src/lib/quickMemo.ts:46,50`) is unrelated to saving — it only removes a window's heartbeat entry.
- The dominant autosave pattern across ~15 different editors is: **debounced `setTimeout` (300ms–1500ms) → fire-and-forget `supabase.from(table).update(...)` with the Promise not awaited/checked for errors → no cleanup of the timer on component unmount**. This exact shape recurs in at least 10 independent files (see §10).

---

## 2. Route Inventory

### `(app)` route group — authenticated app shell (`src/app/(app)/layout.tsx`)

| Route | File | Lines |
|---|---|---|
| `/` | `page.tsx` | 2239 |
| `/annual-goals` | `annual-goals/page.tsx` | 85 |
| `/annual-goals/tasks/[id]` | `annual-goals/tasks/[id]/page.tsx` | 494 |
| `/archive` | `archive/page.tsx` | 282 |
| `/completed` | `completed/page.tsx` | 489 |
| `/decisions` | `decisions/page.tsx` | 521 |
| `/intelligence` | `intelligence/page.tsx` | 216 |
| `/journal` | `journal/page.tsx` | 357 |
| `/learning` | `learning/page.tsx` | 7 |
| `/learning/[id]` | `learning/[id]/page.tsx` | 290 |
| `/meetings` | `meetings/page.tsx` | 7 |
| `/meetings/[id]` | `meetings/[id]/page.tsx` | 881 |
| `/memos` | `memos/page.tsx` | 893 |
| `/objective-review` | `objective-review/page.tsx` | 1459 |
| `/objectives` | `objectives/page.tsx` | 889 |
| `/one-on-one` | `one-on-one/page.tsx` | 703 |
| `/one-on-one/[memberId]` | `one-on-one/[memberId]/page.tsx` | 289 |
| `/one-on-one/[memberId]/[sessionId]` | `one-on-one/[memberId]/[sessionId]/page.tsx` | 328 |
| `/one-on-one/template` | `one-on-one/template/page.tsx` | 83 |
| `/perf-review` | `perf-review/page.tsx` | 558 |
| `/project` | `project/page.tsx` | 78 |
| `/project/items/[id]` | `project/items/[id]/page.tsx` | 872 |
| `/schedule` | `schedule/page.tsx` | 1221 |
| `/settings` | `settings/page.tsx` | 712 |
| `/sketch` | `sketch/page.tsx` | 7 |
| `/sketch/[id]` | `sketch/[id]/page.tsx` | 9 |
| `/subtasks/[id]` | `subtasks/[id]/page.tsx` | 487 |
| `/tasks` | `tasks/page.tsx` | 644 |
| `/tasks/[id]` | `tasks/[id]/page.tsx` | 1143 |

### Outside `(app)` group

| Route | File | Lines | Notes |
|---|---|---|---|
| `/login` | `src/app/login/page.tsx` | 111 | Supabase Auth form. Not a data-content editor — out of autosave scope. |
| `/memo/quick` | `src/app/memo/quick/page.tsx` | 645 | Popup window quick-memo editor. |
| `/mockup` | `src/app/mockup/page.tsx` | 290 | Static design reference page, no Supabase calls found. Not a real data screen. |
| `/reset-password` | `src/app/reset-password/page.tsx` | 138 | Supabase Auth form. Out of scope. |

Root layout: `src/app/layout.tsx`. App-shell layout: `src/app/(app)/layout.tsx` (renders `AppShell`/`Sidebar`/`TopNav`/`GlobalSearch`/`QuickMemoPanel`/`MobileMemoSheet`). **No `loading.tsx` or `error.tsx` exists anywhere**, confirmed by `find src/app -name loading.tsx -o -name error.tsx -o -name not-found.tsx` returning nothing.

### API routes (`route.ts`) — none of these touch Supabase

| Route | Purpose |
|---|---|
| `src/app/api/auto-draft/route.ts` | Calls Claude (`@anthropic-ai/sdk`, model `claude-haiku-4-5-20251001`) to turn a raw daily-log string into a formatted draft **string returned to the client**. No DB read/write. Falls back to a plain-text reformat if `ANTHROPIC_API_KEY` is unset (line 10-19). Confirmed via full read of the file. |
| `src/app/api/calendar/today/route.ts` | Google Calendar read (uses `GOOGLE_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN`). No Supabase reference (grep confirmed zero matches). |
| `src/app/api/extract-todos/route.ts` | AI-assisted todo extraction from text, returns JSON to caller. No Supabase reference. |
| `src/app/api/intel/{datago,kosis,riss,rss}/route.ts` | External data-feed proxies for the `/intelligence` page. No Supabase reference. |

---

## 3. Editor Inventory

"Editor screen" = a screen/overlay where the user types or manipulates content with an expectation that it is saved. Every route/component below was verified to contain at least one `supabase.from(...).insert/update/upsert/delete(` call or a `localStorage`-backed draft.

| # | Screen / surface | File(s) | Persists to |
|---|---|---|---|
| 1 | Home dashboard (quick task add, quick agenda add, daily journal, today/tomorrow todo checklists, weekly goals, timeline drag-blocks, memo preview) | `src/app/(app)/page.tsx` + `src/components/home/*.tsx` | `tasks`, `task_todos`, `agenda_items`, `agenda_sub_tasks`, `quick_memos`, `daily_journals`, `meetings` (notes jsonb), `schedule_items`-adjacent local state; heavy `localStorage` |
| 2 | Quick-memo popup window | `src/app/memo/quick/page.tsx` | `quick_memos`, `project_meetings`, `agenda_sub_tasks` |
| 3 | Quick-memo floating button (desktop) | `src/components/memo/QuickMemoPanel.tsx` | opens #2; own `localStorage` (button position only) |
| 4 | Quick-memo mobile bottom sheet | `src/components/memo/MobileMemoSheet.tsx` | `quick_memos` |
| 5 | Memos list (view/edit/inline-add per tag) | `src/app/(app)/memos/page.tsx` | `quick_memos` |
| 6 | Meetings list (create) | `src/components/meetings/MeetingNotesNew.tsx` (route `/meetings`) | `meetings` |
| 7 | Meeting detail (notes, description-append, attachments, links, category) | `src/app/(app)/meetings/[id]/page.tsx` | `meetings`, `meeting_agenda_links`, `agenda_items`, `attachments` |
| 8 | Project matrix (groups/items/sub-tasks) | `src/components/meetings/AgendaMatrix.tsx` (route `/project`) | `agenda_groups`, `agenda_items`, `agenda_sub_tasks` |
| 9 | Project item detail | `src/app/(app)/project/items/[id]/page.tsx` | `agenda_items`, `agenda_sub_tasks`, `sub_task_notes`, `attachments` |
| 10 | Sub-task detail | `src/app/(app)/subtasks/[id]/page.tsx` | `agenda_sub_tasks`, `sub_task_notes`, `attachments` |
| 11 | Tasks list (rename part, status, create, drag) | `src/app/(app)/tasks/page.tsx` | `tasks` |
| 12 | Task detail (notes, todos, attachments, meeting links, retrospective) | `src/app/(app)/tasks/[id]/page.tsx` | `tasks`, `notes`, `task_todos`, `attachments`, `task_meeting_links`, `meetings` |
| 13 | Annual-goals roadmap (drag reorder, inline edit) | `src/components/annual-goals/AnnualRoadmap.tsx` (route `/annual-goals`) | `annual_goal_items`, `annual_goal_tasks` |
| 14 | Annual-goals category rename | `src/app/(app)/annual-goals/page.tsx` | `annual_goal_category_labels` |
| 15 | Annual-goal task detail | `src/app/(app)/annual-goals/tasks/[id]/page.tsx` | `annual_goal_tasks`, `annual_goal_task_notes`, `attachments` |
| 16 | Objectives (quarterly) | `src/app/(app)/objectives/page.tsx` | `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries` |
| 17 | Objective review | `src/app/(app)/objective-review/page.tsx` | `objective_groups_v2`, `objectives_v2`, `objective_entries_v2` |
| 18 | One-on-one list + my-feedback log | `src/app/(app)/one-on-one/page.tsx` | `one_on_ones`, `my_feedback` |
| 19 | One-on-one member page (list + delete) | `src/app/(app)/one-on-one/[memberId]/page.tsx` | `one_on_ones` (read + delete only, no create/edit of content) |
| 20 | One-on-one session note editor | `src/app/(app)/one-on-one/[memberId]/[sessionId]/page.tsx` | `one_on_ones` |
| 21 | One-on-one global template | `src/app/(app)/one-on-one/template/page.tsx` | `one_on_one_template` |
| 22 | Perf-review (weekly/monthly journal + read-only digest) | `src/app/(app)/perf-review/page.tsx` | `period_journals` |
| 23 | Daily journal list | `src/app/(app)/journal/page.tsx` | `daily_journals` (delete only in this file) + reads `project_meetings` |
| 24 | Daily journal widget (home) | `src/components/home/DailyJournalWidget.tsx` | `daily_journals` |
| 25 | Decisions / persona logs | `src/app/(app)/decisions/page.tsx` | `persona_logs`, `user_settings` (persona profile fields) |
| 26 | Schedule/timeline editor | `src/app/(app)/schedule/page.tsx` | `meetings` (notes jsonb), `task_todos`, `agenda_sub_tasks` |
| 27 | Settings (org, menu order, hidden menus, members) | `src/app/(app)/settings/page.tsx` | `user_preferences`, `members` |
| 28 | Learning list (create) | `src/components/learning/LearningNew.tsx` (route `/learning`) | `learning_resources` |
| 29 | Learning detail (notes, tags, media type) | `src/app/(app)/learning/[id]/page.tsx` | `learning_resources` |
| 30 | Sketch board list (create/rename/delete board) | `src/components/sketch/SketchBoardList.tsx` (route `/sketch`) | `sketch_boards` |
| 31 | Sketch canvas (cards/frames/edges, drag position) | `src/components/sketch/SketchCanvas.tsx` (route `/sketch/[id]`) | `sketch_cards`, `sketch_frames`, `sketch_edges` |
| 32 | Completed / achievements tagging | `src/app/(app)/completed/page.tsx` | `manual_achievements`, `agenda_sub_tasks` (achievement_type) |
| 33 | Global search overlay (quick delete only) | `src/components/GlobalSearch.tsx` | `meetings` (delete only) |
| 34 | Text-selection capture overlay | `src/components/TextSelectionCapture.tsx` | `quick_memos`, `sub_task_notes` |
| 35 | User setting sync hook (shared) | `src/hooks/useUserSetting.ts` | `user_settings` |

**Total distinct editor surfaces: 35** (some map 1:1 to a route, several are shared components used by more than one route, e.g. `AgendaMatrix` backs `/project`, `AnnualRoadmap` backs `/annual-goals`).

**Pure view / non-editor screens** (verified — grep found no `insert/update/upsert` in the file):
- `/archive` (`archive/page.tsx`) — reads `meetings`, `daily_journals` only.
- `/intelligence` (`intelligence/page.tsx`) — zero Supabase references; pure external-feed reader.
- `/login`, `/reset-password` — Supabase Auth only, no content data.
- `/mockup` — static reference page.

---

## 4. Autosave Architecture Map

There are exactly **three distinct autosave "shapes"** used across the whole app. No central autosave utility/hook/library exists — each screen reimplements one of these shapes locally with its own `useRef<Timeout>`.

**Shape A — "debounce-then-fire-and-forget" (most common, ~15 occurrences)**
```
onChange(value) → setState(value)
              → clearTimeout(timerRef.current)
              → timerRef.current = setTimeout(() => { supabase.from(T).update({...}).eq('id', X) }, 300–1500ms)
```
The returned promise from `.update()` is not awaited by the caller and its `{ error }` is not inspected in most instances. No `useEffect` cleanup clears the timer on unmount. Examples: `src/hooks/useUserSetting.ts:33-39` (400ms), `src/app/(app)/meetings/[id]/page.tsx:100-110` (1500ms, `NoteAccordion.handleChange`), `src/app/(app)/tasks/[id]/page.tsx:421-431` (retrospective draft timer), `src/app/(app)/project/items/[id]/page.tsx:216-217,287-288` (description 500ms-class, sub_task_notes), `src/app/(app)/subtasks/[id]/page.tsx:161-162`, `src/app/(app)/annual-goals/tasks/[id]/page.tsx:128-129,191-192`, `src/app/(app)/one-on-one/[memberId]/[sessionId]/page.tsx:85-92`, `src/app/(app)/one-on-one/template/page.tsx:34-55`, `src/app/(app)/learning/[id]/page.tsx:83-92`, `src/app/(app)/perf-review/page.tsx:374-408` (300ms per-field, `period_journals`), `src/components/sketch/SketchCanvas.tsx:87-103` (card content, 500ms).

**Shape B — "localStorage draft + explicit manual save" (the more defensive pattern, ~7 occurrences)**
```
onChange(value) → setState(value) → localStorage.setItem(draftKey, value)   [every keystroke or debounced]
user clicks Save → supabase.insert/update(...) → if success: localStorage.removeItem(draftKey)
                                                → if error: keep draft, show retry message
```
Best example: `src/app/memo/quick/page.tsx` (`saveDraft` at line 197, `handleSave` at line 330 — this is the **only** editor in the app that (a) checks `error` on every write, (b) never deletes the draft on failure, and (c) additionally keeps a 3-day "archive" of successful saves as a second safety net, see §12). Also present, with progressively less sophistication: `src/app/(app)/meetings/[id]/page.tsx:370-378` (new-note-composer draft only, not existing-note edits), `src/app/(app)/memos/page.tsx:219-223,445-467` (three parallel draft timers), `src/components/home/DailyJournalWidget.tsx:321-332`, `src/app/(app)/one-on-one/page.tsx:289-324` (my-feedback draft), `src/app/(app)/decisions/page.tsx:87,166-167` (persona-log draft).

**Shape C — "optimistic update + rollback on error" (most robust, rare — only 4 occurrences, all in one file)**
```
setState(optimistic new value) → supabase.update(...).then(({error}) => { if (error) { setState(revert); alert(...) } })
```
Found **only** in `src/components/sketch/SketchCanvas.tsx`: `addCardToFrame` (448-454), `removeCardFromFrame` (457-465), `savePosition` (469-471, logs error), `handleConnect` (474-479). Drag-reorder operations in `src/components/annual-goals/AnnualRoadmap.tsx:351-368` and `src/components/meetings/AgendaMatrix.tsx:252-341` also check `error` and surface a 4-second toast (`setDndErr`), though without rolling back the reordered array itself.

No screen uses `requestIdleCallback`. No screen uses `sendBeacon`. `throttle` (as a named technique) is not used anywhere — the sketch canvas relies on drag-*stop* only firing once (§9, risk-free by construction), not throttling of drag-move.

---

## 5. Storage Map

### Supabase (server-of-record)
31 tables are read/written from `src/`. Full list and write-operations in §6.

### `localStorage` keys (exhaustive; grep-verified across `src/`)

| Key (exact or template) | File:line | Purpose |
|---|---|---|
| `quick_memo_drafts` | `src/app/memo/quick/page.tsx:21` | Per-popup-window quick-memo draft, keyed by a random `qid` inside the JSON blob |
| `quick_memo_archive` | `src/app/memo/quick/page.tsx:49` | 3-day, 50-entry retention of successfully-saved quick memos (safety net) |
| `quick_memo_heartbeats` | `src/lib/quickMemo.ts:12` | Multi-window liveness map, 5s staleness threshold |
| `quick_memo_btn_pos` | `src/components/memo/QuickMemoPanel.tsx:23,76` | Floating button drag position (UI only) |
| `meeting_draft_${id}` / `meeting_draft_title_${id}` | `src/app/(app)/meetings/[id]/page.tsx:332-333,372,377,469-470` | New-note-composer draft for a given meeting, cleared on successful `saveNote()` |
| `meetings_cat_order` | `src/components/meetings/MeetingNotesNew.tsx:75,97,107` | Category tab ordering (UI preference, not content) |
| `QUICK_DRAFT_KEY` (constant, memos page) | `src/app/(app)/memos/page.tsx:431,445-446,506,656` | New quick-memo-from-list draft |
| `inline_draft_${tag}` pattern (`inlineDraftKey`) | `src/app/(app)/memos/page.tsx:453,466-467,517,856` | Per-tag inline quick-add draft |
| `JOURNAL_DRAFT_KEY` constant | `src/components/home/DailyJournalWidget.tsx:272,331-332,414,418` | Daily-journal textarea draft |
| `home_tl_date`, `home_tl_pos`, `home_tl_dur`, `home_tl_task_pos`, `home_tl_task_dur`, `home_tl_extras`, `home_tl_extra_pos`, `home_tl_extra_dur` | `src/app/(app)/page.tsx:366-397` | Home timeline widget layout state, auto-reset when `home_tl_date` != today |
| `dash_st_cols_v9` | `src/app/(app)/page.tsx:976,1022` | Summary-card column layout preference |
| `memos_open_id` | multiple: `page.tsx:1347,2126,2197`, `TodayTodoWidget.tsx:238`, `memos/page.tsx:478,480`, `GlobalSearch.tsx:171` | Cross-navigation "open this memo" signal (one-shot, read-and-clear) |
| `todo_assignees` | `tasks/[id]/page.tsx:251,413`, `schedule/page.tsx:362` | Assignee-picker recent-list cache |
| `feedbackDraftKey(month)` | `src/app/(app)/one-on-one/page.tsx:294,299,314,316` | My-feedback form draft, per month |
| `oneOnOne_nextQuestions` | `src/app/(app)/one-on-one/page.tsx:235,239` | Cached suggested-questions list |
| `logDraftKey(activeTab)` | `src/app/(app)/decisions/page.tsx:149,166-167,196` | Persona-log form draft, per persona tab |
| `dashboard_org`, `dashboard_hidden_menus`, `dashboard_menu_order`, `dashboard_member_roles` | `src/app/(app)/settings/page.tsx:116-149,210-211,324-338`, `src/hooks/useOrgData.ts:25` | Settings — **dual-written** to both `localStorage` and `user_preferences`/`members` (see §10 for the two-tables-for-one-purpose issue) |
| `PARTS_KEY` (tasks page) | `src/app/(app)/tasks/page.tsx:91,195` | Part/team filter ordering |
| `schedule_day_order` | `src/app/(app)/schedule/page.tsx:416,562` | Day-column ordering preference |
| `viewportKey(boardId)` | `src/components/sketch/SketchCanvas.tsx:287,294` | Per-board pan/zoom camera position |
| `dashboard_org` (session fallback read) | `src/hooks/useOrgData.ts:25` | Read-only fallback when `user_preferences` row is empty |
| `project-tab` | `src/app/(app)/project/page.tsx:7,24,30` | Selected project-tab category (uses **`sessionStorage`**, not `localStorage`) |
| `annual-goals-tab` | `src/app/(app)/annual-goals/page.tsx:9,33,47` | Selected annual-goals category (`sessionStorage`) |
| `_qmc` | `src/lib/quickMemo.ts:55-56` | Popup cascade-position counter (`sessionStorage`) |

None of these use `indexedDB`. No key is ever pruned by a TTL sweep except `quick_memo_archive` (3-day/50-entry cap, §12) and the `home_tl_*` family (reset only when the stored date rolls over, not time-based).

---

## 6. Supabase Structure

### 6a. Tables with a `CREATE TABLE` in `supabase/*.sql` (documented, 28 total: 21 in current use by jin-dashboard + 7 belonging to the separated HRM/team-log project)

| Table | Migration | Key columns | updated_at trigger? |
|---|---|---|---|
| `members` | `schema.sql` | name, part, role (v22), archived_at (v18, soft-delete) | no |
| `tasks` | `schema.sql` | title, part, type, assignee_id→members, status, dates, work_months (v4), achievement_category (v4), retrospective jsonb (v9), schedule_tag (v14), short_name (v16) | yes (`schema.sql:62`) |
| `notes` | `schema.sql` | task_id→tasks, content, title (v11), edited_at (v5, **manually set by app, not a trigger**) | no |
| `attachments` | `schema.sql` | task_id/meeting_id (v13)/annual_goal_item_id/annual_goal_task_id (v23), name, type, url | no |
| `quick_memos` | `schema_v2.sql`, tag→text[] in v39 | title, content, tag text[] | no |
| `meetings` | `schema_v2.sql` | title, meeting_date, notes jsonb[], category (v19) | yes |
| `learning_resources` | `schema_v2.sql` | title, source, notes jsonb[], tags text[] (v7), media_type (v7) | yes |
| `task_meeting_links` | `schema_v3.sql` | task_id, meeting_id | n/a (link table) |
| `one_on_ones` | `schema_v4.sql` | member_id→members, session_date, notes jsonb[], title (v7), next_appointment (v10) | yes |
| `one_on_one_template` | `schema_v4.sql` | single-row, content | yes |
| `my_feedback` | `schema_v9.sql` | month, content, feedback_type, feedback_date (v10), from_member (v10) | no |
| `user_settings` | `schema_v12.sql` | key (PK), value jsonb | no (app sets `updated_at` manually, `useUserSetting.ts:37`) |
| `task_todos` | `schema_v15.sql` | task_id→tasks, title, schedule_tag, target_date (v16), done, done_at (v17), sort_order | **no `updated_at` at all** |
| `agenda_groups` | `schema_v19.sql` | category, name, color, sort_order, is_open | no |
| `agenda_items` | `schema_v19.sql` | group_id→agenda_groups, title, item_type, status, linked_task_id | yes |
| `agenda_updates` | `schema_v19.sql` | agenda_item_id, meeting_id, note, unique(item,meeting) | yes — **appears unused**: no `src/` file references `agenda_updates` (superseded by `meeting_agenda_links`, an undocumented table — see 6b) |
| `period_journals` | `schema_v20.sql` | period_key (unique), period_type, content, good/bad/next_focus (v21) | yes |
| `user_preferences` | `schema_v22.sql` | key (PK), value jsonb | no (app sets manually) |
| `annual_goal_items` | `schema_v23.sql` | category, title, color, sort_order, roadmap dates, target_deadline (v24) | yes |
| `annual_goal_tasks` | `schema_v23.sql` | item_id→annual_goal_items, title, status, many planning fields, assignee_id | yes |
| `annual_goal_task_notes` | `schema_v23.sql` | task_id, title, content, edited_at (**manual, not trigger**) | no |
| `annual_goal_category_labels` | `schema_v25.sql` | category_key, name | not read in full (small file) |
| `manual_achievements` | `schema_v27.sql` (recreated, v26 version dropped) | group_id→agenda_groups, title, achievement_type, month, content | **no `updated_at`** |
| `sketch_boards` | `schema_v35.sql` | name | yes |
| `sketch_cards` | `schema_v35.sql`, frame_id added v37 | board_id, content, color, position_x/y, width/height | yes |
| `sketch_edges` | `schema_v36.sql` | board_id, source_card_id, target_card_id | n/a (link table) |
| `sketch_frames` | `schema_v37.sql` | board_id, title, position_x/y, width/height, collapsed | yes |
| `schedule_items` | `schema_v38.sql` | title, item_date, start_hour, duration_hours | yes |
| `team_log_entries/groups/items/subtasks/notes/meetings/schedule/members` | `schema_v28-v33.sql` | — | **Confirmed unused by jin-dashboard**: `grep -rl "team_log" src/` returns zero files. Per project memory, "team-log" was extracted into the separate **HRM** repository; these migrations are vestigial for this repo's purposes even though they may still exist in the same live Supabase project. |

All RLS policies found are **permissive**: `FOR ALL TO authenticated USING (true) WITH CHECK (true)` (or the pre-v29 `anon`-inclusive variant for the now-defunct `team_log_entries`). There is no row-level ownership/ACL model — any authenticated session can read/write any row. This matters for risk #13 (RLS-caused failure): **RLS is very unlikely to be the cause of a save failure** for a logged-in user, since the policy is unconditionally `true`. The only way RLS blocks a write is if the Supabase session/JWT is missing or expired (→ falls under risk #12, auth expiry, not #13).

### 6b. Tables referenced in code with **no `CREATE TABLE` anywhere in `supabase/*.sql`** (confirmed via `grep -rn "create table.*<name>" supabase/*.sql -i` returning nothing for each)

| Table | Used in | Columns inferable from code |
|---|---|---|
| `agenda_sub_tasks` | `project/items/[id]/page.tsx`, `subtasks/[id]/page.tsx`, `AgendaMatrix.tsx`, `AnnualRoadmap.tsx`(no—separate), `completed/page.tsx`, `TodayTodoWidget.tsx`, `memo/quick/page.tsx`, `schedule/page.tsx`, `QuickTaskInput.tsx` | id, agenda_item_id, title, status, sort_order, assignee_id, target_date, mid_date, due_date, achievement_type, created_at, updated_at |
| `sub_task_notes` | `project/items/[id]/page.tsx`, `subtasks/[id]/page.tsx`, `TextSelectionCapture.tsx` | id, agenda_sub_task_id / sub_task_id (inconsistent naming seen — verify), title, content, created_at, edited_at (manual) |
| `project_meetings` | `memo/quick/page.tsx:336`, `journal/page.tsx:159`, `DailyJournalWidget.tsx:342` | id, title, meeting_date — **strongly suspected to be a Supabase VIEW over `meetings`**, not a separate base table, given identical shape and that it's only ever `select`ed/`insert`ed from these 3 read/create-only call sites while every mutation of an existing meeting goes through `meetings` |
| `meeting_agenda_links` | `meetings/[id]/page.tsx` | id, meeting_id, agenda_item_id, upsert on `(meeting_id, agenda_item_id)` — functionally replaces the documented-but-apparently-unused `agenda_updates` table |
| `daily_journals` | `DailyJournalWidget.tsx`, `journal/page.tsx`, `meetings/[id]/page.tsx` (`linked_meeting_ids` array column), `perf-review/page.tsx`, `archive/page.tsx` | id, date, content, tags, linked_meeting_ids |
| `objective_groups_v2`, `objectives_v2`, `objective_entries_v2` | `objective-review/page.tsx` only | groups: name/color/sort_order; objectives: quarter/title/description/sort_order; entries: date-scoped log rows |
| `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries` | `objectives/page.tsx` only | parallel structure to the `_v2` set above, different naming convention |
| `persona_logs` | `decisions/page.tsx` | date, persona/tab-scoped, title, content |

**This is 13 tables total with no migration record** (`agenda_sub_tasks`, `sub_task_notes`, `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs`), independently confirmed by ground-truth extraction of every `.from('...')` call across `src/` (41 distinct table names total = 28 documented + these 13 undocumented). They were evidently created directly in the Supabase SQL editor/dashboard without ever being committed. **This cannot be resolved from the local codebase alone** — see §13.

Two things follow directly from this:
1. **PK/FK/CHECK constraints, RLS policies, and trigger behavior for these 13 tables are unknown from static analysis.** We only know the columns the app *reads and writes*, not the DB-level guarantees around them.
2. `objectives/page.tsx` (`obj_*`) and `objective-review/page.tsx` (`objectives_v2`/`objective_groups_v2`/`objective_entries_v2`) use **two structurally parallel but table-distinct schemas** for what reads as the same "quarterly objectives" concept. Whether this is intentional (two different features that happen to look similar) or an abandoned-migration artifact (one is dead code left over from a rewrite) **cannot be determined from code alone** and should be confirmed with the product owner before STEP 2 designs around either one.

### 6c. Storage bucket
`supabase/schema_v13.sql:6-9` references a Supabase Storage bucket named `attachments` (created via dashboard, not SQL) used by the file-upload attachment flows in `meetings/[id]/page.tsx`, `tasks/[id]/page.tsx`, `project/items/[id]/page.tsx`, `annual-goals/tasks/[id]/page.tsx`. Bucket-level policies are **not visible from the repo** (dashboard-only) — flagged in §13.

---

## 7. Local Storage Structure

Covered exhaustively in §5. Summary characterization:

- **No key uses a version/schema field.** A future format change to any draft's JSON shape would silently produce either a parse exception (caught by `try {} catch {}` in every read site — confirmed pattern at e.g. `quickMemo.ts:17-21`, `memo/quick/page.tsx:27-32`) or, worse, a shape mismatch that doesn't throw but produces `undefined` fields silently used downstream.
- **No key has a TTL/expiry check at read time**, except `quick_memo_archive` (`ARCHIVE_RETENTION_MS`, filtered at both write time `memo/quick/page.tsx:65` and read time `:121-122`) and the home-timeline family (date-based invalidation, `page.tsx:366-371`).
- **No quota-exceeded handling exists anywhere.** Every `localStorage.setItem` call site that has error handling wraps it in a bare `try { } catch {}` that silently swallows `QuotaExceededError` with no user-facing signal and no fallback (e.g. `writeDraftEntry` in `memo/quick/page.tsx:34-38`, every draft-writer in `memos/page.tsx`, `DailyJournalWidget.tsx:332`). Some sites (`meetings/[id]/page.tsx:372,377`) don't even wrap in try/catch — an uncaught `QuotaExceededError` there would throw synchronously inside a React event handler.

---

## 8. Per-Screen Data Flow

Representative flows for the most important editors (full detail; remaining screens follow the same shapes catalogued in §4/§10).

### 8a. Quick-memo popup (`src/app/memo/quick/page.tsx`) — the most defensive editor in the app
1. User types in title (`onChange` line 485) or TipTap body (`onChange` line 507) → `setTitle`/`setContent` **and synchronously** `saveDraft(title, content, tag)` (line 197-206) → `writeDraftEntry(qidRef.current, {...})` → `localStorage.setItem('quick_memo_drafts', ...)` (every keystroke, no debounce — cheap since it's local).
2. User clicks Save / Ctrl+Enter → `handleSave()` (line 330).
3. `await supabase.from('quick_memos').insert({...})` (or `project_meetings` if a meeting-tagged memo with a parsed date) — **`{ error }` is destructured and checked** (line 339-344, 349-354).
4. On error: draft is **not** removed, `saveError` state shown, `saving` reset to allow retry (line 341-343, 351-353).
5. On success: `appendToArchive(...)` (3-day safety net) **then** `removeDraftEntry(qidRef.current)` (line 361-362) — draft removal happens only after archive write, both synchronous, same tick.
6. Reload/reopen recovery: on mount, `readDrafts()` restores the single draft for this window's `qid`, or if ≥2 orphaned drafts exist (from crashed windows), an explicit picker UI lets the user choose which to resume (line 144-157, 372-405).
7. Tab/window close: **no `beforeunload` handler for the draft itself** — by design, since the draft already lives in `localStorage` continuously, so closing the popup mid-edit is safe (comment at line 208 confirms this is intentional).

### 8b. Meeting note editor (`src/app/(app)/meetings/[id]/page.tsx`)
1. New-note composer: `handleNoteInputChange`/`handleNoteTitleChange` (line 370-378) write to `localStorage` on every keystroke (`meeting_draft_${id}` / `meeting_draft_title_${id}`), restored on mount (line 332-335).
2. `saveNote()` (line 456-470): builds `updatedNotes = [newNote, ...meeting.notes]` from **local React state** (`meeting.notes`), calls `updateMeeting({ notes: updatedNotes })` → `await supabase.from('meetings').update(updates).eq('id', id)` (line 452) — **result is not destructured, error is not checked**. On (assumed) success, local `meeting` state is optimistically merged (line 453) and the draft keys are removed (line 469-470) **regardless of whether the write actually succeeded**.
3. Existing-note edits: `NoteAccordion.handleChange` (line 100-110) debounces 1500ms, then calls `onEdit(index, html)` which flows into the same `updateMeeting`/no-error-check path. **No `localStorage` draft backup exists for edits to an already-saved note** — only the new-note composer has one.
4. No `useEffect` cleanup clears `saveTimer` in `NoteAccordion` on unmount.

### 8c. Task/Sub-task/Project-item/Annual-goal-task detail editors (structurally identical; `tasks/[id]`, `subtasks/[id]`, `project/items/[id]`, `annual-goals/tasks/[id]`)
1. Description/notes field → `onChange` → local state → `clearTimeout(descTimer/noteTimers[id])` → new `setTimeout(..., 500–1500ms)` → `supabase.from(table).update({...}).eq('id', id)`.
2. In **every** one of these 4 files, this specific call is fire-and-forget: no `{error}` destructuring (confirmed absent at `tasks/[id]/page.tsx` description/notes save paths, `project/items/[id]/page.tsx:217,288`, `subtasks/[id]/page.tsx:162`, `annual-goals/tasks/[id]/page.tsx:129,192`).
3. Simple discrete field changes in the same files (status toggle, assignee picker, date picker) follow the identical non-checked `await supabase.from(...).update(...)` shape.
4. **No `localStorage` draft exists for any of these note/description fields.** If the debounced timer hasn't fired yet and the browser is closed, or the Supabase write silently fails, the edit is gone with no client-side backup at all — worse than the meetings-notes case (8b), which at least has a composer-level draft (though only for *new* notes, not edits).
5. Attachment upload flows in these same files (e.g. `tasks/[id]/page.tsx:541,557,576`) **do** check the storage-upload error (`if (error) { setUploadError(...); continue }`), but the subsequent DB row insert is not error-checked.

### 8d. Sketch canvas (`src/components/sketch/SketchCanvas.tsx`)
1. Card content edit: debounced 500ms (line 87-103) → `supabase.from('sketch_cards').update({content})` — not shown to check error at this specific call site (unlike the position/frame handlers).
2. Card drag: position is only written **once, on drag-stop** (`handleNodeDragStop`, line 725+; `savePosition`, line 469-471) — not per-move, so no debounce is needed and no "lose the final position" risk from timing exists structurally. Error **is** checked and logged (`console.error`) but not surfaced to the user for plain position saves (contrast with `addCardToFrame`/`removeCardFromFrame`, which do `alert()` on failure and roll back optimistic state, line 448-465).
3. Pan/zoom viewport is `localStorage`-only (`viewportKey(boardId)`, line 287-294), never persisted server-side — acceptable since it's a personal view preference, not data.

---

## 9. Data Loss Risks

Findings are cited with exact file/line. "Confirmed" = observed directly in code. Severity is my judgment for STEP 2 prioritization, not a formal SLA.

| ID | Risk type | Status | Where | Condition | Loss likelihood | Reproducible? | Existing defense |
|---|---|---|---|---|---|---|---|
| 1 | insert/update/upsert error unchecked | **Confirmed, widespread** | `meetings/[id]/page.tsx:452`; `tasks/[id]/page.tsx` (task/notes/todos updates); `subtasks/[id]/page.tsx:130,136,141,162,167`; `project/items/[id]/page.tsx:217,225,234,288,315`; `annual-goals/tasks/[id]/page.tsx:129,136,144,149,153,157,161,165,169,173,192,210`; `AgendaMatrix.tsx` (most field updates, not the reorder ones); `AnnualRoadmap.tsx` (most field updates); `hooks/useUserSetting.ts:35-39`; `lib/tasks.ts:121-125,130,138` (reads only, but same discard pattern); `MobileMemoSheet.tsx:40-42` | Any single-field save on ~10 different detail editors | High (routine) | Yes — trivially, disconnect network and edit any field | None |
| 2 | Failure treated as success | **Confirmed** | `meetings/[id]/page.tsx:451-453` (`updateMeeting` merges local state regardless of write outcome); `MobileMemoSheet.tsx:40-45` (always shows "저장됐어요" after `await insert(...)` with no error check) | Same call sites as #1 | High | Yes | None |
| 3 | Draft deleted after failed save | **CORRECTION — Confirmed PRESENT, CRITICAL.** An earlier draft of this audit claimed this risk was absent everywhere except the (safe) quick-memo popup; that was wrong. `src/app/(app)/tasks/[id]/page.tsx`, `saveNote()` (lines 454-493): line 468 does `const { data } = await supabase.from('notes').insert({...}).select().single()` — **`error` is not destructured at all**. Regardless of whether `data` is null (insert failed), line 489 unconditionally runs `localStorage.removeItem(noteDraftKey)` and line 490 `setNoteInput('')`, wiping both the localStorage draft and the in-memory text the user typed. The same function's `addTodo()` sibling (task todo composer, ~line 346-353) has the identical shape: insert with no error check, then the todo input is cleared unconditionally right after. This is the single most concrete, reproducible data-loss bug found in the whole audit: disconnect the network (or let RLS/auth silently reject the insert), type a note or todo, save — the text is gone from both the UI and localStorage with no error shown, and the insert never happened. The quick-memo popup (`memo/quick/page.tsx`) remains the one screen that gets this right (keeps the draft on a checked failure, §12). | `tasks/[id]/page.tsx:468,489-490` (notes); `tasks/[id]/page.tsx` `addTodo()` (task_todos) | Any failed `notes`/`task_todos` insert from the task detail page (network drop, RLS reject, auth expiry) while a draft is pending | High — reachable through ordinary use, no special conditions needed beyond a failed write | Yes — block/kill the network request to `notes` or `task_todos` insert in devtools, type a note, click save | None |
| 4 | Save-vs-draft-delete race | **Not applicable in current code** — draft removal in every screen happens synchronously in the same async function right after the (unchecked or checked) write call, on the same tick; no separate async path can interleave. | — | — | — | — | — |
| 5 | Stale save overwrites newer data | **Confirmed** | `meetings/[id]/page.tsx:463-464` (`saveNote`, builds `[newNote, ...meeting.notes]` from stale local state); same jsonb-array-in-one-row pattern exists for `one_on_ones.notes` (`one-on-one/[memberId]/[sessionId]/page.tsx`) and `learning_resources.notes` (`learning/[id]/page.tsx:83`) and `MeetingBriefWidget.tsx:210`/`schedule/page.tsx:297` (both also do `meetings.update({notes: updatedNotes})` from local state) | Two browser tabs/sessions add a note to the same meeting/session/resource within the same load-to-save window | Medium (requires 2 concurrent sessions on the same record, but the "add note from schedule widget" + "add note from meeting detail page" combination makes this easier than it looks — same record, two different UI surfaces) | Yes — open the same meeting in 2 tabs, add a note in each without reloading the other | None |
| 6 | Debounce loses last keystroke | **Not applicable as coded** — every debounce implementation resets the timer on each keystroke (`clearTimeout` + new `setTimeout`), so the *last* keystroke always eventually fires if given ≥ the debounce window (300–1500ms) before any of #7/#8/#9 occurs. The real risk is #7/#8/#9 cutting off that window, not the debounce logic itself. | — | — | — | — | — |
| 7 | Unmount without flush | **Confirmed** | No file among `meetings/[id]/page.tsx`, `tasks/[id]/page.tsx`, `subtasks/[id]/page.tsx`, `project/items/[id]/page.tsx`, `annual-goals/tasks/[id]/page.tsx`, `one-on-one/[memberId]/[sessionId]/page.tsx`, `learning/[id]/page.tsx`, `one-on-one/template/page.tsx`, `perf-review/page.tsx`, `useUserSetting.ts` has a `useEffect` cleanup that calls `clearTimeout` + immediately fires the pending save on unmount. (Contrast: `tasks/[id]/page.tsx:273` and `:435` **do** have `return () => clearTimeout(timer)` for two *other* timers — draft-only and a toast-dismiss timer respectively — showing the pattern is known and used elsewhere in the same file, just not applied to the DB-write debounce timers.) | User edits a note/field, then clicks to a different task/meeting/session within the debounce window | Medium — depends on typing pause habits; anyone who edits-then-immediately-navigates loses that edit | Yes — edit a note, immediately click a different task in the sidebar before ~1–1.5s elapses | None |
| 8 | Refresh loses unsaved input | **Partially mitigated, inconsistent** | Screens with a `localStorage` draft (quick memo, memos page, meeting new-note composer, daily journal widget, one-on-one feedback, decisions/persona log) survive a refresh. Screens editing an *existing* record's field (task/sub-task/project-item/annual-goal-task notes & descriptions, one-on-one session notes, learning notes, template) have **no draft** — a refresh within the debounce window loses the edit outright. | Detail-editor note/description fields listed above | Medium-High for those specific fields | Yes | None for the fields without a draft |
| 9 | Tab/browser close loses unsaved input | **Same set as #8** — no `beforeunload` flush exists anywhere (confirmed by the earlier full-codebase grep for `beforeunload`, only hit being the unrelated heartbeat cleanup in `quickMemo.ts:46,50`) | Same as #8 | Same as #8 | Same as #8 | None |
| 10 | Network error unhandled | **Confirmed** — same call sites as #1; Supabase JS client resolves with `{data:null, error}` on network failure rather than throwing, so a bare `await supabase.from(...).update(...)` with no destructuring simply proceeds as if nothing happened | Same as #1 | Same as #1 | Same as #1 | None |
| 11 | Supabase error unhandled | **Confirmed** — identical to #1/#10, this is the same underlying gap described from the "what kind of error" angle | Same as #1 | Same as #1 | Same as #1 | None |
| 12 | Auth expiry | **Confirmed unhandled** — no file in `src/` checks for a 401/JWT-expired condition specifically, or attempts a session refresh/redirect-to-login on write failure. `createClient()` (`lib/supabase/client.ts`) is a bare `createBrowserClient` with default session handling; if the session cookie expires mid-edit, the resulting `error` object (already-unchecked in most call sites per #1) would simply be swallowed | Long-lived tab left open past session expiry, then edits made | Medium (depends on Supabase session TTL config, not visible from code) | Not reproducible from code alone — depends on Supabase Auth project settings (external) | None |
| 13 | RLS-caused failure | **Confirmed not applicable for authenticated users** — every RLS policy found is `USING (true) WITH CHECK (true)` for the `authenticated` role (§6a). RLS could only block a write if the client held no valid session, which collapses into #12. | — | — | Low | — | — |
| 14 | localStorage quota exceeded | **Confirmed unhandled** | Every draft writer either has a bare `try {} catch {}` that silently no-ops (`memo/quick/page.tsx:37,43,67`; `memos/page.tsx:446,467`; `DailyJournalWidget.tsx:332`) or, in `meetings/[id]/page.tsx:372,377`, **no try/catch at all** around `localStorage.setItem` | Storage quota exhausted (many stale drafts/archives, or other site data) | Low probability in practice (text-only drafts are small) but silent when it does happen | Not easily reproducible without deliberately filling storage | None beyond the swallow-and-continue in most sites |
| 15 | localStorage JSON parse failure | **Confirmed mitigated** — every read site wraps `JSON.parse` in `try {} catch { return {} / [] }` (e.g. `quickMemo.ts:17-21`, `memo/quick/page.tsx:27-32,57-61`) so a corrupted value degrades to an empty draft rather than crashing the page | — | — | Low (already defended) | Yes | Silent fallback to empty — the corrupted draft's *content* is still lost, just not a crash |
| 16 | Corrupted draft data | **Partially mitigated** — same as #15; no schema/shape validation is performed after `JSON.parse` succeeds (a malformed-but-valid-JSON draft, e.g. missing `title`/`content` keys, is used as-is with `??` fallbacks in most read sites) | — | — | Low | — | Optional chaining/`??` masks most cases |
| 17 | Multi-tab concurrent edit | **Confirmed** — same root cause as #5. Additionally, `one_on_one_template` (`one-on-one/template/page.tsx:20,34,37`) does a `select ... .single()` then either `update` (if a row was found) or `insert` (if not) rather than a real `upsert` — two tabs opening the template for the first time simultaneously could both find no row and both insert, producing two rows for what the comment in `schema_v4.sql:69` says is meant to be exactly one | Two tabs/devices editing the same meeting/session/resource/template concurrently | Medium | Yes | None |
| 18 | Concurrent save to same record | Same as #17/#5 | — | — | Medium | — | — |
| 19 | Duplicate save | **Confirmed possible only for `one_on_one_template`** (see #17); not observed elsewhere — all other inserts are user-action-triggered once (button click / Enter key), not repeatable by a debounce loop | `one-on-one/template/page.tsx:20-41` | Two near-simultaneous first-time template creations | Low (requires two tabs racing on template creation specifically) | Plausible but narrow | None |
| 20 | Save order inversion | **Not confirmed as a distinct bug** beyond what #5/#17 already describe (out-of-order arrival of two updates to the same jsonb array is the same failure mode, not a separate one) | — | — | — | — | — |
| 21 | Draft cleanup too early | **Confirmed not present** — every draft-clearing call site (`removeDraftEntry`, `localStorage.removeItem(...)`) is only reached after either a successful save (checked, `memo/quick/page.tsx:362`) or an explicit user-initiated discard action (`handleDiscardAndClose`, line 237-240). The unchecked-error screens (§8b/8c) don't have a draft to clean up in the first place, so this specific risk doesn't apply to them. | — | — | — | — | — |
| 22 | TTL/cleanup causing premature deletion | **Confirmed not present** — the only TTL (`quick_memo_archive`, 3 days/50 entries) is a *safety-net* store, not the primary draft; its expiry only affects how far back the recovery UI can look, it never deletes an active/unsaved draft | — | — | — | — | — |
| 23 | Other — schema drift (undocumented tables) | **Confirmed, high-impact structurally** | §6b (16 tables absent from migrations) | Any STEP 2 design that assumes the committed `supabase/*.sql` files are authoritative | Certain to cause planning errors if not accounted for | n/a | None — this audit is the first record of it |
| — | Other — inconsistent error-handling within a single file | **Confirmed** | `memos/page.tsx:489,495` (update, unchecked) vs. `memos/page.tsx:501` (insert, `{data,error}` checked) in the same file | — | — | — | — |
| — | Other — same feature, two robustness levels | **Confirmed** | Quick memo has 3 independent entry points — popup (`memo/quick/page.tsx`, full draft+archive+error-handling), list-page quick-add (`memos/page.tsx`, draft but weaker error handling on edit), and mobile sheet (`MobileMemoSheet.tsx`, **zero** draft, **zero** error check) — for what is conceptually one feature | — | — | — | — |

**CRITICAL-severity items** (data loss with no recovery path at all, reachable through ordinary use, no defense present): **#1, #2, #3 (tasks/[id] note & todo draft wiped on failed insert — concrete, reproducible), #5/#17/#18 (stale overwrite / concurrent edit on jsonb notes columns), #7 (unmount without flush), #8/#9 (refresh/close during debounce) for the detail-editor note/description fields with no localStorage backup**. That is **6 risk clusters**, spanning the majority of the app's detail-editor screens (tasks, sub-tasks, project items, annual-goal tasks, one-on-one sessions, learning resources, meeting notes, template).

---

## 10. Structural Problems

Cross-cutting patterns only — see §9 for individual instances.

1. **No shared autosave utility.** Every screen hand-rolls its own `useRef<Timeout>` + `setTimeout` debounce. The same bug (no unmount flush, no error check) had to be independently reintroduced in ~10 files because there is nothing to fix once and inherit everywhere.
2. **jsonb-array-as-a-single-column for "notes"** (`meetings.notes`, `one_on_ones.notes`, `learning_resources.notes`) forces every note add/edit to be a read-modify-write of the *entire* column from whatever is currently in local React state, which is structurally incompatible with concurrent access (§9 #5/#17/#18) — a normalized child table (like `annual_goal_task_notes` / `sub_task_notes` already do for other entity types) would remove this entire risk class.
3. **Error-checking is inconsistent within single files, not just across the app.** The same file will check `{error}` for a drag-reorder operation but not for a plain field edit (`AgendaMatrix.tsx`, `AnnualRoadmap.tsx`), or check it for insert but not update (`memos/page.tsx`). This suggests error-checking was added reactively per-incident rather than as a house rule.
4. **The migration-file history is not the schema.** 16 tables exist in production with zero record in `supabase/*.sql` (§6b). Any future teammate (or AI agent) trying to understand "what tables exist" from the repo alone will get a materially incomplete and in two cases (`obj_*` vs `*_v2`) actively confusing picture.
5. **"Draft" protection exists only where someone got burned before**, not systematically: the most defensive code (quick-memo popup) has comments explicitly referencing past failure modes it was built to prevent (`quickMemo.ts:6-11` describes a specific historical bug about shared drafts across popups; `memo/quick/page.tsx:46-48` explains *why* the archive exists — "성공한 것처럼 보였지만 실제로는 반영이 안 된 경우"). Screens built later/faster (mobile memo sheet, most detail-editor note fields) never received the same treatment.
6. **Two parallel schemas for what looks like one concept** (`obj_*` vs `objective*_v2`, §6b) — needs a product-level answer, not a code-level one, before STEP 2 can safely design around "the objectives data."
7. **Settings are synced through two different mechanisms that overlap in intent**: `user_settings` (`schema_v12.sql`, generic key/value, used by `useUserSetting.ts` hook and `decisions/page.tsx` persona profiles) and `user_preferences` (`schema_v22.sql`, generic key/value, used by `useOrgData.ts`/`settings/page.tsx` for org/menu/hidden-menu data) are structurally identical tables serving the same "sync a setting across devices" purpose, just adopted by different features at different times. `settings/page.tsx` additionally dual-writes to `localStorage` *and* `user_preferences` for the same values (§5), which is a reasonable optimistic-UI pattern but means there are now three storage locations (2 tables + localStorage) that can disagree.
8. **Sketch canvas is the outlier in code quality for this concern** — it's the only screen using optimistic-update-with-rollback and the only one that never fires a position write on a timer (drag-stop only, eliminating an entire risk class by construction). It represents what "good" looks like in this codebase and is a natural reference implementation for STEP 2.

---

## 11. Current Safety Assessment

| Scenario | Rating | Basis |
|---|---|---|
| Normal typing pace | **PARTIAL** | Content reaches Supabase eventually via debounce in most editors, but with zero error visibility to the user (§9 #1/#11) — a silently-failed save looks identical to a successful one. |
| Very fast typing / rapid edits | **SAFE** (for the debounce mechanism itself) | Timer-reset-on-keystroke means the final value is what gets sent (§9 #6 not applicable); risk lies elsewhere (network/unmount), not in the debounce logic. |
| Refresh mid-edit | **UNSAFE** for detail-editor note/description fields (tasks, sub-tasks, project items, annual-goal tasks, one-on-one sessions, learning resources, existing meeting-note edits, template) — no localStorage draft exists for these (§9 #8). **PARTIAL-to-SAFE** for quick-memo (all 3 entry points except mobile sheet), memos-page composer, meeting new-note composer, daily-journal widget, one-on-one feedback, decisions/persona-log — these have localStorage drafts. |
| Tab/window close | Same split as "refresh mid-edit" — **UNSAFE** vs **PARTIAL-to-SAFE** by the same screen list (§9 #9). No `beforeunload` flush exists anywhere to narrow this gap. |
| Browser crash | Same as tab close for screens with a `localStorage` draft (survives, since it's already persisted continuously) — **PARTIAL**. **UNSAFE** for screens without one. |
| Network disconnect mid-save | **UNSAFE** — the debounced write fires, the promise rejects or resolves with `{error}`, and in ~10 files that error is never inspected (§9 #1/#10/#11); the UI shows no failure state and the user has no reason to retry. |
| Supabase outage / 5xx | **UNSAFE** — identical mechanism to network disconnect. |
| Auth session expiry mid-edit | **UNKNOWN** — no code path specifically detects or reacts to this; actual behavior depends on Supabase Auth project configuration (token refresh behavior, session length) which is not visible from the repository (§13). |
| Multiple tabs open on the same record | **UNSAFE** for any screen backed by a jsonb `notes` array (meetings, one-on-one sessions, learning resources) or the singleton `one_on_one_template` — confirmed read-modify-write-from-stale-state pattern (§9 #5/#17/#18). **SAFE** for screens whose edits are single-column, single-value updates on a normalized row (e.g. a task's `status` field) — last-write-wins is the correct/expected behavior there and no data is "lost," only overwritten as intended by design. |
| Duplicate/double-submit save | **SAFE** in general — most saves are single explicit user actions (button/Enter), not retryable loops. **PARTIAL** for `one_on_one_template` specifically, where a race on first-time creation could plausibly create two rows (§9 #17/#19). |
| Save immediately before navigating away | **UNSAFE** for every debounced-field editor with no unmount-flush (§9 #7) — this is arguably the single most common real-world way this app's users will lose data, since "type a note, then click to the next task" is an extremely normal navigation pattern in this UI. |

---

## 12. Existing Features That Must Be Preserved

These are deliberate, evidently hard-won pieces of defensive design — any STEP 2 rearchitecture should keep their guarantees, not just their code:

- **Quick-memo popup's full draft lifecycle** (`memo/quick/page.tsx`): per-window `qid`-scoped draft, orphan-draft recovery picker for crashed windows, explicit error-on-save with draft retention, and the 3-day "archive" safety net for saves that *reported* success. The in-code comments (lines 46-48, 6-11) show this was built in direct response to real incidents — do not regress it.
- **Multi-window heartbeat mechanism** (`lib/quickMemo.ts`): correctly solves "is another popup already open" across window boundaries using a shared `localStorage` heartbeat rather than in-memory window references, with its own `beforeunload` cleanup. This is a subtle, already-correct piece of cross-window coordination.
- **Sketch canvas's optimistic-update-with-rollback + drag-stop-only persistence** (`SketchCanvas.tsx`): the only place in the app that treats a Supabase write failure as a first-class UI event (revert + alert) and the only save timing model that structurally cannot lose a "final position" to a race.
- **Drag-reorder error toasts** (`AgendaMatrix.tsx`, `AnnualRoadmap.tsx`): `setDndErr(...)` with a 4-second visible message on reorder failure — inconsistent with plain-field edits in the same files, but itself worth keeping and generalizing rather than discarding.
- **JSON.parse defensive wrapping on every localStorage read** — universal in this codebase (§9 #15) and should remain a hard rule in any rewrite.
- **`user_preferences`/`user_settings` dual-write-with-localStorage-fallback pattern in `settings/page.tsx`** gives instant optimistic UI while still persisting cross-device — worth keeping as a UX pattern even while consolidating the two backing tables (§10 #7).
- **Perf-review's period-switch flush** (`src/app/(app)/perf-review/page.tsx`, ~lines 370-409): each of the 3 retrospective fields (`good`/`bad`/`next_focus`) has its own 300ms debounce, and when the user switches the active week/month *while a debounce timer is still pending*, an effect explicitly flushes the pending value against the *previous* `period_key` before switching (comment in the source: "주차 이동 시 pending 저장 타이머가 있으면 이전 period로 먼저 flush"). This is the only place in the entire app that flushes a debounced save on a specific UI transition rather than relying purely on the timer — a real, working anti-data-loss mechanism, though narrower than a full unmount/navigation flush (it does not cover leaving the page entirely). Worth generalizing into the shared save primitive recommended in §14, not losing it in a rewrite.

---

## 13. Unknowns / Requires External Access

Everything below **cannot be determined from the local codebase** and is explicitly out of this audit's reach per the task's constraints (no Dashboard access, no service-role queries):

1. **Actual DDL (columns, PK/FK, CHECK constraints, RLS policies, triggers, indexes) for the 16 undocumented tables** in §6b (`agenda_sub_tasks`, `sub_task_notes`, `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs`). We only know what the application code reads/writes, not the database's own guarantees.
2. **Whether `project_meetings` is a view over `meetings` or a genuinely separate base table** — inferred from usage pattern (§6b) but not confirmed.
3. **Whether `objective_groups_v2`/`objectives_v2`/`objective_entries_v2` vs. `obj_groups`/`obj_objectives`/`obj_sub_items`/`obj_sub_entries` are both live/intentional, or one set is dead/legacy** — requires a product-owner or Dashboard-level answer (e.g. row counts / last-modified timestamps per table), not visible from code.
4. **Supabase Auth session/token TTL and refresh behavior** — determines the real-world likelihood of risk #12 (auth expiry mid-edit); configured in the Supabase Dashboard, not in this repo.
5. **Supabase Storage bucket (`attachments`) policies** — created via Dashboard per the comment in `schema_v13.sql:6-9`, not defined in SQL.
6. **Whether the "same Supabase project" is shared with the now-separate HRM (formerly team-log) repository** — if so, the `team_log_*` tables and any RLS/trigger changes made from that repo could still affect this project's live database even though this repo never references them.
7. **Actual production row counts / write-frequency for each table** — would materially change STEP 2 prioritization (e.g. is `meetings.notes` concurrent-edit collision a once-a-year event or a weekly one?) and is not derivable from static code.
8. **`objective-review/page.tsx` (1459 lines) and `objectives/page.tsx` (889 lines) received only a grep-level pass in this audit, not full line-by-line tracing.** We confirmed (ground-truth, direct read) the exact Supabase call sites and table names for `objective-review/page.tsx` — `objective_groups_v2`/`objectives_v2`/`objective_entries_v2`, all via plain `insert`/`update`/`delete` with no `{error}` destructured at any of the ~15 call sites (lines 1055-1164) — but did not verify debounce timing, unmount-flush behavior, or localStorage draft presence for either screen to the same depth as the other 33 screens. **This is a gap in this audit's own coverage, not an external-access limitation** — it should be closed with a dedicated follow-up read before STEP 2 designs touch the "objectives" feature, especially since §6b #2 flags `obj_*` vs `*_v2` as a possibly-duplicated feature needing a product decision anyway.
9. **Whether `ANTHROPIC_API_KEY` is set in any deployed environment** — `.env.local` was confirmed to **not** contain this key (only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` were present, key names only, values masked/not read), so `auto-draft`'s AI-assist path may only ever run in its plain-text fallback mode locally; production/Vercel env vars are outside this audit's reach.

---

## 14. Recommended Next Investigation

For STEP 2 (architecture design), in priority order:

1. **Resolve the schema-drift unknowns (§13, #1-3) with Dashboard/service-role access before designing anything** — a new autosave architecture cannot safely span tables whose constraints are unknown, and the `obj_*` vs `*_v2` ambiguity needs a product decision, not a technical one.
2. **Decide on one shared autosave primitive** (a hook, e.g. `useDebouncedSave(table, id, field)`) that bakes in: debounce-with-reset, `{error}` checking with user-visible failure state, unmount-flush (fire the pending save synchronously, or at least attempt it, on unmount/navigation), and optionally a `localStorage` draft mirror — then migrate the ~10 files in §9 #1/#7 onto it rather than hand-fixing each one.
3. **Normalize the jsonb `notes` array columns** (`meetings.notes`, `one_on_ones.notes`, `learning_resources.notes`) into child tables the same way `annual_goal_task_notes`/`sub_task_notes` already work, to structurally remove the concurrent-edit lost-update class (§9 #5/#17/#18) rather than patching it with optimistic-concurrency checks on a jsonb blob.
4. **Fix `one_on_one_template` to a true `upsert`** (single call with `onConflict`) instead of select-then-branch, removing the narrow duplicate-row race (§9 #17/#19).
5. **Add a `beforeunload` confirmation or best-effort flush** for any screen with a pending debounced save, informed by whichever design is chosen in #2.
6. **Decide the mobile-memo-sheet gap deliberately** (§9, "same feature two robustness levels") — either bring it up to the popup's standard or explicitly accept the risk for that surface.
7. **Get real usage data** (§13 #7) to prioritize which of the ~10 no-draft detail editors matters most in practice (task notes vs. learning notes vs. template, etc.) before investing equally in all of them.

---

## 15. Appendix — Relevant Files

**Shared editor infrastructure**: `src/components/TiptapEditor.tsx`, `src/components/MarkdownEditor.tsx`, `src/components/SmartTextarea.tsx`, `src/components/FullscreenNoteEditor.tsx`, `src/components/FormattingToolbar.tsx` — all confirmed to be pure controlled inputs with no internal save/debounce logic of their own; all save-timing logic lives in the parent screen.

**Hooks**: `src/hooks/useUserSetting.ts` (400ms debounce, `user_settings`, no error check, no unmount flush), `src/hooks/useOrgData.ts` (read-only, `user_preferences` + localStorage fallback).

**Lib**: `src/lib/quickMemo.ts` (heartbeat/window mgmt), `src/lib/tasks.ts` (fetch helpers, errors discarded), `src/lib/supabase/client.ts` + `server.ts` (bare Supabase client factories, no retry/interceptor logic), `src/lib/markdown.ts`, `src/lib/arrowShortcuts.ts`, `src/lib/categoryColors.ts`, `src/lib/dateGrid.ts`, `src/lib/intel-sources.ts` (not save-relevant).

**Full editor screen list**: see §3 table (35 rows) for exact file paths.

**Supabase migrations examined in full**: `schema.sql`, `schema_v2` through `schema_v39` (all 39 versioned files + base `schema.sql` read or grepped in full; team_log_* series (v28-v33) confirmed unused by this repo).

**Env files**: `.env.local` present at repo root; keys confirmed present (values not read): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

---

# STEP 2 — Verification

**Method**: Direct, sequential re-reading of source files by the coordinating agent (not sub-agent-parallelized, per instruction). Verified: `src/app/memo/quick/page.tsx`, `src/lib/quickMemo.ts`, `src/app/(app)/tasks/[id]/page.tsx`, `src/app/(app)/meetings/[id]/page.tsx`, `src/hooks/useUserSetting.ts`, `src/app/(app)/one-on-one/template/page.tsx`, `src/components/memo/MobileMemoSheet.tsx`, `src/components/sketch/SketchCanvas.tsx`, `src/components/meetings/AgendaMatrix.tsx`, `src/app/(app)/one-on-one/[memberId]/[sessionId]/page.tsx`, `src/app/(app)/learning/[id]/page.tsx`, `src/app/(app)/schedule/page.tsx`, `src/components/home/MeetingBriefWidget.tsx`, `src/types/index.ts`, and all `supabase/*.sql` files (grep). No dev server run, no Supabase writes, no source files modified.

## 2. CRITICAL 위험 6개 개별 검증

| # | Risk | Verdict | Evidence |
|---|---|---|---|
| 1 | insert/update/upsert error unchecked | **CONFIRMED** | `meetings/[id]/page.tsx:451-454` `updateMeeting()` — `await supabase.from('meetings').update(updates).eq('id', id)` return value not assigned to anything, no `{error}` destructured at all. `tasks/[id]/page.tsx:346-352` `addTodo()` — `const { data } = ...insert(...)`, error not destructured. `tasks/[id]/page.tsx:468` `saveNote()` — same shape. `hooks/useUserSetting.ts:34-39` — `.upsert(...).then(() => {})`, result fully discarded. `components/memo/MobileMemoSheet.tsx:40-42` — `await supabase.from('quick_memos').insert(...)` result not assigned at all. |
| 2 | Failure treated as success | **CONFIRMED** | `meetings/[id]/page.tsx:451-454` — `setMeeting(prev => ({...prev, ...updates}))` runs unconditionally right after the unchecked write, so the UI reflects the edit as saved regardless of DB outcome. `MobileMemoSheet.tsx:37-46` — `handleSave()` always calls `setSaving(false); setSaved(true)` and closes the sheet 800ms later, with zero conditional on the insert's outcome (result isn't even captured in a variable). |
| 3 | Draft deleted after failed save | **CONFIRMED, reproduced exactly as STEP 1 described.** `tasks/[id]/page.tsx` `saveNote()` (lines 454-493): line 468 `const { data } = await supabase.from('notes').insert({...}).select().single()` — no `error` destructured. Lines 489-492 unconditionally run `localStorage.removeItem(noteDraftKey)`, `setNoteInput('')`, `setNoteTitle(...)`, `setNewNoteKey(k => k+1)` — regardless of whether `data` came back null (i.e., insert failed). Same file's `addTodo()` (lines 346-353): `insert(...).select().single()`, no error check, then `setTodoInput('')` at line 352 runs unconditionally after, clearing the typed text whether or not the insert succeeded. STEP 1's line citations (454-493, ~346-353) match the actual file exactly. |
| 5/17/18 | Stale overwrite / concurrent edit on jsonb notes | **CONFIRMED, and broader than STEP 1's file list.** Read-modify-write of the full `notes` array from local/stale state is present in at minimum: `meetings/[id]/page.tsx:456-471` (`saveNote`, builds from `meeting.notes` React state) and `:480-490` (`editNote`); `schedule/page.tsx:297` (`supabase.from('meetings').update({ notes: [...prev, newNote] })`); `components/home/MeetingBriefWidget.tsx:207-210` (same table, same pattern, a **third** independent write surface for `meetings.notes`); `one-on-one/[memberId]/[sessionId]/page.tsx:98-104` (`session.notes`); `learning/[id]/page.tsx:82-84` (`resource.notes`). Confirms `meetings.notes` specifically has ≥3 independent UI entry points (meeting detail page, schedule/timeline widget, home meeting-brief widget) that can each read-modify-write the same jsonb column from their own stale copy — a materially higher collision surface than a single screen. |
| 7 | Unmount without flush | **CONFIRMED** | `meetings/[id]/page.tsx` — grepped every `useEffect` in the file (7 total); none returns a cleanup that flushes/clears the `NoteAccordion` `saveTimer` (`handleChange`, lines 100-110, 1500ms debounce). The only other timers in the file (item-picker outside-click listener, keyboard-escape listener) do have cleanups — confirming the pattern is known in this codebase but simply not applied to this specific debounce. |
| 8/9 | Refresh/tab-close loses unsaved input | **PARTIALLY_CONFIRMED** | Directly confirmed for `meetings/[id]/page.tsx` existing-note edits (`NoteAccordion`, no localStorage draft exists for edits to an already-saved note — only the new-note composer has a draft) and structurally identical for `tasks/[id]/page.tsx` description/notes fields (no draft keys found beyond `note_draft_${id}` for the *new*-note composer, none for existing-note edits or field updates). Not independently re-traced line-by-line for `subtasks/[id]/page.tsx`, `project/items/[id]/page.tsx`, `annual-goals/tasks/[id]/page.tsx` in this STEP — spot-grepped only, same absence-of-draft shape confirmed by grep but not full re-read. Downgraded from CONFIRMED to PARTIALLY_CONFIRMED for the full file set on this basis. |

**Summary**: 4 of 6 clusters CONFIRMED by direct full re-read (#1, #2, #3, #5/17/18, #7 — five labels, six original risk-IDs since #5/17/18 count as one cluster and #8/9 as one cluster per STEP1's own clustering, i.e. **5 of 6 CONFIRMED, 1 of 6 PARTIALLY_CONFIRMED**). Zero NOT_REPRODUCIBLE, zero FALSE_POSITIVE, zero UNKNOWN — every CRITICAL cluster STEP 1 raised is real, reproducible from code, and in the case of #5/17/18 the actual blast radius is larger (3 independent write surfaces for `meetings.notes` alone) than STEP 1's file list suggested.

## 3. Quick Memo 사고 독립 검증

Full re-read of `src/app/memo/quick/page.tsx` and `src/lib/quickMemo.ts` confirms STEP 1 §8a/§12 essentially verbatim:

- `saveDraft()` (line 197-206) writes to `localStorage` synchronously on every keystroke (title/content/tag onChange), scoped to `qidRef.current`.
- `handleSave()` (line 330-367): **does** destructure and check `{error}` for both the `project_meetings` insert (line 336-344) and the `quick_memos` insert (line 349-354).
- On error: `setSaving(false)`, `setSaveError(...)` shown, function **returns before** reaching `removeDraftEntry` — draft is provably retained on a failed save.
- On success only: `appendToArchive(...)` (3-day/50-entry safety net, line 361) runs, **then** `removeDraftEntry(qidRef.current)` (line 362) — both synchronous, same tick, no race window.
- Orphan-draft recovery UI (2+ leftover drafts from crashed windows) confirmed present (lines 113-172, 372-405).
- No `beforeunload` handler for the draft itself — confirmed intentional (draft already persists continuously to `localStorage`; comment at line 208 states this explicitly).

**Conclusion: quick-memo popup does NOT exhibit the "draft deleted after failed save" defect.** It is the one screen in the app that gets this right, exactly as STEP 1 claimed.

**Does the same defective pattern (draft cleared regardless of success) repeat elsewhere?** Yes — confirmed directly in:
1. `tasks/[id]/page.tsx` `saveNote()` (notes) — draft + input cleared unconditionally after an unchecked insert.
2. `tasks/[id]/page.tsx` `addTodo()` (task_todos) — input cleared unconditionally after an unchecked insert.
3. `meetings/[id]/page.tsx` `saveNote()` (new-note composer draft) — `localStorage.removeItem('meeting_draft_${id}')` at lines 469-470 runs unconditionally after an unchecked `updateMeeting()` call.
4. `components/memo/MobileMemoSheet.tsx` `handleSave()` — no draft exists to begin with, but the same "treat write as success regardless of outcome" family applies (`setSaved(true)` unconditional).

That is **4 files exhibiting some version of this family**, against 1 file (quick-memo popup) that does it correctly — consistent with STEP 1's characterization that "draft protection exists only where someone got burned before" (§10 #5).

**"Actually happened" vs. "structurally possible" distinction**: This audit has no access to error logs, Sentry, user reports, or Supabase logs — only static code. All of the above are **confirmed structurally possible and trivially reproducible** (kill the network request in devtools, or let RLS/auth reject it, then save) but this STEP cannot confirm whether real data loss has **already occurred** in production use. That determination requires either user-reported incidents or Supabase Dashboard log access, both out of scope (§13).

## 4. Autosave 구현 공통 패턴 분류 (A/B/C/D)

| Class | Definition | Screens |
|---|---|---|
| **A — 정상** (error checked, draft or safe-by-design, no known data-loss path) | `src/app/memo/quick/page.tsx` (draft + checked error + archive net); `src/components/sketch/SketchCanvas.tsx` `addCardToFrame`/`removeCardFromFrame`/`handleConnect` (checked error, optimistic rollback with `alert()`); `savePosition`/drag-stop-only timing (no debounce race by construction) |
| **B — 부분안전** (has a draft or error-visibility mechanism, but a gap remains) | `meetings/[id]/page.tsx` new-note composer (draft exists, but cleared unconditionally on an unchecked write — see §3); `memos/page.tsx` (draft present, but update/insert error-checking inconsistent within the same file per STEP 1 §9 last row); `DailyJournalWidget.tsx` (draft present, write not shown to be checked); `one-on-one/page.tsx` my-feedback draft; `decisions/page.tsx` persona-log draft; `AgendaMatrix.tsx`/`AnnualRoadmap.tsx` drag-reorder (error checked + 4s toast, confirmed via grep of `setDndErr` call sites, but no rollback of the reordered array itself, and plain-field edits in the same files are unchecked) |
| **C — 위험** (fire-and-forget, no draft, no error check, no unmount flush) | `tasks/[id]/page.tsx` (notes/description/todos); `subtasks/[id]/page.tsx`; `project/items/[id]/page.tsx`; `annual-goals/tasks/[id]/page.tsx`; `one-on-one/[memberId]/[sessionId]/page.tsx` (session notes, confirmed `updateSession({ notes: [...] })` shape at line 104); `learning/[id]/page.tsx` (confirmed line 82-84); `meetings/[id]/page.tsx` `NoteAccordion.handleChange` (existing-note edits); `hooks/useUserSetting.ts` (confirmed `.then(() => {})` discards result); `perf-review/page.tsx` fields (though this file has the one genuinely good exception noted in §12 of STEP 1 — the period-switch flush — which partially offsets its C classification for that one specific transition) |
| **D — 특수케이스** | `components/memo/MobileMemoSheet.tsx` (worst-in-class: zero draft, zero error check, confirmed directly — see §2/§3 above); `one-on-one/template/page.tsx` (confirmed select-then-branch, not a true `upsert`: `persist()` lines 30-44 — `if (templateId) update else insert`; has an `insertInFlight` ref guard added since STEP 1's read, but this guard is per-browser-tab JS memory only, so it does **not** prevent the cross-tab double-insert race STEP 1 flagged — it only prevents the same tab from double-firing) |

## 5. Autosave LEVEL 측정

- **LEVEL 0** (no debounce, no draft, single discrete Supabase call per user action): status toggles, assignee/date pickers, drag-reorder operations across most detail screens — a single `.update()` fired directly on the action, not a race-prone debounce path. Last-write-wins is correct/expected behavior here (STEP 1 §11 agrees).
- **LEVEL 1** (localStorage draft + eventual/manual Supabase write, draft is the primary defense): quick-memo popup (only fully correct instance), meetings/[id] new-note composer, memos/page.tsx composer, DailyJournalWidget, one-on-one my-feedback, decisions persona-log. Of these, only quick-memo popup avoids the "draft cleared regardless of success" defect (§3).
- **LEVEL 2** (Supabase debounced auto-save, NO local draft backing the content itself): tasks/[id] notes/description, subtasks/[id], project/items/[id], annual-goals/tasks/[id], one-on-one session notes, learning/[id] notes, one-on-one/template, useUserSetting-backed settings, meetings/[id] existing-note edits, perf-review fields. This is the largest single bucket — the majority of "real" content-editing surfaces in the app sit at LEVEL 2 with no client-side safety net.
- **LEVEL 2+** (LEVEL 2 plus checked error + optimistic rollback, still no versioning): SketchCanvas card/frame/edge operations; AgendaMatrix/AnnualRoadmap reorder-with-toast (partial — no rollback of the array).
- **LEVEL 3** (versioned history): **confirmed absent everywhere.** No DB table matches `draft|backup|history|revision|version_|autosave` (STEP 1's grep, independently spot-confirmed here by reading all 40 SQL files' table lists in §6a/§6b — none of the 28 documented or 13 undocumented table names correspond to a history/version concept). Quick-memo's `quick_memo_archive` (3-day/50-entry flat log of successful saves, manually opened via "최근 저장 기록" button) is the closest analog but is **not** a per-record version list — it is a flat save-event log with no link back to a specific record ID, so it does not qualify as LEVEL 3 in the strict sense, though it is the single best approximation present in the codebase.

## 6. 7일 보존 요구사항 Gap 분석

| # | Requirement | Verdict | Basis |
|---|---|---|---|
| 1 | 전체 화면 자동저장 | **PARTIAL** | Debounced writes exist on ~15 screens, but ~10 of them never check `{error}` (§2 #1) — "auto-saved" is often only true optimistically in the UI, not actually confirmed. |
| 2 | 실시간 local persistence | **PARTIAL** | Only 6 screens have a localStorage draft (quick-memo, meetings new-note composer, memos page, daily journal widget, one-on-one feedback, decisions); the majority of content fields (tasks/subtasks/project-items/annual-goal-tasks notes, one-on-one session notes, learning notes, template) have none — confirmed via grep across §5's localStorage key table plus direct reads in this STEP. |
| 3 | 서버 persistence | **PARTIAL** | Writes are attempted everywhere, but silently swallowed failures (§2 #1/#2) mean "persisted" cannot be asserted from the client's perspective in the majority of screens. |
| 4 | 7일 history | **FAIL** | No history/version table exists anywhere in the schema (confirmed, see §5 LEVEL 3). Nothing in the app retains 7 days of anything — the only retention window found is quick-memo's 3-day archive, which is shorter than the requirement and not per-record. |
| 5 | history 조회 UI | **FAIL** | No UI anywhere lets a user browse revision history for a specific record. Quick-memo's "최근 저장 기록" panel is the only history-adjacent UI in the app and it is a flat, unlinked save-event log, not scoped to a record. |
| 6 | 버전 복구 | **FAIL** | No mechanism restores a record to a specific prior version. Quick-memo's archive lets a user copy a past *saved memo's content* back into the compose box — the closest analog — but it is not tied to any specific record ID and cannot "revert" an already-saved `quick_memos` row. |
| 7 | 저장 실패 시 무손실 | **FAIL** for the majority (confirmed: `tasks/[id]/page.tsx` notes/todos, `meetings/[id]/page.tsx` existing-note edits, all LEVEL-2 screens in §5) — **PASS** only for quick-memo popup (confirmed §3). |
| 8 | 브라우저 종료 대응 | **PARTIAL** | PASS for the 6 draft-backed screens (survives via localStorage); FAIL for all LEVEL-2 screens (no draft, no `beforeunload` flush anywhere — confirmed, only `beforeunload` hit in the whole codebase is `quickMemo.ts:46,50`'s unrelated heartbeat cleanup). |
| 9 | 네트워크 오류 대응 | **FAIL** for the majority (same unchecked-error call sites as #1/#7) — **PASS** only for quick-memo popup and the SketchCanvas optimistic-rollback operations (confirmed checked `{error}` at those call sites, §4 class A). |
| 10 | 최신 버전 보장 (no stale overwrite) | **FAIL** for the three jsonb `notes` columns (`meetings`, `one_on_ones`, `learning_resources`) — confirmed read-modify-write-from-stale-state at every write site listed in §2 #5/17/18, and `meetings.notes` specifically has 3 independent write surfaces, raising the practical collision odds above STEP 1's original estimate. **PASS** for normalized single-column fields (status, assignee, dates) where last-write-wins is the intended/correct semantics. |

**Overall**: 0 of 10 requirements are a clean PASS across the whole app; quick-memo popup is the only screen that would PASS #7/#9 on its own, and every screen fails #4/#5/#6 (no history mechanism exists at all, by design gap rather than by screen-specific bug).

## 7. Supabase migration 불일치 검증

Re-ran `grep -il "create table.*<name>" supabase/*.sql` (case-insensitive) individually for all 13 tables STEP 1 listed (`agenda_sub_tasks`, `sub_task_notes`, `project_meetings`, `meeting_agenda_links`, `daily_journals`, `objective_groups_v2`, `objectives_v2`, `objective_entries_v2`, `obj_groups`, `obj_objectives`, `obj_sub_items`, `obj_sub_entries`, `persona_logs`) — **zero `CREATE TABLE` hits for all 13, confirming STEP 1's core claim.**

**New nuance found in this STEP**: `agenda_sub_tasks` is not entirely invisible from the migration history — `supabase/schema_v27.sql:6-8` contains `ALTER TABLE agenda_sub_tasks ADD COLUMN IF NOT EXISTS achievement_type text CHECK (...)`, i.e., a later migration *alters* a table whose original `CREATE TABLE` was never committed. This strengthens (not contradicts) STEP 1's conclusion — it confirms the table was genuinely created out-of-band (Supabase SQL editor/dashboard) at some point before v27, since a committed migration assumes its prior existence without ever having created it in this repo.

**Documentation defect found in STEP 1 itself (not a new schema finding, flagging for awareness)**: §1 and §6b both correctly say "13 tables" and list the same 13 names, but §10 point 4 ("16 tables exist in production...") and the opening of §13 ("16 undocumented tables") refer to the same list with a miscounted "16." Per this task's constraint, STEP 1's existing text is not edited — noting the discrepancy here only.

Per-table detail (TS type check performed in this STEP; other columns per STEP 1 §6b, not re-derived):

| Table | Used in | TS type in `src/types/index.ts`? | Migration record | SQL schema | RLS locally checkable? |
|---|---|---|---|---|---|
| `agenda_sub_tasks` | `project/items/[id]`, `subtasks/[id]`, `AgendaMatrix.tsx`, `completed/page.tsx`, `TodayTodoWidget.tsx`, `memo/quick/page.tsx`, `schedule/page.tsx` | **No** — grep for the table name across `src/types/index.ts` returns 0 matches | Partial — `ALTER TABLE` in `schema_v27.sql`, no `CREATE TABLE` anywhere | No | No (dashboard-only) |
| `sub_task_notes` | `project/items/[id]`, `subtasks/[id]`, `TextSelectionCapture.tsx` | No | None found | No | No |
| `project_meetings` | `memo/quick/page.tsx`, `journal/page.tsx`, `DailyJournalWidget.tsx` | No | None found | No | No |
| `meeting_agenda_links` | `meetings/[id]/page.tsx` | No | None found | No | No |
| `daily_journals` | `DailyJournalWidget.tsx`, `journal/page.tsx`, `meetings/[id]/page.tsx`, `perf-review/page.tsx`, `archive/page.tsx` | No | None found | No | No |
| `objective_groups_v2` / `objectives_v2` / `objective_entries_v2` | `objective-review/page.tsx` only | No (all three) | None found | No | No |
| `obj_groups` / `obj_objectives` / `obj_sub_items` / `obj_sub_entries` | `objectives/page.tsx` only | No (all four) | None found | No | No |
| `persona_logs` | `decisions/page.tsx` | No | None found | No | No |

All 13 tables: **zero named TS interface in the shared types file** — call sites almost certainly rely on inferred/`any`-shaped or locally-declared inline types rather than a shared contract, which independently supports STEP 1's "app code is the only source of truth for these tables' shape" conclusion.

## 8. JSONB notes 동시편집 분석

Confirmed race sequence for `meetings.notes` (worst case — 3 independent write surfaces confirmed in §2):

- **T1**: Tab A has `meetings/[id]/page.tsx` open for meeting M, loaded with `meeting.notes = [n1]`.
- **T2**: Tab B has `schedule/page.tsx` open, viewing the same meeting M via its schedule-widget link, independently loaded with its own copy of `notes = [n1]` (or a `MeetingBriefWidget` on the home screen holding the same stale copy).
- **T3**: User adds a note in Tab A → `saveNote()` builds `updatedNotes = [newNoteA, n1]` from Tab A's in-memory `meeting.notes` → `await supabase.from('meetings').update({ notes: [newNoteA, n1] })` — write succeeds, DB now has `[newNoteA, n1]`.
- **T4**: Before Tab B reloads, user (or a teammate on another device, or the same user in another window) adds a note in Tab B/`MeetingBriefWidget` → its handler builds from **its own stale local copy** `[...prev, newNoteB]` where `prev` is still `[n1]` (it never saw `newNoteA`) → writes `{ notes: [n1, newNoteB] }` (or `[newNoteB, n1]` depending on the widget's ordering) → **`newNoteA` is silently overwritten and gone from the DB**, with no error, no conflict signal, no trace it ever existed except possibly still visible in Tab A's stale in-memory state until Tab A's next reload wipes it too.

This is **not a timing/debounce-flush problem** (contrast §9 #7 "unmount without flush") — it would happen even with a perfect, instantly-flushing autosave, because each writer performs a **read-modify-write of the entire column from a client-held copy** with no version check (no `updated_at`/version compare, no `ON CONFLICT` merge, no server-side append). 

**Judgment**: This is a **data model problem, not an autosave-architecture problem.** Fixing the autosave timing (debounce, flush-on-unmount, error surfacing) would not prevent this race — it is caused by storing an ordered list as a single jsonb column that must be rewritten in full on every add, rather than as rows in a normalized child table (exactly as `annual_goal_task_notes`/`sub_task_notes` already do for other entity types, per STEP 1 §10 #2). Same root-cause pattern confirmed present for `one_on_ones.notes` (1 write surface found: the session detail page) and `learning_resources.notes` (1 write surface found: the resource detail page) — lower collision odds than `meetings.notes` (only 1 UI surface each vs. 3), but the identical structural defect.

## 9. 구조적 문제 우선순위화 (P0~P3)

| Priority | Item | Basis (1-line) |
|---|---|---|
| **P0** | Draft/input silently cleared after a failed `notes`/`task_todos` insert on `/tasks/[id]` (§2 #3) | Reachable through ordinary use (any network blip/RLS/auth hiccup), no defense exists, recovery-eligible data (the draft) is actively destroyed by the same code path that should have preserved it on failure. |
| **P0** | Failed save shown/behaves as success on `meetings/[id]` (`updateMeeting`) and `MobileMemoSheet` (§2 #1/#2) | Failure is indistinguishable from success in the UI on ordinary use — meets the "failure shown as success" P0 criterion directly. |
| **P0** | `meetings.notes` (and same-pattern `one_on_ones.notes`, `learning_resources.notes`) stale-overwrite on concurrent edit (§8) | Confirmed reproducible T1-T4 sequence; Data Loss Severity=HIGH (silent, permanent, no trace) AND Likelihood>=MEDIUM given 3 independent write surfaces on `meetings.notes` alone (meeting page + schedule widget + home brief widget) — meets the P0 rule explicitly. |
| **P1** | Unmount-without-flush losing an in-flight debounced edit (§2 #7) | Requires a specific navigation-timing condition (edit then immediately navigate within the debounce window); confined to detail-editor screens; no recovery path, but requires the boundary condition to trigger. |
| **P1** | Refresh/tab-close during debounce on no-draft detail-editor fields (§2 #8/9, §6 #2/#8) | Same boundary-condition profile as above (requires refresh/close specifically inside the debounce window); screen-scoped (LEVEL-2 screens only, §5); no recovery. |
| **P1** | `one_on_one_template` select-then-branch race (confirmed still present, §4 class D) | Requires two tabs/sessions racing on first-time template creation specifically — narrow condition, but zero mitigation for the cross-tab case despite the newly-added `insertInFlight` guard (which only covers same-tab re-entrancy). |
| **P2** | No shared autosave utility / ~10 files reimplement the same debounce shape independently (STEP 1 §10 #1, re-confirmed by the file list in §4 class C here) | Maintainability/consistency issue, not itself a data-loss event — but is the reason the same bugs recur across files. |
| **P2** | Two parallel "settings" tables (`user_settings` vs `user_preferences`) plus localStorage triple-write (STEP 1 §10 #7, confirmed via grep of both tables' call sites in this STEP) | Inconsistency/duplication, low direct loss risk (both are debounced last-write-wins key/value stores, not append-only data). |
| **P2** | Inconsistent error-checking within single files (`AgendaMatrix.tsx`/`AnnualRoadmap.tsx` check reorder errors but not field-edit errors; `memos/page.tsx` checks insert but not update) | UX/consistency gap; the unchecked half of each pair is already captured under P0/P1 items above via §2 #1, so this entry is the "why is it inconsistent" cross-cutting note, not a new loss path. |
| **P3** | Migration-file schema drift documentation gap — 13 tables with no `CREATE TABLE` (§7) | Confirmed real and structurally important for STEP 2/3 planning, but is a documentation/governance gap, not itself a live data-loss mechanism — correctly P3 per the rubric ("문서화·코드정리 등 비핵심") even though it is high-priority for planning purposes. |
| **P3** | STEP 1's internal miscount ("13" vs "16" tables, §7) | Documentation accuracy issue only, zero runtime impact. |

**UNKNOWN items** (not assigned P0-P3, per instruction — no guessing): Auth-session-expiry-mid-edit real-world frequency (STEP 1 §9 #12) — cannot be assessed without Supabase Dashboard auth-config access; actual production incidence of any of the above (whether these have already caused reported data loss) — cannot be assessed without Supabase logs/user reports, both out of this audit's reach (§13).

## 10. 보존해야 할 기존 기능 확정

Directly re-confirmed as present and functioning as described, all must be preserved in any redesign:

- Quick-memo popup's full draft lifecycle: per-window `qid`-scoped draft (`quick_memo_drafts`), orphan-draft recovery picker, checked-error-with-retained-draft on save failure, 3-day/50-entry archive safety net (`memo/quick/page.tsx`).
- Multi-window heartbeat mechanism for "is another quick-memo popup alive" (`lib/quickMemo.ts`), including its own `beforeunload` cleanup — confirmed correct and independent of the save-path bugs found elsewhere.
- Sketch canvas's optimistic-update-with-rollback (`addCardToFrame`/`removeCardFromFrame`/`handleConnect`, confirmed checked `{error}` + `alert()` + state revert) and drag-stop-only position persistence (confirmed `savePosition` only fires from `onNodeDragStop`, never per-move).
- `AgendaMatrix.tsx`/`AnnualRoadmap.tsx` drag-reorder error toasts (`setDndErr`, 4-second visible message) — confirmed present at 6 call sites in `AgendaMatrix.tsx` alone.
- `JSON.parse` defensive `try/catch` wrapping on every localStorage draft read (universal pattern, confirmed in `quickMemo.ts`, `memo/quick/page.tsx`, and all other draft readers checked).
- `user_preferences`/`user_settings` dual-write-with-localStorage-fallback optimistic-UI pattern in `settings/page.tsx` (confirmed 6 `upsert` call sites) — worth keeping the UX pattern even while consolidating the backing tables.
- Perf-review's period-switch flush (the one genuine "flush on a specific transition" mechanism in the app) — not independently re-verified line-by-line in this STEP (out of the direct-read set above) but no reason found to doubt STEP 1's citation; worth preserving and generalizing per STEP 1 §12.
- The `one-on-one/template` page's `insertInFlight` same-tab re-entrancy guard — newly noticed in this STEP, not mentioned in STEP 1; worth keeping even though it doesn't fully close the cross-tab race (§4).

## 11. 다음 Architecture Questions (질문만, 답변 없음)

1. Autosave history를 위한 별도 table을 둘 것인가, 아니면 기존 row에 jsonb 버전 배열을 추가할 것인가?
2. Entity별 generic draft table(예: `drafts(entity_type, entity_id, content, updated_at)`)을 하나 둘 것인가, 아니면 스크린별 개별 draft 유지가 나은가?
3. Versioning 방식은 append-only history table인가, 아니면 각 row에 `version` 정수 컬럼 + optimistic lock인가?
4. `meetings`/`one_on_ones`/`learning_resources`의 jsonb `notes` 배열을 정규화된 child table로 마이그레이션할 것인가 — 한다면 몇 단계로 나눠 진행하며, 기존 jsonb 데이터는 어떻게 이관하는가?
5. Optimistic concurrency control(예: `updated_at` 비교 후 conflict 감지)이 필요한 범위는 전체 app인가, jsonb-notes 계열 3개 테이블만인가?
6. 7일 retention을 DB에서 어떻게 관리할 것인가 — TTL cron/scheduled function인가, 아니면 조회 시점 필터링인가?
7. Local draft와 server draft/history의 관계는 무엇인가 — local draft는 server에 도달하기 전까지의 임시 버퍼로만 쓰고 server 쪽 history가 진짜 source-of-truth가 되는가?
8. 마지막 입력을 언제 flush하는가 — unmount, `beforeunload`, 라우트 전환 시점, 혹은 셋 다인가?
9. Offline queue가 필요한가 (네트워크 끊긴 동안의 편집을 큐에 쌓아뒀다가 재연결 시 재전송)?
10. 여러 탭이 같은 record를 열었을 때 어떻게 처리할 것인가 — BroadcastChannel로 탭 간 동기화? 마지막 탭만 쓰기 허용? 충돌 시 merge UI?
11. History 조회 UI는 어디에 위치하는가 — 각 record 상세 화면 내 사이드패널인가, 별도 전역 히스토리 페이지인가?
12. "저장"과 "자동저장"을 사용자에게 구분해서 보여줄 것인가 (수동 저장 버튼 vs 자동 debounce 저장의 상태 표시를 다르게 할지)?
13. 13개 미문서화 테이블(`agenda_sub_tasks` 등, §7)을 어떻게 관리할 것인가 — 이번 기회에 전부 `CREATE TABLE`로 역-문서화(reverse-engineer)해서 커밋할 것인가, Supabase Dashboard에서 스키마를 pull하는 자동화를 둘 것인가?
14. 기존 ~15개 autosave 구현을 새 공용 primitive로 전환할 때 한 번에 다 바꿀 것인가, 위험도 높은 화면(P0/P1)부터 단계적으로 이관할 것인가?
15. 기존 localStorage draft 포맷(`quick_memo_drafts`, `meeting_draft_${id}` 등)을 새 아키텍처의 draft 저장 방식으로 마이그레이션할 것인가, 아니면 병행 운영 후 폐기할 것인가?
16. `obj_*` 4테이블과 `objective*_v2` 3테이블 중 어느 쪽이 살아있는 기능인지 — 이 답이 나오기 전까지 "objectives" 관련 autosave 설계를 보류할 것인가?
