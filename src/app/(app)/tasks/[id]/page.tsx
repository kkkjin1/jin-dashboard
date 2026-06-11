'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchMembers, parseDateTags, formatDate } from '@/lib/tasks'
import type { Task, Member, Note, Attachment, TaskStatus, Part, TaskType } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

const STATUSES: TaskStatus[] = ['진행필요', '진행중', '완료']
const STATUS_COLORS: Record<TaskStatus, string> = {
  '진행필요': 'bg-gray-100 text-gray-600',
  '진행중': 'bg-blue-50 text-blue-600',
  '완료': 'bg-green-50 text-green-600',
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 right-6 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 animate-in">
      ✓ {message}
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
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [toast, setToast] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

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
      setNotes((n ?? []) as Note[])
      setAttachments((a ?? []) as Attachment[])
    }
    load()
  }, [id])

  async function updateTask(updates: Partial<Task>) {
    await supabase.from('tasks').update(updates).eq('id', id)
    setTask(prev => prev ? { ...prev, ...updates } : prev)
  }

  async function saveNote() {
    if (!noteInput.trim()) return
    const parsed = parseDateTags(noteInput)
    const { data } = await supabase.from('notes').insert({ task_id: id, content: noteInput }).select().single()
    if (data) setNotes(prev => [data as Note, ...prev])
    if (Object.keys(parsed).length > 0) {
      await updateTask(parsed)
      const labels = []
      if (parsed.mid_date) labels.push(`중간공유일 ${formatDate(parsed.mid_date)}`)
      if (parsed.end_date) labels.push(`최종보고일 ${formatDate(parsed.end_date)}`)
      if (parsed.start_date) labels.push(`시작일 ${formatDate(parsed.start_date)}`)
      setToast(`${labels.join(', ')}로 설정되었습니다`)
    }
    setNoteInput('')
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

  if (!task) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  const member = members.find(m => m.id === task.assignee_id)

  return (
    <div className="p-8 max-w-3xl">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {/* 뒤로가기 */}
      <Link href="/tasks" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-flex items-center gap-1">
        ← 업무 목록
      </Link>

      {/* 제목 */}
      <div className="mb-6 mt-3">
        {editingTitle ? (
          <input
            ref={titleRef}
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { updateTask({ title: titleInput }); setEditingTitle(false) }
              if (e.key === 'Escape') { setTitleInput(task.title); setEditingTitle(false) }
            }}
            onBlur={() => { updateTask({ title: titleInput }); setEditingTitle(false) }}
            autoFocus
            className="text-2xl font-bold text-gray-900 w-full focus:outline-none border-b-2 border-red-400 pb-1"
          />
        ) : (
          <h1
            className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-gray-700"
            onClick={() => setEditingTitle(true)}
          >
            {task.title}
          </h1>
        )}
      </div>

      {/* 메타 필드 */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">상태</label>
          <select
            value={task.status}
            onChange={e => updateTask({ status: e.target.value as TaskStatus })}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium border-0 cursor-pointer focus:outline-none ${STATUS_COLORS[task.status]}`}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
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
        <div>
          <label className="text-xs text-gray-400 block mb-1">파트</label>
          <select
            value={task.part}
            onChange={e => updateTask({ part: e.target.value as Part })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white"
          >
            <option value="코어">코어</option>
            <option value="비즈">비즈</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">유형</label>
          <select
            value={task.type}
            onChange={e => updateTask({ type: e.target.value as TaskType })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white"
          >
            <option value="기획">기획</option>
            <option value="개선">개선</option>
            <option value="운영">운영</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">시작일 <span className="text-gray-300">[시작 MM/DD] 태그 사용 가능</span></label>
          <input
            type="date"
            value={task.start_date ?? ''}
            onChange={e => updateTask({ start_date: e.target.value || null })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">중간공유일 <span className="text-gray-300">[중간공유 MM/DD]</span></label>
          <input
            type="date"
            value={task.mid_date ?? ''}
            onChange={e => updateTask({ mid_date: e.target.value || null })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">최종보고일 <span className="text-gray-300">[최종보고 MM/DD]</span></label>
          <input
            type="date"
            value={task.end_date ?? ''}
            onChange={e => updateTask({ end_date: e.target.value || null })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
          />
        </div>
      </div>

      {/* 맥락/노트 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">맥락 / 노트</h2>
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote()
            }}
            placeholder={`노트 입력 (Ctrl+Enter 저장)\n\n날짜 태그 예시:\n[중간공유 6/20] → 중간공유일 자동 설정\n[최종보고 7/10] → 최종보고일 자동 설정\n[시작 6/1] → 시작일 자동 설정`}
            rows={5}
            className="w-full text-sm focus:outline-none resize-none text-gray-700 placeholder:text-gray-300"
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
          {notes.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-4">아직 기록된 맥락이 없습니다</p>
          ) : (
            notes.map(note => (
              <div key={note.id} className="bg-white rounded-xl border border-gray-100 p-4 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-300 mb-1.5">
                      {format(parseISO(note.created_at), 'M월 d일 HH:mm', { locale: ko })}
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  </div>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-xs text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    삭제
                  </button>
                </div>
              </div>
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
  )
}
