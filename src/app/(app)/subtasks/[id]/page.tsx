'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaSubTask, Attachment, Member, AgendaItemStatus } from '@/types'
import dynamic from 'next/dynamic'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

interface SubTaskNote {
  id: string
  content: string
  created_at: string
  edited_at?: string | null
  title?: string | null
}

type FullSubTask = AgendaSubTask & {
  agenda_items?: { id: string; title: string; agenda_groups?: { name: string; color: string } | null } | null
}

const STATUS_CYCLE: AgendaItemStatus[] = ['active', 'hold', 'done']
const STATUS_LABEL: Record<AgendaItemStatus, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<AgendaItemStatus, string> = {
  active: 'bg-blue-50 text-blue-600 border-blue-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
  done:   'bg-gray-100 text-gray-400 border-gray-200',
}
const STATUS_DOT: Record<AgendaItemStatus, string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 right-20 bg-[#5DBD97] text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
      ✓ {message}
    </div>
  )
}

function NoteTitleInput({ note, placeholder, onSave }: {
  note: SubTaskNote; placeholder: string; onSave: (title: string) => void
}) {
  const [val, setVal] = useState(note.title ?? '')
  useEffect(() => { setVal(note.title ?? '') }, [note.title])
  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
        if (e.key === 'Escape') { setVal(note.title ?? ''); e.currentTarget.blur() }
      }}
      onBlur={() => { const t = val.trim(); if (t !== (note.title ?? '')) onSave(t) }}
      placeholder={placeholder}
      className="text-xs font-medium bg-transparent border-b border-transparent hover:border-[rgba(255,255,255,0.2)] focus:border-[rgba(255,255,255,0.35)] focus:outline-none transition-colors cursor-text text-[rgba(226,232,240,0.8)] placeholder:text-[rgba(226,232,240,0.3)]"
      style={{ minWidth: '40px', maxWidth: '240px', fieldSizing: 'content' } as React.CSSProperties}
    />
  )
}

