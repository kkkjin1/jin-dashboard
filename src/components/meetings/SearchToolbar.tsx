'use client'

import { useRef, useEffect, useState } from 'react'
import { Search, Calendar, ChevronDown, ArrowUpDown } from 'lucide-react'

export type DateFilter = '오늘' | '최근7일' | '이번달' | '이번분기' | '이번반기' | '올해' | '전체'
export type SortOrder  = '최신순' | '오래된순' | '제목순'

interface Props {
  search: string
  setSearch: (v: string) => void
  dateFilter: DateFilter
  setDateFilter: (v: DateFilter) => void
  teamFilter: string
  setTeamFilter: (v: string) => void
  sortOrder: SortOrder
  setSortOrder: (v: SortOrder) => void
  teams: string[]
  total: number
}

const DATE_OPTIONS: DateFilter[] = ['오늘', '최근7일', '이번달', '이번분기', '이번반기', '올해', '전체']
const SORT_OPTIONS: SortOrder[]  = ['최신순', '오래된순', '제목순']

export default function SearchToolbar({
  search, setSearch,
  dateFilter, setDateFilter,
  teamFilter, setTeamFilter,
  sortOrder, setSortOrder,
  teams, total,
}: Props) {
  const [teamOpen, setTeamOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const teamRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) setTeamOpen(false)
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const dropdownBase: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 100,
    background: 'rgba(19,22,32,0.98)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    backdropFilter: 'blur(20px)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
    minWidth: 120,
    padding: '4px',
  }

  return (
    <div className="flex-shrink-0" style={{ position: 'sticky', top: 0, zIndex: 40, background: '#0F1319', paddingBottom: 12 }}>
      {/* 검색 + 필터 행 */}
      <div className="flex items-center gap-2 mb-3">
        {/* 검색 */}
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <Search size={14} style={{ color: 'rgba(226,232,240,0.35)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="회의명, 키워드 검색..."
            className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-[rgba(226,232,240,0.25)]"
            style={{ color: '#E2E8F0' }}
          />
        </div>

        {/* 기간 표시 */}
        <div
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl cursor-pointer flex-shrink-0 transition-colors"
          style={{ background: dateFilter !== '전체' ? 'rgba(76,127,224,0.12)' : 'rgba(255,255,255,0.06)', border: dateFilter !== '전체' ? '1px solid rgba(76,127,224,0.3)' : '1px solid rgba(255,255,255,0.09)' }}
        >
          <Calendar size={13} style={{ color: dateFilter !== '전체' ? '#7EB3FF' : 'rgba(226,232,240,0.4)' }} />
          <span className="text-[12px]" style={{ color: dateFilter !== '전체' ? '#7EB3FF' : 'rgba(226,232,240,0.5)' }}>{dateFilter}</span>
        </div>

        {/* 팀 필터 */}
        <div ref={teamRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setTeamOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 transition-colors"
            style={{ background: teamFilter !== '전체' ? 'rgba(76,127,224,0.12)' : 'rgba(255,255,255,0.06)', border: teamFilter !== '전체' ? '1px solid rgba(76,127,224,0.3)' : '1px solid rgba(255,255,255,0.09)' }}
          >
            <span className="text-[12px]" style={{ color: teamFilter !== '전체' ? '#7EB3FF' : 'rgba(226,232,240,0.5)' }}>{teamFilter}</span>
            <ChevronDown size={11} style={{ color: 'rgba(226,232,240,0.35)' }} />
          </button>
          {teamOpen && (
            <div style={dropdownBase}>
              {['전체', ...teams].map(t => (
                <button
                  key={t}
                  onClick={() => { setTeamFilter(t); setTeamOpen(false) }}
                  className="w-full text-left text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: teamFilter === t ? '#E2E8F0' : 'rgba(226,232,240,0.5)', background: teamFilter === t ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                  onMouseEnter={e => { if (teamFilter !== t) (e.currentTarget.style.background = 'rgba(255,255,255,0.05)') }}
                  onMouseLeave={e => { if (teamFilter !== t) (e.currentTarget.style.background = 'transparent') }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 정렬 */}
        <div ref={sortRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setSortOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <ArrowUpDown size={13} style={{ color: 'rgba(226,232,240,0.4)' }} />
            <span className="text-[12px]" style={{ color: 'rgba(226,232,240,0.5)' }}>{sortOrder}</span>
            <ChevronDown size={11} style={{ color: 'rgba(226,232,240,0.35)' }} />
          </button>
          {sortOpen && (
            <div style={dropdownBase}>
              {SORT_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setSortOrder(s); setSortOpen(false) }}
                  className="w-full text-left text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: sortOrder === s ? '#E2E8F0' : 'rgba(226,232,240,0.5)', background: sortOrder === s ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                  onMouseEnter={e => { if (sortOrder !== s) (e.currentTarget.style.background = 'rgba(255,255,255,0.05)') }}
                  onMouseLeave={e => { if (sortOrder !== s) (e.currentTarget.style.background = 'transparent') }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 빠른 날짜 필터 pills */}
      <div className="flex items-center gap-1.5">
        {DATE_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => setDateFilter(d)}
            className="text-[12px] px-3 py-1.5 rounded-full transition-all flex-shrink-0"
            style={
              dateFilter === d
                ? { background: '#4C7FE0', color: '#fff', fontWeight: 500 }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {d}
          </button>
        ))}
        <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.35)' }}>총 {total}건</span>
      </div>
    </div>
  )
}
