// 연간목표(annual_goal_items/annual_goal_tasks) 시딩 — HR전략프레임 엑셀 → CSV → DB
// 사용법: node scripts/seed-annual-goals.js
//   --sql-out         : DB에 직접 쓰지 않고 scripts/seed-annual-goals.generated.sql 파일만 생성 (RLS로 막힐 때 대시보드에 붙여넣기용)
// 사전 조건: supabase/schema_v23.sql 을 Supabase SQL Editor에서 먼저 실행해 annual_goal_* 테이블이 있어야 함.

const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') })
const { createClient } = require('@supabase/supabase-js')

const CSV_PATH = path.resolve(__dirname, 'data/hr_strategy_framework.csv')
const SQL_OUT = process.argv.includes('--sql-out')

// ── quote-aware CSV 라인 파서 ─────────────────────────────────────
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { out.push(cur); cur = '' }
      else cur += c
    }
  }
  out.push(cur)
  return out
}

function parseCsv(raw) {
  const clean = raw.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.length > 0)
  const header = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line)
    const row = {}
    header.forEach((h, i) => { row[h.trim()] = (cells[i] ?? '').trim() })
    return row
  })
}

// ── 실행 제안 구간 → roadmap 시작/종료일 매핑 ─────────────────────
function mapPeriod(raw) {
  switch (raw) {
    case '26.3Q':    return { start: '2026-07-01', end: '2026-09-30' }
    case '26.4Q':    return { start: '2026-10-01', end: '2026-12-31' }
    case '26.3~4Q':  return { start: '2026-07-01', end: '2026-12-31' }
    case '27년 이후':
    case '상시':
    default:
      return { start: null, end: null } // 로드맵 바 없이 배지/텍스트만 표시 (정상)
  }
}

const CATEGORIES = ['1. 인재 확보', '2. 검증과 정렬', '3. 유지와 보상', '4. 지속가능성', '5. 확장 기반']
const ITEM_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#A78BFA', '#F97316', '#22C55E', '#EAB308']

