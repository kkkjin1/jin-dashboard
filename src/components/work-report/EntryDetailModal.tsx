'use client'

import { X } from 'lucide-react'
import type { WorkReportEntry } from '@/types'
import { S } from './style'

interface Props {
  topicTitle: string
  reportLabel: string
  entry: WorkReportEntry
  onClose: () => void
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: S.t3 }}>{label}</p>
      <div className="text-[13px] leading-[1.7] whitespace-pre-wrap" style={{ color: S.t2 }}>{value}</div>
    </div>
  )
}

export default function EntryDetailModal({ topicTitle, reportLabel, entry, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: '#1A2030', border: `1px solid ${S.borderStrong}`, maxHeight: '85vh', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${S.border}` }}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: S.t4 }}>{reportLabel}</p>
            <h3 className="text-[16px] font-semibold" style={{ color: S.t1 }}>{topicTitle}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.07)]" style={{ color: S.t3 }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
          <Field label="이번 업데이트" value={entry.report_text} />
          <Field label="경영진에게 전달할 포인트" value={entry.executive_point} />
          <Field label="다음 액션" value={entry.next_action} />
          {!entry.report_text && !entry.executive_point && !entry.next_action && (
            <p className="text-[12px]" style={{ color: S.t4 }}>작성된 내용이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
