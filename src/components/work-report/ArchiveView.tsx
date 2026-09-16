'use client'

import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S } from './style'
import ReportsFeed from './ReportsFeed'
import TopicHistoryView from './TopicHistoryView'
import PeriodMatrixView from './PeriodMatrixView'

// 보고 아카이브 — "과거 보고와 주제의 변화를 찾아보는 곳". 예전에는 [기간별 전체 보기]
// (좌측 상단에 작은 matrix, 화면 대부분 공백) / [주제별 히스토리](짧은 timeline)가 각각
// 독립된 top-level 화면이었다. 실제로 하는 일은 둘 다 "과거 참고"라 [보고서 작성]과
// 대등한 top-level 자리를 가질 이유가 없었고, 정보 밀도도 낮았다 — 그래서 하나의 Archive
// 아래 sub-view로 통합한다. 기간 매트릭스는 완전히 다른 역할(회차 단위 scanning, 텍스트를
// "읽는" 게 아니라 공백/존재 여부를 훑는 용도)이라 삭제하지 않고 secondary 탭으로 낮춰 보존.
type ArchiveTab = 'reports' | 'topics' | 'matrix'

interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]
  reports: WorkReport[]                               // asc by period_start, 전체
  entriesByReport: Map<string, WorkReportEntry[]>
  ensureEntries: (reportId: string) => Promise<WorkReportEntry[]>
  onOpenReport: (reportId: string) => void
  // 작성 화면 RIGHT "전체 히스토리 보기 →"에서 넘어올 때만 넘어온다 — Archive는 write
  // 모드에서 전환될 때 항상 새로 mount되므로(조건부 렌더) 이 값은 매번 그 시점의
  // "1회성 초기값"으로만 쓰이고, 이후 사용자가 tab/주제를 바꾸는 것과는 무관하다.
  initialTab?: 'reports' | 'topics'
  initialTopicId?: string
}

const TABS: { key: ArchiveTab; label: string }[] = [
  { key: 'reports', label: '전체 보고' },
  { key: 'topics', label: '주제별 보기' },
]

export default function ArchiveView({
  supabase, topics, reports, entriesByReport, ensureEntries, onOpenReport, initialTab, initialTopicId,
}: Props) {
  const [tab, setTab] = useState<ArchiveTab>(initialTab ?? 'reports')
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
  const filteredReportsDesc = useMemo(() => [...filteredReportsAsc].reverse(), [filteredReportsAsc])

  return (
    <div className="h-full flex flex-col">
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
          {/* 기간 매트릭스는 텍스트를 읽는 화면이 아니라 존재/공백을 훑는 보조 도구라
              시각적으로 한 단계 낮춰 구분한다(구분선 + 연한 글자, 같은 pill 스타일 아님). */}
          <span className="mx-1" style={{ width: 1, alignSelf: 'stretch', background: S.border }} />
          <button
            onClick={() => setTab('matrix')}
            className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors"
            style={{ color: tab === 'matrix' ? S.t2 : S.t4, background: tab === 'matrix' ? 'rgba(var(--ink-rgb),0.06)' : 'transparent' }}
          >
            기간 매트릭스
          </button>
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

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        {tab === 'reports' && (
          <ReportsFeed
            reports={filteredReportsDesc}
            topics={topics}
            entriesByReport={entriesByReport}
            ensureEntries={ensureEntries}
            onOpenReport={onOpenReport}
          />
        )}
        {tab === 'topics' && (
          <TopicHistoryView supabase={supabase} topics={topics} reports={filteredReportsAsc} initialTopicId={initialTopicId} />
        )}
        {tab === 'matrix' && (
          <PeriodMatrixView supabase={supabase} topics={topics} reports={filteredReportsAsc} />
        )}
      </div>
    </div>
  )
}
