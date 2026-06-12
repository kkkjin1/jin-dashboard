'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { OneOnOne, Member, NoteEntry } from '@/types'

export default function OneOnOneSessionPage() {
  const { memberId, sessionId } = useParams<{ memberId: string; sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<OneOnOne | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [prevNextAppointment, setPrevNextAppointment] = useState<string | null>(null)
  const [prevSessionDate, setPrevSessionDate] = useState<string | null>(null)
  const [titleInput, setTitleInput] = useState('')
  const [contentInput, setContentInput] = useState('')
  const [nextAppointment, setNextAppointment] = useState('')
  const [deleting, setDeleting] = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const autoFocused = useRef(false)

  useEffect(() => {
    async function load() {
      const [{ data: s }, { data: m }, { data: allSessions }] = await Promise.all([
        supabase.from('one_on_ones').select('*').eq('id', sessionId).single(),
        supabase.from('members').select('*').eq('id', memberId).single(),
        supabase.from('one_on_ones')
          .select('id, session_date, next_appointment, created_at')
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
      }
      if (m) setMember(m as Member)
      if (allSessions && s) {
        const idx = (allSessions as OneOnOne[]).findIndex(x => x.id === sessionId)
        if (idx > 0) {
          const prev = (allSessions as OneOnOne[])[idx - 1]
          setPrevNextAppointment(prev.next_appointment ?? null)
          setPrevSessionDate(prev.session_date ?? null)
        }
      }
    }
    load()
  }, [sessionId, memberId])

  useEffect(() => {
    if (session && !autoFocused.current) {
      autoFocused.current = true
      if (!session.title) titleRef.current?.focus()
      else contentRef.current?.focus()
    }
  }, [session])

  async function updateSession(updates: Partial<OneOnOne>) {
    await supabase.from('one_on_ones').update(updates).eq('id', sessionId)
    setSession(prev => prev ? { ...prev, ...updates } : prev)
  }

  async function saveContent() {
    if (!session) return
    const existingNote = session.notes[0]
    const newNote: NoteEntry = {
      title: existingNote?.title ?? '기록',
      content: contentInput,
      created_at: existingNote?.created_at ?? new Date().toISOString(),
    }
    const rest = session.notes.slice(1)
    await updateSession({ notes: [newNote, ...rest] })
  }

  async function saveNextAppointment() {
    await updateSession({ next_appointment: nextAppointment.trim() || null })
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
    ].filter(l => l !== undefined)
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `1on1_${member.name}_${session.session_date ?? 'undated'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!session || !member) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <Link href={`/one-on-one/${memberId}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← {member.name} 1on1 목록
        </Link>
        <button onClick={handleDownload}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors">
          MD 다운로드
        </button>
      </div>

      <div className="flex gap-6 items-start">
        {/* 메인 콘텐츠 */}
        <div className="flex-1 min-w-0 max-w-2xl">
          {/* 헤더: 아바타 + 제목 + 날짜 */}
          <div className="flex items-start gap-3 mb-6">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-medium flex-shrink-0">
              {member.name[0]}
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">{member.name} 1on1</p>
              <input
                ref={titleRef}
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { updateSession({ title: titleInput || null }); contentRef.current?.focus() }
                  if (e.key === 'Escape') setTitleInput(session.title ?? '')
                }}
                onBlur={() => updateSession({ title: titleInput.trim() || null })}
                placeholder="1on1 제목"
                className="w-full text-xl font-bold text-gray-900 focus:outline-none border-b-2 border-transparent focus:border-blue-300 pb-0.5 transition-colors bg-transparent mb-2"
              />
              <input type="date" value={session.session_date ?? ''}
                onChange={e => updateSession({ session_date: e.target.value || null })}
                className="text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none" />
            </div>
          </div>

          {/* 기록 */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">기록</h2>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <textarea
                ref={contentRef}
                value={contentInput}
                onChange={e => setContentInput(e.target.value)}
                onBlur={saveContent}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveContent() }}
                placeholder="1on1 내용을 자유롭게 입력하세요 (포커스 이탈 시 자동 저장)"
                className="w-full text-sm focus:outline-none resize-none text-gray-700 placeholder:text-gray-300"
                style={{ minHeight: '280px' }}
              />
            </div>
          </div>

          {/* 기존 노트 (여러 토글이 있던 구 데이터) */}
          {session.notes.length > 1 && (
            <div className="mb-6">
              <p className="text-xs text-gray-400 mb-2">이전 기록</p>
              <div className="space-y-2">
                {session.notes.slice(1).map((note, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                    <p className="text-xs text-gray-400 mb-1">{note.title}</p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 다음 약속 */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">다음 약속</h2>
            <p className="text-xs text-gray-400 mb-3">다음 1on1에서 확인할 약속이나 과제</p>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <textarea
                value={nextAppointment}
                onChange={e => setNextAppointment(e.target.value)}
                onBlur={saveNextAppointment}
                placeholder="다음 1on1에서 챙길 것들을 입력하세요 (자동 저장)"
                rows={3}
                className="w-full text-sm focus:outline-none resize-none text-gray-700 placeholder:text-gray-300"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <button onClick={deleteSession} disabled={deleting}
              className="text-sm text-red-400 hover:text-red-600 transition-colors">이 기록 삭제</button>
          </div>
        </div>

        {/* 우측 패널: 이전 약속 */}
        {prevNextAppointment && (
          <div className="w-56 flex-shrink-0 sticky top-8">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-600 mb-1">이전 약속</p>
              {prevSessionDate && (
                <p className="text-xs text-amber-400 mb-2">
                  {(() => { try { return format(parseISO(prevSessionDate), 'M월 d일', { locale: ko }) } catch { return prevSessionDate } })()} 1on1
                </p>
              )}
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{prevNextAppointment}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
