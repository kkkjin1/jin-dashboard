'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/types'

interface MeetingMin { id: string; title: string; meeting_date?: string | null }

export interface DailyJournal {
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
  newTasks: { id: string; title: string; status: string; agendaItemTitle?: string }[]
  taskNotes: { id: string; content: string; title?: string | null; subTaskTitle?: string; agendaItemTitle?: string }[]
}

const TASK_STATUS_LABEL: Record<string, string> = { active: '진행중', hold: '보류', done: '완료' }

// ── 회고 섹션 ────────────────────────────────────────────────────────
const SECTION_KEYS = ['done','insight','challenge','tomorrow','good','grateful','meal','general'] as const
type SectionKey = typeof SECTION_KEYS[number]
const SECTION_META: Record<SectionKey, { emoji: string; label: string; ph: string; rows: number }> = {
  done:      { emoji: '✅', label: '완료한 것',  ph: '오늘 완료한 업무…',       rows: 3 },
  insight:   { emoji: '💡', label: '인사이트',   ph: '배운 것, 발견한 것…',      rows: 3 },
  challenge: { emoji: '🔥', label: '힘들었던 것', ph: '막힌 것, 어려웠던 점…',   rows: 3 },
  tomorrow:  { emoji: '🎯', label: '내일 집중',  ph: '가장 중요한 한 가지…',     rows: 3 },
  good:      { emoji: '😊', label: '좋았던 일',  ph: '오늘 가장 좋았던 것…',     rows: 2 },
  grateful:  { emoji: '🙏', label: '감사한 일',  ph: '',                        rows: 2 },
  meal:      { emoji: '🍽️', label: '식사',       ph: '',                        rows: 1 },
  general:   { emoji: '📝', label: '일반',       ph: '기타 메모…',               rows: 3 },
}
function parseSections(content: string): Record<SectionKey, string> {
  const empty = Object.fromEntries(SECTION_KEYS.map(k => [k, ''])) as Record<SectionKey, string>
  if (!content) return empty
  if (!content.includes('## ')) { return { ...empty, general: content } }
  const map: Record<string, SectionKey> = {
    '완료한 것': 'done', '인사이트': 'insight', '힘들었던 것': 'challenge', '내일 집중': 'tomorrow',
    '좋았던 일': 'good', '감사한 일': 'grateful', '식사': 'meal', '일반': 'general',
  }
  const parts = content.split(/^## /m)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const header = part.slice(0, nl).trim()
    const body = part.slice(nl + 1).trim()
    const key = map[header]
    if (key) empty[key] = body
  }
  return empty
}
function serializeSections(s: Record<SectionKey, string>): string {
  return (SECTION_KEYS as readonly SectionKey[])
    .filter(k => s[k].trim())
    .map(k => `## ${SECTION_META[k].label}\n${s[k].trim()}`)
    .join('\n\n')
}
const TASK_STATUS_CLS: Record<string, string> = {
  active: 'bg-blue-50 text-blue-500',
  hold: 'bg-gray-100 text-gray-400',
  done: 'bg-green-50 text-green-500',
}

