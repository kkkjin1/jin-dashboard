'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchMembers, parseTags, formatDate } from '@/lib/tasks'
import type { Task, Member, Note, Attachment, TaskStatus, Part, TaskType, Meeting, TaskTodo, ScheduleTag } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { generateTaskMd, downloadMd } from '@/lib/markdown'
import SmartTextarea from '@/components/SmartTextarea'
import MarkdownContent from '@/components/MarkdownContent'
import FormattingToolbar from '@/components/FormattingToolbar'
import FullscreenNoteEditor from '@/components/FullscreenNoteEditor'

const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']
const STATUS_COLORS: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-100 text-gray-600',
  '진행중': 'bg-[#EBF7F2] text-[#5DBD97]',
  '완료': 'bg-[#EBF7F2]/60 text-[#4aab84]',
}

const TODO_TAG_LABELS: Record<ScheduleTag, string> = { today: '오늘', tomorrow: '내일', this_week: '금주' }
const TODO_TAG_ACTIVE: Record<ScheduleTag, string> = {
  today: 'bg-red-100 text-red-600',
  tomorrow: 'bg-orange-100 text-orange-600',
  this_week: 'bg-blue-100 text-blue-600',
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 right-20 bg-[#5DBD97] text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
      ✓ {message}
    </div>
  )
}

