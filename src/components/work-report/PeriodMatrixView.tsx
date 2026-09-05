'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, fmtDateShort, truncate } from './style'
import EntryDetailModal from './EntryDetailModal'

interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]
  reports: WorkReport[]   // 전체 report, asc by period_start
}

export default function PeriodMatrixView({ supabase, topics, reports }: Props) {
  const minStart = reports[0]?.period_start ?? ''
  const maxEnd = reports[reports.length - 1]?.period_end ?? ''
  const [periodStart, setPeriodStart] = useState(minStart)
  const [periodEnd, setPeriodEnd] = useState(maxEnd)
  const [entries, setEntries] = useState<WorkReportEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<{ report: WorkReport; entry: WorkReportEntry; topicTitle: string } | null>(null)

  const cols = useMemo(
    () => reports.filter(r => r.period_start <= periodEnd && r.period_end >= periodStart),
    [reports, periodStart, periodEnd],
  )

  useEffect(() => {
    // cols가 비면 fetch를 건너뛴다 — entries가 이전 값을 들고 있어도 아래 rowTopicIds/
    // cellMap이 현재 cols 기준으로만 조회하므로 화면에는 영향이 없다.
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
    <div className="h-full flex flex-col px-6 py-5 overflow-hidden">
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <p className="text-[14px] font-semibold" style={{ color: S.t1 }}>전체 주제 히스토리</p>
        <span className="text-[11px]" style={{ color: S.t4 }}>기간</span>
        <input
          type="date"
          value={periodStart}
          onChange={e => setPeriodStart(e.target.value)}
          className="text-[12px] px-2 py-1 rounded-lg [color-scheme:dark]"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, color: S.t2 }}
        />
        <span style={{ color: S.t4 }}>~</span>
        <input
          type="date"
          value={periodEnd}
          onChange={e => setPeriodEnd(e.target.value)}
          className="text-[12px] px-2 py-1 rounded-lg [color-scheme:dark]"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, color: S.t2 }}
        />
        {loading && <span className="text-[11px]" style={{ color: S.t4 }}>불러오는 중…</span>}
      </div>

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