function sqlEscape(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function sqlInt(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : 'NULL'
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV 파일이 없습니다: ${CSV_PATH}`)
    process.exit(1)
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'))
  console.log(`총 ${rows.length}개 행 로드됨`)

  // 대분류+중분류 기준으로 안건(중분류) 그룹핑 (최초 등장 순서 = sort_order)
  const itemsByKey = new Map() // "대분류|중분류" -> { category, title, sort_order, tasks: [] }
  for (const row of rows) {
    const category = row['대분류']
    const title = row['중분류']
    const key = `${category}|${title}`
    if (!itemsByKey.has(key)) {
      itemsByKey.set(key, { category, title, sort_order: itemsByKey.size, tasks: [] })
    }
    itemsByKey.get(key).tasks.push(row)
  }
  const items = [...itemsByKey.values()]
  const catCounts = {}
  items.forEach(it => { catCounts[it.category] = (catCounts[it.category] || 0) + 1 })
  console.log('대분류별 안건(중분류) 수:', catCounts)
  console.log(`총 안건 ${items.length}개, 세부task ${rows.length}개`)

  if (SQL_OUT) {
    return writeSqlFile(items)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local에 없습니다.')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  // ── RLS 프리플라이트 체크 ──
  const probe = await supabase.from('annual_goal_items')
    .insert({ category: CATEGORIES[0], title: '__probe__' })
    .select().single()
  if (probe.error) {
    console.error('✗ RLS 프리플라이트 insert 실패:', probe.error.message)
    console.error('  → anon key가 "TO authenticated" RLS 정책에 막혔을 가능성이 있습니다.')
    console.error('  → 해결책 1) 로그인 세션이 필요한 경우 supabase.auth.signInWithPassword(...) 스텝 추가')
    console.error('  → 해결책 2) node scripts/seed-annual-goals.js --sql-out 으로 SQL 파일을 생성해 Supabase 대시보드에서 직접 실행')
    process.exit(1)
  }
  await supabase.from('annual_goal_items').delete().eq('id', probe.data.id)
  console.log('✓ RLS 프리플라이트 통과')

  // ── 안건(중분류) 삽입 ──
  let insertedItems = 0
  for (const it of items) {
    const { data, error } = await supabase.from('annual_goal_items').insert({
      category: it.category,
      title: it.title,
      color: ITEM_COLORS[it.sort_order % ITEM_COLORS.length],
      sort_order: it.sort_order,
    }).select().single()
    if (error) { console.error(`✗ 안건 삽입 실패 [${it.category} / ${it.title}]:`, error.message); continue }
    it.id = data.id
    insertedItems++

    // ── 세부task(소분류) 삽입 ──
    for (let i = 0; i < it.tasks.length; i++) {
      const t = it.tasks[i]
      const period = mapPeriod(t['실행 제안 구간'])
      const { error: taskErr } = await supabase.from('annual_goal_tasks').insert({
        item_id: it.id,
        title: t['소분류'],
        maturity_level: t['성숙도'] ? Number(t['성숙도']) : null,
        maturity_rationale: t['성숙도 판단 근거'] || null,
        track: t['트랙'] || null,
        hr_importance: t['HR 중요도'] || null,
        hr_urgency: t['HR 시급도'] || null,
        suggested_period: t['실행 제안 구간'] || null,
        hrm_function: t['HRM 기능'] || null,
        notes: t['비고'] || null,
        exec_importance: t['경영진 중요도'] || null,
        agreed_priority: t['합의 우선순위'] || null,
        roadmap_start_date: period.start,
        roadmap_end_date: period.end,
        sort_order: i,
      })
      if (taskErr) console.error(`  ✗ 세부task 삽입 실패 [${t['소분류']}]:`, taskErr.message)
    }
  }

  console.log(`\n완료: 안건 ${insertedItems}/${items.length}개 삽입`)

  const { count: taskCount } = await supabase.from('annual_goal_tasks').select('*', { count: 'exact', head: true })
  console.log(`세부task 총 ${taskCount}개 (기대값: ${rows.length}개)`)
}

// ── --sql-out: RLS가 anon key를 막을 경우 대시보드에서 직접 실행할 SQL 파일 생성 ──
function writeSqlFile(items) {
  const out = []
  out.push('-- seed-annual-goals: HR전략프레임 자동 생성 SQL (Supabase SQL Editor에 붙여넣어 실행)')
  for (const it of items) {
    const itemVar = `gen_random_uuid()`
    out.push(`DO $$`)
    out.push(`DECLARE item_id uuid := ${itemVar};`)
    out.push(`BEGIN`)
    out.push(`  INSERT INTO annual_goal_items (id, category, title, color, sort_order) VALUES`)
    out.push(`    (item_id, ${sqlEscape(it.category)}, ${sqlEscape(it.title)}, ${sqlEscape(ITEM_COLORS[it.sort_order % ITEM_COLORS.length])}, ${sqlInt(it.sort_order)});`)
    it.tasks.forEach((t, i) => {
      const period = mapPeriod(t['실행 제안 구간'])
      out.push(`  INSERT INTO annual_goal_tasks (item_id, title, maturity_level, maturity_rationale, track, hr_importance, hr_urgency, suggested_period, hrm_function, notes, exec_importance, agreed_priority, roadmap_start_date, roadmap_end_date, sort_order) VALUES`)
      out.push(`    (item_id, ${sqlEscape(t['소분류'])}, ${sqlInt(t['성숙도'])}, ${sqlEscape(t['성숙도 판단 근거'])}, ${sqlEscape(t['트랙'])}, ${sqlEscape(t['HR 중요도'])}, ${sqlEscape(t['HR 시급도'])}, ${sqlEscape(t['실행 제안 구간'])}, ${sqlEscape(t['HRM 기능'])}, ${sqlEscape(t['비고'])}, ${sqlEscape(t['경영진 중요도'])}, ${sqlEscape(t['합의 우선순위'])}, ${sqlEscape(period.start)}, ${sqlEscape(period.end)}, ${sqlInt(i)});`)
    })
    out.push(`END $$;`)
    out.push('')
  }
  const outPath = path.resolve(__dirname, 'seed-annual-goals.generated.sql')
  fs.writeFileSync(outPath, out.join('\n'), 'utf8')
  console.log(`✓ SQL 파일 생성됨: ${outPath}`)
  console.log('  Supabase 대시보드 SQL Editor에 붙여넣어 실행하세요.')
}

main().catch(err => { console.error(err); process.exit(1) })
