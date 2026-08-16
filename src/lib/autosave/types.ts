// Types for the generic Autosave Core (docs/autosave-architecture.md Ch.5-16,
// docs/autosave-db-design.md §2-§9). Used only by src/hooks/useAutosave.ts and
// src/app/memo/quick/page.tsx (dev pilot) — per this STEP's scope, not wired
// into any other screen yet.

/** State machine from architecture Ch.6. */
export type AutosaveStatus =
  | 'idle'          // not yet enabled / no entity to save against
  | 'local-saving'  // value just changed, local buffer write in flight (synchronous, effectively instantaneous)
  | 'pending-sync'  // local buffer written, debounce timer running, server sync not yet attempted
  | 'syncing'       // server sync request in flight
  | 'saved'         // last server sync succeeded, buffer content == server content
  | 'retrying'      // last sync failed, backoff retry scheduled, local buffer retained
  | 'error'         // sync failing repeatedly / non-retryable error, local buffer retained
  | 'conflict'       // CAS rejected — another tab/device/session already advanced version_no

export type AutosaveFailureReason =
  | 'network'
  | 'server_error'
  | 'auth_expired'
  | 'quota_exceeded'
  | 'unknown'

export type AutosaveSource = 'auto' | 'final' | 'restore'

/** Schema-versioned local recovery buffer envelope (architecture Ch.10). */
export interface AutosaveBufferEnvelope<T> {
  schemaVersion: 1
  entityType: string
  entityId: string
  fieldKey: string
  value: T
  versionNo: number
  updatedAt: number
}

export interface AutosaveConflictInfo<T> {
  serverContent: T
  serverVersionNo: number
  localValue: T
}

export interface UseAutosaveResult<T> {
  status: AutosaveStatus
  failureReason: AutosaveFailureReason | null
  conflict: AutosaveConflictInfo<T> | null
  lastSyncedAt: number | null
  /** Set once on mount if the local buffer holds a value newer/different than the
   *  initial `value` passed in (e.g. a crash before the in-memory state was set from
   *  it) — null once acknowledged via discardRecovered()/applied by the caller. */
  recovered: { value: T; updatedAt: number } | null
  /** Force an immediate flush of the current value, bypassing debounce. Used by the
   *  explicit Save button (architecture Ch.16) — tags the resulting version 'final'.
   *  Pass `rebindToEntityId` for a "create" flow whose `entityId` is a temp
   *  client-side id (docs/autosave-rollout-plan.md §16 items 24/25): once the
   *  canonical row's real id is known, this atomically (a) flushes the current
   *  value as normal under the temp id, then (b) if that succeeded, moves the
   *  EXISTING autosave_drafts row's entity_id to the canonical id (CAS-gated,
   *  same-row-only) and inserts a fresh canonical-id content_versions row
   *  (source='final') — content_versions is append-only, so no existing row
   *  (temp-id or otherwise) is ever updated/deleted by this. Rebind failure is
   *  reported via the returned `rebind` field; it never rolls back the flush
   *  itself, which has already durably synced by the time rebind runs. */
  flush: (
    opts?: { source?: AutosaveSource; rebindToEntityId?: string },
  ) => Promise<{ ok: boolean; error?: string; rebind?: { ok: boolean; error?: string } }>
  /** Manually trigger a retry attempt right now (in addition to automatic backoff/online-event retries). */
  retryNow: () => void
  /** Resolve a `conflict` state: 'keep-mine' re-attempts the sync with a freshly-read
   *  version (overwriting server content); 'take-theirs' clears the conflict and lets
   *  the caller adopt `conflict.serverContent` into its own state. */
  resolveConflict: (choice: 'keep-mine' | 'take-theirs') => Promise<void>
  /** Acknowledge/discard the `recovered` banner without applying it. */
  discardRecovered: () => void
}
