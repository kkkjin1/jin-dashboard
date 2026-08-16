// Dev-only "Autosave pilot" Supabase client — see docs/autosave-implementation.md.
//
// This exists ONLY to let a single screen (src/app/memo/quick/page.tsx) validate the
// new autosave_drafts/content_versions architecture (docs/autosave-db-design.md)
// against a SEPARATE dev Supabase project, without touching the production project
// that .env.local points at.
//
// Safety contract (do not weaken this):
//   - The three NEXT_PUBLIC_SUPABASE_DEV_PILOT_* / NEXT_PUBLIC_AUTOSAVE_PILOT_ENABLED
//     vars are only ever defined in `.env.development.local`, which Next.js loads
//     ONLY for `next dev` (NODE_ENV=development) — never for `next build`/`next start`
//     (production). See https://nextjs.org/docs — env file loading order.
//   - If ANY of the required vars is missing, getDevPilotClient() returns `null`.
//     It NEVER throws. Callers must treat `null` as "pilot is off — use the normal
//     production client exactly as before."
//   - This file is imported by exactly three screens: `memo/quick/page.tsx`,
//     `MobileMemoSheet.tsx`, and `MeetingNotesNew.tsx` — do not add a fourth
//     import site without updating this comment and re-verifying the
//     singleton-sharing analysis below.
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// `cachedClient` below is a MODULE-LEVEL cache that is intentionally SHARED
// across all of this file's import sites (`memo/quick/page.tsx`,
// `MobileMemoSheet.tsx`, and `MeetingNotesNew.tsx`): all three screens are
// part of the same dev-pilot PoC, point at the same dev Supabase project,
// and are meant to share the same authenticated dev-pilot session (see
// ensureDevPilotSession() below) — so reusing one client/session across them
// is safe and by design, not an accidental leak between unrelated screens.
// This is a SEPARATE concern from the `{ isSingleton: false }` passed to
// createBrowserClient() further down: that flag exists only to defeat
// @supabase/ssr's OWN internal module-level singleton cache (which would
// otherwise silently make this "dev pilot" client BE the production client —
// see the long comment at that call site). It has nothing to do with, and
// does not prevent, the intentional sharing of `cachedClient` above between
// this file's three legitimate callers.
let cachedClient: SupabaseClient | null | undefined = undefined

/**
 * Returns a Supabase client pointed at the dev pilot project, or `null` if the
 * pilot is not configured/enabled (the normal/production case). Never throws.
 */
export function getDevPilotClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient

  const url     = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_ANON_KEY
  const enabled = process.env.NEXT_PUBLIC_AUTOSAVE_PILOT_ENABLED

  if (!url || !anonKey || enabled !== 'true') {
    cachedClient = null
    return null
  }

  // Defense-in-depth: refuse to "enable" the pilot if it's somehow pointed at
  // the exact same project as production (e.g. a misconfigured env var) —
  // this must never be a way to accidentally treat prod writes as "pilot" ones.
  if (url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('[devPilotClient] NEXT_PUBLIC_SUPABASE_DEV_PILOT_URL matches the production URL — refusing to enable pilot mode.')
    cachedClient = null
    return null
  }

  try {
    // IMPORTANT: @supabase/ssr's createBrowserClient() caches a MODULE-LEVEL
    // singleton and silently returns it on every later call regardless of the
    // url/key passed in, unless isSingleton is explicitly set to false
    // (confirmed by reading node_modules/@supabase/ssr/dist/main/createBrowserClient.js —
    // `cachedBrowserClient`). Since src/lib/supabase/client.ts's createClient()
    // (production) is called elsewhere in the app and would populate that same
    // module-level cache first, omitting `isSingleton: false` here would make
    // this "dev pilot" client silently BE the production client — exactly the
    // kind of accidental production write this STEP's absolute rules forbid.
    cachedClient = createBrowserClient(url, anonKey, { isSingleton: false })
  } catch {
    cachedClient = null
  }
  return cachedClient
}

export function isDevPilotEnabled(): boolean {
  return getDevPilotClient() !== null
}

// ── Pilot auth bootstrap ────────────────────────────────────────────────────
// The dev pilot project has its own, separate Supabase Auth namespace (it is a
// different Supabase project from production), so the app's normal/production
// login session is NOT valid against it. autosave_drafts/content_versions use
// ownership RLS (auth.uid() = user_id, docs/autosave-db-design.md §8), so the
// pilot client needs its OWN authenticated session before any autosave write
// will succeed. For this PoC we auto-sign-in with a pre-provisioned dev test
// account, configured via env vars (never hardcoded here) so the credentials
// are only ever present in `.env.development.local` (dev-only, git-ignored)
// and never end up in a production bundle (see safety contract above).
let pilotSessionPromise: Promise<string | null> | null = null

export async function ensureDevPilotSession(client: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await client.auth.getSession()
  if (session?.user?.id) return session.user.id

  if (!pilotSessionPromise) {
    pilotSessionPromise = (async () => {
      const email    = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_TEST_EMAIL
      const password = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_TEST_PASSWORD
      if (!email || !password) return null
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error) return null
      return data.session?.user.id ?? null
    })()
  }
  return pilotSessionPromise
}
