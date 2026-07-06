'use client'

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

  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '', time: '09:00', is_recurring: true,
    days_of_week: [] as number[], date: todayStr(),
  })
  const [noteText, setNoteText] = useState('')

  function resetForm() {
    setForm({ title: '', time: '09:00', is_recurring: true, days_of_week: [], date: todayStr() })
  }

  function addMeeting() {
    if (!form.title.trim()) return
    const newItem: MeetingSchedule = {
      id: Date.now().toString(),
      title: form.title.trim(),
      time: form.time,
      is_recurring: form.is_recurring,
      ...(form.is_recurring ? { days_of_week: form.days_of_week } : { date: form.date }),
    }
    save([...schedules, newItem])
    resetForm()
    setShowAdd(false)
  }

  function removeMeeting(id: string) {
    save(schedules.filter(s => s.id !== id))
  }

  function saveNote(id: string) {
    save(schedules.map(s => s.id === id ? { ...s, prep_note: noteText } : s))
    setEditingNoteId(null)
  }

  function toggleDow(d: number) {
    setForm(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(d)
        ? prev.days_of_week.filter(x => x !== d)
        : [...prev.days_of_week, d],
    }))
  }

  return (
    <div className="h-full flex flex-col p-3 font-sans">
      <div className="flex items-center gap-2 mb-2.5 flex-shrink-0">
        <span className="text-sm leading-none">📋</span>
        <h3 className="text-xs font-semibold text-gray-700">오늘 회의</h3>
        <button
          onClick={() => { setShowAdd(p => !p); setEditingId(null) }}
          className="ml-auto text-[10px] text-gray-300 hover:text-gray-600 transition-colors">
          {showAdd ? '취소' : '+ 추가'}
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div className="flex-shrink-0 mb-2.5 p-2.5 bg-white/60 border border-gray-200/60 rounded-xl space-y-2">
          <input
            autoFocus
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addMeeting() }}
            placeholder="회의명"
            className="w-full text-xs focus:outline-none border-b border-gray-100 pb-1 bg-transparent text-gray-700 placeholder:text-gray-300"
          />
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={form.time}
              onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none text-gray-600 bg-white"
            />
            <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_recurring}
                onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))}
                className="w-3 h-3"
              />
              반복
            </label>
          </div>
          {form.is_recurring ? (
            <div className="flex gap-1">
              {DOW_LABELS.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDow(d)}
                  className={`text-[9px] w-6 h-6 rounded-full font-medium transition-colors ${
                    form.days_of_week.includes(d)
                      ? 'bg-[#0F1E36] text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none text-gray-600 bg-white"
            />
          )}
          <div className="flex justify-end gap-1.5 pt-1">
            <button onClick={() => setShowAdd(false)}
              className="text-[10px] text-gray-400 hover:text-gray-600">취소</button>
            <button onClick={addMeeting} disabled={!form.title.trim()}
              className="text-[10px] bg-[#0F1E36] text-white px-2.5 py-1 rounded-full disabled:opacity-40">
              저장
            </button>
          </div>
        </div>
      )}

      {/* 오늘 회의 목록 */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-hide">
        {todayMeetings.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-gray-300 text-center leading-relaxed">
              오늘 예정된 회의 없음
            </p>
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => { setEditingNoteId(m.id); setNoteText(m.prep_note ?? '') }}
                    className="text-[9px] text-gray-300 hover:text-blue-500">메모</button>
                  <button
                    onClick={() => removeMeeting(m.id)}
                    className="text-[9px] text-gray-300 hover:text-red-400">×</button>
                </div>
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
