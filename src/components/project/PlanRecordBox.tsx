'use client'

// 안건 상세 B "기획 기록" 박스 — 세부task(kind='record') 하나 = 이름 붙인 기록 하나.
// 날짜 목록 없이 본문 하나(agenda_sub_tasks.body)만 두고, 기본은 투명 유리 + 박스별 색 선택.
// 실행 task에서 바꿔 온 박스라 날짜별 기록(sub_task_notes)이 남아 있으면 "이전 기록"으로 접어서 보여준다.
import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAutosave } from '@/hooks/useAutosave'
import { SketchTextEditor } from '@/components/sketch/SketchTextEditor'
import { PLAN_BOX_COLORS, PLAN_BOX_COLOR_KEYS, planBoxColor, type PlanBoxColorKey } from '@/lib/planBoxColors'
import type { AgendaSubTask } from '@/types'

const BODY_SAVE_MS = 600

interface PrevNote { id: string; content: string; created_at: string; title?: string | null }

function shortDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return '오늘'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function PlanRecordBox({
  st, prevNotes, isOpen, autoRename, focusNoteId, supabase,
  onToggle, onRename, onColor, onDelete, onConvert, onBodySaved, onSaveError,
}: {
  st: AgendaSubTask
  prevNotes: PrevNote[]
  isOpen: boolean
  /** 방금 만든 박스면 이름 입력 상태로 시작 */
  autoRename?: boolean
  /** 의사결정 탭 "원본 →"이 가리키는 예전 기록 — 있으면 '이전 기록'을 펼친 채로 시작 */
  focusNoteId?: string | null
  supabase: SupabaseClient
  onToggle: () => void
  onRename: (title: string) => void
  onColor: (key: PlanBoxColorKey | null) => void
  onDelete: () => void
  onConvert: () => void
  onBodySaved: (html: string) => void
  onSaveError: () => void
}) {
  const pal = planBoxColor(st.color)
  const [body, setBody] = useState(st.body ?? '')
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(!!autoRename)
  const [nameVal, setNameVal] = useState(st.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [prevOpen, setPrevOpen] = useState(() => !!focusNoteId && prevNotes.some(n => n.id === focusNoteId))
  // 박스가 overflow-hidden이 아니어도 B 칸이 스크롤 영역이라, 색 선택 창은 fixed로 띄운다
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number } | null>(null)

  useAutosave({ supabase, enabled: editing, entityType: 'agenda_sub_task', entityId: st.id, fieldKey: 'body', value: body })

  // 디바운스 저장 — 박스가 닫히거나 화면을 벗어나면 남은 저장을 바로 보낸다
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<string | null>(null)
  const saveRef = useRef<(html: string) => void>(() => {})
  useEffect(() => {
    saveRef.current = (html: string) => {
      supabase.from('agenda_sub_tasks').update({ body: html }).eq('id', st.id)
        .then(({ error }) => { if (error) onSaveError(); else onBodySaved(html) })
    }
  })
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (pending.current !== null) saveRef.current(pending.current)
  }, [])
  function queueSave(html: string) {
    pending.current = html
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { pending.current = null; saveRef.current(html) }, BODY_SAVE_MS)
  }

  useEffect(() => {
    if (!pickerPos) return
    const close = () => setPickerPos(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('pointerdown', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('pointerdown', close) }
  }, [pickerPos])

  function commitName() {
    const t = nameVal.trim()
    setRenaming(false)
    if (!t) { setNameVal(st.title); return }
    if (t !== st.title) onRename(t)
  }

  const edited = st.updated_at && shortDate(st.updated_at) !== shortDate(st.created_at)
  const boxStyle: React.CSSProperties = pal
    ? { background: pal.bg, border: `1px solid ${pal.line}` }
    : {
        // 유리(기본) — 반투명 표면 + 흐림 + 윗변 하이라이트
        background: 'color-mix(in srgb, var(--surface-primary) 62%, transparent)',
        border: '1px solid rgba(var(--ink-rgb),0.08)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 1px 2px rgba(16,24,40,0.05), inset 0 1px 0 rgba(255,255,255,0.35)',
      }

  // 유리 박스의 backdrop-filter는 fixed 자식의 기준이 되어 색 선택 창이 잘리므로, 선택 창은 박스 밖(형제)에 둔다
  return (
    <>
    <div id={`rec-${st.id}`} className="rounded-[14px] overflow-hidden group/rec transition-colors" style={boxStyle}>
      {/* 머리줄 — 이름 · 색 · 날짜 */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none" onClick={() => { if (!renaming) onToggle() }}>
        <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)', display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
        <button type="button" aria-label="박스 색 고르기" title="박스 색"
          onClick={e => {
            e.stopPropagation()
            if (pickerPos) { setPickerPos(null); return }
            const r = e.currentTarget.getBoundingClientRect()
            setPickerPos({ left: r.left - 8, top: r.bottom + 8 })
          }}
          className="w-3 h-3 rounded-full flex-shrink-0 transition-transform hover:scale-125"
          style={pal
            ? { background: pal.dot, boxShadow: `0 0 0 2px var(--surface-primary), 0 0 0 3.5px ${pal.dot}` }
            : { border: '1.5px dashed rgba(var(--text-rgb),0.35)', background: 'transparent' }} />
        {renaming ? (
          <input autoFocus value={nameVal}
            onFocus={e => e.currentTarget.select()}
            onClick={e => e.stopPropagation()}
            onChange={e => setNameVal(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitName()
              if (e.key === 'Escape') { setNameVal(st.title); setRenaming(false) }
            }}
            onBlur={commitName}
            className="flex-1 min-w-0 text-[12.5px] font-semibold bg-transparent border-b border-[rgba(var(--ink-rgb),0.3)] focus:outline-none" />
        ) : (
          <span className="flex-1 min-w-0 text-[12.5px] font-semibold truncate"
            onDoubleClick={e => { e.stopPropagation(); setNameVal(st.title); setRenaming(true) }}
            title="두 번 클릭해서 이름 바꾸기">{st.title}</span>
        )}
        {/* 호버 메뉴 */}
        {!renaming && (
          <span className="flex items-center gap-1.5 opacity-0 group-hover/rec:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => { setNameVal(st.title); setRenaming(true) }}
              className="text-[10px] text-[rgba(var(--text-rgb),0.45)] hover:text-[rgba(var(--text-rgb),0.85)]" title="이름 바꾸기">✏</button>
            <button type="button" onClick={onConvert}
              className="text-[10px] text-[rgba(var(--text-rgb),0.45)] hover:text-[rgba(var(--text-rgb),0.85)] whitespace-nowrap" title="할 일로 옮기기">할 일로</button>
            {confirmDelete ? (
              <>
                <button type="button" onClick={onDelete} className="text-[10px] text-red-500 font-semibold">삭제</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-[10px] text-[rgba(var(--text-rgb),0.45)]">취소</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="text-[10px] text-[rgba(var(--text-rgb),0.35)] hover:text-red-400">삭제</button>
            )}
          </span>
        )}
        <span className="text-[10.5px] flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
          {shortDate(st.created_at)}{edited ? ` · ${shortDate(st.updated_at!)} 수정` : ''}
        </span>
      </div>

      {/* 본문 하나 */}
      {isOpen && (
        <div className="mx-1.5 mb-1.5 rounded-[10px] px-3.5 pb-3"
          style={{ background: 'var(--surface-primary)', paddingTop: editing ? 34 : 10 }}>
          <SketchTextEditor
            content={body}
            onContentChange={html => { setBody(html); queueSave(html) }}
            editing={editing}
            onEnterEdit={() => setEditing(true)}
            onExitEdit={() => setEditing(false)}
            fallbackFontSize={12}
            placeholder="내용을 적어보세요…"
            textColor="var(--text-primary)"
            variant="document"
            enableVoice
            allowImages
            docMinHeight={40}
            scrollOnInitialFocus={false}
          />
          {prevNotes.length > 0 && (
            <div className="mt-3 pt-2 border-t border-[rgba(var(--ink-rgb),0.07)]">
              <button type="button" onClick={() => setPrevOpen(o => !o)}
                className="text-[11px] text-[rgba(var(--text-rgb),0.5)] hover:text-[rgba(var(--text-rgb),0.8)]">
                {prevOpen ? '▾' : '▸'} 이전 기록 {prevNotes.length}건
              </button>
              {prevOpen && (
                <div className="mt-2 flex flex-col gap-2">
                  {prevNotes.map(n => (
                    <div key={n.id} className="rounded-lg px-3 py-2" style={{ background: 'rgba(var(--ink-rgb),0.03)' }}>
                      <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                        {shortDate(n.created_at)}{n.title ? ` · ${n.title}` : ''}
                      </div>
                      <div className="note-html text-xs leading-relaxed [&_h1]:text-[13px] [&_h2]:text-[13px] [&_h3]:text-xs [&_h1]:font-semibold [&_h2]:font-semibold [&_h1]:my-1 [&_h2]:my-1 [&_p]:my-0" dangerouslySetInnerHTML={{ __html: n.content }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>

      {/* 색 선택 창 */}
      {pickerPos && (
        <div role="group" aria-label="박스 색"
          className="fixed z-[100] rounded-xl p-2.5 flex flex-col gap-2 shadow-xl"
          style={{ left: pickerPos.left, top: pickerPos.top, background: 'var(--dropdown-panel-bg)', border: '1px solid rgba(var(--ink-rgb),0.1)' }}
          onPointerDown={e => e.stopPropagation()}>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>박스 색</span>
          <div className="flex items-center gap-1.5">
            <button type="button" title="유리(기본)" aria-label="유리(기본)"
              onClick={() => { onColor(null); setPickerPos(null) }}
              className="w-5 h-5 rounded-full hover:scale-110 transition-transform"
              style={{ border: `1.5px ${pal ? 'dashed' : 'solid'} rgba(var(--text-rgb),${pal ? 0.35 : 0.7})`, background: 'color-mix(in srgb, var(--surface-primary) 60%, transparent)' }} />
            {PLAN_BOX_COLOR_KEYS.map(k => (
              <button key={k} type="button" title={PLAN_BOX_COLORS[k].label} aria-label={PLAN_BOX_COLORS[k].label}
                onClick={() => { onColor(k); setPickerPos(null) }}
                className="w-5 h-5 rounded-full hover:scale-110 transition-transform"
                // 선택 창에서는 구분되도록 진한 점 색으로 보여준다(박스 배경은 같은 계열의 옅은 색)
                style={{
                  background: PLAN_BOX_COLORS[k].dot,
                  boxShadow: st.color === k ? `0 0 0 2px var(--dropdown-panel-bg), 0 0 0 3.5px ${PLAN_BOX_COLORS[k].dot}` : 'none',
                }} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
