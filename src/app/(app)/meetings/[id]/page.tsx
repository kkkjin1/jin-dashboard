'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { Meeting, Attachment } from '@/types'
import { generateMeetingMd, downloadMd } from '@/lib/markdown'
import { fetchMeetingNotes, wasEdited, type MeetingNoteRow } from '@/lib/meetingNotes'
import { useAutosave, clearAutosaveBuffer } from '@/hooks/useAutosave'
import dynamic from 'next/dynamic'
import MarkdownContent from '@/components/MarkdownContent'
import TextSelectionCapture from '@/components/TextSelectionCapture'
import { useOrgData } from '@/hooks/useOrgData'
import { MEETING_CATEGORY, CATEGORY_PALETTE, colorKeyFromName, FIXED_MEETING_TAGS } from '@/lib/categoryColors'
const FullscreenNoteEditor = dynamic(() => import('@/components/FullscreenNoteEditor'), { ssr: false })
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

// 카테고리 색상: 팀명은 조직 설정에서 동적으로 오므로 이름 해시로 안정된 색을 배정
function categoryStyle(cat: string): { background: string; color: string; borderColor: string } {
  const key = MEETING_CATEGORY[cat] ?? colorKeyFromName(cat)
  const p = CATEGORY_PALETTE[key]
  return { background: p.bg, color: p.text, borderColor: p.border }
}

