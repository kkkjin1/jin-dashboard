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
  prep_notes_by_date?: Record<string, string>
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function toDateStr(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function shiftDate(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

function dateLabel(target: string, today: string): string {
  if (target === today) return '오늘'
  if (target === shiftDate(today, 1)) return '내일'
  if (target === shiftDate(today, -1)) return '어제'
  const d = new Date(target + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW_LABELS[d.getDay()]})`
}

function getMeetingsForDate(schedules: MeetingSchedule[], dateStr: string): MeetingSchedule[] {
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  return schedules
    .filter(s => s.is_recurring
      ? (s.days_of_week ?? []).includes(dow)
      : s.date === dateStr
    )
    .sort((a, b) => a.time.localeCompare(b.time))
}

function getNoteForDate(m: MeetingSchedule, dateStr: string, today: string): string {
  if (m.prep_notes_by_date?.[dateStr] !== undefined) return m.prep_notes_by_date[dateStr]
  if (dateStr === today) return m.prep_note ?? ''
  return ''
}

export default function MeetingBriefWidget() {
  const { value: schedules, save } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])
  const today = toDateStr(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const meetings = getMeetingsForDate(schedules, selectedDate)
  const isToday = selectedDate === today
  const isFuture = selectedDate > today
  const label = dateLabel(selectedDate, today)

  function saveNote(id: string) {
    save(schedules.map(s => {
      if (s.id !== id) return s
      const byDate = { ...(s.prep_notes_by_date ?? {}), [selectedDate]: noteText }
      // keep legacy prep_note in sync for today
      const extra = isToday ? { prep_note: noteText } : {}
      return { ...s, prep_notes_by_date: byDate, ...extra }
    }))
    setEditingNoteId(null)
  }

  function navigate(n: number) {
    setSelectedDate(d => shiftDate(d, n))
    setEditingNoteId(null)
  }

  return (
    <div className="h-full flex flex-col p-3 font-sans">
      {/* Header */}
      <div className="flex items-center gap-1 mb-2.5 flex-shrink-0">
        <span className="text-sm leading-none">📋</span>
        <h3 className="text-xs font-semibold text-gray-700">회의</h3>

        {/* Date navigator */}
        <div className="flex items-center ml-1">
          <button
            onClick={() => navigate(-1)}
            className="text-[13px] text-gray-300 hover:text-gray-600 px-0.5 leading-none transition-colors">‹</button>
          <span className={`text-[11px] font-medium px-1 min-w-[52px] text-center ${
            isToday ? 'text-blue-500' : isFuture ? 'text-emerald-600' : 'text-gray-400'
          }`}>
            {label}
          </span>
          <button
            onClick={() => navigate(1)}
            className="text-[13px] text-gray-300 hover:text-gray-600 px-0.5 leading-none transition-colors">›</button>
        </div>

        {!isToday && (
          <button
            onClick={() => { setSelectedDate(today); setEditingNoteId(null) }}
            className="text-[9px] text-blue-400 hover:text-blue-600 transition-colors px-0.5">
            오늘
          </button>
        )}

        <Link
          href="/schedule"
          className="ml-auto text-[10px] text-gray-300 hover:text-gray-600 transition-colors"
          title="일정 탭에서 고정 회의 관리"
        >
          ⚙
        </Link>
      </div>

      {/* Meeting list */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-hide">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-[11px] text-gray-300 text-center leading-relaxed">
              {label} 예정된 회의 없음
            </p>
            <Link href="/schedule" className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors">
              일정 탭에서 추가 →
            </Link>
          </div>
        ) : (
          meetings.map(m => {
            const note = getNoteForDate(m, selectedDate, today)
            return (
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
                    onClick={() => { setEditingNoteId(m.id); setNoteText(note) }}
                    className="text-[9px] text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    메모
                  </button>
                </div>
                {note && editingNoteId !== m.id && (
                  <p className="text-[10px] text-gray-400 pl-12 pr-2 pb-1 leading-relaxed">{note}</p>
                )}
                {editingNoteId === m.id && (
                  <div className="pl-12 pr-1 pb-1.5 flex gap-1.5">
                    <input
                      autoFocus
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveNote(m.id)
                        if (e.key === 'Escape') setEditingNoteId(null)
                      }}
                      placeholder="준비 메모…"
                      className="flex-1 text-[10px] border border-gray-200 bg-white rounded px-2 py-1 focus:outline-none text-gray-600 placeholder:text-gray-300"
                    />
                    <button onClick={() => saveNote(m.id)}
                      className="text-[9px] text-gray-500 hover:text-gray-800">저장</button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
