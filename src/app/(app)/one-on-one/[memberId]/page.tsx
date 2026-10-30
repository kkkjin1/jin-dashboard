'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Member, OneOnOne, OneOnOneTemplate } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import OneOnOneSessionEditor, { TOP_ROW_H } from '@/components/one-on-one/OneOnOneSessionEditor'
import QaCopyMenu from '@/components/one-on-one/QaCopyMenu'
import MarkdownContent from '@/components/MarkdownContent'

const T1 = 'rgba(var(--text-rgb),0.92)'
const T2 = 'rgba(var(--text-rgb),0.55)'
const T3 = 'rgba(var(--text-rgb),0.35)'
const BORDER = 'rgba(var(--ink-rgb),0.08)'

function StripArrow({ dir, disabled, onClick }: { dir: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={dir === 'left' ? '최근 회차 쪽으로' : '이전 회차 쪽으로'}
      style={{
        flexShrink: 0, width: 24, height: 40, margin: dir === 'left' ? '0 6px 0 0' : '0 0 0 6px', borderRadius: 8,
        border: `1px solid ${BORDER}`, background: 'rgba(var(--ink-rgb),0.04)', color: T2, fontSize: 15, lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1, transition: 'opacity 120ms, background 120ms',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.1)' }}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.04)')}>
      {dir === 'left' ? '‹' : '›'}
    </button>
  )
}

