'use client'

import { X } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { S, fmtPeriodLabel } from './style'
import ReportDocument from './ReportDocument'

interface Props {
  report: WorkReport
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[]
  onClose: () => void
}

export default function ReportFullViewModal({ report, rows, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-3xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface-elevated)', border: `1px solid ${S.borderStrong}`, maxHeight: '88vh', boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
          <div>
            <p className="text-[16px] font-semibold" style={{ color: S.t1 }}>{fmtPeriodLabel(report.period_start, report.period_end)} 업무보고</p>
            <p className="text-[11px] mt-0.5" style={{ color: S.t4 }}>{report.status === 'final' ? '확정' : '작성중'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(var(--ink-rgb),0.07)]" style={{ color: S.t3 }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-7 py-6 select-text">
          <ReportDocument report={report} rows={rows} />
        </div>
      </div>
    </div>
  )
}
