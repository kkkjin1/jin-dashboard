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
  preferred_category?: string  // 카테고리 기억
}

interface DbMeeting {
  id: string
  title: string
  meeting_date: string | null
  category?: string | null
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const CATEGORIES = ['코어', '비즈', '경영진', '본부장', '타팀', '목표관리'] as const
type Category = typeof CATEGORIES[number]

const CAT_COLORS: Record<string, string> = {
  '코어':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  '비즈':   'bg-blue-50 text-blue-700 border-blue-200',
  '경영진': 'bg-red-50 text-red-700 border-red-200',
  '본부장': 'bg-purple-50 text-purple-700 border-purple-200',
  '타팀':   'bg-gray-100 text-gray-600 border-gray-200',
  '목표관리':'bg-indigo-50 text-indigo-600 border-indigo-200',
}

function toDateStr(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function shiftDate(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return toDateStr(d)
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
  return dateStr === today ? (m.prep_note ?? '') : ''
}
function getLinkedMeetingId(s: MeetingSchedule, date: string): string | undefined {
  return s.is_recurring ? s.linked_meeting_ids_by_date?.[date] : s.linked_meeting_id
}
function applyLink(s: MeetingSchedule, date: string, meetingId: string | null, category?: string): MeetingSchedule {
  const base = category ? { ...s, preferred_category: category } : { ...s }
  if (s.is_recurring) {
    const byDate = { ...(base.linked_meeting_ids_by_date ?? {}) }
    if (meetingId) byDate[date] = meetingId; else delete byDate[date]
    return { ...base, linked_meeting_ids_by_date: byDate }
  }
  const upd = { ...base }
  if (meetingId) upd.linked_meeting_id = meetingId; else delete upd.linked_meeting_id
  return upd
}

type PickerStep = 'category' | 'list'

export default function MeetingBriefWidget() {
  const { value: schedules, save } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])
  const today = toDateStr(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  // 연동 피커 상태
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [pickerStep, setPickerStep] = useState<PickerStep>('category')
  const [pickerCategory, setPickerCategory] = useState<string>('')
  const [tempCategory, setTempCategory] = useState<string>('')
  const [dbMeetings, setDbMeetings] = useState<DbMeeting[]>([])
  const [loadingPicker, setLoadingPicker] = useState(false)
  const [creatingNew, setCreatingNew] = useState(false)

  const dayMeetings = getMeetingsForDate(schedules, selectedDate)
  const isToday = selectedDate === today
  const isFuture = selectedDate > today
  const label = dateLabel(selectedDate, today)

  function closePicker() {
    setLinkingId(null)
    setPickerStep('category')
    setPickerCategory('')
    setTempCategory('')
    setDbMeetings([])
  }

  function openLinkPicker(scheduleId: string) {
    setLinkingId(scheduleId)
    const schedule = schedules.find(s => s.id === scheduleId)
    setTempCategory(schedule?.preferred_category ?? '')
    setPickerStep('category')
  }

  async function selectCategory(scheduleId: string, category: string) {
    setPickerCategory(category)
    setPickerStep('list')
    setLoadingPicker(true)
    // "다음 →" 확정 시 preferred_category 저장
    save(schedules.map(s => s.id === scheduleId ? { ...s, preferred_category: category } : s))
    const supabase = createClient()
    const { data } = await supabase
      .from('meetings')
      .select('id, title, meeting_date, category')
      .eq('category', category)
      .order('meeting_date', { ascending: false })
      .limit(15)
    setDbMeetings((data ?? []) as DbMeeting[])
    setLoadingPicker(false)
  }

  function linkToMeeting(scheduleId: string, meetingId: string) {
    save(schedules.map(s => s.id === scheduleId ? applyLink(s, selectedDate, meetingId, pickerCategory) : s))
    closePicker()
  }

  async function createAndLink(scheduleId: string) {
    const schedule = schedules.find(s => s.id === scheduleId)
    if (!schedule) return
    setCreatingNew(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('meetings')
      .insert({
        title: schedule.title,
        meeting_date: selectedDate,
        category: pickerCategory,
        notes: [],
      })
      .select('id')
      .single()
    if (data) {
      save(schedules.map(s => s.id === scheduleId ? applyLink(s, selectedDate, data.id, pickerCategory) : s))
    }
    setCreatingNew(false)
    closePicker()
  }

  function unlinkMeeting(scheduleId: string) {
    save(schedules.map(s => s.id === scheduleId ? applyLink(s, selectedDate, null) : s))
  }

  async function saveNote(id: string) {
    const schedule = schedules.find(s => s.id === id)
    if (!schedule) return

    save(schedules.map(s => {
      if (s.id !== id) return s
      const byDate = { ...(s.prep_notes_by_date ?? {}), [selectedDate]: noteText }
      return { ...s, prep_notes_by_date: byDate, ...(isToday ? { prep_note: noteText } : {}) }
    }))

    const linkedMeetingId = getLinkedMeetingId(schedule, selectedDate)
    if (linkedMeetingId && noteText.trim()) {
      const supabase = createClient()
      const { data } = await supabase.from('meetings').select('notes').eq('id', linkedMeetingId).single()
      if (data) {
        type AnyNote = { title: string; content: string; created_at: string; is_prep?: boolean; edited_at?: string }
        const existing = (data.notes ?? []) as AnyNote[]
        const prepIdx = existing.findIndex(n => n.is_prep === true)
        const prepEntry: AnyNote = {
          title: '사전 메모', content: noteText,
          created_at: prepIdx >= 0 ? existing[prepIdx].created_at : new Date().toISOString(),
          ...(prepIdx >= 0 ? { edited_at: new Date().toISOString() } : {}),
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
    closePicker()
  }

  return (
    <div className="h-full flex flex-col p-3 font-sans">
      {/* Header */}
      <div className="flex items-center gap-1 mb-2.5 flex-shrink-0">
        <span className="text-sm leading-none">📋</span>
        <h3 className="text-xs font-semibold text-gray-700">회의</h3>
        <div className="flex items-center ml-1">
          <button onClick={() => navigate(-1)} className="text-[13px] text-gray-300 hover:text-gray-600 px-0.5 leading-none">‹</button>
          <span className={`text-[11px] font-medium px-1 min-w-[52px] text-center ${isToday ? 'text-blue-500' : isFuture ? 'text-emerald-600' : 'text-gray-400'}`}>{label}</span>
          <button onClick={() => navigate(1)} className="text-[13px] text-gray-300 hover:text-gray-600 px-0.5 leading-none">›</button>
        </div>
        {!isToday && (
          <button onClick={() => { setSelectedDate(today); setEditingNoteId(null); closePicker() }}
            className="text-[9px] text-blue-400 hover:text-blue-600 px-0.5">오늘</button>
        )}
        <Link href="/schedule" className="ml-auto text-[10px] text-gray-300 hover:text-gray-600">⚙</Link>
      </div>

      {/* Meeting list */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-hide">
        {dayMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-[11px] text-gray-300 text-center">{label} 예정된 회의 없음</p>
            <Link href="/schedule" className="text-[10px] text-gray-300 hover:text-gray-500">일정 탭에서 추가 →</Link>
          </div>
        ) : (
          dayMeetings.map(m => {
            const note = getNoteForDate(m, selectedDate, today)
            const linkedId = getLinkedMeetingId(m, selectedDate)

            return (
              <div key={m.id} className="group">
                {/* 회의 행 */}
                <div className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-white/50 transition-colors">
                  <span className="flex-shrink-0 text-[11px] font-mono text-gray-400 w-10">{m.time}</span>
                  <span className="flex-1 text-xs text-gray-700 font-medium truncate">{m.title}</span>
                  {m.is_recurring && (
                    <span className="flex-shrink-0 text-[8px] text-gray-300">{(m.days_of_week ?? []).map(d => DOW_LABELS[d]).join('')}</span>
                  )}
                  {/* 카테고리 뱃지 */}
                  {m.preferred_category && !linkedId && (
                    <span className={`flex-shrink-0 text-[8px] px-1 py-0.5 rounded border ${CAT_COLORS[m.preferred_category] ?? 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {m.preferred_category}
                    </span>
                  )}
                  {/* 연동 상태 */}
                  {linkedId ? (
                    <>
                      <Link href={`/meetings/${linkedId}`}
                        className="flex-shrink-0 text-[9px] text-blue-400 hover:text-blue-600"
                        title="연동된 회의록">🔗</Link>
                      <button onClick={() => openLinkPicker(m.id)}
                        className="text-[9px] text-gray-200 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all">편집</button>
                    </>
                  ) : (
                    <button onClick={() => openLinkPicker(m.id)}
                      className="text-[9px] text-gray-200 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all">연동</button>
                  )}
                  <button onClick={() => { setEditingNoteId(m.id); setNoteText(note) }}
                    className="text-[9px] text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">메모</button>
                </div>

                {/* ── 연동 피커 ── */}
                {linkingId === m.id && (
                  <div className="mx-1.5 mb-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">

                    {/* 피커 헤더 */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                      {pickerStep === 'list' ? (
                        <button onClick={() => setPickerStep('category')}
                          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                          ← {pickerCategory}
                        </button>
                      ) : (
                        <p className="text-[10px] font-semibold text-gray-600">회의록 연동</p>
                      )}
                      <div className="flex items-center gap-2">
                        {linkedId && (
                          <button onClick={() => { unlinkMeeting(m.id); closePicker() }}
                            className="text-[9px] text-red-400 hover:text-red-600">연동 해제</button>
                        )}
                        <button onClick={closePicker} className="text-gray-300 hover:text-gray-600 text-sm leading-none">✕</button>
                      </div>
                    </div>

                    {/* Step 1: 카테고리 선택 */}
                    {pickerStep === 'category' && (
                      <div className="p-2.5">
                        <p className="text-[9px] text-gray-400 mb-2">어느 범주의 회의록과 연동할까요?</p>
                        <div className="flex flex-wrap gap-1">
                          {CATEGORIES.map(cat => (
                            <button key={cat}
                              onClick={() => setTempCategory(prev => prev === cat ? '' : cat)}
                              className={`text-[10px] px-2 py-1 rounded-full border transition-all hover:scale-105 ${CAT_COLORS[cat]} ${tempCategory === cat ? 'ring-2 ring-offset-1 ring-gray-400 scale-105' : ''}`}>
                              {cat}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          {m.preferred_category && (
                            <button
                              onClick={() => {
                                save(schedules.map(s => s.id === m.id ? { ...s, preferred_category: undefined } : s))
                                closePicker()
                              }}
                              className="text-[9px] text-gray-400 hover:text-red-500 transition-colors">
                              범주 해제
                            </button>
                          )}
                          {tempCategory && (
                            <button
                              onClick={() => selectCategory(m.id, tempCategory)}
                              className="text-[10px] text-blue-600 font-medium px-2.5 py-1 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors ml-auto">
                              다음 →
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Step 2: 새로 만들기 or 기존 연동 */}
                    {pickerStep === 'list' && (
                      <div className="p-2">
                        {/* 새 회의록 생성 */}
                        <button
                          onClick={() => createAndLink(m.id)}
                          disabled={creatingNew}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-50 hover:bg-blue-50 border border-dashed border-gray-200 hover:border-blue-300 transition-all mb-2 disabled:opacity-50">
                          <span className="text-[10px] text-blue-500 font-medium">
                            {creatingNew ? '생성 중…' : `+ ${selectedDate} 새 회의록 생성`}
                          </span>
                        </button>

                        {/* 기존 연동 목록 */}
                        {loadingPicker ? (
                          <p className="text-[10px] text-gray-300 py-2 text-center">불러오는 중…</p>
                        ) : dbMeetings.length === 0 ? (
                          <p className="text-[10px] text-gray-300 py-1 text-center">{pickerCategory} 범주에 회의록 없음</p>
                        ) : (
                          <>
                            <p className="text-[9px] text-gray-300 mb-1 px-1">또는 기존 회의록에 연동</p>
                            <div className="space-y-0.5 max-h-32 overflow-y-auto scrollbar-hide">
                              {dbMeetings.map(dm => (
                                <button key={dm.id} onClick={() => linkToMeeting(m.id, dm.id)}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 rounded-lg text-[10px] text-gray-600 flex items-center gap-2">
                                  <span className="text-gray-300 flex-shrink-0 font-mono text-[9px]">{dm.meeting_date ?? '날짜없음'}</span>
                                  <span className="truncate">{dm.title}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 메모 표시 */}
                {note && editingNoteId !== m.id && (
                  <div className="flex items-start gap-1 pl-12 pr-2 pb-1">
                    <p className="flex-1 text-[11px] text-gray-400 leading-relaxed">{note}</p>
                    {linkedId && <span className="text-[8px] text-blue-300 flex-shrink-0 mt-0.5">🔗</span>}
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
