'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'
import { generateMeetingsContextMd, downloadMd } from '@/lib/markdown'

const CATEGORIES = ['전체', '코어', '비즈', '경영진', '본부장', '타팀', '목표관리', '기타'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_COLORS: Record<string, string> = {
  '코어':    'bg-[#BADEC8]/40 text-[#2D5A45] border-[#BADEC8]/55',
  '비즈':    'bg-[#F3E482]/40 text-[#5A4A10] border-[#F3E482]/55',
  '경영진':  'bg-[#90A7D8]/30 text-[#1E3A6B] border-[#90A7D8]/45',
  '본부장':  'bg-[#BFE4B5]/40 text-[#2D5A35] border-[#BFE4B5]/55',
  '타팀':    'bg-gray-100/80 text-gray-500 border-gray-200',
  '목표관리':'bg-[#EBA698]/25 text-[#6B2D25] border-[#EBA698]/40',
  '기타':    'bg-gray-100/80 text-gray-400 border-gray-200',
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [categoryFilter, setCategoryFilter] = useState<Category>('전체')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [expandedMeetingIds, setExpandedMeetingIds] = useState<Set<string>>(new Set())
  const colAddInProgress = useRef(false)
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
    if (data) { setNewTitle(''); setAdding(false); router.push(`/meetings/${(data as Meeting).id}`) }
  }

  async function deleteChecked() {
    if (checkedIds.size === 0) return
    if (!confirm(`선택한 ${checkedIds.size}개 회의록을 삭제하시겠습니까?`)) return
    await supabase.from('meetings').delete().in('id', Array.from(checkedIds))
    setMeetings(prev => prev.filter(m => !checkedIds.has(m.id)))
    setCheckedIds(new Set())
  }

  function downloadChecked() {
    const selected = meetings.filter(m => checkedIds.has(m.id))
    const md = generateMeetingsContextMd(selected.map(m => ({
      title: m.title, meeting_date: m.meeting_date, category: m.category, notes: m.notes,
    })))
    const label = selected.length === 1 ? selected[0].title : `회의록-${selected.length}건`
    downloadMd(md, label)
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

  const filtered = useMemo(() => {
    if (categoryFilter === '전체') return meetings
    if (categoryFilter === '기타') {
      const known = CATEGORIES.slice(1, -1) as readonly string[]
      return meetings.filter(m => !m.category || !known.includes(m.category))
    }
    return meetings.filter(m => m.category === categoryFilter)
  }, [meetings, categoryFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    filtered.forEach(m => {
      const ym = m.meeting_date ? m.meeting_date.slice(0, 7) : '날짜 없음'
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym)!.push(m)
    })
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 mr-auto">회의록</h1>

        {checkedIds.size > 0 && (
          <>
            <button onClick={downloadChecked}
              className="text-xs bg-white/40 backdrop-blur-xl border border-white/60 text-gray-600 px-3 py-1.5 rounded-full hover:bg-white/60 transition-all">
              MD 다운로드 ({checkedIds.size})
            </button>
            <button onClick={deleteChecked}
              className="text-xs bg-red-50 border border-red-200 text-red-500 px-3 py-1.5 rounded-full hover:bg-red-100 transition-all">
              {checkedIds.size}개 삭제
            </button>
          </>
        )}

        {/* 뷰 토글 */}
        <div className="flex items-center bg-white/40 backdrop-blur-xl border border-white/60 rounded-full p-1">
          <button onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${viewMode === 'grid' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            그리드
          </button>
          <button onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            리스트
          </button>
        </div>

        <button onClick={() => setAdding(true)}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-sm">
          + 새 회의록
        </button>
      </div>

      {/* 빠른 추가 */}
      {adding && (
        <div className="flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/80 px-5 py-4 mb-3 shadow-sm">
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
            onBlur={handleAdd}
            placeholder="회의 제목 입력 후 Enter"
            className="w-full text-sm focus:outline-none text-gray-700 bg-transparent" />
        </div>
      )}

      {/* 카테고리 필터 pills */}
      <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap mb-4">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(cat)}
            className={`text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap ${
              categoryFilter === cat
                ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                : 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'
            }`}>
            {cat}
            {cat !== '전체' && (
              <span className="ml-1 opacity-60">
                {cat === '기타'
                  ? meetings.filter(m => !m.category || !(CATEGORIES.slice(1, -1) as readonly string[]).includes(m.category)).length
                  : meetings.filter(m => m.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl h-36 animate-pulse" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-300 text-sm">회의록이 없습니다</p>
          </div>
        ) : viewMode === 'grid' ? (

          /* ── 그리드 뷰 ── */
          filtered.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-gray-300 text-sm">해당 카테고리의 회의록이 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
              {filtered.map(meeting => (
                <Link key={meeting.id} href={`/meetings/${meeting.id}`}
                  className="group bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-5 hover:bg-white/60 hover:shadow-sm transition-all block">

                  {/* 상단: 카테고리 배지 + 노트 수 */}
                  <div className="flex items-center justify-between mb-3">
                    {meeting.category ? (
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${CATEGORY_COLORS[meeting.category] ?? 'bg-gray-100/80 text-gray-400 border-gray-200'}`}>
                        {meeting.category}
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full border bg-gray-100/80 text-gray-400 border-gray-200">
                        미분류
                      </span>
                    )}
                    {meeting.notes.length > 0 && (
                      <span className="text-[10px] text-gray-400 bg-white/60 border border-white/80 px-2 py-0.5 rounded-full">
                        {meeting.notes.length}개 노트
                      </span>
                    )}
                  </div>

                  {/* 제목 */}
                  <p className="text-sm font-semibold text-gray-800 leading-snug mb-4 line-clamp-2 break-words">
                    {meeting.title || '제목 없음'}
                  </p>

                  {/* 하단: 날짜 + hover 화살표 */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {meeting.meeting_date
                        ? format(parseISO(meeting.meeting_date), 'M월 d일 (E)', { locale: ko })
                        : '날짜 미지정'}
                    </span>
                    <span className="text-xs text-[#2D5A45] opacity-0 group-hover:opacity-100 transition-opacity">열기 →</span>
                  </div>

                  {/* 첫 노트 미리보기 */}
                  {meeting.notes?.[0]?.content && (
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mt-3 pt-3 border-t border-white/60">
                      {meeting.notes[0].content}
                    </p>
                  )}
                </Link>
              ))}

              {/* 새 회의록 추가 카드 */}
              <button onClick={() => setAdding(true)}
                className="bg-white/20 backdrop-blur-xl border border-dashed border-white/50 rounded-3xl p-5 hover:bg-white/30 hover:border-white/70 transition-all flex flex-col items-center justify-center gap-2 min-h-32 text-gray-400 hover:text-gray-600">
                <span className="text-2xl leading-none">+</span>
                <span className="text-xs font-medium">새 회의록</span>
              </button>
            </div>
          )

        ) : (

          /* ── 리스트 뷰 ── */
          <div className="space-y-4 pb-6">
            {grouped.map(([ym, list]) => {
              const isCollapsed = collapsedMonths.has(ym)
              return (
                <div key={ym}>
                  <button onClick={() => toggleMonth(ym)}
                    className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 transition-colors">
                    <span>{isCollapsed ? '▶' : '▼'}</span>
                    <span>{ym === '날짜 없음' ? '날짜 미지정' : formatMonthLabel(ym)}</span>
                    <span className="font-normal">({list.length}건)</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {list.map(meeting => {
                        const isExpanded = expandedMeetingIds.has(meeting.id)
                        return (
                          <div key={meeting.id} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl overflow-hidden hover:bg-white/60 transition-all">
                            <div className="px-5 py-4 flex items-center gap-3">
                              <input type="checkbox" checked={checkedIds.has(meeting.id)}
                                onChange={() => toggleCheck(meeting.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-3 h-3 rounded accent-gray-700 flex-shrink-0 cursor-pointer" />
                              <Link href={`/meetings/${meeting.id}`} className="flex-1 flex items-center justify-between min-w-0">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-gray-800">{meeting.title}</p>
                                    {meeting.category && (
                                      <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${CATEGORY_COLORS[meeting.category] ?? 'bg-gray-100/80 text-gray-400 border-gray-200'}`}>
                                        {meeting.category}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {meeting.meeting_date && (
                                      <span className="text-xs text-gray-400">{format(parseISO(meeting.meeting_date), 'M월 d일 (E)', { locale: ko })}</span>
                                    )}
                                    {meeting.notes.length > 0 && (
                                      <span className="text-xs text-gray-300">{meeting.notes.length}개 노트</span>
                                    )}
                                  </div>
                                </div>
                              </Link>
                              {meeting.notes.length > 0 && (
                                <button onClick={e => { e.stopPropagation(); toggleExpand(meeting.id) }}
                                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-white/60 rounded-full transition-colors"
                                  title={isExpanded ? '노트 접기' : '노트 펼치기'}>
                                  <span className="text-xs">{isExpanded ? '▲' : '▼'}</span>
                                </button>
                              )}
                            </div>
                            {isExpanded && meeting.notes.length > 0 && (
                              <div className="border-t border-white/60 px-4 pt-2 pb-3 space-y-2">
                                {meeting.notes.map((note, i) => (
                                  <div key={i} className="bg-white/50 rounded-xl px-3 py-2">
                                    {note.title && <p className="text-xs font-semibold text-gray-600 mb-0.5">{note.title}</p>}
                                    {note.content && <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed">{note.content}</p>}
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
        )}
      </div>
    </div>
  )
}
