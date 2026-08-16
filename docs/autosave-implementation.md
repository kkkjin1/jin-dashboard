# Autosave Implementation — STEP 5 Phase 2 (Quick Memo Dev Pilot)

**Status**: Dev-pilot proof of concept only. **Production Quick Memo has not been changed in behavior** and this work has **not** been deployed/enabled in production in any way — see "Production status" at the end.

Scope: `src/app/memo/quick/page.tsx` only, gated behind a dev-only pilot flag. Built on top of `docs/autosave-architecture.md` (STEP 3) and `docs/autosave-db-design.md` (STEP 4/5), against the real `autosave_drafts`/`content_versions` tables in the dev Supabase project (`vuxxanxuuwoduxmslrwh.supabase.co`).

## 1. Changed / new files

| File | Change |
|---|---|
| `src/app/memo/quick/page.tsx` | Modified. Added dev-pilot branch (`getDevPilotClient()` → `activeSupabase`), `useAutosave()` wiring, DEV PILOT badge, autosave status/recovery/conflict UI. All existing logic (legacy `quick_memo_drafts`/`quick_memo_archive`, orphan picker, heartbeat, Save/Discard) is untouched. |
| `src/lib/supabase/devPilotClient.ts` | New. `getDevPilotClient()` (null when pilot env vars absent), `ensureDevPilotSession()` (auto sign-in with dev test account). |
| `src/hooks/useAutosave.ts` | New. Generic Autosave Core hook (local buffer, debounce, CAS, retry, versioning, conflict). Not imported anywhere except quick/page.tsx. |
| `src/lib/autosave/types.ts` | New. Shared types (`AutosaveStatus`, envelope, conflict info, hook return shape). |
| `scripts/verify-autosave-dev.mjs` | New. Node script reading credentials only from `.env.development.local`, prints live `autosave_drafts`/`content_versions` rows for `entity_type='quick_memo'`. |
| `.env.development.local` | New (git-ignored — confirmed via `git check-ignore`). Dev-pilot config, see §2. |
| `docs/autosave-implementation.md` | New (this file). |

No other file was modified. No canonical table (`quick_memos`, etc.) or RLS policy was changed.

## 2. Dev/prod separation

- `.env.development.local` holds `NEXT_PUBLIC_SUPABASE_DEV_PILOT_URL`, `NEXT_PUBLIC_SUPABASE_DEV_PILOT_ANON_KEY`, `NEXT_PUBLIC_AUTOSAVE_PILOT_ENABLED=true` (the 3 vars the user approved), plus two additional vars added out of necessity: `NEXT_PUBLIC_SUPABASE_DEV_PILOT_TEST_EMAIL`/`_PASSWORD` (the dev test account `jintest@naver.com`). These are required because `autosave_drafts`/`content_versions` use ownership RLS (`auth.uid() = user_id`) — without an authenticated pilot session, every write is rejected. Only ever read from `.env.development.local`; never hardcoded.
- Next.js loads `.env.development.local` only under `next dev`; `next build`/`next start` never read it — confirmed by the dev server startup log (`Environments: .env.development.local, .env.local`) and, before creating the file, verified the baseline log showed only `.env.local`.
- `getDevPilotClient()` returns `null` if any of the 3 core vars is missing, and additionally refuses to activate if `NEXT_PUBLIC_SUPABASE_DEV_PILOT_URL` equals `NEXT_PUBLIC_SUPABASE_URL` (defense-in-depth against misconfiguration).
- **Critical bug found and fixed during this STEP**: `@supabase/ssr`'s `createBrowserClient()` caches a *module-level* singleton and silently returns it on every call regardless of the url/key arguments, unless `{ isSingleton: false }` is passed (confirmed by reading `node_modules/@supabase/ssr/dist/main/createBrowserClient.js`). Because the app's own `src/lib/supabase/client.ts` calls `createBrowserClient(prodUrl, prodKey)` elsewhere in the app, `getDevPilotClient()` was initially returning the **production client** silently — confirmed via a browser network-request capture that showed the first `autosave_drafts` request going to the production project URL (`nolzmgvvfumavobyaiwe.supabase.co`), 404'ing harmlessly only because that table doesn't exist in production. Fixed by passing `{ isSingleton: false }` in `devPilotClient.ts`. Re-verified after the fix: all subsequent requests went to the dev pilot URL only; **no writes ever reached the production project** (confirmed both by the pre-fix 404 causing no data to be written, and by a post-fix network log scan finding zero requests to the production URL for the remainder of testing).
- Quick Memo screen branches once per Supabase call: `const activeSupabase = pilotClient ?? supabase`. When pilot is off, `activeSupabase === supabase` (identical reference/behavior to before this STEP).

