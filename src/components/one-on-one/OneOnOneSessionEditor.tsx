'use client'

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
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
export const TOP_ROW_H = 60   // 왼쪽 제목 행 = 오른쪽 회차 칩 행 높이(좌우 카드 첫 줄 맞춤)

// 대상자 화면(/one-on-one/[memberId])의 1on1 편집창 — 왼쪽은 지금 작성 중인(live) 회차 편집,
// 오른쪽 칸은 크기만 잡아 두고 내용(회차 칩·미리보기)은 부모가 sidePanel로 채운다.
// live 회차가 바뀔 때만 부모가 key로 재마운트한다(오른쪽 미리보기 선택은 이 컴포넌트와 무관).
export default function OneOnOneSessionEditor({ memberId, sessionId, sidePanel, actionsSlot, onSessionChange, onDeleted }: {
  memberId: string
  sessionId: string
  sidePanel: React.ReactNode                                // 오른쪽 미리보기 칸 내용
  actionsSlot?: HTMLElement | null                          // 일자·복사·삭제 버튼을 보낼 부모 머리줄 자리
  onSessionChange?: (id: string, updates: Partial<OneOnOne>) => void   // 제목·날짜 등 바뀌면 위 칩에도 반영
  onDeleted: (id: string) => void
}) {
  const supabase = createClient()

  const [session, setSession]               = useState<OneOnOne | null>(null)
  const [member, setMember]                 = useState<Member | null>(null)
  const [prevNextAppointment, setPrevNext]  = useState<string | null>(null)
  const [prevSessionDate, setPrevDate]      = useState<string | null>(null)
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

  // 왼쪽(입력)·오른쪽(이전 기록) 분할 너비 — 가운데 손잡이를 끌어 조절, 새로고침해도 유지(localStorage).
  // null이면 기본 반반. 더블클릭하면 기본으로 되돌린다.
  const [leftW, setLeftW] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try { const v = Number(localStorage.getItem('oneOnOne.leftW')); if (v > 0) setLeftW(v) } catch {}
  }, [])
  function startSplitDrag(e: React.PointerEvent) {
    if (!leftRef.current || !bodyRef.current) return
    e.preventDefault()
    const startX = e.clientX
    const startW = leftRef.current.getBoundingClientRect().width
    const maxW = bodyRef.current.getBoundingClientRect().width - 280   // 오른쪽 이전 기록이 최소한 보이게
    let last = startW
    const onMove = (ev: PointerEvent) => { last = Math.round(Math.min(maxW, Math.max(420, startW + ev.clientX - startX))); setLeftW(last) }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      try { localStorage.setItem('oneOnOne.leftW', String(last)) } catch {}
    }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }
  function resetSplit() {
    setLeftW(null)
    try { localStorage.removeItem('oneOnOne.leftW') } catch {}
  }

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
    onSessionChange?.(sessionId, updates)
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
    onDeleted(sessionId)
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

  // 1on1 일자·복사·다운로드·삭제 — 부모가 머리줄에 자리(actionsSlot)를 주면 그리로 보내
  // 별도 행을 없앤다(그만큼 입력란이 길어짐). 자리가 없으면 예전처럼 위에 한 줄로 둔다.
  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: T3 }}>1on1 일자</span>
      <input type="date" value={session.session_date ?? ''}
        onChange={e => updateSession({ session_date: e.target.value || null })}
        style={{ fontSize: 11, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '3px 8px', background: 'rgba(var(--ink-rgb),0.05)', color: T2, outline: 'none' }} />
      <div style={{ width: 1, height: 12, background: BORDER, margin: '0 2px' }} />
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
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {actionsSlot
        ? createPortal(actions, actionsSlot)
        : <div style={{ padding: '12px 20px', flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}>{actions}</div>}

      {/* 본문 — 왼쪽: 입력 영역(제목 + 기록 + 하단 약속 박스) 고정, 오른쪽: 이전 기록만 스크롤.
          1on1은 회의보다 길고 구조화가 어려워 입력과 과거 기록을 동시에 넓게 보게 한다.
          (lg 미만은 좌우 반반이 비좁아 전체 스크롤로 쌓는다) */}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, padding: '14px 20px 0' }} className="flex flex-col lg:flex-row gap-[14px] lg:gap-0 overflow-y-auto lg:overflow-hidden scrollbar-hide">

        {/* ── 왼쪽: 입력 (고정) — 너비는 가운데 손잡이로 조절(기본 반반) ── */}
        <div ref={leftRef} className="flex flex-col gap-3 lg:w-[var(--oo-left-w,50%)] lg:min-w-[420px] lg:h-full lg:pb-4 flex-shrink-0 min-w-0"
          style={leftW ? { '--oo-left-w': `${leftW}px` } as React.CSSProperties : undefined}>
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

          {/* 기록 카드 — 1행 제목(오른쪽 회차 칩 행과 같은 높이) · 2행 에디터 */}
          <div className="surface-card rounded-2xl overflow-hidden lg:flex-1 min-h-[300px] lg:min-h-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: TOP_ROW_H, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderBottom: `1px solid ${BORDER}` }}>
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
              style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 700, color: T1, background: 'transparent', border: 'none', borderBottom: '2px solid transparent', outline: 'none', paddingBottom: 2, transition: 'border-color 150ms' }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = 'rgba(76,127,224,0.5)')}
              onBlurCapture={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
            />
          </div>

            <div style={{ padding: '4px 20px 16px', flex: 1, minHeight: 0, overflowY: 'auto' }} className="scrollbar-hide">
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
              {/* 구 노트 데이터 — 이 회차에 예전 형식으로 남은 추가 노트 */}
              {session.notes.length > 1 && (
                <div style={{ padding: '12px 0 0' }}>
                  <p style={{ fontSize: 11, color: T3, marginBottom: 8 }}>구 노트</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {session.notes.slice(1).map((note, idx) => (
                      <div key={idx} style={{ padding: 12, borderRadius: 10, border: `1px solid ${BORDER}` }}>
                        <p style={{ fontSize: 11, color: T3, marginBottom: 6 }}>{note.title}</p>
                        <MarkdownContent content={note.content} dark className="text-[13px]" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 좌·우 분할 손잡이 (lg 이상) — 끌어서 너비 조절, 더블클릭으로 반반 복귀 */}
        <div onPointerDown={startSplitDrag} onDoubleClick={resetSplit} title="끌어서 너비 조절 · 더블클릭하면 반반으로"
          className="hidden lg:flex group" style={{ width: 14, flexShrink: 0, alignItems: 'center', justifyContent: 'center', cursor: 'col-resize', touchAction: 'none' }}>
          <div className="opacity-40 group-hover:opacity-100" style={{ width: 4, height: 44, borderRadius: 2, background: 'rgba(var(--ink-rgb),0.25)', transition: 'opacity 120ms' }} />
        </div>

        {/* ── 오른쪽: 미리보기 패널 — 칸은 여기서 카드 하나로 고정해 두고 내용(회차 칩·미리보기)은
            부모가 채운다. 오른쪽에서 무엇을 눌러도 왼쪽 편집창(live)은 바뀌지 않는다. ── */}
        <div className="surface-card rounded-2xl overflow-hidden lg:flex-1 lg:min-w-0 lg:h-[calc(100%-16px)] min-h-[320px] flex flex-col">
          {sidePanel}
          {/* ── 미리보기 칸 맨 아래: live 회차의 이전 약속 · 다음 약속 (작은 박스 2개 나란히) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-shrink-0" style={{ padding: '10px 12px 12px', borderTop: `1px solid ${BORDER}` }}>
            {/* 이전 약속 — 내용이 없어도 박스는 항상 보인다 */}
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '10px 14px', height: 140, overflowY: 'auto', minWidth: 0 }} className="scrollbar-hide">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24', letterSpacing: '0.02em' }}>이전 약속</span>
                {prevDateLabel && <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.5)' }}>{prevDateLabel}</span>}
              </div>
              {prevNextAppointment
                ? <p style={{ fontSize: 12, color: 'rgba(253,230,138,0.82)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{prevNextAppointment}</p>
                : <p style={{ fontSize: 12, color: T3 }}>{prevSessionDate ? '직전 1on1에서 정한 약속 없음' : '첫 1on1 — 이전 약속 없음'}</p>}
            </div>

          {/* 다음 약속 */}
          <div style={{ height: 140, minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: 12, border: `1px solid ${BORDER}`, background: 'rgba(var(--ink-rgb),0.03)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px 0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {nextAppointmentAutosave.recovered && (
                <div className="flex items-center gap-2 rounded-lg"
                  style={{ padding: '4px 10px', marginBottom: 6, background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: 'var(--accent-soft)', fontSize: 11 }}>
                  <span style={{ flex: 1 }}>복구 가능한 자동저장 내용</span>
                  <button onClick={applyRecoveredNextAppointment} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11 }}>적용</button>
                  <button onClick={() => nextAppointmentAutosave.discardRecovered()} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11 }}>무시</button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T3, letterSpacing: '0.04em', marginRight: 'auto' }} title="다음 1on1에서 확인할 약속이나 과제">다음 약속</span>
                <input type="date" value={nextAppointmentDate} title="다음 1on1 일자 (일정탭 연동)"
                  onChange={e => { setNextAppointmentDate(e.target.value); saveNextAppointmentDate(e.target.value) }}
                  style={{ fontSize: 10, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '2px 6px', background: 'rgba(var(--ink-rgb),0.06)', color: T2, outline: 'none' }} />
                {nextAppointmentDate && (
                  <button onClick={() => { setNextAppointmentDate(''); saveNextAppointmentDate('') }}
                    style={{ fontSize: 10, color: T3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = T3)}>× 제거</button>
                )}
              </div>
              <textarea value={nextAppointment}
                onChange={e => handleNextAppointmentChange(e.target.value)}
                onBlur={saveNextAppointment}
                placeholder="다음 1on1에서 챙길 것들"
                style={{ width: '100%', flex: 1, minHeight: 0, fontSize: 12, color: T1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', lineHeight: 1.6, paddingBottom: 8 }}
                className="placeholder:text-[rgba(var(--text-rgb),0.25)] scrollbar-hide" />
            </div>
          </div>

          </div>
        </div>
      </div>
    </div>
  )
}
