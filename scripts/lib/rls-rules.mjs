// JIN Dashboard RLS 정책 검사 규칙의 단일 명세(순수 함수, DB 의존 없음).
//
// supabase/schema_v46.sql의 public.rls_audit() SQL 함수가 사실상 이 규칙을
// SQL로 구현한 것이다 — 규칙을 바꾸면 이 파일과 rls_audit() 양쪽을 함께
// 수정해야 한다. 이 파일은 순수 함수라 실제 DB 없이 scripts/lib/rls-rules.test.mjs
// 로 단위 테스트할 수 있다(그 결과가 검사 로직 자체의 신뢰도를 보증한다).
//
// classify(table, allowlist?) 입력:
//   table: {
//     table_name: string,
//     kind: 'table' | 'view' | 'matview',
//     rls_enabled: boolean,
//     policies: Array<{ name: string, roles: string[], cmd: string, using: string|null, check: string|null }>
//   }
//   allowlist: string[] — 의도적으로 anon/public 접근을 허용하는 테이블명 목록
//
// 반환: { status: 'OK'|'FAIL'|'WARN'|'SKIP'|'ALLOWLISTED', reason: string }
//   - FAIL: CI/스크립트가 실패(exit 1)해야 하는 실제 보안 문제
//   - WARN: 표준과 다르지만 사람 판단이 필요한 경우 — CI를 막지 않음(과잉 차단 방지)

const OWNERSHIP_PATTERN = /auth\.uid\(\)\s*=\s*\w+/

function hasPublicOrAnonRole(policy) {
  return policy.roles.some(r => r === 'public' || r === 'anon')
}

// "표준 패턴"으로 인정하는 두 가지 모양:
//   1) 조직 전체 공유: TO authenticated, USING(true), WITH CHECK(true 또는 없음)
//   2) 개인 소유: TO authenticated, USING/CHECK에 auth.uid() = <column>
function isRecognizedShape(policy) {
  const isAuthenticatedOnly = policy.roles.length === 1 && policy.roles[0] === 'authenticated'
  if (!isAuthenticatedOnly) return false

  const usingText = (policy.using ?? '').trim()
  const checkText = (policy.check ?? '').trim()

  if (usingText === 'true' && (checkText === 'true' || checkText === '')) return true
  if (OWNERSHIP_PATTERN.test(usingText) || OWNERSHIP_PATTERN.test(checkText)) return true

  return false
}

export function classify(table, allowlist = []) {
  const { table_name, kind, rls_enabled, policies } = table

  // 규칙: TABLE/VIEW 구분 — view/matview는 RLS 검사 대상이 아니다(별도 검토 필요).
  if (kind !== 'table') {
    return { status: 'SKIP', reason: `${kind} — RLS 검사 대상 아님, 별도 검토 필요` }
  }

  if (allowlist.includes(table_name)) {
    return { status: 'ALLOWLISTED', reason: 'allowlist에 등록된 의도적 공개 테이블' }
  }

  // 규칙 A: RLS disabled
  if (!rls_enabled) {
    return { status: 'FAIL', reason: 'RLS disabled — anon을 포함한 모든 역할이 무제한 접근 가능 (규칙 A)' }
  }

  // 규칙 B: RLS는 켜져 있는데 policy가 없음(대개 "아무것도 안 됨"이지만, 실수로 policy
  // 추가를 빼먹은 채 배포된 상태일 수 있어 확인이 필요하다)
  if (policies.length === 0) {
    return { status: 'FAIL', reason: 'RLS는 켜져 있지만 policy가 없음 — 의도적인지 확인 필요 (규칙 B)' }
  }

  // 규칙 C/D/E: anon 접근 가능한 내부 테이블 — public/anon role 정책이 있고,
  // allowlist에 없는 경우. USING(true)로 조건 없이 완전히 열려 있으면(규칙 E) 별도로
  // 더 명확하게 표시한다.
  const publicPolicies = policies.filter(hasPublicOrAnonRole)
  if (publicPolicies.length > 0) {
    const wideOpen = publicPolicies.find(p => (p.using ?? '').trim() === 'true')
    if (wideOpen) {
      return {
        status: 'FAIL',
        reason: `"${wideOpen.name}" 정책이 role 제한 없이(public/anon 포함) USING(true)로 전체 허용됨 (규칙 D+E)`,
      }
    }
    return {
      status: 'FAIL',
      reason: `"${publicPolicies[0].name}" 정책이 public/anon role을 포함함 — 조건식으로 anon을 막고 있더라도 표준 위반 (규칙 D)`,
    }
  }

  // 규칙 F: 표준 두 패턴(조직 공유 / 개인 소유) 어디에도 안 맞는 정책 — 위험하다고
  // 단정하지 않고 WARN으로만 표시해 사람이 검토하게 한다("무조건 실패"를 피함).
  const unrecognized = policies.filter(p => !isRecognizedShape(p))
  if (unrecognized.length > 0) {
    return {
      status: 'WARN',
      reason: `"${unrecognized[0].name}" 정책이 표준 패턴(authenticated + USING(true)/CHECK(true) 또는 auth.uid() 소유권)과 다름 — 검토 필요 (규칙 F)`,
    }
  }

  return { status: 'OK', reason: '표준 패턴과 일치' }
}
