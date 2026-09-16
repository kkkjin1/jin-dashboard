'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, fmtPeriodLabel, truncate } from './style'
import ReportDocument from './ReportDocument'

// "전체 보고" — 과거 회차를 실제로 "읽는" 화면. 작은 matrix에 정보를 욱여넣는 대신
// 회차 단위 document feed(accordion)로 구성한다. entries는 회차당 카드가 펼쳐질 때만
// lazy fetch한다(20개+ 회차가 쌓여도 한 번에 다 불러오지 않음) — page.tsx의 기존
// ensureEntries/entriesByReport 캐시를 그대로 재사용, 새 fetch 로직을 따로 만들지 않는다.

interface Props {
  reports: WorkReport[]                              // desc by period_start, 기간 필터 적용된 상태로 전달됨
  topics: WorkReportTopic[]                           // all topics(archived 포함)
  entriesByReport: Map<string, WorkReportEntry[]>
  ensureEntries: (reportId: string) => Promise<WorkReportEntry[]>
  onOpenReport: (reportId: string) => void
}

export default function ReportsFeed({ reports, topics, entriesByReport, ensureEntries, onOpenReport }: Props) {
  // 가장 최근 회차만 기본으로 펼쳐둔다 — 나머지는 필요할 때 클릭(단일 아코디언).
  const [openId, setOpenId] = useState<string | null>(reports[0]?.id ?? null)
  const topicsById = new Map(topics.map(t => [t.id, t]))

  useEffect(() => {
    if (openId) void ensureEntries(openId)
  }, [openId, ensureEntries])

  if (reports.length === 0) {
    return <p className="text-[12.5px] px-1" style={{ color: S.t4 }}>선택한 기간에 보고서가 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      {reports.map(report => {
        const isOpen = openId === report.id
        const entries = entriesByReport.get(report.id)
        const rows = (entries ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(entry => ({ entry, topic: topicsById.get(entry.topic_id) }))
          .filter((r): r is { entry: WorkReportEntry; topic: WorkReportTopic } => !!r.topic)

        return (
          <div key={report.id} className="rounded-lg" style={{ border: `1px solid ${S.border}` }}>
            <button
              onClick={() => setOpenId(isOpen ? null : report.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isOpen ? <ChevronDown size={13} style={{ flexShrink: 0, color: S.t3 }} /> : <ChevronRight size={13} style={{ flexShrink: 0, color: S.t3 }} />}
                <p className="text-[13.5px] font-semibold truncate" style={{ color: S.t1 }}>{fmtPeriodLabel(report.period_start, report.period_end)}</p>
                <span
                  className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={report.status === 'final'
                    ? { color: S.accentText, background: S.accentDim }
                    : { color: S.t3, background: 'rgba(var(--ink-rgb),0.06)' }}
                >
                  {report.status === 'final' ? '확정' : '작성중'}
                </span>
              </div>
              {!isOpen && (
                <p className="text-[12px] truncate flex-1 text-right" style={{ color: S.t4 }}>
                  {truncate(report.summary, 60) || '(작성된 내용 없음)'}
                </p>
              )}
            </button>

            {isOpen && (
              <div className="px-5 pb-5 pt-1" style={{ borderTop: `1px solid ${S.border}` }}>
                {entries === undefined ? (
                  <p className="text-[12px] py-4" style={{ color: S.t4 }}>불러오는 중…</p>
                ) : (
                  <>
                    <div className="pt-4">
                      <ReportDocument report={report} rows={rows} />
                    </div>
                    <button
                      onClick={() => onOpenReport(report.id)}
                      className="mt-4 text-[11.5px] font-medium underline underline-offset-2"
                      style={{ color: S.t3 }}
                    >
                      이 보고 열기 →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
