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
    <div style={{
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.09)',
      boxShadow: '0 20px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.07) inset',
      borderRadius: 20,
    }} className="p-5 h-full flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs mb-1" style={{ color: 'rgba(226,232,240,0.5)' }}>{dateLabel}</p>
          <p className="text-base font-semibold" style={{ color: '#E2E8F0' }}>{session.title || dateLabel}</p>
        </div>
        <Link
          href={`/one-on-one/${memberId}/${session.id}`}
          style={{
            color: 'rgba(226,232,240,0.5)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 6,
          }}
          className="text-xs px-2.5 py-1 transition-colors flex-shrink-0 ml-3 hover:bg-white/10 hover:text-[#E2E8F0]">
          편집 →
        </Link>
      </div>

      {session.next_appointment && (
        <div style={{ background: 'rgba(245,158,11,0.12)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }} className="px-4 py-3">
          <p className="text-xs font-semibold mb-1" style={{ color: '#F59E0B' }}>약속 내용</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(245,158,11,0.85)' }}>{session.next_appointment}</p>
        </div>
      )}

      {session.notes.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-4">
          {session.notes.map((note, i) => (
            <div key={i}>
              {note.title && (
                <p className="text-xs font-semibold mb-1.5" style={{ color: 'rgba(226,232,240,0.5)' }}>{note.title}</p>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(226,232,240,0.8)' }}>{note.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-center py-6" style={{ color: 'rgba(226,232,240,0.28)' }}>노트가 없습니다</p>
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

  if (!member) return (
    <div style={{ background: '#13151C', minHeight: '100%' }} className="p-8 text-sm animate-pulse">
      <span style={{ color: 'rgba(226,232,240,0.5)' }}>불러오는 중...</span>
    </div>
  )

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null

  return (
    <div style={{ background: '#13151C', minHeight: '100%' }} className="h-full overflow-y-auto p-4 md:p-5">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/one-on-one" className="text-sm transition-colors" style={{ color: 'rgba(226,232,240,0.5)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E2E8F0')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.5)')}>
            ← 목록
          </Link>
          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.7)' }}>
              {member.name[0]}
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#E2E8F0' }}>{member.name}</h1>
            <span className="text-xs px-2 py-0.5 rounded"
              style={{ color: 'rgba(226,232,240,0.5)', background: 'rgba(255,255,255,0.08)' }}>
              {member.part}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 && (
            <button onClick={deleteChecked}
              className="text-xs px-3 py-1.5 rounded-md transition-colors"
              style={{ background: 'rgba(239,68,68,0.8)', color: '#fff' }}>
              {checkedIds.size}개 삭제
            </button>
          )}
          <button onClick={() => setShowModal(true)}
            className="text-sm px-4 py-2 rounded-md transition-colors"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.25)' }}>
            + 새 1on1
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'rgba(226,232,240,0.28)' }}>아직 1on1 기록이 없습니다</p>
        </div>
      ) : (
        <div className="flex gap-5">
          {/* LEFT: 세션 목록 */}
          <div className="w-72 flex-shrink-0 overflow-y-auto max-h-[calc(100vh-200px)]">
            <div className="flex items-center gap-2 px-1 mb-2">
              <input type="checkbox"
                checked={sessions.length > 0 && sessions.every(s => checkedIds.has(s.id))}
                onChange={toggleCheckAll}
                className="w-3 h-3 rounded cursor-pointer"
                style={{ accentColor: 'rgba(226,232,240,0.6)' }}
                title="전체 선택" />
              <span className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>전체 선택</span>
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
                    className="rounded-lg px-3 py-3 cursor-pointer transition-colors flex items-center gap-2"
                    style={isSelected
                      ? { background: '#10B981', border: '1px solid #10B981' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheck(session.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-3 h-3 rounded cursor-pointer flex-shrink-0"
                      style={{ accentColor: isSelected ? '#fff' : 'rgba(226,232,240,0.6)' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: isSelected ? '#fff' : '#E2E8F0' }}>
                        {session.title || dateLabel}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs truncate" style={{ color: isSelected ? 'rgba(220,252,231,0.85)' : 'rgba(226,232,240,0.5)' }}>{dateLabel}</p>
                        {session.next_appointment && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                            style={isSelected
                              ? { background: 'rgba(245,158,11,0.8)', color: '#fff' }
                              : { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
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
              <div className="text-center py-16 text-sm" style={{ color: 'rgba(226,232,240,0.28)' }}>세션을 선택하세요</div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div style={{
            background: '#1C1F2A',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            borderRadius: 20,
          }} className="p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4" style={{ color: '#E2E8F0' }}>새 1on1 시작</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(226,232,240,0.5)' }}>어떻게 시작할까요?</p>
            <div className="space-y-2">
              <button onClick={() => createSession(false)} disabled={creating}
                className="w-full text-left rounded-lg px-4 py-3 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <p className="text-sm font-medium" style={{ color: '#E2E8F0' }}>빈 양식</p>
                <p className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>백지 상태로 시작</p>
              </button>
              <button onClick={() => createSession(true)} disabled={creating}
                className="w-full text-left rounded-lg px-4 py-3 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <p className="text-sm font-medium" style={{ color: '#E2E8F0' }}>템플릿 적용</p>
                <p className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>저장된 템플릿으로 시작</p>
              </button>
            </div>
            <button onClick={() => setShowModal(false)} className="mt-4 w-full text-xs transition-colors"
              style={{ color: 'rgba(226,232,240,0.5)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#E2E8F0')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.5)')}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
