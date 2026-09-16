'use client'

import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, CONTENT_MAX_WIDTH } from './style'

// 보고 1건을 "읽는" 문서 형태로 렌더링하는 순수 컨텐츠 — 모달 chrome(ReportFullViewModal)과
// Archive의 전체 보고 feed(ReportsFeed, 카드 펼침) 둘 다 이 컴포넌트를 그대로 재사용한다.
// 데이터 구조·필드는 하나도 새로 만들지 않는다: work_reports의 summary/issues/next_steps +
// work_report_entries의 report_text/executive_point/next_action 그대로.

interface Props {
  report: WorkReport
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[]
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

export default function ReportDocument({ report, rows }: Props) {
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
          {entry.executive_point && <Block label="경영진 전달 포인트" value={entry.executive_point} />}
          {/* 향후 Feedback Loop 자리 — 경영진 전달 포인트(결정/요청)는 보고 후 피드백이
              가장 먼저 달리는 지점이라, 여기 바로 아래가 자연스러운 삽입 위치다.
              지금은 표시하지 않는다(work_report_feedback 테이블 없음). */}
          {entry.next_action && <Block label="다음 액션" value={entry.next_action} />}
        </div>
      ))}

      <p className="text-[14px] font-bold mt-6 mb-2" style={{ color: S.t1 }}>3. 주요 이슈 / 의사결정</p>
      <p className="text-[13.5px] leading-[1.8] whitespace-pre-wrap mb-6" style={{ color: S.t1 }}>
        {report.issues || <span style={{ color: S.t4 }}>(작성된 내용 없음)</span>}
      </p>

      <p className="text-[14px] font-bold mb-2" style={{ color: S.t1 }}>4. 다음 단계</p>
      <p className="text-[13.5px] leading-[1.8] whitespace-pre-wrap" style={{ color: S.t1 }}>
        {report.next_steps || <span style={{ color: S.t4 }}>(작성된 내용 없음)</span>}
      </p>
    </div>
  )
}