function defaultNoteTitle(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd} 논의`
}

interface NoteAccordionProps {
  note: Note
  isOpen: boolean
  onToggle: () => void
  onDelete: (id: string) => void
  onEdit: (id: string, newContent: string) => void
  onEditTitle: (id: string, newTitle: string) => void
}

function NoteAccordion({ note, isOpen, onToggle, onDelete, onEdit, onEditTitle }: NoteAccordionProps) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(note.title ?? '')
  const [autoSaved, setAutoSaved] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const editRef = useRef<HTMLTextAreaElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const dateLabel = (() => {
    try { return format(parseISO(note.created_at), 'M월 d일 HH:mm', { locale: ko }) } catch { return '' }
  })()
  const displayTitle = note.title || dateLabel
  const editedLabel = note.edited_at ? (() => {
    try { return `(수정 ${format(parseISO(note.edited_at), 'M/dd HH:mm', { locale: ko })})` } catch { return '' }
  })() : null

  function handleContentChange(val: string) {
    setEditContent(val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (val.trim()) {
        onEdit(note.id, val.trim())
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      }
    }, 1500)
  }

  function handleSaveEdit() {
    if (editContent.trim()) onEdit(note.id, editContent.trim())
    setEditing(false)
  }

  function handleSaveTitle() {
    onEditTitle(note.id, editTitle.trim())
    setEditingTitle(false)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden group">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
          <span className="text-xs text-gray-400 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
          {editingTitle ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setEditTitle(note.title ?? ''); setEditingTitle(false) } }}
              onClick={e => e.stopPropagation()}
              className="text-sm font-medium text-gray-700 focus:outline-none border-b border-gray-300 bg-transparent flex-1"
            />
          ) : (
            <span
              className="text-sm font-medium text-gray-700 flex-shrink-0 hover:text-blue-500 cursor-text"
              onClick={e => { e.stopPropagation(); setEditingTitle(true); setEditTitle(note.title ?? '') }}
              title="클릭하여 제목 수정">
              {displayTitle}
            </span>
          )}
          {editedLabel && <span className="text-xs text-gray-400 flex-shrink-0">{editedLabel}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-300 truncate max-w-40">{!isOpen && note.content.slice(0, 40)}</span>
          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(note.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
            className="text-xs text-gray-300 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100">
            {copied ? '✓' : '복사'}
          </button>
          <button onClick={e => { e.stopPropagation(); setEditing(true); setEditContent(note.content) }}
            className="text-xs text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">수정</button>
          <button onClick={e => { e.stopPropagation(); onDelete(note.id) }}
            className="text-xs text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">삭제</button>
        </div>
      </div>
      {fullscreen && (
        <FullscreenNoteEditor
          value={editContent}
          onChange={handleContentChange}
          onSave={() => { if (editContent.trim()) onEdit(note.id, editContent.trim()); setEditing(false) }}
          onClose={() => setFullscreen(false)}
          title={note.title ?? '노트'}
        />
      )}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-50">
          {editing ? (
            <>
              <FormattingToolbar textareaRef={editRef} value={editContent} onChange={handleContentChange} onExpand={() => setFullscreen(true)} />
              <SmartTextarea ref={editRef} value={editContent} onChange={handleContentChange}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveEdit(); if (e.key === 'Escape') setEditing(false) }}
                className="w-full text-sm focus:outline-none resize-none text-gray-700 pt-2" style={{ minHeight: '160px' }} autoFocus />
              <div className="flex items-center justify-between mt-3">
                <span className={`text-xs transition-opacity ${autoSaved ? 'text-emerald-500 opacity-100' : 'opacity-0'}`}>자동저장됨</span>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1 rounded-lg">취소</button>
                  <button onClick={handleSaveEdit} className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg hover:bg-gray-800">저장</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <MarkdownContent content={note.content} className="pt-3" />
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => { setEditing(true); setEditContent(note.content) }}
                  className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                  ✏ 편집
                </button>
                <button
                  onClick={() => { setEditContent(note.content); setFullscreen(true) }}
                  className="text-xs text-gray-400 hover:text-blue-500 transition-colors">
                  ⛶ 크게 편집
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [task, setTask] = useState<Task | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [noteInput, setNoteInput] = useState('')
  const [noteTitle, setNoteTitle] = useState(defaultNoteTitle())
  const [showFullscreenNew, setShowFullscreenNew] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set())

  const [todos, setTodos] = useState<TaskTodo[]>([])
  const [todoInput, setTodoInput] = useState('')
  const [shortName, setShortName] = useState('')

  const [showRetroModal, setShowRetroModal] = useState(false)
  const [retroGood, setRetroGood] = useState('')
  const [retroBad, setRetroBad] = useState('')
  const [retroImprovement, setRetroImprovement] = useState('')
  const [showRetro, setShowRetro] = useState(false)

  const [linkedMeetings, setLinkedMeetings] = useState<Meeting[]>([])
  const [allMeetings, setAllMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [selectedMeetingId, setSelectedMeetingId] = useState('')
  const [expandedMeetingIds, setExpandedMeetingIds] = useState<Set<string>>(new Set())
  const [showAllNotesMeetingIds, setShowAllNotesMeetingIds] = useState<Set<string>>(new Set())
  const [openMeetingNoteKeys, setOpenMeetingNoteKeys] = useState<Set<string>>(new Set())

  const [contentWidth, setContentWidth] = useState<number | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const noteTitleRef = useRef<HTMLInputElement>(null)
  const noteAreaRef = useRef<HTMLTextAreaElement>(null)
  const autoFocused = useRef(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'q') setContentWidth(prev => prev ? null : 720)
      if (e.key === 'Tab') { e.preventDefault(); titleRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    async function load() {
      const [{ data: t }, ms, { data: n }, { data: a }, { data: links }, { data: meetings }, { data: todosData }] = await Promise.all([
        supabase.from('tasks').select('*, members(id, name, part)').eq('id', id).single(),
        fetchMembers(),
        supabase.from('notes').select('*').eq('task_id', id).order('created_at', { ascending: false }),
        supabase.from('attachments').select('*').eq('task_id', id).order('created_at', { ascending: false }),
        supabase.from('task_meeting_links').select('meeting_id, meetings(*)').eq('task_id', id),
        supabase.from('meetings').select('id, title, meeting_date').order('created_at', { ascending: false }),
        supabase.from('task_todos').select('*').eq('task_id', id).order('sort_order').order('created_at'),
      ])
      if (t) { setTask(t as Task); setTitleInput((t as Task).title); setShortName((t as Task).short_name ?? '') }
      setMembers(ms)
      const noteList = (n ?? []) as Note[]
      setNotes(noteList)
      if (noteList.length > 0) setOpenNoteIds(new Set([noteList[0].id]))
      setAttachments((a ?? []) as Attachment[])
      if (links) setLinkedMeetings((links as any[]).map(l => l.meetings).filter(Boolean) as Meeting[])
      if (meetings) setAllMeetings(meetings as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[])
      setTodos((todosData ?? []) as TaskTodo[])
    }
    load()
  }, [id])

  useEffect(() => {
    if (task && !autoFocused.current) {
      autoFocused.current = true
      if (!task.title) titleRef.current?.focus()
    }
  }, [task])

  function toggleNote(noteId: string) {
    setOpenNoteIds(prev => { const next = new Set(prev); if (next.has(noteId)) next.delete(noteId); else next.add(noteId); return next })
  }

  function toggleMeetingNote(meetingId: string, idx: number) {
    const key = `${meetingId}|${idx}`
    setOpenMeetingNoteKeys(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  function toggleShowAllMeetingNotes(meetingId: string) {
    setShowAllNotesMeetingIds(prev => { const s = new Set(prev); s.has(meetingId) ? s.delete(meetingId) : s.add(meetingId); return s })
  }

  async function updateTask(updates: Partial<Task>) {
    await supabase.from('tasks').update(updates).eq('id', id)
    setTask(prev => prev ? { ...prev, ...updates } : prev)
  }

  async function addTodo() {
    if (!todoInput.trim()) return
    const { data } = await supabase.from('task_todos').insert({
      task_id: id, title: todoInput.trim(), sort_order: todos.length,
    }).select().single()
    if (data) setTodos(prev => [...prev, data as TaskTodo])
    setTodoInput('')
  }

  async function toggleTodoDone(todoId: string, done: boolean) {
    const doneAt = done ? new Date().toISOString() : null
    await supabase.from('task_todos').update({ done, done_at: doneAt }).eq('id', todoId)
    setTodos(prev => prev.map(t => t.id === todoId ? { ...t, done, done_at: doneAt } : t))
  }

  function getTargetDateForBucket(bucket: 'today' | 'tomorrow' | 'this_week'): string {
    const d = new Date()
    if (bucket === 'today') return d.toISOString().slice(0, 10)
    if (bucket === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
    // this_week → 이번 주 금요일
    const day = d.getDay()
    const daysToFri = (5 - day + 7) % 7
    d.setDate(d.getDate() + (daysToFri === 0 ? 0 : daysToFri))
    return d.toISOString().slice(0, 10)
  }

  function getTodoBucketFromDate(targetDate: string | null | undefined): 'today' | 'tomorrow' | 'this_week' | null {
    if (!targetDate) return null
    const todayStr = new Date().toISOString().slice(0, 10)
    const d = new Date(); d.setDate(d.getDate() + 1)
    const tomorrowStr = d.toISOString().slice(0, 10)
    if (targetDate === todayStr) return 'today'
    if (targetDate === tomorrowStr) return 'tomorrow'
    if (targetDate >= todayStr) return 'this_week'
    return null
  }

  async function updateTodoDate(todoId: string, bucket: 'today' | 'tomorrow' | 'this_week' | null) {
    const target_date = bucket ? getTargetDateForBucket(bucket) : null
    await supabase.from('task_todos').update({ target_date }).eq('id', todoId)
    setTodos(prev => prev.map(t => t.id === todoId ? { ...t, target_date } : t))
  }

  async function updateShortName(val: string) {
    await supabase.from('tasks').update({ short_name: val || null }).eq('id', id)
    setTask(prev => prev ? { ...prev, short_name: val || null } : prev)
  }

  async function deleteTodo(todoId: string) {
    await supabase.from('task_todos').delete().eq('id', todoId)
    setTodos(prev => prev.filter(t => t.id !== todoId))
  }

  async function saveRetro(skip: boolean) {
    const updates: Partial<Task> = { status: '완료' }
    if (!skip) {
      updates.retrospective = {
        good: retroGood.trim(),
        bad: retroBad.trim(),
        improvement: retroImprovement.trim(),
      }
    }
    await updateTask(updates)
    setShowRetroModal(false)
    setRetroGood(''); setRetroBad(''); setRetroImprovement('')
    setToast('완료로 변경되었습니다')
  }

  async function saveNote() {
    if (!noteInput.trim()) return
    const parsed = parseTags(noteInput)
    const taskUpdates: Partial<Task> = {}
    if (parsed.mid_date) taskUpdates.mid_date = parsed.mid_date
    if (parsed.end_date) taskUpdates.end_date = parsed.end_date
    if (parsed.start_date) taskUpdates.start_date = parsed.start_date
    if (parsed.type) taskUpdates.type = parsed.type
    if (parsed.status) taskUpdates.status = parsed.status
    if (parsed.part) taskUpdates.part = parsed.part
    if (parsed.assignee_name) {
      const found = members.find(m => m.name === parsed.assignee_name)
      if (found) taskUpdates.assignee_id = found.id
    }
    const { data } = await supabase.from('notes').insert({ task_id: id, title: noteTitle.trim() || null, content: noteInput }).select().single()
    if (data) {
      const newNote = data as Note
      setNotes(prev => [newNote, ...prev])
      setOpenNoteIds(prev => new Set([newNote.id, ...prev]))
    }
    if (Object.keys(taskUpdates).length > 0) {
      await updateTask(taskUpdates)
      const labels: string[] = []
      if (parsed.mid_date) labels.push(`중간공유일 ${formatDate(parsed.mid_date)}`)
      if (parsed.end_date) labels.push(`최종보고일 ${formatDate(parsed.end_date)}`)
      if (parsed.start_date) labels.push(`시작일 ${formatDate(parsed.start_date)}`)
      if (parsed.type) labels.push(`유형 ${parsed.type}`)
      if (parsed.status) labels.push(`상태 ${parsed.status}`)
      if (parsed.part) labels.push(`파트 ${parsed.part}`)
      if (parsed.assignee_name) labels.push(`담당자 ${parsed.assignee_name}`)
      setToast(`${labels.join(', ')}로 설정되었습니다`)
    }
    const currentMonth = new Date().toISOString().slice(0, 7)
    const workMonths = task?.work_months ?? []
    if (!workMonths.includes(currentMonth)) await updateTask({ work_months: [...workMonths, currentMonth] })
    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
  }

  async function deleteNote(noteId: string) {
    await supabase.from('notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  async function editNote(noteId: string, newContent: string) {
    const now = new Date().toISOString()
    await supabase.from('notes').update({ content: newContent, edited_at: now }).eq('id', noteId)
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, content: newContent, edited_at: now } : n))
  }

  async function editNoteTitle(noteId: string, newTitle: string) {
    await supabase.from('notes').update({ title: newTitle || null }).eq('id', noteId)
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: newTitle || null } : n))
  }

  async function addLink() {
    if (!linkUrl.trim()) return
    const name = linkName.trim() || linkUrl
    const { data } = await supabase.from('attachments').insert({ task_id: id, name, type: '링크', url: linkUrl }).select().single()
    if (data) setAttachments(prev => [data as Attachment, ...prev])
    setLinkUrl(''); setLinkName('')
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
      const path = `tasks/${id}/${Date.now()}_${safeName}`
      const { error } = await supabase.storage.from('attachments').upload(path, file)
      if (error) { console.error(error); continue }
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
      const { data } = await supabase.from('attachments').insert({ task_id: id, name: file.name, type: '파일', url: urlData.publicUrl }).select().single()
      if (data) setAttachments(prev => [data as Attachment, ...prev])
    }
    setUploading(false)
    e.target.value = ''
  }

  async function deleteAttachment(att: Attachment) {
    if (att.type === '파일') {
      const path = att.url.split('/object/public/attachments/')[1]
      if (path) await supabase.storage.from('attachments').remove([path])
    }
    await supabase.from('attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  async function deleteTask() {
    if (!confirm('이 업무를 삭제하시겠습니까? 되돌릴 수 없습니다.')) return
    setDeleting(true)
    await supabase.from('tasks').delete().eq('id', id)
    router.push('/tasks')
  }

  async function linkMeeting() {
    if (!selectedMeetingId) return
    await supabase.from('task_meeting_links').insert({ task_id: id, meeting_id: selectedMeetingId })
    const found = allMeetings.find(m => m.id === selectedMeetingId)
    if (found) setLinkedMeetings(prev => [...prev, found as Meeting])
    setSelectedMeetingId('')
  }

  async function unlinkMeeting(meetingId: string) {
    await supabase.from('task_meeting_links').delete().eq('task_id', id).eq('meeting_id', meetingId)
    setLinkedMeetings(prev => prev.filter(m => m.id !== meetingId))
  }

  async function createAndLinkMeeting() {
    const { data } = await supabase.from('meetings').insert({ title: '' }).select('id').single()
    if (data) {
      const newId = (data as { id: string }).id
      await supabase.from('task_meeting_links').insert({ task_id: id, meeting_id: newId })
      router.push(`/meetings/${newId}`)
    }
  }

  function handleDownloadMd() {
    if (!task) return
    const member = members.find(m => m.id === task.assignee_id)
    const md = generateTaskMd({
      title: task.title, status: task.status, assignee: member?.name,
      part: task.part, type: task.type,
      start_date: task.start_date, mid_date: task.mid_date, end_date: task.end_date,
      notes: notes.map(n => ({ title: n.title || format(parseISO(n.created_at), 'yyMMdd 논의', { locale: ko }), content: n.content, created_at: n.created_at })),
      attachments: attachments.map(a => ({ name: a.name, url: a.url })),
    })
    downloadMd(md, task.title)
  }

  if (!task) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  const member = members.find(m => m.id === task.assignee_id)

  return (
    <div
      className="p-8"
      style={contentWidth ? { width: `${contentWidth}px` } : {}}
    >
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {showRetroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[480px] max-w-[90vw]">
            <h3 className="font-bold text-gray-900 mb-1">업무 완료 회고</h3>
            <p className="text-xs text-gray-400 mb-4">인사이트를 남기면 나중에 검색할 수 있습니다.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-green-600 mb-1 block">좋았던 점</label>
                <textarea value={retroGood} onChange={e => setRetroGood(e.target.value)}
                  placeholder="잘 됐던 부분, 긍정적인 결과물..."
                  rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-amber-600 mb-1 block">아쉬웠던 점</label>
                <textarea value={retroBad} onChange={e => setRetroBad(e.target.value)}
                  placeholder="더 잘할 수 있었던 부분, 아쉬운 결과..."
                  rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-red-600 mb-1 block">개선 필요한 점</label>
                <textarea value={retroImprovement} onChange={e => setRetroImprovement(e.target.value)}
                  placeholder="다음엔 어떻게 바꿀지, 구체적인 개선 액션..."
                  rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-between items-center mt-4">
              <button onClick={() => saveRetro(true)} className="text-xs text-gray-400 hover:text-gray-600">건너뛰기</button>
              <div className="flex gap-2">
                <button onClick={() => setShowRetroModal(false)} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">취소</button>
                <button onClick={() => saveRetro(false)}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700">
                  저장하고 완료
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 뒤로가기 + 너비조절 + MD 다운로드 */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/tasks" className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">← 업무 목록</Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setContentWidth(prev => prev ? null : 720)}
            className={`text-xs border rounded-md px-3 py-1.5 transition-colors ${contentWidth ? 'border-blue-200 text-blue-500 bg-blue-50 hover:bg-blue-100' : 'border-gray-200 text-gray-400 hover:bg-white'}`}
          >
            {contentWidth ? '↔ 전체 너비' : '⟵ 좁게 보기'} <span className="opacity-50">[q]</span>
          </button>
          <button onClick={handleDownloadMd} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors">
            MD 다운로드
          </button>
        </div>
      </div>

      {/* 제목 */}
      <div className="mb-4 mt-1">
        <input ref={titleRef} value={titleInput} onChange={e => setTitleInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); noteTitleRef.current?.focus() } if (e.key === 'Enter') { updateTask({ title: titleInput }); noteAreaRef.current?.focus() } if (e.key === 'Escape') setTitleInput(task.title) }}
          onBlur={() => { if (titleInput.trim()) updateTask({ title: titleInput }) }}
          placeholder="업무 제목"
          className="text-2xl font-bold text-gray-900 w-full focus:outline-none border-b-2 border-transparent focus:border-red-300 pb-1 transition-colors bg-transparent" />
      </div>

      {/* 가로 상태바: 상태 / 담당자 / 파트 / 유형 / 날짜들 */}
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100 flex-wrap">
        <select value={task.status} onChange={e => {
          const newStatus = e.target.value as TaskStatus
          if (newStatus === '완료') {
            setShowRetroModal(true)
          } else {
            updateTask({ status: newStatus })
          }
        }}
          className={`text-xs px-3 py-1.5 rounded font-medium border-0 cursor-pointer focus:outline-none ${STATUS_COLORS[task.status]}`}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="w-px h-3.5 bg-gray-200" />

        <select value={task.assignee_id ?? ''} onChange={e => updateTask({ assignee_id: e.target.value || null })}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white text-gray-600">
          <option value="">담당자 없음</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <select value={task.part} onChange={e => updateTask({ part: e.target.value as Part })}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white text-gray-600">
          <option value="코어">코어</option>
          <option value="비즈">비즈</option>
        </select>

        <select value={task.type} onChange={e => updateTask({ type: e.target.value as TaskType })}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white text-gray-600">
          <option value="기획">기획</option>
          <option value="개선">개선</option>
          <option value="운영">운영</option>
        </select>

        <div className="w-px h-3.5 bg-gray-200" />

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">시작</span>
          <input type="date" value={task.start_date ?? ''} onChange={e => updateTask({ start_date: e.target.value || null })}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-amber-500">중간</span>
          <input type="date" value={task.mid_date ?? ''} onChange={e => updateTask({ mid_date: e.target.value || null })}
            className="text-xs border border-amber-200 rounded px-1.5 py-1 focus:outline-none" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-red-500">최종</span>
          <input type="date" value={task.end_date ?? ''} onChange={e => updateTask({ end_date: e.target.value || null })}
            className="text-xs border border-red-200 rounded px-1.5 py-1 focus:outline-none" />
        </div>
      </div>

      {/* 노트 입력 영역 - 전체 너비 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">맥락 / 노트</h2>
        <div className="bg-white rounded-lg border border-gray-100 p-4 mb-3">
          <input ref={noteTitleRef} value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); noteAreaRef.current?.focus() } }}
            className="w-full text-xs font-medium text-gray-500 focus:outline-none mb-2 border-b border-gray-100 pb-1 bg-transparent" placeholder="노트 제목" />
          <FormattingToolbar textareaRef={noteAreaRef} value={noteInput} onChange={setNoteInput} onExpand={() => setShowFullscreenNew(true)} />
          <SmartTextarea ref={noteAreaRef} value={noteInput} onChange={setNoteInput}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote() }}
            placeholder="노트 입력 (Ctrl+Enter 저장)"
            className="w-full text-sm focus:outline-none resize-none text-gray-700 placeholder:text-gray-300" style={{ minHeight: '200px' }} />
          <div className="text-[11px] text-gray-200 mt-2 leading-relaxed select-none pointer-events-none">
            날짜: [중간공유 6/20] · [최종보고 7/10] · [시작 6/1]<br />
            확장: [담당자 김다슬] · [유형 기획] · [상태 진행중] · [파트 코어]
          </div>
          <div className="flex justify-end mt-2">
            <button onClick={saveNote} disabled={!noteInput.trim()}
              className="text-xs bg-[#5DBD97] text-white px-4 py-1.5 rounded-lg hover:bg-[#4aab84] disabled:opacity-30 transition-colors">
              저장 (Ctrl+Enter)
            </button>
          </div>
        </div>
        {showFullscreenNew && (
          <FullscreenNoteEditor
            value={noteInput}
            onChange={setNoteInput}
            onSave={() => { saveNote(); setShowFullscreenNew(false) }}
            onClose={() => setShowFullscreenNew(false)}
            title="노트 입력"
          />
        )}
      </div>

      {/* 2분할: 왼쪽=노트목록+첨부+회고+삭제, 오른쪽=할일+회의록 */}
      <div className="flex gap-6">
        {/* 왼쪽 50% */}
        <div className="flex-[50]">
          {/* 저장된 노트 아코디언 리스트 */}
          <div className="space-y-2 mb-6">
            {notes.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-4">아직 기록된 맥락이 없습니다</p>
            ) : (
              notes.map(note => (
                <NoteAccordion key={note.id} note={note} isOpen={openNoteIds.has(note.id)}
                  onToggle={() => toggleNote(note.id)} onDelete={deleteNote} onEdit={editNote} onEditTitle={editNoteTitle} />
              ))
            )}
          </div>

          {/* 첨부파일/링크 섹션 */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">첨부파일 / 링크</h2>
            <div className="bg-white rounded-lg border border-gray-100 p-4 mb-3 space-y-2">
              <div className="flex gap-2">
                <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-gray-50 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                  📎 {uploading ? '업로드 중...' : '파일 첨부'}
                  <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>
              <div className="flex gap-2">
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                  placeholder="링크 URL" className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" />
                <input value={linkName} onChange={e => setLinkName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                  placeholder="표시 이름 (선택)" className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" />
                <button onClick={addLink} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">추가</button>
              </div>
            </div>
            <div className="space-y-1.5">
              {attachments.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-3">첨부된 파일이 없습니다</p>
              ) : (
                attachments.map(att => {
                  const ext = att.name.split('.').pop()?.toLowerCase() ?? ''
                  const icon = att.type === '링크' ? '🔗' : ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? '🖼️' : ['pdf'].includes(ext) ? '📄' : ['xlsx','xls','csv'].includes(ext) ? '📊' : ['docx','doc'].includes(ext) ? '📝' : ['pptx','ppt'].includes(ext) ? '📊' : ['zip','rar','7z'].includes(ext) ? '📦' : '📎'
                  return (
                    <div key={att.id} className="bg-white rounded-lg border border-gray-100 px-4 py-2.5 flex items-center justify-between group">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:text-blue-700 hover:underline truncate flex-1">{icon} {att.name}</a>
                      <button onClick={() => deleteAttachment(att)} className="text-xs text-gray-200 hover:text-red-400 ml-3 opacity-0 group-hover:opacity-100 transition-all">삭제</button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 완료 회고 섹션 */}
          {task.retrospective && (task.retrospective.good || task.retrospective.bad || task.retrospective.improvement) && (
            <div className="mb-6">
              <button onClick={() => setShowRetro(prev => !prev)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3 hover:text-gray-900 transition-colors">
                <span className="text-xs text-gray-400">{showRetro ? '▼' : '▶'}</span>
                완료 회고
                {!showRetro && <span className="text-xs font-normal text-gray-400">보기</span>}
              </button>
              {showRetro && (
                <div className="bg-white rounded-lg border border-gray-100 p-4 space-y-3">
                  {task.retrospective.good && (
                    <div>
                      <p className="text-xs font-semibold text-green-600 mb-1">좋았던 점</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.retrospective.good}</p>
                    </div>
                  )}
                  {task.retrospective.bad && (
                    <div>
                      <p className="text-xs font-semibold text-amber-600 mb-1">아쉬웠던 점</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.retrospective.bad}</p>
                    </div>
                  )}
                  {task.retrospective.improvement && (
                    <div>
                      <p className="text-xs font-semibold text-red-600 mb-1">개선 필요한 점</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.retrospective.improvement}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 삭제 버튼 */}
          <div className="border-t border-gray-100 pt-6">
            <button onClick={deleteTask} disabled={deleting} className="text-sm text-red-400 hover:text-red-600 transition-colors">이 업무 삭제</button>
          </div>
        </div>

        {/* 오른쪽 50%: 할일 목록 + 연관 회의록 */}
        <div className="flex-[50]">

          {/* 할일 목록 */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">할일 목록</h3>
              <input
                value={shortName}
                onChange={e => setShortName(e.target.value)}
                onBlur={e => updateShortName(e.target.value.trim())}
                onKeyDown={e => { if (e.key === 'Enter') updateShortName(shortName.trim()) }}
                placeholder="단축명"
                className="text-xs border-b border-gray-200 focus:outline-none focus:border-gray-400 text-gray-400 placeholder:text-gray-200 w-16 bg-transparent"
              />
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="flex gap-2 mb-3">
                <input
                  value={todoInput}
                  onChange={e => setTodoInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTodo() }}
                  placeholder="할일 추가 후 Enter"
                  className="flex-1 text-sm text-gray-700 focus:outline-none border-b border-gray-200 pb-1 bg-transparent placeholder:text-gray-300"
                />
              </div>
              {todos.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-2">할일을 추가하세요</p>
              ) : (
                <div className="space-y-2">
                  {todos.map(todo => (
                    <div key={todo.id} className="flex items-center gap-2 group">
                      <input type="checkbox" checked={todo.done}
                        onChange={() => toggleTodoDone(todo.id, !todo.done)}
                        className="w-3.5 h-3.5 rounded accent-emerald-500 flex-shrink-0 cursor-pointer" />
                      <span className={`text-sm flex-1 min-w-0 truncate ${todo.done ? 'line-through text-gray-300' : 'text-gray-700'}`}>
                        {shortName && (
                          <span className="text-[10px] text-gray-400 font-mono mr-1.5">{shortName}{todos.indexOf(todo) + 1}</span>
                        )}
                        {todo.title}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(['today', 'tomorrow', 'this_week'] as const).map(tag => {
                          const currentBucket = getTodoBucketFromDate(todo.target_date)
                          return (
                            <button key={tag}
                              onClick={() => updateTodoDate(todo.id, currentBucket === tag ? null : tag)}
                              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium ${
                                currentBucket === tag ? TODO_TAG_ACTIVE[tag] : 'text-gray-300 hover:text-gray-500'
                              }`}>
                              {TODO_TAG_LABELS[tag]}
                            </button>
                          )
                        })}
                        <button onClick={() => deleteTodo(todo.id)}
                          className="text-gray-200 hover:text-red-400 text-base opacity-0 group-hover:opacity-100 transition-all leading-none ml-0.5">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 연관 회의록 섹션 */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3">연관 회의록</h3>
          <div className="bg-white rounded-lg border border-gray-100 p-5">

            <div className="flex gap-2 mb-4">
              <select value={selectedMeetingId} onChange={e => setSelectedMeetingId(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white text-gray-600">
                <option value="">회의록 연결...</option>
                {allMeetings.filter(m => !linkedMeetings.some(lm => lm.id === m.id)).map(m => (
                  <option key={m.id} value={m.id}>{m.title || '(제목 없음)'}{m.meeting_date ? ` · ${m.meeting_date}` : ''}</option>
                ))}
              </select>
              <button onClick={linkMeeting} disabled={!selectedMeetingId}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg disabled:opacity-30 transition-colors">연결</button>
              <button onClick={createAndLinkMeeting}
                className="text-xs bg-[#5DBD97] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#4aab84] transition-colors whitespace-nowrap">새 회의록</button>
            </div>

            {linkedMeetings.length === 0 ? (
              <p className="text-xs text-gray-300 text-center py-6">연결된 회의록이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {linkedMeetings.map(m => {
                  const isExp = expandedMeetingIds.has(m.id)
                  return (
                    <div key={m.id} className="border border-gray-100 rounded-lg overflow-hidden group/meeting">
                      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
                        <button onClick={() => setExpandedMeetingIds(prev => { const s = new Set(prev); isExp ? s.delete(m.id) : s.add(m.id); return s })}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <span className="text-xs text-gray-400 flex-shrink-0">{isExp ? '▼' : '▶'}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-700 hover:text-gray-900 truncate">
                              {m.title || <span className="text-gray-300 italic">제목 없음</span>}
                            </p>
                            {m.meeting_date && <p className="text-xs text-gray-400">{formatDate(m.meeting_date)}</p>}
                          </div>
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <Link href={`/meetings/${m.id}`}
                            className="text-xs text-gray-300 hover:text-blue-500 opacity-0 group-hover/meeting:opacity-100 transition-all">↗</Link>
                          <button onClick={() => unlinkMeeting(m.id)}
                            className="text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover/meeting:opacity-100 transition-all">해제</button>
                        </div>
                      </div>
                      {isExp && (() => {
                        const allNotes = m.notes ?? []
                        if (allNotes.length === 0) return (
                          <p className="text-xs text-gray-300 text-center py-2.5">회의 내용 없음</p>
                        )
                        const PREVIEW = 3
                        const showAll = showAllNotesMeetingIds.has(m.id)
                        const cutoff = Math.max(0, allNotes.length - PREVIEW)
                        const olderNotes = allNotes.slice(0, cutoff)
                        const recentNotes = allNotes.slice(cutoff)

                        const renderNoteRow = (note: { title: string; content: string }, globalIdx: number) => {
                          const noteKey = `${m.id}|${globalIdx}`
                          const isNoteOpen = openMeetingNoteKeys.has(noteKey)
                          return (
                            <div key={globalIdx} className="border-t border-gray-50 first:border-t-0">
                              <button onClick={() => toggleMeetingNote(m.id, globalIdx)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/80 transition-colors">
                                <span className="text-xs text-gray-300 flex-shrink-0">{isNoteOpen ? '▼' : '▶'}</span>
                                <span className="text-xs font-medium text-gray-600 truncate flex-1">{note.title || '노트'}</span>
                                {!isNoteOpen && note.content && (
                                  <span className="text-xs text-gray-300 truncate max-w-24 flex-shrink-0">{note.content.slice(0, 20)}</span>
                                )}
                              </button>
                              {isNoteOpen && (
                                <div className="px-3 pb-3 pl-7">
                                  <MarkdownContent content={note.content} className="text-xs text-gray-600 leading-relaxed" />
                                </div>
                              )}
                            </div>
                          )
                        }

                        return (
                          <div>
                            {olderNotes.length > 0 && (
                              <button onClick={() => toggleShowAllMeetingNotes(m.id)}
                                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                {showAll ? '▲ 이전 기록 접기' : `▼ 이전 기록 ${olderNotes.length}개 더 보기`}
                              </button>
                            )}
                            {showAll && olderNotes.map((note, i) => renderNoteRow(note, i))}
                            {recentNotes.map((note, i) => renderNoteRow(note, cutoff + i))}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
