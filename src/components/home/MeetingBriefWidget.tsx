'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useUserSetting } from '@/hooks/useUserSetting'
import { createClient } from '@/lib/supabase/client'

interface MeetingSchedule {
  id: string
  title: string
  time: string
  is_recurring: boolean
  days_of_week?: number[]
  date?: string
  prep_note?: string
  prep_notes_by_date?: Record<string, string>
  linked_meeting_id?: string
  linked_meeting_ids_by_date?: Record<string, string>
}

interface DbMeeting {
  id: string
  title: string
  meeting_date: string | null
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

function getMeetingsForDate(schedules: MeetingSchedule[], date: string): MeetingSchedule[] {
  const dow = new Date(date + 'T00:00:00').getDay()
  return schedules
    .filter(s => s.is_recurring ? (s.days_of_week ?? []).includes(dow) : s.date === date)
    .sort((a, b) => a.time.localeCompare(b.time))
}

function getNoteForDate(m: MeetingSchedule, dateStr: string, today: string): string {
  if (m.prep_notes_by_date?.[dateStr] !== undefined) return m.prep_notes_by_date[dateStr]
  if (dateStr === today) return m.prep_note ?? ''
  return ''
}

function getLinkedMeetingId(s: MeetingSchedule, date: string): string | undefined {
  return s.is_recurring ? s.linked_meeting_ids_by_date?.[date] : s.linked_meeting_id
}

function applyLink(s: MeetingSchedule, date: string, meetingId: string | null): MeetingSchedule {
  if (s.is_recurring) {
    const byDate = { ...(s.linked_meeting_ids_by_date ?? {}) }
    if (meetingId) byDate[date] = meetingId; else delete byDate[date]
    return { ...s, linked_meeting_ids_by_date: byDate }
  }
  const upd = { ...s }
  if (meetingId) upd.linked_meeting_id = meetingId; else delete upd.linked_meeting_id
  return upd
}

export default function MeetingBriefWidget() {
  const { value: schedules, save } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])
  const today = toDateStr(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  // 연동 피커
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [dbMeetings, setDbMeetings] = useState<DbMeeting[]>([])
  const [loadingPicker, setLoadingPicker] = useState(false)

  const meetings = getMeetingsForDate(schedules, selectedDate)
  const isToday = selectedDate === today
  const isFuture = selectedDate > today
  const label = dateLabel(selectedDate, today)

  async function openLinkPicker(scheduleId: string) {
    setLinkingId(scheduleId)
    setLoadingPicker(true)
    const supabase = createClient()
    const from = shiftDate(selectedDate, -7)
    const to = shiftDate(selectedDate, 7)
    const { data } = await supabase
      .from('meetings')
      .select('id, title, meeting_date')
      .gte('meeting_date', from)
      .lte('meeting_date', to)
      .order('meeting_date', { ascending: true })
    setDbMeetings((data ?? []) as DbMeeting[])
    setLoadingPicker(false)
  }

  function linkMeeting(scheduleId: string, meetingId: string) {
    save(schedules.map(s => s.id === scheduleId ? applyLink(s, selectedDate, meetingId) : s))
    setLinkingId(null)
  }

  function unlinkMeeting(scheduleId: string) {
    save(schedules.map(s => s.id === scheduleId ? applyLink(s, selectedDate, null) : s))
  }

  async function saveNote(id: string) {
    const schedule = schedules.find(s => s.id === id)
    if (!schedule) return

    // 1. 유저 설정에 저장
    save(schedules.map(s => {
      if (s.id !== id) return s
      const byDate = { ...(s.prep_notes_by_date ?? {}), [selectedDate]: noteText }
      const extra = isToday ? { prep_note: noteText } : {}
      return { ...s, prep_notes_by_date: byDate, ...extra }
    }))

    // 2. 연동된 회의록이 있으면 거기에도 저장
    const linkedMeetingId = getLinkedMeetingId(schedule, selectedDate)
    if (linkedMeetingId && noteText.trim()) {
      const supabase = createClient()
      const { data } = await supabase.from('meetings').select('notes').eq('id', linkedMeetingId).single()
      if (data) {
        type AnyNote = { title: string; content: string; created_at: string; is_prep?: boolean; edited_at?: string }
        const existing = (data.notes ?? []) as AnyNote[]
        const prepIdx = existing.findIndex(n => n.is_prep === true)
        const prepEntry: AnyNote = {
          title: '사전 메모',
          content: noteText,
          created_at: prepIdx >= 0 ? existing[prepIdx].created_at : new Date().toISOString(),
          edited_at: prepIdx >= 0 ? new Date().toISOString() : undefined,
          is_prep: true,
        }
        const updatedNotes = prepIdx >= 0
          ? existing.map((n, i) => i === prepIdx ? prepEntry : n)
          : [prepEntry, ...existing]
        await supabase.from('meetings').update({ notes: updatedNotes }).eq('id', linkedMeetingId)
      }
    }

    setEditingNoteId(null)
  }

  function navigate(n: number) {
    setSelectedDate(d => shiftDate(d, n))
    setEditingNoteId(null)
    setLinkingId(null)
  }

  return (
    <div className="h-full flex flex-col p-3 font-sans">
      {/* Header */}
      <div className="flex items-center gap-1 mb-2.5 flex-shrink-0">
        <span className="text-sm leading-none">📋</span>
        <h3 className="text-xs font-semibold text-gray-700">회의</h3>

        <div className="flex items-center ml-1">
          <button onClick={() => navigate(-1)} className="text-[13px] text-gray-300 hover:text-gray-600 px-0.5 leading-none transition-colors">‹</button>
          <span className={`text-[11px] font-medium px-1 min-w-[52px] text-center ${isToday ? 'text-blue-500' : isFuture ? 'text-emerald-600' : 'text-gray-400'}`}>
            {label}
          </span>
          <button onClick={() => navigate(1)} className="text-[13px] text-gray-300 hover:text-gray-600 px-0.5 leading-none transition-colors">›</button>
        </div>

        {!isToday && (
          <button onClick={() => { setSelectedDate(today); setEditingNoteId(null); setLinkingId(null) }}
            className="text-[9px] text-blue-400 hover:text-blue-600 transition-colors px-0.5">오늘</button>
        )}

        <Link href="/schedule" className="ml-auto text-[10px] text-gray-300 hover:text-gray-600 transition-colors">⚙</Link>
      </div>

      {/* Meeting list */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-hide">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-[11px] text-gray-300 text-center">{label} 예정된 회의 없음</p>
            <Link href="/schedule" className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors">일정 탭에서 추가 →</Link>
          </div>
        ) : (
          meetings.map(m => {
            const note = getNoteForDate(m, selectedDate, today)
            const linkedId = getLinkedMeetingId(m, selectedDate)

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

                  {/* 연동 상태 표시 */}
                  {linkedId ? (
                    <Link href={`/meetings/${linkedId}`}
                      className="flex-shrink-0 text-[9px] text-blue-400 hover:text-blue-600 transition-colors"
                      title="연동된 회의록">🔗</Link>
                  ) : (
                    <button
                      onClick={() => openLinkPicker(m.id)}
                      className="text-[9px] text-gray-200 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="회의록 연동">연동</button>
                  )}

                  <button
                    onClick={() => { setEditingNoteId(m.id); setNoteText(note) }}
                    className="text-[9px] text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    메모
                  </button>
                </div>

                {/* 연동 피커 */}
                {linkingId === m.id && (
                  <div className="mx-1.5 mb-1 bg-white border border-gray-200 rounded-lg shadow-md p-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold text-gray-500">회의록 연동</p>
                      <button onClick={() => setLinkingId(null)} className="text-[10px] text-gray-300 hover:text-gray-600">✕</button>
                    </div>
                    {loadingPicker ? (
                      <p className="text-[10px] text-gray-300 py-1 text-center">불러오는 중…</p>
                    ) : dbMeetings.length === 0 ? (
                      <div className="text-center py-2">
                        <p className="text-[10px] text-gray-300">근처 날짜에 회의록 없음</p>
                        <Link href="/meetings" className="text-[10px] text-blue-400 hover:text-blue-600" onClick={() => setLinkingId(null)}>
                          회의록 탭에서 생성 →
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-0.5 max-h-36 overflow-y-auto scrollbar-hide">
                        {dbMeetings.map(dm => (
                          <button key={dm.id} onClick={() => linkMeeting(m.id, dm.id)}
                            className="w-full text-left px-2 py-1.5 hover:bg-gray-50 rounded text-[10px] text-gray-600 flex items-center gap-2">
                            <span className="text-gray-300 flex-shrink-0 font-mono">{dm.meeting_date ?? '날짜없음'}</span>
                            <span className="truncate">{dm.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {linkedId && (
                      <button onClick={() => { unlinkMeeting(m.id); setLinkingId(null) }}
                        className="mt-1.5 w-full text-[9px] text-red-400 hover:text-red-600 text-center">
                        연동 해제
                      </button>
                    )}
                  </div>
                )}

                {/* 메모 표시 */}
                {note && editingNoteId !== m.id && (
                  <div className="flex items-start gap-1 pl-12 pr-2 pb-1">
                    <p className="flex-1 text-[10px] text-gray-400 leading-relaxed">{note}</p>
                    {linkedId && <span className="text-[8px] text-blue-300 flex-shrink-0 mt-0.5">🔗회의록</span>}
                  </div>
                )}

                {/* 메모 편집 */}
                {editingNoteId === m.id && (
                  <div className="pl-12 pr-1 pb-1.5 flex gap-1.5">
                    <input autoFocus value={noteText} onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveNote(m.id); if (e.key === 'Escape') setEditingNoteId(null) }}
                      placeholder={linkedId ? '메모 → 회의록 연동 저장' : '준비 메모…'}
                      className="flex-1 text-[10px] border border-gray-200 bg-white rounded px-2 py-1 focus:outline-none text-gray-600 placeholder:text-gray-300"
                    />
                    <button onClick={() => saveNote(m.id)} className="text-[9px] text-gray-500 hover:text-gray-800">저장</button>
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
