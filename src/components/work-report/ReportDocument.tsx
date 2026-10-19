'use client'

import type { WorkReport, WorkReportEntry, WorkReportItem, WorkReportTopic } from '@/types'
import { S, CONTENT_MAX_WIDTH, hasContent, POINT_LABEL, entryPointText, fmtPeriodLabel } from './style'
import { ITEM_SECTIONS, ITEM_SECTION_META, isItemWritten, sortItems } from './items'

// 보고 1건을 "읽는" 문서 형태로 렌더링하는 순수 컨텐츠 — 작성 화면의 "문서로 보기"
// (ReportFullViewModal)가 이 컴포넌트를 그대로 쓴다. Archive에서 개별 회차를 읽고 싶을 때도
// 그 회차를 열어(onOpenReport) 이 모달을 재사용한다 — Archive 안에 별도 문서 뷰를 두지 않는다.
// 데이터 구조·필드는 하나도 새로 만들지 않는다: work_reports의 summary/issues/next_steps +
// work_report_entries의 report_text/executive_point/next_action 그대로.

interface Props {
  report: WorkReport
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[]
  items: WorkReportItem[]   // 이 회차의 3-1/3-2/3-3 항목 전체
}

// 같은 내용을 마크다운으로 — "마크다운 복사"로 Claude 앱 PPT 프로젝트에 붙여넣는 용도(2026-10-19).
// 순서·포함 기준은 아래 문서 뷰와 같다(작업 메모 제외, 3번은 작성된 항목만).
export function reportToMarkdown(
  report: WorkReport,
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[],
  items: WorkReportItem[],
): string {
  const text = (v: string | null | undefined) => (hasContent(v) ? v!.trim() : '(작성된 내용 없음)')
  // 여러 줄 값을 목록 항목 아래에 들여 쓴다 — 줄바꿈이 목록 밖으로 새지 않게.
  const sub = (label: string, v: string) => {
    const [first, ...rest] = v.trim().split('\n')
    return [`  - ${label}: ${first}`, ...rest.map(l => `    ${l}`)]
  }
  const out: string[] = [`# ${fmtPeriodLabel(report.period_start, report.period_end)} 업무보고`, '']

  out.push('## 1. 핵심 요약', '', text(report.summary), '')

  out.push('## 2. 주요 내용', '')
  if (rows.length === 0) out.push('(포함된 주제 없음)', '')
  rows.forEach(({ entry }, i) => {
    out.push(`### 2.${i + 1} ${entry.topic_title_snapshot}`, '', '**이번 업데이트**', '', text(entry.report_text), '')
    const point = entryPointText(entry)
    if (hasContent(point)) out.push(`**${POINT_LABEL}**`, '', point.trim(), '')
  })

  out.push('## 3. 운영 · 이슈 · 의사결정', '')
  for (const sec of ITEM_SECTIONS) {
    const list = sortItems(items.filter(i => i.section === sec && isItemWritten(i)))
    const meta = ITEM_SECTION_META[sec]
    out.push(`### ${meta.no}. ${meta.title}`, '')
    if (list.length === 0) out.push('(등록된 항목 없음)')
    for (const it of list) {
      out.push(`- **${(it.title || '(제목 없음)').replace(/\s*\n\s*/g, ' ')}**`)
      if (hasContent(it.detail)) out.push(...sub('세부내용', it.detail))
      if (hasContent(it.summary)) out.push(...sub('비고', it.summary))
    }
    out.push('')
  }
  if (hasContent(report.issues)) out.push('**(이전 형식) 주요 이슈 / 의사결정**', '', report.issues.trim(), '')

  out.push('## 4. 다음 단계', '', text(report.next_steps))
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-[12px] font-semibold mb-1" style={{ color: S.t3 }}>{label}</p>
      <p className="text-[13.5px] leading-[1.75] whitespace-pre-wrap" style={{ color: S.t1 }}>
        {value || <span style={{ color: S.t4 }}>(작성된 내용 없음)</span>}
      </p>
    </div>
  )
}

export default function ReportDocument({ report, rows, items }: Props) {
  return (
    <div style={{ maxWidth: CONTENT_MAX_WIDTH }}>
      <p className="text-[14px] font-bold mb-2" style={{ color: S.t1 }}>1. 핵심 요약</p>
      <p className="text-[13.5px] leading-[1.8] whitespace-pre-wrap mb-6" style={{ color: S.t1 }}>
        {report.summary || <span style={{ color: S.t4 }}>(작성된 내용 없음)</span>}
      </p>

      <p className="text-[14px] font-bold mb-3" style={{ color: S.t1 }}>2. 주요 내용</p>
      {rows.length === 0 && <p className="text-[12.5px] mb-6" style={{ color: S.t4 }}>포함된 주제가 없습니다.</p>}
      {rows.map(({ entry }, i) => (
        <div key={entry.id} className="mb-5 pl-1">
          <p className="text-[13.5px] font-semibold mb-2" style={{ color: S.t1 }}>2.{i + 1} {entry.topic_title_snapshot}</p>
          <Block label="내용" value={entry.report_text} />
          {/* 향후 Feedback Loop 자리 — 전달 포인트(결정/요청) 바로 아래가 보고 후 피드백이
              가장 먼저 달리는 지점이다. 지금은 표시하지 않는다(work_report_feedback 테이블 없음). */}
          {hasContent(entryPointText(entry)) && <Block label={POINT_LABEL} value={entryPointText(entry)} />}
        </div>
      ))}

      <p className="text-[14px] font-bold mt-6 mb-3" style={{ color: S.t1 }}>3. 운영 · 이슈 · 의사결정</p>
      {ITEM_SECTIONS.map(sec => {
        const list = sortItems(items.filter(i => i.section === sec && isItemWritten(i)))
        const meta = ITEM_SECTION_META[sec]
        return (
          <div key={sec} className="mb-5 pl-1">
            <p className="text-[13.5px] font-semibold mb-2" style={{ color: S.t1 }}>{meta.no}. {meta.title}</p>
            {list.length === 0 ? (
              <p className="text-[12.5px]" style={{ color: S.t4 }}>(등록된 항목 없음)</p>
            ) : (
              <table className="w-full text-[12.5px] mb-2" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: S.t3, borderBottom: `1px solid ${S.borderStrong}` }}>
                    <th className="text-left font-semibold py-1.5 pr-3" style={{ width: '28%' }}>타이틀</th>
                    <th className="text-left font-semibold py-1.5 pr-3">세부내용</th>
                    <th className="text-left font-semibold py-1.5" style={{ width: '22%' }}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(it => (
                    <tr key={it.id} style={{ borderBottom: `1px solid ${S.border}`, color: S.t1, verticalAlign: 'top' }}>
                      <td className="py-1.5 pr-3 font-medium whitespace-pre-wrap">{it.title || '(제목 없음)'}</td>
                      <td className="py-1.5 pr-3 whitespace-pre-wrap" style={{ color: S.t2 }}>{it.detail || '—'}</td>
                      <td className="py-1.5 whitespace-pre-wrap" style={{ color: S.t2 }}>{it.summary || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
      {hasContent(report.issues) && (
        <div className="mb-6 pl-1">
          <Block label="(이전 형식) 주요 이슈 / 의사결정" value={report.issues} />
        </div>
      )}

      <p className="text-[14px] font-bold mb-2" style={{ color: S.t1 }}>4. 다음 단계</p>
      <p className="text-[13.5px] leading-[1.8] whitespace-pre-wrap" style={{ color: S.t1 }}>
        {report.next_steps || <span style={{ color: S.t4 }}>(작성된 내용 없음)</span>}
      </p>
    </div>
  )
}
