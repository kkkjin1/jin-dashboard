'use client'

import type { WorkReport, WorkReportEntry, WorkReportItem, WorkReportTopic } from '@/types'
import { S, CONTENT_MAX_WIDTH, hasContent, POINT_LABEL, entryPointText, fmtPeriodLabel } from './style'
import { ITEM_SECTIONS, ITEM_SECTION_META, isItemWritten, sortItems, itemSelectionKey } from './items'
import { Sparkles } from 'lucide-react'
import RichText from './RichText'
import { SECTION_BAR_BG, SECTION_BORDER, KindChip } from './SectionTitle'
import { htmlToMarkdown } from '@/lib/tiptapMarkdown'

// 보고 1건을 "읽는" 문서 형태로 렌더링하는 순수 컨텐츠 — 작성 화면의 "문서로 보기"
// (ReportFullViewModal)가 이 컴포넌트를 그대로 쓴다. Archive에서 개별 회차를 읽고 싶을 때도
// 그 회차를 열어(onOpenReport) 이 모달을 재사용한다 — Archive 안에 별도 문서 뷰를 두지 않는다.
// 데이터 구조·필드는 하나도 새로 만들지 않는다: work_reports의 summary/issues/next_steps +
// work_report_entries의 report_text/executive_point/next_action 그대로.

interface Props {
  report: WorkReport
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[]
  items: WorkReportItem[]   // 이 회차의 3-1/3-2/3-3 항목 전체
  // 작성 화면 옆 완성본 미리보기(2026-11-16) — 지금 쓰는 칸(목차 selection 키)을 옅게 강조한다.
  // 각 칸에 data-sec(=selection 키)을 달아 미리보기가 그 위치로 스크롤한다.
  activeKey?: string
}

// 문서 제목 서식(2026-11-16) — 큰 제목은 작성 화면 제목행과 같은 번호 배지, 작은 제목은 왼쪽 막대.
function H2({ no, title, className = 'mb-2.5', bare }: { no?: React.ReactNode; title: string; className?: string; bare?: boolean }) {
  return (
    <div className={`flex items-center gap-2 pb-1.5 ${className}`} style={{ borderBottom: `1.5px solid ${SECTION_BORDER}` }}>
      {no && bare && no}
      {no && !bare && <span className="flex items-center text-[11px] font-bold px-1.5 min-h-[18px] rounded-md tabular-nums" style={{ background: SECTION_BAR_BG, color: S.t1 }}>{no}</span>}
      <span className="text-[14px] font-bold" style={{ color: S.t1 }}>{title}</span>
    </div>
  )
}
function H3({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13.5px] font-semibold mb-2 pl-2" style={{ color: S.t1, borderLeft: `3px solid ${S.accent}` }}>{children}</p>
  )
}

const ACTIVE_BG = 'rgba(245,194,71,0.16)'
function secStyle(active: boolean): React.CSSProperties | undefined {
  return active ? { background: ACTIVE_BG, boxShadow: `0 0 0 6px ${ACTIVE_BG}`, borderRadius: 4 } : undefined
}

// 같은 내용을 마크다운으로 — "마크다운 복사"로 Claude 앱 PPT 프로젝트에 붙여넣는 용도(2026-10-19).
// 순서·포함 기준은 아래 문서 뷰와 같다(작업 메모 제외, 3번은 작성된 항목만).
export function reportToMarkdown(
  report: WorkReport,
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[],
  items: WorkReportItem[],
): string {
  // 서술 칸은 편집기 HTML(2026-10-22~) 또는 예전 순수 텍스트 — 둘 다 마크다운으로 맞춘다
  const text = (v: string | null | undefined) => (hasContent(v) ? htmlToMarkdown(v) : '(작성된 내용 없음)')
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
    if (hasContent(point)) out.push(`**${POINT_LABEL}**`, '', htmlToMarkdown(point), '')
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
      {hasContent(value)
        ? <RichText value={value} style={{ fontSize: 13.5, lineHeight: 1.75, color: S.t1 }} />
        : <p className="text-[13.5px]" style={{ color: S.t4 }}>(작성된 내용 없음)</p>}
    </div>
  )
}

export default function ReportDocument({ report, rows, items, activeKey }: Props) {
  return (
    <div style={{ maxWidth: CONTENT_MAX_WIDTH }}>
      <div data-sec="summary">
      <H2 no={<Sparkles size={11} />} title="핵심 요약" />
      <div className="mb-6" style={secStyle(activeKey === 'summary')}>
        {hasContent(report.summary)
          ? <RichText value={report.summary} style={{ fontSize: 13.5, lineHeight: 1.8, color: S.t1 }} />
          : <p className="text-[13.5px]" style={{ color: S.t4 }}>(작성된 내용 없음)</p>}
      </div>
      </div>

      <H2 title="주요 내용" className="mb-3" />
      {rows.length === 0 && <p className="text-[12.5px] mb-6" style={{ color: S.t4 }}>포함된 주제가 없습니다.</p>}
      {rows.map(({ entry }, i) => (
        <div key={entry.id} data-sec={entry.topic_id} className="mb-5 pl-1" style={secStyle(activeKey === entry.topic_id)}>
          <H3><span style={{ color: S.t3 }}>안건{i + 1}</span> {entry.topic_title_snapshot}</H3>
          <Block label="내용" value={entry.report_text} />
          {/* 향후 Feedback Loop 자리 — 전달 포인트(결정/요청) 바로 아래가 보고 후 피드백이
              가장 먼저 달리는 지점이다. 지금은 표시하지 않는다(work_report_feedback 테이블 없음). */}
          {hasContent(entryPointText(entry)) && <Block label={POINT_LABEL} value={entryPointText(entry)} />}
        </div>
      ))}

      <H2 title="운영 · 이슈 · 의사결정" className="mt-6 mb-3" />
      {ITEM_SECTIONS.map(sec => {
        const list = sortItems(items.filter(i => i.section === sec && isItemWritten(i)))
        const meta = ITEM_SECTION_META[sec]
        return (
          <div key={sec} data-sec={itemSelectionKey(sec)} className="mb-5 pl-1" style={secStyle(activeKey === itemSelectionKey(sec))}>
            <p className="flex items-center gap-1.5 text-[13.5px] font-semibold mb-2" style={{ color: S.t1 }}><KindChip kind={sec} size="sm" />{meta.title}</p>
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

      <div data-sec="next_steps" style={secStyle(activeKey === 'next_steps')}>
      <H2 no={<KindChip kind="next" size="sm" />} title="다음 단계" bare />
      {hasContent(report.next_steps)
        ? <RichText value={report.next_steps} style={{ fontSize: 13.5, lineHeight: 1.8, color: S.t1 }} />
        : <p className="text-[13.5px]" style={{ color: S.t4 }}>(작성된 내용 없음)</p>}
      </div>
    </div>
  )
}
