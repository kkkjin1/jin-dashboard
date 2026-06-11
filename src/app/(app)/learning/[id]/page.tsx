'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { LearningResource, NoteEntry } from '@/types'
import { generateLearningMd, downloadMd } from '@/lib/markdown'
import SmartTextarea from '@/components/SmartTextarea'

function defaultNoteTitle(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd} 정리`
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

export default function LearningDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [resource, setResource] = useState<LearningResource | null>(null)
  const [titleInput, setTitleInput] = useState('')
  const [sourceInput, setSourceInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [noteTitle, setNoteTitle] = useState(defaultNoteTitle())
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set([0]))
  const [deleting, setDeleting] = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)
  const noteAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase
      .from('learning_resources')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          const r = data as LearningResource
          setResource(r)
          setTitleInput(r.title)
          setSourceInput(r.source)
        }
      })
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

  async function updateResource(updates: Partial<LearningResource>) {
    await supabase.from('learning_resources').update(updates).eq('id', id)
    setResource(prev => prev ? { ...prev, ...updates } : prev)
  }

  async function saveNote() {
    if (!noteInput.trim() || !resource) return
    const newNote: NoteEntry = {
      title: noteTitle.trim() || defaultNoteTitle(),
      content: noteInput.trim(),
      created_at: new Date().toISOString(),
    }
    const updatedNotes = [newNote, ...resource.notes]
    await updateResource({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
    setNoteInput('')
    setNoteTitle(defaultNoteTitle())
  }

  async function deleteNote(index: number) {
    if (!resource) return
    const updatedNotes = resource.notes.filter((_, i) => i !== index)
    await updateResource({ notes: updatedNotes })
    setOpenIndexes(new Set([0]))
  }

  async function deleteResource() {
    if (!confirm('이 학습자료를 삭제하시겠습니까?')) return
    setDeleting(true)
    await supabase.from('learning_resources').delete().eq('id', id)
    router.push('/learning')
  }

  function handleDownloadMd() {
    if (!resource) return
    const md = generateLearningMd({
      title: resource.title,
      source: resource.source,
      notes: resource.notes,
    })
    downloadMd(md, resource.title)
  }

  if (!resource) return <div className="p-8 text-gray-400 text-sm animate-pulse">불러오는 중...</div>

  return (
    <div className="p-8 max-w-4xl">
      {/* 뒤로가기 + MD 다운로드 */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/learning" className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
          ← 학습자료 목록
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
              updateResource({ title: titleInput })
              noteAreaRef.current?.focus()
            }
            if (e.key === 'Escape') setTitleInput(resource.title)
          }}
          onBlur={() => { if (titleInput.trim()) updateResource({ title: titleInput }) }}
          placeholder="학습자료 제목"
          className="text-2xl font-bold text-gray-900 w-full focus:outline-none border-b-2 border-transparent focus:border-red-300 pb-1 transition-colors bg-transparent"
        />
      </div>

      {/* 출처 */}
      <div className="mb-6">
        <label className="text-xs text-gray-400 block mb-1">출처 (source)</label>
        <input
          value={sourceInput}
          onChange={e => setSourceInput(e.target.value)}
          onBlur={() => updateResource({ source: sourceInput })}
          onKeyDown={e => {
            if (e.key === 'Enter') updateResource({ source: sourceInput })
          }}
          placeholder="URL, 도서명, 강의명 등"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full max-w-md"
        />
      </div>

      {/* 노트 입력 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">내용 / 노트</h2>
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
            placeholder="학습 내용, 인사이트 등 (Ctrl+Enter 저장)"
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
          {resource.notes.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-4">아직 기록된 내용이 없습니다</p>
          ) : (
            resource.notes.map((note, idx) => (
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

      {/* 삭제 */}
      <div className="border-t border-gray-100 pt-6">
        <button
          onClick={deleteResource}
          disabled={deleting}
          className="text-sm text-red-400 hover:text-red-600 transition-colors"
        >
          이 학습자료 삭제
        </button>
      </div>
    </div>
  )
}
