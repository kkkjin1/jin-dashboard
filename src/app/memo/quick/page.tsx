'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDevPilotClient } from '@/lib/supabase/devPilotClient'
import { useAutosave, clearAutosaveBuffer } from '@/hooks/useAutosave'
import TiptapEditor from '@/components/TiptapEditor'
import { openQuickMemo, registerQuickMemoHeartbeat } from '@/lib/quickMemo'
import type { MemoTag } from '@/types'

const TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어', '공지']

const TAG_COLORS: Record<MemoTag, string> = {
  '업무관련': 'bg-[rgba(79,141,255,0.15)] text-[#4F8DFF] border-[rgba(79,141,255,0.3)]',
  '회의관련': 'bg-[rgba(139,92,246,0.15)] text-[#A78BFA] border-[rgba(139,92,246,0.3)]',
  '아이디어': 'bg-[rgba(249,158,11,0.15)] text-[#F99E0B] border-[rgba(249,158,11,0.3)]',
  '공지':     'bg-[rgba(239,68,68,0.15)] text-[#FC8181] border-[rgba(239,68,68,0.3)]',
  '완료':     'bg-[rgba(91,98,112,0.15)] text-[#7B8290] border-[rgba(91,98,112,0.3)]',
}

// 팝업마다 고유 id(qid)로 각자 독립된 슬롯에 저장 — 여러 창을 동시에 열어놔도
// 서로 덮어쓰지 않고, 크래시가 나도 열려 있던 창 수만큼 각자 복구 가능하다.
const DRAFTS_KEY = 'quick_memo_drafts'

type DraftEntry = { title: string; content: string; tag: MemoTag; updatedAt: number }
type DraftMap = Record<string, DraftEntry>

function readDrafts(): DraftMap {
  try {
    const s = localStorage.getItem(DRAFTS_KEY)
    if (s) return JSON.parse(s) as DraftMap
  } catch {}
  return {}
}

function writeDraftEntry(qid: string, entry: DraftEntry) {
  const all = readDrafts()
  all[qid] = entry
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(all)) } catch {}
}

function removeDraftEntry(qid: string) {
  const all = readDrafts()
  delete all[qid]
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(all)) } catch {}
}

// 저장 성공 직후에도 draft를 바로 지우지 않고 일정 기간 보관 — "성공한 것처럼 보였지만
// 실제로는 반영이 안 된" 경우(RLS, 네트워크 등)에도 최소한의 안전망이 남도록 함.
// (실패가 확인된 경우엔 handleSave에서 애초에 이 archive로 넘기지 않고 draft를 그대로 유지함)
const ARCHIVE_KEY = 'quick_memo_archive'
const ARCHIVE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000 // 3일
const ARCHIVE_MAX = 50

type ArchiveEntry = { title: string; content: string; tag: MemoTag; savedAt: number }

function readArchive(): ArchiveEntry[] {
  try {
    const s = localStorage.getItem(ARCHIVE_KEY)
    if (s) return JSON.parse(s) as ArchiveEntry[]
  } catch {}
  return []
}

