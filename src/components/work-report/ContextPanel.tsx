'use client'

import { useState } from 'react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, selectClass, selectStyle, fmtDateFull, truncate } from './style'
import { isFixedKey, type FixedSectionKey } from './TopicOutline'

const FIXED_LABEL: Record<FixedSectionKey, string> = {
  summary: '핵심 요약', issues: '주요 이슈 / 의사결정', next_steps: '다음 단계',
}

interface Props {
  selection: string
  topic: WorkReportTopic | null
  report: WorkReport
  pastReports: WorkReport[]                 // 현재 report보다 이전 report들, desc by period_start
  compareReportId: string
  onChangeCompareReportId: (id: string) => void
  compareEntry: WorkReportEntry | null
  compareReportObj: WorkReport | null
  entry: WorkReportEntry | null
  topicHistory: { report: WorkReport; entry: WorkReportEntry }[]
  // "주제별 히스토리" 전체 화면(TopicHistoryView)으로 점프 — 여기 목록은 compact 미리보기일 뿐,
  // 그 화면을 대체하지 않는다.
  onOpenFullHistory: () => void
}

// "참고 자료"는 실제 연동이 없는 placeholder라 탭 목록에서 제거했다(기존 전후비교/히스토리
// 기능에는 영향 없음) — 필요해지면 그때 실제 기능과 함께 다시 넣는다.
type Tab = 'compare' | 'history'

function ReadonlyBlock({ text }: { text: string }) {
  return (
    <div
      className="px-3 py-2.5 rounded-lg text-[12.5px] leading-[1.65] whitespace-pre-wrap"
      style={{ background: 'rgba(var(--ink-rgb),0.025)', border: `1px solid ${S.border}`, color: S.t2, minHeight: 72 }}
    >
      {text || <span style={{ color: S.t4 }}>(내용 없음)</span>}
    </div>
  )
}

export default function ContextPanel({
  selection, topic, report, pastReports, compareReportId, onChangeCompareReportId,
  compareEntry, compareReportObj, entry, topicHistory, onOpenFullHistory,
}: Props) {
  const [tab, setTab] = useState<Tab>('compare')
  const isFixed = isFixedKey(selection)

  const compareSelect = (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: S.t3 }}>비교 기준</span>
      <select
        value={compareReportId}
        onChange={e => onChangeCompareReportId(e.target.value)}
        className={selectClass + ' flex-1'}
        style={selectStyle}
      >
        {pastReports.length === 0 && <option value="">이전 보고 없음</option>}
        {pastReports.map(r => (
          <option key={r.id} value={r.id}>{fmtDateFull(r.period_start)}{r.status === 'final' ? ' (확정)' : ' (작성중)'}</option>
        ))}
      </select>
    </div>
  )

  if (isFixed) {
    const fixedKey = selection as FixedSectionKey
    const compareText = compareReportObj ? (compareReportObj[fixedKey === 'next_steps' ? 'next_steps' : fixedKey] as string) : ''
    return (
      <div className="h-full overflow-y-auto px-5 py-5" style={{ width: 288, flexShrink: 0 }}>
        <p className="text-[13px] font-semibold mb-3" style={{ color: S.t1 }}>직전 보고 · {FIXED_LABEL[fixedKey]}</p>
        {compareSelect}
        <ReadonlyBlock text={compareText} />
      </div>
    )
  }

  if (!topic) return <div style={{ width: 288, flexShrink: 0 }} />

  return (
    <div className="h-full flex flex-col" style={{ width: 288, flexShrink: 0 }}>
      <div className="flex items-center gap-1 px-3 pt-3 pb-2" style={{ borderBottom: `1px solid ${S.border}` }}>
        {([['compare', '전후 비교'], ['history', '관련 주제 히스토리']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-colors"
            style={{ color: tab === k ? S.accentText : S.t3, background: tab === k ? S.accentDim : 'transparent' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === 'compare' && (
          <>
            {compareSelect}
            <div className="grid grid-cols-2 gap-2 mb-1">
              <span className="text-[10.5px] font-semibold" style={{ color: S.t4 }}>이전 보고</span>
              <span className="text-[10.5px] font-semibold" style={{ color: S.t4 }}>이번 보고</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ReadonlyBlock text={compareEntry?.report_text ?? ''} />
              <ReadonlyBlock text={entry?.report_text ?? ''} />
            </div>
          </>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {topicHistory.length === 0 && (
              <p className="text-[12px]" style={{ color: S.t4 }}>이 주제의 과거 보고 이력이 없습니다.</p>
            )}
            {topicHistory.map(({ report: r, entry: e }) => (
              <button
                key={r.id}
                onClick={() => { onChangeCompareReportId(r.id); setTab('compare') }}
                className="w-full text-left flex gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: r.id === report.id ? S.accent : S.t4 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-medium" style={{ color: S.t2 }}>
                    {fmtDateFull(r.period_start)} {r.id === report.id && '(현재)'}
                  </p>
                  <p className="text-[12px] truncate group-hover:opacity-80" style={{ color: S.t3 }}>
                    {truncate(e.report_text, 60) || '(내용 없음)'}
                  </p>
                </div>
              </button>
            ))}

            {/* 이 목록은 compact 미리보기 — 전체 화면(TopicHistoryView)을 대체하지 않고 연결만 한다. */}
            <button
              onClick={onOpenFullHistory}
              className="text-[11px] font-medium underline underline-offset-2"
              style={{ color: S.t3 }}
            >
              전체 주제별 히스토리 보기 →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
