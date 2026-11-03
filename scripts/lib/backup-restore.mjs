// 백업 zip(설정 > 데이터 백업) 읽기 + DB 복원 핵심 로직.
// CLI(scripts/restore-backup.mjs)와 로컬 리허설(scripts/restore-rehearsal.mjs)이 같이 쓴다.
//
// DB는 작은 어댑터로 받는다 — { query(sql, params) → { rows }, exec(sqlWithManyStatements) }
//   pg.Client와 PGlite 둘 다 이 모양으로 감싸서 넘긴다.
//
// 복원 원칙
// - 한 트랜잭션 안에서 session_replication_role = replica → 트리거·FK 검사를 끄고 백업 값 그대로 넣는다
//   (updated_at 트리거 등이 값을 현재 시각으로 덮어쓰지 않게, 테이블 순서와 무관하게).
// - 같은 기본키 행은 백업 값으로 덮어쓰고(upsert), 없는 행은 추가한다. 백업에 없는 행은 지우지 않는다.
// - 기본은 미리보기: 끝에서 ROLLBACK. apply=true일 때만 COMMIT.
// - 형변환은 DB가 한다: jsonb_populate_recordset(null::테이블, 행배열) → 열 형식(uuid·timestamptz·jsonb·배열) 그대로.
import { readFileSync } from 'node:fs'
import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js'

configure({ useWebWorkers: false })

const BATCH = 500

export async function openBackup(zipPath, password) {
  const buf = readFileSync(zipPath)
  const reader = new ZipReader(new BlobReader(new Blob([buf])), { password })
  const entries = await reader.getEntries()
  const byName = new Map(entries.map(e => [e.filename, e]))
  async function text(name) {
    const e = byName.get(name)
    if (!e) return null
    try {
      return await e.getData(new TextWriter())
    } catch (err) {
      if (String(err?.message ?? err).toLowerCase().includes('password')) throw new Error('암호가 틀렸습니다')
      throw err
    }
  }
  const manifestText = await text('manifest.json')
  if (!manifestText) throw new Error('manifest.json이 없습니다 — jin 백업 파일이 맞는지 확인하세요')
  const manifest = JSON.parse(manifestText)
  const schema = await text('schema.sql')
  return {
    manifest,
    schema,
    tableNames: entries.map(e => e.filename).filter(n => n.startsWith('tables/') && n.endsWith('.json'))
      .map(n => n.slice('tables/'.length, -'.json'.length)),
    async readTable(name) {
      const t = await text(`tables/${name}.json`)
      if (t === null) throw new Error(`백업에 ${name} 테이블이 없습니다`)
      return t
    },
    close: () => reader.close(),
  }
}

async function targetColumns(db, table) {
  const { rows } = await db.query(
    `select column_name, is_generated, identity_generation
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`, [table])
  return rows
}

async function primaryKey(db, table) {
  const { rows } = await db.query(
    `select a.attname
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || quote_ident($1))::regclass and i.indisprimary
      order by array_position(i.indkey::int2[], a.attnum)`, [table])
  return rows.map(r => r.attname)
}

