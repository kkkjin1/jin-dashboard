'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  void tasks
  const TODAY = todayStr()
  const isToday = selectedDate === TODAY

  const [journals, setJournals] = useState<Record<string, DailyJournal>>({})
  const [showEditor, setShowEditor] = useState(false)
  const datePickerRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  const prevDate = (() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1)
    return localDateStr(dt)
  })()

  useEffect(() => {
    setShowEditor(false)
    const toLoad = [selectedDate, prevDate].filter(date => !journals[date])
    if (toLoad.length > 0) {
      supabase.from('daily_journals').select('*').in('date', toLoad)
        .then(({ data }) => {
          if (!data) return
          const map: Record<string, DailyJournal> = {}
          data.forEach(j => { map[j.date] = j as DailyJournal })
          setJournals(prev => ({ ...prev, ...map }))
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  useEffect(() => {
    const dates = Array.from({ length: 8 }, (_, i) => {
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
  const prevJournal = journals[prevDate] ?? null

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
      </div>

      {/* 본문: 세로 5:5 분할 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* 상단: 전날 회고 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-2 scrollbar-hide">
          <p className="text-[9px] font-semibold text-gray-300 tracking-wider mb-1.5 uppercase">
            {formatDateLabel(prevDate)}
          </p>
          {prevJournal ? (
            <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">{prevJournal.content}</p>
          ) : (
            <p className="text-xs text-gray-200 italic">기록 없음</p>
          )}
        </div>

        {/* 구분선 */}
        <div className="flex-shrink-0 mx-4 border-t border-gray-100" />

        {/* 하단: 오늘(selectedDate) 회고 */}
        <div className="flex-1 min-h-0 flex flex-col justify-center px-4 py-3">
          {current ? (
            <div className="flex items-start gap-2 min-h-0">
              <p className="flex-1 text-xs text-gray-600 leading-relaxed overflow-y-auto scrollbar-hide">{current.content}</p>
              <button
                onClick={() => setShowEditor(true)}
                className="flex-shrink-0 text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                수정
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowEditor(true)}
              className="w-full py-3 text-xs text-gray-400 hover:text-gray-600 transition-colors text-center rounded-lg border border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50/50">
              ✏️ {isToday ? '오늘 회고 작성하기' : '이 날 회고 작성하기'}
            </button>
          )}
        </div>
      </div>

      {/* 풀스크린 에디터 — backdrop-blur 부모에 갇히지 않도록 body에 portal */}
      {showEditor && typeof document !== 'undefined' && createPortal(
        <JournalFullscreenEditor
          selectedDate={selectedDate}
          current={current}
          yesterday={prevJournal}
          meetings={meetings}
          supabaseClient={supabase}
          onSaved={handleSaved}
          onClose={() => setShowEditor(false)}
        />,
        document.body
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

interface TodayCtx {
  memos: { id: string; title: string; tag: string }[]
  meetings: { id: string; title: string }[]
  oneOnOnes: { id: string; memberId: string; memberName?: string }[]
  updatedTasks: { id: string; title: string; status: string; agendaItemTitle?: string }[]
  taskNotes: { id: string; content: string; title?: string | null }[]
}

const TASK_STATUS_LABEL: Record<string, string> = { active: '진행중', hold: '보류', done: '완료' }
const TASK_STATUS_CLS: Record<string, string> = {
  active: 'bg-blue-50 text-blue-500',
  hold: 'bg-gray-100 text-gray-400',
  done: 'bg-green-50 text-green-500',
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
  const [todayCtx, setTodayCtx] = useState<TodayCtx>({ memos: [], meetings: [], oneOnOnes: [], updatedTasks: [], taskNotes: [] })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const meetingSearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    const dayStart = selectedDate + 'T00:00:00'
    const dayEnd = selectedDate + 'T23:59:59'
    Promise.all([
      supabaseClient.from('quick_memos').select('id, title, tag').gte('created_at', dayStart).lte('created_at', dayEnd),
      supabaseClient.from('project_meetings').select('id, title').eq('meeting_date', selectedDate),
      supabaseClient.from('one_on_ones').select('id, member_id, members(name)').eq('session_date', selectedDate),
      supabaseClient.from('agenda_sub_tasks')
        .select('id, title, status, agenda_items(title)')
        .gte('updated_at', dayStart)
        .lte('updated_at', dayEnd),
      supabaseClient.from('sub_task_notes')
        .select('id, content, title')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]).then(([memoRes, mtgRes, oonRes, doneRes, notesRes]: any[]) => {
      setTodayCtx({
        memos: memoRes.data ?? [],
        meetings: mtgRes.data ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oneOnOnes: (oonRes.data ?? []).map((o: any) => ({
          id: o.id, memberId: o.member_id, memberName: o.members?.name,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updatedTasks: (doneRes.data ?? []).map((t: any) => ({
          id: t.id, title: t.title, status: t.status, agendaItemTitle: t.agenda_items?.title,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        taskNotes: (notesRes.data ?? []).map((n: any) => ({
          id: n.id, content: n.content, title: n.title ?? null,
        })),
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

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

  const dateLabel = formatDateLabel(selectedDate)
  const totalActivity = todayCtx.memos.length + todayCtx.meetings.length + todayCtx.oneOnOnes.length + todayCtx.updatedTasks.length + todayCtx.taskNotes.length

  return (
    <>
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 bg-black/40 z-[85]" onClick={onClose} />

      {/* 풀스크린 카드 */}
      <div className="fixed inset-0 md:inset-10 bg-white rounded-none md:rounded-2xl shadow-2xl z-[86] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0 truncate">🪴 {dateLabel} 회고</span>
          <span className="text-[10px] text-gray-300 hidden md:block whitespace-nowrap">ESC 닫기 · Ctrl+Enter 저장</span>
          <button
            onClick={doSave}
            disabled={!draft.trim() || saving}
            className="flex-shrink-0 text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg hover:bg-[#D5E6F7] disabled:opacity-40 transition-colors"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        {/* 본문: 좌(작성) + 우(오늘 활동) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

          {/* ── 좌: 어제 회고(compact) + 오늘 작성 ── */}
          <div className="flex-1 md:w-1/2 flex flex-col min-h-0 overflow-hidden">

            {/* 어제 회고 — 상단 compact 표시 */}
            {yesterday && (
              <div className="flex-shrink-0 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1 uppercase">어제 회고</p>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">{yesterday.content}</p>
              </div>
            )}

            {/* 오늘 작성 영역 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
              <p className="text-[11px] font-semibold text-gray-400 flex-shrink-0">{dateLabel} 회고 작성</p>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="오늘 뭐했고, 어떤 고민이 있었는지, 어떤 진전이 있었는지 자유롭게…"
                className="flex-1 text-sm text-gray-700 placeholder:text-gray-300 resize-none focus:outline-none leading-relaxed min-h-[200px] bg-transparent w-full"
              />

              {/* @ 회의 연결 + # 태그 */}
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

          {/* ── 우: 오늘 활동 피드 ── */}
          <div className="md:w-1/2 flex flex-col border-t md:border-t-0 md:border-l border-gray-100 min-h-0 bg-gray-50/40">
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 flex items-center gap-2">
              <p className="text-[11px] font-semibold text-gray-500 flex-1">{dateLabel} 활동</p>
              {totalActivity > 0 && (
                <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-medium">{totalActivity}</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-hide">

              {todayCtx.meetings.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">💬 회의록</p>
                  {todayCtx.meetings.map(m => (
                    <Link key={m.id} href={`/meetings/${m.id}`}
                      className="block text-xs text-blue-500 hover:text-blue-700 truncate mb-1 transition-colors">
                      · {m.title}
                    </Link>
                  ))}
                </div>
              )}

              {todayCtx.oneOnOnes.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">👥 1on1</p>
                  {todayCtx.oneOnOnes.map(o => (
                    <Link key={o.id} href={`/one-on-one/${o.memberId}/${o.id}`}
                      className="block text-xs text-purple-500 hover:text-purple-700 truncate mb-1 transition-colors">
                      · {o.memberName ?? '1on1 세션'}
                    </Link>
                  ))}
                </div>
              )}

              {todayCtx.memos.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">📝 메모</p>
                  {todayCtx.memos.map(m => (
                    <div key={m.id} className="flex items-baseline gap-1 mb-1">
                      <span className="text-xs text-gray-500 truncate">· {m.title}</span>
                      {m.tag && <span className="text-[10px] text-gray-300 flex-shrink-0">{m.tag}</span>}
                    </div>
                  ))}
                </div>
              )}

              {todayCtx.updatedTasks.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">📋 프로젝트 업무</p>
                  {todayCtx.updatedTasks.map(t => (
                    <div key={t.id} className="mb-1.5 flex items-start gap-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${TASK_STATUS_CLS[t.status] ?? 'bg-gray-100 text-gray-400'}`}>
                        {TASK_STATUS_LABEL[t.status] ?? t.status}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500 truncate">{t.title}</p>
                        {t.agendaItemTitle && (
                          <p className="text-[10px] text-gray-300">[{t.agendaItemTitle}]</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {todayCtx.taskNotes.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">💡 업무 노트</p>
                  {todayCtx.taskNotes.map(n => (
                    <p key={n.id} className="text-xs text-gray-500 mb-1 line-clamp-2 leading-relaxed">
                      · {n.title || n.content.slice(0, 60)}
                    </p>
                  ))}
                </div>
              )}

              {totalActivity === 0 && (
                <p className="text-xs text-gray-200 italic text-center py-8">이 날 기록된 활동 없음</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
