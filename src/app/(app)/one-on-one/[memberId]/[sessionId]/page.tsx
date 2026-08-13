'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { OneOnOne, Member, NoteEntry } from '@/types'
import dynamic from 'next/dynamic'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

const T1 = 'rgba(226,232,240,0.92)'
const T2 = 'rgba(226,232,240,0.55)'
const T3 = 'rgba(226,232,240,0.35)'
const BORDER = 'rgba(255,255,255,0.08)'
const MEMBER_COLOR = '#4C7FE0'

export default function OneOnOneSessionPage() {
  const { memberId, sessionId } = useParams<{ memberId: string; sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession]               = useState<OneOnOne | null>(null)
  const [member, setMember]                 = useState<Member | null>(null)
  const [prevNextAppointment, setPrevNext]  = useState<string | null>(null)
  const [prevSessionDate, setPrevDate]      = useState<string | null>(null)
  const [prevTitle, setPrevTitle]           = useState<string | null>(null)
  const [prevContent, setPrevContent]       = useState<string | null>(null)
  const [prevOpen, setPrevOpen]             = useState(false)
  const [titleInput, setTitleInput]         = useState('')
  const [contentInput, setContentInput]     = useState('')
  const [nextAppointment, setNextAppointment]       = useState('')
  const [nextAppointmentDate, setNextAppointmentDate] = useState('')
  const [deleting, setDeleting]             = useState(false)

  const titleRef   = useRef<HTMLInputElement>(null)
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const nextAppointmentSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoFocused = useRef(false)

  useEffect(() => {
    async function load() {
      const [{ data: s }, { data: m }, { data: allSessions }] = await Promise.all([
        supabase.from('one_on_ones').select('*').eq('id', sessionId).single(),
        supabase.from('members').select('*').eq('id', memberId).single(),
        supabase.from('one_on_ones')
          .select('id, session_date, next_appointment, title, notes, created_at')
          .eq('member_id', memberId)
          .order('session_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ])
      if (s) {
        const sess = s as OneOnOne
        setSession(sess)
        setTitleInput(sess.title ?? '')
        setContentInput(sess.notes[0]?.content ?? '')
        setNextAppointment(sess.next_appointment ?? '')
        setNextAppointmentDate(sess.next_appointment_date ?? '')
      }
      if (m) setMember(m as Member)
      if (allSessions && s) {
        const idx = (allSessions as OneOnOne[]).findIndex(x => x.id === sessionId)
        if (idx > 0) {
          const prev = (allSessions as OneOnOne[])[idx - 1]
          setPrevNext(prev.next_appointment ?? null)
          setPrevDate(prev.session_date ?? null)
          setPrevTitle(prev.title ?? null)
          setPrevContent(prev.notes?.[0]?.content ?? null)
        }
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, memberId])

  useEffect(() => {
    if (session && !autoFocused.current) {
      autoFocused.current = true
      if (!session.title) titleRef.current?.focus()
    }
  }, [session])

  async function updateSession(updates: Partial<OneOnOne>) {
    await supabase.from('one_on_ones').update(updates).eq('id', sessionId)
    setSession(prev => prev ? { ...prev, ...updates } : prev)
  }

  function handleContentChange(html: string) {
    setContentInput(html)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveContent(html), 1500)
  }

  async function saveContent(content?: string) {
    if (!session) return
    const c = content ?? contentInput
    const existingNote = session.notes[0]
    const newNote: NoteEntry = {
      title: existingNote?.title ?? '기록',
      content: c,
      created_at: existingNote?.created_at ?? new Date().toISOString(),
    }
    await updateSession({ notes: [newNote, ...session.notes.slice(1)] })
  }

  async function saveNextAppointment() {
    await updateSession({ next_appointment: nextAppointment.trim() || null })
  }

  function handleNextAppointmentChange(v: string) {
    setNextAppointment(v)
    clearTimeout(nextAppointmentSaveTimer.current)
    nextAppointmentSaveTimer.current = setTimeout(() => {
      updateSession({ next_appointment: v.trim() || null })
    }, 1500)
  }

  async function saveNextAppointmentDate(date: string) {
    await updateSession({ next_appointment_date: date || null })
  }

  async function deleteSession() {
    if (!confirm('이 1on1 기록을 삭제하시겠습니까?')) return
    setDeleting(true)
    await supabase.from('one_on_ones').delete().eq('id', sessionId)
    router.push(`/one-on-one/${memberId}`)
  }

  function handleDownload() {
    if (!session || !member) return
    const lines = [
      `# 1on1: ${member.name}`,
      `제목: ${session.title ?? ''}`,
      `날짜: ${session.session_date ?? '미지정'}`,
      '',
      contentInput,
      '',
      nextAppointment ? `다음 약속: ${nextAppointment}` : '',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `1on1_${member.name}_${session.session_date ?? 'undated'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!session || !member) return <div style={{ padding: 32, color: T3, fontSize: 14 }} className="animate-pulse">불러오는 중...</div>

  const prevDateLabel = prevSessionDate
    ? (() => { try { return format(parseISO(prevSessionDate), 'M월 d일', { locale: ko }) } catch { return prevSessionDate } })()
    : null
  const hasPrev = !!(prevNextAppointment || prevContent)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 상단 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href={`/one-on-one/${memberId}`}
            style={{ fontSize: 12, color: T3, textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => (e.currentTarget.style.color = T2)}
            onMouseLeave={e => (e.currentTarget.style.color = T3)}>
            ← {member.name} 1on1 목록
          </Link>
          <div style={{ width: 1, height: 12, background: BORDER }} />
          {/* 날짜 */}
          <input type="date" value={session.session_date ?? ''}
            onChange={e => updateSession({ session_date: e.target.value || null })}
            style={{ fontSize: 11, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '3px 8px', background: 'rgba(255,255,255,0.05)', color: T2, outline: 'none', colorScheme: 'dark' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleDownload}
            style={{ fontSize: 11, color: T3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 12px', background: 'transparent', cursor: 'pointer', transition: 'color 150ms, background 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = T2; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.color = T3; e.currentTarget.style.background = 'transparent' }}>
            MD 다운로드
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, padding: '16px 20px 32px', overflowY: 'auto' }} className="scrollbar-hide">

        {/* ── 메인 콘텐츠 ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 제목 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: MEMBER_COLOR, flexShrink: 0 }} />
            <input
              ref={titleRef}
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') updateSession({ title: titleInput || null })
                if (e.key === 'Escape') setTitleInput(session.title ?? '')
              }}
              onBlur={() => updateSession({ title: titleInput.trim() || null })}
              placeholder="1on1 제목"
              style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T1, background: 'transparent', border: 'none', borderBottom: '2px solid transparent', outline: 'none', paddingBottom: 2, transition: 'border-color 150ms' }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = 'rgba(76,127,224,0.5)')}
              onBlurCapture={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
            />
          </div>

          {/* 기록 에디터 */}
          <div className="surface-card rounded-2xl overflow-hidden">
            <div style={{ padding: '10px 20px 8px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>기록</span>
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              <TiptapEditor
                dark
                value={contentInput}
                onChange={handleContentChange}
                autoFocus={false}
                minHeight={300}
              />
            </div>
          </div>

          {/* 구 노트 데이터 */}
          {session.notes.length > 1 && (
            <div>
              <p style={{ fontSize: 11, color: T3, marginBottom: 8 }}>이전 기록</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {session.notes.slice(1).map((note, idx) => (
                  <div key={idx} className="surface-card rounded-xl" style={{ padding: 14 }}>
                    <p style={{ fontSize: 11, color: T3, marginBottom: 6 }}>{note.title}</p>
                    <div className="prose-dark" dangerouslySetInnerHTML={{ __html: note.content }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 다음 약속 */}
          <div className="surface-card rounded-2xl overflow-hidden">
            <div style={{ padding: '10px 20px 8px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>다음 약속</span>
              <p style={{ fontSize: 11, color: T3, marginTop: 1, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>다음 1on1에서 확인할 약속이나 과제</p>
            </div>
            <div style={{ padding: '12px 20px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, color: T2, fontWeight: 500, whiteSpace: 'nowrap' }}>다음 1on1 일자</span>
                <input type="date" value={nextAppointmentDate}
                  onChange={e => { setNextAppointmentDate(e.target.value); saveNextAppointmentDate(e.target.value) }}
                  style={{ fontSize: 11, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 8px', background: 'rgba(255,255,255,0.06)', color: T2, outline: 'none', colorScheme: 'dark' }} />
                {nextAppointmentDate && (
                  <button onClick={() => { setNextAppointmentDate(''); saveNextAppointmentDate('') }}
                    style={{ fontSize: 10, color: T3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = T3)}>× 제거</button>
                )}
                {nextAppointmentDate && (
                  <span style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)', padding: '2px 8px', borderRadius: 20, marginLeft: 'auto' }}>
                    일정탭 연동됨
                  </span>
                )}
              </div>
              <textarea value={nextAppointment}
                onChange={e => handleNextAppointmentChange(e.target.value)}
                onBlur={saveNextAppointment}
                placeholder="다음 1on1에서 챙길 것들을 입력하세요"
                rows={3}
                style={{ width: '100%', fontSize: 13, color: T1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', lineHeight: 1.65 }}
                className="placeholder:text-[rgba(226,232,240,0.25)]" />
            </div>
          </div>

          {/* 삭제 */}
          <div style={{ paddingTop: 4 }}>
            <button onClick={deleteSession} disabled={deleting}
              style={{ fontSize: 12, color: 'rgba(248,113,113,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 150ms' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.5)')}>
              이 기록 삭제
            </button>
          </div>
        </div>

        {/* ── 우측 사이드 패널 ── */}
        {hasPrev && (
          <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* 이전 약속 */}
            {prevNextAppointment && (
              <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24', letterSpacing: '0.02em' }}>이전 약속</span>
                  {prevDateLabel && <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.5)' }}>{prevDateLabel}</span>}
                </div>
                <p style={{ fontSize: 13, color: 'rgba(253,230,138,0.82)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{prevNextAppointment}</p>
              </div>
            )}

            {/* 이전 기록 (접기/펼치기) */}
            {prevContent && (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                <button onClick={() => setPrevOpen(v => !v)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T2 }}>이전 기록</span>
                    {(prevDateLabel || prevTitle) && (
                      <span style={{ fontSize: 10, color: T3 }}>
                        {[prevDateLabel, prevTitle].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: T3, flexShrink: 0, transition: 'transform 200ms', transform: prevOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
                </button>
                {prevOpen && (
                  <div style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 14px 14px', maxHeight: 380, overflowY: 'auto' }} className="scrollbar-hide">
                    <div className="prose-dark" dangerouslySetInnerHTML={{ __html: prevContent }} />
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
