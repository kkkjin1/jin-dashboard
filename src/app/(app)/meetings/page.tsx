'use client'

import { useEffect, useState } from 'react'
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

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('전체')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase
      .from('meetings')
      .select('*')
      .order('meeting_date', { ascending: false })
      .then(({ data }) => {
        setMeetings((data ?? []) as Meeting[])
        setLoading(false)
      })
  }, [])

  async function handleAdd() {
    if (!newTitle.trim()) { setAdding(false); return }
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('meetings')
      .insert({ title: newTitle.trim(), meeting_date: today, notes: [] })
      .select()
      .single()
    if (data) {
      setNewTitle('')
      setAdding(false)
      router.push(`/meetings/${(data as Meeting).id}`)
    }
  }

  const filtered = categoryFilter === '전체'
    ? meetings
    : meetings.filter(m => m.category === categoryFilter)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">회의록</h1>
        <button
          onClick={() => setAdding(true)}
          className="text-sm bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + 새 회의록
        </button>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              categoryFilter === cat
                ? 'bg-gray-800 text-white border-gray-800'
                : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
            }`}
          >
            {cat}
            {cat !== '전체' && (
              <span className="ml-1 text-gray-300">
                {meetings.filter(m => m.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 빠른 추가 */}
      {adding && (
        <div className="bg-white rounded-xl border border-blue-200 px-4 py-3 mb-4">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
            }}
            onBlur={handleAdd}
            placeholder="회의 제목 입력 후 엔터"
            className="w-full text-sm focus:outline-none text-gray-700"
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">
            {categoryFilter === '전체' ? '회의록이 없습니다' : `${categoryFilter} 회의록이 없습니다`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(meeting => (
            <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
              <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200 transition-colors flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{meeting.title}</p>
                    {meeting.category && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[meeting.category] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {meeting.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {meeting.meeting_date && (
                      <span className="text-xs text-gray-400">
                        회의일: {format(parseISO(meeting.meeting_date), 'M월 d일', { locale: ko })}
                      </span>
                    )}
                    <span className="text-xs text-gray-300">
                      {meeting.notes.length}개 노트
                    </span>
                  </div>
                </div>
                <span className="text-xs text-gray-300">
                  {format(parseISO(meeting.created_at), 'M/d', { locale: ko })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
