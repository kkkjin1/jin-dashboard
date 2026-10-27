'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAutosave } from '@/hooks/useAutosave'
import type { AgendaItem, AgendaSubTask, Attachment, Member, LearningResource } from '@/types'
import ProjectSourceSelect from '@/components/project/ProjectSourceSelect'
import dynamic from 'next/dynamic'
import type { FreeNoteEmbed } from '@/components/sketch/FreeNoteCanvas'
import AgendaRetroDrawer from '@/components/project/AgendaRetroDrawer'
import { revealVoiceBlock, showVoiceNotice } from '@/lib/executiveVoices'
import { todayYmd } from '@/lib/tiptapExtensions'
import PlanRecordBox from '@/components/project/PlanRecordBox'
import AgendaTodoList from '@/components/project/AgendaTodoList'
import type { PlanBoxColorKey } from '@/lib/planBoxColors'

// 업무 개요 · 메모 = 생각스케치 자유노트 화면 그대로(본문은 description, 떠 있는 요소는 안건별 숨김 보드)
const FreeNoteCanvas = dynamic(() => import('@/components/sketch/FreeNoteCanvas'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>불러오는 중…</div>,
})

const STATUS_CYCLE = ['active', 'hold', 'done'] as const
type Status = typeof STATUS_CYCLE[number]
const STATUS_LABEL: Record<Status, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<Status, string> = {
  active: 'bg-blue-50 text-blue-600 border-blue-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
  done:   'bg-gray-100 text-gray-400 border-gray-200',
}
const STATUS_DOT: Record<Status, string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }


interface SubTaskNote {
  id: string
  content: string
  created_at: string
  edited_at?: string | null
  title?: string | null
}

interface SubTaskWithNote extends AgendaSubTask {
  currentNote: SubTaskNote | null
  historyNotes: SubTaskNote[]
}

