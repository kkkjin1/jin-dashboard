'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'
import { generateMeetingsContextMd, downloadMd } from '@/lib/markdown'

const ORDERED_CATS = ['코어', '비즈', '경영진', '본부장', '타팀', '목표관리', '기타'] as const
type MeetingCat = typeof ORDERED_CATS[number]

type Period = '전체' | '이번 주' | '이번 달' | '3개월'
const PERIODS: Period[] = ['전체', '이번 주', '이번 달', '3개월']

const CATEGORY_COLORS: Record<string, string> = {
  '코어':    'bg-[#BADEC8]/40 text-[#2D5A45] border-[#BADEC8]/55',
  '비즈':    'bg-[#F3E482]/40 text-[#5A4A10] border-[#F3E482]/55',
  '경영진':  'bg-[#90A7D8]/30 text-[#1E3A6B] border-[#90A7D8]/45',
  '본부장':  'bg-[#BFE4B5]/40 text-[#2D5A35] border-[#BFE4B5]/55',
  '타팀':    'bg-gray-100/80 text-gray-500 border-gray-200',
  '목표관리':'bg-[#EBA698]/25 text-[#6B2D25] border-[#EBA698]/40',
  '기타':    'bg-gray-100/80 text-gray-400 border-gray-200',
}

const CAT_CARD_BG: Record<string, string> = {
  '코어':    'border-t-[#BADEC8]',
  '비즈':    'border-t-[#F3E482]',
  '경영진':  'border-t-[#90A7D8]',
  '본부장':  'border-t-[#BFE4B5]',
  '타팀':    'border-t-gray-200',
  '목표관리':'border-t-[#EBA698]',
  '기타':    'border-t-gray-200',
}

function getPeriodStart(period: Period): Date | null {
  if (period === '전체') return null
  const now = new Date()
  if (period === '이번 주') {
    const d = new Date(now)
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (period === '이번 달') return new Date(now.getFullYear(), now.getMonth(), 1)
  const d = new Date(now); d.setMonth(now.getMonth() - 3); return d
}

function inPeriod(dateStr: string | null | undefined, period: Period): boolean {
  if (!dateStr) return period === '전체'
  const start = getPeriodStart(period)
  if (!start) return true
  return new Date(dateStr) >= start
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-gray-900 text-white border-gray-900 shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [period, setPeriod] = useState<Period>('전체')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
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
    const md = generateMeetingsContextMd(selected.map(m => ({ title: m.title, meeting_date: m.meeting_date, category: m.category, notes: m.notes })))
    downloadMd(md, selected.length === 1 ? selected[0].title : `회의록-${selected.length}건`)
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleCat(cat: string) {
    setCollapsedCats(prev => { const s = new Set(prev); s.has(cat) ? s.delete(cat) : s.add(cat); return s })
  }

  const categoryGroups = useMemo(() => {
    const periodFiltered = meetings.filter(m => inPeriod(m.meeting_date, period))
    return ORDERED_CATS
      .map(cat => {
        const items = cat === '기타'
          ? periodFiltered.filter(m => !m.category || !(ORDERED_CATS as readonly string[]).slice(0, -1).includes(m.category))
          : periodFiltered.filter(m => m.category === cat)
        if (items.length === 0) return null
        return { cat, items }
      })
      .filter(Boolean) as { cat: MeetingCat; items: Meeting[] }[]
  }, [meetings, period])

  const totalFiltered = categoryGroups.reduce((s, g) => s + g.items.length, 0)

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900 mr-auto">회의록</h1>
        {checkedIds.size > 0 && (
          <>
            <button onClick={downloadChecked} className={`${pill} ${pOff}`}>
              MD 다운로드 ({checkedIds.size})
            </button>
            <button onClick={deleteChecked}
              className="text-xs bg-red-50 border border-red-200 text-red-500 px-3 py-1.5 rounded-full hover:bg-red-100 transition-all">
              {checkedIds.size}개 삭제
            </button>
          </>
        )}
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

      {/* 기간 필터 */}
      <div className="flex-shrink-0 flex items-center gap-1.5 mb-5 overflow-x-auto scrollbar-hide">
        {PERIODS.map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`${pill} ${period === p ? pOn : pOff}`}>{p}</button>
        ))}
        <span className="text-xs text-gray-400 ml-auto shrink-0">{totalFiltered}건</span>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl h-28 animate-pulse" />)}
          </div>
        ) : categoryGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-gray-300 text-sm">해당 기간의 회의록이 없습니다</p>
            <button onClick={() => setPeriod('전체')} className={`${pill} ${pOff} text-gray-400`}>전체 보기</button>
          </div>
        ) : (
          <div className="space-y-8 pb-6">
            {categoryGroups.map(({ cat, items }) => {
              const isCatCollapsed = collapsedCats.has(cat)
              return (
                <div key={cat}>
                  {/* 카테고리 헤더 */}
                  <button onClick={() => toggleCat(cat)}
                    className="flex items-center gap-2.5 w-full text-left group py-2 mb-3 border-b border-white/40 pb-3">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${CATEGORY_COLORS[cat] ?? 'bg-gray-100/80 text-gray-400 border-gray-200'}`}>
                      {cat}
                    </span>
                    <span className="text-xs text-gray-400 bg-white/60 border border-white/70 px-2 py-0.5 rounded-full">
                      {items.length}건
                    </span>
                    <span className="text-[10px] text-gray-300 group-hover:text-gray-500 transition-colors ml-auto">
                      {isCatCollapsed ? '▶' : '▼'}
                    </span>
                  </button>

                  {/* 카드 그리드 */}
                  {!isCatCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map(meeting => (
                        <Link key={meeting.id} href={`/meetings/${meeting.id}`}
                          className={`group/card bg-white/40 backdrop-blur-xl border-t-2 border border-white/60 rounded-3xl p-5 hover:bg-white/60 hover:shadow-sm transition-all block ${CAT_CARD_BG[cat] ?? 'border-t-gray-200'}`}>
                          <div className="flex items-start gap-2.5 mb-3">
                            <input type="checkbox" checked={checkedIds.has(meeting.id)}
                              onChange={() => toggleCheck(meeting.id)}
                              onClick={e => e.preventDefault()}
                              className="w-3.5 h-3.5 rounded accent-gray-700 flex-shrink-0 mt-0.5 cursor-pointer" />
                            <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-2 flex-1">
                              {meeting.title || '제목 없음'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-neutral-500">
                              {meeting.meeting_date
                                ? format(parseISO(meeting.meeting_date), 'yyyy.M.d (E)', { locale: ko })
                                : '날짜 미지정'}
                            </span>
                            {meeting.notes.length > 0 && (
                              <span className="text-[10px] text-gray-400 ml-auto bg-white/60 border border-white/70 px-2 py-0.5 rounded-full">{meeting.notes.length}노트</span>
                            )}
                          </div>
                          {meeting.notes?.[0]?.content && (
                            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mt-2.5 pt-2.5 border-t border-white/50">
                              {meeting.notes[0].content}
                            </p>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            <button onClick={() => setAdding(true)}
              className="w-full bg-white/20 backdrop-blur-xl border border-dashed border-white/50 rounded-3xl py-5 hover:bg-white/30 transition-all text-gray-400 hover:text-gray-600 text-xs font-medium">
              + 새 회의록
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
