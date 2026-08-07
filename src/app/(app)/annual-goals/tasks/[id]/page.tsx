'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AnnualGoalTask, AnnualGoalTaskNote, Attachment, Member, ImportanceLevel, AgreedPriority } from '@/types'
import TiptapEditor from '@/components/TiptapEditor'
import { GlassSelect } from '@/components/ui/GlassSelect'
import { DateCellPicker } from '@/components/ui/MiniDatePicker'

const STATUS_CYCLE = ['active', 'hold', 'done'] as const
type Status = typeof STATUS_CYCLE[number]
const STATUS_LABEL: Record<Status, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<Status, string> = {
  active: 'bg-blue-50 text-blue-600 border-blue-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
  done:   'bg-gray-100 text-gray-400 border-gray-200',
}
const STATUS_DOT: Record<Status, string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }
const TRACK_COLOR: Record<string, string> = { A: '#3B82F6', B: '#EF4444', C: '#9CA3AF' }
const IMPORTANCE_OPTIONS: { value: ImportanceLevel; label: string; color: string }[] = [
  { value: '상', label: '상', color: '#EF4444' },
  { value: '중', label: '중', color: '#F59E0B' },
  { value: '하', label: '하', color: '#9CA3AF' },
]
const PRIORITY_OPTIONS: { value: AgreedPriority; label: string; color: string }[] = [
  { value: '1순위', label: '1순위', color: '#3B82F6' },
  { value: '2순위', label: '2순위', color: '#8B5CF6' },
  { value: '유예',   label: '유예',   color: '#6B7280' },
]

function NoteTitleInput({ note, placeholder, onSave }: { note: AnnualGoalTaskNote; placeholder: string; onSave: (title: string) => void }) {
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
      placeholder={placeholder}
      className="text-xs font-medium bg-transparent border-b border-transparent hover:border-[rgba(255,255,255,0.2)] focus:border-[rgba(255,255,255,0.35)] focus:outline-none transition-colors cursor-text text-[rgba(226,232,240,0.8)] placeholder:text-[rgba(226,232,240,0.3)]"
      style={{ minWidth: '40px', maxWidth: '100%', fieldSizing: 'content' } as React.CSSProperties}
    />
  )
}

