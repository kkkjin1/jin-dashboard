import { NextResponse } from 'next/server'
import { createClient } from './server'

// API 라우트 안쪽 2차 로그인 확인 (이중 잠금).
// 입구(src/proxy.ts)에서 이미 로그인을 검사하지만, 입구 검사가 우회되는 프레임워크 취약점
// (예: 2025년 Next.js middleware 우회 CVE-2025-29927)이 생겨도 유료 API 키(Anthropic 등)·캘린더가
// 노출되지 않도록 각 API가 스스로 한 번 더 확인한다. 통과하면 null, 아니면 401 응답을 돌려준다.
export async function requireUser(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}
