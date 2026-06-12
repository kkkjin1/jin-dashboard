'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'

const CATEGORIES = ['전체', '코어', '비즈', '경영진', '본부장', '타팀'] as const
const CATEGORY_COLORS: Record<string, string> = {
  '코어': 'bg-indigo-50 text-indigo-600 border-indigo-200',
  '비즈': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  '경영진': 'bg-red-50 text-red-600 border-red-200',
  '본부장': 'bg-purple-50 text-purple-600 border-purple-200',
  '타팀': 'bg-gray-50 text-gray-500 border-gray-200',
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
  const [categoryFilter, setCategoryFilter] = useState('전체')
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [expandedMeetingIds, setExpandedMeetingIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
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

  function toggleMonth(key: string) {
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  function toggleExpand(id: string) {
    setExpandedMeetingIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const filtered = categoryFilter === '전체' ? meetings : meetings.filter(m => m.category === categoryFilter)

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
    const result: Record<string, Map<string, Meeting[]>> = {}
    allKanbanCats.forEach(cat => { result[cat] = new Map() })
    filtered.forEach(m => {
      const cat = (m.category && (CATEGORIES.slice(1) as readonly string[]).includes(m.category)) ? m.category : '기타'
      const ym = m.meeting_date ? m.meeting_date.slice(0, 7) : '날짜 없음'
      if (!result[cat].has(ym)) result[cat].set(ym, [])
      result[cat].get(ym)!.push(m)
    })
    return result
  }, [filtered])

  const kanbanCols = [...CATEGORIES.slice(1), '기타'] as string[]

  return (
    <div className={viewMode === 'kanban' ? 'p-8' : 'p-8 max-w-3xl'}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">회의록</h1>
        <div className="flex gap-2 items-center">
          {/* 뷰 모드 토글 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              title="리스트 보기"
              className={`px-2.5 py-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              ≡
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="칸반 보기"
              className={`px-2.5 py-1.5 text-sm transition-colors ${viewMode === 'kanban' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
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
            className="text-sm bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
            + 새 회의록
          </button>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(cat)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              categoryFilter === cat ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}>
            {cat}
            {cat !== '전체' && <span className="ml-1 text-gray-300">{meetings.filter(m => m.category === cat).length}</span>}
          </button>
        ))}
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">{categoryFilter === '전체' ? '회의록이 없습니다' : `${categoryFilter} 회의록이 없습니다`}</p>
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
                              className="w-4 h-4 rounded accent-gray-700 flex-shrink-0 cursor-pointer" />
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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanCols.map(cat => {
            const monthMap = kanbanGroups[cat]
            const totalCount = Array.from(monthMap.values()).reduce((acc, arr) => acc + arr.length, 0)
            const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a))
            return (
              <div key={cat} className="flex-shrink-0 w-64">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-600">{cat}</h3>
                  <span className="text-xs text-gray-400">{totalCount}건</span>
                </div>
                <div className="space-y-3">
                  {sortedMonths.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-4">없음</p>
                  ) : (
                    sortedMonths.map(ym => {
                      const collapseKey = `${cat}_${ym}`
                      const isCollapsed = collapsedMonths.has(collapseKey)
                      const list = monthMap.get(ym)!
                      return (
                        <div key={ym}>
                          <button
                            onClick={() => toggleMonth(collapseKey)}
                            className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors w-full text-left">
                            <span className="text-gray-300">{isCollapsed ? '▶' : '▼'}</span>
                            <span>{ym === '날짜 없음' ? '날짜 미지정' : formatMonthLabel(ym)}</span>
                            <span className="font-normal text-gray-400 ml-auto">{list.length}</span>
                          </button>
                          {!isCollapsed && (
                            <div className="space-y-1.5">
                              {list.map(meeting => (
                                <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
                                  <div className="bg-white rounded-lg border border-gray-100 hover:border-gray-200 px-3 py-2.5 transition-colors">
                                    <p className="text-xs font-medium text-gray-800 line-clamp-2 mb-1">{meeting.title}</p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {meeting.meeting_date && (
                                        <span className="text-xs text-gray-400">{format(parseISO(meeting.meeting_date), 'M/d', { locale: ko })}</span>
                                      )}
                                      {meeting.category && (
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${CATEGORY_COLORS[meeting.category] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                          {meeting.category}
                                        </span>
                                      )}
                                      {meeting.notes.length > 0 && (
                                        <span className="text-xs text-gray-300 ml-auto">{meeting.notes.length}개</span>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
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
