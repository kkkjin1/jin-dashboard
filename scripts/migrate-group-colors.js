// objective_groups_v2.color → GROUP_COLORS 팔레트 마이그레이션
// 사용법: node scripts/migrate-group-colors.js

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') })
const { createClient } = require('@supabase/supabase-js')

const GROUP_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#9CA3AF']

async function main() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local에 없습니다.')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  // 1. 현재 그룹 조회
  const { data: groups, error: fetchErr } = await supabase
    .from('objective_groups_v2')
    .select('id, name, sort_order, color')
    .order('sort_order')

  if (fetchErr) { console.error('조회 실패:', fetchErr.message); process.exit(1) }

  console.log(`\n총 ${groups.length}개 그룹 발견:\n`)

  // 2. 각 그룹 색상 업데이트 (sort_order 순위 기반 — SQL의 ROW_NUMBER()와 동일)
  for (let rank = 0; rank < groups.length; rank++) {
    const group    = groups[rank]
    const idx      = rank % GROUP_COLORS.length
    const newColor = GROUP_COLORS[idx]
    const oldColor = group.color

    const { error: updateErr } = await supabase
      .from('objective_groups_v2')
      .update({ color: newColor })
      .eq('id', group.id)

    if (updateErr) {
      console.error(`✗ [${group.name}] 업데이트 실패: ${updateErr.message}`)
    } else {
      const changed = oldColor !== newColor ? '← 변경됨' : '(동일)'
      console.log(`✓ sort_order=${group.sort_order}  ${group.name.padEnd(16)}  ${oldColor}  →  ${newColor}  ${changed}`)
    }
  }

  // 3. 결과 검증
  const { data: after } = await supabase
    .from('objective_groups_v2')
    .select('name, sort_order, color')
    .order('sort_order')

  console.log('\n== 최종 상태 ==')
  after?.forEach((g, i) => {
    const expected = GROUP_COLORS[i % GROUP_COLORS.length]
    const ok = g.color === expected ? '✓' : '✗'
    console.log(`  ${ok} rank=${i + 1}  sort_order=${g.sort_order}  ${g.name.padEnd(16)}  ${g.color}`)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
