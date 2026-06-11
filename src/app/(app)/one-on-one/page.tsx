'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchMembers } from '@/lib/tasks'
import type { Member, OneOnOne } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export default function OneOnOnePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [sessions, setSessions] = useState<OneOnOne[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      fetchMembers(),
      supabase.from('one_on_ones').select('*').order('session_date', { ascending: false }),
    ]).then(([ms, { data }]) => {
      setMembers(ms)
      setSessions((data ?? []) as OneOnOne[])
    })
  }, [])

  function getLastSession(memberId: string): OneOnOne | undefined {
    return sessions.filter(s => s.member_id === memberId)[0]
  }

  function getSessionMonths(memberId: string): string[] {
    const months = new Set<string>()
    sessions.filter(s => s.member_id === memberId).forEach(s => {
      if (s.session_date) months.add(s.session_date.slice(0, 7))
    })
    return Array.from(months).sort().reverse()
  }

  async function createSession(memberId: string) {
    const { data } = await supabase.from('one_on_ones').insert({ member_id: memberId }).select('id').single()
    if (data) router.push(`/one-on-one/${memberId}/${(data as { id: string }).id}`)
  }

  const grouped = [
    { label: '팀장', list: members.filter(m => m.part === '팀장') },
    { label: '코어파트', list: members.filter(m => m.part === '코어') },
    { label: '비즈파트', list: members.filter(m => m.part === '비즈') },
  ].filter(g => g.list.length > 0)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">1on1</h1>
        <Link href="/one-on-one/template"
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors">
          템플릿 관리
        </Link>
      </div>

      {grouped.map(({ label, list }) => (
        <div key={label} className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">{label}</h2>
          <div className="space-y-2">
            {list.map(member => {
              const last = getLastSession(member.id)
              const months = getSessionMonths(member.id)
              const memberSessions = sessions.filter(s => s.member_id === member.id)
              return (
                <div key={member.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
                        {member.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{member.name}</p>
                        <p className="text-xs text-gray-400">
                          {last
                            ? `마지막: ${last.session_date ? format(parseISO(last.session_date), 'yyyy년 M월 d일', { locale: ko }) : '날짜 미지정'} · 총 ${memberSessions.length}회`
                            : '1on1 없음'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {memberSessions.length > 0 && (
                        <Link href={`/one-on-one/${member.id}`}
                          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors">
                          목록
                        </Link>
                      )}
                      <button onClick={() => createSession(member.id)}
                        className="text-xs bg-gray-800 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition-colors">
                        + 새 1on1
                      </button>
                    </div>
                  </div>
                  {months.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {months.slice(0, 6).map(m => {
                        const [y, mo] = m.split('-')
                        return (
                          <span key={m} className="text-xs bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full">
                            {y}.{mo}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
