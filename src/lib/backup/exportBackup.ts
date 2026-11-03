// 설정 > 데이터 백업: 로그인 계정 권한으로 public 테이블 전체를 받아 AES-256 암호 zip으로 묶는다.
// - 테이블 목록은 DB 함수 backup_table_list()(schema_v68)에서 받는다 → 새 테이블도 자동 포함.
// - zip은 브라우저에서 만든다(Vercel 함수 응답 4.5MB 제한 회피, 데이터가 PC↔Supabase로만 오감).
// - 형식: tables/<테이블>.json(행 배열) + schema.sql(표의 틀) + manifest.json(일시·테이블별 행 수·실패 목록).
//   나중에 회사(테넌트) 구조로 옮길 때 이 묶음을 "회사 하나 분량" 원본으로 그대로 쓴다.
// - 반디집·7-Zip에서 암호로 열림(윈도우 기본 탐색기는 AES zip을 못 연다).
import { BlobWriter, TextReader, ZipWriter, configure } from '@zip.js/zip.js'
import type { SupabaseClient } from '@supabase/supabase-js'

configure({ useWebWorkers: false })

const PAGE = 1000

export type TableResult = {
  table: string
  rows: number
  expected: number // DB 기준 실제 행 수(backup_table_list, RLS 무관) — 받은 행 수와 다르면 실패 처리
  ok: boolean
  error?: string
}

export type BackupProgress = { done: number; total: number; current: string }

export type BackupResult = {
  blob: Blob
  fileName: string
  tables: TableResult[]
  totalRows: number
  failed: TableResult[]
}

// 정렬 기준: id → created_at → 없음. 정렬 없이 range로 끊으면 페이지 사이에 행이 겹치거나 빠질 수 있어
// 가능한 한 정렬 열을 쓰고, 마지막에 count와 대조한다.
async function fetchAllRows(supabase: SupabaseClient, table: string): Promise<unknown[]> {
  const orderCols: (string | null)[] = ['id', 'created_at', null]
  let lastError: string | null = null
  for (const col of orderCols) {
    const rows: unknown[] = []
    let failed = false
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from(table).select('*').range(from, from + PAGE - 1)
      if (col) q = q.order(col, { ascending: true })
      const { data, error } = await q
      if (error) {
        lastError = error.message
        failed = true
        break
      }
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    if (!failed) return rows
    // 정렬 열이 없는 테이블(42703 등)이면 다음 기준으로 재시도, 그 외 오류도 마지막 시도까지 간다
  }
  throw new Error(lastError ?? 'unknown error')
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportBackup(
  supabase: SupabaseClient,
  password: string,
  onProgress?: (p: BackupProgress) => void,
): Promise<BackupResult> {
  const { data: list, error: listError } = await supabase.rpc('backup_table_list')
  if (listError) throw new Error(`테이블 목록을 못 받았습니다: ${listError.message}`)
  // row_count는 함수 소유자 권한으로 센 실제 행 수(schema_v69). 로그인 계정이 RLS 때문에 못 읽는 행이 있으면
  // 받은 행 수가 이보다 적게 나와 실패로 잡힌다 — 권한 문제로 조용히 빈 테이블이 백업되는 것을 막는 장치.
  const listRows = (list ?? []) as { table_name: string; row_count: number | string | null }[]
  if (listRows.length > 0 && listRows[0].row_count === undefined) {
    throw new Error('DB 함수가 옛 버전입니다 — schema_v69.sql을 먼저 실행하세요')
  }
  const tables = listRows.map(r => r.table_name)
  const dbCount = new Map(listRows.map(r => [r.table_name, Number(r.row_count ?? 0)]))
  if (tables.length === 0) throw new Error('테이블 목록이 비어 있습니다')

  const startedAt = new Date()
  const zip = new ZipWriter(new BlobWriter('application/zip'), { password, encryptionStrength: 3 })
  const results: TableResult[] = []

  // 표의 틀(schema.sql, schema_v70): 새 Supabase 프로젝트에서 테이블·규칙·함수를 되살릴 때 쓴다.
  // 실패해도 데이터 백업은 계속하되, 결과에 실패로 남긴다(틀 없는 백업은 사고 복구만 가능).
  const { data: ddl, error: ddlError } = await supabase.rpc('backup_schema_ddl')
  const schemaOk = !ddlError && typeof ddl === 'string' && ddl.length > 0
  if (schemaOk) await zip.add('schema.sql', new TextReader(ddl as string))
  const schemaFail: TableResult[] = schemaOk ? [] : [{
    table: '(schema.sql)', rows: 0, expected: 0, ok: false,
    error: ddlError ? `표의 틀을 못 받았습니다: ${ddlError.message} — schema_v70.sql 실행 여부 확인` : '표의 틀이 비어 있습니다',
  }]

  // 백업한 로그인 계정 id — 새 프로젝트에선 계정을 다시 만들어 id가 바뀌므로, 복원 시 user_id 열을 새 id로 바꿀 때 쓴다.
  const { data: userData } = await supabase.auth.getUser()

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i]
    onProgress?.({ done: i, total: tables.length, current: table })
    try {
      const rows = await fetchAllRows(supabase, table)
      const expected = dbCount.get(table) ?? 0
      const ok = expected === rows.length
      await zip.add(`tables/${table}.json`, new TextReader(JSON.stringify(rows)))
      results.push({
        table, rows: rows.length, expected, ok,
        ...(ok ? {} : { error: `행 수 불일치(받음 ${rows.length}, DB ${expected}) — 읽기 권한(RLS) 부족 또는 백업 중 데이터 변경` }),
      })
    } catch (e) {
      results.push({ table, rows: 0, expected: dbCount.get(table) ?? 0, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  onProgress?.({ done: tables.length, total: tables.length, current: '' })

  const failed = [...schemaFail, ...results.filter(r => !r.ok)]
  const totalRows = results.reduce((s, r) => s + r.rows, 0)
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^https:\/\//, '').split('.')[0]
  const manifest = {
    format: 'jin-dashboard-backup',
    format_version: 1,
    app: 'jin-dashboard',
    tenant: 'egnis',
    schema_version: 'v70',
    supabase_project_ref: projectRef,
    backup_user_id: userData?.user?.id ?? null,
    schema_included: schemaOk,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    table_count: tables.length,
    total_rows: totalRows,
    failed_tables: failed.map(f => f.table),
    tables: results,
  }
  await zip.add('manifest.json', new TextReader(JSON.stringify(manifest, null, 2)))
  const blob = await zip.close()

  return {
    blob,
    fileName: `jin-backup-egnis-${stamp(startedAt)}.zip`,
    tables: results,
    totalRows,
    failed,
  }
}
