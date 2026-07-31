'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Meeting } from '@/types'
import MeetingRow from './MeetingRow'

interface MonthGroup { ym: string; items: Meeting[] }

interface Props {
  months: MonthGroup[]
  catAccent: string
  onNavigate: (id: string) => void
}

function fmtYM(ym: string): string {
  if (ym === '날짜 없음') return '날짜 미지정'
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

const INIT_SHOW = 4

export default function MonthAccordion({ months, catAccent, onNavigate }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [showAll, setShowAll] = useState(false)

  if (months.length === 0) return null

  const activeMonth = months[activeIdx]
  const visibleItems = showAll ? activeMonth.items : activeMonth.items.slice(0, INIT_SHOW)
  const hasMore = activeMonth.items.length > INIT_SHOW && !showAll

  return (
    <div>
      {/* 월 탭 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3 px-4">
        {months.map((mg, idx) => {
          const [, m] = mg.ym.split('-')
          const label = mg.ym === '날짜 없음' ? '미지정' : `${parseInt(m)}월`
          const isActive = idx === activeIdx
          return (
            <button
              key={mg.ym}
              onClick={() => { setActiveIdx(idx); setShowAll(false) }}
              className="text-[12px] px-3 py-1 rounded-full font-medium transition-all flex-shrink-0"
              style={
                isActive
                  ? { background: catAccent, color: '#fff' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.45)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {label} <span className="opacity-70 font-normal">({mg.items.length})</span>
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

      {/* 미팅 행 */}
      <div className="px-4">
        {visibleItems.map(m => (
          <MeetingRow
            key={m.id}
            meeting={m}
            catAccent={catAccent}
            onClick={() => onNavigate(m.id)}
          />
        ))}
      </div>

      {/* 더보기 / 접기 */}
      {activeMonth.items.length > INIT_SHOW && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="flex items-center justify-center gap-1 w-full py-2.5 mt-1 text-[12px] transition-colors"
          style={{ color: 'rgba(226,232,240,0.35)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.6)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.35)')}
        >
          {hasMore
            ? <>{fmtYM(activeMonth.ym)} 회의 더보기 <ChevronDown size={13} /></>
            : <>접기 <ChevronDown size={13} className="rotate-180" /></>
          }
        </button>
      )}
    </div>
  )
}
