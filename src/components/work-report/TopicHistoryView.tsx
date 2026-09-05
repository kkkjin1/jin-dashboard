'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, selectClass, selectStyle, fmtDateFull, truncate } from './style'
import EntryDetailModal from './EntryDetailModal'

interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]   // all topics (active + archived)
  reports: WorkReport[]       // all reports
}

export default function TopicHistoryView({ supabase, topics, reports }: Props) {
  const [topicId, setTopicId] = useState(topics[0]?.id ?? '')
  const [entries, setEntries] = useState<WorkReportEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<WorkReportEntry | null>(null)

  const reportById = useMemo(() => new Map(reports.map(r => [r.id, r])), [reports])
  const topic = topics.find(t => t.id === topicId) ?? null

  useEffect(() => {
    if (!topicId) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('work_report_entries')
      .select('*')
      .eq('topic_id', topicId)
      .then(({ data }) => {
        if (!cancelled) { setEntries((data as WorkReportEntry[]) ?? []); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [supabase, topicId])

  const timeline = useMemo(() => {
    return entries
      .map(e => ({ entry: e, report: reportById.get(e.report_id) }))
      .filter((x): x is { entry: WorkReportEntry; report: WorkReport } => !!x.report)
      .sort((a, b) => b.report.period_start.localeCompare(a.report.period_start))
  }, [entries, reportById])

  const activeTopics = topics.filter(t => t.status === 'active')
  const archivedTopics = topics.filter(t => t.status === 'archived')

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="flex items-center gap-2 mb-5">
        <p className="text-[14px] font-semibold flex-shrink-0" style={{ color: S.t1 }}>주제별 히스토리</p>
        <select value={topicId} onChange={e => setTopicId(e.target.value)} className={selectClass} style={selectStyle}>
          <optgroup label="진행중">
            {activeTopics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </optgroup>
          {archivedTopics.length > 0 && (
            <optgroup label="보관됨">
              {archivedTopics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </optgroup>
          )}
        </select>
        {loading && <span className="text-[11px]" style={{ color: S.t4 }}>불러오는 중…</span>}
      </div>

      {!topic ? (
        <p className="text-[12.5px]" style={{ color: S.t4 }}>주제가 없습니다. 먼저 보고서 작성 화면에서 주제를 추가하세요.</p>
      ) : timeline.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: S.t4 }}>이 주제로 보고된 이력이 없습니다.</p>
      ) : (
        <div className="max-w-xl">
          {timeline.map(({ entry, report }, i) => (
            <div key={entry.id} className="relative pl-6 pb-6" style={{ borderLeft: i < timeline.length - 1 ? `1.5px solid ${S.border}` : 'none' }}>
              <span
                className="absolute -left-[5px] top-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: S.accent, boxShadow: `0 0 0 3px ${S.bg}` }}
              />
              <button onClick={() => setDetail(entry)} className="text-left w-full group">
                <p className="text-[12px] font-semibold mb-1" style={{ color: S.t2 }}>{fmtDateFull(report.period_start)}</p>
                <p className="text-[13px] leading-[1.6] group-hover:opacity-80" style={{ color: S.t3 }}>
                  {truncate(entry.report_text, 120) || '(내용 없음)'}
                </p>
              </button>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <EntryDetailModal
          topicTitle={detail.topic_title_snapshot}
          reportLabel={fmtDateFull(reportById.get(detail.report_id)?.period_start)}
          entry={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
