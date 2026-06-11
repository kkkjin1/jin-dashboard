'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchMembers, parseTags, formatDate } from '@/lib/tasks'
import type { Task, Member, Note, Attachment, TaskStatus, Part, TaskType } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { generateTaskMd, downloadMd } from '@/lib/markdown'

const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']
const STATUS_COLORS: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-100 text-gray-600',
  '진행중': 'bg-blue-50 text-blue-600',
  '완료': 'bg-green-50 text-green-600',
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 right-20 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
      ✓ {message}
    </div>
  )
}

// 날짜 기반 노트 제목 생성 (예: "260611 논의")
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
}

function NoteAccordion({ note, isOpen, onToggle, onDelete }: NoteAccordionProps) {
  const dateLabel = (() => {
    try {
      return format(parseISO(note.created_at), 'M월 d일 HH:mm', { locale: ko })
    } catch {
      return ''
    }
  })()

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden group">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-700 truncate">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-300 truncate max-w-40">
            {!isOpen && note.content.slice(0, 40)}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(note.id) }}
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
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [toast, setToast] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set())

  const titleRef = useRef<HTMLInputElement>(null)
  const noteAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function load() {
      const [{ data: t }, ms, { data: n }, { data: a }] = await Promise.all([
        supabase.from('tasks').select('*, members(id, name, part)').eq('id', id).single(),
        fetchMembers(),
        supabase.from('notes').select('*').eq('task_id', id).order('created_at', { ascending: false }),
        supabase.from('attachments').select('*').eq('task_id', id).order('created_at', { ascending: false }),
      ])
      if (t) { setTask(t as Task); setTitleInput((t as Task).title) }
      setMembers(ms)
      const noteList = (n ?? []) as Note[]
      setNotes(noteList)
      // 최신 1개만 펼침
      if (noteList.length > 0) {
        setOpenNoteIds(new Set([noteList[0].id]))
      }
    }
    load()
    // 제목 자동 포커스
    setTimeout(() => titleRef.current?.focus(), 100)
  }, [id])

  function toggleNote(noteId: string) {
    setOpenNoteIds(prev => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  async function updateTask(updates: Partial<Task>) {
    await supabase.from('tasks').update(updates).eq('id', id)
    setTask(prev => prev ? { ...prev, ...updates } : prev)
  }

  async function saveNote() {
    if (!noteInput.trim()) return
    const parsed = parseTags(noteInput)

    // assignee_name → assignee_id 조회
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

    const { data } = await supabase.from('notes').insert({ task_id: id, content: noteInput }).select().single()
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

    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
  }

  async function deleteNote(noteId: string) {
    await supabase.from('notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  async function addLink() {
    if (!linkUrl.trim()) return
    const name = linkName.trim() || linkUrl
    const { data } = await supabase.from('attachments')
      .insert({ task_id: id, name, type: '링크', url: linkUrl })
      .select().single()
    if (data) setAttachments(prev => [data as Attachment, ...prev])
    setLinkUrl(''); setLinkName('')
  }

  async function deleteAttachment(attId: string) {
    await supabase.from('attachments').delete().eq('id', attId)
    setAttachments(prev => prev.filter(a => a.id !== attId))
  }

  async function deleteTask() {
    if (!confirm('이 업무를 삭제하시겠습니까? 되돌릴 수 없습니다.')) return
    setDeleting(true)
    await supabase.from('tasks').delete().eq('id', id)
    router.push('/tasks')
  }

  function handleDownloadMd() {
    if (!task) return
    const member = members.find(m => m.id === task.assignee_id)
    const md = generateTaskMd({
      title: task.title,
      status: task.status,
      assignee: member?.name,
      part: task.part,
      type: task.type,
      start_date: task.start_date,
      mid_date: task.mid_date,
      end_date: task.end_date,
      notes: notes.map(n => ({
        title: format(parseISO(n.created_at), 'yyMMdd 논의', { locale: ko }),
        content: n.content,
        created_at: n.created_at,
      })),
      attachments: attachments.map(a => ({ name: a.name, url: a.url })),
    })
    downloadMd(md, task.title)
  }

  if (!task) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  const member = members.find(m => m.id === task.assignee_id)

  return (
    <div className="p-8 max-w-6xl">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {/* 뒤로가기 + MD 다운로드 */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/tasks" className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
          ← 업무 목록
        </Link>
        <button
          onClick={handleDownloadMd}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
        >
          MD 다운로드
        </button>
      </div>

      {/* 제목 - 항상 편집 가능, autoFocus */}
      <div className="mb-6 mt-1">
        <input
          ref={titleRef}
          value={titleInput}
          onChange={e => setTitleInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              updateTask({ title: titleInput })
              noteAreaRef.current?.focus()
            }
            if (e.key === 'Escape') setTitleInput(task.title)
          }}
          onBlur={() => { if (titleInput.trim()) updateTask({ title: titleInput }) }}
          placeholder="업무 제목"
          className="text-2xl font-bold text-gray-900 w-full focus:outline-none border-b-2 border-transparent focus:border-red-300 pb-1 transition-colors bg-transparent"
        />
      </div>

      {/* 2컬럼 레이아웃 */}
      <div className="flex gap-6">
        {/* 왼쪽 65%: 노트 + 첨부 */}
        <div className="flex-[65]">
          {/* 맥락/노트 */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">맥락 / 노트</h2>
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
              {/* 노트 제목 (날짜 기반, 수정 가능) */}
              <input
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
                className="w-full text-xs font-medium text-gray-500 focus:outline-none mb-2 border-b border-gray-100 pb-1 bg-transparent"
                placeholder="노트 제목"
              />
              <textarea
                ref={noteAreaRef}
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote()
                }}
                placeholder={`노트 입력 (Ctrl+Enter 저장)\n\n날짜 태그: [중간공유 6/20] [최종보고 7/10] [시작 6/1]\n확장 태그: [담당자 김다슬] [유형 기획] [상태 진행중] [파트 코어]`}
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

            {/* 노트 토글 목록 */}
            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-4">아직 기록된 맥락이 없습니다</p>
              ) : (
                notes.map(note => (
                  <NoteAccordion
                    key={note.id}
                    note={note}
                    isOpen={openNoteIds.has(note.id)}
                    onToggle={() => toggleNote(note.id)}
                    onDelete={deleteNote}
                  />
                ))
              )}
            </div>
          </div>

          {/* 첨부파일 / 링크 */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">첨부파일 / 링크</h2>
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3 flex gap-2">
              <input
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                placeholder="링크 URL"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
              />
              <input
                value={linkName}
                onChange={e => setLinkName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                placeholder="표시 이름 (선택)"
                className="w-36 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
              />
              <button
                onClick={addLink}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                추가
              </button>
            </div>
            <div className="space-y-1.5">
              {attachments.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-3">첨부된 파일이 없습니다</p>
              ) : (
                attachments.map(att => (
                  <div key={att.id} className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center justify-between group">
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:text-blue-700 hover:underline truncate flex-1">
                      🔗 {att.name}
                    </a>
                    <button
                      onClick={() => deleteAttachment(att.id)}
                      className="text-xs text-gray-200 hover:text-red-400 ml-3 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 삭제 */}
          <div className="border-t border-gray-100 pt-6">
            <button
              onClick={deleteTask}
              disabled={deleting}
              className="text-sm text-red-400 hover:text-red-600 transition-colors"
            >
              이 업무 삭제
            </button>
          </div>
        </div>

        {/* 오른쪽 35%: 메타 사이드바 */}
        <div className="flex-[35]">
          <div className="bg-white rounded-xl border border-gray-100 p-5 sticky top-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">업무 정보</h3>
            <div className="space-y-4">
              {/* 상태 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">상태</label>
                <select
                  value={task.status}
                  onChange={e => updateTask({ status: e.target.value as TaskStatus })}
                  className={`text-sm px-3 py-1.5 rounded-lg font-medium border-0 cursor-pointer focus:outline-none w-full ${STATUS_COLORS[task.status]}`}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* 담당자 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">담당자</label>
                <select
                  value={task.assignee_id ?? ''}
                  onChange={e => updateTask({ assignee_id: e.target.value || null })}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full bg-white"
                >
                  <option value="">담당자 없음</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.part})</option>)}
                </select>
              </div>

              {/* 파트 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">파트</label>
                <select
                  value={task.part}
                  onChange={e => updateTask({ part: e.target.value as Part })}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full bg-white"
                >
                  <option value="코어">코어</option>
                  <option value="비즈">비즈</option>
                </select>
              </div>

              {/* 유형 */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">유형</label>
                <select
                  value={task.type}
                  onChange={e => updateTask({ type: e.target.value as TaskType })}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full bg-white"
                >
                  <option value="기획">기획</option>
                  <option value="개선">개선</option>
                  <option value="운영">운영</option>
                </select>
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-3">
                {/* 시작일 */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    시작일
                    <span className="text-gray-300 ml-1">[시작 MM/DD]</span>
                  </label>
                  <input
                    type="date"
                    value={task.start_date ?? ''}
                    onChange={e => updateTask({ start_date: e.target.value || null })}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full"
                  />
                </div>

                {/* 중간공유일 */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    중간공유일
                    <span className="text-gray-300 ml-1">[중간공유 MM/DD]</span>
                  </label>
                  <input
                    type="date"
                    value={task.mid_date ?? ''}
                    onChange={e => updateTask({ mid_date: e.target.value || null })}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full"
                  />
                </div>

                {/* 최종보고일 */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    최종보고일
                    <span className="text-gray-300 ml-1">[최종보고 MM/DD]</span>
                  </label>
                  <input
                    type="date"
                    value={task.end_date ?? ''}
                    onChange={e => updateTask({ end_date: e.target.value || null })}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
