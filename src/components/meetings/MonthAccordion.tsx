'use client'

import { useState, useMemo } from 'react'
import type { Meeting } from '@/types'
import MeetingRow from './MeetingRow'

interface MonthGroup { ym: string; items: Meeting[] }

interface Props {
  months: MonthGroup[]
  catAccent: string
  onNavigate: (id: string) => void
  noteCounts: Record<string, number>
}

function fmtYM(ym: string): string {
  if (ym === '날짜 없음') return '날짜 미지정'
  const [, m] = ym.split('-')
  return `${parseInt(m)}월`
}

export default function MonthAccordion({ months, catAccent, onNavigate, noteCounts }: Props) {
  const [activeKey, setActiveKey] = useState<string | 'all'>('all')

  if (months.length === 0) return null

  const visibleItems = useMemo(() => {
    if (activeKey === 'all') {
      return [...months.flatMap(mg => mg.items)].sort((a, b) =>
        (b.meeting_date ?? '').localeCompare(a.meeting_date ?? '')
      )
    }
    return months.find(mg => mg.ym === activeKey)?.items ?? []
  }, [activeKey, months])

  const totalCount = months.reduce((s, mg) => s + mg.items.length, 0)

  return (
    <div>
      {/* 월 탭 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3 px-4">
        {/* 전체 탭 */}
        <button
          onClick={() => setActiveKey('all')}
          className="text-[12px] px-3 py-1 rounded-full font-medium transition-all flex-shrink-0"
          style={
            activeKey === 'all'
              ? { background: catAccent, color: '#fff' }
              : { background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.45)', border: '1px solid rgba(255,255,255,0.08)' }
          }
        >
          전체 <span className="opacity-70 font-normal">({totalCount})</span>
        </button>

        {/* 월별 탭 */}
        {months.map(mg => {
          const isActive = activeKey === mg.ym
          return (
            <button
              key={mg.ym}
              onClick={() => setActiveKey(mg.ym)}
              className="text-[12px] px-3 py-1 rounded-full font-medium transition-all flex-shrink-0"
              style={
                isActive
                  ? { background: catAccent, color: '#fff' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.45)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {fmtYM(mg.ym)} <span className="opacity-70 font-normal">({mg.items.length})</span>
            </button>
          )
        })}
      </div>

      {/* 컬럼 헤더 */}
      <div
        className="flex items-center gap-3 px-4 pb-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="w-[88px] flex-shrink-0 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgba(226,232,240,0.28)' }}>날짜</span>
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgba(226,232,240,0.28)' }}>회의명</span>
        <span className="w-[72px] text-center text-[10px] font-medium uppercase tracking-wide flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>태그</span>
        <span className="w-[52px] text-right text-[10px] font-medium uppercase tracking-wide flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>노트</span>
        <span className="w-6 flex-shrink-0" />
      </div>

      {/* 미팅 행 — 최대 높이 후 스크롤 */}
      <div className="px-4 overflow-y-auto scrollbar-none" style={{ maxHeight: 340 }}>
        {visibleItems.map(m => (
          <MeetingRow
            key={m.id}
            meeting={m}
            catAccent={catAccent}
            onClick={() => onNavigate(m.id)}
            noteCount={noteCounts[m.id] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
