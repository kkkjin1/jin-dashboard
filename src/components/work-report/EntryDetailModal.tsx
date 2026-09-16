'use client'

import { X } from 'lucide-react'
import { S } from './style'

// 전체 비교/주제 히스토리 grid의 cell을 클릭했을 때 그 회차·주제(혹은 고정 섹션)의 전체
// 내용을 보여주는 공용 모달. topic entry(최대 3필드)와 고정 섹션(요약/이슈/다음단계, 1필드)
// 양쪽에서 재사용하기 위해 필드를 구조화된 리스트로 받는다(entry shape에 고정하지 않음).
interface Field {
  label: string
  value: string
}

interface Props {
  title: string
  reportLabel: string
  fields: Field[]
  onClose: () => void
}

function FieldBlock({ label, value }: Field) {
  if (!value) return null
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: S.t3 }}>{label}</p>
      <div className="text-[13px] leading-[1.7] whitespace-pre-wrap" style={{ color: S.t2 }}>{value}</div>
    </div>
  )
}

export default function EntryDetailModal({ title, reportLabel, fields, onClose }: Props) {
  const hasAny = fields.some(f => (f.value ?? '').trim())
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface-elevated)', border: `1px solid ${S.borderStrong}`, maxHeight: '85vh', boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${S.border}` }}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: S.t4 }}>{reportLabel}</p>
            <h3 className="text-[16px] font-semibold" style={{ color: S.t1 }}>{title}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(var(--ink-rgb),0.07)]" style={{ color: S.t3 }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
          {fields.map(f => <FieldBlock key={f.label} label={f.label} value={f.value} />)}
          {!hasAny && <p className="text-[12px]" style={{ color: S.t4 }}>작성된 내용이 없습니다.</p>}
        </div>
      </div>
    </div>
  )
}
