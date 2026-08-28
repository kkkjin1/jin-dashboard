// scripts/lib/rls-rules.mjs의 판정 로직 단위 테스트.
// 전부 가상/고정 메타데이터만 사용 — Production DB를 전혀 조회하거나 건드리지 않는다.
// 실행: node --test scripts/lib/rls-rules.test.mjs (또는 npm run db:rls-rules-test)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './rls-rules.mjs'

test('TEST 1: RLS disabled table → FAIL', () => {
  const r = classify({ table_name: 't1', kind: 'table', rls_enabled: false, policies: [] })
  assert.equal(r.status, 'FAIL')
})

test('TEST 2: TO public + USING(true), allowlist 없음 → FAIL', () => {
  const r = classify({
    table_name: 't2',
    kind: 'table',
    rls_enabled: true,
    policies: [{ name: 'allow_all', roles: ['public'], cmd: 'ALL', using: 'true', check: 'true' }],
  })
  assert.equal(r.status, 'FAIL')
})

test('TEST 2b: 같은 public 정책이라도 allowlist에 있으면 → ALLOWLISTED (무조건 실패 규칙 아님)', () => {
  const r = classify(
    {
      table_name: 't2',
      kind: 'table',
      rls_enabled: true,
      policies: [{ name: 'allow_all', roles: ['public'], cmd: 'ALL', using: 'true', check: 'true' }],
    },
    ['t2']
  )
  assert.equal(r.status, 'ALLOWLISTED')
})

test('TEST 3: TO authenticated + RLS ON + USING(true)/CHECK(true) → OK', () => {
  const r = classify({
    table_name: 't3',
    kind: 'table',
    rls_enabled: true,
    policies: [{ name: 'auth_all', roles: ['authenticated'], cmd: 'ALL', using: 'true', check: 'true' }],
  })
  assert.equal(r.status, 'OK')
})

test('TEST 4: auth.uid() 기반 owner policy → OK', () => {
  const r = classify({
    table_name: 't4',
    kind: 'table',
    rls_enabled: true,
    policies: [
      { name: 'select_own', roles: ['authenticated'], cmd: 'SELECT', using: '(auth.uid() = user_id)', check: null },
      { name: 'insert_own', roles: ['authenticated'], cmd: 'INSERT', using: null, check: '(auth.uid() = user_id)' },
    ],
  })
  assert.equal(r.status, 'OK')
})

test('view/matview → SKIP (RLS 검사 대상 아님)', () => {
  const r = classify({ table_name: 'v1', kind: 'view', rls_enabled: false, policies: [] })
  assert.equal(r.status, 'SKIP')
})

test('RLS ON, policy 0개 → FAIL(확인 필요, 규칙 B)', () => {
  const r = classify({ table_name: 't5', kind: 'table', rls_enabled: true, policies: [] })
  assert.equal(r.status, 'FAIL')
})

test('표준과 다른 정책 모양(예: TO authenticated인데 USING이 이상한 조건) → WARN, FAIL 아님', () => {
  const r = classify({
    table_name: 't6',
    kind: 'table',
    rls_enabled: true,
    policies: [{ name: 'weird', roles: ['authenticated'], cmd: 'ALL', using: "(status = 'active')", check: null }],
  })
  assert.equal(r.status, 'WARN')
})

test('TEST 5: 2026-08-28 전수조사 기준 JIN Dashboard 정상 테이블 전부 → OK (고정 스냅샷, 라이브 DB 호출 없음)', () => {
  const authAllOnly = (name) => ({
    table_name: name,
    kind: 'table',
    rls_enabled: true,
    policies: [{ name: 'auth_all', roles: ['authenticated'], cmd: 'ALL', using: 'true', check: 'true' }],
  })

  const snapshot = [
    ...[
      'agenda_groups', 'agenda_items', 'agenda_sub_tasks', 'agenda_updates',
      'annual_goal_category_labels', 'annual_goal_items', 'annual_goal_task_notes', 'annual_goal_tasks',
      'attachments', 'daily_journals', 'learning_resources', 'manual_achievements',
      'meeting_agenda_links', 'meeting_notes', 'meetings', 'members', 'notes',
      'obj_entries', 'obj_groups', 'obj_objectives', 'obj_sub_entries', 'obj_sub_items',
      'objective_entries_v2', 'objective_groups_v2', 'objectives_v2',
      'one_on_one_template', 'one_on_ones', 'period_journals', 'persona_logs', 'project_meetings',
      'quick_memos', 'quick_todos', 'schedule_items',
      'sketch_boards', 'sketch_cards', 'sketch_edges', 'sketch_frames',
      'sub_task_notes', 'sub_task_updates', 'task_meeting_links', 'task_todos', 'tasks',
      'user_preferences', 'user_settings',
    ].map(authAllOnly),
    {
      table_name: 'my_feedback',
      kind: 'table',
      rls_enabled: true,
      policies: [{ name: 'my_feedback_auth', roles: ['authenticated'], cmd: 'ALL', using: 'true', check: 'true' }],
    },
    {
      table_name: 'autosave_drafts',
      kind: 'table',
      rls_enabled: true,
      policies: [
        { name: 'autosave_drafts_select_own', roles: ['authenticated'], cmd: 'SELECT', using: '(auth.uid() = user_id)', check: null },
        { name: 'autosave_drafts_insert_own', roles: ['authenticated'], cmd: 'INSERT', using: null, check: '(auth.uid() = user_id)' },
        { name: 'autosave_drafts_update_own', roles: ['authenticated'], cmd: 'UPDATE', using: '(auth.uid() = user_id)', check: '(auth.uid() = user_id)' },
        { name: 'autosave_drafts_delete_own', roles: ['authenticated'], cmd: 'DELETE', using: '(auth.uid() = user_id)', check: null },
      ],
    },
    {
      table_name: 'content_versions',
      kind: 'table',
      rls_enabled: true,
      policies: [
        { name: 'content_versions_select_own', roles: ['authenticated'], cmd: 'SELECT', using: '(auth.uid() = user_id)', check: null },
        { name: 'content_versions_insert_own', roles: ['authenticated'], cmd: 'INSERT', using: null, check: '(auth.uid() = user_id)' },
      ],
    },
  ]

  for (const t of snapshot) {
    const r = classify(t)
    assert.equal(r.status, 'OK', `${t.table_name} expected OK but got ${r.status}: ${r.reason}`)
  }
})
