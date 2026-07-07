'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/types'

interface MeetingMin { id: string; title: string; meeting_date?: string | null }

interface DailyJournal {
  id: string
  date: string
  content: string
  linked_task_ids: string[]
  linked_meeting_ids: string[]
  tags: string[]
}

interface Props {
  selectedDate: string
  onNavigate: (dir: -1 | 1) => void
  onDateChange?: (date: string) => void
  tasks: Task[]
  meetings: MeetingMin[]
  onSaved?: (content: string) => void
}

function formatDateLabel(ds: string) {
  const d = new Date(ds + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(d); target.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff === 2) return '그제'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function localDateStr(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function todayStr() { return localDateStr(new Date()) }

export default function DailyJournalWidget({ selectedDate, onNavigate, onDateChange, tasks, meetings, onSaved }: Props) {
  const TODAY = todayStr()
  const isToday = selectedDate === TODAY

  const [journals, setJournals] = useState<Record<string, DailyJournal>>({})
  const [showEditor, setShowEditor] = useState(false)

  const datePickerRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    setShowEditor(false)
    if (!journals[selectedDate]) {
      supabase.from('daily_journals').select('*').eq('date', selectedDate).single()
        .then(({ data }) => {
          if (data) setJournals(prev => ({ ...prev, [selectedDate]: data as DailyJournal }))
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  useEffect(() => {
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i)
      return localDateStr(d)
    })
    supabase.from('daily_journals').select('*').in('date', dates)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, DailyJournal> = {}
        data.forEach(j => { map[j.date] = j as DailyJournal })
        setJournals(map)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = journals[selectedDate] ?? null
  const yesterday = journals[(() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) })()] ?? null

  const getMeetings = (j: DailyJournal) =>
    j.linked_meeting_ids.map(id => meetings.find(m => m.id === id)).filter(Boolean) as MeetingMin[]

  function handleSaved(updated: DailyJournal) {
    setJournals(prev => ({ ...prev, [selectedDate]: updated }))
    setShowEditor(false)
    onSaved?.(updated.content)
  }

  return (
    <div className="flex flex-col overflow-hidden h-full font-sans">

      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/5 flex-shrink-0">
        <span className="text-sm leading-none">🪴</span>
        <span className="text-xs font-semibold text-gray-700 flex-1">회고</span>
        <div className="flex items-center gap-0.5 bg-white/60 text-gray-600 rounded-full px-1.5 py-0.5">
          <button onClick={() => onNavigate(-1)} className="hover:opacity-60 transition-opacity text-xs px-0.5">←</button>
          <span
            onClick={() => onDateChange && datePickerRef.current?.showPicker?.()}
            className={`min-w-[2.5rem] text-center text-[11px] font-medium block px-0.5 transition-opacity ${onDateChange ? 'cursor-pointer hover:opacity-70' : ''}`}
          >
            {formatDateLabel(selectedDate)}
          </span>
          {onDateChange && (
            <input ref={datePickerRef} type="date" max={todayStr()} value={selectedDate}
              onChange={e => { if (e.target.value && e.target.value <= todayStr()) onDateChange(e.target.value) }}
              className="sr-only" />
          )}
          <button onClick={() => onNavigate(1)} disabled={isToday} className="hover:opacity-60 disabled:opacity-20 transition-opacity text-xs px-0.5">→</button>
        </div>
        {current && (
          <button onClick={() => setShowEditor(true)} className="text-[11px] text-gray-400 hover:text-gray-600">수정</button>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide flex flex-col gap-2 min-h-0">

        {/* 저장된 회고 */}
        {current && (
          <>
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{current.content}</p>
            {getMeetings(current).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {getMeetings(current).map(m => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded hover:bg-blue-100 transition-colors">
                    @ {m.title}
                  </Link>
                ))}
              </div>
            )}
            {current.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {current.tags.map(t => (
                  <span key={t} className="text-[10px] text-gray-400">#{t}</span>
                ))}
              </div>
            )}
          </>
        )}

        {/* 빈 상태 */}
        {!current && (
          <div className="flex flex-col gap-2">
            {isToday && yesterday && (
              <p className="text-[10px] text-amber-600/70 leading-relaxed line-clamp-2">
                📌 어제: {yesterday.content}
              </p>
            )}
            <button
              onClick={() => setShowEditor(true)}
              className="text-left text-xs text-gray-300 hover:text-gray-500 transition-colors py-0.5"
            >
              {isToday ? '+ 오늘 회고 작성…' : '+ 이 날 회고 작성…'}
            </button>
          </div>
        )}
      </div>

      {/* 풀스크린 에디터 */}
      {showEditor && (
        <JournalFullscreenEditor
          selectedDate={selectedDate}
          current={current}
          yesterday={isToday ? yesterday : null}
          meetings={meetings}
          supabaseClient={supabase}
          onSaved={handleSaved}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  )
}

/* ── 풀스크린 에디터 컴포넌트 ── */
interface EditorProps {
  selectedDate: string
  current: DailyJournal | null
  yesterday: DailyJournal | null
  meetings: MeetingMin[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any
  onSaved: (j: DailyJournal) => void
  onClose: () => void
}

function JournalFullscreenEditor({ selectedDate, current, yesterday, meetings, supabaseClient, onSaved, onClose }: EditorProps) {
  const [draft, setDraft] = useState(current?.content ?? '')
  const [linkedMeetingIds, setLinkedMeetingIds] = useState<string[]>(current?.linked_meeting_ids ?? [])
  const [tags, setTags] = useState<string[]>(current?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [meetingSearch, setMeetingSearch] = useState('')
  const [showMeetingPicker, setShowMeetingPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const meetingSearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doSave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, linkedMeetingIds, tags])

  useEffect(() => {
    if (showMeetingPicker) setTimeout(() => meetingSearchRef.current?.focus(), 30)
  }, [showMeetingPicker])

  const getMeetings = (j: DailyJournal) =>
    j.linked_meeting_ids.map(id => meetings.find(m => m.id === id)).filter(Boolean) as MeetingMin[]

  async function doSave() {
    if (!draft.trim()) return
    setSaving(true)
    setSaveError('')
    const payload = {
      content: draft.trim(),
      linked_task_ids: current?.linked_task_ids ?? [],
      linked_meeting_ids: linkedMeetingIds,
      tags,
      updated_at: new Date().toISOString(),
    }
    if (current) {
      const { data, error } = await supabaseClient.from('daily_journals').update(payload).eq('id', current.id).select('*').single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) onSaved(data as DailyJournal)
    } else {
      const { data, error } = await supabaseClient.from('daily_journals').insert({ date: selectedDate, ...payload }).select('*').single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) onSaved(data as DailyJournal)
    }
    setSaving(false)
  }

  function addTag() {
    const t = tagInput.trim().replace(/^#/, '')
    if (!t) return
    setTags(prev => [...new Set([...prev, t])])
    setTagInput('')
  }

  function linkMeeting(id: string) {
    setLinkedMeetingIds(prev => [...new Set([...prev, id])])
    setShowMeetingPicker(false)
    setMeetingSearch('')
  }

  const filteredMeetings = meetings.filter(m =>
    !linkedMeetingIds.includes(m.id) &&
    m.title.toLowerCase().includes(meetingSearch.toLowerCase())
  ).slice(0, 8)

  const today = todayStr()
  const dateLabel = formatDateLabel(selectedDate)

  return (
    <>
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 bg-black/40 z-[85]" onClick={onClose} />

      {/* 풀스크린 카드 */}
      <div className="fixed inset-4 md:inset-10 bg-white rounded-2xl shadow-2xl z-[86] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700">🪴 {dateLabel} 회고</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-300 hidden md:block">ESC 닫기 · Ctrl+Enter 저장</span>
            <button
              onClick={doSave}
              disabled={!draft.trim() || saving}
              className="text-xs bg-gray-900 text-white px-3.5 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        {/* 본문: 좌(어제) + 우(오늘) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

          {/* ── 좌: 어제 회고 (어제이거나, yesterday 있을 때만) ── */}
          {yesterday && (
            <div className="md:w-2/5 flex flex-col border-b md:border-b-0 md:border-r border-gray-100 min-h-0">
              <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
                <p className="text-[11px] font-semibold text-gray-400">어제 회고</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{yesterday.content}</p>
                {getMeetings(yesterday).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {getMeetings(yesterday).map(m => (
                      <Link key={m.id} href={`/meetings/${m.id}`}
                        className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors">
                        @ {m.title}
                      </Link>
                    ))}
                  </div>
                )}
                {yesterday.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {yesterday.tags.map(t => (
                      <span key={t} className="text-[10px] text-gray-400">#{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 우(또는 전체): 오늘 입력 ── */}
          <div className={`flex flex-col min-h-0 overflow-hidden ${yesterday ? 'md:flex-1' : 'flex-1'}`}>
            <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <p className="text-[11px] font-semibold text-gray-400">{dateLabel} 회고 작성</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="오늘 뭐했고, 어떤 고민이 있었는지, 어떤 진전이 있었는지 자유롭게…"
                className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 resize-none focus:outline-none leading-relaxed min-h-[200px] bg-transparent w-full"
              />

              {/* @ 회의 연결 */}
              <div className="flex-shrink-0 border-t border-gray-100 pt-3 flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5 items-center">
                  {linkedMeetingIds.map(mid => {
                    const m = meetings.find(x => x.id === mid)
                    return m ? (
                      <span key={mid} className="flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                        @ {m.title}
                        <button onClick={() => setLinkedMeetingIds(prev => prev.filter(i => i !== mid))} className="ml-0.5 text-blue-400 hover:text-blue-600">×</button>
                      </span>
                    ) : null
                  })}
                  <button onClick={() => setShowMeetingPicker(p => !p)}
                    className="text-[11px] text-gray-300 hover:text-blue-500 transition-colors">
                    @ 회의 연결
                  </button>
                </div>

                {showMeetingPicker && (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 flex flex-col gap-1 max-h-48 overflow-y-auto">
                    <input ref={meetingSearchRef} value={meetingSearch}
                      onChange={e => setMeetingSearch(e.target.value)}
                      placeholder="회의 검색…"
                      className="text-sm border-b border-gray-100 pb-2 mb-1 focus:outline-none text-gray-600 placeholder:text-gray-300" />
                    {filteredMeetings.length === 0
                      ? <p className="text-xs text-gray-300 py-2 text-center">검색 결과 없음</p>
                      : filteredMeetings.map(m => (
                        <button key={m.id} onClick={() => linkMeeting(m.id)}
                          className="text-left text-sm px-2 py-1.5 hover:bg-gray-50 rounded-lg text-gray-600 truncate">
                          {m.title}
                          {m.meeting_date && <span className="text-gray-300 ml-1.5 text-xs">{m.meeting_date}</span>}
                        </button>
                      ))
                    }
                  </div>
                )}

                {/* # 태그 */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {tags.map(t => (
                    <span key={t} className="flex items-center gap-0.5 text-[10px] bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                      #{t}
                      <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="ml-0.5 text-gray-300 hover:text-gray-500">×</button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
                    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    placeholder="# 태그"
                    className="text-[11px] text-gray-500 focus:outline-none w-16 placeholder:text-gray-300"
                  />
                </div>

                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
