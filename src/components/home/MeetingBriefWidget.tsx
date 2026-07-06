'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useUserSetting } from '@/hooks/useUserSetting'

interface MeetingSchedule {
  id: string
  title: string
  time: string
  is_recurring: boolean
  days_of_week?: number[]
  date?: string
  prep_note?: string
}

function todayDow(): number { return new Date().getDay() }
function todayStr(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function getTodayMeetings(schedules: MeetingSchedule[]): MeetingSchedule[] {
  const dow = todayDow()
  const today = todayStr()
  return schedules
    .filter(s => s.is_recurring
      ? (s.days_of_week ?? []).includes(dow)
      : s.date === today
    )
    .sort((a, b) => a.time.localeCompare(b.time))
}

export default function MeetingBriefWidget() {
  const { value: schedules, save } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])
  const todayMeetings = getTodayMeetings(schedules)

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  function saveNote(id: string) {
    save(schedules.map(s => s.id === id ? { ...s, prep_note: noteText } : s))
    setEditingNoteId(null)
  }

  return (
    <div className="h-full flex flex-col p-3 font-sans">
      <div className="flex items-center gap-2 mb-2.5 flex-shrink-0">
        <span className="text-sm leading-none">📋</span>
        <h3 className="text-xs font-semibold text-gray-700">오늘 회의</h3>
        <Link
          href="/schedule"
          className="ml-auto text-[10px] text-gray-300 hover:text-gray-600 transition-colors"
          title="일정 탭에서 고정 회의 관리"
        >
          ⚙ 관리
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-hide">
        {todayMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-[11px] text-gray-300 text-center leading-relaxed">오늘 예정된 회의 없음</p>
            <Link href="/schedule" className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors">
              일정 탭에서 추가 →
            </Link>
          </div>
        ) : (
          todayMeetings.map(m => (
            <div key={m.id} className="group">
              <div className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-white/50 transition-colors">
                <span className="flex-shrink-0 text-[11px] font-mono text-gray-400 w-10">{m.time}</span>
                <span className="flex-1 text-[11px] text-gray-700 font-medium truncate">{m.title}</span>
                {m.is_recurring && (
                  <span className="flex-shrink-0 text-[8px] text-gray-300">
                    {(m.days_of_week ?? []).map(d => DOW_LABELS[d]).join('')}
                  </span>
                )}
                <button
                  onClick={() => { setEditingNoteId(m.id); setNoteText(m.prep_note ?? '') }}
                  className="text-[9px] text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  메모
                </button>
              </div>
              {m.prep_note && editingNoteId !== m.id && (
                <p className="text-[10px] text-gray-400 pl-12 pr-2 pb-1 leading-relaxed">{m.prep_note}</p>
              )}
              {editingNoteId === m.id && (
                <div className="pl-12 pr-1 pb-1.5 flex gap-1.5">
                  <input
                    autoFocus
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNote(m.id); if (e.key === 'Escape') setEditingNoteId(null) }}
                    placeholder="준비 메모…"
                    className="flex-1 text-[10px] border border-gray-200 bg-white rounded px-2 py-1 focus:outline-none text-gray-600 placeholder:text-gray-300"
                  />
                  <button onClick={() => saveNote(m.id)}
                    className="text-[9px] text-gray-500 hover:text-gray-800">저장</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
