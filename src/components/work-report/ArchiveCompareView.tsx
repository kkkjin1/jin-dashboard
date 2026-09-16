'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, fmtPeriodLabel, ARCHIVE_LABEL_COL_WIDTH, ARCHIVE_REPORT_COL_WIDTH } from './style'
import ArchiveCell from './ArchiveCell'
import EntryDetailModal from './EntryDetailModal'

// "전체 비교" — Archive의 기본 화면. ROW=동일 section/topic, COLUMN=동일 report 회차.
//
// width 전략: report가 몇 개든 "viewport를 채우는 폭"이 아니라 "한 회차를 읽기 좋은 고정
// 폭"을 기준으로 삼는다 — grid-template-columns가 고정 px(LABEL + N×REPORT)이고 grid
// 컨테이너 자체도 width:fit-content라, report가 2개뿐이면 오른쪽이 비어 있어도 되고(의도된
// 여백이지 버그가 아님), report가 많아지면 바깥 wrapper가 가로 스크롤된다. border도 grid에만
// 둬서 실제 테이블 폭에 딱 맞게 그려지고, 빈 여백까지 박스로 감싸지 않는다.
//
// 개별 회차를 "읽고 싶을 때"는 그 회차를 열어(onOpenReport) 작성 화면의 "문서로 보기"를
// 그대로 쓴다 — 여기서 전체 문서를 다시 렌더링하지 않는다.
interface Props {
  supabase: SupabaseClient
  topics: WorkReportTopic[]        // all topics (active + archived) — 과거 이력 유지
  reports: WorkReport[]            // Archive 상단 기간 필터가 이미 적용된 전체 report, asc by period_start
  onOpenReport: (reportId: string) => void
}

interface DetailState {
  title: string
  reportLabel: string
  fields: { label: string; value: string }[]
}

