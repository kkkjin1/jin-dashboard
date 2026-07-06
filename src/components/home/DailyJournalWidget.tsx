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

function todayStr() {
  return localDateStr(new Date())
}

export default function DailyJournalWidget({ selectedDate, onNavigate, onDateChange, tasks, meetings, onSaved }: Props) {
  const TODAY = todayStr()
  const isToday = selectedDate === TODAY

  const [journals, setJournals] = useState<Record<string, DailyJournal>>({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // @ 회의 연결
  const [linkedMeetingIds, setLinkedMeetingIds] = useState<string[]>([])
  const [showMeetingPicker, setShowMeetingPicker] = useState(false)
  const [meetingSearch, setMeetingSearch] = useState('')

  // # 태그
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const meetingSearchRef = useRef<HTMLInputElement>(null)
  const datePickerRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // 날짜 변경 시 해당 날짜 데이터 로드
  useEffect(() => {
    setEditing(false)
    setShowMeetingPicker(false)
    if (!journals[selectedDate]) {
      supabase.from('daily_journals').select('*').eq('date', selectedDate).single()
        .then(({ data }) => {
          if (data) setJournals(prev => ({ ...prev, [selectedDate]: data as DailyJournal }))
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // 초기 로드: 최근 7일
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

  useEffect(() => {
    if (editing) setTimeout(() => textareaRef.current?.focus(), 30)
  }, [editing])

  useEffect(() => {
    if (showMeetingPicker) setTimeout(() => meetingSearchRef.current?.focus(), 30)
  }, [showMeetingPicker])

  const current = journals[selectedDate] ?? null
  const yesterday = journals[(() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d) })()] ?? null

  function startEdit() {
    setDraft(current?.content ?? '')
    setLinkedMeetingIds(current?.linked_meeting_ids ?? [])
    setTags(current?.tags ?? [])
    setSaveError('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSaveError('')
    setShowMeetingPicker(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSave() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
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
      const { data, error } = await supabase.from('daily_journals').update(payload).eq('id', current.id).select('*').single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) setJournals(prev => ({ ...prev, [selectedDate]: data as DailyJournal }))
    } else {
      const { data, error } = await supabase.from('daily_journals').insert({ date: selectedDate, ...payload }).select('*').single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) setJournals(prev => ({ ...prev, [selectedDate]: data as DailyJournal }))
    }
    setSaving(false)
    setEditing(false)
    setShowMeetingPicker(false)
    onSaved?.(draft.trim())
  }

  const getMeetings = (j: DailyJournal) =>
    j.linked_meeting_ids.map(id => meetings.find(m => m.id === id)).filter(Boolean) as MeetingMin[]

  const showMorningContext = isToday && !current && !!yesterday

  const filteredMeetings = meetings.filter(m =>
    !linkedMeetingIds.includes(m.id) &&
    m.title.toLowerCase().includes(meetingSearch.toLowerCase())
  ).slice(0, 6)

  return (
    <div className="flex flex-col overflow-hidden h-full font-sans">

      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/5 flex-shrink-0">
        <span className="text-sm leading-none">🪴</span>
        <span className="text-xs font-semibold text-gray-700 flex-1">회고</span>

        {/* 날짜 네비게이션 */}
        <div className="flex items-center gap-0.5 bg-white/60 text-gray-600 rounded-full px-1.5 py-0.5">
          <button onClick={() => onNavigate(-1)} className="hover:opacity-60 transition-opacity text-xs px-0.5">←</button>
          <span
            onClick={() => onDateChange && datePickerRef.current?.showPicker?.()}
            className={`min-w-[2.5rem] text-center text-[11px] font-medium block px-0.5 transition-opacity ${onDateChange ? 'cursor-pointer hover:opacity-70' : ''}`}
            title={onDateChange ? '클릭해서 날짜 선택' : undefined}
          >
            {formatDateLabel(selectedDate)}
          </span>
          {onDateChange && (
            <input
              ref={datePickerRef}
              type="date"
              max={todayStr()}
              value={selectedDate}
              onChange={e => { if (e.target.value && e.target.value <= todayStr()) onDateChange(e.target.value) }}
              className="sr-only"
            />
          )}
          <button onClick={() => onNavigate(1)} disabled={isToday} className="hover:opacity-60 disabled:opacity-20 transition-opacity text-xs px-0.5">→</button>
        </div>

        {current && !editing && (
          <button onClick={startEdit} className="text-[11px] text-gray-400 hover:text-gray-600">수정</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-0">

        {/* 아침 컨텍스트 */}
        {showMorningContext && (
          <div className="bg-white/50 border border-white/60 rounded-lg p-3 flex-shrink-0">
            <p className="text-[10px] font-semibold text-gray-500 mb-1.5">어제 이어받기</p>
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{yesterday!.content}</p>
            {getMeetings(yesterday!).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {getMeetings(yesterday!).map(m => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="text-[10px] bg-white/70 border border-gray-200/70 text-gray-600 px-1.5 py-0.5 rounded hover:bg-white/90 transition-colors">
                    @ {m.title}
                  </Link>
                ))}
              </div>
            )}
            {yesterday!.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {yesterday!.tags.map(t => (
                  <span key={t} className="text-[10px] text-gray-400">#{t}</span>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setDraft(`[어제 이어서]\n${yesterday!.content.slice(0, 120)}${yesterday!.content.length > 120 ? '…' : ''}\n\n오늘: `)
                setLinkedMeetingIds(yesterday!.linked_meeting_ids ?? [])
                setTags(yesterday!.tags ?? [])
                setEditing(true)
              }}
              className="mt-2 text-[10px] text-gray-600 border border-gray-200/70 bg-white/70 px-2 py-1 rounded hover:bg-white/90 transition-colors"
            >
              + 이어서 오늘 회고 시작
            </button>
          </div>
        )}

        {/* 읽기 모드 */}
        {current && !editing && (
          <div className="flex flex-col gap-2 flex-shrink-0">
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
          </div>
        )}

        {/* 빈 상태 */}
        {!current && !editing && (
          <button onClick={startEdit} className="text-left text-xs text-gray-300 hover:text-gray-500 transition-colors py-1">
            {isToday ? '+ 오늘 회고 작성…' : '+ 이 날 회고 작성…'}
          </button>
        )}

        {/* 편집 */}
        {editing && (
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="오늘 뭐했고, 어떤 고민이 있었는지, 어떤 진전이 있었는지 자유롭게…"
              className="flex-1 text-xs text-gray-700 placeholder:text-gray-300 resize-none focus:outline-none leading-relaxed min-h-[90px] bg-transparent"
            />

            {/* @ 회의 연결 */}
            <div className="flex-shrink-0 flex flex-col gap-1 border-t border-gray-100 pt-2">
              <div className="flex flex-wrap gap-1 items-center min-h-[20px]">
                {linkedMeetingIds.map(mid => {
                  const m = meetings.find(x => x.id === mid)
                  return m ? (
                    <span key={mid} className="flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">
                      @ {m.title}
                      <button onClick={() => setLinkedMeetingIds(prev => prev.filter(i => i !== mid))} className="ml-0.5 text-blue-400 hover:text-blue-600">×</button>
                    </span>
                  ) : null
                })}
                <button
                  onClick={() => setShowMeetingPicker(p => !p)}
                  className="text-[10px] text-gray-300 hover:text-blue-500 transition-colors"
                >
                  @ 회의 연결
                </button>
              </div>

              {/* 회의 검색 드롭다운 */}
              {showMeetingPicker && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-md p-2 flex flex-col gap-1">
                  <input
                    ref={meetingSearchRef}
                    value={meetingSearch}
                    onChange={e => setMeetingSearch(e.target.value)}
                    placeholder="회의 검색…"
                    className="text-xs border-b border-gray-100 pb-1 focus:outline-none text-gray-600 placeholder:text-gray-300"
                  />
                  {filteredMeetings.length === 0 ? (
                    <p className="text-[10px] text-gray-300 py-1 text-center">검색 결과 없음</p>
                  ) : filteredMeetings.map(m => (
                    <button key={m.id} onClick={() => linkMeeting(m.id)}
                      className="text-left text-xs px-1.5 py-1 hover:bg-gray-50 rounded text-gray-600 truncate">
                      {m.title}
                      {m.meeting_date && <span className="text-gray-300 ml-1">{m.meeting_date}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* # 태그 */}
              <div className="flex flex-wrap gap-1 items-center">
                {tags.map(t => (
                  <span key={t} className="flex items-center gap-0.5 text-[10px] bg-gray-50 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-full">
                    #{t}
                    <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="ml-0.5 text-gray-300 hover:text-gray-500">×</button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
                  onKeyDown={e => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') { e.preventDefault(); addTag() }
                  }}
                  placeholder="# 태그 추가"
                  className="text-[10px] text-gray-500 focus:outline-none w-20 placeholder:text-gray-300"
                />
              </div>
            </div>

            {saveError && <p className="text-[10px] text-red-500 flex-shrink-0">{saveError}</p>}

            <div className="flex items-center justify-between flex-shrink-0">
              <button onClick={cancelEdit} className="text-[10px] text-gray-300 hover:text-gray-500">취소</button>
              <button onClick={doSave} disabled={!draft.trim() || saving}
                className="text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30">
                {saving ? '저장 중…' : 'Ctrl+Enter 저장'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
