'use client'

import { X } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, fmtPeriodLabel } from './style'

interface Props {
  report: WorkReport
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[]
  onClose: () => void
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

export default function ReportFullViewModal({ report, rows, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-3xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: '#1A2030', border: `1px solid ${S.borderStrong}`, maxHeight: '88vh', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
          <div>
            <p className="text-[16px] font-semibold" style={{ color: S.t1 }}>{fmtPeriodLabel(report.period_start, report.period_end)} 업무보고</p>
            <p className="text-[11px] mt-0.5" style={{ color: S.t4 }}>{report.status === 'final' ? '확정' : '작성중'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.07)]" style={{ color: S.t3 }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-7 py-6 select-text">
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
      </div>
    </div>
  )
}
