'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, selectClass, selectStyle, fmtDateFull, CONTENT_MAX_WIDTH } from './style'

// "주제별 보기" — 특정 주제 하나가 여러 회차를 거치며 어떻게 바뀌었는지 "깊게" 훑는 화면.
// 작성 화면 RIGHT(ContextPanel)의 히스토리와 역할이 다르다: RIGHT는 report_text만 truncate
// 미리보기로 보여주는 "작성 중 빠른 참고"이고, 여기는 report_text/경영진 전달 포인트/다음
// 액션 3개 필드를 전문 그대로 보여주는 "과거 전체를 읽는" 화면이라 모달 클릭 없이 인라인
// 전체 노출로 정보량과 interaction depth를 구분한다.
interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]   // all topics (active + archived)
  reports: WorkReport[]       // all reports (Archive 상단 기간 필터로 이미 걸러진 상태로 전달됨)
  // 작성 화면 RIGHT의 "전체 히스토리 보기 →"에서 넘어올 때, 방금 보던 주제를 그대로
  // 선택해 보여주기 위한 초기값(uncontrolled — mount 시 1회만 적용).
  initialTopicId?: string
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="mb-2.5">
      <p className="text-[10.5px] font-semibold mb-0.5" style={{ color: S.t4 }}>{label}</p>
      <p className="text-[13px] leading-[1.65] whitespace-pre-wrap" style={{ color: S.t2 }}>{value}</p>
    </div>
  )
}

export default function TopicHistoryView({ supabase, topics, reports, initialTopicId }: Props) {
  const [topicId, setTopicId] = useState(initialTopicId || topics[0]?.id || '')
  const [entries, setEntries] = useState<WorkReportEntry[]>([])
  const [loading, setLoading] = useState(false)

  const reportIds = useMemo(() => new Set(reports.map(r => r.id)), [reports])
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

  // Archive 상단 공용 기간 필터가 걸려 있으면(reports가 그 범위로 이미 좁혀져 있으므로)
  // 그 범위 밖 회차의 entry는 timeline에서도 제외한다 — 전체 보고/기간 매트릭스와 같은 기준.
  const timeline = useMemo(() => {
    return entries
      .filter(e => reportIds.has(e.report_id))
      .map(e => ({ entry: e, report: reportById.get(e.report_id) }))
      .filter((x): x is { entry: WorkReportEntry; report: WorkReport } => !!x.report)
      .sort((a, b) => b.report.period_start.localeCompare(a.report.period_start))
  }, [entries, reportById, reportIds])

  const activeTopics = topics.filter(t => t.status === 'active')
  const archivedTopics = topics.filter(t => t.status === 'archived')

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
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
      ) : timeline.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: S.t4 }}>이 주제로 보고된 이력이 없습니다.</p>
      ) : (
        <div style={{ maxWidth: CONTENT_MAX_WIDTH }}>
          {timeline.map(({ entry, report }, i) => (
            <div key={entry.id} className="relative pl-6 pb-6" style={{ borderLeft: i < timeline.length - 1 ? `1.5px solid ${S.border}` : 'none' }}>
              <span
                className="absolute -left-[5px] top-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: S.accent, boxShadow: `0 0 0 3px ${S.bg}` }}
              />
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[12.5px] font-semibold" style={{ color: S.t1 }}>{fmtDateFull(report.period_start)} ~ {fmtDateFull(report.period_end)}</p>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={report.status === 'final' ? { color: S.accentText, background: S.accentDim } : { color: S.t3, background: 'rgba(var(--ink-rgb),0.06)' }}
                >
                  {report.status === 'final' ? '확정' : '작성중'}
                </span>
              </div>
              <Field label="이번 업데이트" value={entry.report_text} />
              <Field label="경영진 전달 포인트" value={entry.executive_point} />
              {/* 향후 Feedback Loop 자리 — 회차별 timeline이라 "이 시점에 경영진이 뭐라고
                  했는지"를 붙이기 가장 자연스러운 곳. 지금은 표시하지 않는다. */}
              <Field label="다음 액션" value={entry.next_action} />
              {!entry.report_text && !entry.executive_point && !entry.next_action && (
                <p className="text-[12.5px]" style={{ color: S.t4 }}>작성된 내용이 없습니다.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
