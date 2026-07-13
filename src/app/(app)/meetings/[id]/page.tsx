'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { Meeting, NoteEntry, Task, TaskStatus, Note, Attachment } from '@/types'
import { generateMeetingMd, downloadMd } from '@/lib/markdown'
import dynamic from 'next/dynamic'
import MarkdownContent from '@/components/MarkdownContent'
import TextSelectionCapture from '@/components/TextSelectionCapture'
const FullscreenNoteEditor = dynamic(() => import('@/components/FullscreenNoteEditor'), { ssr: false })
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

const CATEGORIES = ['코어', '비즈', '경영진', '본부장', '타팀', '목표관리'] as const
const CATEGORY_COLORS: Record<string, string> = {
  '코어': 'bg-[#EFF6FF] text-[#10B981] border-[#10B981]/20',
  '비즈': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '경영진': 'bg-red-50 text-red-700 border-red-200',
  '본부장': 'bg-purple-50 text-purple-700 border-purple-200',
  '타팀': 'bg-gray-100 text-gray-600 border-gray-200',
  '목표관리': 'bg-indigo-50 text-indigo-600 border-indigo-200',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-100 text-gray-600',
  '진행중': 'bg-blue-50 text-blue-600',
  '완료': 'bg-green-50 text-green-600',
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

interface NoteAccordionProps {
  note: NoteEntry
  index: number
  isOpen: boolean
  onToggle: () => void
  onDelete: (index: number) => void
  onEdit: (index: number, newContent: string, newTitle?: string) => void
  onFullscreen: (content: string) => void
  agendaItems: AgendaItemOption[]
  onAddToItem: (itemId: string, noteContent: string, noteTitle: string) => Promise<void>
}

function NoteAccordion({ note, index, isOpen, onToggle, onDelete, onEdit, onFullscreen, agendaItems, onAddToItem }: NoteAccordionProps) {
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
        onEdit(index, html)
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      }
    }, 1500)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden group">
      <div
        onClick={() => { if (!editingTitle) onToggle() }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs text-gray-400 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
          {editingTitle ? (
            <input
              autoFocus
              value={editTitle}
              onClick={e => e.stopPropagation()}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={e => {
                const val = e.target.value.trim()
                setEditingTitle(false)
                onEdit(index, note.content, val || note.title)
              }}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') { e.currentTarget.blur() }
                if (e.key === 'Escape') { setEditTitle(note.title); setEditingTitle(false) }
              }}
              className="text-sm font-medium text-gray-700 focus:outline-none border-b border-blue-300 bg-transparent min-w-0 flex-1"
            />
          ) : (
            <span
              className="text-sm font-medium text-gray-700 truncate cursor-text hover:text-blue-600 transition-colors"
              onClick={e => { e.stopPropagation(); setEditTitle(note.title); setEditingTitle(true) }}
            >{note.title}</span>
          )}
          {note.edited_at && !editingTitle && (
            <span className="text-xs text-gray-400 flex-shrink-0 ml-1">수정됨</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isOpen && <span className="text-xs text-gray-300 truncate max-w-40">{note.content.replace(/<[^>]*>/g, '').slice(0, 40)}</span>}
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
              className="text-[10px] text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all px-1.5 py-0.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100"
              title="프로젝트 업무에 추가">
              업무에 추가
            </button>
            {showItemPicker && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    placeholder="업무 검색…"
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-300"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredItems.length === 0 ? (
                    <p className="text-[10px] text-gray-300 px-3 py-2">업무 없음</p>
                  ) : filteredItems.map(item => (
                    <button key={item.id}
                      onClick={() => handleAddToItem(item)}
                      disabled={addingToItem}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 disabled:opacity-50">
                      <div className="text-xs text-gray-700 truncate font-medium">{item.title}</div>
                      <div className="text-[9px] text-gray-400 mt-0.5">{item.groupName} · {item.category}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(note.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
            className="text-xs text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all">
            {copied ? '✓' : '복사'}
          </button>
          <button onClick={e => { e.stopPropagation(); onFullscreen(note.content) }}
            className="text-xs text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all"
            title="크게보기">⛶</button>
          <button onClick={e => { e.stopPropagation(); setEditContent(note.content); setEditing(true); if (!isOpen) onToggle() }}
            className="text-xs text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">수정</button>
          <button onClick={e => { e.stopPropagation(); onDelete(index) }}
            className="text-xs text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">삭제</button>
        </div>
      </div>
      {fullscreen && (
        <FullscreenNoteEditor
          value={editContent}
          onChange={handleChange}
          onSave={() => { onEdit(index, editContent); setEditing(false) }}
          onClose={() => { setFullscreen(false); setTiptapKey(k => k + 1) }}
          title={note.title}
        />
      )}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-50">
          {editing ? (
            <>
              <TiptapEditor
                key={tiptapKey}
                value={editContent}
                onChange={handleChange}
                onSubmit={() => { onEdit(index, editContent); setEditing(false) }}
                onEscape={() => setEditing(false)}
                onExpand={() => setFullscreen(true)}
                autoFocus
                minHeight={160}
              />
              <div className="flex items-center justify-between mt-3">
                <span className={`text-xs transition-opacity ${autoSaved ? 'text-emerald-500 opacity-100' : 'opacity-0'}`}>자동저장됨</span>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="text-xs text-gray-400 px-3 py-1 rounded-lg">취소</button>
                  <button onClick={() => { onEdit(index, editContent); setEditing(false) }}
                    className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1 rounded-lg">저장</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <MarkdownContent content={note.content} className="pt-3" />
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => { setEditContent(note.content); setEditing(true) }}
                  className="text-xs text-gray-300 hover:text-blue-500 transition-colors">수정</button>
                <button onClick={() => { setEditContent(note.content); setFullscreen(true) }}
                  className="text-xs text-gray-300 hover:text-blue-500 transition-colors">⛶ 크게 편집</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface LinkedTaskCardProps {
  task: Task
  onUnlink: (id: string) => void
}

function LinkedTaskCard({ task, onUnlink }: LinkedTaskCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  const supabase = createClient()

  async function handleExpand() {
    if (!expanded && !loaded) {
      const { data } = await supabase.from('notes').select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      setNotes((data ?? []) as Note[])
      setLoaded(true)
    }
    setExpanded(prev => !prev)
  }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden group/task">
      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
        <button onClick={handleExpand} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <span className="text-xs text-gray-400 flex-shrink-0">{expanded ? '▼' : '▶'}</span>
          <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${STATUS_COLORS[task.status]}`}>{task.status}</span>
          <span className="text-sm text-gray-700 hover:text-gray-900 truncate">
            {task.title || <span className="text-gray-300 italic">제목 없음</span>}
          </span>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <Link href={`/tasks/${task.id}`}
            className="text-xs text-gray-300 hover:text-blue-500 opacity-0 group-hover/task:opacity-100 transition-all">
            열기
          </Link>
          <button onClick={() => onUnlink(task.id)}
            className="text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover/task:opacity-100 transition-all">
            해제
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-gray-400">{task.part}파트</span>
            {task.type && <span className="text-xs text-gray-400">· {task.type}</span>}
          </div>
          {!loaded ? (
            <div className="px-3 pb-3 text-xs text-gray-300 animate-pulse">불러오는 중...</div>
          ) : notes.length === 0 ? (
            <div className="px-3 pb-3 text-xs text-gray-300">기록된 노트 없음</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {notes.map(note => (
                <div key={note.id} className="px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-1">{note.created_at.slice(0, 10)}</p>
                  <MarkdownContent content={note.content} className="text-xs text-gray-600" />
                </div>
              ))}
            </div>
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

  const [meeting, setMeeting] = useState<Meeting | null>(null)
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
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([])
  const [allTasks, setAllTasks] = useState<Pick<Task, 'id' | 'title' | 'status' | 'part'>[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [relatedJournals, setRelatedJournals] = useState<{ id: string; date: string; content: string; tags: string[]; linked: boolean }[]>([])
  const [sameCatMeetings, setSameCatMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItemOption[]>([])

  const [newNoteKey, setNewNoteKey] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const [meetingRes, linksRes, tasksRes, attsRes, agendaRes] = await Promise.all([
        supabase.from('meetings').select('*').eq('id', id).single(),
        supabase.from('task_meeting_links').select('task_id, tasks(*, members(id, name, part))').eq('meeting_id', id),
        supabase.from('tasks').select('id, title, status, part').order('created_at', { ascending: false }),
        supabase.from('attachments').select('*').eq('meeting_id', id).order('created_at', { ascending: false }),
        supabase.from('agenda_items').select('id, title, status, group_id, agenda_groups(name, category)').neq('status', 'done').order('sort_order'),
      ])
      if (meetingRes.data) {
        setMeeting(meetingRes.data as Meeting)
        setTitleInput((meetingRes.data as Meeting).title)
      }
      if (linksRes.data) setLinkedTasks((linksRes.data as any[]).map(l => l.tasks).filter(Boolean) as Task[])
      if (tasksRes.data) setAllTasks(tasksRes.data as Pick<Task, 'id' | 'title' | 'status' | 'part'>[])
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
      // Restore draft if present
      const draft = localStorage.getItem(`meeting_draft_${id}`)
      const draftTitle = localStorage.getItem(`meeting_draft_title_${id}`)
      if (draft) setNoteInput(draft)
      if (draftTitle) setNoteTitle(draftTitle)
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
  }

  function handleNoteInputChange(val: string) {
    setNoteInput(val)
    localStorage.setItem(`meeting_draft_${id}`, val)
  }

  function handleNoteTitleChange(val: string) {
    setNoteTitle(val)
    localStorage.setItem(`meeting_draft_title_${id}`, val)
  }

  useEffect(() => {
    async function loadJournals() {
      const seen = new Set<string>()
      const result: { id: string; date: string; content: string; tags: string[]; linked: boolean }[] = []

      // @ 직접 연결된 회고 (날짜 무관)
      const { data: linked } = await supabase
        .from('daily_journals')
        .select('id, date, content, tags')
        .contains('linked_meeting_ids', [id])
      ;(linked ?? []).forEach(j => {
        if (seen.has(j.id)) return
        seen.add(j.id)
        result.push({ ...j, tags: j.tags ?? [], linked: true })
      })

      // 날짜 ±2일 자동 연결
      if (meeting?.meeting_date) {
        const base = new Date(meeting.meeting_date + 'T00:00:00')
        const dates: string[] = []
        for (let i = -2; i <= 2; i++) {
          const d = new Date(base)
          d.setDate(d.getDate() + i)
          dates.push([d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'))
        }
        const { data: byDate } = await supabase
          .from('daily_journals')
          .select('id, date, content, tags')
          .in('date', dates)
        ;(byDate ?? []).forEach(j => {
          if (seen.has(j.id)) return
          seen.add(j.id)
          result.push({ ...j, tags: j.tags ?? [], linked: false })
        })
      }

      result.sort((a, b) => b.date.localeCompare(a.date))
      setRelatedJournals(result)
    }
    loadJournals()
  }, [meeting?.meeting_date, id])

  useEffect(() => {
    if (!meeting?.category) return
    supabase.from('meetings')
      .select('id, title, meeting_date')
      .eq('category', meeting.category)
      .neq('id', id)
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .limit(15)
      .then(({ data }) => setSameCatMeetings((data ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]))
  }, [meeting?.category, id])

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowFullscreen(false)
    }
    if (showFullscreen) {
      window.addEventListener('keydown', onEsc)
      return () => window.removeEventListener('keydown', onEsc)
    }
  }, [showFullscreen])

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

  async function saveNote() {
    if (!noteInput.replace(/<[^>]*>/g, '').trim() || !meeting) return
    const newNote: NoteEntry = {
      title: noteTitle.trim() || defaultNoteTitle(),
      content: noteInput,
      created_at: new Date().toISOString(),
    }
    const updatedNotes = [newNote, ...meeting.notes]
    await updateMeeting({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
    setNewNoteKey(k => k + 1)
    localStorage.removeItem(`meeting_draft_${id}`)
    localStorage.removeItem(`meeting_draft_title_${id}`)
  }

  async function deleteNote(index: number) {
    if (!meeting) return
    const updatedNotes = meeting.notes.filter((_, i) => i !== index)
    await updateMeeting({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
  }

  async function editNote(index: number, newContent: string, newTitle?: string) {
    if (!meeting) return
    const existing = meeting.notes[index]
    if (!existing) return
    const safeContent = newContent.trim() || existing.content
    if (!safeContent) return
    const updatedNotes = meeting.notes.map((n, i) =>
      i === index ? { ...n, content: safeContent, ...(newTitle ? { title: newTitle } : {}), edited_at: new Date().toISOString() } : n
    )
    await updateMeeting({ notes: updatedNotes })
  }

  async function deleteMeeting() {
    if (!confirm('이 회의록을 삭제하시겠습니까?')) return
    setDeleting(true)
    await supabase.from('meetings').delete().eq('id', id)
    router.push('/meetings')
  }

  async function linkTask() {
    if (!selectedTaskId) return
    await supabase.from('task_meeting_links').insert({ task_id: selectedTaskId, meeting_id: id })
    const found = allTasks.find(t => t.id === selectedTaskId)
    if (found) setLinkedTasks(prev => [...prev, found as Task])
    setSelectedTaskId('')
  }

  async function unlinkTask(taskId: string) {
    await supabase.from('task_meeting_links').delete().eq('task_id', taskId).eq('meeting_id', id)
    setLinkedTasks(prev => prev.filter(t => t.id !== taskId))
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

  async function createAndLinkTask() {
    const { data } = await supabase.from('tasks')
      .insert({ title: '', part: '코어', type: '기획', status: '진행필요' })
      .select('id').single()
    if (data) {
      const newId = (data as { id: string }).id
      await supabase.from('task_meeting_links').insert({ task_id: newId, meeting_id: id })
      router.push(`/tasks/${newId}`)
    }
  }

  function handleDownloadMd() {
    if (!meeting) return
    const md = generateMeetingMd({ title: meeting.title, meeting_date: meeting.meeting_date, notes: meeting.notes })
    downloadMd(md, meeting.title)
  }

  if (!meeting) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5 pretendard-page">
      <TextSelectionCapture sourceName={meeting.title} sourceType="회의" />
      <div className="flex items-center justify-between mb-8">
        <Link href="/meetings" className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">← 회의록 목록</Link>
        <button onClick={handleDownloadMd}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-white transition-colors">
          MD 다운로드
        </button>
      </div>

      <div className="mb-4 mt-1">
        <input ref={titleRef} value={titleInput} onChange={e => setTitleInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { updateMeeting({ title: titleInput }) }
            if (e.key === 'Escape') setTitleInput(meeting.title)
          }}
          onBlur={() => { if (titleInput.trim()) updateMeeting({ title: titleInput }) }}
          placeholder="회의 제목"
          className="text-2xl font-bold text-gray-900 w-full focus:outline-none border-b-2 border-transparent focus:border-red-300 pb-1 transition-colors bg-transparent" />
      </div>

      <div className="flex gap-6">
        {/* 왼쪽: 회의 내용 */}
        <div className="flex-[55]">
          <div className="flex gap-4 items-end mb-6">
            <div>
              <label className="text-xs text-gray-400 block mb-1">회의 날짜</label>
              <input type="date" value={meeting.meeting_date ?? ''}
                onChange={e => updateMeeting({ meeting_date: e.target.value || null })}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">구분</label>
              <div className="flex gap-1.5 items-center">
                {meeting.category && (
                  <span className={`text-xs px-2.5 py-1 rounded border ${CATEGORY_COLORS[meeting.category] ?? ''}`}>
                    {meeting.category}
                  </span>
                )}
                <select value={meeting.category ?? ''}
                  onChange={e => updateMeeting({ category: e.target.value || null })}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white text-gray-600">
                  <option value="">구분 없음</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 📌 사전 메모 (홈탭에서 연동된 경우) */}
          {meeting.notes.some(n => n.is_prep) && (
            <div className="mb-4 bg-amber-50 border border-amber-200/60 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-amber-700 mb-2">📌 사전 메모</p>
              {meeting.notes.filter(n => n.is_prep).map((n, i) => (
                <div key={i}>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                  {n.edited_at && (
                    <p className="text-[10px] text-amber-500/70 mt-1">
                      수정: {new Date(n.edited_at).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">회의 내용</h2>
            <div className="bg-white rounded-lg border border-gray-100 p-4 mb-3">
              <input value={noteTitle} onChange={e => handleNoteTitleChange(e.target.value)}
                className="w-full text-xs font-medium text-gray-500 focus:outline-none mb-2 border-b border-gray-100 pb-1 bg-transparent"
                placeholder="노트 제목" />
              <TiptapEditor
                key={newNoteKey}
                value={noteInput}
                onChange={handleNoteInputChange}
                onSubmit={saveNote}
                onExpand={() => setShowFullscreenNew(true)}
                minHeight={200}
              />
              <div className="flex justify-end mt-2">
                <button onClick={saveNote} disabled={!noteInput.replace(/<[^>]*>/g, '').trim()}
                  className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-4 py-1.5 rounded-md hover:bg-[#D5E6F7] disabled:opacity-30 transition-colors">
                  저장 (Ctrl+Enter)
                </button>
              </div>
            </div>
            {showFullscreenNew && (
              <FullscreenNoteEditor
                value={noteInput}
                onChange={handleNoteInputChange}
                onSave={() => { saveNote(); setShowFullscreenNew(false) }}
                onClose={() => setShowFullscreenNew(false)}
                title="회의 내용 입력"
              />
            )}

            <div className="space-y-2">
              {meeting.notes.filter(n => !n.is_prep).length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-4">아직 기록된 내용이 없습니다</p>
              ) : (
                meeting.notes.map((note, idx) => note.is_prep ? null : (
                  <NoteAccordion key={`${note.created_at}-${idx}`} note={note} index={idx}
                    isOpen={openIndexes.has(idx)} onToggle={() => toggleNote(idx)} onDelete={deleteNote}
                    onEdit={editNote} onFullscreen={(content) => { setFullscreenContent(content); setShowFullscreen(true) }}
                    agendaItems={agendaItems} onAddToItem={addNoteToItem} />
                ))
              )}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">첨부파일 / 링크</h2>
            <div className="bg-white rounded-lg border border-gray-100 p-4 mb-3 space-y-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-gray-50 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
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

          <div className="border-t border-gray-100 pt-6">
            <button onClick={deleteMeeting} disabled={deleting}
              className="text-sm text-red-400 hover:text-red-600 transition-colors">
              이 회의록 삭제
            </button>
          </div>
        </div>

        {/* 오른쪽: 연관 업무 (확장 가능) */}
        <div className="flex-[45]">
          <div className="bg-white rounded-lg border border-gray-100 p-5 sticky top-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">연관 업무</h3>

            <div className="flex gap-2 mb-4">
              <select value={selectedTaskId} onChange={e => setSelectedTaskId(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white text-gray-600">
                <option value="">기존 업무 연결...</option>
                {allTasks.filter(t => !linkedTasks.some(lt => lt.id === t.id)).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title || '(제목 없음)'} · {t.part} · {t.status}
                  </option>
                ))}
              </select>
              <button onClick={linkTask} disabled={!selectedTaskId}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg disabled:opacity-30 transition-colors">연결</button>
              <button onClick={createAndLinkTask}
                className="text-xs bg-[#5DBD97] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#4aab84] transition-colors whitespace-nowrap">새 업무</button>
            </div>

            {linkedTasks.length === 0 ? (
              <p className="text-xs text-gray-300 text-center py-6">연결된 업무가 없습니다</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 mb-1">▶ 클릭하면 노트가 펼쳐집니다</p>
                {linkedTasks.map(t => (
                  <LinkedTaskCard key={t.id} task={t} onUnlink={unlinkTask} />
                ))}
              </div>
            )}

            {sameCatMeetings.length > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  {meeting?.category} 이전 회의
                </h3>
                <div className="space-y-1">
                  {sameCatMeetings.map(m => (
                    <Link key={m.id} href={`/meetings/${m.id}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors group">
                      <span className="text-[10px] text-gray-400 flex-shrink-0 w-12">
                        {m.meeting_date ? format(parseISO(m.meeting_date), 'M.d') : '—'}
                      </span>
                      <span className="text-xs text-gray-600 group-hover:text-gray-900 truncate flex-1 transition-colors">
                        {m.title || '제목 없음'}
                      </span>
                      <span className="text-[10px] text-gray-300 group-hover:text-gray-500 flex-shrink-0">↗</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 pt-5 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">관련 회고</h3>
              {!meeting?.meeting_date ? (
                <p className="text-xs text-gray-300 text-center py-4">회의 날짜를 설정하면<br/>전후 회고가 자동으로 연결돼요</p>
              ) : relatedJournals.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-4">이 회의 전후 작성된<br/>회고가 없어요</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {relatedJournals.map(j => {
                      const d = new Date(j.date + 'T00:00:00')
                      const label = `${d.getMonth()+1}/${d.getDate()}`
                      return (
                        <div key={j.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <p className="text-[10px] font-medium text-gray-400">{label}</p>
                            {j.linked
                              ? <span className="text-[9px] bg-blue-50 text-blue-500 border border-blue-200 px-1 rounded">@ 직접연결</span>
                              : <span className="text-[9px] text-gray-300">±2일</span>
                            }
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{j.content}</p>
                          {j.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {j.tags.map(t => <span key={t} className="text-[9px] text-gray-400">#{t}</span>)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-start justify-center p-8 overflow-auto"
          onClick={() => setShowFullscreen(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <p className="text-xs text-gray-400">크게보기 모드 (클릭하면 닫힘)</p>
              <button onClick={() => setShowFullscreen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <MarkdownContent content={fullscreenContent} className="text-lg text-gray-800 leading-relaxed" />
          </div>
        </div>
      )}
    </div>
  )
}
