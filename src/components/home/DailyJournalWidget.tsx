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
}

interface Props {
  tasks: Task[]
  meetings: MeetingMin[]
}

function localDateStr(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function dateStr(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return localDateStr(d)
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(d); target.setHours(0,0,0,0)
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff === 2) return '그제'
  return `${d.getMonth()+1}/${d.getDate()}`
}


export default function DailyJournalWidget({ tasks, meetings }: Props) {
  const TODAY = dateStr(0)

  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [journals, setJournals] = useState<Record<string, DailyJournal>>({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  const isToday = selectedDate === TODAY
  const prevDate = dateStr(new Date(selectedDate + 'T00:00:00').getDate() - new Date().getDate() - 1)

  // 최근 7일치 로드
  useEffect(() => {
    const dates = Array.from({ length: 7 }, (_, i) => dateStr(-i))
    supabase.from('daily_journals').select('*').in('date', dates)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, DailyJournal> = {}
        data.forEach(j => { map[j.date] = j })
        setJournals(map)
      })
  }, [])

  useEffect(() => {
    if (editing) setTimeout(() => textareaRef.current?.focus(), 30)
  }, [editing])

  function navigate(dir: -1 | 1) {
    const [y, m, day] = selectedDate.split('-').map(Number)
    const d = new Date(y, m - 1, day)
    d.setDate(d.getDate() + dir)
    const next = localDateStr(d)
    if (next > TODAY) return
    setSelectedDate(next)
    setEditing(false); setPhase('idle'); setSuggestions([])
    // 없으면 DB에서 로드
    if (!journals[next]) {
      supabase.from('daily_journals').select('*').eq('date', next).single()
        .then(({ data }) => { if (data) setJournals(prev => ({ ...prev, [next]: data })) })
    }
  }

  const current = journals[selectedDate] ?? null
  const yesterday = journals[dateStr(-1)] ?? null

  function startEdit() {
    setDraft(current?.content ?? '')
    setSaveError('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSaveError('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSave() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  async function doSave() {
    if (!draft.trim()) return
    setSaving(true)
    setSaveError('')
    const payload = {
      content: draft.trim(),
      linked_task_ids: current?.linked_task_ids ?? [],
      linked_meeting_ids: current?.linked_meeting_ids ?? [],
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
  }

  const linkedTasks = (j: DailyJournal) => j.linked_task_ids.map(id => tasks.find(t => t.id === id)).filter(Boolean) as Task[]
  const linkedMeetings = (j: DailyJournal) => j.linked_meeting_ids.map(id => meetings.find(m => m.id === id)).filter(Boolean) as MeetingMin[]

  // 아침: 오늘 회고 없고 어제 있을 때
  const showMorningContext = isToday && !current && !!yesterday

  return (
    <div className="bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden h-full">

      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-700 flex-1">회고</span>
        {/* 날짜 네비 */}
        <button onClick={() => navigate(-1)} className="text-gray-300 hover:text-gray-600 text-xs px-1">←</button>
        <span className="text-xs text-gray-400 min-w-[2.5rem] text-center">{formatDateLabel(selectedDate)}</span>
        <button onClick={() => navigate(1)} disabled={isToday} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs px-1">→</button>
        {current && !editing && (
          <button onClick={startEdit} className="text-[11px] text-gray-400 hover:text-gray-600 ml-1">수정</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-0">

        {/* 아침 컨텍스트 */}
        {showMorningContext && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex-shrink-0">
            <p className="text-[10px] font-semibold text-amber-600 mb-1.5">어제 이어받기</p>
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{yesterday!.content}</p>
            {(linkedTasks(yesterday!).length > 0 || linkedMeetings(yesterday!).length > 0) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {linkedTasks(yesterday!).map(t => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="text-[10px] bg-white border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-100 transition-colors">
                    {t.title}
                  </Link>
                ))}
                {linkedMeetings(yesterday!).map(m => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="text-[10px] bg-white border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-100 transition-colors">
                    {m.title}
                  </Link>
                ))}
              </div>
            )}
            {/* 어제 내용 기반 오늘 시작 제안 */}
            <button
              onClick={() => {
                const suggestion = `[어제 이어서]\n${yesterday!.content.slice(0, 120)}${yesterday!.content.length > 120 ? '…' : ''}\n\n오늘: `
                setDraft(suggestion)
                setEditing(true)
              }}
              className="mt-2 text-[10px] text-amber-700 border border-amber-200 bg-white px-2 py-1 rounded hover:bg-amber-50 transition-colors"
            >
              + 이어서 오늘 회고 시작
            </button>
          </div>
        )}

        {/* 읽기 모드 */}
        {current && !editing && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{current.content}</p>
            {(linkedTasks(current).length > 0 || linkedMeetings(current).length > 0) && (
              <div className="flex flex-wrap gap-1">
                {linkedTasks(current).map(t => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-200 transition-colors">
                    {t.title}
                  </Link>
                ))}
                {linkedMeetings(current).map(m => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-200 transition-colors">
                    {m.title}
                  </Link>
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
            {saveError && (
              <p className="text-[10px] text-red-500 flex-shrink-0">{saveError}</p>
            )}
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
