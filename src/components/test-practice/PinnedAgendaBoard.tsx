'use client'

import { useEffect, useState } from 'react'
import type { AnnualGoalTask, TestPracticeTask } from '@/types'
import AgendaCard from './AgendaCard'

const COLLAPSE_KEY = 'test_practice_pinned_collapsed'

export interface PinnedItem {
  agenda: AnnualGoalTask
  breadcrumb: string
  execs: TestPracticeTask[]
}

interface Props {
  items: PinnedItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function PinnedAgendaBoard({ items, selectedId, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch {}
  }, [])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
  }

  const isEmpty = items.length === 0

  return (
    <div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 pb-3" style={{ background: '#0F1319' }}>
      <button onClick={toggle} className="w-full flex items-center justify-between py-3">
        <span className="flex items-center gap-2.5 text-[15px] font-extrabold" style={{ color: isEmpty ? 'rgba(226,232,240,0.55)' : '#E2E8F0' }}>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(239,68,68,0.14)', color: '#F87171' }}>P1</span>
          지금 집중할 과제
          <span className="font-medium text-[12px]" style={{ color: 'rgba(226,232,240,0.4)' }}>· {items.length}개</span>
        </span>
        <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.4)' }}>{collapsed ? '펼치기 ▼' : '접기 ▲'}</span>
      </button>

      {!collapsed && !isEmpty && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(({ agenda, breadcrumb, execs }) => (
            <AgendaCard
              key={agenda.id}
              agenda={agenda}
              priority="P1"
              breadcrumb={breadcrumb}
              execs={execs}
              selected={selectedId === agenda.id}
              onClick={() => onSelect(agenda.id)}
              compact
            />
          ))}
        </div>
      )}
    </div>
  )
}
