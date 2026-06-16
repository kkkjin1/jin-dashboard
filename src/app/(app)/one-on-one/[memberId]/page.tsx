'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member, OneOnOne } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

function SessionDetail({ session, memberId }: { session: OneOnOne; memberId: string }) {
  const dateLabel = session.session_date
    ? format(parseISO(session.session_date), 'yyyy년 M월 d일 (E)', { locale: ko })
    : '날짜 미지정'

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-5 h-full flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-1">{dateLabel}</p>
          <p className="text-base font-semibold text-gray-800">{session.title || dateLabel}</p>
        </div>
        <Link
          href={`/one-on-one/${memberId}/${session.id}`}
          className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50 transition-colors flex-shrink-0 ml-3">
          편집 →
        </Link>
      </div>

      {session.next_appointment && (
        <div className="bg-amber-50 rounded-md px-4 py-3">
          <p className="text-xs font-semibold text-amber-600 mb-1">약속 내용</p>
          <p className="text-sm text-amber-800 leading-relaxed whitespace-pre-wrap">{session.next_appointment}</p>
        </div>
      )}

      {session.notes.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-4">
          {session.notes.map((note, i) => (
            <div key={i}>
              {note.title && (
                <p className="text-xs font-semibold text-gray-500 mb-1.5">{note.title}</p>
              )}
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-300 text-center py-6">노트가 없습니다</p>
      )}
    </div>
  )
}

export default function MemberOneOnOnePage() {
  const { memberId } = useParams<{ memberId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [member, setMember] = useState<Member | null>(null)
  const [sessions, setSessions] = useState<OneOnOne[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      supabase.from('members').select('*').eq('id', memberId).single(),
      supabase.from('one_on_ones').select('*').eq('member_id', memberId).order('session_date', { ascending: false }),
    ]).then(([{ data: m }, { data: s }]) => {
      if (m) setMember(m as Member)
      const list = (s ?? []) as OneOnOne[]
      setSessions(list)
      if (list.length > 0) setSelectedSessionId(list[0].id)
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

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleCheckAll() {
    const allIds = sessions.map(s => s.id)
    const allChecked = allIds.every(id => checkedIds.has(id))
    setCheckedIds(allChecked ? new Set() : new Set(allIds))
  }

  async function deleteChecked() {
    if (checkedIds.size === 0) return
    if (!confirm(`선택한 ${checkedIds.size}개 1on1을 삭제하시겠습니까?`)) return
    await supabase.from('one_on_ones').delete().in('id', Array.from(checkedIds))
    setSessions(prev => prev.filter(s => !checkedIds.has(s.id)))
    if (selectedSessionId && checkedIds.has(selectedSessionId)) setSelectedSessionId(null)
    setCheckedIds(new Set())
  }

  if (!member) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/one-on-one" className="text-sm text-gray-400 hover:text-gray-600">← 목록</Link>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
              {member.name[0]}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{member.name}</h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{member.part}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 && (
            <button onClick={deleteChecked}
              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600 transition-colors">
              {checkedIds.size}개 삭제
            </button>
          )}
          <button onClick={() => setShowModal(true)}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors">
            + 새 1on1
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">아직 1on1 기록이 없습니다</p>
        </div>
      ) : (
        <div className="flex gap-5">
          {/* LEFT: 세션 목록 */}
          <div className="w-72 flex-shrink-0 overflow-y-auto max-h-[calc(100vh-200px)]">
            <div className="flex items-center gap-2 px-1 mb-2">
              <input type="checkbox"
                checked={sessions.length > 0 && sessions.every(s => checkedIds.has(s.id))}
                onChange={toggleCheckAll}
                className="w-3 h-3 rounded accent-gray-600 cursor-pointer"
                title="전체 선택" />
              <span className="text-xs text-gray-400">전체 선택</span>
            </div>
            <div className="space-y-1.5">
              {sessions.map(session => {
                const isSelected = session.id === selectedSessionId
                const isChecked = checkedIds.has(session.id)
                const dateLabel = session.session_date
                  ? format(parseISO(session.session_date), 'yyyy.M.d (E)', { locale: ko })
                  : '날짜 미지정'
                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`rounded-lg border px-3 py-3 cursor-pointer transition-colors flex items-center gap-2 ${isSelected ? 'bg-[#10B981] border-[#10B981] text-white' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheck(session.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-3 h-3 rounded accent-gray-600 cursor-pointer flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                        {session.title || dateLabel}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className={`text-xs truncate ${isSelected ? 'text-green-100' : 'text-gray-400'}`}>{dateLabel}</p>
                        {session.next_appointment && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${isSelected ? 'bg-amber-400 text-white' : 'bg-amber-50 text-amber-600'}`}>
                            약속
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT: 세션 상세 */}
          <div className="flex-1 min-w-0 max-h-[calc(100vh-200px)] overflow-y-auto">
            {selectedSession ? (
              <SessionDetail session={selectedSession} memberId={memberId} />
            ) : (
              <div className="text-center py-16 text-gray-300 text-sm">세션을 선택하세요</div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">새 1on1 시작</h3>
            <p className="text-sm text-gray-500 mb-5">어떻게 시작할까요?</p>
            <div className="space-y-2">
              <button onClick={() => createSession(false)} disabled={creating}
                className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
                <p className="text-sm font-medium text-gray-800">빈 양식</p>
                <p className="text-xs text-gray-400">백지 상태로 시작</p>
              </button>
              <button onClick={() => createSession(true)} disabled={creating}
                className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
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
