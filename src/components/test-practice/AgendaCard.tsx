'use client'

import type { AnnualGoalTask, TestPracticeTask, AgendaPriority } from '@/types'
import { PRIORITY_STYLE } from './priorityStyle'

interface Props {
  agenda: AnnualGoalTask
  priority: AgendaPriority
  breadcrumb: string
  execs: TestPracticeTask[]
  selected: boolean
  onClick: () => void
  /** Pinned 영역 전용 — 세로 크기를 줄이고 "진행 TASK n/m" 라벨을 추가로 보여준다 */
  compact?: boolean
}

export default function AgendaCard({ agenda, priority, breadcrumb, execs, selected, onClick, compact = false }: Props) {
  const ps = PRIORITY_STYLE[priority]
  const done = execs.filter(e => e.status === 'done').length
  const total = execs.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const borderColor = selected ? 'rgba(76,127,224,0.5)' : 'rgba(255,255,255,0.1)'

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl flex flex-col transition-colors w-full ${compact ? 'px-3.5 py-3 gap-2' : 'px-4 py-3.5 gap-2.5'}`}
      style={{
        background: selected ? 'rgba(76,127,224,0.1)' : 'rgba(255,255,255,0.045)',
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `${ps.borderWidth}px solid ${ps.border}`,
        minHeight: compact ? 70 : 82,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-bold leading-snug line-clamp-2" style={{ color: '#F1F4F8' }}>
          {agenda.title}
        </span>
        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: ps.bg, color: ps.text }}>
          {priority}
        </span>
      </div>

      <span className="text-[10.5px] truncate" style={{ color: 'rgba(226,232,240,0.32)' }}>{breadcrumb}</span>

      <div className="flex-1" />

      {total > 0 ? (
        compact ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(226,232,240,0.4)' }}>진행 TASK</span>
              <span className="text-[10.5px] font-bold" style={{ color: pct === 100 ? '#34D399' : 'rgba(226,232,240,0.6)' }}>{done}/{total}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, background: pct === 100 ? '#34D399' : '#4C7FE0' }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, background: pct === 100 ? '#34D399' : '#4C7FE0' }} />
            </div>
            <span className="text-[10.5px] font-bold flex-shrink-0" style={{ color: pct === 100 ? '#34D399' : 'rgba(226,232,240,0.55)' }}>{done}/{total}</span>
          </div>
        )
      ) : (
        <span className="text-[10.5px] flex items-center gap-1.5" style={{ color: 'rgba(226,232,240,0.3)' }}>
          TASK 없음
          <span className="px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(93,189,151,0.14)', color: '#5DBD97', fontWeight: 700 }}>+ 추가</span>
        </span>
      )}
    </button>
  )
}
