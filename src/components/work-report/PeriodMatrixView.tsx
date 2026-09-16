'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, fmtDateShort, truncate } from './style'
import EntryDetailModal from './EntryDetailModal'

// "기간 매트릭스" — Archive의 secondary/보조 뷰. 회차 하나를 읽거나(전체 보고) 주제 하나를
// 깊게 훑는(주제별 보기) 것과 달리, 이 표는 "어느 회차에 어떤 주제가 있었는지"를 한눈에
// scanning하기 위한 것 — 텍스트를 읽는 용도가 아니라 존재 유무/공백을 훑는 용도라 primary
// 탭과 동일한 비중을 주지 않는다. 기간 필터는 Archive 상단의 공용 필터를 그대로 받는다
// (이 컴포넌트가 자체 날짜 상태를 갖지 않음 — 전체 보고/주제별 보기와 같은 기준을 공유).
interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]
  reports: WorkReport[]         // 이미 기간 필터가 적용된 전체 report 목록, asc by period_start
}

export default function PeriodMatrixView({ supabase, topics, reports }: Props) {
  const cols = reports
  const [entries, setEntries] = useState<WorkReportEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<{ report: WorkReport; entry: WorkReportEntry; topicTitle: string } | null>(null)

  useEffect(() => {
    // cols가 비면 fetch를 건너뛴다 — entries가 이전 값을 들고 있어도 아래 rowTopicIds/
    // cellMap이 현재 cols 기준으로만 조회하므로 화면에는 영향이 없다(기존 동작 그대로).
    if (cols.length === 0) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('work_report_entries')
      .select('*')
      .in('report_id', cols.map(r => r.id))
      .then(({ data }) => {
        if (!cancelled) { setEntries((data as WorkReportEntry[]) ?? []); setLoading(false) }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols.map(r => r.id).join(',')])

  const topicById = useMemo(() => new Map(topics.map(t => [t.id, t])), [topics])

  const rowTopicIds = useMemo(() => {
    const firstSeen = new Map<string, string>() // topicId -> earliest period_start among cols
    for (const col of cols) {
      for (const e of entries) {
        if (e.report_id !== col.id) continue
        const existing = firstSeen.get(e.topic_id)
        if (!existing || col.period_start < existing) firstSeen.set(e.topic_id, col.period_start)
      }
    }
    return [...firstSeen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([topicId]) => topicId)
  }, [cols, entries])

  const cellMap = useMemo(() => {
    const m = new Map<string, WorkReportEntry>()
    for (const e of entries) m.set(`${e.topic_id}:${e.report_id}`, e)
    return m
  }, [entries])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {loading && <p className="text-[11px] mb-2" style={{ color: S.t4 }}>불러오는 중…</p>}
      <div className="flex-1 overflow-auto" style={{ border: `1px solid ${S.border}`, borderRadius: S.r }}>
        {cols.length === 0 ? (
          <div className="p-8 text-center text-[12.5px]" style={{ color: S.t4 }}>선택한 기간에 보고서가 없습니다.</div>
        ) : (
          <table className="w-full border-collapse" style={{ minWidth: 160 + cols.length * 140 }}>
            <thead>
              <tr>
                <th
                  className="text-left px-3 py-2 text-[11px] font-semibold sticky left-0 z-10"
                  style={{ background: S.panel, color: S.t3, width: 160, borderBottom: `1px solid ${S.border}` }}
                >
                  주제
                </th>
                {cols.map(r => (
                  <th
                    key={r.id}
                    className="text-left px-3 py-2 text-[11px] font-semibold whitespace-nowrap"
                    style={{ color: S.t3, borderBottom: `1px solid ${S.border}`, borderLeft: `1px solid ${S.border}` }}
                  >
                    {fmtDateShort(r.period_start)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowTopicIds.map(topicId => {
                const topic = topicById.get(topicId)
                return (
                  <tr key={topicId}>
                    <td
                      className="px-3 py-2 text-[12.5px] font-medium sticky left-0 z-10"
                      style={{ background: S.panel, color: S.t2, borderBottom: `1px solid ${S.border}` }}
                    >
                      {topic?.title ?? '(삭제된 주제)'}
                    </td>
                    {cols.map(col => {
                      const entry = cellMap.get(`${topicId}:${col.id}`)
                      return (
                        <td
                          key={col.id}
                          onClick={() => entry && setDetail({ report: col, entry, topicTitle: entry.topic_title_snapshot })}
                          className="px-3 py-2 text-[12px] align-top"
                          style={{
                            color: entry ? S.t2 : S.t4,
                            borderBottom: `1px solid ${S.border}`,
                            borderLeft: `1px solid ${S.border}`,
                            cursor: entry ? 'pointer' : 'default',
                          }}
                        >
                          {entry ? (truncate(entry.report_text, 32) || '(내용 없음)') : '—'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {rowTopicIds.length === 0 && !loading && (
                <tr><td colSpan={cols.length + 1} className="px-3 py-8 text-center text-[12.5px]" style={{ color: S.t4 }}>표시할 주제가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <EntryDetailModal
          topicTitle={detail.topicTitle}
          reportLabel={`${fmtDateShort(detail.report.period_start)} ~ ${fmtDateShort(detail.report.period_end)}`}
          entry={detail.entry}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
