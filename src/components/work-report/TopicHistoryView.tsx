'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, selectClass, selectStyle, fmtPeriodLabel, ARCHIVE_LABEL_COL_WIDTH, ARCHIVE_REPORT_COL_MIN_WIDTH } from './style'
import ArchiveCell from './ArchiveCell'
import EntryDetailModal from './EntryDetailModal'

// "주제 히스토리" — 예전에 별도 top-level 화면이던 TopicHistoryView(주제 하나를 깊게 읽는
// vertical timeline)와 PeriodMatrixView(row×column 그리드로 훑는 것)를 하나로 합친 결과다.
// 남기는 축은 PeriodMatrixView 쪽의 "row=주제, column=회차" 그리드 — ArchiveCompareView와
// 같은 grid 골격(ArchiveCell)을 그대로 재사용하되, row가 선택한 topic 하나뿐이라 dense=false로
// 필드를 더 길게 보여준다("하나의 topic × 여러 report 상세"). topic 선택 UI는 기존 그대로.
interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]   // all topics (active + archived)
  reports: WorkReport[]       // Archive 상단 기간 필터가 적용된 report 목록, asc by period_start
  initialTopicId?: string
}

export default function TopicHistoryView({ supabase, topics, reports, initialTopicId }: Props) {
  const [topicId, setTopicId] = useState(initialTopicId || topics[0]?.id || '')
  const [entries, setEntries] = useState<WorkReportEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<{ reportLabel: string; fields: { label: string; value: string }[] } | null>(null)

  const topic = topics.find(t => t.id === topicId) ?? null
  const activeTopics = topics.filter(t => t.status === 'active')
  const archivedTopics = topics.filter(t => t.status === 'archived')

  useEffect(() => {
    if (!topicId) return
    let cancelled = false
    async function run() {
      setLoading(true)
      const { data } = await supabase
        .from('work_report_entries')
        .select('*')
        .eq('topic_id', topicId)
      if (!cancelled) { setEntries((data as WorkReportEntry[]) ?? []); setLoading(false) }
    }
    void run()
    return () => { cancelled = true }
  }, [supabase, topicId])

  const entryByReportId = useMemo(() => new Map(entries.map(e => [e.report_id, e])), [entries])

  const gridTemplateColumns = `${ARCHIVE_LABEL_COL_WIDTH}px repeat(${reports.length}, minmax(${ARCHIVE_REPORT_COL_MIN_WIDTH}px, 1fr))`
  const labelCellStyle: React.CSSProperties = {
    position: 'sticky', left: 0, zIndex: 2, background: S.panel, color: S.t1,
    borderBottom: `1px solid ${S.border}`, borderRight: `1px solid ${S.border}`,
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: S.t3 }}>주제</span>
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
      ) : reports.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: S.t4 }}>선택한 기간에 보고서가 없습니다.</p>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg" style={{ border: `1px solid ${S.border}`, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns }}>
            <div className="px-3 py-2.5 text-[11px] font-semibold" style={{ ...labelCellStyle, top: 0, zIndex: 3 }}>회차</div>
            {reports.map(r => (
              <div
                key={r.id}
                className="px-3 py-2.5"
                style={{ position: 'sticky', top: 0, zIndex: 1, background: S.panel, borderBottom: `1px solid ${S.border}`, borderLeft: `1px solid ${S.border}` }}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: S.t1 }}>{fmtPeriodLabel(r.period_start, r.period_end)}</span>
                  <span
                    className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={r.status === 'final' ? { color: S.accentText, background: S.accentDim } : { color: S.t3, background: 'rgba(var(--ink-rgb),0.06)' }}
                  >
                    {r.status === 'final' ? '확정' : '작성중'}
                  </span>
                </div>
              </div>
            ))}

            <div className="px-3 py-2.5 text-[12px] font-medium truncate" style={{ ...labelCellStyle, borderBottom: 'none' }}>
              {topic.title}
            </div>
            {reports.map(r => {
              const entry = entryByReportId.get(r.id)
              const fields = entry ? [
                { label: '이번 업데이트', value: entry.report_text },
                { label: '경영진 전달 포인트', value: entry.executive_point },
                { label: '다음 액션', value: entry.next_action },
              ] : []
              return (
                <div key={r.id} style={{ borderLeft: `1px solid ${S.border}` }}>
                  <ArchiveCell
                    dense={false}
                    fields={fields}
                    onClick={entry ? () => setDetail({ reportLabel: fmtPeriodLabel(r.period_start, r.period_end), fields }) : undefined}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {detail && (
        <EntryDetailModal title={topic?.title ?? ''} reportLabel={detail.reportLabel} fields={detail.fields} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