export default function SubTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [subTask, setSubTask] = useState<FullSubTask | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [notes, setNotes] = useState<SubTaskNote[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [addingNote, setAddingNote] = useState(false)
  const [expandNote, setExpandNote] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    async function load() {
      const [{ data: st }, { data: ms }, { data: n }, { data: a }] = await Promise.all([
        supabase.from('agenda_sub_tasks')
          .select('*, agenda_items(id, title, agenda_groups(name, color))')
          .eq('id', id).single(),
        supabase.from('members').select('*').is('archived_at', null).order('part').order('name'),
        supabase.from('sub_task_notes').select('*').eq('sub_task_id', id).order('created_at', { ascending: false }),
        supabase.from('attachments').select('*').eq('sub_task_id', id).order('created_at', { ascending: false }),
      ])
      if (st) { setSubTask(st as FullSubTask); setTitleInput((st as AgendaSubTask).title) }
      setMembers((ms ?? []) as Member[])
      const noteList = (n ?? []) as SubTaskNote[]
      setNotes(noteList)
      setSelectedNoteId(noteList[0]?.id ?? null)
      setAttachments((a ?? []) as Attachment[])
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!expandNote) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopImmediatePropagation(); setExpandNote(false) } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [expandNote])

  function formatNoteDate(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (noteDay.getTime() === today.getTime()) return '오늘'
    if (noteDay.getTime() === yesterday.getTime()) return '어제'
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  async function cycleStatus() {
    if (!subTask) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(subTask.status as AgendaItemStatus) + 1) % STATUS_CYCLE.length]
    await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', id)
    setSubTask(prev => prev ? { ...prev, status: next } : prev)
  }

  async function saveTitle() {
    if (!titleInput.trim()) return
    await supabase.from('agenda_sub_tasks').update({ title: titleInput.trim() }).eq('id', id)
    setSubTask(prev => prev ? { ...prev, title: titleInput.trim() } : prev)
    setEditingTitle(false)
  }

  async function updateAssignee(assigneeId: string) {
    await supabase.from('agenda_sub_tasks').update({ assignee_id: assigneeId || null }).eq('id', id)
    setSubTask(prev => prev ? { ...prev, assignee_id: assigneeId || null } : prev)
  }

  async function updateDueDate(date: string) {
    await supabase.from('agenda_sub_tasks').update({ due_date: date || null }).eq('id', id)
    setSubTask(prev => prev ? { ...prev, due_date: date || null } : prev)
  }

  async function addNoteEntry() {
    setAddingNote(true)
    const { data } = await supabase.from('sub_task_notes')
      .insert({ sub_task_id: id, title: null, content: '' })
      .select().single()
    if (data) {
      const newNote = data as SubTaskNote
      setNotes(prev => [newNote, ...prev])
      setSelectedNoteId(newNote.id)
    }
    setAddingNote(false)
  }

  function handleNoteChange(noteId: string, value: string) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, content: value } : n))
    clearTimeout(noteTimers.current[noteId])
    noteTimers.current[noteId] = setTimeout(async () => {
      await supabase.from('sub_task_notes').update({ content: value, edited_at: new Date().toISOString() }).eq('id', noteId)
    }, 600)
  }

  async function updateNoteTitle(noteId: string, title: string) {
    await supabase.from('sub_task_notes').update({ title: title || null }).eq('id', noteId)
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: title || null } : n))
  }

  async function deleteNote(noteId: string) {
    await supabase.from('sub_task_notes').delete().eq('id', noteId)
    const remaining = notes.filter(n => n.id !== noteId)
    setNotes(remaining)
    if (selectedNoteId === noteId) setSelectedNoteId(remaining[0]?.id ?? null)
  }

  async function addLink() {
    if (!linkUrl.trim()) return
    const name = linkName.trim() || linkUrl
    const { data } = await supabase.from('attachments')
      .insert({ sub_task_id: id, name, type: '링크', url: linkUrl })
      .select().single()
    if (data) setAttachments(prev => [data as Attachment, ...prev])
    setLinkUrl(''); setLinkName('')
  }

  async function convertToJpeg(blob: Blob): Promise<Blob> {
    return new Promise(resolve => {
      const img = new window.Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width; canvas.height = img.height
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        canvas.toBlob(result => resolve(result!), 'image/jpeg', 0.92)
      }
      img.src = url
    })
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const blob = imageItem.getAsFile()
    if (!blob) return
    setUploading(true)
    try {
      const jpgBlob = await convertToJpeg(blob)
      const fileName = `screenshot_${Date.now()}.jpg`
      const path = `subtasks/${id}/${Date.now()}_${fileName}`
      const { error } = await supabase.storage.from('attachments').upload(path, jpgBlob, { contentType: 'image/jpeg' })
      if (error) { setToast('이미지 업로드 실패'); return }
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
      const { data } = await supabase.from('attachments')
        .insert({ sub_task_id: id, name: fileName, type: '파일', url: urlData.publicUrl })
        .select().single()
      if (data) setAttachments(prev => [data as Attachment, ...prev])
    } finally { setUploading(false) }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `subtasks/${id}/${Date.now()}_${safeName}`
        const { error } = await supabase.storage.from('attachments').upload(path, file)
        if (error) { setToast(`업로드 실패: ${error.message}`); continue }
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        const { data } = await supabase.from('attachments')
          .insert({ sub_task_id: id, name: file.name, type: '파일', url: urlData.publicUrl })
          .select().single()
        if (data) setAttachments(prev => [data as Attachment, ...prev])
      }
    } finally { setUploading(false); e.target.value = '' }
  }

  async function deleteAttachment(att: Attachment) {
    if (att.type === '파일') {
      const path = att.url.split('/object/public/attachments/')[1]
      if (path) await supabase.storage.from('attachments').remove([path])
    }
    await supabase.from('attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  if (!subTask) return <div className="p-8 text-[rgba(226,232,240,0.4)] text-sm animate-pulse">불러오는 중...</div>

  const agendaTitle = subTask.agenda_items?.title ?? ''
  const groupName = subTask.agenda_items?.agenda_groups?.name ?? ''
  const groupColor = subTask.agenda_items?.agenda_groups?.color ?? '#4C7FE0'
  const selectedNote = notes.find(n => n.id === selectedNoteId) ?? null

  const DateList = ({ onSelect, width }: { onSelect: (id: string) => void; width: number }) => (
    <div style={{ width, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: 'rgba(255,255,255,0.025)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {notes.map(note => {
        const isSel = note.id === selectedNoteId
        return (
          <button key={note.id} onClick={() => onSelect(note.id)}
            style={{ padding: '8px', fontSize: 11, textAlign: 'center', background: isSel ? `${groupColor}22` : 'transparent', color: isSel ? groupColor : 'rgba(226,232,240,0.45)', fontWeight: isSel ? 700 : 400, cursor: 'pointer', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'block', width: '100%', lineHeight: 1.4 }}>
            {formatNoteDate(note.created_at)}
          </button>
        )
      })}
      {notes.length === 0 && (
        <div style={{ padding: '16px 8px', fontSize: 10, color: '#CBD5E1', textAlign: 'center' }}>기록 없음</div>
      )}
    </div>
  )

  return (
    <div className="h-full overflow-y-auto" onPaste={handlePaste}>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {previewImg && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8" onClick={() => setPreviewImg(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImg} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setPreviewImg(null)} className="absolute top-4 right-6 text-white text-3xl font-light hover:text-gray-300 leading-none">×</button>
        </div>
      )}

      <div className="max-w-2xl w-full mx-auto px-4 md:px-6 py-6 pb-16 flex flex-col gap-5">

        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <button onClick={() => router.back()} className="hover:text-gray-300 transition-colors flex items-center gap-1">
            <span>←</span><span>돌아가기</span>
          </button>
          {groupName && (
            <><span>·</span><span style={{ color: groupColor, fontWeight: 600 }}>{groupName}</span></>
          )}
          {agendaTitle && (
            <><span>/</span><span className="text-gray-500 truncate max-w-[200px]">{agendaTitle}</span></>
          )}
        </div>

        {/* 제목 + 상태 */}
        <div className="flex items-start gap-3">
          <button onClick={cycleStatus} title={STATUS_LABEL[subTask.status as AgendaItemStatus]}
            style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_DOT[subTask.status as AgendaItemStatus], border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 9 }} />
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input autoFocus value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                onBlur={saveTitle}
                className="text-2xl font-bold text-[#E2E8F0] w-full border-b-2 border-blue-400 focus:outline-none bg-transparent pb-0.5" />
            ) : (
              <h1
                onClick={() => { setEditingTitle(true); setTitleInput(subTask.title) }}
                className="text-2xl font-bold cursor-text hover:text-[rgba(226,232,240,0.7)] transition-colors leading-tight"
                style={{ color: subTask.status === 'done' ? '#9CA3AF' : '#E2E8F0', textDecoration: subTask.status === 'done' ? 'line-through' : 'none' }}>
                {subTask.title}
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button onClick={cycleStatus}
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[subTask.status as AgendaItemStatus]}`}>
                {STATUS_LABEL[subTask.status as AgendaItemStatus]}
              </button>
              <select value={subTask.assignee_id ?? ''} onChange={e => updateAssignee(e.target.value)}
                className="text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-2 py-1 focus:outline-none bg-[#26282E] text-[rgba(226,232,240,0.75)] [color-scheme:dark]">
                <option value="">담당자 미지정</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[rgba(226,232,240,0.4)]">마감</span>
                <input type="date" value={subTask.due_date ?? ''}
                  onChange={e => updateDueDate(e.target.value)}
                  className="text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-2 py-1 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.75)] [color-scheme:dark]" />
              </div>
            </div>
          </div>
        </div>

        {/* 업데이트 로그 — surface-card + 날짜 패널 */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">업데이트 로그</span>
            <button onClick={addNoteEntry} disabled={addingNote}
              className="text-xs text-[#5DBD97] hover:text-[#4aab84] disabled:text-[rgba(226,232,240,0.25)] disabled:cursor-not-allowed border border-[#5DBD97]/30 disabled:border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1 transition-colors">
              {addingNote ? '추가 중…' : '+ 새 기록'}
            </button>
          </div>
          <div style={{ display: 'flex', minHeight: 200 }}>
            <DateList onSelect={setSelectedNoteId} width={88} />
            {/* 오른쪽: 에디터 */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {selectedNote ? (
                <>
                  <div className="flex items-center justify-between px-4 pt-2 pb-0.5 gap-2 flex-shrink-0">
                    <NoteTitleInput
                      note={selectedNote}
                      placeholder={`${formatNoteDate(selectedNote.created_at)} 기록`}
                      onSave={title => updateNoteTitle(selectedNote.id, title)}
                    />
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => deleteNote(selectedNote.id)}
                        className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-red-400 transition-colors px-1">삭제</button>
                      <button onClick={() => setExpandNote(true)}
                        className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,0.07)] transition-colors flex-shrink-0">
                        크게 편집
                      </button>
                    </div>
                  </div>
                  <TiptapEditor dark key={selectedNote.id} value={selectedNote.content}
                    onChange={v => handleNoteChange(selectedNote.id, v)}
                    minHeight={120} className="px-4 py-1" />
                </>
              ) : (
                <div style={{ padding: '24px', color: '#8FA0B5', fontSize: 12, textAlign: 'center' }}>+ 새 기록을 추가하세요</div>
              )}
            </div>
          </div>
        </div>

        {/* 첨부파일 — surface-card */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">첨부파일</span>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <input value={linkName} onChange={e => setLinkName(e.target.value)}
                placeholder="링크 이름 (선택)"
                className="w-32 text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.75)] placeholder:text-[rgba(226,232,240,0.25)]" />
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                placeholder="https://..."
                className="flex-1 text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.75)] placeholder:text-[rgba(226,232,240,0.25)]" />
              <button onClick={addLink}
                className="text-xs bg-[rgba(76,127,224,0.1)] text-[#4C7FE0] border border-[rgba(76,127,224,0.25)] px-3 py-2 rounded-lg hover:bg-[rgba(76,127,224,0.18)] transition-colors whitespace-nowrap">
                링크 추가
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.75)] w-fit">
              <span className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] transition-colors">
                {uploading ? '업로드 중...' : '파일 선택'}
              </span>
              <span className="text-[rgba(226,232,240,0.3)]">또는 이미지를 붙여넣으세요 (Ctrl+V)</span>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
            {attachments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 p-2.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-lg group">
                    {att.type === '파일' && att.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={att.url} alt="" className="w-10 h-10 object-cover rounded cursor-pointer flex-shrink-0"
                        onClick={() => setPreviewImg(att.url)} />
                    ) : (
                      <span className="text-base flex-shrink-0">{att.type === '링크' ? '🔗' : '📄'}</span>
                    )}
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-xs text-[rgba(226,232,240,0.65)] hover:text-blue-400 truncate">{att.name}</a>
                    <button onClick={() => deleteAttachment(att)}
                      className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">삭제</button>
                  </div>
                ))}
              </div>
            )}
            {attachments.length === 0 && (
              <p className="text-xs text-[rgba(226,232,240,0.3)] py-1">첨부된 파일이 없습니다</p>
            )}
          </div>
        </div>
      </div>

      {/* 크게 편집 오버레이 */}
      {expandNote && selectedNote && (
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0F1319' }}>
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: `4px solid ${groupColor}` }}>
            <div>
              <div className="text-[10px] text-[rgba(226,232,240,0.4)] font-semibold uppercase tracking-wider mb-0.5">업데이트 로그</div>
              <div className="text-sm font-semibold text-[rgba(226,232,240,0.9)]">{subTask.title}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={addNoteEntry} disabled={addingNote}
                className="text-xs text-[#5DBD97] hover:text-[#4aab84] disabled:text-[rgba(226,232,240,0.25)] disabled:cursor-not-allowed border border-[#5DBD97]/30 rounded-lg px-3 py-1.5 transition-colors">
                {addingNote ? '추가 중…' : '+ 새 기록'}
              </button>
              <button onClick={() => setExpandNote(false)}
                className="flex items-center gap-1.5 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors border border-[rgba(255,255,255,0.08)]">
                <span>ESC</span><span> 닫기</span>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex">
            {/* 날짜 목록 */}
            <div style={{ width: 100, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {notes.map(note => {
                const isSel = note.id === selectedNoteId
                return (
                  <button key={note.id} onClick={() => setSelectedNoteId(note.id)}
                    style={{ padding: '10px 12px', fontSize: 12, textAlign: 'center', background: isSel ? `${groupColor}22` : 'transparent', color: isSel ? groupColor : 'rgba(226,232,240,0.4)', fontWeight: isSel ? 700 : 400, cursor: 'pointer', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'block', width: '100%', lineHeight: 1.3 }}>
                    {formatNoteDate(note.created_at)}
                  </button>
                )
              })}
            </div>
            {/* 에디터 */}
            <div className="flex-1 min-w-0 overflow-auto">
              <div className="px-8 pt-4 pb-0 flex items-center">
                <NoteTitleInput note={selectedNote}
                  placeholder={`${formatNoteDate(selectedNote.created_at)} 기록`}
                  onSave={title => updateNoteTitle(selectedNote.id, title)} />
              </div>
              <TiptapEditor dark key={`expand_${selectedNote.id}`} value={selectedNote.content}
                onChange={v => handleNoteChange(selectedNote.id, v)}
                autoFocus minHeight={300} className="px-8 py-4" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
