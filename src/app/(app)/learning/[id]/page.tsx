'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import type { LearningResource, NoteEntry } from '@/types'
import { generateLearningMd, downloadMd } from '@/lib/markdown'
import SmartTextarea from '@/components/SmartTextarea'
import MarkdownContent from '@/components/MarkdownContent'
import FormattingToolbar from '@/components/FormattingToolbar'

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
  onEditTitle: (index: number, newTitle: string) => void
}

function NoteAccordion({ note, index, isOpen, onToggle, onDelete, onEditTitle }: NoteAccordionProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(note.title)

  function handleSaveTitle() {
    onEditTitle(index, editTitle.trim() || note.title)
    setEditingTitle(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden group">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
          <span className="text-xs text-gray-400 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
          {editingTitle ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setEditTitle(note.title); setEditingTitle(false) } }}
              onClick={e => e.stopPropagation()}
              className="text-sm font-medium text-gray-700 focus:outline-none border-b border-gray-300 bg-transparent flex-1"
            />
          ) : (
            <span
              className="text-sm font-medium text-gray-700 truncate hover:text-blue-500 cursor-text"
              onClick={e => { e.stopPropagation(); setEditingTitle(true); setEditTitle(note.title) }}
              title="클릭하여 제목 수정">
              {note.title}
            </span>
          )}
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
      </div>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-50">
          <MarkdownContent content={note.content} className="pt-3" />
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
  const { value: customTags } = useUserSetting<string[]>('learning_custom_tags', ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획'])

  const MEDIA_TYPES = ['책', '영상', '아티클', '강의', '기타']

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

  function toggleTag(tag: string) {
    if (!resource) return
    const tags = resource.tags ?? []
    const updated = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    updateResource({ tags: updated })
  }

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

  async function editNoteTitle(index: number, newTitle: string) {
    if (!resource) return
    const updatedNotes = resource.notes.map((n, i) => i === index ? { ...n, title: newTitle } : n)
    await updateResource({ notes: updatedNotes })
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

      {/* 메타 정보: 출처 + 태그 + 매체 */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">출처 (source)</label>
          <input
            value={sourceInput}
            onChange={e => setSourceInput(e.target.value)}
            onBlur={() => updateResource({ source: sourceInput })}
            onKeyDown={e => { if (e.key === 'Enter') updateResource({ source: sourceInput }) }}
            placeholder="URL, 도서명, 강의명 등"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none w-full max-w-md"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">매체 구분</label>
          <div className="flex gap-1.5 flex-wrap">
            {MEDIA_TYPES.map(type => (
              <button key={type} onClick={() => updateResource({ media_type: resource?.media_type === type ? null : type })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${resource?.media_type === type ? 'bg-[#5DBD97] text-white border-[#5DBD97]' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                {type}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">태그</label>
          <div className="flex gap-1.5 flex-wrap">
            {customTags.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${(resource?.tags ?? []).includes(tag) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>
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
          <FormattingToolbar textareaRef={noteAreaRef} value={noteInput} onChange={setNoteInput} />
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
              className="text-xs bg-[#5DBD97] text-white px-4 py-1.5 rounded-lg hover:bg-[#4aab84] disabled:opacity-30 transition-colors"
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
                onEditTitle={editNoteTitle}
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