export default function AnnualGoalTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [task, setTask] = useState<AnnualGoalTask | null>(null)
  const [itemInfo, setItemInfo] = useState<{ title: string; color: string; category: string } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const [description, setDescription] = useState('')
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')

  const [notes, setNotes] = useState<AnnualGoalTaskNote[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [addingNote, setAddingNote] = useState(false)
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [expanded, setExpanded] = useState<'description' | 'notes' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: tData } = await supabase
      .from('annual_goal_tasks')
      .select('*, annual_goal_items(title, color, category)')
      .eq('id', id)
      .single()
    if (!tData) { setLoading(false); return }

    const { annual_goal_items, ...rest } = tData as AnnualGoalTask & { annual_goal_items: { title: string; color: string; category: string } }
    setTask(rest)
    setItemInfo(annual_goal_items)
    setDescription(rest.description ?? '')

    const { data: noteData } = await supabase
      .from('annual_goal_task_notes')
      .select('*')
      .eq('task_id', id)
      .order('created_at', { ascending: false })
    const fetchedNotes = (noteData ?? []) as AnnualGoalTaskNote[]
    setNotes(fetchedNotes)
    setSelectedNoteId(fetchedNotes[0]?.id ?? null)

    const { data: attData } = await supabase
      .from('attachments')
      .select('*')
      .eq('annual_goal_task_id', id)
      .order('created_at', { ascending: false })
    setAttachments((attData ?? []) as Attachment[])

    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('members').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setExpanded(null) }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [expanded])

  function handleDescription(value: string) {
    setDescription(value)
    if (descTimer.current) clearTimeout(descTimer.current)
    descTimer.current = setTimeout(async () => {
      await supabase.from('annual_goal_tasks').update({ description: value }).eq('id', id)
    }, 600)
  }

  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !task) { setEditingTitle(false); return }
    await supabase.from('annual_goal_tasks').update({ title: t }).eq('id', id)
    setTask(p => p ? { ...p, title: t } : p)
    setEditingTitle(false)
  }

  async function cycleStatus() {
    if (!task) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status as Status) + 1) % STATUS_CYCLE.length]
    await supabase.from('annual_goal_tasks').update({ status: next }).eq('id', id)
    setTask(p => p ? { ...p, status: next } : p)
  }

  async function updateAssignee(assigneeId: string | null) {
    await supabase.from('annual_goal_tasks').update({ assignee_id: assigneeId }).eq('id', id)
    setTask(p => p ? { ...p, assignee_id: assigneeId } : p)
  }
  async function updateMidDate(date: string | null) {
    await supabase.from('annual_goal_tasks').update({ mid_date: date }).eq('id', id)
    setTask(p => p ? { ...p, mid_date: date } : p)
  }
  async function updateDueDate(date: string | null) {
    await supabase.from('annual_goal_tasks').update({ due_date: date }).eq('id', id)
    setTask(p => p ? { ...p, due_date: date } : p)
  }
  async function updateRoadmapStart(date: string | null) {
    await supabase.from('annual_goal_tasks').update({ roadmap_start_date: date }).eq('id', id)
    setTask(p => p ? { ...p, roadmap_start_date: date } : p)
  }
  async function updateRoadmapEnd(date: string | null) {
    await supabase.from('annual_goal_tasks').update({ roadmap_end_date: date }).eq('id', id)
    setTask(p => p ? { ...p, roadmap_end_date: date } : p)
  }
  async function updateExecImportance(v: ImportanceLevel | null) {
    await supabase.from('annual_goal_tasks').update({ exec_importance: v }).eq('id', id)
    setTask(p => p ? { ...p, exec_importance: v } : p)
  }
  async function updateAgreedPriority(v: AgreedPriority | null) {
    await supabase.from('annual_goal_tasks').update({ agreed_priority: v }).eq('id', id)
    setTask(p => p ? { ...p, agreed_priority: v } : p)
  }

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

  function handleNoteChange(noteId: string, value: string) {
    setNotes(p => p.map(n => n.id === noteId ? { ...n, content: value } : n))
    clearTimeout(noteTimers.current[noteId])
    noteTimers.current[noteId] = setTimeout(async () => {
      await supabase.from('annual_goal_task_notes').update({ content: value, edited_at: new Date().toISOString() }).eq('id', noteId)
    }, 600)
  }

  async function addNoteEntry() {
    setAddingNote(true)
    const { data } = await supabase.from('annual_goal_task_notes')
      .insert({ task_id: id, title: null, content: '' })
      .select().single()
    if (data) {
      const newNote = data as AnnualGoalTaskNote
      setNotes(p => [newNote, ...p])
      setSelectedNoteId(newNote.id)
    }
    setAddingNote(false)
  }

  async function updateNoteTitle(noteId: string, title: string) {
    await supabase.from('annual_goal_task_notes').update({ title: title || null }).eq('id', noteId)
    setNotes(p => p.map(n => n.id === noteId ? { ...n, title: title || null } : n))
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `annual-goal-tasks/${id}/${Date.now()}_${safeName}`
        const { error: storageErr } = await supabase.storage.from('attachments').upload(path, file)
        if (storageErr) { setUploadError(`스토리지 오류: ${storageErr.message}`); continue }
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        const { data, error: dbErr } = await supabase.from('attachments')
          .insert({ task_id: null, annual_goal_task_id: id, name: file.name, type: '파일', url: urlData.publicUrl })
          .select().single()
        if (dbErr) { setUploadError(`DB 오류: ${dbErr.message}`); continue }
        if (data) setAttachments(prev => [data as Attachment, ...prev])
      }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function deleteAttachment(att: Attachment) {
    const path = att.url.split('/object/public/attachments/')[1]
    if (path) await supabase.storage.from('attachments').remove([path])
    await supabase.from('attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  if (!task) return <div className="flex items-center justify-center h-40 text-sm text-gray-400">세부task를 찾을 수 없습니다.</div>

  const itemColor = itemInfo?.color ?? '#3B82F6'
  const selectedNote = notes.find(n => n.id === selectedNoteId) ?? null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto px-4 md:px-6 py-6 pb-16 flex flex-col gap-6">

        {/* ── 브레드크럼 ── */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <button onClick={() => router.back()} className="hover:text-gray-700 transition-colors flex items-center gap-1">
            <span>←</span> <span>돌아가기</span>
          </button>
          {itemInfo && (<><span>·</span><span style={{ color: itemColor, fontWeight: 600 }}>{itemInfo.title}</span></>)}
          <span>·</span>
          <span className="text-gray-500 truncate max-w-[200px]">{task.title}</span>
        </div>

        {/* ── 제목 + 상태 ── */}
        <div className="flex items-start gap-3">
          <button onClick={cycleStatus} title={STATUS_LABEL[task.status as Status]}
            style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_DOT[task.status as Status], border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 8 }} />
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input autoFocus value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                onBlur={saveTitle}
                className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-400 focus:outline-none bg-transparent pb-0.5" />
            ) : (
              <h1 onClick={() => { setEditingTitle(true); setEditTitle(task.title) }}
                className="text-2xl font-bold cursor-text hover:text-[rgba(226,232,240,0.7)] transition-colors leading-tight"
                style={{ color: task.status === 'done' ? '#9CA3AF' : '#E2E8F0', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                {task.title}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button onClick={cycleStatus} className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[task.status as Status]}`}>
                {STATUS_LABEL[task.status as Status]}
              </button>
              {task.track && <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ color: TRACK_COLOR[task.track], background: `${TRACK_COLOR[task.track]}1E` }}>트랙 {task.track}</span>}
              {task.maturity_level != null && <span className="text-xs text-[rgba(226,232,240,0.5)] bg-white/[0.06] border border-white/[0.09] px-2.5 py-1 rounded-full">성숙도 {task.maturity_level}</span>}
            </div>
          </div>
        </div>

        {/* ── 엑셀 원본 참고 카드 (읽기전용) ── */}
        {(task.maturity_rationale || task.hr_importance || task.hr_urgency || task.suggested_period || task.hrm_function || task.notes) && (
          <div className="surface-card rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
              <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">HR 전략 프레임 원본 참고</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
              {task.hr_importance && <div><span className="text-[rgba(226,232,240,0.35)]">HR 중요도</span> <span className="text-[rgba(226,232,240,0.8)] font-medium ml-1">{task.hr_importance}</span></div>}
              {task.hr_urgency && <div><span className="text-[rgba(226,232,240,0.35)]">HR 시급도</span> <span className="text-[rgba(226,232,240,0.8)] font-medium ml-1">{task.hr_urgency}</span></div>}
              {task.suggested_period && <div><span className="text-[rgba(226,232,240,0.35)]">실행 제안 구간</span> <span className="text-[rgba(226,232,240,0.8)] font-medium ml-1">{task.suggested_period}</span></div>}
              {task.hrm_function && <div><span className="text-[rgba(226,232,240,0.35)]">HRM 기능</span> <span className="text-[rgba(226,232,240,0.8)] font-medium ml-1">{task.hrm_function}</span></div>}
              {task.maturity_rationale && <div className="col-span-2"><span className="text-[rgba(226,232,240,0.35)]">성숙도 판단 근거</span> <span className="text-[rgba(226,232,240,0.7)] ml-1">{task.maturity_rationale}</span></div>}
              {task.notes && <div className="col-span-2"><span className="text-[rgba(226,232,240,0.35)]">비고</span> <span className="text-[rgba(226,232,240,0.7)] ml-1">{task.notes}</span></div>}
            </div>
          </div>
        )}

        {/* ── 우선순위 편집 ── */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">우선순위</span>
          </div>
          <div className="px-5 py-4 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[rgba(226,232,240,0.5)]">경영진 중요도</span>
              <GlassSelect value={task.exec_importance ?? ''} onChange={v => updateExecImportance((v || null) as ImportanceLevel | null)} options={IMPORTANCE_OPTIONS} placeholder="미정" variant="pill" activeWhenFilled />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[rgba(226,232,240,0.5)]">합의 우선순위</span>
              <GlassSelect value={task.agreed_priority ?? ''} onChange={v => updateAgreedPriority((v || null) as AgreedPriority | null)} options={PRIORITY_OPTIONS} placeholder="미정" variant="pill" activeWhenFilled />
            </div>
          </div>
        </div>

        {/* ── 담당자 / 일정 ── */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">담당자 · 일정</span>
          </div>
          <div className="px-5 py-4 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[rgba(226,232,240,0.5)]">담당자</span>
              <GlassSelect value={task.assignee_id ?? ''} onChange={v => updateAssignee(v || null)} options={members.map(m => ({ value: m.id, label: m.name }))} placeholder="-" variant="pill" activeWhenFilled />
            </div>
            {task.assignee_id && (
              <>
                <DateCellPicker label="중간보고" value={task.mid_date ?? null} color="#93C5FD" onChange={updateMidDate} />
                <DateCellPicker label="완료일자" value={task.due_date ?? null} color="#86EFAC" onChange={updateDueDate} />
              </>
            )}
          </div>
          <div className="px-5 pb-4 flex items-center gap-6 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
            <span className="text-xs text-[rgba(226,232,240,0.5)]">로드맵 기간</span>
            <DateCellPicker label="시작" value={task.roadmap_start_date ?? null} color={itemColor} onChange={updateRoadmapStart} />
            <DateCellPicker label="종료" value={task.roadmap_end_date ?? null} color={itemColor} onChange={updateRoadmapEnd} />
          </div>
        </div>

        {/* ── 설명 ── */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">설명 · 메모</span>
            <button onClick={() => setExpanded('description')} className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.65)] px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors">크게 편집</button>
          </div>
          <TiptapEditor dark value={description} onChange={handleDescription} minHeight={120} className="px-5 py-4" />
        </div>

        {/* ── 날짜별 노트 ── */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">진행 기록</span>
            <button onClick={() => setExpanded('notes')} className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.65)] px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors">크게 편집</button>
          </div>
          <div style={{ display: 'flex', minHeight: 160 }}>
            <div style={{ width: 80, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column' }}>
              <button onClick={addNoteEntry} disabled={addingNote}
                style={{ padding: '7px 8px', fontSize: 10, color: '#5DBD97', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', textAlign: 'center', fontWeight: 600, flexShrink: 0, opacity: addingNote ? 0.4 : 1 }}>
                {addingNote ? '…' : '+ 추가'}
              </button>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {notes.map(note => {
                  const isSelected = note.id === selectedNoteId
                  return (
                    <button key={note.id} onClick={() => setSelectedNoteId(note.id)}
                      style={{ width: '100%', padding: '7px 8px', fontSize: 11, textAlign: 'center', background: isSelected ? `${itemColor}22` : 'transparent', color: isSelected ? itemColor : 'rgba(226,232,240,0.45)', fontWeight: isSelected ? 700 : 400, cursor: 'pointer', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'block', lineHeight: 1.3 }}>
                      {formatNoteDate(note.created_at)}
                    </button>
                  )
                })}
                {notes.length === 0 && <div style={{ padding: '16px 8px', fontSize: 10, color: '#CBD5E1', textAlign: 'center' }}>기록 없음</div>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {selectedNote ? (
                <>
                  <div className="flex items-center justify-between px-4 pt-2 pb-0.5 gap-2 flex-shrink-0">
                    <NoteTitleInput note={selectedNote} placeholder={`${formatNoteDate(selectedNote.created_at)} 기록`} onSave={title => updateNoteTitle(selectedNote.id, title)} />
                  </div>
                  <TiptapEditor dark key={selectedNote.id} value={selectedNote.content} onChange={v => handleNoteChange(selectedNote.id, v)} minHeight={100} className="px-4 py-1" />
                </>
              ) : (
                <div style={{ padding: 24, color: '#8FA0B5', fontSize: 12, textAlign: 'center' }}>+ 추가를 눌러 첫 기록을 남기세요</div>
              )}
            </div>
          </div>
        </div>

        {/* ── 첨부파일 ── */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">첨부파일</span>
            <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploading ? 'bg-[rgba(255,255,255,0.04)] text-[rgba(226,232,240,0.25)]' : 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-[rgba(226,232,240,0.5)] hover:border-[rgba(255,255,255,0.2)] hover:text-[rgba(226,232,240,0.8)]'}`}>
              📎 {uploading ? '업로드 중…' : '파일 추가'}
              <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {uploadError && <span className="text-[10px] text-red-400 ml-1">{uploadError}</span>}
          </div>
          <div className="px-5 py-4">
            {attachments.length === 0 ? (
              <p className="text-[10px] text-[rgba(226,232,240,0.3)]">이 세부task에 해당하는 파일을 첨부하세요</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-1 text-[11px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-lg px-2.5 py-1 group/att">
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-[rgba(226,232,240,0.65)] hover:text-[rgba(226,232,240,0.9)] hover:underline transition-colors truncate max-w-[180px]">📄 {att.name}</a>
                    <button onClick={() => deleteAttachment(att)} className="text-[rgba(226,232,240,0.2)] hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 크게 편집 오버레이 */}
      {expanded && (() => {
        if (expanded === 'description') {
          return (
            <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0F1319' }}>
              <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: `4px solid ${itemColor}` }}>
                <div>
                  <div className="text-[10px] text-[rgba(226,232,240,0.4)] font-semibold uppercase tracking-wider mb-0.5">설명 · 메모</div>
                  <div className="text-sm font-semibold text-[rgba(226,232,240,0.9)]">{task.title}</div>
                </div>
                <button onClick={() => setExpanded(null)} className="flex items-center gap-1.5 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors border border-[rgba(255,255,255,0.08)]">
                  <span>ESC</span><span> 닫기</span>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <TiptapEditor dark value={description} onChange={handleDescription} autoFocus minHeight={300} className="px-8 py-4" />
              </div>
            </div>
          )
        }
        return (
          <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0F1319' }}>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: `4px solid ${itemColor}` }}>
              <div>
                <div className="text-[10px] text-[rgba(226,232,240,0.4)] font-semibold uppercase tracking-wider mb-0.5">진행 기록</div>
                <div className="text-sm font-semibold text-[rgba(226,232,240,0.9)]">{task.title}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={addNoteEntry} disabled={addingNote}
                  className="text-xs text-[#5DBD97] hover:text-[#4aab84] disabled:text-[rgba(226,232,240,0.25)] disabled:cursor-not-allowed border border-[#5DBD97]/30 disabled:border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1.5 transition-colors">
                  {addingNote ? '추가 중…' : '+ 새 기록'}
                </button>
                <button onClick={() => setExpanded(null)} className="flex items-center gap-1.5 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors border border-[rgba(255,255,255,0.08)]">
                  <span>ESC</span><span> 닫기</span>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex">
              <div style={{ width: 100, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {notes.map(note => {
                  const isSelected = note.id === selectedNoteId
                  return (
                    <button key={note.id} onClick={() => setSelectedNoteId(note.id)}
                      style={{ padding: '10px 12px', fontSize: 12, textAlign: 'center', background: isSelected ? `${itemColor}22` : 'transparent', color: isSelected ? itemColor : 'rgba(226,232,240,0.4)', fontWeight: isSelected ? 700 : 400, cursor: 'pointer', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'block', width: '100%', lineHeight: 1.3 }}>
                      {formatNoteDate(note.created_at)}
                    </button>
                  )
                })}
              </div>
              <div className="flex-1 min-w-0 overflow-auto">
                {selectedNote ? (
                  <>
                    <div className="px-8 pt-4 pb-0 flex items-center gap-2">
                      <NoteTitleInput note={selectedNote} placeholder={`${formatNoteDate(selectedNote.created_at)} 기록`} onSave={title => updateNoteTitle(selectedNote.id, title)} />
                    </div>
                    <TiptapEditor dark key={selectedNote.id} value={selectedNote.content} onChange={v => handleNoteChange(selectedNote.id, v)} autoFocus minHeight={300} className="px-8 py-4" />
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-[rgba(226,232,240,0.3)]">+ 새 기록을 추가하세요</div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
