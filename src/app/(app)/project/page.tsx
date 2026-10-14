'use client'

import { useMemo } from 'react'
import AgendaMatrix from '@/components/meetings/AgendaMatrix'
import { useOrgData } from '@/hooks/useOrgData'

export default function ProjectPage() {
  const { org } = useOrgData()
  // 범주 소속(팀명은 조직 설정에서 동적으로 옴 + '개인') — 범주 추가/이동 선택지로만 쓰고 화면은 항상 전체를 보여준다
  const allCatsValues = useMemo(() => [...org.map(t => t.name), '개인'], [org])

  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6 px-0" style={{ background: 'var(--bg-page)', minHeight: '100%' }}>
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-5 px-4 md:px-6">
        <h1 className="text-lg font-bold whitespace-nowrap flex-shrink-0" style={{ color: 'rgba(var(--text-rgb),1)' }}>프로젝트</h1>
      </div>

      {/* 매트릭스 — px 없이 전체 너비 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AgendaMatrix category="전체" allCats={allCatsValues} />
      </div>
    </div>
  )
}
