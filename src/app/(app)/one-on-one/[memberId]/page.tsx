'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member, OneOnOne, OneOnOneTemplate } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import MarkdownContent from '@/components/MarkdownContent'

const T1 = 'rgba(226,232,240,0.92)'
const T2 = 'rgba(226,232,240,0.55)'
const T3 = 'rgba(226,232,240,0.35)'
const BORDER = 'rgba(255,255,255,0.08)'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function SessionPreviewCard({ session, memberId, isSelected, onClick }: {
  session: OneOnOne; memberId: string; isSelected: boolean; onClick: () => void
}) {
  const dateLabel = session.session_date
    ? format(parseISO(session.session_date), 'yy.M.d (E)', { locale: ko })
    : '날짜 미지정'
  const preview = stripHtml(session.notes[0]?.content ?? '').slice(0, 60)

  return (
    <div
      onClick={onClick}
      style={{
        padding: '11px 14px',
        borderRadius: 12,
        cursor: 'pointer',
        background: isSelected ? 'rgba(76,127,224,0.16)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isSelected ? 'rgba(76,127,224,0.35)' : BORDER}`,
        transition: 'background 120ms, border-color 120ms',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#93C5FD' : T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {session.title || '제목 없음'}
        </p>
        {session.next_appointment && (
          <span style={{ fontSize: 10, color: '#fbbf24', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '1px 6px', marginLeft: 8, flexShrink: 0 }}>약속</span>
        )}
      </div>
      <p style={{ fontSize: 11, color: isSelected ? 'rgba(147,197,253,0.6)' : T3, marginBottom: preview ? 4 : 0 }}>{dateLabel}</p>
      {preview && (
        <p style={{ fontSize: 11, color: isSelected ? 'rgba(147,197,253,0.55)' : T3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</p>
      )}
    </div>
  )
}

function SessionDetail({ session, memberId }: { session: OneOnOne; memberId: string }) {
  const dateLabel = session.session_date
    ? format(parseISO(session.session_date), 'yyyy년 M월 d일 (E)', { locale: ko })
    : '날짜 미지정'

  return (
    <div className="surface-card rounded-2xl overflow-hidden" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, color: T3, marginBottom: 3 }}>{dateLabel}</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: T1, lineHeight: 1.3 }}>{session.title || '제목 없음'}</p>
        </div>
        <Link href={`/one-on-one/${memberId}/${session.id}`}
          style={{ fontSize: 11, color: T3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '5px 12px', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap', transition: 'color 150ms, background 150ms', background: 'transparent' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T1; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T3; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
          편집 →
        </Link>
      </div>

      {/* 내용 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }} className="scrollbar-hide">
        {/* 다음 약속 */}
        {session.next_appointment && (
          <div style={{ background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24', marginBottom: 5, letterSpacing: '0.02em' }}>약속 내용</p>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(253,230,138,0.82)', whiteSpace: 'pre-wrap' }}>{session.next_appointment}</p>
          </div>
        )}

        {/* 노트 본문 — HTML 렌더링 */}
        {session.notes.length > 0 ? (
          session.notes.map((note, i) => (
            <div key={i} style={{ marginBottom: i < session.notes.length - 1 ? 20 : 0 }}>
              {note.title && i > 0 && (
                <p style={{ fontSize: 11, fontWeight: 600, color: T3, marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{note.title}</p>
              )}
              <MarkdownContent content={note.content} dark className="text-[13px]" />
            </div>
          ))
        ) : (
          <p style={{ fontSize: 13, textAlign: 'center', color: T3, paddingTop: 40 }}>노트가 없습니다</p>
        )}
      </div>
    </div>
  )
}

export default function MemberOneOnOnePage() {
  const { memberId } = useParams<{ memberId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [member, setMember] = useState<Member | null>(null)
  const [sessions, setSessions] = useState<OneOnOne[]>([])
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      supabase.from('members').select('*').eq('id', memberId).single(),
      supabase.from('one_on_ones').select('*').eq('member_id', memberId).order('session_date', { ascending: false }),
      supabase.from('one_on_one_template').select('*').order('updated_at', { ascending: false }),
    ]).then(([{ data: m }, { data: s }, { data: t }]) => {
      if (m) setMember(m as Member)
      const list = (s ?? []) as OneOnOne[]
      setSessions(list)
      if (list.length > 0) setSelectedSessionId(list[0].id)
      setTemplates((t ?? []) as OneOnOneTemplate[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  async function createSession(templateId: string | null) {
    setCreating(true)
    let initialNotes: { title: string; content: string; created_at: string }[] = []
    const template = templateId ? templates.find(t => t.id === templateId) : null
    if (template) {
      const now = new Date()
      const yy = String(now.getFullYear()).slice(2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      initialNotes = [{ title: `${yy}${mm}${dd} 1on1`, content: template.content, created_at: now.toISOString() }]
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
    <div style={{ padding: 32, color: T3, fontSize: 14 }} className="animate-pulse">불러오는 중...</div>
  )

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px 20px' }}>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/one-on-one"
            style={{ fontSize: 12, color: T3, textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => (e.currentTarget.style.color = T2)}
            onMouseLeave={e => (e.currentTarget.style.color = T3)}>
            ← 목록
          </Link>
          <div style={{ width: 1, height: 14, background: BORDER }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(76,127,224,0.2)', border: '1.5px solid rgba(76,127,224,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93C5FD', fontWeight: 700, fontSize: 13 }}>
              {member.name[0]}
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: T1 }}>{member.name}</span>
            <span style={{ fontSize: 11, color: T3, background: 'rgba(255,255,255,0.07)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '1px 7px' }}>{member.part}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {checkedIds.size > 0 && (
            <button onClick={deleteChecked}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.85)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {checkedIds.size}개 삭제
            </button>
          )}
          <button onClick={() => setShowModal(true)}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'rgba(76,127,224,0.15)', color: '#93C5FD', border: '1px solid rgba(76,127,224,0.3)', cursor: 'pointer', transition: 'background 150ms' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(76,127,224,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(76,127,224,0.15)')}>
            + 새 1on1
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 64, color: T3, fontSize: 13 }}>아직 1on1 기록이 없습니다</div>
      ) : (
        <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>
          {/* 좌측: 세션 목록 */}
          <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <input type="checkbox"
                checked={sessions.length > 0 && sessions.every(s => checkedIds.has(s.id))}
                onChange={toggleCheckAll}
                style={{ width: 12, height: 12, accentColor: T2, cursor: 'pointer' }} />
              <span style={{ fontSize: 11, color: T3 }}>전체 선택</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }} className="scrollbar-hide">
              {sessions.map(session => (
                <div key={session.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <input type="checkbox"
                    checked={checkedIds.has(session.id)}
                    onChange={() => toggleCheck(session.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 12, height: 12, accentColor: T2, cursor: 'pointer', marginTop: 12, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SessionPreviewCard
                      session={session}
                      memberId={memberId}
                      isSelected={session.id === selectedSessionId}
                      onClick={() => setSelectedSessionId(session.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 우측: 세션 상세 */}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            {selectedSession ? (
              <SessionDetail session={selectedSession} memberId={memberId} />
            ) : (
              <div style={{ textAlign: 'center', paddingTop: 64, color: T3, fontSize: 13 }}>세션을 선택하세요</div>
            )}
          </div>
        </div>
      )}

      {/* 새 1on1 모달 */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setShowModal(false)}>
          <div className="surface-card rounded-2xl" style={{ padding: 24, width: 320 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: T1, marginBottom: 6 }}>새 1on1 시작</h3>
            <p style={{ fontSize: 13, color: T3, marginBottom: 20 }}>어떻게 시작할까요?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }} className="scrollbar-hide">
              <button onClick={() => createSession(null)} disabled={creating}
                style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 12, border: `1px solid ${BORDER}`, background: 'transparent', cursor: 'pointer', transition: 'background 150ms', width: '100%', flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <p style={{ fontSize: 13, fontWeight: 500, color: T1, marginBottom: 2 }}>빈 양식</p>
                <p style={{ fontSize: 11, color: T3 }}>백지 상태로 시작</p>
              </button>
              {templates.map(t => (
                <button key={t.id} onClick={() => createSession(t.id)} disabled={creating}
                  style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 12, border: `1px solid ${BORDER}`, background: 'transparent', cursor: 'pointer', transition: 'background 150ms', width: '100%', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: T1, marginBottom: 2 }}>{t.title}</p>
                  <p style={{ fontSize: 11, color: T3 }}>템플릿으로 시작</p>
                </button>
              ))}
              {templates.length === 0 && (
                <p style={{ fontSize: 11, color: T3, padding: '0 4px' }}>
                  저장된 템플릿이 없습니다 · <Link href="/one-on-one/template" style={{ color: '#93C5FD' }}>템플릿 만들기</Link>
                </p>
              )}
            </div>
            <button onClick={() => setShowModal(false)}
              style={{ marginTop: 16, width: '100%', fontSize: 12, color: T3, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 150ms' }}
              onMouseEnter={e => (e.currentTarget.style.color = T2)}
              onMouseLeave={e => (e.currentTarget.style.color = T3)}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
