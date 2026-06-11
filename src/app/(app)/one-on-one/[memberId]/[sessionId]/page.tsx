'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { OneOnOne, Member, NoteEntry } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import SmartTextarea from '@/components/SmartTextarea'

function defaultNoteTitle(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd} 기록`
}

interface NoteAccordionProps {
  note: NoteEntry; index: number; isOpen: boolean
  onToggle: () => void; onDelete: (i: number) => void
}

function NoteAccordion({ note, index, isOpen, onToggle, onDelete }: NoteAccordionProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden group">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-700 truncate">{note.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isOpen && <span className="text-xs text-gray-300 truncate max-w-40">{note.content.slice(0, 40)}</span>}
          <button onClick={e => { e.stopPropagation(); onDelete(index) }}
            className="text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-colors">
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

export default function OneOnOneSessionPage() {
  const { memberId, sessionId } = useParams<{ memberId: string; sessionId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<OneOnOne | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [noteTitle, setNoteTitle] = useState(defaultNoteTitle())
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set([0]))
  const [deleting, setDeleting] = useState(false)

  const noteAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('one_on_ones').select('*').eq('id', sessionId).single(),
      supabase.from('members').select('*').eq('id', memberId).single(),
    ]).then(([{ data: s }, { data: m }]) => {
      if (s) setSession(s as OneOnOne)
      if (m) setMember(m as Member)
    })
  }, [sessionId, memberId])

  function toggleNote(index: number) {
    setOpenIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })
  }

  async function updateSession(updates: Partial<OneOnOne>) {
    await supabase.from('one_on_ones').update(updates).eq('id', sessionId)
    setSession(prev => prev ? { ...prev, ...updates } : prev)
  }

  async function saveNote() {
    if (!noteInput.trim() || !session) return
    const newNote: NoteEntry = {
      title: noteTitle.trim() || defaultNoteTitle(),
      content: noteInput.trim(),
      created_at: new Date().toISOString(),
    }
    const updatedNotes = [newNote, ...session.notes]
    await updateSession({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
  }

  async function deleteNote(index: number) {
    if (!session) return
    const updatedNotes = session.notes.filter((_, i) => i !== index)
    await updateSession({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
  }

  async function deleteSession() {
    if (!confirm('이 1on1 기록을 삭제하시겠습니까?')) return
    setDeleting(true)
    await supabase.from('one_on_ones').delete().eq('id', sessionId)
    router.push(`/one-on-one/${memberId}`)
  }

  function handleDownload() {
    if (!session || !member) return
    const lines = [
      `# 1on1: ${member.name}`,
      `날짜: ${session.session_date ?? '미지정'}`,
      '',
      ...session.notes.flatMap(n => [`## ${n.title}`, '', n.content, '']),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `1on1_${member.name}_${session.session_date ?? 'undated'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!session || !member) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <Link href={`/one-on-one/${memberId}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← {member.name} 1on1 목록
        </Link>
        <button onClick={handleDownload}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors">
          MD 다운로드
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-medium">
          {member.name[0]}
        </div>
        <div>
          <p className="font-bold text-gray-900">{member.name} 1on1</p>
          <div className="flex items-center gap-2 mt-0.5">
            <input type="date" value={session.session_date ?? ''}
              onChange={e => updateSession({ session_date: e.target.value || null })}
              className="text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none" />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">기록</h2>
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
          <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
            className="w-full text-xs font-medium text-gray-500 focus:outline-none mb-2 border-b border-gray-100 pb-1 bg-transparent"
            placeholder="노트 제목" />
          <SmartTextarea ref={noteAreaRef} value={noteInput} onChange={setNoteInput}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote() }}
            placeholder="1on1 내용 입력 (Ctrl+Enter 저장)"
            className="w-full text-sm focus:outline-none resize-none text-gray-700 placeholder:text-gray-300"
            style={{ minHeight: '180px' }} />
          <div className="flex justify-end mt-2">
            <button onClick={saveNote} disabled={!noteInput.trim()}
              className="text-xs bg-gray-800 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-30 transition-colors">
              저장 (Ctrl+Enter)
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {session.notes.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-4">아직 기록이 없습니다</p>
          ) : (
            session.notes.map((note, idx) => (
              <NoteAccordion key={`${note.created_at}-${idx}`} note={note} index={idx}
                isOpen={openIndexes.has(idx)} onToggle={() => toggleNote(idx)} onDelete={deleteNote} />
            ))
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <button onClick={deleteSession} disabled={deleting}
          className="text-sm text-red-400 hover:text-red-600 transition-colors">
          이 기록 삭제
        </button>
      </div>
    </div>
  )
}
