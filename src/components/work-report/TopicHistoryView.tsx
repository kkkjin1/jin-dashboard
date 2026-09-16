'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, selectClass, selectStyle, fmtPeriodLabel, hasContent, WRITING_CONTENT_WIDTH } from './style'

// "주제 히스토리" — "전체 비교"(여러 topic × 여러 report를 가로로 훑기)와 역할이 뚜렷이
// 갈리는 화면이어야 한다: 여기는 하나의 topic을 골라 시간축을 위(최신)→아래(과거)로 깊게
// 읽는 화면이다. 그래서 grid/table이 아니라 회차별 카드를 세로 timeline으로 쌓는다 — 굳이
// 새 시각 언어를 만들지 않고, 이 컴포넌트가 원래 갖고 있던 좌측 timeline 라인 + dot 패턴을
// 그대로 되살려 쓴다. 데이터는 topic_id로 이 topic이 등장한 report만 자연스럽게 모이므로
// (entry가 없는 회차는애초에 이 topic이 그 report에 없었다는 뜻), 전체 비교처럼 "—" vs
// "내용 없음"을 별도로 구분할 필요가 없다.
interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]   // all topics (active + archived)
  reports: WorkReport[]       // Archive 상단 기간 필터가 적용된 report 목록, asc by period_start
  initialTopicId?: string
}

// 필드 하나(이번 업데이트/경영진 전달 포인트/다음 액션)를 깊게 읽는 카드 — 너무 길면
// clamp하고 펼쳐보기 토글을 둔다. ReportEditorPanel의 "직전 보고" 미리보기와 동일한
// 패턴(clamp 3줄 + 펼쳐보기)을 재사용해 앱 전체의 상호작용 언어를 통일한다.
function Field({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!hasContent(value)) return null
  const long = value.length > 160
  return (
    <div className="mb-3.5 last:mb-0">
      <p className="text-[10.5px] font-semibold mb-1" style={{ color: S.t4 }}>{label}</p>
      <p
        className="text-[13px] leading-[1.65] whitespace-pre-wrap"
        style={{
          color: emphasis ? S.t1 : S.t2,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: open ? undefined : 4,
          overflow: open ? 'visible' : 'hidden',
        }}
      >
        {value}
      </p>
      {long && (
        <button onClick={() => setOpen(o => !o)} className="text-[11px] font-medium underline mt-1" style={{ color: S.t4 }}>
          {open ? '접기' : '펼쳐보기'}
        </button>
      )}
    </div>
  )
}

export default function TopicHistoryView({ supabase, topics, reports, initialTopicId }: Props) {
  const [topicId, setTopicId] = useState(initialTopicId || topics[0]?.id || '')
  const [entries, setEntries] = useState<WorkReportEntry[]>([])
  const [loading, setLoading] = useState(false)

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

  const reportIds = useMemo(() => new Set(reports.map(r => r.id)), [reports])
  const reportById = useMemo(() => new Map(reports.map(r => [r.id, r])), [reports])

  // 최신 회차가 위 — 카드를 위에서 아래로 읽으면 시간이 거슬러 올라간다("이번 회차 →
  // 직전 회차 → ..."). Archive 상단 기간 필터가 걸려 있으면 그 범위 밖 회차는 제외한다.
  const timeline = useMemo(() => {
    return entries
      .filter(e => reportIds.has(e.report_id))
      .map(e => ({ entry: e, report: reportById.get(e.report_id) }))
      .filter((x): x is { entry: WorkReportEntry; report: WorkReport } => !!x.report)
      .sort((a, b) => b.report.period_start.localeCompare(a.report.period_start))
  }, [entries, reportById, reportIds])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-5 flex-shrink-0">
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

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!topic ? (
          <p className="text-[12.5px]" style={{ color: S.t4 }}>주제가 없습니다. 먼저 보고서 작성 화면에서 주제를 추가하세요.</p>
        ) : timeline.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: S.t4 }}>이 주제로 보고된 이력이 없습니다.</p>
        ) : (
          <div style={{ maxWidth: WRITING_CONTENT_WIDTH }}>
            <p className="text-[16px] font-semibold mb-4" style={{ color: S.t1 }}>{topic.title}</p>
            {timeline.map(({ entry, report }, i) => (
              <div key={entry.id} className="relative pl-7 pb-7" style={{ borderLeft: i < timeline.length - 1 ? `1.5px solid ${S.border}` : 'none' }}>
                <span
                  className="absolute -left-[5.5px] top-1 rounded-full"
                  style={{ width: 11, height: 11, background: i === 0 ? S.accent : S.t4, boxShadow: `0 0 0 3px ${S.bg}` }}
                />
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[13.5px] font-semibold" style={{ color: S.t1 }}>{fmtPeriodLabel(report.period_start, report.period_end)}</p>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={report.status === 'final' ? { color: S.accentText, background: S.accentDim } : { color: S.t3, background: 'rgba(var(--ink-rgb),0.06)' }}
                  >
                    {report.status === 'final' ? '확정' : '작성중'}
                  </span>
                  {i === 0 && <span className="text-[10.5px] font-medium" style={{ color: S.accentText }}>최신</span>}
                </div>
                <div className="rounded-lg px-4 py-3.5" style={{ background: 'rgba(var(--ink-rgb),0.02)', border: `1px solid ${S.border}` }}>
                  <Field label="이번 업데이트" value={entry.report_text} emphasis />
                  <Field label="경영진 전달 포인트" value={entry.executive_point} />
                  <Field label="다음 액션" value={entry.next_action} />
                  {!hasContent(entry.report_text) && !hasContent(entry.executive_point) && !hasContent(entry.next_action) && (
                    <p className="text-[12.5px]" style={{ color: S.t4 }}>작성된 내용이 없습니다.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