// 대상자 1on1 — 2단계(대상자 → 이 화면). 왼쪽 = 지금 작성 중인(live) 회차 편집, 오른쪽 = 회차 칩 + 미리보기.
// 오른쪽에서 칩을 눌러도 미리보기만 바뀌고 왼쪽 live 편집창은 그대로다. live를 바꾸는 건
// "+ 새 1on1"과 미리보기의 "왼쪽에서 편집" 버튼뿐. live 회차는 ?s= 로 주소에 남겨
// 새로고침·예전 상세 링크(리다이렉트)가 같은 회차로 온다.
export default function MemberOneOnOnePage() {
  const { memberId } = useParams<{ memberId: string }>()
  const supabase = createClient()

  const [member, setMember] = useState<Member | null>(null)
  const [sessions, setSessions] = useState<OneOnOne[]>([])
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([])
  const [liveId, setLiveId] = useState<string | null>(null)          // 왼쪽 편집창
  const [previewId, setPreviewId] = useState<string | null>(null)    // 오른쪽 미리보기(null이면 live 직전 회차)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null)

  // 회차 칩 줄 ‹ › 화살표 — 넘칠 때만 보이고, 더 갈 쪽이 없으면 흐리게
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripEdge, setStripEdge] = useState({ left: false, right: false })
  function updateStripEdge() {
    const el = stripRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setStripEdge(prev => (prev.left === left && prev.right === right) ? prev : { left, right })
  }
  function scrollStrip(dir: 1 | -1) {
    const el = stripRef.current
    if (el) el.scrollBy({ left: dir * Math.max(140, el.clientWidth - 140), behavior: 'smooth' })
  }
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    updateStripEdge()
    const ro = new ResizeObserver(updateStripEdge)
    ro.observe(el)
    return () => ro.disconnect()
  }, [member, sessions.length, liveId])

  useEffect(() => {
    Promise.all([
      supabase.from('members').select('*').eq('id', memberId).single(),
      supabase.from('one_on_ones').select('*').eq('member_id', memberId)
        .order('session_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('one_on_one_template').select('*').order('updated_at', { ascending: false }),
    ]).then(([{ data: m }, { data: s }, { data: t }]) => {
      if (m) setMember(m as Member)
      const list = (s ?? []) as OneOnOne[]
      setSessions(list)
      const fromUrl = new URLSearchParams(window.location.search).get('s')
      const initial = list.find(x => x.id === fromUrl) ?? list[0]
      if (initial) setLiveId(initial.id)
      setTemplates((t ?? []) as OneOnOneTemplate[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  // 왼쪽 live 회차 교체 — 미리보기는 새 live의 직전 회차로 되돌린다
  function setLive(id: string | null) {
    setLiveId(id)
    setPreviewId(null)
    try { window.history.replaceState(null, '', id ? `?s=${id}` : window.location.pathname) } catch {}
  }

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
      .select('*').single()
    setCreating(false)
    setShowModal(false)
    if (data) {
      const created = data as OneOnOne
      setSessions(prev => [created, ...prev])
      setLive(created.id)
    }
  }

  // 왼쪽에서 제목·날짜·내용을 바꾸면 오른쪽 칩·미리보기에도 바로 반영
  function handleSessionChange(id: string, updates: Partial<OneOnOne>) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  function handleDeleted(id: string) {
    const idx = sessions.findIndex(s => s.id === id)
    const rest = sessions.filter(s => s.id !== id)
    setSessions(rest)
    setLive(rest[Math.min(Math.max(idx, 0), rest.length - 1)]?.id ?? null)
  }

  if (!member) return (
    <div style={{ padding: 32, color: T3, fontSize: 14 }} className="animate-pulse">불러오는 중...</div>
  )

  // 미리보기 대상 — 직접 고른 칩, 없으면 live 바로 이전(더 오래된) 회차
  const liveIdx = sessions.findIndex(s => s.id === liveId)
  const preview = sessions.find(s => s.id === previewId && s.id !== liveId)
    ?? (liveIdx >= 0 ? sessions[liveIdx + 1] : undefined)
    ?? null
  const previewContent = preview?.notes?.[0]?.content ?? ''

  // 오른쪽 칸 내용: 1행 회차 칩(편집기 제목 행과 같은 높이) · 2행 미리보기 머리줄 · 3행 본문(스크롤)
  const sidePanel = (
    <>
      <div style={{ height: TOP_ROW_H, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: `1px solid ${BORDER}` }}>
        {(stripEdge.left || stripEdge.right) && (
          <StripArrow dir="left" disabled={!stripEdge.left} onClick={() => scrollStrip(-1)} />
        )}
        <div ref={stripRef} onScroll={updateStripEdge} style={{ display: 'flex', gap: 6, overflowX: 'auto', minWidth: 0, flex: 1 }} className="scrollbar-hide">
          {sessions.map(s => {
            const isLive = s.id === liveId
            const sel = s.id === preview?.id
            const dateLabel = s.session_date ? format(parseISO(s.session_date), 'yy.M.d (E)', { locale: ko }) : '날짜 없음'
            return (
              <button key={s.id} onClick={() => { if (!isLive) setPreviewId(s.id) }} disabled={isLive}
                title={isLive ? '왼쪽에서 작성 중' : (s.title || '제목 없음')}
                style={{
                  flexShrink: 0, width: 132, textAlign: 'left', padding: '6px 10px', borderRadius: 10,
                  cursor: isLive ? 'default' : 'pointer', opacity: isLive ? 0.55 : 1,
                  background: sel ? 'rgba(76,127,224,0.16)' : 'rgba(var(--ink-rgb),0.04)',
                  border: `1px ${isLive ? 'dashed' : 'solid'} ${sel ? 'rgba(76,127,224,0.4)' : isLive ? 'rgba(var(--ink-rgb),0.25)' : BORDER}`,
                  transition: 'background 120ms, border-color 120ms',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: sel ? 'var(--accent-badge-text)' : T2 }}>{dateLabel}</span>
                  {isLive
                    ? <span style={{ fontSize: 9, color: T2, marginLeft: 'auto', flexShrink: 0 }}>작성 중</span>
                    : s.next_appointment && <span title="다음 약속 있음" style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', marginLeft: 'auto', flexShrink: 0 }} />}
                </div>
                <p style={{ fontSize: 12, color: sel ? T1 : T2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{s.title || '제목 없음'}</p>
              </button>
            )
          })}
        </div>
        {(stripEdge.left || stripEdge.right) && (
          <StripArrow dir="right" disabled={!stripEdge.right} onClick={() => scrollStrip(1)} />
        )}
      </div>

      {preview ? (
        <>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 8px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: T3, letterSpacing: '0.04em', flexShrink: 0 }}>미리보기</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T2, flexShrink: 0 }}>
              {preview.session_date ? format(parseISO(preview.session_date), 'yyyy.M.d (E)', { locale: ko }) : '날짜 없음'}
            </span>
            <span style={{ fontSize: 13, color: T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{preview.title || '(제목 없음)'}</span>
            <QaCopyMenu compact getContent={() => previewContent}
              header={`[1on1] ${member.name} · ${preview.session_date ?? '날짜 없음'}${preview.title ? ` · ${preview.title}` : ''}`} />
            <button onClick={() => setLive(preview.id)} title="이 회차를 왼쪽 편집창으로 가져옵니다"
              style={{ fontSize: 11, color: T3, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '2px 8px', cursor: 'pointer', flexShrink: 0 }}>
              ← 왼쪽에서 편집
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide" style={{ padding: '12px 16px 20px' }}>
            {previewContent
              ? <MarkdownContent content={previewContent} dark expandToggles className="text-[13px]" />
              : <p style={{ fontSize: 12, color: T3 }}>기록 내용 없음</p>}
            {preview.next_appointment && (
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px dashed ${BORDER}` }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#fbbf24' }}>이때 정한 다음 약속</span>
                <p style={{ fontSize: 12, color: T2, whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 4 }}>{preview.next_appointment}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <p style={{ flex: 1, fontSize: 12, color: T3, textAlign: 'center', padding: '40px 0' }}>미리볼 다른 회차가 없습니다</p>
      )}
    </>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/one-on-one"
            style={{ fontSize: 12, color: T3, textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => (e.currentTarget.style.color = T2)}
            onMouseLeave={e => (e.currentTarget.style.color = T3)}>
            ← 목록
          </Link>
          <div style={{ width: 1, height: 14, background: BORDER }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(76,127,224,0.2)', border: '1.5px solid rgba(76,127,224,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-badge-text)', fontWeight: 700, fontSize: 13 }}>
              {member.name[0]}
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: T1 }}>{member.name}</span>
            <span style={{ fontSize: 11, color: T3, background: 'rgba(var(--ink-rgb),0.07)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '1px 7px' }}>{member.part}</span>
          </div>
        </div>
        {/* live 회차의 일자·복사·다운로드·삭제 — 편집창이 portal로 채운다 */}
        <div ref={setActionsSlot} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end', margin: '0 12px' }} />
        <button onClick={() => setShowModal(true)}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'rgba(76,127,224,0.15)', color: 'var(--accent-badge-text)', border: '1px solid rgba(76,127,224,0.3)', cursor: 'pointer', transition: 'background 150ms' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(76,127,224,0.22)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(76,127,224,0.15)')}>
          + 새 1on1
        </button>
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 64, color: T3, fontSize: 13 }}>아직 1on1 기록이 없습니다</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, borderTop: `1px solid ${BORDER}` }}>
          {liveId ? (
            <OneOnOneSessionEditor key={liveId}
              memberId={memberId} sessionId={liveId}
              sidePanel={sidePanel}
              actionsSlot={actionsSlot}
              onSessionChange={handleSessionChange}
              onDeleted={handleDeleted} />
          ) : (
            <div style={{ textAlign: 'center', paddingTop: 64, color: T3, fontSize: 13 }}>회차를 선택하세요</div>
          )}
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
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <p style={{ fontSize: 13, fontWeight: 500, color: T1, marginBottom: 2 }}>빈 양식</p>
                <p style={{ fontSize: 11, color: T3 }}>백지 상태로 시작</p>
              </button>
              {templates.map(t => (
                <button key={t.id} onClick={() => createSession(t.id)} disabled={creating}
                  style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 12, border: `1px solid ${BORDER}`, background: 'transparent', cursor: 'pointer', transition: 'background 150ms', width: '100%', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: T1, marginBottom: 2 }}>{t.title}</p>
                  <p style={{ fontSize: 11, color: T3 }}>템플릿으로 시작</p>
                </button>
              ))}
              {templates.length === 0 && (
                <p style={{ fontSize: 11, color: T3, padding: '0 4px' }}>
                  저장된 템플릿이 없습니다 · <Link href="/one-on-one/template" style={{ color: 'var(--accent-badge-text)' }}>템플릿 만들기</Link>
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
