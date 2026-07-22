'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaSubTask, SubTaskNote, Attachment, Member, AgendaItemStatus } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import dynamic from 'next/dynamic'
import MarkdownContent from '@/components/MarkdownContent'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

const STATUS_CYCLE: AgendaItemStatus[] = ['active', 'hold', 'done']
const STATUS_LABEL: Record<AgendaItemStatus, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_COLOR: Record<AgendaItemStatus, string> = {
  active: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  hold:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  done:   'bg-white/[0.04] text-[rgba(226,232,240,0.4)] border-white/[0.08]',
}

function defaultNoteTitle() {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd} 업데이트`
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 right-20 bg-[#5DBD97] text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
      ✓ {message}
    </div>
  )
}

interface NoteAccordionProps {
  note: SubTaskNote
  isOpen: boolean
  onToggle: () => void
  onDelete: (id: string) => void
  onEdit: (id: string, content: string) => void
  onEditTitle: (id: string, title: string) => void
}

function NoteAccordion({ note, isOpen, onToggle, onDelete, onEdit, onEditTitle }: NoteAccordionProps) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(note.title ?? '')
  const [autoSaved, setAutoSaved] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const dateLabel = (() => {
    try { return format(parseISO(note.created_at), 'M월 d일 HH:mm', { locale: ko }) } catch { return '' }
  })()
  const displayTitle = note.title || dateLabel

  function handleContentChange(html: string) {
    setEditContent(html)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      onEdit(note.id, html)
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 2000)
    }, 1200)
  }

  return (
    <div className="border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden group">
      <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors" onClick={onToggle}>
        <span className="text-[rgba(226,232,240,0.3)] text-xs transition-transform duration-150" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        {editingTitle ? (
          <input autoFocus value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={() => { onEditTitle(note.id, editTitle); setEditingTitle(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { onEditTitle(note.id, editTitle); setEditingTitle(false) }; if (e.key === 'Escape') setEditingTitle(false) }}
            onClick={e => e.stopPropagation()}
            className="flex-1 text-sm font-medium border-b border-[rgba(255,255,255,0.2)] focus:outline-none bg-transparent text-[rgba(226,232,240,0.85)]" />
        ) : (
          <span className="flex-1 text-sm font-medium text-[rgba(226,232,240,0.75)]"
            onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true); setEditTitle(note.title ?? '') }}>
            {displayTitle}
          </span>
        )}
        <button onClick={e => { e.stopPropagation(); onDelete(note.id) }}
          className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">삭제</button>
        <span className="text-[10px] text-[rgba(226,232,240,0.3)]">{dateLabel}</span>
      </div>
      {isOpen && (
        <div className="px-4 pb-3 border-t border-[rgba(255,255,255,0.06)] group">
          {editing ? (
            <>
              <TiptapEditor dark value={editContent} onChange={handleContentChange}
                onSubmit={() => { setEditing(false) }}
                onEscape={() => setEditing(false)}
                autoFocus minHeight={120} />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs transition-opacity ${autoSaved ? 'text-emerald-400 opacity-100' : 'opacity-0'}`}>자동저장됨</span>
                <button onClick={() => setEditing(false)} className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-3 py-1 rounded-lg">닫기</button>
              </div>
            </>
          ) : (
            <>
              <MarkdownContent content={note.content} className="pt-3" dark />
              <button onClick={() => { setEditing(true); setEditContent(note.content) }}
                className="mt-2 text-xs text-[rgba(226,232,240,0.4)] hover:text-blue-400 transition-colors">✏ 편집</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function SubTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [subTask, setSubTask] = useState<AgendaSubTask & { agenda_items?: { title: string; agenda_groups?: { name: string } | null } | null } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [notes, setNotes] = useState<SubTaskNote[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set())
  const [noteInput, setNoteInput] = useState('')
  const [noteTitle, setNoteTitle] = useState(defaultNoteTitle())
  const [newNoteKey, setNewNoteKey] = useState(0)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: st }, { data: ms }, { data: n }, { data: a }] = await Promise.all([
        supabase.from('agenda_sub_tasks')
          .select('*, agenda_items(title, agenda_groups(name))')
          .eq('id', id).single(),
        supabase.from('members').select('*').is('archived_at', null).order('part').order('name'),
        supabase.from('sub_task_notes').select('*').eq('sub_task_id', id).order('created_at', { ascending: false }),
        supabase.from('attachments').select('*').eq('sub_task_id', id).order('created_at', { ascending: false }),
      ])
      if (st) { setSubTask(st as any); setTitleInput((st as AgendaSubTask).title) }
      setMembers((ms ?? []) as Member[])
      const noteList = (n ?? []) as SubTaskNote[]
      setNotes(noteList)
      if (noteList.length > 0) setOpenNoteIds(new Set([noteList[0].id]))
      setAttachments((a ?? []) as Attachment[])
    }
    load()
  }, [id])

  function toggleNote(noteId: string) {
    setOpenNoteIds(prev => { const s = new Set(prev); s.has(noteId) ? s.delete(noteId) : s.add(noteId); return s })
  }

  async function cycleStatus() {
    if (!subTask) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(subTask.status) + 1) % STATUS_CYCLE.length]
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

  async function saveNote() {
    if (!noteInput.replace(/<[^>]*>/g, '').trim()) return
    const { data } = await supabase.from('sub_task_notes')
      .insert({ sub_task_id: id, title: noteTitle.trim() || null, content: noteInput })
      .select().single()
    if (data) {
      const newNote = data as SubTaskNote
      setNotes(prev => [newNote, ...prev])
      setOpenNoteIds(prev => new Set([newNote.id, ...prev]))
    }
    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
    setNewNoteKey(k => k + 1)
  }

  async function deleteNote(noteId: string) {
    await supabase.from('sub_task_notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  async function editNote(noteId: string, content: string) {
    const now = new Date().toISOString()
    await supabase.from('sub_task_notes').update({ content, edited_at: now }).eq('id', noteId)
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, content, edited_at: now } : n))
  }

  async function editNoteTitle(noteId: string, title: string) {
    await supabase.from('sub_task_notes').update({ title: title || null }).eq('id', noteId)
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: title || null } : n))
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

  const assignee = members.find(m => m.id === subTask.assignee_id)
  const agendaTitle = (subTask as any).agenda_items?.title ?? ''
  const groupName = (subTask as any).agenda_items?.agenda_groups?.name ?? ''

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pretendard-page" onPaste={handlePaste}>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {previewImg && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8" onClick={() => setPreviewImg(null)}>
          <img src={previewImg} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setPreviewImg(null)} className="absolute top-4 right-6 text-white text-3xl font-light hover:text-gray-300 leading-none">×</button>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-[rgba(226,232,240,0.4)] mb-5">
          <button onClick={() => router.back()} className="hover:text-[rgba(226,232,240,0.7)] transition-colors">← 돌아가기</button>
          {groupName && <><span>·</span><span>{groupName}</span></>}
          {agendaTitle && <><span>/</span><span>{agendaTitle}</span></>}
        </div>

        {/* 제목 */}
        <div className="mb-4">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={titleInput} onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                className="flex-1 text-2xl font-bold text-[#E2E8F0] border-b-2 border-blue-400 focus:outline-none bg-transparent pb-1" />
              <button onClick={saveTitle} className="text-sm text-blue-400 hover:text-blue-300 font-medium px-2">저장</button>
              <button onClick={() => setEditingTitle(false)} className="text-sm text-[rgba(226,232,240,0.4)]">취소</button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-[#E2E8F0] cursor-text hover:text-[rgba(226,232,240,0.75)] transition-colors"
              onClick={() => setEditingTitle(true)}>
              {subTask.title}
            </h1>
          )}
        </div>

        {/* 메타 정보 */}
        <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-[rgba(255,255,255,0.08)]">
          {/* 상태 */}
          <button onClick={cycleStatus}
            className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${STATUS_COLOR[subTask.status]}`}>
            {STATUS_LABEL[subTask.status]}
          </button>

          {/* 담당자 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[rgba(226,232,240,0.4)]">담당</span>
            <select value={subTask.assignee_id ?? ''} onChange={e => updateAssignee(e.target.value)}
              className="text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-2 py-1 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.75)] [&>option]:bg-[#26282E]">
              <option value="">미지정</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* 마감일 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[rgba(226,232,240,0.4)]">마감</span>
            <input type="date" value={subTask.due_date ?? ''}
              onChange={e => updateDueDate(e.target.value)}
              className="text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-2 py-1 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.75)]" />
          </div>
        </div>

        {/* 업데이트 로그 (노트 입력) */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wide mb-3">업데이트 로그</h2>

          {/* 새 노트 입력 */}
          <div className="border border-[rgba(255,255,255,0.08)] rounded-xl p-4 mb-4 bg-[rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2 mb-2">
              <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
                className="flex-1 text-sm font-medium text-[rgba(226,232,240,0.8)] border-none focus:outline-none bg-transparent placeholder:text-[rgba(226,232,240,0.25)]"
                placeholder="제목 (선택)" />
            </div>
            <TiptapEditor dark key={newNoteKey} value={noteInput} onChange={setNoteInput}
              onSubmit={saveNote} onEscape={() => {}} minHeight={80} />
            <div className="flex justify-end mt-2">
              <button onClick={saveNote}
                className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg hover:bg-[#D5E6F7] transition-colors">
                저장
              </button>
            </div>
          </div>

          {/* 노트 목록 */}
          <div className="space-y-2">
            {notes.map(note => (
              <NoteAccordion key={note.id} note={note}
                isOpen={openNoteIds.has(note.id)}
                onToggle={() => toggleNote(note.id)}
                onDelete={deleteNote} onEdit={editNote} onEditTitle={editNoteTitle} />
            ))}
            {notes.length === 0 && (
              <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-4">아직 업데이트 내용이 없습니다</p>
            )}
          </div>
        </section>

        {/* 첨부파일 */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wide mb-3">첨부파일</h2>

          {/* 링크 추가 */}
          <div className="flex gap-2 mb-3">
            <input value={linkName} onChange={e => setLinkName(e.target.value)}
              placeholder="링크 이름 (선택)"
              className="w-32 text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.75)] placeholder:text-[rgba(226,232,240,0.25)]" />
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addLink() }}
              placeholder="https://..."
              className="flex-1 text-xs border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.75)] placeholder:text-[rgba(226,232,240,0.25)]" />
            <button onClick={addLink}
              className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-2 rounded-lg hover:bg-[#D5E6F7] transition-colors whitespace-nowrap">
              링크 추가
            </button>
          </div>

          {/* 파일 업로드 */}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.75)] mb-4 w-fit">
            <span className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] transition-colors">
              {uploading ? '업로드 중...' : '파일 선택'}
            </span>
            <span className="text-[rgba(226,232,240,0.3)]">또는 이미지를 붙여넣으세요 (Ctrl+V)</span>
            <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>

          {/* 첨부 목록 */}
          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-2 p-2.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-lg group">
                  {att.type === '파일' && att.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img src={att.url} className="w-10 h-10 object-cover rounded cursor-pointer flex-shrink-0"
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
            <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-3">첨부된 파일이 없습니다</p>
          )}
        </section>
      </div>
    </div>
  )
}
