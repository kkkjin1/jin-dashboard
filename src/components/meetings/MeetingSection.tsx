'use client'

import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { Meeting } from '@/types'
import MonthAccordion from './MonthAccordion'

interface Props {
  cat: string
  meetings: Meeting[]
  dotColor: string
  onNavigate: (id: string) => void
}

export default function MeetingSection({ cat, meetings, dotColor, onNavigate }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const months = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    meetings.forEach(m => {
      const ym = m.meeting_date ? m.meeting_date.slice(0, 7) : '날짜 없음'
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym)!.push(m)
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ym, items]) => ({ ym, items }))
  }, [meetings])

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2.5 px-4 py-3.5 cursor-pointer select-none"
        style={{ borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => setCollapsed(v => !v)}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="text-[14px] font-semibold flex-1" style={{ color: '#E2E8F0' }}>{cat}</span>
        <span
          className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {meetings.length}건
        </span>
        <span style={{ color: 'rgba(226,232,240,0.3)' }}>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </span>
      </div>

      {/* 내부 콘텐츠 */}
      {!collapsed && (
        <div className="py-3">
          <MonthAccordion
            months={months}
            catAccent={dotColor}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  )
}