function appendToArchive(entry: ArchiveEntry) {
  const now = Date.now()
  const pruned = readArchive().filter(e => now - e.savedAt < ARCHIVE_RETENTION_MS)
  const next = [entry, ...pruned].slice(0, ARCHIVE_MAX)
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next)) } catch {}
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function timeAgo(ts: number): string {
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.round(hr / 24)}일 전`
}

type AgendaGroupOption = { id: string; name: string; color: string }
type AgendaItemOption  = { id: string; title: string }

export default function QuickMemoPage() {
  const [title,        setTitle]        = useState('')
  const [content,      setContent]      = useState('')
  const [tag,          setTag]          = useState<MemoTag>('업무관련')
  const [saving,       setSaving]       = useState(false)
  const [savedMsg,     setSavedMsg]     = useState('')
  const [saveError,    setSaveError]    = useState('')
  const [autoSaved,    setAutoSaved]    = useState(false)
  const [slackCopied,  setSlackCopied]  = useState(false)
  const [editorKey,    setEditorKey]    = useState(0)
  // isHolderState: 버튼 렌더 제어 (SSR은 false → useEffect에서 클라이언트 확정)
  const [isHolderState, setIsHolderState] = useState(false)

  const titleRef  = useRef<HTMLInputElement>(null)
  const isHolder  = useRef(false)  // 슬롯 소유 여부 (saveDraft 등에서 사용)
  const qidRef    = useRef('')     // 이 창이 쓰는 draft 슬롯 id — orphan 선택 대기 중엔 빈 문자열
  const supabase  = createClient()

  // devPilotClient.ts의 설계 계약상 dev-pilot은 autosave_drafts/content_versions만
  // 격리하기 위한 것 — agenda_groups/agenda_items/agenda_sub_tasks/meetings/
  // meeting_notes/quick_memos 등 canonical 테이블은 항상 production(`supabase`)을
  // 써야 한다(회의록 MeetingNotesNew.tsx에서 동일 원인으로 발견/수정된 버그와 같은
  // 클래스, 2026-09-04). activeSupabase는 useAutosave 호출 한 곳에만 남긴다.
  const pilotClient   = getDevPilotClient()
  const isDevPilot    = pilotClient !== null
  const activeSupabase = pilotClient ?? supabase
  // qidRef는 ref라서 값이 바뀌어도 리렌더를 유발하지 않음 — useAutosave에 entityId로
  // 넘기려면 렌더링에 반영되는 state 미러가 필요해서 별도로 둔다.
  const [autosaveEntityId, setAutosaveEntityId] = useState('')

  // 크래시 등으로 이전에 정리되지 못한 draft가 여러 개 남아있을 때 고르게 하는 화면
  const [orphans, setOrphans] = useState<(DraftEntry & { id: string })[]>([])

  // 저장 성공 후에도 유예기간(3일) 보관되는 최근 저장 기록 — "저장됐다는데 안 보인다" 상황의 복구용
  const [showArchive, setShowArchive] = useState(false)
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([])

  function openArchive() {
    const now = Date.now()
    const fresh = readArchive().filter(e => now - e.savedAt < ARCHIVE_RETENTION_MS)
    setArchiveEntries(fresh)
    setShowArchive(true)
  }

  function restoreFromArchive(e: ArchiveEntry) {
    setTitle(e.title); setContent(e.content); setTag(e.tag)
    setEditorKey(k => k + 1)
    setShowArchive(false)
    setTimeout(() => titleRef.current?.focus(), 30)
  }

  // ── 클라이언트 마운트: draft 복원 (여러 개 남아있으면 고르게 함) ─────────
  useEffect(() => {
    isHolder.current = true
    setIsHolderState(true)
    // ?blank=1 이면 기존 창이 살아있는 상태에서 열린 새 창 — 항상 새 슬롯으로 시작
    const isCascaded = new URLSearchParams(window.location.search).get('blank') === '1'
    if (isCascaded) {
      qidRef.current = crypto.randomUUID()
      setAutosaveEntityId(qidRef.current)
      return
    }
    const drafts = readDrafts()
    const ids = Object.keys(drafts)
    if (ids.length === 0) {
      qidRef.current = crypto.randomUUID()
      setAutosaveEntityId(qidRef.current)
    } else if (ids.length === 1) {
      const id = ids[0]
      qidRef.current = id
      setAutosaveEntityId(id)
      const d = drafts[id]
      setTitle(d.title ?? ''); setContent(d.content ?? ''); setTag(d.tag ?? '업무관련')
      setEditorKey(k => k + 1)
    } else {
      // 2개 이상 남아있음 — 사용자가 고를 때까지 qid 미확정
      setOrphans(ids.map(id => ({ id, ...drafts[id] })).sort((a, b) => b.updatedAt - a.updatedAt))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickOrphan(o: DraftEntry & { id: string }) {
    qidRef.current = o.id
    setAutosaveEntityId(o.id)
    setTitle(o.title); setContent(o.content); setTag(o.tag)
    setEditorKey(k => k + 1)
    setOrphans([])
    setTimeout(() => titleRef.current?.focus(), 30)
  }

  function startFreshIgnoringOrphans() {
    qidRef.current = crypto.randomUUID()
    setAutosaveEntityId(qidRef.current)
    setOrphans([])
    setTimeout(() => titleRef.current?.focus(), 30)
  }

  // ── 세부task 연동 ─────────────────────────────────────────────────────────
  const [selText,        setSelText]        = useState('')
  const [showPicker,     setShowPicker]     = useState(false)
  const [pickerStep,     setPickerStep]     = useState<'group' | 'item'>('group')
  const [groups,         setGroups]         = useState<AgendaGroupOption[]>([])
  const [pickerItems,    setPickerItems]    = useState<AgendaItemOption[]>([])
  const [pickerLoading,  setPickerLoading]  = useState(false)
  const [subTaskCreated, setSubTaskCreated] = useState('')

  useEffect(() => {
    supabase.from('agenda_groups').select('id, name, color').order('sort_order').then(({ data }) => {
      setGroups((data ?? []) as AgendaGroupOption[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevPilot])

  const handleSelectionChange = useCallback((text: string) => {
    setSelText(text)
    if (!text) setShowPicker(false)
  }, [])

  // ── Autosave (docs/autosave-architecture.md / autosave-db-design.md) ────
  // autosave_drafts/content_versions만 쓰는 이 호출에 한해 activeSupabase를 그대로
  // 써서 dev-pilot 테스트 중엔 dev-pilot 프로젝트로, 프로덕션에서는 실제 로그인
  // 세션으로 production autosave_drafts/content_versions에 연결된다(STEP A-2).
  // entityId(qid)가 아직 없으면 enabled=false로 완전히 비활성. canonical
  // agenda_groups/agenda_items/agenda_sub_tasks/meetings/meeting_notes/quick_memos는
  // 항상 production(`supabase`)을 쓴다.
  const draftValue = useMemo(() => ({ title, content, tag }), [title, content, tag])
  const autosave = useAutosave({
    supabase: activeSupabase,
    enabled: isHolderState && !!autosaveEntityId,
    entityType: 'quick_memo',
    entityId: autosaveEntityId,
    fieldKey: 'draft',
    value: draftValue,
  })

  function applyRecovered() {
    if (!autosave.recovered) return
    const v = autosave.recovered.value as { title: string; content: string; tag: MemoTag }
    setTitle(v.title ?? ''); setContent(v.content ?? ''); setTag(v.tag ?? '업무관련')
    setEditorKey(k => k + 1)
    autosave.discardRecovered()
  }

  // ── 자동저장 ── 이 창 고유 슬롯(qid)에만 씀, 다른 창과 절대 안 겹침 ─────────
  const saveDraft = useCallback((t: string, c: string, tg: MemoTag) => {
    if (!isHolder.current || !qidRef.current) return
    if (t || c) {
      writeDraftEntry(qidRef.current, { title: t, content: c, tag: tg, updatedAt: Date.now() })
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 1500)
    } else {
      removeDraftEntry(qidRef.current)
    }
  }, [])

  // beforeunload: 아무것도 하지 않음 — draft는 localStorage에 그대로 남아 다음 열기 시 복원

  useEffect(() => {
    document.title = '빠른 메모'
    setTimeout(() => titleRef.current?.focus(), 80)
    return registerQuickMemoHeartbeat()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showPicker) { setShowPicker(false); return }
        window.close()
        return
      }
      // 팝업 안에서도 Ctrl+3으로 새 빠른 메모 팝업을 하나 더 열 수 있게.
      // 팝업은 열리자마자 제목 입력창에 자동으로 포커스가 가 있는 경우가 많아서,
      // 메인 앱과 달리 input/textarea 포커스 여부와 상관없이 항상 동작하게 둔다.
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        if (e.repeat) return
        e.preventDefault()
        openQuickMemo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPicker])

  // ── 초기화 후 닫기: draft 제거 → 다음 열기 시 빈 창 ────────────────────
  function handleDiscardAndClose() {
    if (qidRef.current) removeDraftEntry(qidRef.current)
    if (qidRef.current) clearAutosaveBuffer('quick_memo', qidRef.current, 'draft')
    window.close()
  }

  // ── 슬랙 복사: HTML → plain text (번호+공백 들여쓰기) ────────────────
  function htmlToSlackText(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const lines: string[] = []

    function getDirectText(li: Element): string {
      let text = ''
      for (const child of Array.from(li.childNodes)) {
        const el = child as Element
        if (child.nodeType === 3) {
          text += child.textContent ?? ''
        } else if (el.tagName !== 'OL' && el.tagName !== 'UL') {
          text += el.textContent ?? ''
        }
      }
      return text.trim()
    }

    function walkList(list: Element, depth: number) {
      let num = 0
      for (const li of Array.from(list.children)) {
        if (li.tagName !== 'LI') continue
        num++
        const text = getDirectText(li)
        if (text) {
          if (depth === 0) {
            lines.push(`${num}. ${text}`)
          } else {
            lines.push(`${'  '.repeat(depth - 1)}• ${text}`)
          }
        }
        for (const child of Array.from(li.children)) {
          if (child.tagName === 'OL' || child.tagName === 'UL') {
            walkList(child, depth + 1)
          }
        }
      }
    }

    for (const child of Array.from(doc.body.children)) {
      if (child.tagName === 'OL' || child.tagName === 'UL') {
        walkList(child, 0)
      } else {
        const text = child.textContent?.trim()
        if (text) lines.push(text)
      }
    }

    return lines.join('\n')
  }

  async function handleCopyForSlack() {
    if (!title && !content) return
    const titleHtml = title ? `<p><strong>${title}</strong></p>` : ''
    const slackText = htmlToSlackText(titleHtml + (content || ''))
    try {
      await navigator.clipboard.writeText(slackText)
    } catch {}
    setSlackCopied(true)
    setTimeout(() => setSlackCopied(false), 1500)
  }

  // ── 세부task ──────────────────────────────────────────────────────────────
  async function onGroupSelect(groupId: string) {
    setPickerLoading(true)
    const { data } = await supabase.from('agenda_items')
      .select('id, title').eq('group_id', groupId).eq('status', 'active').order('sort_order')
    setPickerItems((data ?? []) as AgendaItemOption[])
    setPickerLoading(false)
    setPickerStep('item')
  }

  async function onItemSelect(agendaItemId: string) {
    setPickerLoading(true)
    const { count } = await supabase.from('agenda_sub_tasks')
      .select('*', { count: 'exact', head: true }).eq('agenda_item_id', agendaItemId)
    await supabase.from('agenda_sub_tasks').insert({
      agenda_item_id: agendaItemId, title: selText, status: 'active', sort_order: (count ?? 0) + 1,
    })
    setPickerLoading(false)
    setSubTaskCreated(selText)
    setSelText(''); setShowPicker(false); setPickerStep('group')
    setTimeout(() => setSubTaskCreated(''), 2500)
  }

  // ── 저장 ─────────────────────────────────────────────────────────────────
  // "회의관련" 태그는 quick_memos가 아니라 회의록 탭(meetings + meeting_notes)에
  // '기타' 카테고리로 저장한다 — 정확한 범주는 사용자가 회의록 탭에서 직접 재분류.
  // 예전엔 제목의 날짜를 파싱해 project_meetings(아무 화면도 읽지 않는 테이블)에
  // 저장했다가 메모함/Ctrl+K 어디서도 안 보이는 사고가 있었음(2026-09-02) — 날짜
  // 추측 로직 자체를 없애고, 실제로 화면에 보이는 회의록 테이블로 명확히 저장한다.
  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    setSaveError('')

    // quick_memos 브랜치에서만 canonical id가 생김 — 회의록 브랜치는 별도 테이블이라
    // rebind 대상 자체가 없음(autosave_drafts는 계속 qid로만 추적).
    let canonicalQuickMemoId: string | null = null

    if (tag === '회의관련') {
      const today = new Date().toISOString().slice(0, 10)
      const { data: newMeeting, error: meetingError } = await supabase.from('meetings')
        .insert({ title: title.trim(), meeting_date: today, category: '기타' })
        .select('id, title, meeting_date, category').single()
      if (meetingError || !newMeeting) {
        setSaving(false)
        setSaveError('저장 실패 — 잠시 후 다시 시도해 주세요 (내용은 보존됨)')
        return
      }
      const now = new Date().toISOString()
      const { error: noteError } = await supabase.from('meeting_notes').insert({
        meeting_id: newMeeting.id, title: title.trim(), content, is_prep: false,
        created_at: now, updated_at: now,
      })
      if (noteError) {
        // 회의(껍데기)는 이미 생겼지만 본문 저장에 실패한 경우 — 사용자가 알아채지 못한 채
        // 내용이 빈 회의만 남는 걸 막기 위해 실패로 취급하고 draft는 그대로 보존
        setSaving(false)
        setSaveError('저장 실패 — 잠시 후 다시 시도해 주세요 (내용은 보존됨)')
        return
      }
      if (window.opener) window.opener.dispatchEvent(new CustomEvent('quick-meeting-created', { detail: newMeeting }))
      setSavedMsg('회의록에 저장됨!')
    } else {
      const { data: newMemo, error } = await supabase.from('quick_memos')
        .insert({ title: title.trim(), content, tag: [tag] })
        .select('id').single()
      if (error) {
        setSaving(false)
        setSaveError('저장 실패 — 잠시 후 다시 시도해 주세요 (내용은 보존됨)')
        return
      }
      canonicalQuickMemoId = newMemo?.id ?? null
      if (window.opener) window.opener.dispatchEvent(new CustomEvent('quick-memo-saved'))
      setSavedMsg('저장됨!')
    }

    // Autosave: canonical insert가 실제로 성공한 뒤에만 이번 메모를 'final' 버전으로
    // stamp — 실패 시(위에서 이미 return) 절대 호출되지 않음. canonicalQuickMemoId가
    // 있으면 같은 flush 호출 안에서 autosave_drafts의 임시 qid 행을 canonical id로
    // rebind(entity_id만 CAS로 변경) + canonical id 기준 새 content_versions 행을
    // INSERT — 기존 qid 기반 draft/version은 절대 건드리지 않음.
    const savedQid = qidRef.current
    if (savedQid) {
      const result = await autosave.flush({
        source: 'final',
        ...(canonicalQuickMemoId ? { rebindToEntityId: canonicalQuickMemoId } : {}),
      })
      if (canonicalQuickMemoId && !result.rebind?.ok) {
        // rebind 실패해도 canonical Save(quick_memos insert) 자체는 이미 성공했으므로
        // 롤백하지 않음 — 최소한의 추적 가능한 로그만 남김(민감정보 없음).
        console.error('quick_memo_autosave_rebind_failed', {
          event: 'quick_memo_autosave_rebind_failed',
          qid: savedQid,
          canonicalId: canonicalQuickMemoId,
          step: result.ok ? 'rebind' : 'sync',
          error: result.rebind?.error ?? result.error ?? 'unknown',
          timestamp: new Date().toISOString(),
        })
      }
      clearAutosaveBuffer('quick_memo', savedQid, 'draft')
    }

    // Final Save 성공 시(rebind 성공/실패 무관) 이 창의 draft identity를 즉시 새로
    // 교체 — 이후 같은 창에서 이어 입력해도 방금 저장된 메모와 identity를 공유하지
    // 않고 완전히 새 qid/버전 계열을 쓴다(docs/autosave-rollout-plan.md §16 item 24).
    if (savedQid) {
      qidRef.current = crypto.randomUUID()
      setAutosaveEntityId(qidRef.current)
    }

    // DB 저장이 실제로 성공했을 때만 — 그래도 즉시 파기하지 않고 보관함으로 옮겨
    // "성공한 것처럼 보였지만 실은 안 됐던" 경우에 대비한 유예기간을 둠
    appendToArchive({ title: title.trim(), content, tag, savedAt: Date.now() })
    if (savedQid) removeDraftEntry(savedQid)
    setSaving(false)
    setTitle(''); setContent(''); setTag('업무관련')
    setEditorKey(k => k + 1)
    setTimeout(() => { setSavedMsg(''); titleRef.current?.focus() }, 1200)
  }

  const hasDraftContent = !!(title || content)

  // 정리 안 된 draft가 2개 이상 남아있으면 — 어느 걸 이 창에서 이어쓸지 먼저 고르게 함
  return orphans.length > 0 ? (
    <div className="h-screen flex flex-col p-5" style={{ background: '#161B24', colorScheme: 'dark', boxSizing: 'border-box' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[#E5E7EB] text-sm tracking-wide">복구 가능한 메모 {orphans.length}개</h3>
        <button onClick={() => window.close()}
          className="text-[#5B6270] hover:text-[#E5E7EB] text-lg leading-none transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.08)]">
          ×
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: '#5B6270' }}>
        정상적으로 닫히지 않은 창이 여러 개 있어요. 이 창에서 이어서 작성할 메모를 골라주세요.
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col gap-2">
        {orphans.map(o => (
          <button key={o.id} onClick={() => pickOrphan(o)}
            className="text-left rounded-lg px-3 py-2.5 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium truncate" style={{ color: '#E5E7EB' }}>{o.title || '(제목 없음)'}</span>
              <span className="text-[10px] flex-shrink-0" style={{ color: '#5B6270' }}>{timeAgo(o.updatedAt)}</span>
            </div>
            <p className="text-xs truncate" style={{ color: '#9CA3AF' }}>{stripHtml(o.content) || '(내용 없음)'}</p>
          </button>
        ))}
      </div>
      <button onClick={startFreshIgnoringOrphans}
        className="mt-3 text-xs py-2 rounded-lg transition-colors text-center"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }}>
        새 메모로 시작 (나머지는 남겨둠)
      </button>
    </div>
  ) : (
    <div className="h-screen flex flex-col p-5 relative" style={{ background: '#161B24', colorScheme: 'dark', boxSizing: 'border-box' }}>
      {/* 최근 저장 기록 — 성공 저장 후에도 3일간 남아있는 보관함. "저장됐다는데 안 보인다" 복구용 */}
      {showArchive && (
        <div className="absolute inset-0 z-20 flex flex-col p-5" style={{ background: '#161B24' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#E5E7EB] text-sm tracking-wide">최근 저장 기록</h3>
            <button onClick={() => setShowArchive(false)}
              className="text-[#5B6270] hover:text-[#E5E7EB] text-lg leading-none transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.08)]">
              ×
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: '#5B6270' }}>
            저장 성공 후에도 3일간 남아있는 기록이에요. 목록에 안 보이는 메모가 있으면 여기서 복원해서 다시 저장해 주세요.
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col gap-2">
            {archiveEntries.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: '#5B6270' }}>최근 저장 기록이 없어요</p>
            ) : archiveEntries.map((e, i) => (
              <button key={i} onClick={() => restoreFromArchive(e)}
                className="text-left rounded-lg px-3 py-2.5 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate" style={{ color: '#E5E7EB' }}>{e.title || '(제목 없음)'}</span>
                  <span className="text-[10px] flex-shrink-0" style={{ color: '#5B6270' }}>{timeAgo(e.savedAt)}</span>
                </div>
                <p className="text-xs truncate" style={{ color: '#9CA3AF' }}>{stripHtml(e.content) || '(내용 없음)'}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[#E5E7EB] text-sm tracking-wide">빠른 메모</h3>
          {!isHolderState && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#5B6270', border: '1px solid rgba(255,255,255,0.08)' }}>
              새 메모
            </span>
          )}
          {isDevPilot && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide"
              style={{ background: 'rgba(249,158,11,0.15)', color: '#F99E0B', border: '1px solid rgba(249,158,11,0.35)' }}
              title="dev pilot Supabase 프로젝트에 연결됨 — 프로덕션 데이터에는 영향 없음">
              DEV PILOT MODE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AutosaveStatusBadge autosave={autosave} />
          {autoSaved && <span className="text-[10px] text-[#5B6270]">임시저장됨</span>}
          <button onClick={openArchive}
            className="text-[10px] px-2 py-1 rounded-lg transition-colors"
            style={{ color: '#5B6270', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            title="저장 성공 후에도 3일간 남아있는 최근 저장 기록">
            최근 저장 기록
          </button>
          <button onClick={() => window.close()}
            className="text-[#5B6270] hover:text-[#E5E7EB] text-lg leading-none transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.08)]">
            ×
          </button>
        </div>
      </div>

      {/* Autosave: 복구 배너 */}
      {autosave.recovered && (
        <div className="mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: 'rgba(76,127,224,0.1)', border: '1px solid rgba(76,127,224,0.3)', color: '#8DAEE6' }}>
          <span>복구 가능한 자동저장 내용이 있습니다</span>
          <div className="flex-1" />
          <button onClick={applyRecovered} className="underline underline-offset-2">적용</button>
          <button onClick={() => autosave.discardRecovered()} className="underline underline-offset-2">무시</button>
        </div>
      )}

      {/* Autosave: 충돌 배너 — 자동 병합하지 않고 사용자가 선택 */}
      {autosave.conflict && (
        <div className="mb-2 px-3 py-2 rounded-lg text-xs flex flex-col gap-1.5"
          style={{ background: 'rgba(249,158,11,0.1)', border: '1px solid rgba(249,158,11,0.35)', color: '#F99E0B' }}>
          <span>다른 창/기기에서 이 메모가 변경되었습니다 — 자동 병합하지 않습니다.</span>
          <div className="flex items-center gap-2">
            <button onClick={() => autosave.resolveConflict('keep-mine')} className="underline underline-offset-2">
              내 내용 유지(덮어쓰기)
            </button>
            <button
              onClick={() => {
                const v = autosave.conflict?.serverContent as { title: string; content: string; tag: MemoTag } | undefined
                if (v) { setTitle(v.title ?? ''); setContent(v.content ?? ''); setTag(v.tag ?? '업무관련'); setEditorKey(k => k + 1) }
                autosave.resolveConflict('take-theirs')
              }}
              className="underline underline-offset-2">
              서버 내용 사용
            </button>
          </div>
        </div>
      )}

      {/* 태그 */}
      <div className="flex gap-1.5 mb-3">
        {TAGS.map(t => (
          <button key={t}
            onClick={() => { setTag(t); saveDraft(title, content, t) }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tag === t
              ? TAG_COLORS[t]
              : 'bg-[rgba(255,255,255,0.05)] text-[#5B6270] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#A1A7B3]'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* 제목 */}
      <input
        ref={titleRef}
        value={title}
        onChange={e => { setTitle(e.target.value); saveDraft(e.target.value, content, tag) }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) e.preventDefault()
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        }}
        placeholder={tag === '회의관련' ? '호균님 미팅' : '제목 (Ctrl+Enter 저장)'}
        className="w-full text-sm placeholder:text-[#5B6270] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 focus:outline-none focus:border-[rgba(255,255,255,0.2)] mb-1.5"
        style={{ background: '#1A1C1F', color: '#E5E7EB' }}
      />

      {tag === '회의관련' && (
        <p className="text-xs mb-2 px-0.5 text-[#A78BFA]">
          📋 회의록 탭 &gt; &lsquo;기타&rsquo; 범주에 저장됩니다 — 필요하면 회의록 탭에서 범주를 옮겨주세요
        </p>
      )}

      {/* 본문 */}
      <div className="flex-1 min-h-0 mb-2 overflow-y-auto scrollbar-hide border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2"
        style={{ background: '#1A1C1F' }}>
        <TiptapEditor
          key={editorKey}
          value={content}
          onChange={v => { setContent(v); saveDraft(title, v, tag) }}
          onSubmit={handleSave}
          onSelectionChange={handleSelectionChange}
          dark
          minHeight={140}
        />
      </div>

      {/* 세부task 생성 Bar */}
      {subTaskCreated ? (
        <div className="mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: 'rgba(56,190,152,0.12)', border: '1px solid rgba(56,190,152,0.2)', color: '#38BE98' }}>
          <span>✓</span>
          <span className="flex-1 truncate">세부task 생성됨: {subTaskCreated}</span>
        </div>
      ) : selText && !showPicker ? (
        <div className="mb-2 flex items-center gap-2">
          <div className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg truncate"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.07)' }}>
            &ldquo;{selText}&rdquo;
          </div>
          <button type="button"
            onMouseDown={e => { e.preventDefault(); setShowPicker(true); setPickerStep('group') }}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: 'rgba(76,127,224,0.14)', color: '#8DAEE6', border: '1px solid rgba(76,127,224,0.25)' }}>
            + 세부task
          </button>
        </div>
      ) : null}

      {/* 안건 Picker */}
      {showPicker && (
        <div className="mb-2 rounded-lg overflow-hidden"
          style={{ background: '#1A2030', border: '1px solid rgba(255,255,255,0.09)' }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {pickerStep === 'item' ? (
              <button type="button" onClick={() => setPickerStep('group')}
                className="text-[11px] flex items-center gap-1" style={{ color: '#7B8397' }}>← 뒤로</button>
            ) : (
              <span className="text-[11px]" style={{ color: '#7B8397' }}>프로젝트 선택</span>
            )}
            <span className="text-[10px] truncate max-w-[160px] px-2" style={{ color: '#5B6270' }}>&ldquo;{selText}&rdquo;</span>
            <button type="button" onClick={() => setShowPicker(false)}
              className="text-[13px] leading-none" style={{ color: '#5B6270' }}>×</button>
          </div>
          <div className="max-h-[140px] overflow-y-auto scrollbar-hide py-1">
            {pickerLoading ? (
              <div className="text-[11px] px-3 py-3 text-center" style={{ color: '#5B6270' }}>로딩 중...</div>
            ) : pickerStep === 'group' ? (
              groups.length === 0
                ? <div className="text-[11px] px-3 py-3 text-center" style={{ color: '#5B6270' }}>프로젝트가 없습니다</div>
                : groups.map(g => (
                    <button key={g.id} type="button" onClick={() => onGroupSelect(g.id)}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                      style={{ color: '#C9D2E0' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color, flexShrink: 0, display: 'inline-block' }} />
                      {g.name}
                    </button>
                  ))
            ) : (
              pickerItems.length === 0
                ? <div className="text-[11px] px-3 py-3 text-center" style={{ color: '#5B6270' }}>안건이 없습니다</div>
                : pickerItems.map(item => (
                    <button key={item.id} type="button" onClick={() => onItemSelect(item.id)} disabled={pickerLoading}
                      className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40"
                      style={{ color: '#C9D2E0' }}>
                      {item.title}
                    </button>
                  ))
            )}
          </div>
        </div>
      )}

      {/* 저장 실패 안내 — 실패 시 draft는 지우지 않으므로 재시도하면 됨 */}
      {saveError && (
        <div className="mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FC8181' }}>
          <span>⚠</span>
          <span className="flex-1">{saveError}</span>
        </div>
      )}

      {/* 푸터 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-[#3B404D] whitespace-nowrap">ESC · Ctrl+Enter</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 슬랙 복사 */}
          <button
            onClick={handleCopyForSlack}
            disabled={!hasDraftContent}
            className="text-xs px-3 py-2 rounded-lg border transition-all whitespace-nowrap disabled:opacity-30"
            style={{
              background: slackCopied ? 'rgba(102,204,153,0.18)' : 'rgba(102,204,153,0.07)',
              border: `1px solid ${slackCopied ? 'rgba(102,204,153,0.45)' : 'rgba(102,204,153,0.2)'}`,
              color: slackCopied ? '#66CC99' : 'rgba(102,204,153,0.7)',
            }}
            title="슬랙에 붙여넣기 위한 형식으로 복사 (1/2단계 번호, 3/4단계 글머리)">
            {slackCopied ? '복사됨!' : '슬랙 복사'}
          </button>
          {/* 초기화 후 닫기 — holder 팝업에 항상 표시 */}
          {isHolderState && (
            <button
              onClick={handleDiscardAndClose}
              className="text-xs px-3 py-2 rounded-lg border transition-all whitespace-nowrap"
              style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: 'rgba(252,129,129,0.7)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.14)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)'
                e.currentTarget.style.color = '#FC8181'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.07)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'
                e.currentTarget.style.color = 'rgba(252,129,129,0.7)'
              }}
              title="복원 없이 닫기 — 다음에 열면 빈 창">
              초기화 후 닫기
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="text-xs bg-[rgba(76,127,224,0.1)] text-[rgba(230,231,234,0.85)] border border-[rgba(255,255,255,0.08)] px-4 py-2 rounded-lg hover:bg-[rgba(76,127,224,0.18)] disabled:opacity-30 transition-colors flex-shrink-0"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            {savedMsg || (saving ? '저장 중...' : '저장')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Autosave 상태 표시 — docs/autosave-architecture.md Ch.15.A:
// 성공하지 않았는데 "저장됨"으로 보이는 표시는 절대 하지 않는다(honest status).
function AutosaveStatusBadge({ autosave }: { autosave: ReturnType<typeof useAutosave<{ title: string; content: string; tag: MemoTag }>> }) {
  const { status, failureReason } = autosave
  const map: Record<string, { text: string; color: string }> = {
    'idle':          { text: '', color: '#5B6270' },
    'local-saving':  { text: '로컬 저장 중…', color: '#5B6270' },
    'pending-sync':  { text: '동기화 대기…', color: '#5B6270' },
    'syncing':       { text: '서버 저장 중…', color: '#8DAEE6' },
    'saved':         { text: '자동저장됨(서버)', color: '#66CC99' },
    'retrying':      { text: failureReason === 'network' ? '오프라인 — 재연결 시 자동 저장' : '저장 실패 · 재시도 중', color: '#F99E0B' },
    'error':         { text: '저장 실패 · 로컬 보관', color: '#FC8181' },
    'conflict':      { text: '충돌 발생', color: '#F99E0B' },
  }
  const cur = map[status] ?? map.idle
  if (!cur.text) return null
  return <span className="text-[10px]" style={{ color: cur.color }}>{cur.text}</span>
}

