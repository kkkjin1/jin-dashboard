'use client'

// 메모 상세 패널 — 메모탭(/memos) 우측 패널과 메모 팝업창(/memo/view)이 같이 쓴다.
// 저장·삭제는 호스트가 props로 넘기고, 다른 창에서 같은 메모가 바뀌면 memoSync 알림으로 화면을 갱신한다.
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CATEGORY_PALETTE, MEMO_TAG, colorKeyFromName } from '@/lib/categoryColors'
import { createClient } from '@/lib/supabase/client'
import { useAutosave } from '@/hooks/useAutosave'
import { subscribeMemoSync } from '@/lib/memoSync'
import MarkdownContent from '@/components/MarkdownContent'
import type { QuickMemo, MemoTag } from '@/types'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

export const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
export const pOn  = 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)] shadow-sm'
export const pOff = 'bg-[rgba(var(--ink-rgb),0.06)] backdrop-blur-xl border-[rgba(var(--ink-rgb),0.09)] text-[rgba(var(--text-rgb),0.5)] hover:bg-[rgba(var(--ink-rgb),0.1)] hover:text-[rgba(var(--text-rgb),1)]'

// 상세 패널의 수정모드 에디터 박스에 쓰는 프레임 톤
export const FRAME_STYLE: React.CSSProperties = { background: 'rgba(var(--ink-rgb),0.035)', border: '1px solid rgba(var(--ink-rgb),0.07)' }
export const DROPDOWN_STYLE: React.CSSProperties = { background: 'var(--surface-tooltip)', border: '1px solid rgba(var(--ink-rgb),0.1)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }

export function memoTagStyle(tag: string) {
  const c = CATEGORY_PALETTE[MEMO_TAG[tag] ?? colorKeyFromName(tag)]
  return { background: c.bg, color: c.text, borderColor: c.border }
}
export function memoTagSolid(tag: string): string {
  return CATEGORY_PALETTE[MEMO_TAG[tag] ?? colorKeyFromName(tag)].solid
}

// 태그 배열에서 제거 시 최소 1개는 남긴다 (빈 태그 메모 방지)
export function withoutTag(tags: MemoTag[], t: MemoTag): MemoTag[] {
  return tags.length > 1 ? tags.filter(x => x !== t) : tags
}
export function withTag(tags: MemoTag[], t: MemoTag): MemoTag[] {
  return tags.includes(t) ? tags : [...tags, t]
}

export interface MemoDetailPanelProps {
  memo: QuickMemo
  categories: MemoTag[]
  onSave: (id: string, title: string, content: string, tags: MemoTag[]) => void
  onAutoSave: (id: string, title: string, content: string, tags: MemoTag[]) => Promise<void>
  onDelete: (id: string) => Promise<boolean>
  onClose: () => void
  /** 있으면 툴바에 '팝업' 버튼 표시 — 메모탭에서 이 메모를 별도 창으로 띄울 때 */
  onPopout?: () => void
}

// 메모 클릭 시 우측에 도킹되는 상세 패널 — 기존 폼/자동저장 로직을 그대로 재사용하고
// 겉모습(액션 툴바, 다중 태그 칩, 읽기/수정 모드)만 확장한다
export default function MemoDetailPanel({ memo, categories, onSave, onAutoSave, onDelete, onClose, onPopout }: MemoDetailPanelProps) {
  const [title, setTitle] = useState(memo.title)
  const [content, setContent] = useState(memo.content)
  const [tags, setTags] = useState<MemoTag[]>(memo.tag)
  const [viewMode, setViewMode] = useState<'read' | 'edit'>('read')
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saving' | 'saved' | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isFirstRender = useRef(true)
  const pendingSaveDataRef = useRef<{ title: string; content: string; tags: MemoTag[] } | null>(null)
  const onAutoSaveRef = useRef(onAutoSave)
  const supabase = createClient()
  // 다른 창(메모탭↔팝업)에서 같은 메모가 저장됐을 때: 읽기 모드면 바로 반영,
  // 수정 중이면 내 입력을 덮지 않도록 안내 띠만 띄우고 사용자가 '불러오기'로 고른다.
  const [remoteMemo, setRemoteMemo] = useState<{ title: string; content: string; tag: MemoTag[] } | null>(null)
  const [editorKey, setEditorKey] = useState(0)   // 바깥 내용으로 바꿀 때 에디터를 새로 그리기 위한 키
  const skipAutosaveRef = useRef(false)            // 원격 반영은 다시 저장하지 않음(창끼리 핑퐁 방지)
  const viewModeRef = useRef<'read' | 'edit'>('read')

  // 기존 메모 편집 보호(autosave_drafts/content_versions) — quick_memos.id가 이미
  // 실존하므로 quick/page.tsx·MobileMemoSheet.tsx(신규 작성, temp qid→rebind)와 달리
  // qid/rebind가 필요 없다. entityId=memo.id로 고정, fieldKey='draft' 하나에
  // {title, content, tags}를 통째로 담아 이미 배포된 quick_memo entity 설계(단일
  // draft 필드)를 그대로 재사용. canonical UPDATE(아래 1.5초 debounce autoSave)는
  // 손대지 않고 병행 기록만 하는 안전망 — meeting_note(B-5)/one_on_one/project_item
  // 등 기존 entity 편집 화면과 동일하게 dev-pilot 아닌 production supabase를 그대로
  // 쓴다(entity_id가 이미 실존하는 canonical id라 dev-pilot 격리 대상인 create-flow
  // temp id와는 다름).
  const draftValue = useMemo(() => ({ title, content, tags }), [title, content, tags])
  const autosave = useAutosave({
    supabase,
    enabled: true,
    entityType: 'quick_memo',
    entityId: memo.id,
    fieldKey: 'draft',
    value: draftValue,
  })

  // 메모탭·팝업 두 창이 같은 내용을 동시에 반영하면 임시저장 버전만 엇갈려 '충돌'로 잡힌다.
  // 서버 쪽 내용이 지금 내 내용과 똑같으면 진짜 충돌이 아니므로 조용히 서버 버전에 맞춘다.
  const conflict = autosave.conflict
  const resolveConflict = autosave.resolveConflict
  useEffect(() => {
    const sv = conflict?.serverContent as { title?: string; content?: string; tags?: MemoTag[] } | undefined
    if (!sv) return
    if (sv.title === title && sv.content === content && JSON.stringify(sv.tags ?? []) === JSON.stringify(tags)) {
      resolveConflict('take-theirs')
    }
  }, [conflict, resolveConflict, title, content, tags])

  function applyRecovered() {
    if (!autosave.recovered) return
    const v = autosave.recovered.value as { title: string; content: string; tags: MemoTag[] }
    setTitle(v.title ?? '')
    setContent(v.content ?? '')
    setTags(v.tags ?? memo.tag)
    autosave.discardRecovered()
  }

  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const tagPickerRef = useRef<HTMLDivElement>(null)
  const moveRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => { onAutoSaveRef.current = onAutoSave }, [onAutoSave])

  // 팝오버 바깥 클릭 시 닫기 (태그 추가 / 이동 / 더보기 공용)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) setTagPickerOpen(false)
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveOpen(false)
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // unmount 시 pending 저장 즉시 flush (패널 닫기·다른 메모 선택 모두 unmount를 유발)
  useEffect(() => {
    return () => {
      const d = pendingSaveDataRef.current
      if (d && d.title.trim()) {
        onAutoSaveRef.current(memo.id, d.title, d.content, d.tags)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { viewModeRef.current = viewMode }, [viewMode])

  function applyRemote(r: { title: string; content: string; tag: MemoTag[] }) {
    clearTimeout(autoSaveTimer.current)
    pendingSaveDataRef.current = null
    skipAutosaveRef.current = true
    setTitle(r.title)
    setContent(r.content)
    setTags(r.tag)
    setEditorKey(k => k + 1)
    setRemoteMemo(null)
  }

  useEffect(() => subscribeMemoSync(msg => {
    if (msg.type !== 'updated' || msg.memo.id !== memo.id) return
    const r = { title: msg.memo.title, content: msg.memo.content, tag: msg.memo.tag }
    if (viewModeRef.current === 'edit' || pendingSaveDataRef.current) setRemoteMemo(r)
    else applyRemote(r)
  }), [memo.id])

  // 대기 중인 자동저장(1.5초 지연분)을 즉시 저장 — 팝업 띄우기·창 닫기 직전에 호출
  async function flushPending() {
    clearTimeout(autoSaveTimer.current)
    const d = pendingSaveDataRef.current
    pendingSaveDataRef.current = null
    if (d && d.title.trim()) await onAutoSaveRef.current(memo.id, d.title, d.content, d.tags)
  }

  async function closeWithFlush() {
    await flushPending()
    onClose()
  }

  async function handlePopout() {
    if (!onPopout) return
    await flushPending()
    setViewMode('read')
    onPopout()
  }

  // 창을 그냥 닫아도(팝업 X 버튼) 대기 중인 내용을 최대한 저장 시도
  useEffect(() => {
    function onHide() {
      const d = pendingSaveDataRef.current
      if (d && d.title.trim()) { pendingSaveDataRef.current = null; onAutoSaveRef.current(memo.id, d.title, d.content, d.tags) }
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [memo.id])

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (skipAutosaveRef.current) { skipAutosaveRef.current = false; return }
    if (!title.trim()) return
    setAutoSaveStatus('saving')
    clearTimeout(autoSaveTimer.current)
    pendingSaveDataRef.current = { title, content, tags }
    autoSaveTimer.current = setTimeout(async () => {
      pendingSaveDataRef.current = null
      await onAutoSave(memo.id, title, content, tags)
      setAutoSaveStatus('saved')
      setTimeout(() => setAutoSaveStatus(null), 2000)
    }, 1500)
    return () => clearTimeout(autoSaveTimer.current)
  }, [title, content, tags])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeWithFlush() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  async function handleDelete() {
    const ok = await onDelete(memo.id)
    if (ok) onClose()
  }

  function commitSave() {
    onSave(memo.id, title, content, tags)
    setViewMode('read')
  }

  function togglePin() {
    setTags(prev => prev.includes('공지') ? withoutTag(prev, '공지') : withTag(prev, '공지'))
  }

  const createdLabel = (() => {
    try { return format(parseISO(memo.created_at), 'yyyy.MM.dd (eee) HH:mm', { locale: ko }) } catch { return '' }
  })()

  const pickerCandidates = categories.filter(t => !tags.includes(t))

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-3">
        {/* 1줄: 제목 + 닫기 — 읽기 모드에서는 정적 표시, 수정 모드에서만 편집 가능 */}
        <div className="flex items-center gap-2 mb-1.5">
          {viewMode === 'edit' ? (
            <input value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitSave() }}
              placeholder="제목"
              className="flex-1 min-w-0 text-base font-semibold text-[rgba(var(--text-rgb),1)] focus:outline-none bg-transparent placeholder:text-[rgba(var(--text-rgb),0.3)]" />
          ) : (
            <h2 className="flex-1 min-w-0 truncate text-base font-semibold text-[rgba(var(--text-rgb),1)]">{title || '(제목 없음)'}</h2>
          )}
          <button onClick={closeWithFlush} className="text-[rgba(var(--text-rgb),0.28)] hover:text-[rgba(var(--text-rgb),0.7)] text-lg leading-none flex-shrink-0 transition-colors">×</button>
        </div>

        {/* 다른 창에서 수정됨 — 수정 중일 때만 뜬다(읽기 모드는 자동 반영) */}
        {remoteMemo && (
          <div className="mb-2 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2"
            style={{ background: 'rgba(76,127,224,0.1)', border: '1px solid rgba(76,127,224,0.3)', color: 'var(--accent-badge-text)' }}>
            <span className="flex-1">다른 창에서 이 메모가 수정됐습니다</span>
            <button onClick={() => applyRemote(remoteMemo)} className="underline underline-offset-2">불러오기</button>
            <button onClick={() => setRemoteMemo(null)} className="underline underline-offset-2">무시</button>
          </div>
        )}

        {/* Autosave: 복구 배너 — 새로고침/크래시로 유실될 뻔한 마지막 입력 복원. 자동 적용하지 않고 사용자가 직접 선택 */}
        {autosave.recovered && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
            style={{ background: 'rgba(76,127,224,0.1)', border: '1px solid rgba(76,127,224,0.3)', color: 'var(--accent-badge-text)' }}>
            <span className="flex-1">복구 가능한 자동저장 내용이 있습니다</span>
            <button onClick={applyRecovered} className="underline underline-offset-2">적용</button>
            <button onClick={() => autosave.discardRecovered()} className="underline underline-offset-2">무시</button>
          </div>
        )}

        {/* Autosave: 충돌 배너 — 자동 병합하지 않고 사용자가 선택 */}
        {autosave.conflict && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs flex flex-col gap-1.5"
            style={{ background: 'rgba(249,158,11,0.1)', border: '1px solid rgba(249,158,11,0.35)', color: 'var(--quick-todo-text)' }}>
            <span>다른 창/기기에서 이 메모가 변경되었습니다 — 자동 병합하지 않습니다.</span>
            <div className="flex items-center gap-2">
              <button onClick={() => autosave.resolveConflict('keep-mine')} className="underline underline-offset-2">
                내 내용 유지(덮어쓰기)
              </button>
              <button
                onClick={() => {
                  const v = autosave.conflict?.serverContent as { title: string; content: string; tags: MemoTag[] } | undefined
                  if (v) { setTitle(v.title ?? ''); setContent(v.content ?? ''); setTags(v.tags ?? memo.tag) }
                  autosave.resolveConflict('take-theirs')
                }}
                className="underline underline-offset-2">
                서버 내용 사용
              </button>
            </div>
          </div>
        )}

        {/* 2줄: 액션 툴바(고정/수정/이동) · 태그 칩 · 작성일 · 더보기(삭제) — 한 줄로 합쳐 본문 높이 확보 */}
        <div className="flex items-center gap-1 flex-wrap pb-2" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.07)' }}>
          <button onClick={togglePin}
            className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all ${
              tags.includes('공지') ? 'bg-[#4C7FE0]/25 text-[var(--accent-badge-text)]' : 'text-[rgba(var(--text-rgb),0.45)] hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[rgba(var(--text-rgb),0.7)]'
            }`}>
            📌 고정
          </button>
          <button onClick={() => setViewMode(v => v === 'edit' ? 'read' : 'edit')}
            className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all ${
              viewMode === 'edit' ? 'bg-[#4C7FE0]/25 text-[var(--accent-badge-text)]' : 'text-[rgba(var(--text-rgb),0.45)] hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[rgba(var(--text-rgb),0.7)]'
            }`}>
            ✎ 수정
          </button>
          {onPopout && (
            <button onClick={handlePopout} title="이 메모를 별도 창으로 띄우기 (메모탭과 실시간 연동)"
              className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-[rgba(var(--text-rgb),0.45)] hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[rgba(var(--text-rgb),0.7)] transition-all">
              ⧉ 팝업
            </button>
          )}
          <div className="relative" ref={moveRef}>
            <button onClick={() => setMoveOpen(v => !v)}
              className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-[rgba(var(--text-rgb),0.45)] hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[rgba(var(--text-rgb),0.7)] transition-all">
              ↗ 이동
            </button>
            {moveOpen && (
              <div className="absolute left-0 top-full mt-1 py-1 rounded-xl z-10 min-w-[170px]" style={DROPDOWN_STYLE}>
                <button
                  onClick={() => {
                    // TODO: 메모를 다른 카테고리/폴더로 이동하는 기능. 현재는 폴더 개념이 없어
                    // 태그 편집(위 칩)이 사실상 이동 역할을 겸함 — 별도 폴더 구조가 생기면 여기서 구현
                    setMoveOpen(false)
                  }}
                  className="w-full text-left text-xs px-3 py-2 text-[rgba(var(--text-rgb),0.4)] cursor-not-allowed">
                  카테고리 이동 (준비 중)
                </button>
              </div>
            )}
          </div>
          <span className="w-px h-4 mx-1 bg-[rgba(var(--ink-rgb),0.12)]" />
          {tags.map(t => (
            <span key={t} className="text-xs pl-3 pr-1.5 py-1 rounded-full border font-medium flex items-center gap-1" style={memoTagStyle(t)}>
              {t}
              <button onClick={() => setTags(prev => withoutTag(prev, t))}
                className="opacity-50 hover:opacity-100 transition-opacity leading-none text-[13px]">×</button>
            </span>
          ))}
          <div className="relative" ref={tagPickerRef}>
            <button onClick={() => setTagPickerOpen(v => !v)} className={`${pill} ${pOff} !text-[11px] !px-2.5 !py-1`}>
              + 태그 추가
            </button>
            {tagPickerOpen && (
              <div className="absolute left-0 top-full mt-1 py-1 rounded-xl z-10 min-w-[130px]" style={DROPDOWN_STYLE}>
                {pickerCandidates.length === 0 ? (
                  <p className="text-[11px] text-[rgba(var(--text-rgb),0.3)] px-3 py-2 whitespace-nowrap">모든 태그가 선택됨</p>
                ) : pickerCandidates.map(t => (
                  <button key={t} onClick={() => { setTags(prev => withTag(prev, t)); setTagPickerOpen(false) }}
                    className="w-full text-left text-xs px-3 py-2 text-[rgba(var(--text-rgb),0.7)] hover:bg-[rgba(var(--ink-rgb),0.06)] transition-colors flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: memoTagSolid(t) }} />
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          {createdLabel && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-[rgba(var(--text-rgb),0.35)] whitespace-nowrap">
              <Calendar size={12} /> {createdLabel}
            </span>
          )}
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen(v => !v)}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-[rgba(var(--text-rgb),0.45)] hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[rgba(var(--text-rgb),0.7)] transition-all">
              ⋯
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 py-1 rounded-xl z-10 min-w-[110px]" style={DROPDOWN_STYLE}>
                <button onClick={() => { setMoreOpen(false); handleDelete() }}
                  className="w-full text-left text-xs px-3 py-2 text-red-400/80 hover:bg-red-400/10 hover:text-red-400 transition-colors">
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 스크롤 본문 — 내용(읽기/수정). 1인 툴 특성상 관련메모/댓글은 실효성 없어 제외 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mx-5 pt-3 pb-3">
        {viewMode === 'edit' ? (
          <div className="rounded-2xl overflow-hidden" style={FRAME_STYLE}>
            <TiptapEditor
              key={editorKey}
              dark
              value={content}
              onChange={setContent}
              onSubmit={commitSave}
              autoFocus
              minHeight={220}
              className="p-3"
            />
          </div>
        ) : (
          content ? <MarkdownContent content={content} dark /> : <p className="text-[rgba(var(--text-rgb),0.25)] text-sm">내용 없음</p>
        )}
      </div>

      {/* 하단: 자동저장 상태 + 저장 (삭제는 오조작 방지를 위해 상단 ⋯더보기로 이동) */}
      {viewMode === 'edit' && (
        <div className="flex justify-end items-center gap-3 flex-shrink-0 px-5 py-2">
          <p className="text-[10px] text-[rgba(var(--text-rgb),0.28)]">
            {autoSaveStatus === 'saving' ? '저장 중…' :
             autoSaveStatus === 'saved'  ? '✓ 자동저장됨' :
             'Ctrl+Enter 저장 · Esc 닫기'}
          </p>
          <button onClick={commitSave} className={`${pill} ${pOn}`}>저장</button>
        </div>
      )}
    </div>
  )
}
