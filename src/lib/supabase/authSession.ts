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
