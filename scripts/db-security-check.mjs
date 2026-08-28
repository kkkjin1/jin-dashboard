#!/usr/bin/env node
// Production Supabase RLS 보안 smoke test — `npm run db:security-check`
//
// public schema의 모든 table/view를 훑어 RLS가 꺼져 있거나 anon/public role
// policy가 걸린 테이블이 있는지 확인한다. supabase/schema_v46.sql이 만든
// public.rls_audit() 함수(service_role 전용)를 호출한다.
//
// 최초 1회 설정: Supabase 대시보드 → Project Settings → API에서 service_role
// 키를 복사해 .env.local(로컬 실행용, NEXT_PUBLIC_ 접두어 절대 붙이지 말 것 —
// 붙이면 브라우저 번들에 노출된다)에 SUPABASE_SERVICE_ROLE_KEY로 저장한다.
// CI에서 돌리려면 GitHub repo Settings → Secrets and variables → Actions에
// 같은 이름 + NEXT_PUBLIC_SUPABASE_URL을 등록한다.
//
// HRM 대시보드(team_log_* 테이블)는 이 스크립트의 점검 대상이 아니다
// (rls_audit() 함수 자체가 제외하고 조회한다).

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    '[db:security-check] 설정이 안 되어 있습니다.\n\n' +
    '  1) Supabase 대시보드 → Project Settings → API → service_role 키 복사\n' +
    '  2) .env.local에 아래 두 줄 추가 (NEXT_PUBLIC_ 접두어를 SUPABASE_SERVICE_ROLE_KEY에는 붙이지 말 것):\n' +
    '       NEXT_PUBLIC_SUPABASE_URL=이미 있음\n' +
    '       SUPABASE_SERVICE_ROLE_KEY=<service_role 키>\n' +
    '  3) CI(GitHub Actions)에서 쓰려면 repo Settings → Secrets and variables → Actions에\n' +
    '     같은 이름 두 개를 등록\n'
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey)

const { data, error } = await supabase.rpc('rls_audit')

if (error) {
  console.error('[db:security-check] rls_audit() 호출 실패:', error.message)
  console.error('supabase/schema_v46.sql이 아직 production에 적용되지 않았을 수 있습니다.')
  process.exit(1)
}

const rows = data ?? []
const failures = rows.filter(r => r.status.startsWith('FAIL'))
const skipped = rows.filter(r => r.status.startsWith('SKIP'))
const allowlisted = rows.filter(r => r.status === 'ALLOWLISTED')

console.log(`[db:security-check] public schema ${rows.length}개 객체 점검 (team_log_* 제외)\n`)
console.table(rows.map(({ table_name, kind, rls_enabled, status }) => ({ table_name, kind, rls_enabled, status })))

if (skipped.length > 0) {
  console.log(`\n${skipped.length}개는 view/matview라 이 검사 대상이 아닙니다(별도 검토 필요): ${skipped.map(s => s.table_name).join(', ')}`)
}
if (allowlisted.length > 0) {
  console.log(`${allowlisted.length}개는 allowlist에 등록되어 anon/public 접근이 의도된 것으로 처리됩니다: ${allowlisted.map(a => a.table_name).join(', ')}`)
}

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length}개 테이블에서 문제 발견:`)
  failures.forEach(f => console.error(`  - ${f.table_name}: ${f.status} (${f.policy_summary})`))
  process.exit(1)
}

console.log('\n✅ anon/public에 열려 있는 테이블 없음. 모두 정상.')
process.exit(0)
