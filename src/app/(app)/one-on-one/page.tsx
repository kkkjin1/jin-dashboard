'use client'

import { useEffect, useMemo, useState } from 'react'
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

  // memberStats: { member, daysSince } sorted never-first then by daysSince desc
  const memberStats = useMemo(() => {
    const now = Date.now()
    return members
      .map(member => {
        const last = sessions.find(s => s.member_id === member.id)
        const daysSince =
          last?.session_date != null
            ? Math.floor((now - new Date(last.session_date).getTime()) / 86400000)
            : null
        return { member, daysSince }
      })
      .sort((a, b) => {
        if (a.daysSince === null && b.daysSince === null) return 0
        if (a.daysSince === null) return -1
        if (b.daysSince === null) return 1
        return b.daysSince - a.daysSince
      })
  }, [members, sessions])

  // Most urgent: null (never) first, then >= 30 days
  const urgentStat = useMemo(() => {
    return memberStats.find(
      ({ daysSince }) => daysSince === null || daysSince >= 30
    ) ?? null
  }, [memberStats])

  function daysBadgeClass(daysSince: number | null): string {
    if (daysSince === null || daysSince >= 30) return 'bg-red-100 text-red-700'
    if (daysSince >= 14) return 'bg-orange-100 text-orange-700'
    return 'bg-green-100 text-green-700'
  }

  function daysLabel(daysSince: number | null): string {
    return daysSince === null ? '없음' : `${daysSince}일 전`
  }

  return (
    <div className="p-8 flex gap-6 w-full">
      {/* LEFT: grouped member list */}
      <div className="flex-[60] min-w-0">
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

      {/* RIGHT: alert panel */}
      <div className="flex-[40] min-w-0 flex flex-col gap-4 pt-[3.25rem]">
        {/* Card 1: 30일 미진행 긴급 */}
        {urgentStat ? (
          <div className="bg-white rounded-xl border-2 border-red-300 px-5 py-4">
            <p className="text-xs font-semibold text-red-500 mb-3">30일 미진행 긴급</p>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold text-gray-900">{urgentStat.member.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{urgentStat.member.part}</p>
                <p className="text-sm text-red-600 mt-2">
                  마지막 1on1:{' '}
                  {urgentStat.daysSince === null
                    ? '기록 없음'
                    : `${urgentStat.daysSince}일 전`}
                </p>
              </div>
              <button
                onClick={() => createSession(urgentStat.member.id)}
                className="flex-shrink-0 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap">
                + 바로 진행
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border-2 border-green-300 px-5 py-4">
            <p className="text-sm font-semibold text-green-600">✓ 이번 달 모두 진행됨</p>
          </div>
        )}

        {/* Card 2: 전체 현황 */}
        <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">전체 현황</p>
          <div className="space-y-2">
            {memberStats.map(({ member, daysSince }) => (
              <div key={member.id} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium flex-shrink-0">
                  {member.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800">{member.name}</span>
                  <span className="text-xs text-gray-400 ml-1.5">{member.part}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${daysBadgeClass(daysSince)}`}>
                  {daysLabel(daysSince)}
                </span>
                <Link href={`/one-on-one/${member.id}`}
                  className="text-xs text-gray-400 hover:text-gray-700 flex-shrink-0 whitespace-nowrap">
                  1on1 →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
