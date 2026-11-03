#!/usr/bin/env node
// 복원 리허설: PC 안에 "빈 가짜 Supabase"(PGlite, 메모리 DB)를 띄워 백업 zip을 통째로 복원하고
// 테이블별 행 수를 백업 목록표(manifest)와 대조한다. 운영 DB·외부 서버는 전혀 건드리지 않는다.
//
//   node scripts/restore-rehearsal.mjs <백업.zip>
//
// 통과하면: 표의 틀(schema.sql)이 빈 DB에서 실행되고, 모든 행이 형식 오류 없이 들어간다는 뜻.
// 한계: 가짜 Supabase라 auth·storage는 최소 흉내만 낸다(로그인·파일은 검증 범위 밖).
import { PGlite } from '@electric-sql/pglite'
import { askPassword, openBackup, restore } from './lib/backup-restore.mjs'

// 새 Supabase 프로젝트에 원래 있는 것들의 최소 흉내
const SUPABASE_STUB = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.email() returns text language sql stable as $$ select null::text $$;
create schema extensions;
create function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
create function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, owner_id text, metadata jsonb, path_tokens text[], version text,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create function storage.extension(name text) returns text language sql immutable as
  $$ select reverse(split_part(reverse(name), '.', 1)) $$;
create publication supabase_realtime;
`

// 오류는 긴 스택 대신 한 줄로
process.on('uncaughtException', e => { console.error(`✗ ${e?.message ?? e}`); process.exit(1) })


const zipPath = process.argv[2]
if (!zipPath) { console.log('사용법: node scripts/restore-rehearsal.mjs <백업.zip>'); process.exit(1) }

const password = process.env.BACKUP_PASSWORD || await askPassword()
const backup = await openBackup(zipPath, password)
const m = backup.manifest
console.log(`백업 ${m.started_at} · ${m.table_count}개 테이블 · ${m.total_rows}행`)

const pgl = new PGlite()
await pgl.exec(SUPABASE_STUB)
const db = { query: (s, p) => pgl.query(s, p), exec: s => pgl.exec(s) }

const t0 = Date.now()
try {
  await restore(db, backup, { withSchema: true, apply: true, log: () => {} })
} catch (e) {
  console.log(`\n✗ 복원 실패: ${e.message}`)
  if (e.position && backup.schema) {
    const p = Number(e.position)
    console.log('--- schema.sql 오류 위치 근처 ---')
    console.log(backup.schema.slice(Math.max(0, p - 300), p + 200))
  }
  process.exit(2)
}

// 대조: 복원된 DB의 실제 행 수 vs 백업 목록표
let bad = 0
for (const t of m.tables) {
  const { rows: [{ n }] } = await pgl.query(`select count(*)::int as n from public."${t.table.replace(/"/g, '""')}"`)
  if (n !== t.rows) { bad++; console.log(`  ✗ ${t.table}: 백업 ${t.rows} / 복원 ${n}`) }
}
const { rows: [{ tables, policies }] } = await pgl.query(
  `select (select count(*)::int from pg_tables where schemaname = 'public') as tables,
          (select count(*)::int from pg_policies where schemaname = 'public') as policies`)
const restoredRows = m.tables.reduce((s, t) => s + t.rows, 0)
console.log(`복원된 가짜 DB: 테이블 ${tables}개 · 접근 규칙 ${policies}개 · ${((Date.now() - t0) / 1000).toFixed(1)}초`)
console.log(bad === 0
  ? `✓ 리허설 통과 — ${m.tables.length}개 테이블 ${restoredRows}행 전부 일치`
  : `✗ 리허설 실패 — ${bad}개 테이블 행 수 불일치`)
await backup.close()
await pgl.close()
process.exit(bad === 0 ? 0 : 3)
