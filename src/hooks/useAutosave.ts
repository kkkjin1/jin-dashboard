'use client'

// Generic Autosave Core hook (docs/autosave-architecture.md Ch.5-16,
// docs/autosave-db-design.md §2-§9). Implements, for ONE (entityType, entityId,
// fieldKey) at a time:
//   - synchronous local recovery buffer (localStorage, schema-versioned)
//   - ~700ms debounced server sync to `autosave_drafts`, gated by an optimistic
//     version compare-and-swap (CAS)
//   - exponential backoff retry (2s→4s→8s→15s, capped, then a slow background
//     retry) + immediate retry on the browser `online` event
//   - version history writes to `content_versions`, deduped by content hash,
//     except source='final'/'restore' which always insert
//   - conflict detection/surfacing (no automatic merge)
//   - recovery-on-mount (local buffer vs. the initial value the caller passed in)
//   - unmount flush (best-effort)
//
// Scope note: imported by src/app/memo/quick/page.tsx and
// src/components/meetings/MeetingNotesNew.tsx. It is deliberately generic
// (keyed by entityType/entityId/fieldKey, per architecture Ch.5 Option C),
// and its session check (ensureAuthenticatedSession, STEP A-2) has no
// dev-pilot-specific logic — the caller decides which Supabase client
// (dev-pilot or production) to pass in.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureAuthenticatedSession } from '@/lib/supabase/authSession'
import type {
  AutosaveBufferEnvelope,
  AutosaveConflictInfo,
  AutosaveFailureReason,
  AutosaveSource,
  AutosaveStatus,
  UseAutosaveResult,
} from '@/lib/autosave/types'

const BACKOFF_MS = [2000, 4000, 8000, 15000]
const BACKOFF_SLOW_MS = 30000
const DEFAULT_DEBOUNCE_MS = 700

function bufferKey(entityType: string, entityId: string, fieldKey: string) {
  return `autosave_buffer_v1:${entityType}:${entityId}:${fieldKey}`
}

function readBuffer<T>(entityType: string, entityId: string, fieldKey: string): AutosaveBufferEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(bufferKey(entityType, entityId, fieldKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.schemaVersion !== 1) return null // future/incompatible format — discard rather than misinterpret
    return parsed as AutosaveBufferEnvelope<T>
  } catch {
    return null
  }
}

function writeBuffer<T>(envelope: AutosaveBufferEnvelope<T>): 'ok' | 'quota_exceeded' | 'error' {
  try {
    localStorage.setItem(
      bufferKey(envelope.entityType, envelope.entityId, envelope.fieldKey),
      JSON.stringify(envelope),
    )
    return 'ok'
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) return 'quota_exceeded'
    return 'error'
  }
}

function clearBuffer(entityType: string, entityId: string, fieldKey: string) {
  try { localStorage.removeItem(bufferKey(entityType, entityId, fieldKey)) } catch {}
}