## 3. `useAutosave()` API

```ts
useAutosave<T>({
  supabase: SupabaseClient | null,   // null => hook fully inert (status stays 'idle', no localStorage writes, no network)
  enabled: boolean,
  entityType: string, entityId: string, fieldKey: string,
  value: T,
  debounceMs?: number,               // default 700
  onRecoveredAvailable?: (value: T) => void,
}): {
  status: 'idle'|'local-saving'|'pending-sync'|'syncing'|'saved'|'retrying'|'error'|'conflict',
  failureReason: 'network'|'server_error'|'auth_expired'|'quota_exceeded'|'unknown'|null,
  conflict: { serverContent: T, serverVersionNo: number, localValue: T } | null,
  lastSyncedAt: number | null,
  recovered: { value: T, updatedAt: number } | null,
  flush: (opts?: { source?: 'auto'|'final'|'restore' }) => Promise<{ ok: boolean; error?: string }>,
  retryNow: () => void,
  resolveConflict: (choice: 'keep-mine'|'take-theirs') => Promise<void>,
  discardRecovered: () => void,
}
```

Quick Memo wires it as `entityType: 'quick_memo'`, `entityId: <per-window qid>`, `fieldKey: 'draft'`, `value: { title, content, tag }` (one combined field — matches the existing per-window-slot draft model already in `quick/page.tsx`).

### Local persistence
Every value change writes synchronously to `localStorage['autosave_buffer_v1:quick_memo:<qid>:draft']` (schema-versioned JSON envelope), independent of network state — mirrors the existing legacy `quick_memo_drafts` key, which is left completely untouched.

### Server sync / debounce
~700ms debounce per entity/field. Uses the CAS pattern from `docs/autosave-db-design.md` §4: first sync is an `INSERT` (falls back to the CAS `UPDATE` path on a `23505` unique-violation race); subsequent syncs are `UPDATE ... WHERE version_no = expected`. A 0-row result means someone else's write already advanced `version_no` → `conflict` state, never silently retried/overwritten.

### Retry
Exponential backoff 2s→4s→8s→15s, then every 30s, until success or unmount. The browser `online` event triggers an immediate retry attempt, bypassing the backoff timer.

### Versioning / history
On every successful sync, a `content_versions` row is inserted only if its content hash differs from the immediately-preceding version for that key, **except** `source='final'`/`'restore'`, which always insert (matches `docs/autosave-db-design.md` §4 dedup rule).

### Conflict
Version-compare rejection surfaces `conflict` with both the server's current content and the caller's own unsent value; `resolveConflict('keep-mine')` re-attempts the sync from the server's version (overwrite); `resolveConflict('take-theirs')` clears the conflict and leaves it to the caller (Quick Memo's UI) to adopt `conflict.serverContent` into its own React state. No automatic merge.

