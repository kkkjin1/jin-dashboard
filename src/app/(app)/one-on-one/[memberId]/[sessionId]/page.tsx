'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// 예전 3단계(대상자 → 목록 → 상세) 주소 — 이제 대상자 화면 한 곳에서 회차를 골라 편집한다.
// 홈 일지 위젯 등 기존 링크가 깨지지 않게 그 회차가 선택된 대상자 화면으로 넘긴다.
export default function OneOnOneSessionRedirect() {
  const { memberId, sessionId } = useParams<{ memberId: string; sessionId: string }>()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/one-on-one/${memberId}?s=${sessionId}`)
  }, [router, memberId, sessionId])
  return null
}