function defaultNoteTitle(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd} 논의`
}

interface AgendaItemOption {
  id: string
  title: string
  groupName: string
  category: string
}

interface LinkedAgendaItem {
  linkId: string
  id: string
  title: string
  status: string
  groupName: string
  category: string
}

interface NoteAccordionProps {
  note: MeetingNoteRow
  isOpen: boolean
  onToggle: () => void
  onDelete: (id: string) => void
  onEdit: (id: string, newContent: string, newTitle?: string) => void
  onFullscreen: (content: string) => void
  agendaItems: AgendaItemOption[]
  onAddToItem: (itemId: string, noteContent: string, noteTitle: string) => Promise<void>
}

function NoteAccordion({ note, isOpen, onToggle, onDelete, onEdit, onFullscreen, agendaItems, onAddToItem }: NoteAccordionProps) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(note.title)
  const [autoSaved, setAutoSaved] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tiptapKey, setTiptapKey] = useState(0)
  const [showItemPicker, setShowItemPicker] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [addingToItem, setAddingToItem] = useState(false)
  const [addedToItem, setAddedToItem] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Track B-5: canonical UPDATE(onEdit → editNote, 1500ms debounce)는 그대로 유지 —
  // 이 훅은 autosave_drafts/content_versions에만 병행 기록하는 안전망(one_on_one
  // titleAutosave/contentAutosave와 동일 패턴). entity_id는 항상 실존하는
  // meeting_notes.id이므로 qid/rebind 불필요.
  const titleAutosave = useAutosave({
    supabase,
    enabled: editingTitle,
    entityType: 'meeting_note',
    entityId: note.id,
    fieldKey: 'title',
    value: editTitle,
  })
  const contentAutosave = useAutosave({
    supabase,
    // '크게 편집'(로컬 fullscreen)도 같은 editContent/handleChange를 쓰므로 함께 보호.
    enabled: editing || fullscreen,
    entityType: 'meeting_note',
    entityId: note.id,
    fieldKey: 'content',
    value: editContent,
  })

  function applyRecoveredTitle() {
    if (!titleAutosave.recovered) return
    setEditTitle(titleAutosave.recovered.value)
    titleAutosave.discardRecovered()
  }
  function applyRecoveredContent() {
    if (!contentAutosave.recovered) return
    setEditContent(contentAutosave.recovered.value)
    setTiptapKey(k => k + 1)
    contentAutosave.discardRecovered()
  }

  useEffect(() => {
    if (!showItemPicker) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowItemPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showItemPicker])

  const filteredItems = agendaItems.filter(i =>
    !itemSearch.trim() || i.title.includes(itemSearch) || i.groupName.includes(itemSearch)
  )

  async function handleAddToItem(item: AgendaItemOption) {
    setAddingToItem(true)
    await onAddToItem(item.id, note.content, note.title)
    setAddingToItem(false)
    setShowItemPicker(false)
    setItemSearch('')
    setAddedToItem(item.title)
    setTimeout(() => setAddedToItem(''), 3000)
  }

  function handleChange(html: string) {
    setEditContent(html)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (html.replace(/<[^>]*>/g, '').trim()) {
        onEdit(note.id, html)
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      }
    }, 1500)
  }

  return (
    <div className="bg-[var(--surface-secondary)] rounded-lg border border-[var(--border-default)] overflow-hidden group">
      <div
        onClick={() => { if (!editingTitle) onToggle() }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[rgba(var(--ink-rgb),0.03)] transition-colors cursor-pointer">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs text-[rgba(var(--text-rgb),0.4)] flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
          {editingTitle ? (
            <>
              {titleAutosave.recovered && (
                <div onClick={e => e.stopPropagation()}
                  className="flex items-center gap-2 px-2 py-1 rounded-md text-[11px]"
                  style={{ background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: 'var(--accent-soft)' }}>
                  <span className="flex-1">복구 가능한 자동저장 내용이 있습니다</span>
                  <button onClick={applyRecoveredTitle} className="underline underline-offset-2">적용</button>
                  <button onClick={() => titleAutosave.discardRecovered()} className="underline underline-offset-2">무시</button>
                </div>
              )}
              <input
                autoFocus
                value={editTitle}
                onClick={e => e.stopPropagation()}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={e => {
                  const val = e.target.value.trim()
                  setEditingTitle(false)
                  onEdit(note.id, note.content, val || note.title)
                }}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter') { e.currentTarget.blur() }
                  if (e.key === 'Escape') { setEditTitle(note.title); setEditingTitle(false) }
                }}
                className="text-sm font-medium text-[rgba(var(--text-rgb),0.8)] focus:outline-none border-b border-blue-300 bg-transparent min-w-0 flex-1"
              />
            </>
          ) : (
            <span
              className="text-sm font-medium text-[rgba(var(--text-rgb),0.8)] truncate cursor-text hover:text-blue-600 transition-colors"
              onClick={e => { e.stopPropagation(); setEditTitle(note.title); setEditingTitle(true) }}
            >{note.title}</span>
          )}
          {wasEdited(note) && !editingTitle && (
            <span className="text-xs text-[rgba(var(--text-rgb),0.4)] flex-shrink-0 ml-1">수정됨</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isOpen && <span className="text-xs text-[rgba(var(--text-rgb),0.3)] truncate max-w-40">{note.content.replace(/<[^>]*>/g, '').slice(0, 40)}</span>}
          {/* 업무 추가 완료 메시지 */}
          {addedToItem && (
            <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex-shrink-0">
              ✓ {addedToItem}에 추가됨
            </span>
          )}
          {/* 업무에 추가 버튼 + 피커 */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={e => { e.stopPropagation(); setShowItemPicker(v => !v) }}
              className="text-[10px] text-[rgba(var(--text-rgb),0.3)] hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all px-1.5 py-0.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100"
              title="프로젝트 업무에 추가">
              업무에 추가
            </button>
            {showItemPicker && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.09)] rounded-xl shadow-lg z-50 overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="p-2 border-b border-[rgba(var(--ink-rgb),0.06)]">
                  <input
                    autoFocus
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    placeholder="업무 검색…"
                    className="w-full text-xs px-2 py-1.5 border border-[rgba(var(--ink-rgb),0.09)] rounded-lg focus:outline-none focus:border-blue-300"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredItems.length === 0 ? (
                    <p className="text-[10px] text-[rgba(var(--text-rgb),0.3)] px-3 py-2">업무 없음</p>
                  ) : filteredItems.map(item => (
                    <button key={item.id}
                      onClick={() => handleAddToItem(item)}
                      disabled={addingToItem}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 disabled:opacity-50">
                      <div className="text-xs text-[rgba(var(--text-rgb),0.8)] truncate font-medium">{item.title}</div>
                      <div className="text-[9px] text-[rgba(var(--text-rgb),0.4)] mt-0.5">{item.groupName} · {item.category}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(note.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
            className="text-xs text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.7)] opacity-0 group-hover:opacity-100 transition-all">
            {copied ? '✓' : '복사'}
          </button>
          <button onClick={e => { e.stopPropagation(); onFullscreen(note.content) }}
            className="text-xs text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.7)] opacity-0 group-hover:opacity-100 transition-all"
            title="크게보기">⛶</button>
          <button onClick={e => { e.stopPropagation(); setEditContent(note.content); setEditing(true); if (!isOpen) onToggle() }}
            className="text-xs text-[rgba(var(--text-rgb),0.3)] hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">수정</button>
          <button onClick={e => { e.stopPropagation(); onDelete(note.id) }}
            className="text-xs text-[rgba(var(--text-rgb),0.2)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">삭제</button>
        </div>
      </div>
      {fullscreen && (
        <FullscreenNoteEditor enableToggle
          value={editContent}
          onChange={handleChange}
          onSave={() => { onEdit(note.id, editContent); setEditing(false) }}
          onClose={() => { setFullscreen(false); setTiptapKey(k => k + 1) }}
          title={note.title}
          dark
        />
      )}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-50">
          {editing ? (
            <>
              {contentAutosave.recovered && (
                <div className="mb-2 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2"
                  style={{ background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: 'var(--accent-soft)' }}>
                  <span className="flex-1">복구 가능한 자동저장 내용이 있습니다</span>
                  <button onClick={applyRecoveredContent} className="underline underline-offset-2">적용</button>
                  <button onClick={() => contentAutosave.discardRecovered()} className="underline underline-offset-2">무시</button>
                </div>
              )}
              <TiptapEditor enableToggle
                dark
                key={tiptapKey}
                value={editContent}
                onChange={handleChange}
                onSubmit={() => { onEdit(note.id, editContent); setEditing(false) }}
                onEscape={() => setEditing(false)}
                onExpand={() => setFullscreen(true)}
                autoFocus
                minHeight={160}
              />
              <div className="flex items-center justify-between mt-3">
                <span className={`text-xs transition-opacity ${autoSaved ? 'text-emerald-500 opacity-100' : 'opacity-0'}`}>자동저장됨</span>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="text-xs text-[rgba(var(--text-rgb),0.4)] px-3 py-1 rounded-lg">취소</button>
                  <button onClick={() => { onEdit(note.id, editContent); setEditing(false) }}
                    className="text-xs bg-[rgba(76,127,224,0.1)] text-[var(--accent-primary)] border border-[rgba(76,127,224,0.25)] px-3 py-1 rounded-lg">저장</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <MarkdownContent content={note.content} dark className="pt-3" />
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => { setEditContent(note.content); setEditing(true) }}
                  className="text-xs text-[rgba(var(--text-rgb),0.5)] hover:text-blue-400 transition-colors">수정</button>
                <button onClick={() => { setEditContent(note.content); setFullscreen(true) }}
                  className="text-xs text-[rgba(var(--text-rgb),0.3)] hover:text-blue-500 transition-colors">⛶ 크게 편집</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { org } = useOrgData()
  // 회의록 탭 목록(SearchToolbar)에서 사용자가 직접 만든 범주도 '구분' 선택지에 포함 —
  // 안 그러면 필터엔 있는데 여기선 고를 수 없는 값이 생긴다. canonical source는
  // Supabase user_preferences(meetings_cat_order) — 기존엔 localStorage만 읽어
  // 기기/브라우저마다 다른 값을 보던 것이 PC/Mobile 범주 비동기화의 원인이었다.
  // localStorage는 Supabase 응답 전 표시할 값이 없을 때의 폴백으로만 사용.
  const [localCatOrder, setLocalCatOrder] = useState<string[]>([])
  useEffect(() => {
    try {
      const saved = localStorage.getItem('meetings_cat_order')
      if (saved) setLocalCatOrder(JSON.parse(saved) as string[])
    } catch {}
    supabase.from('user_preferences').select('value').eq('key', 'meetings_cat_order').maybeSingle()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && (data.value as string[]).length > 0) {
          setLocalCatOrder(data.value as string[])
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const categories = useMemo(
    () => [...new Set([...org.map(t => t.name), ...FIXED_MEETING_TAGS, ...localCatOrder])],
    [org, localCatOrder],
  )

  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [regularNotes, setRegularNotes] = useState<MeetingNoteRow[]>([])
  const [prepNotes, setPrepNotes] = useState<MeetingNoteRow[]>([])
  const [titleInput, setTitleInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [noteTitle, setNoteTitle] = useState(defaultNoteTitle())
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set([0]))
  const [deleting, setDeleting] = useState(false)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const [fullscreenContent, setFullscreenContent] = useState('')
  const [showFullscreenNew, setShowFullscreenNew] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [linkedAgendaItems, setLinkedAgendaItems] = useState<LinkedAgendaItem[]>([])
  const [sameCatMeetings, setSameCatMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  // SAME THREAD(같은 안건) — 실사용 데이터 확인 결과 "같은 안건의 다른 날짜 회의"는 대부분
  // meeting_notes(같은 meeting_id) 누적이 아니라 "+ 새 회의록"으로 매번 새 meetings row를
  // 만들면서 제목만 그대로 재사용하는 패턴(예: "아람님_데일리"가 여러 날짜에 별도 row로 존재).
  // explicit FK는 없으므로, 유일하게 신뢰 가능한 신호인 "제목 완전 일치"(대소문자/공백 trim만,
  // 유사도 추론 없음)로 다른 meetings row를 찾는다. 제목이 비어있으면 매칭하지 않는다.
  const [sameTitleMeetings, setSameTitleMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItemOption[]>([])
  // SAME CATEGORY/SAME THREAD 클릭 시 lightweight preview — 현재 작성 중인 LEFT context를 잃지
  // 않기 위해 바로 navigate하지 않고 modal로 미리 보여준 뒤 "이 회의 열기"에서만 실제 이동한다.
  const [meetingPreview, setMeetingPreview] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'> | null>(null)
  const [meetingPreviewLabel, setMeetingPreviewLabel] = useState('')
  const [meetingPreviewContent, setMeetingPreviewContent] = useState('')
  const [meetingPreviewLoading, setMeetingPreviewLoading] = useState(false)
  // RIGHT 범주 트리의 펼침 상태 — 이 안건 그룹은 기본 펼침, 다른 안건 그룹은 기본 접힘.
  const [threadGroupOpen, setThreadGroupOpen] = useState(true)
  const [openCatGroups, setOpenCatGroups] = useState<Set<string>>(new Set())

  const [newNoteKey, setNewNoteKey] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)

  // Track B-5: 새 노트 작성 컴포즈 박스의 autosave entityId(create-flow 임시 id) —
  // 탭별 격리 목적으로 sessionStorage에 회의별로 보관(MeetingNotesNew.tsx의
  // QID_STORAGE_KEY와 동일 원리). 저장 성공 시 실제 meeting_notes.id로 rebind된다.
  const [newNoteQid, setNewNoteQid] = useState('')
  const [legacyMigrationPending, setLegacyMigrationPending] = useState(false)
  const legacyMigrationDoneRef = useRef(false)
  // qid를 active(useAutosave에 넘기기) 전에 캡처해 둔 legacy 이관 판단 — useAutosave의
  // on-value-change effect가 이 qid로 활성화되는 순간 기본값을 버퍼에 먼저 써버리기
  // 때문에, 그 이후(마이그레이션 effect 시점)에 버퍼 유무를 다시 확인하면 항상
  // "이미 있음"으로 오판한다(실측 확인된 레이스). 그래서 활성화 직전 시점의
  // 버퍼 상태를 여기 미리 저장해 두고, 마이그레이션 effect는 이 값만 읽는다.
  const pendingLegacyRef = useRef<{ legacyContent: string; legacyTitle: string; hadExistingBuffer: boolean } | null>(null)

  useEffect(() => {
    const key = `meeting_note_new_qid_${id}`
    let qid = ''
    try { qid = sessionStorage.getItem(key) ?? '' } catch {}
    if (!qid) {
      qid = crypto.randomUUID()
      try { sessionStorage.setItem(key, qid) } catch {}
    }

    let legacyContent = ''
    let legacyTitle = ''
    try { legacyContent = localStorage.getItem(`meeting_draft_${id}`) ?? '' } catch {}
    try { legacyTitle = localStorage.getItem(`meeting_draft_title_${id}`) ?? '' } catch {}
    if (legacyContent || legacyTitle) {
      let hadExistingBuffer = false
      try { hadExistingBuffer = !!localStorage.getItem(`autosave_buffer_v1:meeting_note:${qid}:draft`) } catch {}
      pendingLegacyRef.current = { legacyContent, legacyTitle, hadExistingBuffer }
    } else {
      pendingLegacyRef.current = null
    }

    legacyMigrationDoneRef.current = false
    setNewNoteQid(qid)
  }, [id])

  const newNoteDraftValue = useMemo(() => ({ title: noteTitle, content: noteInput }), [noteTitle, noteInput])
  const newNoteAutosave = useAutosave({
    supabase,
    enabled: !!newNoteQid,
    entityType: 'meeting_note',
    entityId: newNoteQid,
    fieldKey: 'draft',
    value: newNoteDraftValue,
  })

  function applyNewNoteRecovered() {
    if (!newNoteAutosave.recovered) return
    const v = newNoteAutosave.recovered.value
    setNoteTitle(v.title || defaultNoteTitle())
    setNoteInput(v.content || '')
    setNewNoteKey(k => k + 1)
    newNoteAutosave.discardRecovered()
  }

  // Track B-5, legacy 초안 이관(1회성 브릿지): 판단 자체는 위 qid effect에서 이미
  // 끝나 있음(pendingLegacyRef) — useAutosave가 이 qid로 활성화된 뒤에 버퍼 유무를
  // 다시 확인하면 hook 자신이 방금 써넣은 기본값 때문에 항상 "이미 있음"으로
  // 오판하기 때문(실측으로 확인된 레이스 — TEST 8에서 처음 드러남).
  //   - hadExistingBuffer(활성화 전에 이미 있었음): 새 게 우선, legacy는 그대로 폐기
  //   - 아니면: legacy 값을 현재 입력값으로 복구 → 그 state 변경이 useAutosave의
  //     on-value-change effect(같은 컴포넌트 안에서 이 코드보다 먼저 선언되어 항상
  //     먼저 실행됨)를 트리거해 새 버퍼에 즉시(동기) 기록된다.
  useEffect(() => {
    if (!newNoteQid || legacyMigrationDoneRef.current) return
    legacyMigrationDoneRef.current = true

    const pending = pendingLegacyRef.current
    if (!pending) return

    if (pending.hadExistingBuffer) {
      try { localStorage.removeItem(`meeting_draft_${id}`) } catch {}
      try { localStorage.removeItem(`meeting_draft_title_${id}`) } catch {}
      return
    }

    if (pending.legacyContent) setNoteInput(pending.legacyContent)
    if (pending.legacyTitle) setNoteTitle(pending.legacyTitle)
    setNewNoteKey(k => k + 1)
    setLegacyMigrationPending(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newNoteQid])

  // legacy 값이 새 버퍼에 실제로 반영된 걸 확인한 뒤에만 legacy key를 지운다.
  useEffect(() => {
    if (!legacyMigrationPending || !newNoteQid) return
    try {
      const raw = localStorage.getItem(`autosave_buffer_v1:meeting_note:${newNoteQid}:draft`)
      if (raw) {
        const parsed = JSON.parse(raw) as { value?: { title?: string; content?: string } }
        if (parsed.value?.title === noteTitle && parsed.value?.content === noteInput) {
          try { localStorage.removeItem(`meeting_draft_${id}`) } catch {}
          try { localStorage.removeItem(`meeting_draft_title_${id}`) } catch {}
          setLegacyMigrationPending(false)
        }
      }
    } catch {}
  }, [legacyMigrationPending, noteTitle, noteInput, newNoteQid, id])

  useEffect(() => {
    async function load() {
      const [meetingRes, notesGrouped, agendaLinksRes, attsRes, agendaRes] = await Promise.all([
        supabase.from('meetings').select('*').eq('id', id).single(),
        fetchMeetingNotes(supabase, id),
        supabase.from('meeting_agenda_links').select('id, agenda_item_id, agenda_items(id, title, status, agenda_groups(name, category))').eq('meeting_id', id),
        supabase.from('attachments').select('*').eq('meeting_id', id).order('created_at', { ascending: false }),
        supabase.from('agenda_items').select('id, title, status, group_id, agenda_groups(name, category)').neq('status', 'done').order('sort_order'),
      ])
      if (meetingRes.data) {
        setMeeting(meetingRes.data as Meeting)
        setTitleInput((meetingRes.data as Meeting).title)
      }
      setRegularNotes(notesGrouped.regular)
      setPrepNotes(notesGrouped.prep)
      if (agendaLinksRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLinkedAgendaItems((agendaLinksRes.data as any[]).filter(l => l.agenda_items).map(l => ({
          linkId: l.id,
          id: l.agenda_item_id,
          title: l.agenda_items.title,
          status: l.agenda_items.status,
          groupName: l.agenda_items.agenda_groups?.name ?? '미분류',
          category: l.agenda_items.agenda_groups?.category ?? '',
        })))
      }
      setAttachments((attsRes.data ?? []) as Attachment[])
      if (agendaRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAgendaItems((agendaRes.data as any[]).map(i => ({
          id: i.id,
          title: i.title,
          groupName: i.agenda_groups?.name ?? '미분류',
          category: i.agenda_groups?.category ?? '',
        })))
      }
      // Track B-5: legacy meeting_draft_*/meeting_draft_title_* 직접 복원은
      // 제거됨 — 이제 새 autosave(entityType='meeting_note', fieldKey='draft')의
      // 복구 배너 + 1회성 legacy 이관 브릿지(위 useEffect)가 이 역할을 대신한다.
    }
    load()
    setTimeout(() => titleRef.current?.focus(), 100)
  }, [id])

  async function addNoteToItem(itemId: string, noteContent: string, noteTitle: string) {
    const { data } = await supabase.from('agenda_items').select('description').eq('id', itemId).single()
    const existing = (data as { description: string | null } | null)?.description ?? ''
    const meetingLabel = meeting ? `${meeting.title}${meeting.meeting_date ? ` (${meeting.meeting_date})` : ''}` : '회의'
    const separator = existing ? `<hr>` : ''
    const header = `<p><strong>[회의 연동] ${noteTitle} — ${meetingLabel}</strong></p>`
    const appended = existing + separator + header + noteContent
    await supabase.from('agenda_items').update({ description: appended }).eq('id', itemId)
    // 사이드바에도 자동 연동
    if (!linkedAgendaItems.some(l => l.id === itemId)) {
      const found = agendaItems.find(i => i.id === itemId)
      if (found) {
        const { data: linkData } = await supabase.from('meeting_agenda_links')
          .upsert({ meeting_id: id, agenda_item_id: itemId }, { onConflict: 'meeting_id,agenda_item_id' })
          .select('id').single()
        if (linkData) {
          setLinkedAgendaItems(prev => [...prev, {
            linkId: (linkData as { id: string }).id,
            id: itemId,
            title: found.title,
            status: '',
            groupName: found.groupName,
            category: found.category,
          }])
        }
      }
    }
  }

  // Track B-5: legacy localStorage(meeting_draft_*) 직접 기록은 제거 —
  // newNoteAutosave(entityType='meeting_note', entityId=newNoteQid, fieldKey='draft')의
  // on-value-change effect가 동일 역할을 대신한다(value가 이 두 state를 그대로 감쌈).
  function handleNoteInputChange(val: string) {
    setNoteInput(val)
  }

  function handleNoteTitleChange(val: string) {
    setNoteTitle(val)
  }

  useEffect(() => {
    if (!meeting?.category) return
    supabase.from('meetings')
      .select('id, title, meeting_date')
      .eq('category', meeting.category)
      .neq('id', id)
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data }) => setSameCatMeetings((data ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]))
  }, [meeting?.category, id])

  useEffect(() => {
    const title = meeting?.title?.trim()
    if (!title) return
    supabase.from('meetings')
      .select('id, title, meeting_date')
      .eq('title', title)
      .neq('id', id)
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .limit(20)
      .then(({ data }) => setSameTitleMeetings((data ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]))
  }, [meeting?.title, id])

  // SAME CATEGORY 목록에서 SAME THREAD(제목 완전 일치)에 이미 뜨는 회의는 중복 노출하지 않는다.
  const sameCatMeetingsDeduped = sameCatMeetings.filter(m => !sameTitleMeetings.some(t => t.id === m.id))

  async function openMeetingPreview(m: Pick<Meeting, 'id' | 'title' | 'meeting_date'>, label: string) {
    setMeetingPreview(m)
    setMeetingPreviewLabel(label)
    setMeetingPreviewContent('')
    setMeetingPreviewLoading(true)
    const grouped = await fetchMeetingNotes(supabase, m.id)
    setMeetingPreviewContent(grouped.regular[0]?.content ?? '')
    setMeetingPreviewLoading(false)
  }
  function closeMeetingPreview() {
    setMeetingPreview(null)
    setMeetingPreviewContent('')
  }

  // RIGHT 목록 — 범주 > 안건(제목) > 날짜 트리(2026-10-02 개편). 예전의 RIGHT TOP "같은 안건의
  // 다른 날짜 회의" 상자를 없애고, 이 안건(제목 완전 일치 = sameTitleMeetings) 그룹을 목록 맨 위에
  // 펼친 채 고정한다. 나머지 같은 범주 회의는 제목(trim)으로 묶어 최신 날짜순으로 두고, 날짜가
  // 여러 개인 안건만 접힌 그룹(개수 표시)으로 보여준다. 이 회의의 저장된 노트는 LEFT 작성창 아래로 옮겼다.
  type MeetingLite = Pick<Meeting, 'id' | 'title' | 'meeting_date'>
  const categoryGroups: { title: string; list: MeetingLite[] }[] = []
  for (const m of sameCatMeetingsDeduped) {
    const title = (m.title ?? '').trim() || '제목 없음'
    const g = categoryGroups.find(x => x.title === title)
    if (g) g.list.push(m)
    else categoryGroups.push({ title, list: [m] })
  }
  // sameCatMeetings가 이미 날짜 내림차순이라, 그룹 순서(첫 등장 순)도 곧 최신 날짜순이다.
  const threadList: (MeetingLite & { current?: boolean })[] = meeting?.title?.trim()
    ? [{ id, title: meeting.title, meeting_date: meeting.meeting_date, current: true }, ...sameTitleMeetings]
        .sort((x, y) => (y.meeting_date ?? '').localeCompare(x.meeting_date ?? ''))
    : []

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowFullscreen(false)
    }
    if (showFullscreen) {
      window.addEventListener('keydown', onEsc)
      return () => window.removeEventListener('keydown', onEsc)
    }
  }, [showFullscreen])

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMeetingPreview()
    }
    if (meetingPreview) {
      window.addEventListener('keydown', onEsc)
      return () => window.removeEventListener('keydown', onEsc)
    }
  }, [meetingPreview])

  function toggleNote(index: number) {
    setOpenIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })
  }

  async function updateMeeting(updates: Partial<Meeting>) {
    await supabase.from('meetings').update(updates).eq('id', id)
    setMeeting(prev => prev ? { ...prev, ...updates } : prev)
  }

  // Track B-4: meeting_notes 단일 row INSERT. meetings.notes는 더 이상
  // 건드리지 않는다(dual-write 차단). created_at/updated_at을 같은 값으로
  // 명시해 신규 노트가 "수정됨"으로 표시되지 않도록 한다(wasEdited 참조).
  async function saveNote() {
    if (!noteInput.replace(/<[^>]*>/g, '').trim() || !meeting) return
    const now = new Date().toISOString()
    const savedQid = newNoteQid
    const { data } = await supabase.from('meeting_notes').insert({
      meeting_id: id,
      title: noteTitle.trim() || defaultNoteTitle(),
      content: noteInput,
      is_prep: false,
      created_at: now,
      updated_at: now,
    }).select('*').single()
    if (data) {
      setRegularNotes(prev => [data as MeetingNoteRow, ...prev])
      setOpenIndexes(new Set([0]))
    }

    // Track B-5: canonical INSERT가 실제로 성공한 뒤에만 'draft'(임시 qid)를
    // 진짜 meeting_notes.id로 rebind — 실패 시 위에서 이미 return하지 않았으므로
    // data가 없을 수 있고, 그 경우 rebind하지 않는다(draft는 그대로 보존해 재시도 가능).
    if (data && savedQid) {
      try {
        const result = await newNoteAutosave.flush({ source: 'final', rebindToEntityId: data.id })
        if (!result.rebind?.ok) {
          console.error('meeting_note_new_autosave_rebind_failed', {
            event: 'meeting_note_new_autosave_rebind_failed',
            qid: savedQid,
            canonicalId: data.id,
            step: result.ok ? 'rebind' : 'sync',
            error: result.rebind?.error ?? result.error ?? 'unknown',
            timestamp: new Date().toISOString(),
          })
        }
      } catch (e) {
        console.error('meeting_note_new_autosave_rebind_failed', {
          event: 'meeting_note_new_autosave_rebind_failed',
          qid: savedQid,
          canonicalId: data.id,
          step: 'flush',
          error: e instanceof Error ? e.message : 'unknown',
          timestamp: new Date().toISOString(),
        })
      }
      clearAutosaveBuffer('meeting_note', savedQid, 'draft')
      try { sessionStorage.removeItem(`meeting_note_new_qid_${id}`) } catch {}
      const freshQid = crypto.randomUUID()
      try { sessionStorage.setItem(`meeting_note_new_qid_${id}`, freshQid) } catch {}
      legacyMigrationDoneRef.current = true // 이미 legacy는 처리됐거나 애초에 없었음 — 새 qid에서 재실행 불필요
      setNewNoteQid(freshQid)
    }

    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
    setNewNoteKey(k => k + 1)
  }

  // Track B-4: id(PK) 기준 단일 row DELETE — 더 이상 배열 index에 의존하지 않음.
  // Track B-5: canonical DELETE 직후 이 note의 autosave_drafts row(title/content)도
  // 명시적으로 지운다 — NoteAccordion이 언마운트되며 useAutosave의 pending debounce는
  // 보통 그 자체로 취소되지만(on-value-change effect의 cleanup이 unmount-flush effect
  // 보다 먼저 선언돼 먼저 실행되므로), 위 await 대기 중에 700ms debounce가 먼저 발화하는
  // 경합은 이론상 남아 있어 서버 쪽 draft도 직접 정리한다. content_versions는
  // append-only(UPDATE/DELETE 권한 없음, docs/autosave-rollout-plan.md item 26)라
  // 건드리지 않는다 — 지워진 note의 이력이 남는 건 기존 rebind 시나리오와 동일하게 허용.
  async function deleteNote(noteId: string) {
    await supabase.from('meeting_notes').delete().eq('id', noteId)
    await supabase.from('autosave_drafts').delete().eq('entity_type', 'meeting_note').eq('entity_id', noteId)
    clearAutosaveBuffer('meeting_note', noteId, 'title')
    clearAutosaveBuffer('meeting_note', noteId, 'content')
    setRegularNotes(prev => prev.filter(n => n.id !== noteId))
    setOpenIndexes(new Set([0]))
  }

  // Track B-4: id(PK) 기준 단일 row UPDATE. updated_at만 갱신하고
  // created_at은 건드리지 않음(wasEdited가 이 둘의 비교로 배지를 판단).
  async function editNote(noteId: string, newContent: string, newTitle?: string) {
    const existing = regularNotes.find(n => n.id === noteId)
    if (!existing) return
    const safeContent = newContent.trim() || existing.content
    if (!safeContent) return
    const updatedAt = new Date().toISOString()
    const updates = { content: safeContent, ...(newTitle ? { title: newTitle } : {}), updated_at: updatedAt }
    await supabase.from('meeting_notes').update(updates).eq('id', noteId)
    setRegularNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updates } : n))
  }

  async function deleteMeeting() {
    if (!confirm('이 회의록을 삭제하시겠습니까?')) return
    setDeleting(true)
    await supabase.from('meetings').delete().eq('id', id)
    router.push('/meetings')
  }

  async function addLink() {
    if (!linkUrl.trim()) return
    const name = linkName.trim() || linkUrl
    const { data } = await supabase.from('attachments').insert({ meeting_id: id, task_id: null, name, type: '링크', url: linkUrl }).select().single()
    if (data) setAttachments(prev => [data as Attachment, ...prev])
    setLinkUrl(''); setLinkName('')
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `meetings/${id}/${Date.now()}_${safeName}`
        const { error } = await supabase.storage.from('attachments').upload(path, file)
        if (error) { setUploadError(`업로드 실패: ${error.message}`); continue }
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        const { data } = await supabase.from('attachments').insert({ meeting_id: id, task_id: null, name: file.name, type: '파일', url: urlData.publicUrl }).select().single()
        if (data) setAttachments(prev => [data as Attachment, ...prev])
      }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function deleteAttachment(att: Attachment) {
    if (att.type === '파일') {
      const path = att.url.split('/object/public/attachments/')[1]
      if (path) await supabase.storage.from('attachments').remove([path])
    }
    await supabase.from('attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  function handleDownloadMd() {
    if (!meeting) return
    // 원본 meetings.notes 배열 순서(구: prepend되는 일반 노트 -> append되는
    // 사전 메모) 재현 — regularNotes(DESC)+prepNotes(ASC) 이어붙이면 동일함.
    const notes = [...regularNotes, ...prepNotes].map(n => ({ title: n.title, content: n.content, created_at: n.created_at }))
    const md = generateMeetingMd({ title: meeting.title, meeting_date: meeting.meeting_date, notes })
    downloadMd(md, meeting.title)
  }

  if (!meeting) return <div className="p-8 text-[rgba(var(--text-rgb),0.4)] text-sm animate-pulse">불러오는 중...</div>

  return (
    // md 이상: 페이지 전체 스크롤 없이 뷰포트 높이에 맞춘다(2026-09-28, 하단 연관 업무/관련 회고
    // 제거 후). LEFT는 내용이 길어지면 LEFT 안에서만, RIGHT는 TOP/BOTTOM 각자 스크롤한다.
    // md 미만은 좌우가 세로로 쌓이므로 기존처럼 페이지 스크롤을 유지한다.
    <div className="h-full flex flex-col overflow-y-auto scrollbar-hide md:overflow-hidden p-4 md:p-5 pretendard-page">
      <TextSelectionCapture sourceName={meeting.title} sourceType="회의" />
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <Link href="/meetings" className="text-sm text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)] inline-flex items-center gap-1">← 회의록 목록</Link>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadMd}
            className="text-xs text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)] border border-[rgba(var(--ink-rgb),0.09)] rounded-md px-3 py-1.5 hover:bg-[rgba(var(--ink-rgb),0.06)] transition-colors">
            MD 다운로드
          </button>
          <button onClick={deleteMeeting} disabled={deleting}
            className="text-xs text-red-400 hover:text-red-500 border border-[rgba(239,68,68,0.25)] rounded-md px-3 py-1.5 hover:bg-[rgba(239,68,68,0.08)] transition-colors disabled:opacity-50">
            이 회의록 삭제
          </button>
        </div>
      </div>

      <div className="mb-4 mt-1 flex-shrink-0">
        <input ref={titleRef} value={titleInput} onChange={e => setTitleInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { updateMeeting({ title: titleInput }) }
            if (e.key === 'Escape') setTitleInput(meeting.title)
          }}
          onBlur={() => { if (titleInput.trim()) updateMeeting({ title: titleInput }) }}
          placeholder="회의 제목"
          className="text-2xl font-bold text-[rgba(var(--text-rgb),1)] w-full focus:outline-none border-b-2 border-transparent focus:border-red-300 pb-1 transition-colors bg-transparent" />
      </div>

      {/* 고정 min-width가 없는 자유 흐름 콘텐츠라 md 미만에서 세로 스택,
          md부터 좌 50 : 우 50(우측은 다시 상/하 50:50 — 같은 안건 히스토리 / 같은 범주 다른 회의) */}
      <div className="flex flex-col gap-6 md:flex-row md:flex-1 md:min-h-0">
        {/* 왼쪽 50%: 현재 회의 작성 — date/category/editor/attachments */}
        <div className="w-full min-w-0 md:flex-[50] md:h-full md:overflow-y-auto scrollbar-hide">
          <div className="flex gap-4 items-end mb-6 flex-wrap">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">회의 날짜</label>
              <input type="date" value={meeting.meeting_date ?? ''}
                onChange={e => updateMeeting({ meeting_date: e.target.value || null })}
                className="text-sm border border-[var(--border-default)] rounded-lg px-3 py-1.5 focus:outline-none bg-[var(--surface-secondary)] text-[rgba(var(--text-rgb),0.7)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">구분</label>
              <div className="flex gap-1.5 items-center">
                {meeting.category && (
                  <span className="text-xs px-2.5 py-1 rounded border" style={categoryStyle(meeting.category)}>
                    {meeting.category}
                  </span>
                )}
                <select value={meeting.category ?? ''}
                  onChange={e => updateMeeting({ category: e.target.value || null })}
                  className="text-sm border border-[var(--border-default)] rounded-lg px-3 py-1.5 focus:outline-none bg-[var(--surface-secondary)] text-[rgba(var(--text-rgb),0.7)] [&>option]:bg-[var(--select-option-bg)] [&>option]:text-[rgba(var(--text-rgb),0.8)]">
                  <option value="">구분 없음</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 📌 사전 메모 (홈탭에서 연동된 경우) */}
          {prepNotes.length > 0 && (
            <div className="mb-4 bg-[rgba(200,120,40,0.08)] border border-[rgba(200,120,40,0.2)] rounded-xl p-4">
              <p className="text-[11px] font-semibold text-amber-400 mb-2">📌 사전 메모</p>
              {prepNotes.map(n => (
                <div key={n.id}>
                  <p className="text-sm text-[rgba(var(--text-rgb),0.8)] leading-relaxed whitespace-pre-wrap">{n.content}</p>
                  {wasEdited(n) && (
                    <p className="text-[10px] text-amber-500/70 mt-1">
                      수정: {new Date(n.updated_at).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[rgba(var(--text-rgb),0.8)] mb-3">회의 내용</h2>
            <div className="bg-[var(--surface-primary)] rounded-lg border border-[var(--border-default)] p-4 mb-3">
              {newNoteAutosave.recovered && (
                <div className="mb-2 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2"
                  style={{ background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.25)', color: 'var(--accent-soft)' }}>
                  <span className="flex-1">복구 가능한 자동저장 내용이 있습니다</span>
                  <button onClick={applyNewNoteRecovered} className="underline underline-offset-2">적용</button>
                  <button onClick={() => newNoteAutosave.discardRecovered()} className="underline underline-offset-2">무시</button>
                </div>
              )}
              <input value={noteTitle} onChange={e => handleNoteTitleChange(e.target.value)}
                className="w-full text-xs font-medium text-[rgba(var(--text-rgb),0.5)] focus:outline-none mb-2 border-b border-[rgba(var(--ink-rgb),0.06)] pb-1 bg-transparent"
                placeholder="노트 제목" />
              <TiptapEditor enableToggle
                dark
                key={newNoteKey}
                value={noteInput}
                onChange={handleNoteInputChange}
                onSubmit={saveNote}
                onExpand={() => setShowFullscreenNew(true)}
                minHeight={200}
              />
              <div className="flex justify-end mt-2">
                <button onClick={saveNote} disabled={!noteInput.replace(/<[^>]*>/g, '').trim()}
                  className="text-xs bg-[rgba(76,127,224,0.1)] text-[var(--accent-primary)] border border-[rgba(76,127,224,0.25)] px-4 py-1.5 rounded-md hover:bg-[rgba(76,127,224,0.18)] disabled:opacity-30 transition-colors">
                  저장 (Ctrl+Enter)
                </button>
              </div>
            </div>
            {showFullscreenNew && (
              <FullscreenNoteEditor enableToggle
                value={noteInput}
                onChange={handleNoteInputChange}
                onSave={() => { saveNote(); setShowFullscreenNew(false) }}
                onClose={() => setShowFullscreenNew(false)}
                title="회의 내용 입력"
                dark
              />
            )}
            {/* 이 회의의 저장된 노트 — 예전 RIGHT TOP 타임라인에서 옮겨왔다(2026-10-02). 같은 안건의 다른
                날짜 회의는 RIGHT 범주 트리의 맨 위 그룹으로 합쳤다. */}
            {regularNotes.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-[rgba(var(--text-rgb),0.4)] mb-2">저장된 노트 ({regularNotes.length})</h3>
                <div className="space-y-2">
                  {regularNotes.map((note, idx) => (
                    <NoteAccordion key={note.id} note={note}
                      isOpen={openIndexes.has(idx)} onToggle={() => toggleNote(idx)} onDelete={deleteNote}
                      onEdit={editNote} onFullscreen={(content) => { setFullscreenContent(content); setShowFullscreen(true) }}
                      agendaItems={agendaItems} onAddToItem={addNoteToItem} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[rgba(var(--text-rgb),0.8)] mb-3">첨부파일 / 링크</h2>
            <div className="bg-[rgba(var(--ink-rgb),0.06)] rounded-lg border border-[rgba(var(--ink-rgb),0.06)] p-4 mb-3 space-y-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-[rgba(var(--ink-rgb),0.03)] text-[rgba(var(--text-rgb),0.3)]' : 'bg-[rgba(var(--ink-rgb),0.06)] hover:bg-gray-200 text-[rgba(var(--text-rgb),0.7)]'}`}>
                    📎 {uploading ? '업로드 중...' : '파일 첨부'}
                    <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                </div>
                {uploadError && (
                  <p className="text-xs text-red-500 px-1">{uploadError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                  placeholder="링크 URL" className="flex-1 text-sm border border-[rgba(var(--ink-rgb),0.09)] rounded-lg px-3 py-1.5 focus:outline-none" />
                <input value={linkName} onChange={e => setLinkName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                  placeholder="표시 이름 (선택)" className="w-32 text-sm border border-[rgba(var(--ink-rgb),0.09)] rounded-lg px-3 py-1.5 focus:outline-none" />
                <button onClick={addLink} className="text-xs bg-[rgba(var(--ink-rgb),0.06)] hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">추가</button>
              </div>
            </div>
            <div className="space-y-1.5">
              {attachments.length === 0 ? (
                <p className="text-sm text-[rgba(var(--text-rgb),0.3)] text-center py-3">첨부된 파일이 없습니다</p>
              ) : (
                attachments.map(att => {
                  const ext = att.name.split('.').pop()?.toLowerCase() ?? ''
                  const icon = att.type === '링크' ? '🔗' : ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? '🖼️' : ['pdf'].includes(ext) ? '📄' : ['xlsx','xls','csv'].includes(ext) ? '📊' : ['docx','doc'].includes(ext) ? '📝' : ['pptx','ppt'].includes(ext) ? '📊' : ['zip','rar','7z'].includes(ext) ? '📦' : '📎'
                  return (
                    <div key={att.id} className="bg-[rgba(var(--ink-rgb),0.06)] rounded-lg border border-[rgba(var(--ink-rgb),0.06)] px-4 py-2.5 flex items-center justify-between group">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:text-blue-700 hover:underline truncate flex-1">{icon} {att.name}</a>
                      <button onClick={() => deleteAttachment(att)} className="text-xs text-[rgba(var(--text-rgb),0.2)] hover:text-red-400 ml-3 opacity-0 group-hover:opacity-100 transition-all">삭제</button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

        </div>

        {/* 오른쪽 50%: Context — 같은 범주의 회의 하나의 상자(2026-10-02). 좌 3 목록(범주 > 안건 > 날짜
            트리) / 우 7 선택한 회의 내용. sticky로 LEFT가 길어져도 뷰포트에 보이게 한다 — 목록을
            훑으면서 내용을 바로 읽고 LEFT에서 계속 입력할 수 있다. */}
        <div className="w-full min-w-0 md:flex-[50] md:h-full">
          <div className="flex flex-col gap-4 md:h-full">
            <div className="md:flex-1 min-h-[360px] md:min-h-0 flex flex-col bg-[var(--surface-panel)] rounded-lg border border-[var(--border-default)] p-5">
              <h3 className="text-xs font-semibold text-[rgba(var(--text-rgb),0.4)] uppercase tracking-wide mb-3 flex-shrink-0">
                같은 범주의 회의{meeting?.category ? ` · ${meeting.category}` : ''}
              </h3>
              <div className="flex-1 min-h-0 flex gap-3">
                {/* 좌: 범주 > 안건 > 날짜 트리 */}
                <div className="w-[30%] min-w-[130px] flex-shrink-0 overflow-y-auto scrollbar-hide pr-1" style={{ borderRight: '1px solid rgba(var(--ink-rgb),0.08)' }}>
                  {threadList.length === 0 && categoryGroups.length === 0 ? (
                    <p className="text-[11px] text-[rgba(var(--text-rgb),0.3)] py-4">같은 범주의 다른 회의가 없습니다</p>
                  ) : (
                    <div className="space-y-0.5">
                      {threadList.length > 0 && (
                        <div className="pb-1.5 mb-1.5" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.06)' }}>
                          <button onClick={() => setThreadGroupOpen(o => !o)}
                            className="w-full text-left flex items-start gap-1 px-1.5 py-1.5 rounded-md hover:bg-[rgba(var(--ink-rgb),0.04)]">
                            <span className="text-[9px] mt-[3px] flex-shrink-0" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>{threadGroupOpen ? '▾' : '▸'}</span>
                            <span className="min-w-0">
                              <span className="block text-[11.5px] font-semibold leading-snug line-clamp-2" style={{ color: 'rgba(var(--text-rgb),0.85)' }}>{meeting?.title}</span>
                              <span className="block text-[9.5px]" style={{ color: 'var(--accent-soft)' }}>이 안건 · {threadList.length}회</span>
                            </span>
                          </button>
                          {threadGroupOpen && threadList.map(m => {
                            const active = meetingPreview?.id === m.id
                            const dateLabel = m.meeting_date ? format(parseISO(m.meeting_date), 'yyyy.M.d') : '날짜 없음'
                            return m.current ? (
                              <div key={m.id} className="flex items-center gap-1.5 pl-5 pr-1.5 py-1 text-[11px]" style={{ color: 'var(--accent-primary)' }}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent-primary)' }} />
                                {dateLabel} <span className="text-[9.5px] opacity-80">현재</span>
                              </div>
                            ) : (
                              <button key={m.id} onClick={() => openMeetingPreview(m, '같은 안건')}
                                className="w-full text-left flex items-center gap-1.5 pl-5 pr-1.5 py-1 rounded-md text-[11px] transition-colors hover:bg-[rgba(var(--ink-rgb),0.04)]"
                                style={active ? { background: 'rgba(76,127,224,0.15)', color: 'var(--accent-soft)' } : { color: 'rgba(var(--text-rgb),0.6)' }}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.25)' }} />
                                {dateLabel}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {categoryGroups.map(g => {
                        const label = meeting?.category ? `같은 범주 · ${meeting.category}` : '같은 범주'
                        if (g.list.length === 1) {
                          const m = g.list[0]
                          const active = meetingPreview?.id === m.id
                          return (
                            <button key={m.id} onClick={() => openMeetingPreview(m, label)}
                              title={m.title || '제목 없음'}
                              className="w-full text-left px-2 py-1.5 rounded-md transition-colors hover:bg-[rgba(var(--ink-rgb),0.04)]"
                              style={active ? { background: 'rgba(76,127,224,0.15)' } : undefined}>
                              <span className="block text-[10px]" style={{ color: active ? 'var(--accent-soft)' : 'rgba(var(--text-rgb),0.4)' }}>
                                {m.meeting_date ? format(parseISO(m.meeting_date), 'M.d') : '—'}
                              </span>
                              <span className="block text-[11.5px] leading-snug line-clamp-2"
                                style={{ color: active ? 'rgba(var(--text-rgb),1)' : 'rgba(var(--text-rgb),0.7)' }}>
                                {g.title}
                              </span>
                            </button>
                          )
                        }
                        const open = openCatGroups.has(g.title)
                        return (
                          <div key={`g:${g.title}`}>
                            <button
                              onClick={() => setOpenCatGroups(prev => { const n = new Set(prev); if (n.has(g.title)) n.delete(g.title); else n.add(g.title); return n })}
                              title={g.title}
                              className="w-full text-left flex items-start gap-1 px-1.5 py-1.5 rounded-md hover:bg-[rgba(var(--ink-rgb),0.04)]">
                              <span className="text-[9px] mt-[3px] flex-shrink-0" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>{open ? '▾' : '▸'}</span>
                              <span className="min-w-0">
                                <span className="block text-[10px]" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>
                                  {g.list[0].meeting_date ? format(parseISO(g.list[0].meeting_date), 'M.d') : '—'} · {g.list.length}회
                                </span>
                                <span className="block text-[11.5px] leading-snug line-clamp-2" style={{ color: 'rgba(var(--text-rgb),0.7)' }}>{g.title}</span>
                              </span>
                            </button>
                            {open && g.list.map(m => {
                              const active = meetingPreview?.id === m.id
                              return (
                                <button key={m.id} onClick={() => openMeetingPreview(m, label)}
                                  className="w-full text-left flex items-center gap-1.5 pl-5 pr-1.5 py-1 rounded-md text-[11px] transition-colors hover:bg-[rgba(var(--ink-rgb),0.04)]"
                                  style={active ? { background: 'rgba(76,127,224,0.15)', color: 'var(--accent-soft)' } : { color: 'rgba(var(--text-rgb),0.6)' }}>
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.25)' }} />
                                  {m.meeting_date ? format(parseISO(m.meeting_date), 'yyyy.M.d') : '날짜 없음'}
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {/* 우 8: 선택한 회의 내용 */}
                <div className="flex-1 min-w-0 flex flex-col">
                  {meetingPreview ? (
                    <>
                      <div className="flex items-start justify-between gap-2 mb-2 flex-shrink-0">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'rgba(var(--text-rgb),1)' }}>{meetingPreview.title || '제목 없음'}</p>
                          <p className="text-[11px] text-[rgba(var(--text-rgb),0.4)]">
                            {meetingPreview.meeting_date ? format(parseISO(meetingPreview.meeting_date), 'yyyy.MM.dd') : '날짜 없음'}
                            {meetingPreviewLabel ? ` · ${meetingPreviewLabel}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button onClick={() => router.push(`/meetings/${meetingPreview.id}`)}
                            className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-colors"
                            style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: 'var(--accent-soft)' }}>
                            이 회의 열기 →
                          </button>
                          <button onClick={closeMeetingPreview} title="닫기"
                            className="text-base leading-none px-1 text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)]">×</button>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1">
                        {meetingPreviewLoading ? (
                          <p className="text-sm text-[rgba(var(--text-rgb),0.3)]">불러오는 중...</p>
                        ) : meetingPreviewContent ? (
                          <MarkdownContent content={meetingPreviewContent} dark className="text-[13px] leading-relaxed" />
                        ) : (
                          <p className="text-sm text-[rgba(var(--text-rgb),0.3)]">기록된 노트가 없습니다</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-[12px] text-[rgba(var(--text-rgb),0.3)] text-center">왼쪽 목록에서 회의를 선택하면<br/>여기에 내용이 표시됩니다</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-start justify-center p-8 overflow-auto"
          onClick={() => setShowFullscreen(false)}>
          <div className="bg-[rgba(var(--ink-rgb),0.06)] rounded-2xl p-8 max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <p className="text-xs text-[rgba(var(--text-rgb),0.4)]">크게보기 모드 (클릭하면 닫힘)</p>
              <button onClick={() => setShowFullscreen(false)} className="text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)] text-xl">×</button>
            </div>
            <MarkdownContent content={fullscreenContent} dark className="text-lg text-[rgba(var(--text-rgb),0.9)] leading-relaxed" />
          </div>
        </div>
      )}
    </div>
  )
}