const q = name => '"' + String(name).replace(/"/g, '""') + '"'

// 테이블 하나 복원 → { table, backupRows, inserted, updated, skipped, note }
async function restoreTable(db, table, rowsJson, { remap } = {}) {
  let json = rowsJson
  if (remap) json = json.split(remap.from).join(remap.to) // uuid는 고유값이라 문자열 치환으로 충분
  const rows = JSON.parse(json)
  const result = { table, backupRows: rows.length, inserted: 0, updated: 0, skipped: 0, note: '' }
  if (rows.length === 0) return result

  const cols = await targetColumns(db, table)
  if (cols.length === 0) {
    result.skipped = rows.length
    result.note = '대상 DB에 테이블 없음 — 건너뜀'
    return result
  }
  const keys = new Set(rows.flatMap(r => Object.keys(r)))
  // 계산 열(generated)은 넣을 수 없으니 제외. 백업에 없는 열(그 뒤 추가된 열)은 대상 기본값 사용.
  const use = cols.filter(c => c.is_generated !== 'ALWAYS' && keys.has(c.column_name)).map(c => c.column_name)
  const dropped = [...keys].filter(k => !cols.some(c => c.column_name === k))
  if (dropped.length) result.note += `대상에 없는 열 무시: ${dropped.join(', ')}. `
  const overriding = cols.some(c => c.identity_generation === 'ALWAYS' && use.includes(c.column_name))
    ? ' overriding system value' : ''
  const pk = await primaryKey(db, table)
  const colList = use.map(q).join(', ')
  let conflict = ''
  if (pk.length && pk.every(k => use.includes(k))) {
    const rest = use.filter(c => !pk.includes(c))
    conflict = rest.length
      ? ` on conflict (${pk.map(q).join(', ')}) do update set ${rest.map(c => `${q(c)} = excluded.${q(c)}`).join(', ')}`
      : ` on conflict (${pk.map(q).join(', ')}) do nothing`
  } else {
    result.note += '기본키 없음 — 추가만(중복 가능). '
  }
  const sql =
    `insert into public.${q(table)} (${colList})${overriding} ` +
    `select ${colList} from jsonb_populate_recordset(null::public.${q(table)}, $1::jsonb)` +
    `${conflict} returning (xmax = 0) as ins`

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { rows: out } = await db.query(sql, [JSON.stringify(chunk)])
    for (const r of out) {
      if (r.ins) result.inserted++
      else result.updated++
    }
    result.skipped += chunk.length - out.length // do nothing으로 건너뛴 행
  }
  return result
}

// tables: 복원할 테이블 이름 배열(없으면 백업 전체). withSchema: schema.sql 먼저 실행(빈 프로젝트용).
export async function restore(db, backup, { tables, withSchema = false, remapUserTo = null, apply = false, log = console.log } = {}) {
  const names = tables?.length ? tables : backup.tableNames
  const unknown = names.filter(n => !backup.tableNames.includes(n))
  if (unknown.length) throw new Error(`백업에 없는 테이블: ${unknown.join(', ')}`)
  const remap = remapUserTo && backup.manifest.backup_user_id
    ? { from: backup.manifest.backup_user_id, to: remapUserTo } : null

  const results = []
  await db.exec('begin')
  try {
    await db.exec('set local session_replication_role = replica')
    if (withSchema) {
      if (!backup.schema) throw new Error('이 백업에는 schema.sql이 없습니다(2026-11-03 21:23 이전 백업)')
      log('· 표의 틀(schema.sql) 실행 중…')
      await db.exec(backup.schema)
      await db.exec('set local session_replication_role = replica') // schema.sql 안의 set 문 이후에도 유지
    }
    for (const name of names) {
      const r = await restoreTable(db, name, await backup.readTable(name), { remap })
      results.push(r)
      log(`· ${name}: 백업 ${r.backupRows} → 추가 ${r.inserted} / 덮어씀 ${r.updated}${r.skipped ? ` / 건너뜀 ${r.skipped}` : ''}${r.note ? `  (${r.note.trim()})` : ''}`)
    }
    await db.exec(apply ? 'commit' : 'rollback')
  } catch (e) {
    await db.exec('rollback').catch(() => {})
    throw e
  }
  return results
}

// 암호 입력: 한 글자마다 * 표시(입력이 되는지 보이게), Backspace 지우기, Ctrl+C 취소.
// 터미널이 아닌 곳(파이프 등)에서는 한 줄을 그대로 읽는다.
export function askPassword(prompt = '백업 암호: ') {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stdout.write(prompt)
    if (!stdin.isTTY) {
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', d => { buf += d; const i = buf.indexOf('\n'); if (i !== -1) { stdin.pause(); resolve(buf.slice(0, i).replace(/\r$/, '')) } })
      return
    }
    let pw = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const done = (fn, v) => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); fn(v) }
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done(resolve, pw)
        if (ch === '\u0003') return done(reject, new Error('취소했습니다'))
        if (ch === '\u0008' || ch === '\u007f') {
          if (pw.length) { pw = pw.slice(0, -1); process.stdout.write('\b \b') }
          continue
        }
        if (ch < ' ') continue
        pw += ch
        process.stdout.write('*')
      }
    }
    stdin.on('data', onData)
  })
}