// Small deterministic non-cryptographic hash (FNV-1a) — sufficient for the
// content-hash dedup rule (docs/autosave-db-design.md §4 Step 3); we only need
// "same content → same hash", not collision-resistance against an adversary.
function hashContent(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

function classifyError(err: unknown): AutosaveFailureReason {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network'
  const msg = (err as { message?: string; status?: number })?.message?.toLowerCase() ?? ''
  const status = (err as { status?: number })?.status
  if (status === 401 || msg.includes('jwt') || msg.includes('expired')) return 'auth_expired'
  if (msg.includes('fetch') || msg.includes('network')) return 'network'
  if (status && status >= 500) return 'server_error'
  return 'unknown'
}

export interface UseAutosaveOptions<T> {
  /** Pass the (possibly null) Supabase client. When null, the hook is fully
   *  inert — status stays 'idle', no localStorage writes, no network calls —
   *  so callers can pass a pilot-or-null client without extra branching. */
  supabase: SupabaseClient | null
  enabled: boolean
  entityType: string
  entityId: string
  fieldKey: string
  value: T
  debounceMs?: number
  /** Called at most once per mount, if the local buffer holds a value that
   *  differs from `initialValue` — lets the caller apply the recovered value
   *  into its own React state (e.g. setTitle/setContent/setTag). */
  onRecoveredAvailable?: (value: T) => void
}

export function useAutosave<T>({
  supabase,
  enabled,
  entityType,
  entityId,
  fieldKey,
  value,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onRecoveredAvailable,
}: UseAutosaveOptions<T>): UseAutosaveResult<T> {
  const active = enabled && !!supabase && !!entityId

  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [failureReason, setFailureReason] = useState<AutosaveFailureReason | null>(null)
  const [conflict, setConflict] = useState<AutosaveConflictInfo<T> | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [recovered, setRecovered] = useState<{ value: T; updatedAt: number } | null>(null)

  const valueRef = useRef(value)
  const versionNoRef = useRef(0)
  const rowExistsRef = useRef(false)
  const inFlightRef = useRef(false)
  const supersededRef = useRef(false)
  const mountedRef = useRef(true)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryAttemptRef = useRef(0)
  const recoverAckedRef = useRef(false)
  const keyRef = useRef({ entityType, entityId, fieldKey })

  const attemptSyncRef = useRef<(source?: AutosaveSource) => Promise<{ ok: boolean; error?: string }>>(
    async () => ({ ok: false, error: 'not-ready' }),
  )
  const rebindRef = useRef<(canonicalId: string) => Promise<{ ok: boolean; error?: string }>>(
    async () => ({ ok: false, error: 'not-ready' }),
  )

  // Keep the "latest value"/"latest key" refs in sync every render — done in an
  // effect (not inline during render) per react-hooks/refs: refs are consulted
  // later from async closures (debounce/retry timers, event handlers), never
  // read synchronously during this same render, so post-render timing is fine.
  useEffect(() => { valueRef.current = value })
  useEffect(() => { keyRef.current = { entityType, entityId, fieldKey } })

  // ── mount/unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── recovery-on-mount + server draft bootstrap (once per entity key) ───
  useEffect(() => {
    if (!active) return
    recoverAckedRef.current = false
    // Reset per-entity CAS state whenever the (entityType, entityId, fieldKey)
    // key changes during this hook's lifetime (e.g. a "create" flow's Final
    // Save rotates entityId to a fresh id for the next draft) — without this,
    // a stale rowExistsRef/versionNoRef from the PREVIOUS entity_id would make
    // the next sync wrongly attempt a CAS-UPDATE (targeting a row that doesn't
    // exist under the new id) instead of the correct first-time INSERT.
    rowExistsRef.current = false
    versionNoRef.current = 0
    const { entityType: et, entityId: eid, fieldKey: fk } = keyRef.current

    const buf = readBuffer<T>(et, eid, fk)
    if (buf && JSON.stringify(buf.value) !== JSON.stringify(valueRef.current)) {
      setRecovered({ value: buf.value, updatedAt: buf.updatedAt })
      onRecoveredAvailable?.(buf.value)
    }
    if (buf) versionNoRef.current = buf.versionNo

    // Best-effort server-side bootstrap: learn the current version_no (for CAS)
    // and whether a draft row already exists, without blocking the UI.
    ;(async () => {
      try {
        const userId = await ensureAuthenticatedSession(supabase!)
        if (!userId) return
        const { data } = await supabase!
          .from('autosave_drafts')
          .select('version_no, content, updated_at')
          .eq('entity_type', et).eq('entity_id', eid).eq('field_key', fk)
          .eq('user_id', userId).eq('client_scope', 'default')
          .maybeSingle()
        if (data) {
          rowExistsRef.current = true
          if (data.version_no > versionNoRef.current) versionNoRef.current = data.version_no
        }
      } catch {
        // Non-fatal — the next sync attempt will discover this the hard way (via
        // INSERT unique-violation fallback) if this bootstrap fails.
      }
    })()
    // onRecoveredAvailable/supabase intentionally excluded: this bootstrap must
    // run exactly once per entity key (entityType/entityId/fieldKey), not on
    // every caller re-render or callback-identity change — supabase is already
    // implied by `active`, and onRecoveredAvailable is read via a stable ref-like
    // closure captured at effect-run time (its identity changing shouldn't
    // re-trigger a fresh bootstrap fetch/recovery-check for the same entity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, entityType, entityId, fieldKey])

  // ── core sync attempt ────────────────────────────────────────────────────
  const attemptSync = useCallback(async (source: AutosaveSource = 'auto'): Promise<{ ok: boolean; error?: string }> => {
    const { entityType: et, entityId: eid, fieldKey: fk } = keyRef.current
    if (!supabase || !eid) return { ok: false, error: 'not-active' }

    if (inFlightRef.current) {
      supersededRef.current = true
      return { ok: false, error: 'superseded' }
    }
    inFlightRef.current = true
    if (mountedRef.current) setStatus('syncing')

    try {
      const userId = await ensureAuthenticatedSession(supabase)
      if (!userId) throw Object.assign(new Error('no authenticated session'), { status: 401 })

      const contentPayload = { schemaVersion: 1 as const, value: valueRef.current }
      const nowIso = new Date().toISOString()
      let newVersionNo: number

      if (!rowExistsRef.current) {
        // First sync for this entity/field — try INSERT.
        const { data, error } = await supabase
          .from('autosave_drafts')
          .insert({
            entity_type: et, entity_id: eid, field_key: fk, user_id: userId,
            client_scope: 'default', content: contentPayload, version_no: 1,
            status: 'synced', local_updated_at: nowIso, server_received_at: nowIso,
          })
          .select('version_no').single()

        if (error) {
          if (error.code === '23505') {
            // Row already exists (created by another tab/device/session since our
            // bootstrap read) — fall through to the CAS-update path below instead.
            rowExistsRef.current = true
          } else {
            throw error
          }
        } else {
          rowExistsRef.current = true
          newVersionNo = data!.version_no
          await afterCanonicalSyncSuccess(et, eid, fk, userId, contentPayload, newVersionNo, source)
          finishSyncSuccess(newVersionNo)
          return { ok: true }
        }
      }

      // CAS update path (row already exists, or just discovered to exist).
      const expected = versionNoRef.current
      const { data, error } = await supabase
        .from('autosave_drafts')
        .update({
          content: contentPayload, version_no: expected + 1, status: 'synced',
          server_received_at: nowIso, local_updated_at: nowIso, updated_at: nowIso,
        })
        .eq('entity_type', et).eq('entity_id', eid).eq('field_key', fk)
        .eq('user_id', userId).eq('client_scope', 'default')
        .eq('version_no', expected)
        .select('version_no').maybeSingle()

      if (error) throw error

      if (!data) {
        // CAS mismatch — someone else's write already advanced version_no past
        // `expected`. Fetch current server state and surface a conflict rather
        // than silently retrying/overwriting (architecture Ch.9/13).
        const { data: current } = await supabase
          .from('autosave_drafts')
          .select('version_no, content')
          .eq('entity_type', et).eq('entity_id', eid).eq('field_key', fk)
          .eq('user_id', userId).eq('client_scope', 'default')
          .maybeSingle()
        if (mountedRef.current) {
          setStatus('conflict')
          setConflict({
            serverContent: (current?.content as { value: T } | undefined)?.value as T,
            serverVersionNo: current?.version_no ?? expected,
            localValue: valueRef.current,
          })
        }
        return { ok: false, error: 'conflict' }
      }

      newVersionNo = data.version_no
      await afterCanonicalSyncSuccess(et, eid, fk, userId, contentPayload, newVersionNo, source)
      finishSyncSuccess(newVersionNo)
      return { ok: true }
    } catch (err) {
      const reason = classifyError(err)
      if (mountedRef.current) {
        setFailureReason(reason)
        setStatus('retrying')
      }
      scheduleRetry()
      return { ok: false, error: reason }
    } finally {
      inFlightRef.current = false
      if (supersededRef.current) {
        supersededRef.current = false
        // A newer value arrived while this request was in flight — collapse to
        // exactly one more attempt for the latest value (architecture Ch.6).
        void attemptSyncRef.current('auto')
      }
    }

    // ── local helpers (closures over this call's scope) ──────────────────
    async function afterCanonicalSyncSuccess(
      et2: string, eid2: string, fk2: string, userId2: string,
      contentPayload2: { schemaVersion: 1; value: T }, versionNo2: number, source2: AutosaveSource,
    ) {
      // Version history write (docs/autosave-db-design.md §4 Step 3): dedup by
      // content hash against the immediately-preceding version, except
      // source='final'/'restore' which always insert.
      const contentStr = JSON.stringify(contentPayload2)
      const newHash = hashContent(contentStr)
      let shouldInsert = source2 === 'final' || source2 === 'restore'
      if (!shouldInsert) {
        const { data: latest } = await supabase!
          .from('content_versions')
          .select('content_hash')
          .eq('entity_type', et2).eq('entity_id', eid2).eq('field_key', fk2)
          .order('version_no', { ascending: false }).limit(1).maybeSingle()
        shouldInsert = !latest || latest.content_hash !== newHash
      }
      if (shouldInsert) {
        await supabase!.from('content_versions').insert({
          entity_type: et2, entity_id: eid2, field_key: fk2, version_no: versionNo2,
          content: contentPayload2, content_hash: newHash, source: source2, user_id: userId2,
        })
      }
    }

    function finishSyncSuccess(versionNo2: number) {
      versionNoRef.current = versionNo2
      retryAttemptRef.current = 0
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
      if (mountedRef.current) {
        setStatus('saved')
        setFailureReason(null)
        setConflict(null)
        setLastSyncedAt(Date.now())
      }
    }

    function scheduleRetry() {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      const idx = retryAttemptRef.current
      const delay = idx < BACKOFF_MS.length ? BACKOFF_MS[idx] : BACKOFF_SLOW_MS
      retryAttemptRef.current += 1
      retryTimerRef.current = setTimeout(() => { void attemptSyncRef.current('auto') }, delay)
    }
  }, [supabase])

  // ── create-flow identity rebind (docs/autosave-rollout-plan.md §16 items 24/25) ──
  // For a "create" flow (entityId is a temp client-side id minted before the
  // canonical row exists), once Final Save lands the canonical row, this moves
  // the EXISTING autosave_drafts row's entity_id from the temp id to the
  // canonical id — same CAS discipline as attemptSync (WHERE entity_type/
  // entity_id/field_key/user_id/client_scope/version_no, so it can only ever
  // touch this exact draft, never another user's or another editor's row).
  // content_versions is append-only (confirmed 42501 permission denied on both
  // UPDATE and DELETE against the real dev project, docs/autosave-rollout-plan.md
  // §16 item 24) — so this never renames entity_id on an existing content_versions
  // row; it only INSERTs one fresh row under the canonical id (source='final'),
  // leaving the temp-id-keyed history exactly as attemptSync already left it.
  const rebindEntityId = useCallback(async (canonicalId: string): Promise<{ ok: boolean; error?: string }> => {
    const { entityType: et, entityId: tempId, fieldKey: fk } = keyRef.current
    if (!supabase || !tempId || !canonicalId) return { ok: false, error: 'not-active' }
    try {
      const userId = await ensureAuthenticatedSession(supabase)
      if (!userId) return { ok: false, error: 'auth' }

      const { data, error } = await supabase
        .from('autosave_drafts')
        .update({ entity_id: canonicalId })
        .eq('entity_type', et).eq('entity_id', tempId).eq('field_key', fk)
        .eq('user_id', userId).eq('client_scope', 'default')
        .eq('version_no', versionNoRef.current)
        .select('entity_id').maybeSingle()

      if (error) return { ok: false, error: error.message }
      if (!data) return { ok: false, error: 'no-matching-draft-row' }

      // Canonical id gets its own reachable version-history row (never an
      // UPDATE of the temp-id row above) — dedup-by-hash intentionally NOT
      // applied here (source='final' always inserts, matching db-design §4
      // Step 3's own dedup exception, same rule attemptSync already follows).
      const contentPayload = { schemaVersion: 1 as const, value: valueRef.current }
      const contentStr = JSON.stringify(contentPayload)
      const { error: cvError } = await supabase.from('content_versions').insert({
        entity_type: et, entity_id: canonicalId, field_key: fk, version_no: versionNoRef.current,
        content: contentPayload, content_hash: hashContent(contentStr), source: 'final', user_id: userId,
      })
      if (cvError) return { ok: false, error: cvError.message }

      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as { message?: string })?.message ?? 'unknown' }
    }
  }, [supabase])

  // Same rationale as valueRef/keyRef above — updated in an effect, consulted
  // only from later async closures, never read synchronously this same render.
  useEffect(() => { attemptSyncRef.current = attemptSync })
  useEffect(() => { rebindRef.current = rebindEntityId })

  // ── on value change: local buffer write (sync) + debounced server sync ──
  useEffect(() => {
    if (!active) return
    const { entityType: et, entityId: eid, fieldKey: fk } = keyRef.current

    if (mountedRef.current) setStatus('local-saving')
    const bufResult = writeBuffer<T>({
      schemaVersion: 1, entityType: et, entityId: eid, fieldKey: fk,
      value, versionNo: versionNoRef.current, updatedAt: Date.now(),
    })
    if (bufResult === 'quota_exceeded') {
      setFailureReason('quota_exceeded')
      // Per architecture Ch.7 scenario J: attempt the server write immediately
      // rather than waiting for the debounce tick, since local buffering just failed.
      void attemptSyncRef.current('auto')
      return
    }
    if (mountedRef.current) setStatus('pending-sync')

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      void attemptSyncRef.current('auto')
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null }
    }
  }, [active, value, debounceMs])

  // ── unmount flush (best-effort) ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
        void attemptSyncRef.current('auto') // fire-and-forget — buffer already durable regardless
      }
    }
  }, [])

  // ── online event → immediate retry ───────────────────────────────────────
  useEffect(() => {
    if (!active) return
    function onOnline() {
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
      void attemptSyncRef.current('auto')
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [active])

  // ── public API ────────────────────────────────────────────────────────
  const flush = useCallback(async (
    opts?: { source?: AutosaveSource; rebindToEntityId?: string },
  ): Promise<{ ok: boolean; error?: string; rebind?: { ok: boolean; error?: string } }> => {
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    retryAttemptRef.current = 0
    const result = await attemptSyncRef.current(opts?.source ?? 'final')
    // Rebind only after the canonical sync itself has actually landed — never
    // rename entity_id based on a value that might not be durably synced yet.
    if (result.ok && opts?.rebindToEntityId) {
      const rebind = await rebindRef.current(opts.rebindToEntityId)
      return { ...result, rebind }
    }
    return result
  }, [])

  const retryNow = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    void attemptSyncRef.current('auto')
  }, [])

  const resolveConflict = useCallback(async (choice: 'keep-mine' | 'take-theirs') => {
    if (!conflict) return
    if (choice === 'keep-mine') {
      versionNoRef.current = conflict.serverVersionNo
      setConflict(null)
      await attemptSyncRef.current('auto')
    } else {
      versionNoRef.current = conflict.serverVersionNo
      setConflict(null)
      setStatus('saved')
      // Caller is responsible for applying conflict.serverContent into its own
      // React state — this hook doesn't own that state.
    }
  }, [conflict])

  const discardRecovered = useCallback(() => {
    setRecovered(null)
    recoverAckedRef.current = true
  }, [])

  // Surface recovered-value callback exactly once per mount.
  useEffect(() => {
    if (recovered && !recoverAckedRef.current && onRecoveredAvailable) {
      // Caller decides whether/how to apply it; we don't auto-apply (architecture Ch.6).
    }
  }, [recovered, onRecoveredAvailable])

  return { status, failureReason, conflict, lastSyncedAt, recovered, flush, retryNow, resolveConflict, discardRecovered }
}

export function clearAutosaveBuffer(entityType: string, entityId: string, fieldKey: string) {
  clearBuffer(entityType, entityId, fieldKey)
}
