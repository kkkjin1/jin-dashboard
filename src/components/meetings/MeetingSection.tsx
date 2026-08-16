'use client'

import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { Meeting } from '@/types'
import MonthAccordion from './MonthAccordion'
import MeetingRow from './MeetingRow'

interface Props {
  cat: string
  meetings: Meeting[]
  dotColor: string
  onSelect: (id: string) => void
}

const PREVIEW_COUNT = 3

export default function MeetingSection({ cat, meetings, dotColor, onSelect }: Props) {
  // 범주 섹션은 항상 최소 미리보기(최신 3건)를 보여주고, "전체 보기"를 눌러야 월별 탭 전체 뷰로 펼쳐짐
  // (메모 탭처럼 클릭 한 번 없이도 내용이 바로 보이도록)
  const [expanded, setExpanded] = useState(false)

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

  const previewItems = useMemo(
    () => [...meetings]
      .sort((a, b) => (b.meeting_date ?? '').localeCompare(a.meeting_date ?? ''))
      .slice(0, PREVIEW_COUNT),
    [meetings],
  )
  const hasMore = meetings.length > previewItems.length

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2.5 px-4 py-3.5 cursor-pointer select-none"
        style={{ borderBottom: meetings.length === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => setExpanded(v => !v)}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="text-[14px] font-semibold flex-1" style={{ color: '#E2E8F0' }}>{cat}</span>
        <span
          className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {meetings.length}건
        </span>
        {hasMore && (
          <span style={{ color: 'rgba(226,232,240,0.3)' }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        )}
      </div>

      {/* 내부 콘텐츠 — 기본은 최신 3건 미리보기, "전체 보기" 클릭 시 월별 탭 전체 뷰 */}
      {meetings.length === 0 ? null : !expanded ? (
        <div className="px-4 py-1">
          {previewItems.map(m => (
            <MeetingRow key={m.id} meeting={m} catAccent={dotColor} onClick={() => onSelect(m.id)} />
          ))}
          {hasMore && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full flex items-center justify-center gap-1 text-[11.5px] py-2 transition-colors"
              style={{ color: 'rgba(226,232,240,0.4)' }}
            >
              전체 {meetings.length}건 보기 <ChevronDown size={12} />
            </button>
          )}
        </div>
      ) : (
        <div className="py-3">
          <MonthAccordion
            months={months}
            catAccent={dotColor}
            onNavigate={onSelect}
          />
          <div className="px-4">
            <button
              onClick={() => setExpanded(false)}
              className="w-full flex items-center justify-center gap-1 text-[11.5px] py-2 mt-1 transition-colors"
              style={{ color: 'rgba(226,232,240,0.4)' }}
            >
              접기 <ChevronUp size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
