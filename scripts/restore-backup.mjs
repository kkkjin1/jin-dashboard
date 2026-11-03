#!/usr/bin/env node
// jin 대시보드 백업 zip 복원 도구.
//
//   node scripts/restore-backup.mjs <백업.zip> list
//       백업 내용(일시·테이블별 행 수) 보기
//   node scripts/restore-backup.mjs <백업.zip> schema-out <저장.sql>
//       표의 틀(schema.sql)만 꺼내기
//   node scripts/restore-backup.mjs <백업.zip> table-out <테이블> <저장.json>
//       테이블 하나의 행을 JSON으로 꺼내 보기
//   node scripts/restore-backup.mjs <백업.zip> restore [--tables a,b] [--schema] [--remap-user <새 계정 id>] [--apply]
//       대상 DB(환경변수 RESTORE_DATABASE_URL)에 복원. 기본은 미리보기(끝에 되돌림), --apply 일 때만 실제 반영.
//       --tables  : 일부 테이블만(사고 복구). 생략하면 전체.
//       --schema  : 빈 새 프로젝트일 때 표의 틀부터 만든다(대상에 public 테이블이 있으면 거부).
//       --remap-user : 새 프로젝트에서 로그인 계정을 다시 만들면 계정 id가 바뀐다 → 백업 속 옛 id를 새 id로 바꿔 넣는다.
//
// 암호: 실행 중 입력(화면에 안 보임). 자동화용으로 BACKUP_PASSWORD 환경변수도 받는다.
// RESTORE_DATABASE_URL: Supabase 대시보드 > Connect > Session pooler 연결 문자열(비밀번호 포함).
//   명령어 인자로 받지 않는 이유 — 터미널 기록에 비밀번호가 남지 않게.
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import pg from 'pg'
import { askPassword, openBackup, restore } from './lib/backup-restore.mjs'

// 오류는 긴 스택 대신 한 줄로
process.on('uncaughtException', e => { console.error(`✗ ${e?.message ?? e}`); process.exit(1) })

function ask(prompt) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(prompt, a => { rl.close(); resolve(a.trim()) })
  })
}

function flag(args, name) {
  const i = args.indexOf(name)
  if (i === -1) return null
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true
}

function usage() {
  console.log(`사용법:
  node scripts/restore-backup.mjs <백업.zip> list
  node scripts/restore-backup.mjs <백업.zip> schema-out <저장.sql>
  node scripts/restore-backup.mjs <백업.zip> table-out <테이블> <저장.json>
  node scripts/restore-backup.mjs <백업.zip> restore [--tables a,b] [--schema] [--remap-user <id>] [--apply]`)
  process.exit(1)
}

const [zipPath, cmd, ...rest] = process.argv.slice(2)
if (!zipPath || !cmd) usage()

const password = process.env.BACKUP_PASSWORD || await askPassword()
const backup = await openBackup(zipPath, password)
const m = backup.manifest

if (cmd === 'list') {
  console.log(`백업 일시 : ${m.started_at}`)
  console.log(`원본 DB   : ${m.supabase_project_ref} (스키마 ${m.schema_version})`)
  console.log(`표의 틀   : ${backup.schema ? 'schema.sql 포함' : '없음'}`)
  console.log(`백업 계정 : ${m.backup_user_id ?? '(기록 없음)'}`)
  console.log(`테이블    : ${m.table_count}개 · ${m.total_rows}행 · 실패 ${m.failed_tables?.length ?? 0}개`)
  for (const t of m.tables) console.log(`  ${t.ok ? ' ' : '!'} ${t.table.padEnd(46)} ${String(t.rows).padStart(6)}`)
} else if (cmd === 'schema-out') {
  if (!rest[0]) usage()
  if (!backup.schema) throw new Error('이 백업에는 schema.sql이 없습니다')
  writeFileSync(rest[0], backup.schema)
  console.log(`저장: ${rest[0]} (${backup.schema.length.toLocaleString()}자)`)
} else if (cmd === 'table-out') {
  if (!rest[0] || !rest[1]) usage()
  writeFileSync(rest[1], JSON.stringify(JSON.parse(await backup.readTable(rest[0])), null, 2))
  console.log(`저장: ${rest[1]}`)
} else if (cmd === 'restore') {
  const url = process.env.RESTORE_DATABASE_URL
  if (!url) throw new Error('RESTORE_DATABASE_URL 환경변수가 없습니다 (Supabase > Connect > Session pooler 연결 문자열)')
  const tablesArg = flag(rest, '--tables')
  const tables = typeof tablesArg === 'string' ? tablesArg.split(',').map(s => s.trim()).filter(Boolean) : null
  const withSchema = !!flag(rest, '--schema')
  const remapArg = flag(rest, '--remap-user')
  const apply = !!flag(rest, '--apply')

  const client = new pg.Client({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  })
  await client.connect()
  const db = { query: (s, p) => client.query(s, p), exec: s => client.query(s) }
  try {
    const host = new URL(url).hostname
    const user = decodeURIComponent(new URL(url).username)
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from pg_tables where schemaname = 'public'`)
    console.log(`대상 DB   : ${host} (${user}) · 지금 public 테이블 ${n}개`)
    console.log(`복원 범위 : ${tables ? tables.join(', ') : `전체 ${backup.tableNames.length}개`}${withSchema ? ' + 표의 틀' : ''}`)
    console.log(`방식      : ${apply ? '★ 실제 반영(--apply)' : '미리보기 — 끝나면 되돌림'}`)
    if (withSchema && n > 0) throw new Error('--schema는 빈 프로젝트에만 쓸 수 있습니다(대상에 테이블이 이미 있음)')
    if (apply) {
      const sameProject = user.includes(m.supabase_project_ref) || host.includes(m.supabase_project_ref)
      if (sameProject) console.log(`⚠ 대상이 백업 원본(운영) 프로젝트 ${m.supabase_project_ref} 입니다. 같은 id 행은 백업 값으로 덮어씁니다.`)
      const ok = await ask(`진행하려면 "복원"을 입력하세요: `)
      if (ok !== '복원') { console.log('취소했습니다'); process.exit(0) }
    }
    const results = await restore(db, backup, { tables, withSchema, remapUserTo: typeof remapArg === 'string' ? remapArg : null, apply })
    const sum = k => results.reduce((s, r) => s + r[k], 0)
    console.log(`\n합계: 백업 ${sum('backupRows')}행 → 추가 ${sum('inserted')} / 덮어씀 ${sum('updated')} / 건너뜀 ${sum('skipped')}`)
    console.log(apply ? '✓ 반영 완료' : '미리보기였습니다 — 실제 반영하려면 같은 명령에 --apply를 붙이세요')
  } finally {
    await client.end()
  }
} else {
  usage()
}
await backup.close()
