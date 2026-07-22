'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { Meeting, NoteEntry, Attachment } from '@/types'
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
  '타팀': 'bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.7)] border-[rgba(255,255,255,0.09)]',
  '목표관리': 'bg-indigo-50 text-indigo-600 border-indigo-200',
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
    <div className="bg-[rgba(255,255,255,0.06)] rounded-lg border border-[rgba(255,255,255,0.06)] overflow-hidden group">
      <div
        onClick={() => { if (!editingTitle) onToggle() }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-pointer">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs text-[rgba(226,232,240,0.4)] flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
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
              className="text-sm font-medium text-[rgba(226,232,240,0.8)] focus:outline-none border-b border-blue-300 bg-transparent min-w-0 flex-1"
            />
          ) : (
            <span
              className="text-sm font-medium text-[rgba(226,232,240,0.8)] truncate cursor-text hover:text-blue-600 transition-colors"
              onClick={e => { e.stopPropagation(); setEditTitle(note.title); setEditingTitle(true) }}
            >{note.title}</span>
          )}
          {note.edited_at && !editingTitle && (
            <span className="text-xs text-[rgba(226,232,240,0.4)] flex-shrink-0 ml-1">수정됨</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isOpen && <span className="text-xs text-[rgba(226,232,240,0.3)] truncate max-w-40">{note.content.replace(/<[^>]*>/g, '').slice(0, 40)}</span>}
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
              className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all px-1.5 py-0.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100"
              title="프로젝트 업무에 추가">
              업무에 추가
            </button>
            {showItemPicker && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-xl shadow-lg z-50 overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="p-2 border-b border-[rgba(255,255,255,0.06)]">
                  <input
                    autoFocus
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    placeholder="업무 검색…"
                    className="w-full text-xs px-2 py-1.5 border border-[rgba(255,255,255,0.09)] rounded-lg focus:outline-none focus:border-blue-300"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredItems.length === 0 ? (
                    <p className="text-[10px] text-[rgba(226,232,240,0.3)] px-3 py-2">업무 없음</p>
                  ) : filteredItems.map(item => (
                    <button key={item.id}
                      onClick={() => handleAddToItem(item)}
                      disabled={addingToItem}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 disabled:opacity-50">
                      <div className="text-xs text-[rgba(226,232,240,0.8)] truncate font-medium">{item.title}</div>
                      <div className="text-[9px] text-[rgba(226,232,240,0.4)] mt-0.5">{item.groupName} · {item.category}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(note.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
            className="text-xs text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.7)] opacity-0 group-hover:opacity-100 transition-all">
            {copied ? '✓' : '복사'}
          </button>
          <button onClick={e => { e.stopPropagation(); onFullscreen(note.content) }}
            className="text-xs text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.7)] opacity-0 group-hover:opacity-100 transition-all"
            title="크게보기">⛶</button>
          <button onClick={e => { e.stopPropagation(); setEditContent(note.content); setEditing(true); if (!isOpen) onToggle() }}
            className="text-xs text-[rgba(226,232,240,0.3)] hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">수정</button>
          <button onClick={e => { e.stopPropagation(); onDelete(index) }}
            className="text-xs text-[rgba(226,232,240,0.2)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">삭제</button>
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
                dark
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
                  <button onClick={() => setEditing(false)} className="text-xs text-[rgba(226,232,240,0.4)] px-3 py-1 rounded-lg">취소</button>
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
                  className="text-xs text-[rgba(226,232,240,0.3)] hover:text-blue-500 transition-colors">수정</button>
                <button onClick={() => { setEditContent(note.content); setFullscreen(true) }}
                  className="text-xs text-[rgba(226,232,240,0.3)] hover:text-blue-500 transition-colors">⛶ 크게 편집</button>
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
  const [linkedAgendaItems, setLinkedAgendaItems] = useState<LinkedAgendaItem[]>([])
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [showSidebarSearch, setShowSidebarSearch] = useState(false)
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null)
  const [relatedJournals, setRelatedJournals] = useState<{ id: string; date: string; content: string; tags: string[]; linked: boolean }[]>([])
  const [sameCatMeetings, setSameCatMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItemOption[]>([])

  const [newNoteKey, setNewNoteKey] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const [meetingRes, agendaLinksRes, attsRes, agendaRes] = await Promise.all([
        supabase.from('meetings').select('*').eq('id', id).single(),
        supabase.from('meeting_agenda_links').select('id, agenda_item_id, agenda_items(id, title, status, agenda_groups(name, category))').eq('meeting_id', id),
        supabase.from('attachments').select('*').eq('meeting_id', id).order('created_at', { ascending: false }),
        supabase.from('agenda_items').select('id, title, status, group_id, agenda_groups(name, category)').neq('status', 'done').order('sort_order'),
      ])
      if (meetingRes.data) {
        setMeeting(meetingRes.data as Meeting)
        setTitleInput((meetingRes.data as Meeting).title)
      }
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

  async function linkAgendaItem(item: AgendaItemOption) {
    if (linkedAgendaItems.some(l => l.id === item.id)) return
    setLinkingItemId(item.id)
    const { data } = await supabase.from('meeting_agenda_links').insert({ meeting_id: id, agenda_item_id: item.id }).select('id').single()
    if (data) {
      setLinkedAgendaItems(prev => [...prev, {
        linkId: (data as { id: string }).id,
        id: item.id,
        title: item.title,
        status: '',
        groupName: item.groupName,
        category: item.category,
      }])
    }
    setLinkingItemId(null)
    setShowSidebarSearch(false)
    setSidebarSearch('')
  }

  async function unlinkAgendaItem(linkId: string) {
    await supabase.from('meeting_agenda_links').delete().eq('id', linkId)
    setLinkedAgendaItems(prev => prev.filter(l => l.linkId !== linkId))
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
    const md = generateMeetingMd({ title: meeting.title, meeting_date: meeting.meeting_date, notes: meeting.notes })
    downloadMd(md, meeting.title)
  }

  if (!meeting) return <div className="p-8 text-[rgba(226,232,240,0.4)] text-sm animate-pulse">불러오는 중...</div>

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5 pretendard-page">
      <TextSelectionCapture sourceName={meeting.title} sourceType="회의" />
      <div className="flex items-center justify-between mb-8">
        <Link href="/meetings" className="text-sm text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] inline-flex items-center gap-1">← 회의록 목록</Link>
        <button onClick={handleDownloadMd}
          className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] border border-[rgba(255,255,255,0.09)] rounded-md px-3 py-1.5 hover:bg-[rgba(255,255,255,0.06)] transition-colors">
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
          className="text-2xl font-bold text-[#E2E8F0] w-full focus:outline-none border-b-2 border-transparent focus:border-red-300 pb-1 transition-colors bg-transparent" />
      </div>

      <div className="flex gap-6">
        {/* 왼쪽: 회의 내용 */}
        <div className="flex-[55]">
          <div className="flex gap-4 items-end mb-6">
            <div>
              <label className="text-xs text-[rgba(226,232,240,0.4)] block mb-1">회의 날짜</label>
              <input type="date" value={meeting.meeting_date ?? ''}
                onChange={e => updateMeeting({ meeting_date: e.target.value || null })}
                className="text-sm border border-[rgba(255,255,255,0.09)] rounded-lg px-3 py-1.5 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-[rgba(226,232,240,0.4)] block mb-1">구분</label>
              <div className="flex gap-1.5 items-center">
                {meeting.category && (
                  <span className={`text-xs px-2.5 py-1 rounded border ${CATEGORY_COLORS[meeting.category] ?? ''}`}>
                    {meeting.category}
                  </span>
                )}
                <select value={meeting.category ?? ''}
                  onChange={e => updateMeeting({ category: e.target.value || null })}
                  className="text-sm border border-[rgba(255,255,255,0.09)] rounded-lg px-3 py-1.5 focus:outline-none bg-[rgba(255,255,255,0.06)] text-[rgba(226,232,240,0.7)] [&>option]:bg-[#26282E] [&>option]:text-[rgba(226,232,240,0.8)]">
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
                  <p className="text-sm text-[rgba(226,232,240,0.8)] leading-relaxed whitespace-pre-wrap">{n.content}</p>
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
            <h2 className="text-sm font-semibold text-[rgba(226,232,240,0.8)] mb-3">회의 내용</h2>
            <div className="bg-[rgba(255,255,255,0.06)] rounded-lg border border-[rgba(255,255,255,0.06)] p-4 mb-3">
              <input value={noteTitle} onChange={e => handleNoteTitleChange(e.target.value)}
                className="w-full text-xs font-medium text-[rgba(226,232,240,0.5)] focus:outline-none mb-2 border-b border-[rgba(255,255,255,0.06)] pb-1 bg-transparent"
                placeholder="노트 제목" />
              <TiptapEditor
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
                <p className="text-sm text-[rgba(226,232,240,0.3)] text-center py-4">아직 기록된 내용이 없습니다</p>
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
            <h2 className="text-sm font-semibold text-[rgba(226,232,240,0.8)] mb-3">첨부파일 / 링크</h2>
            <div className="bg-[rgba(255,255,255,0.06)] rounded-lg border border-[rgba(255,255,255,0.06)] p-4 mb-3 space-y-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-[rgba(255,255,255,0.03)] text-[rgba(226,232,240,0.3)]' : 'bg-[rgba(255,255,255,0.06)] hover:bg-gray-200 text-[rgba(226,232,240,0.7)]'}`}>
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
                  placeholder="링크 URL" className="flex-1 text-sm border border-[rgba(255,255,255,0.09)] rounded-lg px-3 py-1.5 focus:outline-none" />
                <input value={linkName} onChange={e => setLinkName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                  placeholder="표시 이름 (선택)" className="w-32 text-sm border border-[rgba(255,255,255,0.09)] rounded-lg px-3 py-1.5 focus:outline-none" />
                <button onClick={addLink} className="text-xs bg-[rgba(255,255,255,0.06)] hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">추가</button>
              </div>
            </div>
            <div className="space-y-1.5">
              {attachments.length === 0 ? (
                <p className="text-sm text-[rgba(226,232,240,0.3)] text-center py-3">첨부된 파일이 없습니다</p>
              ) : (
                attachments.map(att => {
                  const ext = att.name.split('.').pop()?.toLowerCase() ?? ''
                  const icon = att.type === '링크' ? '🔗' : ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? '🖼️' : ['pdf'].includes(ext) ? '📄' : ['xlsx','xls','csv'].includes(ext) ? '📊' : ['docx','doc'].includes(ext) ? '📝' : ['pptx','ppt'].includes(ext) ? '📊' : ['zip','rar','7z'].includes(ext) ? '📦' : '📎'
                  return (
                    <div key={att.id} className="bg-[rgba(255,255,255,0.06)] rounded-lg border border-[rgba(255,255,255,0.06)] px-4 py-2.5 flex items-center justify-between group">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:text-blue-700 hover:underline truncate flex-1">{icon} {att.name}</a>
                      <button onClick={() => deleteAttachment(att)} className="text-xs text-[rgba(226,232,240,0.2)] hover:text-red-400 ml-3 opacity-0 group-hover:opacity-100 transition-all">삭제</button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
            <button onClick={deleteMeeting} disabled={deleting}
              className="text-sm text-red-400 hover:text-red-600 transition-colors">
              이 회의록 삭제
            </button>
          </div>
        </div>

        {/* 오른쪽: 연관 프로젝트 업무 */}
        <div className="flex-[45]">
          <div className="bg-[rgba(255,255,255,0.06)] rounded-lg border border-[rgba(255,255,255,0.06)] p-5 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wide">연관 업무</h3>
              <button
                onClick={() => { setShowSidebarSearch(p => !p); setSidebarSearch('') }}
                className="text-xs text-[#5DBD97] hover:text-[#4aab84] transition-colors">
                {showSidebarSearch ? '닫기' : '+ 업무 연결'}
              </button>
            </div>

            {showSidebarSearch && (
              <div className="mb-4">
                <input
                  autoFocus
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  placeholder="업무명 또는 범주 검색..."
                  className="w-full text-xs border border-[rgba(255,255,255,0.09)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5DBD97] mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {agendaItems
                    .filter(i =>
                      !linkedAgendaItems.some(l => l.id === i.id) &&
                      (!sidebarSearch.trim() || i.title.includes(sidebarSearch) || i.groupName.includes(sidebarSearch))
                    )
                    .map(item => (
                      <button
                        key={item.id}
                        onClick={() => linkAgendaItem(item)}
                        disabled={linkingItemId === item.id}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[rgba(255,255,255,0.03)] transition-colors group flex items-center gap-2 disabled:opacity-50">
                        <span className="text-[10px] text-[rgba(226,232,240,0.4)] flex-shrink-0 truncate max-w-[70px]">{item.groupName}</span>
                        <span className="text-xs text-[rgba(226,232,240,0.8)] truncate flex-1">{item.title}</span>
                        <span className="text-[10px] text-[#5DBD97] opacity-0 group-hover:opacity-100 flex-shrink-0">연결</span>
                      </button>
                    ))}
                  {agendaItems.filter(i =>
                    !linkedAgendaItems.some(l => l.id === i.id) &&
                    (!sidebarSearch.trim() || i.title.includes(sidebarSearch) || i.groupName.includes(sidebarSearch))
                  ).length === 0 && (
                    <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-3">검색 결과 없음</p>
                  )}
                </div>
              </div>
            )}

            {linkedAgendaItems.length === 0 ? (
              <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-6">
                연결된 프로젝트 업무가 없습니다<br/>
                <span className="text-[10px]">노트의 &apos;업무에 추가&apos; 또는 &apos;업무 연결&apos;로 연동하세요</span>
              </p>
            ) : (
              <div className="space-y-1.5">
                {linkedAgendaItems.map(item => (
                  <div key={item.linkId} className="border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 flex items-center gap-2 group hover:border-[rgba(255,255,255,0.09)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[rgba(226,232,240,0.4)] truncate">{item.groupName}</p>
                      <p className="text-xs text-[rgba(226,232,240,0.8)] truncate font-medium">{item.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/project/items/${item.id}`}
                        className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-blue-500 transition-colors">
                        열기
                      </Link>
                      <button onClick={() => unlinkAgendaItem(item.linkId)}
                        className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-red-400 transition-colors">
                        해제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sameCatMeetings.length > 0 && (
              <div className="mt-6 pt-5 border-t border-[rgba(255,255,255,0.06)]">
                <h3 className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wide mb-3">
                  {meeting?.category} 이전 회의
                </h3>
                <div className="space-y-1">
                  {sameCatMeetings.map(m => (
                    <Link key={m.id} href={`/meetings/${m.id}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.03)] transition-colors group">
                      <span className="text-[10px] text-[rgba(226,232,240,0.4)] flex-shrink-0 w-12">
                        {m.meeting_date ? format(parseISO(m.meeting_date), 'M.d') : '—'}
                      </span>
                      <span className="text-xs text-[rgba(226,232,240,0.7)] group-hover:text-[#E2E8F0] truncate flex-1 transition-colors">
                        {m.title || '제목 없음'}
                      </span>
                      <span className="text-[10px] text-[rgba(226,232,240,0.3)] group-hover:text-[rgba(226,232,240,0.5)] flex-shrink-0">↗</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 pt-5 border-t border-[rgba(255,255,255,0.06)]">
              <h3 className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wide mb-3">관련 회고</h3>
              {!meeting?.meeting_date ? (
                <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-4">회의 날짜를 설정하면<br/>전후 회고가 자동으로 연결돼요</p>
              ) : relatedJournals.length === 0 ? (
                <p className="text-xs text-[rgba(226,232,240,0.3)] text-center py-4">이 회의 전후 작성된<br/>회고가 없어요</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {relatedJournals.map(j => {
                      const d = new Date(j.date + 'T00:00:00')
                      const label = `${d.getMonth()+1}/${d.getDate()}`
                      return (
                        <div key={j.id} className="bg-[rgba(255,255,255,0.03)] rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <p className="text-[10px] font-medium text-[rgba(226,232,240,0.4)]">{label}</p>
                            {j.linked
                              ? <span className="text-[9px] bg-blue-50 text-blue-500 border border-blue-200 px-1 rounded">@ 직접연결</span>
                              : <span className="text-[9px] text-[rgba(226,232,240,0.3)]">±2일</span>
                            }
                          </div>
                          <p className="text-xs text-[rgba(226,232,240,0.7)] leading-relaxed line-clamp-3">{j.content}</p>
                          {j.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {j.tags.map(t => <span key={t} className="text-[9px] text-[rgba(226,232,240,0.4)]">#{t}</span>)}
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
          <div className="bg-[rgba(255,255,255,0.06)] rounded-2xl p-8 max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <p className="text-xs text-[rgba(226,232,240,0.4)]">크게보기 모드 (클릭하면 닫힘)</p>
              <button onClick={() => setShowFullscreen(false)} className="text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] text-xl">×</button>
            </div>
            <MarkdownContent content={fullscreenContent} className="text-lg text-[rgba(226,232,240,0.9)] leading-relaxed" />
          </div>
        </div>
      )}
    </div>
  )
}
