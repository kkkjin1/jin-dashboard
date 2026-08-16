#!/usr/bin/env node
// Autosave PoC DB-level verification script for the Meeting create-flow
// (Phase A #2, docs/autosave-implementation.md). Adapted from
// scripts/verify-autosave-dev.mjs (Quick Memo, entity_type='quick_memo') —
// this script is the same shape but fixed to entity_type='meeting'.
//
// Reads dev-pilot credentials ONLY from .env.development.local (never
// hardcoded — safe to commit this script itself). Signs in as the dev test
// account and prints the current autosave_drafts / content_versions rows for
// entity_type='meeting', so we can confirm real writes against the dev
// Supabase project without relying on browser devtools network inspection.
//
// Usage: node scripts/verify-autosave-dev-meeting.mjs [entityId]
// (entityId can be either the temp qid or, after Final Save + rebind, the
// canonical meetings.id — both are useful to check during the lifecycle.)

import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.development.local')

try {
  process.loadEnvFile(envPath)
} catch (e) {
  console.error(`Could not load ${envPath}: ${e.message}`)
  console.error('This script only runs meaningfully once .env.development.local exists.')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_ANON_KEY
const email = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_TEST_EMAIL
const password = process.env.NEXT_PUBLIC_SUPABASE_DEV_PILOT_TEST_PASSWORD

if (!url || !anonKey || !email || !password) {
  console.error('Missing one of NEXT_PUBLIC_SUPABASE_DEV_PILOT_URL/ANON_KEY/TEST_EMAIL/TEST_PASSWORD in .env.development.local')
  process.exit(1)
}

const entityIdFilter = process.argv[2] // optional: only show rows for this entity_id (temp qid or canonical meetings.id)

const supabase = createClient(url, anonKey)

const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
if (signInError) {
  console.error('Sign-in failed:', signInError.message)
  process.exit(1)
}
console.log(`Signed in as ${email} (user_id=${signInData.user.id})\n`)

let draftsQuery = supabase
  .from('autosave_drafts')
  .select('entity_type, entity_id, field_key, version_no, status, content, updated_at, expires_at')
  .eq('entity_type', 'meeting')
  .order('updated_at', { ascending: false })
  .limit(20)
if (entityIdFilter) draftsQuery = draftsQuery.eq('entity_id', entityIdFilter)

const { data: drafts, error: draftsError } = await draftsQuery
if (draftsError) {
  console.error('autosave_drafts query failed:', draftsError.message)
} else {
  console.log(`=== autosave_drafts (entity_type='meeting'${entityIdFilter ? `, entity_id='${entityIdFilter}'` : ''}) — ${drafts.length} row(s) ===`)
  for (const d of drafts) {
    console.log(`  entity_id=${d.entity_id} field_key=${d.field_key} version_no=${d.version_no} status=${d.status} updated_at=${d.updated_at}`)
    console.log(`    content=${JSON.stringify(d.content)}`)
  }
}

let versionsQuery = supabase
  .from('content_versions')
  .select('entity_id, field_key, version_no, source, content_hash, created_at')
  .eq('entity_type', 'meeting')
  .order('created_at', { ascending: false })
  .limit(30)
if (entityIdFilter) versionsQuery = versionsQuery.eq('entity_id', entityIdFilter)

const { data: versions, error: versionsError } = await versionsQuery
if (versionsError) {
  console.error('content_versions query failed:', versionsError.message)
} else {
  console.log(`\n=== content_versions (entity_type='meeting'${entityIdFilter ? `, entity_id='${entityIdFilter}'` : ''}) — ${versions.length} row(s) ===`)
  for (const v of versions) {
    console.log(`  entity_id=${v.entity_id} field_key=${v.field_key} version_no=${v.version_no} source=${v.source} hash=${v.content_hash} created_at=${v.created_at}`)
  }
}

let meetingsQuery = supabase
  .from('meetings')
  .select('id, title, meeting_date, created_at')
  .order('created_at', { ascending: false })
  .limit(10)
if (entityIdFilter) meetingsQuery = supabase.from('meetings').select('id, title, meeting_date, created_at').eq('id', entityIdFilter)

const { data: meetingsRows, error: meetingsError } = await meetingsQuery
if (meetingsError) {
  console.error('\nmeetings query failed:', meetingsError.message)
} else {
  console.log(`\n=== meetings (canonical rows${entityIdFilter ? `, id='${entityIdFilter}'` : ', latest 10'}) — ${meetingsRows.length} row(s) ===`)
  for (const m of meetingsRows) {
    console.log(`  id=${m.id} title=${JSON.stringify(m.title)} meeting_date=${m.meeting_date} created_at=${m.created_at}`)
  }
}

await supabase.auth.signOut()
