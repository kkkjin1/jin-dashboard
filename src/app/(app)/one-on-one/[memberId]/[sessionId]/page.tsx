'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { useAutosave } from '@/hooks/useAutosave'
import type { OneOnOne, Member, NoteEntry } from '@/types'
import dynamic from 'next/dynamic'
import MarkdownContent from '@/components/MarkdownContent'
import QaCopyMenu from '@/components/one-on-one/QaCopyMenu'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

const T1 = 'rgba(var(--text-rgb),0.92)'
const T2 = 'rgba(var(--text-rgb),0.55)'
const T3 = 'rgba(var(--text-rgb),0.35)'
const BORDER = 'rgba(var(--ink-rgb),0.08)'
const MEMBER_COLOR = 'var(--accent-primary)'

export default function OneOnOneSessionPage() {
  const { memberId, sessionId } = useParams<{ memberId: string; sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession]               = useState<OneOnOne | null>(null)
  const [member, setMember]                 = useState<Member | null>(null)
  const [prevNextAppointment, setPrevNext]  = useState<string | null>(null)
  const [prevSessionDate, setPrevDate]      = useState<string | null>(null)
  // 하단 '이전 기록' — 이 세션보다 앞선 기록 전부(최신순). 모두 접힌 토글로 시작
  const [prevSessions, setPrevSessions]     = useState<OneOnOne[]>([])
  const [openPrevIds, setOpenPrevIds]       = useState<Set<string>>(new Set())
  const [titleInput, setTitleInput]         = useState('')
  const [contentInput, setContentInput]     = useState('')
  const [nextAppointment, setNextAppointment]       = useState('')
  const [nextAppointmentDate, setNextAppointmentDate] = useState('')
  const [deleting, setDeleting]             = useState(false)

  // 저장 실패 안내 — canonical write 실패 시 표시(STEP D 패턴 재사용). 이 화면의 모든
  // canonical write(updateSession/deleteSession)가 공유하는 단일 공통 에러 상태.
  const [saveError, setSaveError] = useState('')
  const SAVE_ERROR_MSG   = '저장 실패 — 화면에는 반영됐지만 서버에 저장되지 않았을 수 있습니다. 새로고침 후 다시 확인해주세요.'
  const DELETE_ERROR_MSG = '삭제 실패 — 잠시 후 다시 시도해주세요.'

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
          const earlier = (allSessions as OneOnOne[]).slice(0, idx).reverse()
          setPrevSessions(earlier)
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

  // 세션 화면의 모든 canonical write(제목/날짜/기록내용/다음약속)가 공유하는 단일
  // 진입점 — 이전엔 error를 전혀 체크하지 않아 저장 실패가 사용자에게 조용히
  // 묻혔다(STEP D 그룹1/2와 달리 1on1 화면은 그동안 대상에서 빠져 있었음).
  async function updateSession(updates: Partial<OneOnOne>) {
    const { error } = await supabase.from('one_on_ones').update(updates).eq('id', sessionId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSession(prev => prev ? { ...prev, ...updates } : prev)
  }

  // Autosave 안전망(제목/기록내용/다음약속) — canonical UPDATE(updateSession)는 그대로
  // 유지, 이 훅은 autosave_drafts/content_versions에만 병행 기록한다. entity_id는
  // 항상 실존하는 one_on_ones.id(URL 파라미터)이므로 qid/rebind 불필요.
  // 복구 배너(Quick Memo/Meeting과 동일 패턴) — 각 훅이 반환하는 recovered를 직접 읽어
  // "적용" 버튼으로만 반영한다(자동 적용 안 함, architecture Ch.6). 이 배너는 canonical
  // save 로직과 무관 — 화면에 보여주고 사용자가 누르면 기존 input state만 갱신한다.
  // enabled를 sessionId가 아닌 session(로드 완료 후)으로 건다 — sessionId는 URL에서
  // 즉시 나오지만 titleInput 등은 load() effect가 비동기로 채우기 전까지 초기값('')이라,
  // sessionId만으로 활성화하면 훅의 mount-time recovery 비교가 아직 안 채워진 ''과 로컬
  // 버퍼값을 비교해 값이 실제로 같아도 매번 거짓 복구 배너를 띄우는 걸 로컬 재현으로 확인함.
  const titleAutosave = useAutosave({
    supabase,
    enabled: !!session,
    entityType: 'one_on_one',
    entityId: sessionId,
    fieldKey: 'title',
    value: titleInput,
  })
  const contentAutosave = useAutosave({
    supabase,
    enabled: !!session,
    entityType: 'one_on_one',
    entityId: sessionId,
    fieldKey: 'content',
    value: contentInput,
  })
  const nextAppointmentAutosave = useAutosave({
    supabase,
    enabled: !!session,
    entityType: 'one_on_one',
    entityId: sessionId,
    fieldKey: 'next_appointment',
    value: nextAppointment,
  })

  // 타이핑 직후 새로고침/탭 닫기 시 canonical debounce(500~1500ms)뿐 아니라 이 훅의
  // 로컬 버퍼 기록(700ms debounce)까지 아직 안 돈 상태로 유실될 수 있음을 실제
  // 재현으로 확인함(브라우저가 새로고침을 그 어떤 pending effect보다 먼저 처리).
  // pagehide/beforeunload 시점에 각 필드의 flush()를 강제로 걸어 최소한 그 순간의
  // 값이라도 autosave_drafts에 밀어넣을 기회를 준다 — canonical save 로직(updateSession
  // 등)은 그대로 두고 이 안전망 쪽에만 추가. 완전한 해결은 아니다: 브라우저가 페이지를
  // 그 자리에서 바로 죽여버리면 flush()가 걸어놓은 요청도 못 나갈 수 있다 — 유실
  // "창을 줄이는" 조치일 뿐, unmount-flush가 없던 이전보다 나아지는 정도로 이해한다.
  const titleFlush = titleAutosave.flush
  const contentFlush = contentAutosave.flush
  const nextAppointmentFlush = nextAppointmentAutosave.flush
  useEffect(() => {
    function flushAll() {
      titleFlush()
      contentFlush()
      nextAppointmentFlush()
    }
    window.addEventListener('pagehide', flushAll)
    window.addEventListener('beforeunload', flushAll)
    return () => {
      window.removeEventListener('pagehide', flushAll)
      window.removeEventListener('beforeunload', flushAll)
    }
  }, [titleFlush, contentFlush, nextAppointmentFlush])

  // TiptapEditor는 마운트 시 content를 한 번만 읽는 비제어 컴포넌트라, contentInput을
  // 바꾸는 것만으로는 화면이 갱신되지 않는다 — 복구 적용 시 key를 올려 강제 재마운트한다.
  const [contentEditorKey, setContentEditorKey] = useState(0)

  // 적용 시 상태만 바꾸고 끝내면, 이후 사용자가 그 필드를 다시 건드리지 않는 한
  // 복구된 값이 canonical에는 반영되지 않은 채로 남는다(다시 새로고침하면 또
  // 사라짐) — 그래서 기존 저장 함수(updateSession/saveContent, 로직 자체는 무수정)를
  // 그대로 재사용해 복구 즉시 canonical에도 반영되게 한다. 대기 중이던 debounce
  // 타이머는 지워서 이전 입력값으로 덮어쓰지 않게 한다.
  function applyRecoveredTitle() {
    if (!titleAutosave.recovered) return
    const v = titleAutosave.recovered.value
    setTitleInput(v)
    titleAutosave.discardRecovered()
    updateSession({ title: v.trim() || null })
  }
  function applyRecoveredContent() {
    if (!contentAutosave.recovered) return
    const v = contentAutosave.recovered.value
    clearTimeout(saveTimer.current)
    setContentInput(v)
    setContentEditorKey(k => k + 1)
    contentAutosave.discardRecovered()
    saveContent(v)
  }
  function applyRecoveredNextAppointment() {
    if (!nextAppointmentAutosave.recovered) return
    const v = nextAppointmentAutosave.recovered.value
    clearTimeout(nextAppointmentSaveTimer.current)
    setNextAppointment(v)
    nextAppointmentAutosave.discardRecovered()
    updateSession({ next_appointment: v.trim() || null })
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
    const { error } = await supabase.from('one_on_ones').delete().eq('id', sessionId)
    if (error) {
      setSaveError(DELETE_ERROR_MSG)
      setDeleting(false)
      return
    }
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
            style={{ fontSize: 11, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '3px 8px', background: 'rgba(var(--ink-rgb),0.05)', color: T2, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <QaCopyMenu getContent={() => contentInput}
            header={`[1on1] ${member.name} · ${session.session_date ?? '날짜 없음'}${titleInput.trim() ? ` · ${titleInput.trim()}` : ''}`} />
          <button onClick={handleDownload}
            style={{ fontSize: 11, color: T3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 12px', background: 'transparent', cursor: 'pointer', transition: 'color 150ms, background 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = T2; e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.color = T3; e.currentTarget.style.background = 'transparent' }}>
            MD 다운로드
          </button>
          <button onClick={deleteSession} disabled={deleting}
            style={{ fontSize: 11, color: 'rgba(248,113,113,0.6)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '4px 12px', background: 'transparent', cursor: 'pointer', transition: 'color 150ms, background 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.6)'; e.currentTarget.style.background = 'transparent' }}>
            이 기록 삭제
          </button>
        </div>
      </div>

      {/* 본문 — 위 절반: 입력 영역(제목 + 8:2 기록|약속) 고정, 아래 절반: 이전 기록만 스크롤.
          제목은 두 박스 위 전체 폭 줄에 둬서 기록·다음 약속 박스의 시작선/높이를 맞춘다.
          1on1은 회의보다 길고 구조화가 어려워 입력과 과거 기록을 동시에 넓게 보게 한다.
          (lg 미만은 한 화면에 반반이 비좁아 전체 스크롤로 쌓는다) */}
      <div style={{ flex: 1, minHeight: 0, padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }} className="overflow-y-auto lg:overflow-hidden scrollbar-hide">

        {/* ── 위 절반: 입력 (고정) ── */}
        <div className="flex flex-col gap-3 lg:h-1/2 lg:min-h-[300px] flex-shrink-0">
          {/* 저장 실패 안내 — canonical write 실패 시 표시 */}
          {saveError && (
            <div className="flex items-center gap-2 rounded-xl"
              style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--error-badge-text)', fontSize: 12 }}>
              <span>⚠</span>
              <span style={{ flex: 1 }}>{saveError}</span>
              <button onClick={() => setSaveError('')} style={{ fontSize: 10, opacity: 0.7, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>닫기</button>
            </div>
          )}

          {/* 제목 복구 배너 */}
          {titleAutosave.recovered && (
            <div className="flex items-center gap-2 rounded-lg"
              style={{ padding: '8px 14px', background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: 'var(--accent-soft)', fontSize: 12 }}>
              <span style={{ flex: 1 }}>복구 가능한 자동저장 내용이 있습니다</span>
              <button onClick={applyRecoveredTitle} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>적용</button>
              <button onClick={() => titleAutosave.discardRecovered()} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>무시</button>
            </div>
          )}

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


        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] gap-4 lg:flex-1 lg:min-h-0">

          {/* ── 8: 이번 1on1 기록 ── */}
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 기록 에디터 */}
          <div className="surface-card rounded-2xl overflow-hidden" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 20px 8px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>기록</span>
            </div>
            <div style={{ padding: '0 20px 16px', flex: 1, minHeight: 0, overflowY: 'auto' }} className="scrollbar-hide">
              {contentAutosave.recovered && (
                <div className="flex items-center gap-2 rounded-lg"
                  style={{ padding: '8px 14px', marginBottom: 8, background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: 'var(--accent-soft)', fontSize: 12 }}>
                  <span style={{ flex: 1 }}>복구 가능한 자동저장 내용이 있습니다</span>
                  <button onClick={applyRecoveredContent} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>적용</button>
                  <button onClick={() => contentAutosave.discardRecovered()} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>무시</button>
                </div>
              )}
              <TiptapEditor
                key={contentEditorKey}
                dark
                value={contentInput}
                onChange={handleContentChange}
                autoFocus={false}
                enableToggle
                enableQa
                minHeight={200}
              />
            </div>
          </div>

          </div>

          {/* ── 2: 이전 약속 확인 + 다음 약속 ── */}
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 이전 약속 */}
            {prevNextAppointment && (
              <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: '12px 14px', flexShrink: 0, maxHeight: '40%', overflowY: 'auto' }} className="scrollbar-hide">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24', letterSpacing: '0.02em' }}>이전 약속</span>
                  {prevDateLabel && <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.5)' }}>{prevDateLabel}</span>}
                </div>
                <p style={{ fontSize: 13, color: 'rgba(253,230,138,0.82)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{prevNextAppointment}</p>
              </div>
            )}

          {/* 다음 약속 */}
          <div className="surface-card rounded-2xl overflow-hidden" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>다음 약속</span>
              <p style={{ fontSize: 11, color: T3, marginTop: 1, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>다음 1on1에서 확인할 약속이나 과제</p>
            </div>
            <div style={{ padding: '12px 16px 16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {nextAppointmentAutosave.recovered && (
                <div className="flex items-center gap-2 rounded-lg"
                  style={{ padding: '8px 14px', marginBottom: 8, background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: 'var(--accent-soft)', fontSize: 12 }}>
                  <span style={{ flex: 1 }}>복구 가능한 자동저장 내용이 있습니다</span>
                  <button onClick={applyRecoveredNextAppointment} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>적용</button>
                  <button onClick={() => nextAppointmentAutosave.discardRecovered()} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}>무시</button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, color: T2, fontWeight: 500, whiteSpace: 'nowrap' }}>다음 1on1 일자</span>
                <input type="date" value={nextAppointmentDate}
                  onChange={e => { setNextAppointmentDate(e.target.value); saveNextAppointmentDate(e.target.value) }}
                  style={{ fontSize: 11, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 8px', background: 'rgba(var(--ink-rgb),0.06)', color: T2, outline: 'none' }} />
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
                rows={8}
                style={{ width: '100%', flex: 1, minHeight: 0, fontSize: 13, color: T1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', lineHeight: 1.65 }}
                className="placeholder:text-[rgba(var(--text-rgb),0.25)]" />
            </div>
          </div>

          </div>
        </div>
        </div>

        {/* ── 아래 절반: 이전 기록 (이 영역만 스크롤) ── */}
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-hide flex flex-col gap-5" style={{ paddingBottom: 28 }}>

        {/* 구 노트 데이터 */}
          {session.notes.length > 1 && (
            <div>
              <p style={{ fontSize: 11, color: T3, marginBottom: 8 }}>구 노트</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {session.notes.slice(1).map((note, idx) => (
                  <div key={idx} className="surface-card rounded-xl" style={{ padding: 14 }}>
                    <p style={{ fontSize: 11, color: T3, marginBottom: 6 }}>{note.title}</p>
                    <MarkdownContent content={note.content} dark className="text-[13px]" />
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* ── 하단: 이전 기록 (최신순, 모두 접힌 토글) ── */}
        {prevSessions.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T3, letterSpacing: '0.04em' }}>이전 기록</span>
              <span style={{ fontSize: 10, color: T3, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '1px 8px' }}>{prevSessions.length}건</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {prevSessions.map(ps => {
                const open = openPrevIds.has(ps.id)
                const content = ps.notes?.[0]?.content ?? ''
                const dateLabel = ps.session_date ? format(parseISO(ps.session_date), 'yyyy.M.d (E)', { locale: ko }) : '날짜 없음'
                return (
                  <div key={ps.id} className="surface-card rounded-2xl overflow-hidden">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px' }}>
                      <button onClick={() => setOpenPrevIds(prev => { const n = new Set(prev); if (n.has(ps.id)) n.delete(ps.id); else n.add(ps.id); return n })}
                        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                        <span style={{ fontSize: 11, color: T3, flexShrink: 0, transition: 'transform 200ms', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>▾</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T2, flexShrink: 0 }}>{dateLabel}</span>
                        <span style={{ fontSize: 13, color: T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ps.title || '(제목 없음)'}</span>
                      </button>
                      <QaCopyMenu compact getContent={() => content}
                        header={`[1on1] ${member.name} · ${ps.session_date ?? '날짜 없음'}${ps.title ? ` · ${ps.title}` : ''}`} />
                      <Link href={`/one-on-one/${memberId}/${ps.id}`} style={{ fontSize: 11, color: T3, textDecoration: 'none', flexShrink: 0 }}>열기 →</Link>
                    </div>
                    {open && (
                      <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 20px 16px' }}>
                        {content
                          ? <MarkdownContent content={content} dark className="text-[13px]" />
                          : <p style={{ fontSize: 12, color: T3 }}>기록 내용 없음</p>}
                        {ps.next_appointment && (
                          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${BORDER}` }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#fbbf24' }}>이때 정한 다음 약속</span>
                            <p style={{ fontSize: 12, color: T2, whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 4 }}>{ps.next_appointment}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
