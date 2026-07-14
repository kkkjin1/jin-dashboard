'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaItem, AgendaSubTask, Attachment } from '@/types'
import TiptapEditor from '@/components/TiptapEditor'

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

function NoteTitleInput({
  note, placeholder, onSave,
}: {
  note: SubTaskNote
  placeholder: string
  onSave: (title: string) => void
}) {
  const [val, setVal] = useState(note.title ?? '')
  useEffect(() => { setVal(note.title ?? '') }, [note.title])
  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
        if (e.key === 'Escape') { setVal(note.title ?? ''); e.currentTarget.blur() }
      }}
      onBlur={() => { const t = val.trim(); if (t !== (note.title ?? '')) onSave(t) }}
      onClick={e => e.stopPropagation()}
      onFocus={e => e.stopPropagation()}
      placeholder={placeholder}
      className="text-xs font-medium bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none transition-colors cursor-text text-gray-600 placeholder:text-gray-400"
      style={{ minWidth: '40px', maxWidth: '100%', fieldSizing: 'content' } as React.CSSProperties}
    />
  )
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
  const [loading,   setLoading]   = useState(true)

  // 설명 박스
  const [description, setDescription] = useState('')
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 제목 편집
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle,    setEditTitle]    = useState('')

  // 아코디언 열림 상태
  const [openST, setOpenST] = useState<Set<string>>(new Set())

  // 하위태스크 제목 인라인 편집
  const [editingSTId,  setEditingSTId]  = useState<string | null>(null)
  const [editingSTVal, setEditingSTVal] = useState('')
  const accordionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 하위태스크 추가
  const [addingSubTask, setAddingSubTask] = useState(false)
  const [newSTTitle,    setNewSTTitle]    = useState('')
  const [deletingST,    setDeletingST]    = useState<string | null>(null)
  const [expandFor,     setExpandFor]     = useState<string | null>(null)

  // 첨부파일
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingFor, setUploadingFor] = useState<string | null>(null) // 'item' | stId
  const [uploadError,  setUploadError]  = useState<string>('')

  // 노트 저장 타이머
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── 날짜 헬퍼 ──────────────────────────────────────────────────
  const sched = (() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const d = new Date(), tom = new Date(d), fri = new Date(d)
    tom.setDate(d.getDate() + 1)
    fri.setDate(d.getDate() + (5 - d.getDay() + 7) % 7)
    return { today: fmt(d), tomorrow: fmt(tom), friday: fmt(fri) }
  })()
  function stDateLabel(date: string) {
    if (date === sched.today) return '오늘'
    if (date === sched.tomorrow) return '내일'
    const d = new Date(date + 'T00:00:00')
    return `${d.getMonth()+1}/${d.getDate()}`
  }

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

  // focus 파라미터 처리 — 해당 아코디언 열고 스크롤
  useEffect(() => {
    if (!focusSTId || subTasks.length === 0) return
    setOpenST(prev => { const s = new Set(prev); s.add(focusSTId); return s })
    setTimeout(() => {
      const el = accordionRefs.current[focusSTId]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [focusSTId, subTasks.length])

  // 기록 토글 상태 (stId → Set<noteId>)
  const [openHistoryNotes, setOpenHistoryNotes] = useState<Record<string, Set<string>>>({})
  const [addingNoteFor, setAddingNoteFor] = useState<string | null>(null)

  // 크게 편집 ESC 닫기
  useEffect(() => {
    if (!expandFor) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setExpandFor(null) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [expandFor])

  // ── description 자동 저장 ────────────────────────────────────────
  function handleDescription(value: string) {
    setDescription(value)
    if (descTimer.current) clearTimeout(descTimer.current)
    descTimer.current = setTimeout(async () => {
      await supabase.from('agenda_items').update({ description: value }).eq('id', id)
    }, 600)
  }

  // ── 제목 저장 ─────────────────────────────────────────────────────
  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !item) { setEditingTitle(false); return }
    await supabase.from('agenda_items').update({ title: t }).eq('id', id)
    setItem(p => p ? { ...p, title: t } : p)
    setEditingTitle(false)
  }

  // ── 상태 순환 ────────────────────────────────────────────────────
  async function cycleStatus() {
    if (!item) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status as Status) + 1) % STATUS_CYCLE.length]
    await supabase.from('agenda_items').update({ status: next }).eq('id', id)
    setItem(p => p ? { ...p, status: next } : p)
  }

  async function cycleSTStatus(st: SubTaskWithNote) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(st.status as Status) + 1) % STATUS_CYCLE.length]
    await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', st.id)
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, status: next } : s))
  }

  // ── 아코디언 토글 ────────────────────────────────────────────────
  function toggleST(stId: string) {
    setOpenST(prev => {
      const s = new Set(prev)
      s.has(stId) ? s.delete(stId) : s.add(stId)
      return s
    })
  }

  function saveSTTitle() {
    if (!editingSTId) return
    const t = editingSTVal.trim()
    if (t) updateSTTitle(editingSTId, t)
    setEditingSTId(null)
  }

  // ── 날짜 포맷 ──────────────────────────────────────────────────
  function formatNoteDate(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (noteDay.getTime() === today.getTime()) return '오늘'
    if (noteDay.getTime() === yesterday.getTime()) return '어제'
    return `${d.getMonth()+1}/${d.getDate()}`
  }

  function hasNoteContent(html: string) {
    return html.replace(/<[^>]*>/g, '').trim().length > 0
  }

  // ── 현재 노트 저장 ──────────────────────────────────────────────
  function handleCurrentNote(st: SubTaskWithNote, value: string) {
    setSubTasks(p => p.map(s => s.id === st.id
      ? { ...s, currentNote: s.currentNote ? { ...s.currentNote, content: value } : { id: '_new', content: value, created_at: new Date().toISOString() } }
      : s
    ))
    const timerKey = st.currentNote?.id ?? `new_${st.id}`
    clearTimeout(noteTimers.current[timerKey])
    noteTimers.current[timerKey] = setTimeout(async () => {
      if (st.currentNote && st.currentNote.id !== '_new') {
        await supabase.from('sub_task_notes').update({ content: value, edited_at: new Date().toISOString() }).eq('id', st.currentNote.id)
      } else {
        const { data } = await supabase.from('sub_task_notes').insert({ sub_task_id: st.id, title: null, content: value }).select('id, content, created_at, edited_at').single()
        if (data) {
          setSubTasks(p => p.map(s => s.id === st.id ? { ...s, currentNote: data as SubTaskNote } : s))
        }
      }
    }, 600)
  }

  // ── 새 기록 추가 ────────────────────────────────────────────────
  async function addNoteEntry(st: SubTaskWithNote) {
    setAddingNoteFor(st.id)
    const { data } = await supabase.from('sub_task_notes')
      .insert({ sub_task_id: st.id, title: null, content: '' })
      .select('id, content, created_at, edited_at').single()
    if (data) {
      const newNote = data as SubTaskNote
      setSubTasks(p => p.map(s => {
        if (s.id !== st.id) return s
        return {
          ...s,
          currentNote: newNote,
          historyNotes: s.currentNote ? [s.currentNote, ...s.historyNotes] : s.historyNotes,
        }
      }))
    }
    setAddingNoteFor(null)
  }

  // ── 기록 제목 저장 ──────────────────────────────────────────────
  async function updateNoteTitle(noteId: string, stId: string, title: string) {
    await supabase.from('sub_task_notes').update({ title: title || null }).eq('id', noteId)
    setSubTasks(p => p.map(s => {
      if (s.id !== stId) return s
      return {
        ...s,
        currentNote: s.currentNote?.id === noteId ? { ...s.currentNote, title: title || null } : s.currentNote,
        historyNotes: s.historyNotes.map(n => n.id === noteId ? { ...n, title: title || null } : n),
      }
    }))
  }

  // ── 과거 기록 토글 ──────────────────────────────────────────────
  function toggleHistoryNote(stId: string, noteId: string) {
    setOpenHistoryNotes(p => {
      const cur = new Set(p[stId] ?? [])
      cur.has(noteId) ? cur.delete(noteId) : cur.add(noteId)
      return { ...p, [stId]: cur }
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
    const path = att.url.split('/object/public/attachments/')[1]
    if (path) await supabase.storage.from('attachments').remove([path])
    await supabase.from('attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  // 분류 헬퍼
  const itemAtts  = attachments.filter(a => a.agenda_item_id === id && !a.sub_task_id)
  const stAtts    = (stId: string) => attachments.filter(a => a.sub_task_id === stId)

  // ── 하위태스크 추가 ──────────────────────────────────────────────
  async function addSubTask() {
    const title = newSTTitle.trim()
    if (!title) { setAddingSubTask(false); return }
    const { data } = await supabase.from('agenda_sub_tasks')
      .insert({ agenda_item_id: id, title, status: 'active', sort_order: subTasks.length })
      .select().single()
    if (data) {
      const newST: SubTaskWithNote = { ...(data as AgendaSubTask), currentNote: null, historyNotes: [] }
      setSubTasks(p => [...p, newST])
      setOpenST(prev => { const s = new Set(prev); s.add(newST.id); return s })
    }
    setNewSTTitle(''); setAddingSubTask(false)
  }

  // ── 하위태스크 제목 수정 ─────────────────────────────────────────
  async function updateSTTitle(stId: string, title: string) {
    await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s))
  }

  // ── 하위태스크 삭제 ──────────────────────────────────────────────
  async function deleteSubTask(stId: string) {
    await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSubTasks(p => p.filter(s => s.id !== stId))
    setDeletingST(null)
  }

  async function updateSubTaskDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('agenda_sub_tasks') as any).update({ target_date: date }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, target_date: date ?? undefined } : s))
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  if (!item)   return <div className="flex items-center justify-center h-40 text-sm text-gray-400">안건을 찾을 수 없습니다.</div>

  const groupColor = group?.color ?? '#3B82F6'
  const doneCount  = subTasks.filter(s => s.status === 'done').length
  const expandST = (expandFor && expandFor !== 'description')
    ? (subTasks.find(s => s.id === expandFor) ?? null) : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto px-4 md:px-6 py-6 pb-16 flex flex-col gap-6">

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
        </div>

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
                className="text-2xl font-bold cursor-text hover:text-gray-700 transition-colors leading-tight"
                style={{ color: item.status === 'done' ? '#9CA3AF' : '#1A2233', textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                {item.title}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button onClick={cycleStatus}
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[item.status as Status]}`}>
                {STATUS_LABEL[item.status as Status]}
              </button>
              {subTasks.length > 0 && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  하위태스크 {doneCount}/{subTasks.length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 전반적인 메모 박스 ── */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white/70">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">업무 개요 · 메모</span>
            <button onClick={() => setExpandFor('description')}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 transition-colors">
              크게 편집
            </button>
          </div>
          <TiptapEditor
            value={description}
            onChange={handleDescription}
            minHeight={140}
            className="px-5 py-4"
          />
          {/* 업무 첨부파일 */}
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">업무 첨부파일</span>
              <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploadingFor === 'item' ? 'bg-gray-100 text-gray-300' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}>
                📎 {uploadingFor === 'item' ? '업로드 중…' : '파일 추가'}
                <input type="file" multiple className="hidden" onChange={e => handleUpload(e, 'item')} disabled={uploadingFor === 'item'} />
              </label>
              {uploadError && <span className="text-[10px] text-red-500 ml-1">{uploadError}</span>}
            </div>
            {itemAtts.length === 0 ? (
              <p className="text-[10px] text-gray-300">이 업무 전체에 해당하는 파일을 첨부하세요</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {itemAtts.map(att => (
                  <div key={att.id} className="flex items-center gap-1 text-[11px] bg-white border border-gray-200 rounded-lg px-2.5 py-1 group/att">
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="text-gray-600 hover:text-gray-900 hover:underline transition-colors truncate max-w-[180px]">
                      📄 {att.name}
                    </a>
                    <button onClick={() => deleteAttachment(att)}
                      className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 하위태스크 아코디언 ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">하위 태스크 · 아카이빙</span>
            <span className="text-[10px] text-gray-400">토글 이름 = 프로젝트탭 하위태스크와 연동</span>
          </div>

          {subTasks.map(st => {
            const isOpen  = openST.has(st.id)
            const stColor = st.status === 'done' ? '#9CA3AF' : (st.status === 'hold' ? '#F59E0B' : groupColor)
            const isFocus = focusSTId === st.id
            return (
              <div key={st.id}
                ref={el => { accordionRefs.current[st.id] = el }}
                className="rounded-xl border overflow-hidden transition-all"
                style={{ borderColor: isFocus && isOpen ? stColor : '#E5E9F0', boxShadow: isFocus && isOpen ? `0 0 0 2px ${stColor}30` : 'none' }}>
                {/* 아코디언 헤더 — 외부 div onClick으로 토글, 내부 인터랙티브 요소는 stopPropagation */}
                <div
                  onClick={() => toggleST(st.id)}
                  className="flex items-center gap-2.5 px-4 py-4 select-none group/acc hover:bg-gray-50/70 transition-colors cursor-pointer"
                  style={{ background: isOpen ? `${stColor}08` : 'white' }}>
                  {/* ▶ 비주얼 (클릭은 외부 div가 처리) */}
                  <span className="flex-shrink-0 p-1 -m-1" style={{ fontSize: 8, lineHeight: 1 }}>
                    <span style={{ display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: '#8FA0B5' }}>▶</span>
                  </span>
                  {/* 상태 점 */}
                  <button type="button"
                    onClick={e => { e.stopPropagation(); cycleSTStatus(st) }}
                    title={STATUS_LABEL[st.status as Status]}
                    style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: stColor, border: 'none', cursor: 'pointer', padding: 0 }} />
                  {/* 타이틀: 편집 중이면 input, 아니면 텍스트 */}
                  {editingSTId === st.id ? (
                    <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editingSTVal}
                        onChange={e => setEditingSTVal(e.target.value)}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveSTTitle()
                          if (e.key === 'Escape') setEditingSTId(null)
                        }}
                        onBlur={saveSTTitle}
                        className="text-sm font-semibold bg-transparent border-b-2 border-blue-400 focus:outline-none w-full"
                        style={{ color: st.status === 'done' ? '#9CA3AF' : '#1A2233', textDecoration: st.status === 'done' ? 'line-through' : 'none' }}
                      />
                    </div>
                  ) : (
                    <span className="flex-1 min-w-0 text-sm font-semibold truncate"
                      style={{ color: st.status === 'done' ? '#9CA3AF' : '#1A2233', textDecoration: st.status === 'done' ? 'line-through' : 'none' }}>
                      {st.title}
                    </span>
                  )}
                  {/* ✏ 제목 수정 */}
                  {editingSTId !== st.id && (
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setEditingSTId(st.id); setEditingSTVal(st.title) }}
                      className="opacity-0 group-hover/acc:opacity-60 hover:!opacity-100 transition-opacity text-gray-400 hover:text-gray-700 text-[10px] px-0.5 flex-shrink-0"
                      title="이름 수정">✏</button>
                  )}
                  {/* 날짜 뱃지 */}
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {st.target_date ? (
                      <button
                        onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, null) }}
                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold border-none cursor-pointer flex-shrink-0"
                        style={{
                          background: st.target_date === sched.today ? '#FEE2E2' : st.target_date === sched.tomorrow ? '#FEF3C7' : '#EFF6FF',
                          color:      st.target_date === sched.today ? '#DC2626' : st.target_date === sched.tomorrow ? '#92400E' : '#1D4ED8',
                        }}>
                        {stDateLabel(st.target_date)} ×
                      </button>
                    ) : (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/acc:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, sched.today) }}    className="text-[9px] px-1.5 py-0.5 rounded bg-red-50   text-red-600   hover:bg-red-100   border border-red-100   font-medium">오늘</button>
                        <button onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, sched.tomorrow) }} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 font-medium">내일</button>
                        <button onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, sched.friday) }}   className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50  text-blue-600  hover:bg-blue-100  border border-blue-100  font-medium">금주</button>
                        <label className="cursor-pointer text-gray-400 hover:text-gray-600 text-[10px] px-0.5" title="특정일 선택">
                          📅<input type="date" className="sr-only" onChange={e => { e.stopPropagation(); if (e.target.value) updateSubTaskDate(st.id, e.target.value) }} />
                        </label>
                      </div>
                    )}
                  </div>
                  {/* 삭제 */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover/acc:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    {deletingST === st.id ? (
                      <>
                        <button onClick={e => { e.stopPropagation(); deleteSubTask(st.id) }} className="text-[10px] text-red-500 font-semibold px-1">삭제</button>
                        <button onClick={e => { e.stopPropagation(); setDeletingST(null) }} className="text-[10px] text-gray-400 px-1">취소</button>
                      </>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setDeletingST(st.id) }} className="text-[10px] text-gray-300 hover:text-red-400 transition-colors px-1">삭제</button>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ml-1 ${STATUS_CLS[st.status as Status]}`}>
                    {STATUS_LABEL[st.status as Status]}
                  </span>
                </div>

                {/* 아코디언 본문 */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #E5E9F0', background: '#FAFBFD' }}>
                    {/* ── 툴바: 현재 기록 제목 편집 + 액션 버튼 ── */}
                    <div className="flex items-center justify-between px-5 pt-2.5 pb-0.5 gap-2">
                      <div className="flex-1 min-w-0">
                        {st.currentNote ? (
                          <NoteTitleInput
                            note={st.currentNote}
                            placeholder={`${formatNoteDate(st.currentNote.created_at)} 기록${st.historyNotes.length > 0 ? ` · 총 ${st.historyNotes.length + 1}개` : ''}`}
                            onSave={title => updateNoteTitle(st.currentNote!.id, st.id, title)}
                          />
                        ) : (
                          <span className="text-[10px] text-gray-300">기록 없음</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); addNoteEntry(st) }}
                          disabled={addingNoteFor === st.id || !hasNoteContent(st.currentNote?.content ?? '')}
                          className="text-[10px] text-[#5DBD97] hover:text-[#4aab84] disabled:text-gray-300 disabled:cursor-not-allowed transition-colors border border-[#5DBD97]/30 disabled:border-gray-200 rounded px-2 py-0.5">
                          {addingNoteFor === st.id ? '추가 중…' : '+ 새 기록'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); setExpandFor(st.id) }}
                          className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 transition-colors">
                          크게 편집
                        </button>
                      </div>
                    </div>
                    <TiptapEditor
                      value={st.currentNote?.content ?? ''}
                      onChange={v => handleCurrentNote(st, v)}
                      minHeight={100}
                      autoFocus={isFocus && focusSTId === st.id}
                      className="px-5 py-2"
                    />

                    {/* ── 과거 기록 타임라인 ── */}
                    {st.historyNotes.length > 0 && (
                      <div className="border-t border-gray-100/80">
                        <div className="px-5 py-1.5 flex items-center gap-1">
                          <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">이전 기록</span>
                          <span className="text-[9px] text-gray-300">· {st.historyNotes.length}개</span>
                        </div>
                        {st.historyNotes.map(note => {
                          const isNoteOpen = openHistoryNotes[st.id]?.has(note.id) ?? false
                          return (
                            <div key={note.id} className="border-t border-gray-100/60">
                              <div
                                onClick={() => toggleHistoryNote(st.id, note.id)}
                                className="flex items-center gap-2 px-5 py-2 hover:bg-gray-50/80 transition-colors cursor-pointer">
                                <span className="flex-shrink-0 p-0.5">
                                  <span style={{ fontSize: 8, color: '#94A3B8', display: 'inline-block', transition: 'transform .12s', transform: isNoteOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                                </span>
                                <NoteTitleInput
                                  note={note}
                                  placeholder={`${formatNoteDate(note.created_at)} 기록`}
                                  onSave={title => updateNoteTitle(note.id, st.id, title)}
                                />
                              </div>
                              {isNoteOpen && (
                                <div className="border-t border-gray-100/40 bg-white/60">
                                  <TiptapEditor
                                    value={note.content}
                                    onChange={() => {}}
                                    minHeight={60}
                                    className="px-5 py-2"
                                  />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* 서브태스크 첨부파일 */}
                    <div className="border-t border-gray-100/80 px-5 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: stColor }}>
                          📎 {st.title} · 첨부파일
                        </span>
                        <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploadingFor === st.id ? 'text-gray-300' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}>
                          {uploadingFor === st.id ? '업로드 중…' : '파일 추가'}
                          <input type="file" multiple className="hidden" onChange={e => handleUpload(e, st.id)} disabled={uploadingFor === st.id} />
                        </label>
                      </div>
                      {stAtts(st.id).length === 0 ? (
                        <p className="text-[10px] text-gray-300">이 하위 태스크에만 연결된 파일을 첨부하세요</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {stAtts(st.id).map(att => (
                            <div key={att.id} className="flex items-center gap-1 text-[11px] bg-white border rounded-lg px-2.5 py-1 group/att"
                              style={{ borderColor: `${stColor}40` }}>
                              <a href={att.url} target="_blank" rel="noopener noreferrer"
                                className="hover:underline transition-colors truncate max-w-[180px]"
                                style={{ color: stColor }}>
                                📄 {att.name}
                              </a>
                              <button onClick={() => deleteAttachment(att)}
                                className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* 하위태스크 추가 */}
          <div className="rounded-xl border border-dashed border-gray-200 overflow-hidden">
            {addingSubTask ? (
              <div className="flex items-center gap-2 px-4 py-3">
                <input autoFocus value={newSTTitle}
                  onChange={e => setNewSTTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(); if (e.key === 'Escape') { setAddingSubTask(false); setNewSTTitle('') } }}
                  placeholder="하위 태스크 이름 입력 후 Enter (프로젝트탭과 자동 연동)"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                <button onClick={addSubTask} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                <button onClick={() => { setAddingSubTask(false); setNewSTTitle('') }} className="text-xs text-gray-400 px-2">취소</button>
              </div>
            ) : (
              <button onClick={() => setAddingSubTask(true)}
                className="w-full flex items-center gap-1.5 px-4 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                <span style={{ fontSize: 13 }}>＋</span>
                <span>하위 태스크 추가 (프로젝트탭과 쌍방 연동)</span>
              </button>
            )}
          </div>

          {subTasks.length === 0 && !addingSubTask && (
            <p className="text-xs text-gray-400 text-center py-2">
              하위 태스크를 추가하면 프로젝트 목록에서도 동일하게 표시됩니다.
            </p>
          )}
        </div>
      </div>

      {/* 크게 편집 오버레이 */}
      {expandFor && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0"
            style={{ borderLeft: `4px solid ${groupColor}` }}>
            <div>
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                {expandFor === 'description' ? '업무 개요 · 메모' : '세부task · 노트'}
              </div>
              <div className="text-sm font-semibold text-gray-800">
                {expandFor === 'description' ? (item?.title ?? '') : (expandST?.title ?? '세부task 노트')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {expandST && (
                <button
                  onClick={() => addNoteEntry(expandST)}
                  disabled={addingNoteFor === expandST.id || !hasNoteContent(expandST.currentNote?.content ?? '')}
                  className="text-xs text-[#5DBD97] hover:text-[#4aab84] disabled:text-gray-300 disabled:cursor-not-allowed border border-[#5DBD97]/30 disabled:border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
                  {addingNoteFor === expandST.id ? '추가 중…' : '+ 새 기록'}
                </button>
              )}
              <button onClick={() => setExpandFor(null)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200">
                <span>ESC</span><span> 닫기</span>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {/* 현재 기록 날짜 */}
            {expandST?.currentNote && (
              <div className="px-8 pt-4 pb-0">
                <span className="text-xs text-gray-400 font-medium">
                  {formatNoteDate(expandST.currentNote.created_at)} 기록
                  {expandST.historyNotes.length > 0 && <span className="ml-2 text-gray-300">· 총 {expandST.historyNotes.length + 1}개</span>}
                </span>
              </div>
            )}
            <TiptapEditor
              value={expandFor === 'description' ? description : (expandST?.currentNote?.content ?? '')}
              onChange={v => {
                if (expandFor === 'description') handleDescription(v)
                else if (expandST) handleCurrentNote(expandST, v)
              }}
              autoFocus
              minHeight={300}
              className="px-8 py-4"
            />
            {/* 이전 기록 타임라인 (세부task만) */}
            {expandST && expandST.historyNotes.length > 0 && (
              <div className="border-t border-gray-100 mx-8 mb-8">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-3">이전 기록 · {expandST.historyNotes.length}개</p>
                {expandST.historyNotes.map(note => {
                  const isNoteOpen = openHistoryNotes[expandST.id]?.has(note.id) ?? false
                  return (
                    <div key={note.id} className="border-t border-gray-100">
                      <div className="flex items-center gap-2 py-2 hover:bg-gray-50 transition-colors rounded">
                        <button
                          onClick={() => toggleHistoryNote(expandST.id, note.id)}
                          className="flex-shrink-0 p-1">
                          <span style={{ fontSize: 8, color: '#94A3B8', display: 'inline-block', transition: 'transform .12s', transform: isNoteOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        </button>
                        <NoteTitleInput
                          note={note}
                          placeholder={`${formatNoteDate(note.created_at)} 기록`}
                          onSave={title => updateNoteTitle(note.id, expandST.id, title)}
                        />
                      </div>
                      {isNoteOpen && (
                        <div className="border-t border-gray-100 bg-gray-50/50 rounded-lg mb-2">
                          <TiptapEditor
                            value={note.content}
                            onChange={() => {}}
                            minHeight={80}
                            className="px-4 py-3"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
