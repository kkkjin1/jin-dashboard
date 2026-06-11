'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Meeting } from '@/types'

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase
      .from('meetings')
      .select('*')
      .order('created_at', { ascending: false })
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

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">회의록</h1>
        <button
          onClick={() => setAdding(true)}
          className="text-sm bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + 새 회의록
        </button>
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
      ) : meetings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">회의록이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map(meeting => (
            <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
              <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200 transition-colors flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{meeting.title}</p>
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