export function JournalFullscreenEditor({ selectedDate, current, yesterday, meetings, supabaseClient, onSaved, onClose }: EditorProps) {
  const [sections, setSections] = useState<Record<SectionKey, string>>(() => parseSections(current?.content ?? ''))
  const [lunch, setLunch] = useState(() => {
    const m = (current?.content ?? '').match(/점심[:\s]+([^\n]+)/)
    return m ? m[1].trim() : ''
  })
  const [dinner, setDinner] = useState(() => {
    const m = (current?.content ?? '').match(/저녁[:\s]+([^\n]+)/)
    return m ? m[1].trim() : ''
  })

  function updateSection(key: SectionKey, value: string) {
    setSections(prev => {
      const next = { ...prev, [key]: value }
      const meal = [lunch && `점심: ${lunch}`, dinner && `저녁: ${dinner}`].filter(Boolean).join('\n')
      next.meal = meal
      const serialized = serializeSections(next)
      setDraft(serialized)
      return next
    })
  }
  function updateMeal(type: 'lunch' | 'dinner', value: string) {
    const newLunch = type === 'lunch' ? value : lunch
    const newDinner = type === 'dinner' ? value : dinner
    if (type === 'lunch') setLunch(value); else setDinner(value)
    setSections(prev => {
      const meal = [newLunch && `점심: ${newLunch}`, newDinner && `저녁: ${newDinner}`].filter(Boolean).join('\n')
      const next = { ...prev, meal }
      setDraft(serializeSections(next))
      return next
    })
  }

  const [draft, setDraft] = useState(() => serializeSections(parseSections(current?.content ?? '')) || (current?.content ?? ''))
  const [linkedMeetingIds, setLinkedMeetingIds] = useState<string[]>(current?.linked_meeting_ids ?? [])
  const [tags, setTags] = useState<string[]>(current?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [meetingSearch, setMeetingSearch] = useState('')
  const [showMeetingPicker, setShowMeetingPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [todayCtx, setTodayCtx] = useState<TodayCtx>({ memos: [], meetings: [], oneOnOnes: [], newTasks: [], taskNotes: [] })
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
        .select('id, title, status, agenda_item_id, agenda_items(title)')
        .gte('updated_at', dayStart)
        .lte('updated_at', dayEnd),
      supabaseClient.from('sub_task_notes')
        .select('id, content, title, agenda_sub_tasks(title, agenda_items(title))')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
      supabaseClient.from('agenda_updates')
        .select('agenda_item_id')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]).then(([memoRes, mtgRes, oonRes, newTaskRes, notesRes, agendaUpdateRes]: any[]) => {
      const meetingItemIds = new Set((agendaUpdateRes.data ?? []).map((u: any) => u.agenda_item_id))
      setTodayCtx({
        memos: memoRes.data ?? [],
        meetings: mtgRes.data ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oneOnOnes: (oonRes.data ?? []).map((o: any) => ({
          id: o.id, memberId: o.member_id, memberName: o.members?.name,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newTasks: (newTaskRes.data ?? []).filter((t: any) => !meetingItemIds.has(t.agenda_item_id)).map((t: any) => ({
          id: t.id, title: t.title, status: t.status, agendaItemTitle: t.agenda_items?.title,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        taskNotes: (notesRes.data ?? []).map((n: any) => ({
          id: n.id, content: n.content, title: n.title ?? null,
          subTaskTitle: n.agenda_sub_tasks?.title,
          agendaItemTitle: n.agenda_sub_tasks?.agenda_items?.title,
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
  const totalActivity = todayCtx.memos.length + todayCtx.meetings.length + todayCtx.oneOnOnes.length + todayCtx.newTasks.length + todayCtx.taskNotes.length

  const D = {
    bg:      '#0F1319',
    surface: 'rgba(255,255,255,0.03)',
    border:  'rgba(255,255,255,0.08)',
    divider: 'rgba(255,255,255,0.06)',
    t1:      'rgba(226,232,240,0.85)',
    t2:      'rgba(226,232,240,0.55)',
    t3:      'rgba(226,232,240,0.3)',
  }

  return (
    <>
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 bg-black/60 z-[85]" onClick={onClose} />

      {/* 풀스크린 카드 */}
      <div className="fixed inset-0 md:inset-10 rounded-none md:rounded-2xl shadow-2xl z-[86] flex flex-col overflow-hidden"
        style={{ background: D.bg, border: `1px solid ${D.border}` }}>

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${D.border}` }}>
          <span className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: D.t1 }}>🪴 {dateLabel} 회고</span>
          <span className="text-[10px] hidden md:block whitespace-nowrap" style={{ color: D.t3 }}>ESC 닫기 · Ctrl+Enter 저장</span>
          <button
            onClick={doSave}
            disabled={!draft.trim() || saving}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
            style={{ background: 'rgba(79,141,255,0.15)', color: '#7EB3FF', border: '1px solid rgba(79,141,255,0.3)' }}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          <button onClick={onClose} className="flex-shrink-0 text-xl leading-none px-1 transition-colors"
            style={{ color: D.t3 }}
            onMouseEnter={e => (e.currentTarget.style.color = D.t1)}
            onMouseLeave={e => (e.currentTarget.style.color = D.t3)}>×</button>
        </div>

        {/* 본문: 좌(작성) + 우(오늘 활동) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

          {/* ── 좌: 어제 회고(compact) + 오늘 작성 ── */}
          <div className="flex-1 md:w-1/2 flex flex-col min-h-0 overflow-hidden">

            {/* 어제 회고 — 상단 compact 표시 */}
            {yesterday && (
              <div className="flex-shrink-0 px-5 py-2.5" style={{ borderBottom: `1px solid ${D.border}`, background: D.surface }}>
                <p className="text-[10px] font-semibold tracking-wider mb-1 uppercase" style={{ color: D.t3 }}>어제 회고</p>
                <p className="text-xs leading-relaxed line-clamp-3 whitespace-pre-wrap" style={{ color: D.t2 }}>{yesterday.content}</p>
              </div>
            )}

            {/* 오늘 작성 영역 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
              <p className="text-[11px] font-semibold flex-shrink-0" style={{ color: D.t3 }}>{dateLabel} 회고</p>

              {/* ── 업무 회고 (2×2) ── */}
              <div className="flex-shrink-0">
                <p className="text-[9px] font-semibold tracking-wider mb-1.5 uppercase" style={{ color: D.t3 }}>업무</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['done','insight','challenge','tomorrow'] as SectionKey[]).map(key => {
                    const m = SECTION_META[key]
                    return (
                      <div key={key} className="flex flex-col gap-2 rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="flex items-center gap-1.5 pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          <span style={{ fontSize: 13, lineHeight: 1 }}>{m.emoji}</span>
                          <span className="text-[10px] font-semibold tracking-wide" style={{ color: 'rgba(226,232,240,0.7)' }}>{m.label}</span>
                        </div>
                        <textarea ref={key === 'done' ? textareaRef : undefined}
                          rows={m.rows} value={sections[key]}
                          onChange={e => updateSection(key, e.target.value)}
                          placeholder={m.ph}
                          className="resize-none focus:outline-none bg-transparent text-[12px] leading-relaxed w-full placeholder:opacity-30"
                          style={{ color: D.t1 }} />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── 개인 회고 ── */}
              <div className="flex-shrink-0">
                <p className="text-[9px] font-semibold tracking-wider mb-1.5 uppercase" style={{ color: D.t3 }}>개인</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['good','grateful'] as SectionKey[]).map(key => {
                    const m = SECTION_META[key]
                    return (
                      <div key={key} className="flex flex-col gap-2 rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="flex items-center gap-1.5 pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          <span style={{ fontSize: 13, lineHeight: 1 }}>{m.emoji}</span>
                          <span className="text-[10px] font-semibold tracking-wide" style={{ color: 'rgba(226,232,240,0.7)' }}>{m.label}</span>
                        </div>
                        <textarea rows={m.rows} value={sections[key]}
                          onChange={e => updateSection(key, e.target.value)}
                          placeholder={m.ph}
                          className="resize-none focus:outline-none bg-transparent text-[12px] leading-relaxed w-full placeholder:opacity-30"
                          style={{ color: D.t1 }} />
                      </div>
                    )
                  })}
                </div>

                {/* 식사 */}
                <div className="mt-2 rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-1.5 pb-1.5 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>🍽️</span>
                    <span className="text-[10px] font-semibold tracking-wide" style={{ color: 'rgba(226,232,240,0.7)' }}>식사</span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[10px]" style={{ color: D.t3 }}>점심</span>
                    <input value={lunch} onChange={e => updateMeal('lunch', e.target.value)}
                      placeholder="—" className="flex-1 min-w-0 focus:outline-none bg-transparent text-[12px]" style={{ color: D.t1 }} />
                    <span className="text-[10px]" style={{ color: D.t3 }}>저녁</span>
                    <input value={dinner} onChange={e => updateMeal('dinner', e.target.value)}
                      placeholder="—" className="flex-1 min-w-0 focus:outline-none bg-transparent text-[12px]" style={{ color: D.t1 }} />
                  </div>
                </div>
              </div>

              {/* ── 일반 ── */}
              <div className="flex flex-col gap-2 rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-1.5 pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>📝</span>
                  <span className="text-[10px] font-semibold tracking-wide" style={{ color: 'rgba(226,232,240,0.7)' }}>일반</span>
                </div>
                <textarea rows={3} value={sections.general}
                  onChange={e => updateSection('general', e.target.value)}
                  placeholder="기타 메모…"
                  className="resize-none focus:outline-none bg-transparent text-[12px] leading-relaxed w-full placeholder:opacity-30"
                  style={{ color: D.t1 }} />
              </div>

              {/* @ 회의 연결 + # 태그 */}
              <div className="flex-shrink-0 pt-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${D.divider}` }}>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {linkedMeetingIds.map(mid => {
                    const m = meetings.find(x => x.id === mid)
                    return m ? (
                      <span key={mid} className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(79,141,255,0.12)', color: '#7EB3FF', border: '1px solid rgba(79,141,255,0.25)' }}>
                        @ {m.title}
                        <button onClick={() => setLinkedMeetingIds(prev => prev.filter(i => i !== mid))}
                          className="ml-0.5" style={{ color: 'rgba(126,179,255,0.6)' }}>×</button>
                      </span>
                    ) : null
                  })}
                  <button onClick={() => setShowMeetingPicker(p => !p)}
                    className="text-[11px] transition-colors" style={{ color: D.t3 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#7EB3FF')}
                    onMouseLeave={e => (e.currentTarget.style.color = D.t3)}>
                    @ 회의 연결
                  </button>
                </div>

                {showMeetingPicker && (
                  <div className="rounded-xl p-3 flex flex-col gap-1 max-h-48 overflow-y-auto"
                    style={{ background: '#1A2030', border: `1px solid ${D.border}` }}>
                    <input ref={meetingSearchRef} value={meetingSearch}
                      onChange={e => setMeetingSearch(e.target.value)}
                      placeholder="회의 검색…"
                      className="text-sm pb-2 mb-1 focus:outline-none bg-transparent"
                      style={{ color: D.t1, borderBottom: `1px solid ${D.divider}` }} />
                    {filteredMeetings.length === 0
                      ? <p className="text-xs py-2 text-center" style={{ color: D.t3 }}>검색 결과 없음</p>
                      : filteredMeetings.map(m => (
                        <button key={m.id} onClick={() => linkMeeting(m.id)}
                          className="text-left text-sm px-2 py-1.5 rounded-lg truncate transition-colors"
                          style={{ color: D.t2 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          {m.title}
                          {m.meeting_date && <span className="ml-1.5 text-xs" style={{ color: D.t3 }}>{m.meeting_date}</span>}
                        </button>
                      ))
                    }
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 items-center">
                  {tags.map(t => (
                    <span key={t} className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.07)', color: D.t2, border: `1px solid ${D.border}` }}>
                      #{t}
                      <button onClick={() => setTags(prev => prev.filter(x => x !== t))}
                        className="ml-0.5" style={{ color: D.t3 }}>×</button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value.replace(/\s/g, ''))}
                    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    placeholder="# 태그"
                    className="text-[11px] focus:outline-none w-16 bg-transparent"
                    style={{ color: D.t2 }}
                  />
                </div>

                {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              </div>
            </div>
          </div>

          {/* ── 우: 오늘 활동 피드 (고정 섹션) ── */}
          <div className="md:w-1/2 flex flex-col border-t md:border-t-0 md:border-l border-[rgba(255,255,255,0.08)] min-h-0" style={{ background: D.surface }}>
            <div className="px-4 py-3 flex-shrink-0 flex items-center gap-2" style={{ borderBottom: `1px solid ${D.border}` }}>
              <p className="text-[11px] font-semibold flex-1" style={{ color: D.t2 }}>{dateLabel} 활동</p>
              {totalActivity > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#A78BFA' }}>{totalActivity}</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ borderTop: `1px solid ${D.divider}` }}>

              {/* 회의록 */}
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${D.divider}` }}>
                <p className="text-[10px] font-semibold tracking-wider mb-2" style={{ color: D.t3 }}>💬 회의록</p>
                {todayCtx.meetings.length > 0 ? todayCtx.meetings.map(m => (
                  <Link key={m.id} href={`/meetings/${m.id}`}
                    className="block text-[13px] truncate mb-1.5 transition-colors"
                    style={{ color: '#7EB3FF' }}>
                    · {m.title}
                  </Link>
                )) : <p className="text-[12px]" style={{ color: D.t3 }}>—</p>}
              </div>

              {/* 1on1 */}
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${D.divider}` }}>
                <p className="text-[10px] font-semibold tracking-wider mb-2" style={{ color: D.t3 }}>👥 1on1</p>
                {todayCtx.oneOnOnes.length > 0 ? todayCtx.oneOnOnes.map(o => (
                  <Link key={o.id} href={`/one-on-one/${o.memberId}/${o.id}`}
                    className="block text-[13px] truncate mb-1.5 transition-colors"
                    style={{ color: '#A78BFA' }}>
                    · {o.memberName ?? '1on1 세션'}
                  </Link>
                )) : <p className="text-[12px]" style={{ color: D.t3 }}>—</p>}
              </div>

              {/* 메모 */}
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${D.divider}` }}>
                <p className="text-[10px] font-semibold tracking-wider mb-2" style={{ color: D.t3 }}>📝 메모</p>
                {todayCtx.memos.length > 0 ? todayCtx.memos.map(m => (
                  <div key={m.id} className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-[13px] truncate" style={{ color: D.t1 }}>· {m.title}</span>
                    {m.tag && <span className="text-[11px] flex-shrink-0" style={{ color: D.t3 }}>{m.tag}</span>}
                  </div>
                )) : <p className="text-[12px]" style={{ color: D.t3 }}>—</p>}
              </div>

              {/* 프로젝트 업무 */}
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${D.divider}` }}>
                <p className="text-[10px] font-semibold tracking-wider mb-2" style={{ color: D.t3 }}>📋 프로젝트 업무</p>
                {todayCtx.newTasks.length > 0 ? todayCtx.newTasks.map(t => (
                  <div key={t.id} className="mb-2 flex items-start gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${TASK_STATUS_CLS[t.status] ?? 'bg-gray-100 text-gray-400'}`}>
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] truncate" style={{ color: D.t1 }}>{t.title}</p>
                      {t.agendaItemTitle && (
                        <p className="text-[11px]" style={{ color: D.t3 }}>[{t.agendaItemTitle}]</p>
                      )}
                    </div>
                  </div>
                )) : <p className="text-[12px]" style={{ color: D.t3 }}>—</p>}
              </div>

              {/* 업무 노트 */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold tracking-wider mb-2" style={{ color: D.t3 }}>💡 업무 노트</p>
                {todayCtx.taskNotes.length > 0 ? todayCtx.taskNotes.map(n => (
                  <div key={n.id} className="mb-2.5">
                    {(n.subTaskTitle || n.agendaItemTitle) && (
                      <p className="text-[11px] mb-0.5" style={{ color: D.t3 }}>
                        {n.agendaItemTitle && `[${n.agendaItemTitle}] `}{n.subTaskTitle}
                      </p>
                    )}
                    <p className="text-[13px] line-clamp-2 leading-relaxed" style={{ color: D.t2 }}>
                      · {n.title || n.content.slice(0, 80)}
                    </p>
                  </div>
                )) : <p className="text-[12px]" style={{ color: D.t3 }}>—</p>}
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  )
}
