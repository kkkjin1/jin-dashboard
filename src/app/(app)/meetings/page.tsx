'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'

const CATEGORIES = ['전체', '코어', '비즈', '경영진', '본부장', '타팀', '목표관리'] as const
const KANBAN_COL_STYLE: Record<string, { header: string; bg: string }> = {
  '코어':   { header: 'bg-emerald-50 border-emerald-200 text-emerald-700', bg: 'bg-emerald-50/40 border-emerald-100' },
  '비즈':   { header: 'bg-amber-50 border-amber-200 text-amber-700',       bg: 'bg-amber-50/40 border-amber-100' },
  '경영진': { header: 'bg-slate-100 border-slate-200 text-slate-600',      bg: 'bg-slate-50/60 border-slate-100' },
  '본부장': { header: 'bg-blue-50 border-blue-200 text-blue-700',          bg: 'bg-blue-50/40 border-blue-100' },
  '타팀':   { header: 'bg-gray-100 border-gray-200 text-gray-600',         bg: 'bg-gray-50 border-gray-200' },
  '목표관리': { header: 'bg-indigo-50 border-indigo-200 text-indigo-700',  bg: 'bg-indigo-50/40 border-indigo-100' },
  '기타':   { header: 'bg-white border-gray-200 text-gray-500',            bg: 'bg-white border-gray-100' },
}
const CATEGORY_COLORS: Record<string, string> = {
  '코어': 'bg-[#ECFDF5] text-[#10B981] border-[#10B981]/20',
  '비즈': 'bg-amber-50 text-[#F4A35A] border-[#F4A35A]/20',
  '경영진': 'bg-[#1C2B3A]/5 text-[#1C2B3A] border-[#1C2B3A]/15',
  '본부장': 'bg-slate-100 text-slate-500 border-slate-200',
  '타팀': 'bg-gray-50 text-gray-500 border-gray-200',
  '목표관리': 'bg-indigo-50 text-indigo-600 border-indigo-200',
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [expandedMeetingIds, setExpandedMeetingIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban')
  const [addingInColMeeting, setAddingInColMeeting] = useState<string | null>(null)
  const [newColTitle, setNewColTitle] = useState('')
  const [collapsedColMonths, setCollapsedColMonths] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('meetings').select('*').order('meeting_date', { ascending: false, nullsFirst: false })
      .then(({ data }) => { setMeetings((data ?? []) as Meeting[]); setLoading(false) })
  }, [])

  async function handleAdd() {
    if (!newTitle.trim()) { setAdding(false); return }
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase.from('meetings')
      .insert({ title: newTitle.trim(), meeting_date: today, notes: [] }).select().single()
    if (data) {
      setNewTitle(''); setAdding(false)
      router.push(`/meetings/${(data as Meeting).id}`)
    }
  }

  async function deleteChecked() {
    if (checkedIds.size === 0) return
    if (!confirm(`선택한 ${checkedIds.size}개 회의록을 삭제하시겠습니까?`)) return
    await supabase.from('meetings').delete().in('id', Array.from(checkedIds))
    setMeetings(prev => prev.filter(m => !checkedIds.has(m.id)))
    setCheckedIds(new Set())
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleCheckAll(ids: string[]) {
    const allChecked = ids.length > 0 && ids.every(id => checkedIds.has(id))
    setCheckedIds(prev => {
      const s = new Set(prev)
      if (allChecked) ids.forEach(id => s.delete(id)); else ids.forEach(id => s.add(id))
      return s
    })
  }

  function toggleMonth(key: string) {
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  function toggleExpand(id: string) {
    setExpandedMeetingIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleColMonth(key: string) {
    setCollapsedColMonths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  async function handleColAdd(cat: string) {
    if (!newColTitle.trim()) { setAddingInColMeeting(null); setNewColTitle(''); return }
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase.from('meetings')
      .insert({ title: newColTitle.trim(), meeting_date: today, notes: [], ...(cat !== '기타' ? { category: cat } : {}) }).select().single()
    if (data) {
      setNewColTitle('')
      setAddingInColMeeting(null)
      router.push(`/meetings/${(data as Meeting).id}`)
    }
  }

  const filtered = meetings

  const grouped = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    filtered.forEach(m => {
      const ym = m.meeting_date ? m.meeting_date.slice(0, 7) : '날짜 없음'
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym)!.push(m)
    })
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const kanbanGroups = useMemo(() => {
    const allKanbanCats = [...CATEGORIES.slice(1), '기타'] as string[]
    const result: Record<string, Meeting[]> = {}
    allKanbanCats.forEach(cat => { result[cat] = [] })
    filtered.forEach(m => {
      const cat = (m.category && (CATEGORIES.slice(1) as readonly string[]).includes(m.category)) ? m.category : '기타'
      result[cat].push(m)
    })
    allKanbanCats.forEach(cat => result[cat].sort((a, b) => (b.meeting_date ?? '').localeCompare(a.meeting_date ?? '')))
    return result
  }, [filtered])

  const kanbanCols = [...CATEGORIES.slice(1), '기타'] as string[]

  return (
    <div className={viewMode === 'kanban' ? 'p-4 md:p-8' : 'p-4 md:p-8 max-w-3xl'}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">회의록</h1>
        <div className="flex gap-2 items-center">
          {/* 뷰 모드 토글 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              title="리스트 보기"
              className={`px-2.5 py-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              ≡
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="칸반 보기"
              className={`px-2.5 py-1.5 text-sm transition-colors ${viewMode === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              ⊞
            </button>
          </div>
          {checkedIds.size > 0 && (
            <button onClick={deleteChecked}
              className="text-sm bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors">
              {checkedIds.size}개 삭제
            </button>
          )}
          <button onClick={() => setAdding(true)}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            + 새 회의록
          </button>
        </div>
      </div>

      {/* 빠른 추가 */}
      {adding && (
        <div className="bg-white rounded-xl border border-blue-200 px-4 py-3 mb-4">
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
            onBlur={handleAdd}
            placeholder="회의 제목 입력 후 엔터"
            className="w-full text-sm focus:outline-none text-gray-700" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-16 animate-pulse" />)}</div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">회의록이 없습니다</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-4">
          {grouped.map(([ym, list]) => {
            const isCollapsed = collapsedMonths.has(ym)
            return (
              <div key={ym}>
                <button onClick={() => toggleMonth(ym)}
                  className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                  <span>{isCollapsed ? '▶' : '▼'}</span>
                  <span>{ym === '날짜 없음' ? '날짜 미지정' : formatMonthLabel(ym)}</span>
                  <span className="font-normal text-gray-400">({list.length}건)</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2">
                    {list.map(meeting => {
                      const isExpanded = expandedMeetingIds.has(meeting.id)
                      return (
                        <div key={meeting.id} className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors overflow-hidden">
                          <div className="px-4 py-3 flex items-center gap-3">
                            <input type="checkbox" checked={checkedIds.has(meeting.id)}
                              onChange={() => toggleCheck(meeting.id)}
                              onClick={e => e.stopPropagation()}
                              className="w-3 h-3 rounded accent-gray-700 flex-shrink-0 cursor-pointer" />
                            <Link href={`/meetings/${meeting.id}`} className="flex-1 flex items-center justify-between min-w-0">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-800">{meeting.title}</p>
                                  {meeting.category && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${CATEGORY_COLORS[meeting.category] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                      {meeting.category}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {meeting.meeting_date && (
                                    <span className="text-xs text-gray-400">{format(parseISO(meeting.meeting_date), 'M월 d일', { locale: ko })}</span>
                                  )}
                                  <span className="text-xs text-gray-300">{meeting.notes.length}개 노트</span>
                                </div>
                              </div>
                              <span className="text-xs text-gray-300 flex-shrink-0">{format(parseISO(meeting.created_at), 'M/d', { locale: ko })}</span>
                            </Link>
                            {meeting.notes.length > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleExpand(meeting.id) }}
                                className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                title={isExpanded ? '노트 접기' : '노트 펼치기'}>
                                <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                              </button>
                            )}
                          </div>
                          {isExpanded && meeting.notes.length > 0 && (
                            <div className="border-t border-gray-50 px-4 pt-2 pb-3 space-y-2">
                              {meeting.notes.map((note, i) => (
                                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                                  {note.title && (
                                    <p className="text-xs font-semibold text-gray-600 mb-0.5">{note.title}</p>
                                  )}
                                  {note.content && (
                                    <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* 칸반 뷰 */
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pb-4">
          {kanbanCols.map(cat => {
            const colMeetings = kanbanGroups[cat]
            // 월별 그룹핑
            const monthGroups = (() => {
              const map = new Map<string, typeof colMeetings>()
              colMeetings.forEach(m => {
                const ym = m.meeting_date ? m.meeting_date.slice(0, 7) : '날짜없음'
                if (!map.has(ym)) map.set(ym, [])
                map.get(ym)!.push(m)
              })
              return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
            })()
            return (
              <div key={cat} className={`min-w-0 rounded-xl border p-3 ${KANBAN_COL_STYLE[cat]?.bg ?? 'bg-white border-gray-100'}`}>
                {/* 컬럼 헤더 — A 스타일 버튼형 */}
                <div className={`flex items-center justify-between py-2.5 px-3 rounded-xl border mb-3 ${KANBAN_COL_STYLE[cat]?.header ?? 'bg-white border-gray-200 text-gray-700'}`}>
                  <div className="flex items-center gap-2">
                    {colMeetings.length > 0 && (
                      <input type="checkbox"
                        checked={colMeetings.every(m => checkedIds.has(m.id))}
                        onChange={() => toggleCheckAll(colMeetings.map(m => m.id))}
                        onClick={e => e.stopPropagation()}
                        className="w-3 h-3 rounded accent-gray-600 cursor-pointer flex-shrink-0"
                        title="전체 선택" />
                    )}
                    <span className="text-sm font-semibold">{cat}</span>
                  </div>
                  <span className="text-xs text-gray-400">{colMeetings.length}</span>
                </div>
                <div className="space-y-1">
                  {colMeetings.length === 0 && addingInColMeeting !== cat ? (
                    <p className="text-xs text-gray-300 text-center py-8 bg-gray-50/60 rounded-xl border border-dashed border-gray-100">없음</p>
                  ) : (
                    monthGroups.map(([ym, list]) => {
                      const monthKey = `${cat}-${ym}`
                      const isCollapsed = collapsedColMonths.has(monthKey)
                      const label = ym === '날짜없음' ? '날짜 없음' : (() => {
                        const [y, m] = ym.split('-')
                        return `${y}.${parseInt(m)}`
                      })()
                      return (
                        <div key={ym} className="mb-1">
                          <button onClick={() => toggleColMonth(monthKey)}
                            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 w-full py-1 px-1 rounded transition-colors">
                            <span className="text-[9px]">{isCollapsed ? '▶' : '▼'}</span>
                            <span>{label}</span>
                            <span className="text-gray-300">({list.length})</span>
                          </button>
                          {!isCollapsed && (
                            <div className="space-y-1.5 mt-1">
                              {list.map(meeting => (
                                <div key={meeting.id} className={`bg-white rounded-xl border hover:shadow-sm transition-all ${checkedIds.has(meeting.id) ? 'border-[#10B981]/40 bg-[#ECFDF5]/20' : 'border-gray-200 hover:border-[#10B981]/40'}`}>
                                  <div className="flex items-start gap-2 px-3 py-3">
                                    <input type="checkbox" checked={checkedIds.has(meeting.id)}
                                      onChange={() => toggleCheck(meeting.id)}
                                      className="w-3 h-3 mt-0.5 rounded accent-gray-700 flex-shrink-0 cursor-pointer" />
                                    <Link href={`/meetings/${meeting.id}`} className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-800 line-clamp-2 mb-1.5">{meeting.title}</p>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {meeting.meeting_date && (
                                          <span className="text-xs text-gray-400">{format(parseISO(meeting.meeting_date), 'M.d', { locale: ko })}</span>
                                        )}
                                        {meeting.notes.length > 0 && (
                                          <span className="text-xs text-gray-300 ml-auto">{meeting.notes.length}개 노트</span>
                                        )}
                                      </div>
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                  {addingInColMeeting === cat ? (
                    <div className="bg-white rounded-xl border border-[#10B981]/40 px-3 py-2.5 shadow-sm mt-2">
                      <input autoFocus value={newColTitle} onChange={e => setNewColTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleColAdd(cat); if (e.key === 'Escape') { setAddingInColMeeting(null); setNewColTitle('') } }}
                        onBlur={() => { if (newColTitle.trim()) handleColAdd(cat); else { setAddingInColMeeting(null); setNewColTitle('') } }}
                        placeholder="회의 제목 입력 후 Enter"
                        className="w-full text-sm focus:outline-none text-gray-700" />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingInColMeeting(cat)}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-lg transition-colors mt-1">
                      + 회의록 추가
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
