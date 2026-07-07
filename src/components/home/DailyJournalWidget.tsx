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
  const TODAY = todayStr()
  const isToday = selectedDate === TODAY

  const [journals, setJournals] = useState<Record<string, DailyJournal>>({})
  const [showEditor, setShowEditor] = useState(false)
  const datePickerRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  // selectedDate의 전날 계산
  const prevDate = (() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1)
    return localDateStr(dt)
  })()

  useEffect(() => {
    setShowEditor(false)
    // selectedDate + 전날 모두 로드
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
  todayMeetings: { id: string; title: string }[]
  todos: { id: string; title: string; taskTitle?: string }[]
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
  const [todayCtx, setTodayCtx] = useState<TodayCtx>({ memos: [], todayMeetings: [], todos: [] })
  const [ctxTab, setCtxTab] = useState<'yesterday' | 'today'>('yesterday')
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
      supabaseClient.from('meetings').select('id, title').eq('meeting_date', selectedDate),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabaseClient.from('task_todos').select('id, title, tasks(title)').eq('target_date', selectedDate).eq('done', false),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]).then(([memoRes, mtgRes, todoRes]: any[]) => {
      setTodayCtx({
        memos: memoRes.data ?? [],
        todayMeetings: mtgRes.data ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        todos: (todoRes.data ?? []).map((t: any) => ({ id: t.id, title: t.title, taskTitle: t.tasks?.title })),
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
      <div className="fixed inset-0 md:inset-10 bg-white rounded-none md:rounded-2xl shadow-2xl z-[86] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0 truncate">🪴 {dateLabel} 회고</span>
          <span className="text-[10px] text-gray-300 hidden md:block whitespace-nowrap">ESC 닫기 · Ctrl+Enter 저장</span>
          <button
            onClick={doSave}
            disabled={!draft.trim() || saving}
            className="flex-shrink-0 text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        {/* 본문: 좌(어제) + 우(오늘) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

          {/* ── 좌: 어제 회고 + 오늘 컨텍스트 (탭 전환) ── */}
          {(yesterday || todayCtx.todayMeetings.length > 0 || todayCtx.todos.length > 0 || todayCtx.memos.length > 0) && (
            <div className="md:w-2/5 flex flex-col border-b md:border-b-0 md:border-r border-gray-100 min-h-0">
              {/* 탭 헤더 */}
              <div className="flex border-b border-gray-100 flex-shrink-0">
                <button
                  onClick={() => setCtxTab('yesterday')}
                  className={`flex-1 px-4 py-2.5 text-[11px] font-semibold transition-colors ${ctxTab === 'yesterday' ? 'text-gray-700 border-b-2 border-gray-400' : 'text-gray-300 hover:text-gray-500'}`}>
                  어제 회고
                </button>
                <button
                  onClick={() => setCtxTab('today')}
                  className={`flex-1 px-4 py-2.5 text-[11px] font-semibold transition-colors relative ${ctxTab === 'today' ? 'text-gray-700 border-b-2 border-gray-400' : 'text-gray-300 hover:text-gray-500'}`}>
                  {dateLabel} 컨텍스트
                  {(todayCtx.todayMeetings.length + todayCtx.todos.length + todayCtx.memos.length) > 0 && (
                    <span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1 rounded-full">
                      {todayCtx.todayMeetings.length + todayCtx.todos.length + todayCtx.memos.length}
                    </span>
                  )}
                </button>
              </div>

              {/* 탭 콘텐츠 */}
              <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide">
                {ctxTab === 'yesterday' ? (
                  yesterday ? (
                    <>
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
                    </>
                  ) : (
                    <p className="text-xs text-gray-200 italic">어제 기록 없음</p>
                  )
                ) : (
                  <div className="space-y-4">
                    {todayCtx.todayMeetings.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">💬 회의</p>
                        {todayCtx.todayMeetings.map(m => (
                          <Link key={m.id} href={`/meetings/${m.id}`}
                            className="block text-xs text-blue-500 hover:text-blue-700 truncate mb-1 transition-colors">
                            · {m.title}
                          </Link>
                        ))}
                      </div>
                    )}
                    {todayCtx.todos.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">✅ 할일</p>
                        {todayCtx.todos.map(t => (
                          <p key={t.id} className="text-xs text-gray-500 truncate mb-1">
                            · {t.title}
                            {t.taskTitle && <span className="text-gray-300 ml-1 text-[10px]">[{t.taskTitle}]</span>}
                          </p>
                        ))}
                      </div>
                    )}
                    {todayCtx.memos.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-300 tracking-wider mb-1.5">📝 메모</p>
                        {todayCtx.memos.map(m => (
                          <p key={m.id} className="text-xs text-gray-500 truncate mb-1">
                            · {m.title}
                            <span className="text-gray-300 ml-1 text-[10px]">{m.tag}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {todayCtx.todayMeetings.length === 0 && todayCtx.todos.length === 0 && todayCtx.memos.length === 0 && (
                      <p className="text-xs text-gray-200 italic">이 날 기록된 활동 없음</p>
                    )}
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