### Recovery
On mount, compares the local buffer against the initial value passed in; if different, exposes `recovered` and calls `onRecoveredAvailable` (Quick Memo does **not** auto-apply it — shows a banner with 적용/무시, matching architecture Ch.15's "never silently auto-applied" requirement).

## 4. Stage 1 — null-fallback verification (done first, per required order)

With `.env.development.local` **not yet created**, ran `npm run dev` (log confirmed `Environments: .env.local` only) and exercised the existing Quick Memo screen in a real browser (Claude in Chrome): typing into title/content, instant `quick_memo_drafts` localStorage write, tag switching, refresh-recovery of the draft. Confirmed via `localStorage` inspection that **no** `autosave_buffer_v1:*` key was ever created (hook fully inert) and no console errors. **Result: PASS — screen behaves 100% identically to before this STEP when the pilot is off.** Did not click Save while pilot was off, to avoid any risk of writing to the production `quick_memos` table.

Only after this confirmed PASS was `.env.development.local` created and the pilot enabled.

## 5. TEST A–L (real dev-DB execution)

All tests run against the real dev Supabase project via a live browser (Claude in Chrome) plus direct DB verification via `scripts/verify-autosave-dev.mjs`. Failure/offline scenarios were simulated by intercepting `window.fetch` for the `autosave_drafts` endpoint only (not a mock DB — every *successful* write in these tests is a real REST call against the real dev project).

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| A | 타이핑 → localStorage 즉시 확인 | instant write | `autosave_buffer_v1:...` written synchronously on first keystroke, verified via `localStorage.getItem` immediately after typing | **PASS** |
| B | 연속 타이핑 → 매 keypress마다 서버 write 발생 안 함 | 1 request for a burst of keystrokes | Exactly 1 `PATCH .../autosave_drafts` request captured for an 8-character burst typed within the debounce window | **PASS** |
| C | 입력중 새로고침 → draft 복구 | full content restored | Full concatenated title text restored after reload (via existing legacy mechanism; hook's own buffer held matching content, no divergence) | **PASS** |
| D | server sync 성공 → 실제 행 확인 | `autosave_drafts` + `content_versions` rows exist | Confirmed via `verify-autosave-dev.mjs`: draft row with correct `version_no`/content, matching version-history rows with distinct hashes per distinct edit | **PASS** |
| E | server sync 실패 → local draft 유지 | status shows failure, input preserved | `window.fetch` intercepted to reject for `autosave_drafts`; status showed "오프라인 — 재연결 시 자동 저장" (correctly classified as `network`), typed text remained visible in the input | **PASS** |
| F | 실패 후 retry → 성공시 서버 상태 회복 | automatic backoff retry succeeds | Restored `fetch`, waited ~3s; status recovered to "자동저장됨(서버)" via the automatic 2s-backoff retry; DB confirmed final content persisted with an incremented `version_no` | **PASS** |
| G | 실패 후 새로고침 → 입력값 복구 | input recovered | Typed content while `fetch` still intercepted, reloaded immediately; full text (including the not-yet-synced suffix) was present after reload | **PASS** |
| H | offline → typing → online → sync | `online` event triggers immediate retry (not waiting for backoff) | Blocked `fetch`, typed, then simultaneously restored `fetch` and dispatched a synthetic `online` event; status showed "자동저장됨(서버)" within ~1s — well before the natural 2s backoff would have fired | **PASS** |
| I | Save 버튼 성공 → canonical save + draft lifecycle 정상 | canonical insert succeeds, autosave stamps a `source='final'` version, draft continues (not deleted) | **Canonical `quick_memos` insert had to be mocked** (see §6 — pre-existing dev-project gap, unrelated to this STEP's code); the post-success code path (`autosave.flush({source:'final'})`) ran for real against the dev DB — confirmed via `verify-autosave-dev.mjs`: a `content_versions` row with `source='final'` was created exactly at Save time, followed by the next auto-cycle continuing normally on the same entity/draft row | **PASS (with the caveat above — see §6)** |
| J | Save 버튼 실패 → draft/input 보존 | input/draft preserved, error shown, no false success | Real (unmocked) `quick_memos` 404 from the dev project triggered the existing failure path; title text remained in the input, "저장 실패" banner shown, no "저장됨!" message | **PASS** |
| K | 두 탭 동일 메모 → conflict 감지, 자동병합 안 함 | conflict detected, user chooses resolution | Two real browser tabs loaded the same draft (same `qid`); both tabs' redundant/independent syncs raced on the same CAS token, producing a genuine version conflict organically (Tab 1: CAS from v10 rejected because Tab 2 had already advanced to v11) — confirmed via `verify-autosave-dev.mjs`. Both resolution paths tested live: "내 내용 유지" correctly overwrote server content with Tab 1's edit (verified via DB, new version created); "서버 내용 사용" (in a second, separate conflict) correctly adopted the server's content into Tab 2's React state, discarding Tab 2's own unsent edit | **PASS** |
| L | STEP3.5급 P0 회귀 (insert 실패 시 draft/input 보존, 실패=성공 오표시 금지) | same guarantee under the new architecture | Same evidence as TEST J — a **real** Supabase error (`PGRST205`, not synthetic) left the draft/title/content fully intact, showed the failure banner, and never showed a success message; the code path is unchanged from STEP 3.5's fix (still destructures `{ error }` and returns early before ever calling `autosave.flush`) | **PASS** |

A recovery-banner-specific test (deliberately seeding a divergent `autosave_buffer_v1` entry vs. the legacy-restored value) was also run: on reload, "복구 가능한 자동저장 내용이 있습니다" banner appeared with 적용/무시; clicking 적용 correctly applied the buffered value into the title field (this path doesn't normally fire in practice since the legacy mechanism already restores matching content — this test forced the divergence to confirm the code path itself works).

## 6. Dev-environment gap discovered (not caused by this STEP's code)

All canonical tables (`quick_memos`, `agenda_groups`, `agenda_items`, `tasks`, `meetings`, ...) return `404 PGRST205 "Could not find the table ... in the schema cache"` in the dev pilot project, while the two new tables (`autosave_drafts`, `content_versions`, created later via `autosave-migration-v1.sql`) work correctly. This is a PostgREST schema-cache issue in the dev project (likely the canonical schema's DDL was applied in a way that never triggered a schema-cache reload), **not** something this STEP's code caused, and outside this STEP's permitted actions to fix (no service-role/dashboard access). Practical impact:
- TEST I's canonical `quick_memos` insert had to be mocked at the `fetch` layer (only for that one endpoint; every other call in that test, including the autosave flush, was real).
- TEST J/L's failure path is, if anything, **more strongly validated** by this — it's a genuine, unplanned Supabase error, not a synthetic one, and the existing P0 fix handled it correctly.
- The "회의관련" (project_meetings) and "세부task" (agenda_sub_tasks) branches of Quick Memo were not exercised against the dev DB at all, consistent with `docs/autosave-db-design.md` §24's already-documented list of screens/branches not testable in this dev project.

## 7. Final verification

- `npx tsc --noEmit`: **clean, zero errors** (checked before and after all changes).
- `npx eslint` on all new/changed autosave files (`useAutosave.ts`, `types.ts`, `devPilotClient.ts`): **clean, zero errors/warnings** after two fixes made during this STEP: (1) moved three "assign ref during render" statements into `useEffect` per the `react-hooks/refs` rule (React's documented "latest ref" pattern, now expressed via effects instead of inline-during-render for lint compliance — behaviorally identical), (2) removed unused `eslint-disable` comments / added one justified one.
- `npx eslint src` (whole project): 75 errors / 129 warnings — **pre-existing baseline**, confirmed via `git diff` that the 2 errors remaining in `quick/page.tsx` (`setIsHolderState` inside an effect at line 152, `document.title =` at line 254) are on lines this STEP's diff never touches — unrelated to this work.
- `git status`/`git diff --stat`: only `src/app/memo/quick/page.tsx` was modified by this STEP among tracked files. **Correction (found and fixed in STEP 6.5 Precondition #4 — the sentence originally here mischaracterized 3 of the 6 other pre-existing modified files as STEP 3.5 P0 patches; re-verified directly against `git diff`, not re-asserted from memory):** the other files listed in `git status` fall into two unrelated groups, neither touched by this STEP:
  - **Actual STEP 3.5 P0 safety patches** (exactly 3, already implemented and verified before this STEP): `tasks/[id]/page.tsx` (P0-1 — insert error check, draft preserved on save failure), `meetings/[id]/page.tsx`'s `updateMeeting` (P0-2 — returns a boolean, prevents a failed save from being shown as "저장됨"), `MobileMemoSheet.tsx` (P0-3 — insert error check, sheet kept open and content preserved on failure).
  - **Unrelated meeting-list UI redesign, not a P0 patch of any kind**: `MeetingNotesNew.tsx`, `MeetingSection.tsx`, `SearchToolbar.tsx`. These 3 files' uncommitted diffs are a meeting-list UI redesign (a preview panel, a moved search box, category-section preview rows) with no autosave, error-handling, or save-timing changes at all — confirmed by reading their actual `git diff` content. They happened to exist as uncommitted changes at the same point in this project's history as the STEP 3.5 P0 patches, which is the only reason they were ever grouped with them; they are not part of STEP 3.5's P0 patch set and should never be described as such.
  - For clarity, **JSONB interim lock (미착수, Track B 관련 후속 과제)** — the interim optimistic-lock mitigation for the `meetings.notes`/`one_on_ones.notes`/`learning_resources.notes` JSONB columns mentioned in `docs/autosave-architecture.md`'s Phase 0 plan — is a distinct, not-yet-started piece of work and is not related to, and must never be labeled as, STEP 3.5's actual P0-3 (`MobileMemoSheet.tsx`, already implemented and verified above). The two are unrelated items that happen to both be numbered/associated with "P0" in different documents.
- `.env.local` changed: **NO** (confirmed — does not appear in `git status`/`git diff` at all).
- Production Supabase project write: **NO** (confirmed — the one accidental request that reached the production project, caused by the `@supabase/ssr` singleton bug described in §2, 404'd because the table doesn't exist there; fixed immediately, and a post-fix network-log scan for the production URL found zero further requests for the rest of testing).

## 8. Categorized summary

**IMPLEMENTED**: `useAutosave()` hook (local buffer, debounce, CAS-based server sync, exponential-backoff retry with online-event fast path, content-hash-deduped version history, conflict detection/resolution, mount-time recovery, unmount flush); `devPilotClient.ts` (null-safe dev/prod client switch with singleton-bug workaround and same-URL guard); Quick Memo wiring (DEV PILOT badge, autosave status indicator, recovery banner, conflict banner, Save-button final-version stamping); `verify-autosave-dev.mjs` DB inspection script.

**LOCALLY VERIFIED**: `tsc --noEmit` clean; `eslint` clean on all new files; Stage-1 null-fallback parity confirmed in a live browser; code-path review confirming `.flush({source:'final'})` is only reached after a successful canonical write, never on failure.

**DEV DB VERIFIED** (executed against the real dev Supabase project, not mocked, except the one noted exception): TEST A–L above, all PASS; the `@supabase/ssr` singleton bug and its fix; the canonical-table schema-cache gap in the dev project.

**NOT VERIFIED / REMAINING RISK**:
- Cross-*device* recovery (only cross-*tab*, same browser, was tested — no second physical device/browser profile was used).
- The "회의관련"/"세부task" Quick Memo branches (project_meetings/agenda_sub_tasks) were not exercised against the dev DB (tables unavailable in this dev project per §24 of the db-design doc).
- No automated test suite exists for any of this (per this STEP's explicit constraint not to introduce vitest/jest) — all verification above is manual/scripted, not regression-suite-backed; a future code change could silently break any of TEST A–L without a CI signal.
- The 7-day retention cleanup job (§5 of the db-design doc) was never implemented (explicitly out of scope / SHOULD-priority per that document) — `content_versions`/`autosave_drafts` rows created during this STEP's testing will persist until a cleanup job exists or someone deletes them manually.
- `localStorage` quota-exceeded handling (architecture Ch.7 scenario J) is implemented in code but was not exercised live (would require actually filling `localStorage` to capacity).
- The canonical-table schema-cache gap in the dev project (§6) means TEST I's canonical write itself is not proven end-to-end in this dev environment; it is proven in the sense that the *existing, unmodified* `quick_memos` insert call — same code, same table, same call shape used every day in production — is what actually executed (and would have succeeded had the table been visible to PostgREST); only the response was substituted.

**Production Quick Memo behavior after this STEP**: unchanged. Every code path added in this STEP is gated behind `getDevPilotClient() !== null`, which is `null` whenever `.env.development.local` doesn't exist or `NEXT_PUBLIC_AUTOSAVE_PILOT_ENABLED` isn't exactly `'true'` — both of which are true for any production build (`next build`/`next start` never load `.env.development.local`). **Production transition/rollout has not been performed, prepared, or implied by this STEP** — this is a pilot validation only, on `src/app/memo/quick/page.tsx`, in a dev-only project.
