'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member, OneOnOne } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export default function MemberOneOnOnePage() {
  const { memberId } = useParams<{ memberId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [member, setMember] = useState<Member | null>(null)
  const [sessions, setSessions] = useState<OneOnOne[]>([])
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('members').select('*').eq('id', memberId).single(),
      supabase.from('one_on_ones').select('*').eq('member_id', memberId).order('session_date', { ascending: false }),
    ]).then(([{ data: m }, { data: s }]) => {
      if (m) setMember(m as Member)
      setSessions((s ?? []) as OneOnOne[])
    })
  }, [memberId])

  async function createSession(useTemplate: boolean) {
    setCreating(true)
    let initialNotes: { title: string; content: string; created_at: string }[] = []
    if (useTemplate) {
      const { data } = await supabase.from('one_on_one_template').select('content').limit(1).single()
      if (data?.content) {
        const now = new Date()
        const yy = String(now.getFullYear()).slice(2)
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const dd = String(now.getDate()).padStart(2, '0')
        initialNotes = [{ title: `${yy}${mm}${dd} 1on1`, content: (data as { content: string }).content, created_at: now.toISOString() }]
      }
    }
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('one_on_ones')
      .insert({ member_id: memberId, session_date: today, notes: initialNotes })
      .select('id').single()
    setCreating(false)
    setShowModal(false)
    if (data) router.push(`/one-on-one/${memberId}/${(data as { id: string }).id}`)
  }

  if (!member) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/one-on-one" className="text-sm text-gray-400 hover:text-gray-600">← 목록</Link>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
              {member.name[0]}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{member.name}</h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{member.part}</span>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="text-sm bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
          + 새 1on1
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">아직 1on1 기록이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <Link key={session.id} href={`/one-on-one/${memberId}/${session.id}`}>
              <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {session.title
                        ? session.title
                        : session.session_date
                          ? format(parseISO(session.session_date), 'yyyy년 M월 d일 (E)', { locale: ko })
                          : '날짜 미지정'}
                    </p>
                    {session.title && session.session_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(parseISO(session.session_date), 'yyyy년 M월 d일 (E)', { locale: ko })}
                      </p>
                    )}
                    {session.notes[0]?.content && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {session.notes[0].content.slice(0, 70)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                    {session.next_appointment && (
                      <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                        약속 있음
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">새 1on1 시작</h3>
            <p className="text-sm text-gray-500 mb-5">어떻게 시작할까요?</p>
            <div className="space-y-2">
              <button onClick={() => createSession(false)} disabled={creating}
                className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors">
                <p className="text-sm font-medium text-gray-800">빈 양식</p>
                <p className="text-xs text-gray-400">백지 상태로 시작</p>
              </button>
              <button onClick={() => createSession(true)} disabled={creating}
                className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors">
                <p className="text-sm font-medium text-gray-800">템플릿 적용</p>
                <p className="text-xs text-gray-400">저장된 템플릿으로 시작</p>
              </button>
            </div>
            <button onClick={() => setShowModal(false)} className="mt-4 w-full text-xs text-gray-400 hover:text-gray-600">취소</button>
          </div>
        </div>
      )}
    </div>
  )
}
