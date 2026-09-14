// Production-safe session helper for useAutosave().
//
// Unlike devPilotClient.ts's ensureDevPilotSession() (dev-pilot PoC only —
// falls back to signing in with a hardcoded dev test account when no
// session exists yet), this helper does exactly one thing: check whether
// the given Supabase client already has an authenticated session, and
// return its user id, or null. It never attempts to sign in and never
// references any test credentials — safe to call with either the
// production client or the dev-pilot client, since both are real Supabase
// Auth sessions once a user has actually logged in through the app.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function ensureAuthenticatedSession(client: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await client.auth.getSession()
  return session?.user?.id ?? null
}

// Synchronous (no network, no Promise) best-effort read of the current
// user id, for scoping useAutosave's localStorage buffer to the logged-in
// account (2026-09-14 security review: v1 buffer keys had no user id, so a
// different account on the same shared browser could see a previous
// user's unsynced draft). createBrowserClient() from @supabase/ssr stores
// the session as a `sb-<project-ref>-auth-token` cookie containing the JWT
// access_token; its `sub` claim IS the user id, so we read it directly from
// document.cookie without awaiting client.auth.getSession() — the buffer
// write on every keystroke must stay synchronous (no added latency).
// Deliberately takes no client/project-ref argument so every call site
// (including the handful of bare `clearAutosaveBuffer(...)` calls that
// don't have a SupabaseClient in scope) can use it as-is: it just takes the
// first `sb-*-auth-token` cookie present, which in this app is always the
// production session except inside the isolated dev-pilot test flows.
// Returns null (never throws) if no such cookie is present/parseable
// (e.g. logged out) — callers must treat that as "no scoped user known".
export function getSessionUserIdSync(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie.split('; ').find(c => /^sb-[^=]+-auth-token=/.test(c))
    if (!match) return null
    const raw = decodeURIComponent(match.slice(match.indexOf('=') + 1))
    const jsonStr = raw.startsWith('base64-') ? atob(raw.slice(7)) : raw
    const accessToken = JSON.parse(jsonStr)?.access_token
    if (typeof accessToken !== 'string') return null
    const payloadB64 = accessToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
    if (!payloadB64) return null
    const payload = JSON.parse(atob(payloadB64))
    return typeof payload?.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