export default function ArchiveCompareView({ supabase, topics, reports, onOpenReport }: Props) {
  const cols = reports
  const [entries, setEntries] = useState<WorkReportEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<DetailState | null>(null)

  useEffect(() => {
    if (cols.length === 0) return
    let cancelled = false
    async function run() {
      setLoading(true)
      const { data } = await supabase
        .from('work_report_entries')
        .select('*')
        .in('report_id', cols.map(r => r.id))
      if (!cancelled) { setEntries((data as WorkReportEntry[]) ?? []); setLoading(false) }
    }
    void run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols.map(r => r.id).join(',')])

  const topicById = useMemo(() => new Map(topics.map(t => [t.id, t])), [topics])

  // 동일 topic은 항상 같은 row — title 문자열이 아니라 topic_id 기준, 이 필터 범위 안에서
  // 가장 이른 회차(첫 등장)순으로 정렬한다.
  const rowTopicIds = useMemo(() => {
    const firstSeen = new Map<string, string>()
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

  if (cols.length === 0) {
    return <div className="p-8 text-center text-[12.5px]" style={{ color: S.t4 }}>선택한 기간에 보고서가 없습니다.</div>
  }

  const gridTemplateColumns = `${ARCHIVE_LABEL_COL_WIDTH}px repeat(${cols.length}, ${ARCHIVE_REPORT_COL_WIDTH}px)`

  // section row(1/3/4, 그리고 topic 그룹 헤더 "2. 주요 내용")는 진하고 굵게, topic sub-row
  // (2.x)는 들여쓰기 + 옅은 색으로 부모/자식 위계를 만든다 — Excel 격자 대신 가로 divider
  // 위주(세로선은 label 열 오른쪽 하나만)로 가볍게 유지한다(Linear/Attio 톤).
  const sectionLabelStyle: React.CSSProperties = {
    position: 'sticky', left: 0, zIndex: 2, background: S.panel, color: S.t1,
    borderBottom: `1px solid ${S.border}`, borderRight: `1px solid ${S.borderStrong}`,
  }
  const topicLabelStyle: React.CSSProperties = {
    position: 'sticky', left: 0, zIndex: 2, background: S.panel, color: S.t2,
    borderBottom: `1px solid ${S.border}`, borderRight: `1px solid ${S.borderStrong}`,
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {loading && <p className="text-[11px] mb-2 flex-shrink-0" style={{ color: S.t4 }}>불러오는 중…</p>}
      {/* 바깥은 스크롤만 담당하고 테두리를 두지 않는다 — border는 안쪽 grid(fit-content)에만
          그려서, report가 적어 grid가 컨테이너보다 좁을 때 빈 오른쪽 공간까지 박스로
          감싸지 않는다(의도된 여백이 "덜 채워진 박스"처럼 보이지 않게). */}
      <div className="flex-1 overflow-auto" style={{ minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns, width: 'fit-content', border: `1px solid ${S.border}`, borderRadius: S.r, overflow: 'hidden' }}>
          {/* 헤더 행 — 회차 라벨 + 상태 + "열기"(작성 화면에서 그대로 이어보기) */}
          <div className="px-3 py-2.5 text-[11px] font-semibold" style={{ ...sectionLabelStyle, top: 0, zIndex: 3, borderBottom: `1px solid ${S.borderStrong}` }}>
            섹션 / 주제
          </div>
          {cols.map(col => (
            <div
              key={col.id}
              className="px-3 py-2.5"
              style={{ position: 'sticky', top: 0, zIndex: 1, background: S.panel, borderBottom: `1px solid ${S.borderStrong}` }}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: S.t1 }}>{fmtPeriodLabel(col.period_start, col.period_end)}</span>
                <span
                  className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={col.status === 'final' ? { color: S.accentText, background: S.accentDim } : { color: S.t3, background: 'rgba(var(--ink-rgb),0.06)' }}
                >
                  {col.status === 'final' ? '확정' : '작성중'}
                </span>
              </div>
              <button
                onClick={() => onOpenReport(col.id)}
                className="text-[10.5px] font-medium underline underline-offset-2 mt-0.5"
                style={{ color: S.t4 }}
              >
                열기 →
              </button>
            </div>
          ))}

          {/* 1. 핵심 요약 */}
          <div className="px-3 py-2.5 text-[12.5px] font-semibold" style={sectionLabelStyle}>1. 핵심 요약</div>
          {cols.map(col => (
            <div key={col.id} style={{ borderBottom: `1px solid ${S.border}` }}>
              <ArchiveCell
                dense
                fields={[{ value: col.summary }]}
                onClick={() => setDetail({ title: '핵심 요약', reportLabel: fmtPeriodLabel(col.period_start, col.period_end), fields: [{ label: '핵심 요약', value: col.summary }] })}
              />
            </div>
          ))}

          {/* 2. 주요 내용 — 섹션 구분 행(데이터 없음, 라벨만) */}
          <div
            className="px-3 py-1.5 text-[11px] font-semibold"
            style={{ gridColumn: `1 / -1`, background: 'rgba(var(--ink-rgb),0.035)', color: S.t3, borderBottom: `1px solid ${S.border}` }}
          >
            2. 주요 내용
          </div>

          {rowTopicIds.length === 0 && (
            <div className="px-3 py-4 text-[12.5px]" style={{ gridColumn: `1 / -1`, color: S.t4 }}>표시할 주제가 없습니다.</div>
          )}

          {rowTopicIds.map((topicId, i) => {
            const topic = topicById.get(topicId)
            return (
              <div key={topicId} style={{ display: 'contents' }}>
                <div className="pl-6 pr-3 py-2.5 text-[12px] font-medium truncate" style={topicLabelStyle}>
                  2.{i + 1} {topic?.title ?? '(삭제된 주제)'}
                </div>
                {cols.map(col => {
                  const entry = cellMap.get(`${topicId}:${col.id}`)
                  return (
                    <div key={col.id} style={{ borderBottom: `1px solid ${S.border}` }}>
                      <ArchiveCell
                        dense
                        // entry가 아예 없으면(그 회차엔 이 topic이 없었음) null → "—".
                        // entry는 있는데 3필드가 다 비어 있으면 빈 배열 → "내용 없음".
                        fields={entry ? [
                          { label: '업데이트', value: entry.report_text },
                          { label: '경영진 전달', value: entry.executive_point },
                          { label: '다음 액션', value: entry.next_action },
                        ] : null}
                        onClick={entry ? () => setDetail({
                          title: entry.topic_title_snapshot,
                          reportLabel: fmtPeriodLabel(col.period_start, col.period_end),
                          fields: [
                            { label: '이번 업데이트', value: entry.report_text },
                            { label: '경영진 전달 포인트', value: entry.executive_point },
                            { label: '다음 액션', value: entry.next_action },
                          ],
                        }) : undefined}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* 3. 주요 이슈 / 의사결정 */}
          <div className="px-3 py-2.5 text-[12.5px] font-semibold" style={sectionLabelStyle}>3. 주요 이슈 / 의사결정</div>
          {cols.map(col => (
            <div key={col.id} style={{ borderBottom: `1px solid ${S.border}` }}>
              <ArchiveCell
                dense
                fields={[{ value: col.issues }]}
                onClick={() => setDetail({ title: '주요 이슈 / 의사결정', reportLabel: fmtPeriodLabel(col.period_start, col.period_end), fields: [{ label: '주요 이슈 / 의사결정', value: col.issues }] })}
              />
            </div>
          ))}

          {/* 4. 다음 단계 */}
          <div className="px-3 py-2.5 text-[12.5px] font-semibold" style={{ ...sectionLabelStyle, borderBottom: 'none' }}>4. 다음 단계</div>
          {cols.map(col => (
            <div key={col.id}>
              <ArchiveCell
                dense
                fields={[{ value: col.next_steps }]}
                onClick={() => setDetail({ title: '다음 단계', reportLabel: fmtPeriodLabel(col.period_start, col.period_end), fields: [{ label: '다음 단계', value: col.next_steps }] })}
              />
            </div>
          ))}
        </div>
      </div>

      {detail && (
        <EntryDetailModal title={detail.title} reportLabel={detail.reportLabel} fields={detail.fields} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
