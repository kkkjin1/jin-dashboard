'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Meeting, NoteEntry, Task, TaskStatus } from '@/types'
import { generateMeetingMd, downloadMd } from '@/lib/markdown'
import SmartTextarea from '@/components/SmartTextarea'

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

interface NoteAccordionProps {
  note: NoteEntry
  index: number
  isOpen: boolean
  onToggle: () => void
  onDelete: (index: number) => void
}

function NoteAccordion({ note, index, isOpen, onToggle, onDelete }: NoteAccordionProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden group">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-700 truncate">{note.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isOpen && (
            <span className="text-xs text-gray-300 truncate max-w-40">
              {note.content.slice(0, 40)}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete(index) }}
            className="text-xs text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
          >
            삭제
          </button>
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-50">
          <p className="text-sm text-gray-700 whitespace-pre-wrap pt-3">{note.content}</p>
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

  // 업무 연동
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([])
  const [allTasks, setAllTasks] = useState<Pick<Task, 'id' | 'title' | 'status' | 'part'>[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')

  const titleRef = useRef<HTMLInputElement>(null)
  const noteAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function load() {
      const [meetingRes, linksRes, tasksRes] = await Promise.all([
        supabase.from('meetings').select('*').eq('id', id).single(),
        supabase.from('task_meeting_links').select('task_id, tasks(*, members(id, name, part))').eq('meeting_id', id),
        supabase.from('tasks').select('id, title, status, part').order('created_at', { ascending: false }),
      ])
      if (meetingRes.data) {
        setMeeting(meetingRes.data as Meeting)
        setTitleInput((meetingRes.data as Meeting).title)
      }
      if (linksRes.data) setLinkedTasks((linksRes.data as any[]).map(l => l.tasks).filter(Boolean) as Task[])
      if (tasksRes.data) setAllTasks(tasksRes.data as Pick<Task, 'id' | 'title' | 'status' | 'part'>[])
    }
    load()
    setTimeout(() => titleRef.current?.focus(), 100)
  }, [id])

  function toggleNote(index: number) {
    setOpenIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function updateMeeting(updates: Partial<Meeting>) {
    await supabase.from('meetings').update(updates).eq('id', id)
    setMeeting(prev => prev ? { ...prev, ...updates } : prev)
  }

  async function saveNote() {
    if (!noteInput.trim() || !meeting) return
    const newNote: NoteEntry = {
      title: noteTitle.trim() || defaultNoteTitle(),
      content: noteInput.trim(),
      created_at: new Date().toISOString(),
    }
    const updatedNotes = [newNote, ...meeting.notes]
    await updateMeeting({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
  }

  async function deleteNote(index: number) {
    if (!meeting) return
    const updatedNotes = meeting.notes.filter((_, i) => i !== index)
    await updateMeeting({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
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

  async function createAndLinkTask() {
    const { data } = await supabase
      .from('tasks')
      .insert({ title: '', part: '코어', type: '기획', status: '진행필요' })
      .select('id')
      .single()
    if (data) {
      const newId = (data as { id: string }).id
      await supabase.from('task_meeting_links').insert({ task_id: newId, meeting_id: id })
      router.push(`/tasks/${newId}`)
    }
  }

  function handleDownloadMd() {
    if (!meeting) return
    const md = generateMeetingMd({
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      notes: meeting.notes,
    })
    downloadMd(md, meeting.title)
  }

  if (!meeting) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  return (
    <div className="p-8 max-w-4xl">
      {/* 뒤로가기 + MD 다운로드 */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/meetings" className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
          ← 회의록 목록
        </Link>
        <button
          onClick={handleDownloadMd}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
        >
          MD 다운로드
        </button>
      </div>

      {/* 제목 */}
      <div className="mb-4 mt-1">
        <input
          ref={titleRef}
          value={titleInput}
          onChange={e => setTitleInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              updateMeeting({ title: titleInput })
              noteAreaRef.current?.focus()
            }
            if (e.key === 'Escape') setTitleInput(meeting.title)
          }}
          onBlur={() => { if (titleInput.trim()) updateMeeting({ title: titleInput }) }}
          placeholder="회의 제목"
          className="text-2xl font-bold text-gray-900 w-full focus:outline-none border-b-2 border-transparent focus:border-red-300 pb-1 transition-colors bg-transparent"
        />
      </div>

      {/* 회의 날짜 */}
      <div className="mb-6">
        <label className="text-xs text-gray-400 block mb-1">회의 날짜</label>
        <input
          type="date"
          value={meeting.meeting_date ?? ''}
          onChange={e => updateMeeting({ meeting_date: e.target.value || null })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
        />
      </div>

      {/* 노트 입력 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">회의 내용</h2>
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
          <input
            value={noteTitle}
            onChange={e => setNoteTitle(e.target.value)}
            className="w-full text-xs font-medium text-gray-500 focus:outline-none mb-2 border-b border-gray-100 pb-1 bg-transparent"
            placeholder="노트 제목"
          />
          <SmartTextarea
            ref={noteAreaRef}
            value={noteInput}
            onChange={setNoteInput}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote()
            }}
            placeholder="회의 내용 입력 (Ctrl+Enter 저장)"
            className="w-full text-sm focus:outline-none resize-none text-gray-700 placeholder:text-gray-300"
            style={{ minHeight: '200px' }}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={saveNote}
              disabled={!noteInput.trim()}
              className="text-xs bg-gray-800 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-30 transition-colors"
            >
              저장 (Ctrl+Enter)
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {meeting.notes.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-4">아직 기록된 내용이 없습니다</p>
          ) : (
            meeting.notes.map((note, idx) => (
              <NoteAccordion
                key={`${note.created_at}-${idx}`}
                note={note}
                index={idx}
                isOpen={openIndexes.has(idx)}
                onToggle={() => toggleNote(idx)}
                onDelete={deleteNote}
              />
            ))
          )}
        </div>
      </div>

      {/* 연관 업무 */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">연관 업무</h2>
        <div className="space-y-1.5 mb-3">
          {linkedTasks.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-3">연결된 업무가 없습니다</p>
          ) : (
            linkedTasks.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center justify-between group">
                <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[t.status]}`}>
                    {t.status}
                  </span>
                  <span className="text-sm text-gray-700 hover:text-gray-900 truncate">
                    {t.title || <span className="text-gray-300 italic">제목 없음</span>}
                  </span>
                  <span className="text-xs text-gray-300 flex-shrink-0">{t.part}파트</span>
                </Link>
                <button
                  onClick={() => unlinkTask(t.id)}
                  className="text-xs text-gray-200 hover:text-red-400 ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                >
                  연결 해제
                </button>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={selectedTaskId}
            onChange={e => setSelectedTaskId(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white text-gray-600"
          >
            <option value="">기존 업무 연결...</option>
            {allTasks
              .filter(t => !linkedTasks.some(lt => lt.id === t.id))
              .map(t => (
                <option key={t.id} value={t.id}>
                  {t.title || '(제목 없음)'} · {t.part}파트 · {t.status}
                </option>
              ))}
          </select>
          <button
            onClick={linkTask}
            disabled={!selectedTaskId}
            className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-30 transition-colors"
          >
            연결
          </button>
          <button
            onClick={createAndLinkTask}
            className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            새 업무
          </button>
        </div>
      </div>

      {/* 삭제 */}
      <div className="border-t border-gray-100 pt-6">
        <button
          onClick={deleteMeeting}
          disabled={deleting}
          className="text-sm text-red-400 hover:text-red-600 transition-colors"
        >
          이 회의록 삭제
        </button>
      </div>
    </div>
  )
}