export default function AgendaItemDetailPage() {
  const { id }         = useParams<{ id: string }>()
  const router         = useRouter()
  const searchParams   = useSearchParams()
  const focusSTId      = searchParams.get('focus')
  const supabase       = createClient()

  const [item,      setItem]      = useState<AgendaItem | null>(null)
  const [group,     setGroup]     = useState<{ name: string; color: string } | null>(null)
  const [subTasks,  setSubTasks]  = useState<SubTaskWithNote[]>([])
  const [members,   setMembers]   = useState<Member[]>([])
  const [loading,   setLoading]   = useState(true)

  // 설명 박스
  const [description, setDescription] = useState('')
  // 업무 개요 · 메모의 떠 있는 요소(포스트잇·이미지·표·마인드맵 카드)를 담는 숨김 보드 id
  const [memoBoardId, setMemoBoardId] = useState<string | null>(null)

  // 제목 편집
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle,    setEditTitle]    = useState('')

  // 학습자료 슬라이드 패널
  const [panelResource, setPanelResource] = useState<LearningResource | null>(null)

  // 아코디언 열림 상태
  const [openST, setOpenST] = useState<Set<string>>(new Set())

  const [expandFor,     setExpandFor]     = useState<string | null>(null)
  const [retroOpen,     setRetroOpen]     = useState(false)
  // 좌우 분할 보기(lg 이상에서만 적용) — 안건 본문과 하위태스크를 각각 독립 스크롤. 기기별 선호는 localStorage
  const [splitView,     setSplitView]     = useState(true)
  useEffect(() => {
    try { if (localStorage.getItem('itemDetail.splitView') === '0') setSplitView(false) } catch {}
  }, [])
  const toggleSplitView = () => setSplitView(v => {
    try { localStorage.setItem('itemDetail.splitView', v ? '0' : '1') } catch {}
    return !v
  })

  // 첨부파일
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingFor, setUploadingFor] = useState<string | null>(null) // 'item' | stId
  const [uploadError,  setUploadError]  = useState<string>('')

  // STEP D Group 2: canonical write 실패 감지 + 표시용 단일 공통 에러 상태.
  // 이 컴포넌트에 정의된 모든 canonical write 핸들러(제목/설명/상태/날짜/담당자/
  // 세부task/note/생성/삭제)가 공유해서 쓴다 — SubTaskAccordion엔 상태를 두지
  // 않고 handler를 그대로 prop으로 전달받는 기존 구조를 그대로 활용.
  const [saveError, setSaveError] = useState('')
  const SAVE_ERROR_MSG   = '저장 실패 — 화면에는 반영됐지만 서버에 저장되지 않았을 수 있습니다. 새로고침 후 다시 확인해주세요.'
  const CREATE_ERROR_MSG = '생성 실패 — 잠시 후 다시 시도해주세요.'
  const DELETE_ERROR_MSG = '삭제 실패 — 목록에서 사라졌지만 실제로는 삭제되지 않았을 수 있습니다. 새로고침 후 확인해주세요.'


  // ── Autosave (안건 자체 title/description만, STEP B-1) ───────────────────
  // canonical UPDATE(saveTitle/handleDescription)는 그대로 유지 — 이 훅은
  // autosave_drafts/content_versions에만 병행 기록한다(agenda_items에는 쓰지 않음).
  // entity_id는 항상 실존하는 agenda_items.id(URL 파라미터)이므로 qid/rebind 불필요.
  useAutosave({
    supabase,
    enabled: !!id && editingTitle,
    entityType: 'project_item',
    entityId: id,
    fieldKey: 'title',
    value: editTitle,
  })
  // description 자동저장 버퍼는 업무 개요 칸(FreeNoteCanvas)이 같은 키(project_item/description)로 맡는다

  // ── 날짜 헬퍼 ──────────────────────────────────────────────────
  const sched = (() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const d = new Date(), tom = new Date(d), fri = new Date(d)
    tom.setDate(d.getDate() + 1)
    fri.setDate(d.getDate() + (5 - d.getDay() + 7) % 7)
    return { today: fmt(d), tomorrow: fmt(tom), friday: fmt(fri) }
  })()

  // ── 데이터 로드 ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data: iData } = await supabase
      .from('agenda_items')
      .select('*, agenda_groups(name, color)')
      .eq('id', id)
      .single()
    if (!iData) { setLoading(false); return }

    const { agenda_groups, ...rest } = iData as AgendaItem & { agenda_groups: { name: string; color: string } }
    setItem(rest)
    setGroup(agenda_groups)
    setDescription(rest.description ?? '')

    const { data: stData } = await supabase
      .from('agenda_sub_tasks')
      .select('*')
      .eq('agenda_item_id', id)
      .order('sort_order')

    const fetchedSTs = (stData ?? []) as AgendaSubTask[]

    // 각 서브태스크의 최신 노트 불러오기
    if (fetchedSTs.length > 0) {
      const { data: noteData } = await supabase
        .from('sub_task_notes')
        .select('*')
        .in('sub_task_id', fetchedSTs.map(s => s.id))
        .order('created_at', { ascending: false })

      const allNotesMap: Record<string, SubTaskNote[]> = {}
      ;(noteData ?? []).forEach((n: SubTaskNote & { sub_task_id: string }) => {
        if (!allNotesMap[n.sub_task_id]) allNotesMap[n.sub_task_id] = []
        allNotesMap[n.sub_task_id].push(n)
      })

      setSubTasks(fetchedSTs.map(st => {
        const stNotes = allNotesMap[st.id] ?? []
        return { ...st, currentNote: stNotes[0] ?? null, historyNotes: stNotes.slice(1) }
      }))
    } else {
      setSubTasks([])
    }

    // 첨부파일 로드 — 업무(agenda_item_id=id) + 서브태스크별(sub_task_id in stIds)
    const stIds = fetchedSTs.map(s => s.id)
    const attFilter = stIds.length > 0
      ? `agenda_item_id.eq.${id},sub_task_id.in.(${stIds.join(',')})`
      : `agenda_item_id.eq.${id}`
    const { data: attData } = await supabase
      .from('attachments')
      .select('*')
      .or(attFilter)
      .order('created_at', { ascending: false })
    setAttachments((attData ?? []) as Attachment[])

    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  // fetchMembers는 내부에서 별도 createClient를 쓰므로 세션이 다를 수 있음
  // → 이 컴포넌트의 supabase 인스턴스로 직접 쿼리
  useEffect(() => {
    supabase.from('members').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // focus 파라미터 처리 — 해당 히스토리 박스를 열고 스크롤
  useEffect(() => {
    if (!focusSTId || subTasks.length === 0) return
    setOpenST(prev => { const s = new Set(prev); s.add(focusSTId); return s })
    setTimeout(() => {
      document.getElementById(`rec-${focusSTId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [focusSTId, subTasks.length])

  // 의사결정 탭 "원본 →" — note(세부task 메모 id)를 선택하고 voice(발언 id) 줄로 스크롤·강조. 로드 직후 한 번만.
  // retro=1 이면 업무 회고 서랍을 열고 그 안(받은 피드백 칸)에서 voice 줄을 찾는다
  const noteParam = searchParams.get('note'), voiceParam = searchParams.get('voice'), retroParam = searchParams.get('retro')
  const voiceLinkDone = useRef(false)
  useEffect(() => {
    if (loading || voiceLinkDone.current || (!noteParam && !voiceParam && !retroParam)) return
    voiceLinkDone.current = true
    if (!item) { showVoiceNotice('원본 안건을 찾지 못했습니다 — 삭제되었을 수 있습니다.'); return }
    if (retroParam) queueMicrotask(() => setRetroOpen(true))
    if (noteParam && focusSTId) {
      const st = subTasks.find(s => s.id === focusSTId)
      const found = st && (st.currentNote?.id === noteParam || st.historyNotes.some(n => n.id === noteParam))
      if (!found) { showVoiceNotice('원본 메모를 찾지 못했습니다 — 삭제되었거나 다른 세부 Task로 옮겨졌을 수 있습니다.'); return }
    }
    if (voiceParam) setTimeout(() => revealVoiceBlock(voiceParam), 250)
  }, [loading, item, subTasks, focusSTId, noteParam, voiceParam, retroParam])

  // 크게 편집 ESC 닫기
  useEffect(() => {
    if (!expandFor) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setExpandFor(null) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [expandFor])

  // ── 업무 개요 · 메모(생각스케치) ──────────────────────────────────
  // 안건별 숨김 보드를 찾고, 없으면 만든다. 동시에 두 번 만들어지면 유니크 제약에 걸리므로 다시 조회.
  useEffect(() => {
    if (!item) return
    let cancelled = false
    async function ensureMemoBoard() {
      const find = () => supabase.from('sketch_boards').select('id').eq('agenda_item_id', id).maybeSingle()
      let { data } = await find()
      if (!data) {
        const { data: created, error } = await supabase.from('sketch_boards')
          .insert({ name: item!.title, board_type: 'freenote', agenda_item_id: id }).select('id').single()
        data = created ?? (error ? (await find()).data : null)
      }
      if (cancelled) return
      if (data) setMemoBoardId(data.id as string)
      else setSaveError('업무 개요 화면을 준비하지 못했습니다 — 새로고침 후 다시 시도해주세요.')
    }
    ensureMemoBoard()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  const memoEmbedBase: Omit<FreeNoteEmbed, 'title' | 'actions'> = {
    initialBody: description,
    saveBody: html => { setDescription(html); return supabase.from('agenda_items').update({ description: html }).eq('id', id) },
    autosave: { entityType: 'project_item', entityId: id, fieldKey: 'description' },
  }

  // ── 제목 저장 ─────────────────────────────────────────────────────
  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !item) { setEditingTitle(false); return }
    const { error } = await supabase.from('agenda_items').update({ title: t }).eq('id', id)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setItem(p => p ? { ...p, title: t } : p)
    setEditingTitle(false)
  }

  // ── 상태 순환 ────────────────────────────────────────────────────
  async function cycleStatus() {
    if (!item) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status as Status) + 1) % STATUS_CYCLE.length]
    const completed_at = next === 'done' ? todayYmd() : null
    const { error } = await supabase.from('agenda_items').update({ status: next, completed_at }).eq('id', id)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setItem(p => p ? { ...p, status: next, completed_at } : p)
  }


  // ── 아코디언 토글 ────────────────────────────────────────────────
  function toggleST(stId: string) {
    setOpenST(prev => {
      const s = new Set(prev)
      s.has(stId) ? s.delete(stId) : s.add(stId)
      return s
    })
  }








  // ── 첨부파일 업로드 ─────────────────────────────────────────────
  // target: 'item' → 업무 전체, stId → 특정 서브태스크
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'item' | string) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadingFor(target)
    setUploadError('')
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = target === 'item'
          ? `agenda-items/${id}/${Date.now()}_${safeName}`
          : `agenda-items/${id}/subtasks/${target}/${Date.now()}_${safeName}`
        const { error: storageErr } = await supabase.storage.from('attachments').upload(path, file)
        if (storageErr) { setUploadError(`스토리지 오류: ${storageErr.message}`); continue }
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertRow: any = target === 'item'
          ? { task_id: null, agenda_item_id: id,   sub_task_id: null,   meeting_id: null, name: file.name, type: '파일', url: urlData.publicUrl }
          : { task_id: null, agenda_item_id: null, sub_task_id: target, meeting_id: null, name: file.name, type: '파일', url: urlData.publicUrl }
        const { data, error: dbErr } = await supabase.from('attachments').insert(insertRow).select().single()
        if (dbErr) { setUploadError(`DB 오류: ${dbErr.message}`); continue }
        if (data) setAttachments(prev => [data as Attachment, ...prev])
      }
    } finally {
      setUploadingFor(null)
      e.target.value = ''
    }
  }

  async function deleteAttachment(att: Attachment) {
    let hadError = false
    const path = att.url.split('/object/public/attachments/')[1]
    if (path) {
      const { error: storageErr } = await supabase.storage.from('attachments').remove([path])
      if (storageErr) hadError = true
    }
    const { error: dbErr } = await supabase.from('attachments').delete().eq('id', att.id)
    if (dbErr) hadError = true
    setSaveError(hadError ? DELETE_ERROR_MSG : '')
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  // 분류 헬퍼
  const itemAtts  = attachments.filter(a => a.agenda_item_id === id && !a.sub_task_id)


  // ── 하위태스크 제목 수정 ─────────────────────────────────────────
  async function updateSTTitle(stId: string, title: string) {
    const { error } = await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s))
  }

  // ── 하위태스크 삭제 ──────────────────────────────────────────────
  async function deleteSubTask(stId: string) {
    const { error } = await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSaveError(error ? DELETE_ERROR_MSG : '')
    setSubTasks(p => p.filter(s => s.id !== stId))
  }

  async function updateSubTaskDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('agenda_sub_tasks') as any).update({ target_date: date }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, target_date: date ?? undefined } : s))
  }

  async function updateSTColor(stId: string, color: PlanBoxColorKey | null) {
    const { error } = await supabase.from('agenda_sub_tasks').update({ color }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, color } : s))
  }

  // ── 기획 기록 박스 ⇄ 실행 task ────────────────────────────────────
  async function updateSTKind(stId: string, kind: 'task' | 'record') {
    const { error } = await supabase.from('agenda_sub_tasks').update({ kind }).eq('id', stId)
    if (error) { setSaveError(SAVE_ERROR_MSG); return }
    setSaveError('')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, kind } : s))
  }

  // ── 할 일(체크 한 줄) ───────────────────────────────────────────
  async function addTask(title: string): Promise<boolean> {
    const { data, error } = await supabase.from('agenda_sub_tasks')
      .insert({ agenda_item_id: id, title, status: 'active', kind: 'task', sort_order: subTasks.length })
      .select().single()
    if (error || !data) { setSaveError(CREATE_ERROR_MSG); return false }
    setSaveError('')
    setSubTasks(p => [...p, { ...(data as AgendaSubTask), currentNote: null, historyNotes: [] }])
    return true
  }
  async function setSTStatus(stId: string, status: 'active' | 'done') {
    const { error } = await supabase.from('agenda_sub_tasks').update({ status }).eq('id', stId)
    if (error) { setSaveError(SAVE_ERROR_MSG); return }
    setSaveError('')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, status } : s))
  }

  const [renameRecordId, setRenameRecordId] = useState<string | null>(null)
  async function addRecord() {
    const { data, error } = await supabase.from('agenda_sub_tasks')
      .insert({ agenda_item_id: id, title: '새 기획 박스', status: 'active', kind: 'record', sort_order: subTasks.length })
      .select().single()
    if (error || !data) { setSaveError(CREATE_ERROR_MSG); return }
    setSaveError('')
    const rec: SubTaskWithNote = { ...(data as AgendaSubTask), currentNote: null, historyNotes: [] }
    setSubTasks(p => [...p, rec])
    setOpenST(prev => { const s = new Set(prev); s.add(rec.id); return s })
    setRenameRecordId(rec.id)
  }

  async function updateSTAssignee(stId: string, assigneeId: string | null) {
    const { error } = await supabase.from('agenda_sub_tasks').update({ assignee_id: assigneeId }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, assignee_id: assigneeId } : s))
  }



  if (loading) return <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  if (!item)   return <div className="flex items-center justify-center h-40 text-sm text-gray-400">안건을 찾을 수 없습니다.</div>

  const groupColor = group?.color ?? '#3B82F6'
  // B: 기획 기록 박스(kind='record', 최신이 위)와 실행 task(그 외 — 프로젝트탭·홈 목록에 나오는 것)
  const records    = subTasks.filter(s => s.kind === 'record').sort((a, b) => b.created_at.localeCompare(a.created_at))
  const tasks      = subTasks.filter(s => s.kind !== 'record')
  const doneCount  = tasks.filter(s => s.status === 'done').length

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className={`w-full mx-auto px-4 md:px-6 py-6 pb-16 flex flex-col gap-6 ${splitView ? 'max-w-3xl lg:max-w-none lg:ml-0' : 'max-w-3xl'}`}>

        {/* ── 브레드크럼 ── */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <button onClick={() => router.back()} className="hover:text-gray-700 transition-colors flex items-center gap-1">
            <span>←</span> <span>돌아가기</span>
          </button>
          {group && (
            <>
              <span>·</span>
              <span style={{ color: groupColor, fontWeight: 600 }}>{group.name}</span>
            </>
          )}
          <span>·</span>
          <span className="text-gray-500 truncate max-w-[200px]">{item.title}</span>
          <button onClick={toggleSplitView}
            title={splitView ? '위아래로 보기' : '좌우로 나눠 보기'}
            className="hidden lg:flex ml-auto items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-[rgba(var(--ink-rgb),0.08)] text-[rgba(var(--text-rgb),0.45)] hover:text-[rgba(var(--text-rgb),0.8)] hover:bg-[rgba(var(--ink-rgb),0.05)] transition-colors">
            {splitView ? '☰ 위아래 보기' : '◫ 좌우 분할 보기'}
          </button>
        </div>

        {/* 저장 실패 안내 — canonical write 실패 시 공통 표시(STEP D Group 2) */}
        {saveError && (
          <div className="px-4 py-2.5 rounded-xl text-xs flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--error-badge-text)' }}>
            <span>⚠</span>
            <span className="flex-1">{saveError}</span>
            <button onClick={() => setSaveError('')} className="text-[10px] opacity-70 hover:opacity-100 flex-shrink-0">닫기</button>
          </div>
        )}

        {/* ── 제목 + 상태 ── */}
        <div className="flex items-start gap-3">
          <button onClick={cycleStatus} title={STATUS_LABEL[item.status as Status]}
            style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_DOT[item.status as Status], border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 8 }} />
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input autoFocus value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                onBlur={saveTitle}
                className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-400 focus:outline-none bg-transparent pb-0.5" />
            ) : (
              <h1
                onClick={() => { setEditingTitle(true); setEditTitle(item.title) }}
                className="text-2xl font-bold cursor-text hover:text-[rgba(var(--text-rgb),0.7)] transition-colors leading-tight"
                style={{ color: item.status === 'done' ? '#9CA3AF' : 'rgba(var(--text-rgb),1)', textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                {item.title}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button onClick={cycleStatus}
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[item.status as Status]}`}>
                {STATUS_LABEL[item.status as Status]}
              </button>
              {item.status === 'done' && (
                <button onClick={() => setRetroOpen(true)}
                  className="text-xs px-2.5 py-1 rounded-full font-semibold transition-opacity hover:opacity-75"
                  style={{ background: 'rgba(123,174,148,0.16)', color: '#5E9A7C', border: '1px solid rgba(123,174,148,0.35)' }}>
                  업무 회고
                </button>
              )}
              {subTasks.length > 0 && (
                <span className="text-xs text-[rgba(var(--text-rgb),0.5)] bg-white/[0.06] border border-white/[0.09] px-2.5 py-1 rounded-full">
                  할 일 {doneCount}/{tasks.length}{records.length > 0 ? ` · 히스토리 ${records.length}` : ''}
                </span>
              )}
            </div>
            {/* 출처 — 목표 연계 실무(연도계획) / 일반 실무. 제목보다 약하게 한 줄로만 */}
            <div className="mt-2">
              <ProjectSourceSelect
                projectId={item.id}
                yearPlanId={item.annual_goal_year_plan_id ?? null}
                onChanged={v => setItem(p => p ? { ...p, annual_goal_year_plan_id: v } : p)}
                onError={setSaveError}
              />
            </div>
          </div>
        </div>

        {/* ── 본문 / 하위태스크 — splitView면 lg 이상에서 좌우 2열·각자 스크롤.
            자식 카드가 overflow-hidden이라 flex-shrink 되면 내용이 잘리고 열 스크롤이 안 생김 → [&>*]:flex-shrink-0 ── */}
        <div className={`flex flex-col gap-6 ${splitView ? 'lg:flex-row lg:items-start' : ''}`}>
        <div className={`flex flex-col gap-6 ${splitView ? 'lg:w-[60%] lg:max-w-[960px] lg:flex-shrink-0' : ''}`}>

        {/* ── 업무 개요 · 메모 — 생각스케치 자유노트 그대로 ── */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="px-4 pt-3" style={{ height: '72vh', minHeight: 480 }}>
            {expandFor === 'description' ? (
              <div className="h-full flex items-center justify-center text-xs text-[rgba(var(--text-rgb),0.35)]">크게 보기에서 편집 중</div>
            ) : memoBoardId ? (
              <FreeNoteCanvas
                key={memoBoardId}
                boardId={memoBoardId}
                embed={{
                  ...memoEmbedBase,
                  title: <span className="text-xs font-semibold text-[rgba(var(--text-rgb),0.4)] uppercase tracking-wider flex-shrink-0">업무 개요 · 메모</span>,
                  actions: (
                    <button onClick={() => setExpandFor('description')}
                      className="text-[10px] text-[rgba(var(--text-rgb),0.35)] hover:text-[rgba(var(--text-rgb),0.7)] px-2 py-1 rounded hover:bg-[rgba(var(--ink-rgb),0.06)] transition-colors flex-shrink-0">
                      크게 보기
                    </button>
                  ),
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[rgba(var(--text-rgb),0.35)] animate-pulse">불러오는 중…</div>
            )}
          </div>
          {/* 업무 첨부파일 */}
          <div className="border-t border-[rgba(var(--ink-rgb),0.06)] px-5 py-3" style={{ background: 'rgba(var(--ink-rgb),0.02)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold text-[rgba(var(--text-rgb),0.35)] uppercase tracking-wider">업무 첨부파일</span>
              <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploadingFor === 'item' ? 'bg-[rgba(var(--ink-rgb),0.04)] text-[rgba(var(--text-rgb),0.25)]' : 'bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.1)] text-[rgba(var(--text-rgb),0.5)] hover:border-[rgba(var(--ink-rgb),0.2)] hover:text-[rgba(var(--text-rgb),0.8)]'}`}>
                📎 {uploadingFor === 'item' ? '업로드 중…' : '파일 추가'}
                <input type="file" multiple className="hidden" onChange={e => handleUpload(e, 'item')} disabled={uploadingFor === 'item'} />
              </label>
              {uploadError && <span className="text-[10px] text-red-400 ml-1">{uploadError}</span>}
            </div>
            {itemAtts.length === 0 ? (
              <p className="text-[10px] text-[rgba(var(--text-rgb),0.3)]">이 업무 전체에 해당하는 파일을 첨부하세요</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {itemAtts.map(att => (
                  <div key={att.id} className="flex items-center gap-1 text-[11px] bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.1)] rounded-lg px-2.5 py-1 group/att">
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="text-[rgba(var(--text-rgb),0.65)] hover:text-[rgba(var(--text-rgb),0.9)] hover:underline transition-colors truncate max-w-[180px]">
                      📄 {att.name}
                    </a>
                    <button onClick={() => deleteAttachment(att)}
                      className="text-[rgba(var(--text-rgb),0.2)] hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        </div>

        {/* ── B: 기획 기록 + 실행 task (A와 같은 카드) ── */}
        <div className={`flex flex-col ${splitView ? 'lg:flex-1 lg:min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto scrollbar-hide' : ''}`}>
        <div className="surface-card rounded-2xl overflow-hidden flex flex-col">
          {/* 기획 기록 */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(var(--ink-rgb),0.06)]">
            <span className="text-[13px] font-semibold text-[rgba(var(--text-rgb),0.9)]">히스토리</span>
            <span className="text-[11px] text-[rgba(var(--text-rgb),0.4)]">{records.length}</span>
            <span className="flex-1" />
            <button onClick={addRecord}
              className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(var(--ink-rgb),0.1)] text-[rgba(var(--text-rgb),0.7)] hover:bg-[rgba(var(--ink-rgb),0.04)] transition-colors">＋ 히스토리 박스</button>
          </div>
          <div className="p-3 flex flex-col gap-2.5" style={{ background: 'rgba(var(--ink-rgb),0.035)' }}>
            {records.map(r => (
              <PlanRecordBox
                key={r.id}
                st={r}
                focusNoteId={focusSTId === r.id ? noteParam : null}
                prevNotes={r.currentNote ? [r.currentNote, ...r.historyNotes] : r.historyNotes}
                isOpen={openST.has(r.id)}
                autoRename={renameRecordId === r.id}
                supabase={supabase}
                onToggle={() => toggleST(r.id)}
                onRename={title => updateSTTitle(r.id, title)}
                onColor={color => updateSTColor(r.id, color)}
                onDelete={() => deleteSubTask(r.id)}
                onConvert={() => updateSTKind(r.id, 'task')}
                onBodySaved={html => setSubTasks(p => p.map(s => s.id === r.id ? { ...s, body: html, updated_at: new Date().toISOString() } : s))}
                onSaveError={() => setSaveError(SAVE_ERROR_MSG)}
              />
            ))}
            {records.length === 0 && (
              <p className="text-xs text-[rgba(var(--text-rgb),0.4)] text-center py-3">
                기획·피드백·단순메모 등을 이름 붙인 박스로 쌓아두세요
              </p>
            )}
          </div>

        </div>
        </div>
        </div>

        {/* ── 할 일 (전체 아래) — 체크 한 줄, 날짜는 홈 오늘·금주 업무와 연동 ── */}
        <AgendaTodoList
          tasks={tasks}
          members={members}
          sched={sched}
          onAdd={addTask}
          onToggleDone={st => setSTStatus(st.id, st.status === 'done' ? 'active' : 'done')}
          onDate={updateSubTaskDate}
          onAssignee={updateSTAssignee}
          onRename={updateSTTitle}
          onDelete={deleteSubTask}
          onToHistory={stId => updateSTKind(stId, 'record')}
        />
      </div>

      {/* 크게 편집 오버레이 */}
      {expandFor && (() => {
        if (expandFor === 'description') {
          return (
            <div className="fixed inset-0 z-[200] flex flex-col px-6 pb-4" style={{ background: 'var(--bg-page)' }}>
              {memoBoardId && (
                <FreeNoteCanvas
                  key={`expand_${memoBoardId}`}
                  boardId={memoBoardId}
                  embed={{
                    ...memoEmbedBase,
                    title: (
                      <div className="min-w-0 pt-4" style={{ borderLeft: `4px solid ${groupColor}`, paddingLeft: 12 }}>
                        <div className="text-[10px] text-[rgba(var(--text-rgb),0.4)] font-semibold uppercase tracking-wider mb-0.5">업무 개요 · 메모</div>
                        <div className="text-sm font-semibold text-[rgba(var(--text-rgb),0.9)] truncate">{item?.title ?? ''}</div>
                      </div>
                    ),
                    actions: (
                      <button onClick={() => setExpandFor(null)}
                        className="flex items-center gap-1.5 text-xs text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)] px-3 py-1.5 rounded-lg hover:bg-[rgba(var(--ink-rgb),0.06)] transition-colors border border-[rgba(var(--ink-rgb),0.08)] flex-shrink-0 mt-4">
                        <span>ESC</span><span> 닫기</span>
                      </button>
                    ),
                  }}
                />
              )}
            </div>
          )
        }
        return null
      })()}
    </div>

    {/* 업무 회고 서랍(완료된 안건) */}
    <AgendaRetroDrawer agendaId={retroOpen ? id : null} onClose={() => setRetroOpen(false)} />

    {/* 학습자료 슬라이드 패널 — 백드롭 */}
    {panelResource && (
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={() => setPanelResource(null)}
      />
    )}
    {/* 패널 본체 — 모바일에서 400px 고정폭이 viewport보다 넓어 좌측이 잘리는 문제 방지 */}
    <div
      className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden w-full max-w-[400px]"
      style={{
        background: 'var(--surface-primary)',
        borderLeft: '1px solid rgba(var(--ink-rgb),0.08)',
        transform: panelResource ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
        boxShadow: panelResource ? '-8px 0 32px rgba(0,0,0,0.4)' : 'none',
      }}>
      {panelResource && (
        <>
          <div className="flex items-start justify-between px-5 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.07)' }}>
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-[11px] text-[rgba(var(--text-rgb),0.35)] mb-1">📚 학습자료</p>
              <h2 className="text-[15px] font-semibold text-[rgba(var(--text-rgb),0.95)] leading-snug">{panelResource.title}</h2>
              {panelResource.source && (
                <p className="text-[11px] text-[rgba(var(--text-rgb),0.4)] mt-0.5 truncate">{panelResource.source}</p>
              )}
              {(panelResource.tags ?? []).length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(panelResource.tags ?? []).map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(76,127,224,0.15)', color: 'rgba(76,127,224,0.85)' }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setPanelResource(null)}
              className="text-[rgba(var(--text-rgb),0.35)] hover:text-[rgba(var(--text-rgb),0.7)] transition-colors text-lg leading-none flex-shrink-0 mt-0.5">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
            {panelResource.notes.map((note, i) => (
              <div key={i}>
                {note.summary && (
                  <div className="mb-3 px-3 py-2.5 rounded-lg"
                    style={{ background: 'rgba(76,127,224,0.08)', borderLeft: '3px solid rgba(76,127,224,0.5)' }}>
                    <p className="text-[12px] font-medium text-[rgba(var(--text-rgb),0.8)] leading-relaxed">{note.summary}</p>
                  </div>
                )}
                {note.content && (
                  <div
                    className="prose prose-invert prose-sm max-w-none text-[12px] text-[rgba(var(--text-rgb),0.7)] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: note.content }}
                  />
                )}
                {panelResource.notes.length > 1 && i < panelResource.notes.length - 1 && (
                  <hr className="mt-4" style={{ borderColor: 'rgba(var(--ink-rgb),0.07)' }} />
                )}
              </div>
            ))}
            {panelResource.notes.length === 0 && (
              <p className="text-[12px] text-[rgba(var(--text-rgb),0.3)]">내용 없음</p>
            )}
          </div>
          <div className="px-5 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(var(--ink-rgb),0.07)' }}>
            <a href={`/learning/${panelResource.id}`}
              className="text-[11px] text-[rgba(76,127,224,0.7)] hover:text-[rgba(76,127,224,1)] transition-colors">
              학습자료 탭에서 전체 보기 →
            </a>
          </div>
        </>
      )}
    </div>
    </>
  )
}
