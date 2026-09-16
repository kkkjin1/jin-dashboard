'use client'

import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportTopic } from '@/types'
import { S } from './style'
import ArchiveCompareView from './ArchiveCompareView'
import TopicHistoryView from './TopicHistoryView'

// 보고 아카이브 — "과거 보고와 주제의 변화를 찾아보는 곳". 예전에는 [전체 보고](회차별
// vertical accordion) / [주제별 보기](topic timeline) / [기간 매트릭스](존재 유무 훑기)
// 3개 sub-view가 각자 독립돼 있었지만 실사용에서 역할이 크게 겹쳤다 — "전체 보고"는 한
// 회차를 읽는 화면, "기간 매트릭스"는 row=topic×col=report 그리드로 여러 회차를 훑는
// 화면이었는데, 격주 보고 간 변화를 비교하는 실제 workflow(지난 보고에서 뭘 말했는지 →
// 이번에 뭐가 달라졌는지)에는 매트릭스 쪽 구조가 훨씬 맞았다. 그래서 지금은 2개로 합친다:
//   전체 비교  = 여러 section/topic × 여러 report (구 매트릭스 골격 + 구 전체보고의 상세 필드)
//   주제 히스토리 = 하나의 topic × 여러 report 상세 (구 주제별 보기 + 구 매트릭스 골격)
// 개별 회차를 그대로 "읽고" 싶을 때는 전체 비교에서 그 회차를 열어(onOpenReport) 작성
// 화면의 "문서로 보기"를 쓴다 — 이 화면에서 문서 전체를 다시 렌더링하지 않는다.
type ArchiveTab = 'compare' | 'topic'

interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]
  reports: WorkReport[]                               // asc by period_start, 전체
  onOpenReport: (reportId: string) => void
  // 작성 화면 RIGHT "전체 히스토리 보기 →"에서 넘어올 때만 넘어온다 — Archive는 write
  // 모드에서 전환될 때 항상 새로 mount되므로(조건부 렌더) 이 값은 매번 그 시점의
  // "1회성 초기값"으로만 쓰이고, 이후 사용자가 tab/주제를 바꾸는 것과는 무관하다.
  initialTab?: 'compare' | 'topic'
  initialTopicId?: string
}

const TABS: { key: ArchiveTab; label: string }[] = [
  { key: 'compare', label: '전체 비교' },
  { key: 'topic', label: '주제 히스토리' },
]

export default function ArchiveView({
  supabase, topics, reports, onOpenReport, initialTab, initialTopicId,
}: Props) {
  const [tab, setTab] = useState<ArchiveTab>(initialTab ?? 'compare')
  const minStart = reports[0]?.period_start ?? ''
  const maxEnd = reports[reports.length - 1]?.period_end ?? ''
  const [periodStart, setPeriodStart] = useState(minStart)
  const [periodEnd, setPeriodEnd] = useState(maxEnd)

  // reports가 로드되기 전(초기 렌더)에는 minStart/maxEnd가 빈 문자열이라 필터 input도
  // 비어 있는다 — reports가 실제로 오면 그 다음부터는 사용자가 직접 바꾸기 전까지 유지.
  const effectiveStart = periodStart || minStart
  const effectiveEnd = periodEnd || maxEnd

  const filteredReportsAsc = useMemo(
    () => reports.filter(r => r.period_start <= effectiveEnd && r.period_end >= effectiveStart),
    [reports, effectiveStart, effectiveEnd],
  )

  return (
    // page.tsx의 본문 컨테이너(flex-1 min-h-0 flex overflow-hidden)는 write 모드에서
    // Outline/CENTER/Context 세 flex item을 나란히 두는 row-flex다. archive 모드는 그
    // row의 유일한 item이므로 flex-1 min-w-0이 없으면 flex-basis:auto(content-fit)로
    // 줄어들어 남은 가로 공간을 못 쓴다 — Archive가 main 가용폭 일부만 쓰던 문제의 실제
    // 원인이었다.
    <div className="h-full flex flex-col flex-1 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap px-6 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(var(--ink-rgb),0.04)' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ color: tab === t.key ? S.t1 : S.t3, background: tab === t.key ? S.accentDim : 'transparent' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px]" style={{ color: S.t4 }}>기간</span>
          <input
            type="date"
            value={effectiveStart}
            onChange={e => setPeriodStart(e.target.value)}
            className="text-[12px] px-2 py-1 rounded-lg"
            style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}`, color: S.t2 }}
          />
          <span style={{ color: S.t4 }}>~</span>
          <input
            type="date"
            value={effectiveEnd}
            onChange={e => setPeriodEnd(e.target.value)}
            className="text-[12px] px-2 py-1 rounded-lg"
            style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}`, color: S.t2 }}
          />
        </div>
      </div>

      {/* Archive는 문서 작성 화면보다 가로 비교가 중요한 화면이라 main available width를
          그대로 쓴다(max-width cap 없음) — 회차가 많아 폭을 넘으면 페이지 전체가 아니라
          비교 grid 내부(ArchiveCompareView/TopicHistoryView)만 가로 스크롤된다. */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        {tab === 'compare' && (
          <ArchiveCompareView
            supabase={supabase}
            topics={topics}
            reports={filteredReportsAsc}
            onOpenReport={onOpenReport}
          />
        )}
        {tab === 'topic' && (
          <TopicHistoryView supabase={supabase} topics={topics} reports={filteredReportsAsc} initialTopicId={initialTopicId} />
        )}
      </div>
    </div>
  )
}
