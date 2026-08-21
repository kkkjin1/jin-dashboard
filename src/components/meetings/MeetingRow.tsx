'use client'

import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { FileText, ChevronRight } from 'lucide-react'
import type { Meeting } from '@/types'

interface Props {
  meeting: Meeting
  catAccent: string
  onClick: () => void
  noteCount: number
}

export default function MeetingRow({ meeting, catAccent, onClick, noteCount }: Props) {
  const date = meeting.meeting_date
    ? format(parseISO(meeting.meeting_date), 'MM.dd (eee)', { locale: ko })
    : '미지정'

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 py-3 cursor-pointer transition-colors -mx-4 px-4"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* 날짜 */}
      <span className="w-[88px] flex-shrink-0 text-[12px]" style={{ color: 'rgba(226,232,240,0.4)' }}>
        {date}
      </span>

      {/* 아이콘 + 제목 */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FileText size={13} className="flex-shrink-0" style={{ color: catAccent, opacity: 0.7 }} />
        <span className="text-[13px] font-medium truncate" style={{ color: '#E2E8F0' }}>
          {meeting.title || '제목 없음'}
        </span>
      </div>

      {/* 태그 (category) */}
      <div className="w-[72px] flex justify-center flex-shrink-0">
        {meeting.category && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(226,232,240,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {meeting.category}
          </span>
        )}
      </div>

      {/* 노트 수 */}
      <div className="w-[52px] flex items-center gap-1 justify-end flex-shrink-0">
        {noteCount > 0 && (
          <>
            <FileText size={11} style={{ color: 'rgba(226,232,240,0.3)' }} />
            <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.35)' }}>{noteCount}</span>
          </>
        )}
      </div>

      {/* 화살표 */}
      <div className="w-6 flex justify-end flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight size={13} style={{ color: 'rgba(226,232,240,0.3)' }} />
      </div>
    </div>
  )
}
