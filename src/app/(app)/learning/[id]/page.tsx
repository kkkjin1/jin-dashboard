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

const T1 = 'rgba(226,232,240,0.9)'
const T2 = 'rgba(226,232,240,0.5)'
const T3 = 'rgba(226,232,240,0.28)'
const CARD = 'bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)]'
const INPUT_CLS = 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[rgba(255,255,255,0.22)] transition-colors text-[rgba(226,232,240,0.85)]'

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
  onEditSummary: (index: number, summary: string) => void
}

function NoteAccordion({ note, index, isOpen, onToggle, onDelete, onEditTitle, onEditSummary }: NoteAccordionProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(note.title)
  const [editSummary, setEditSummary] = useState(note.summary ?? '')

  function handleSaveTitle() {
    onEditTitle(index, editTitle.trim() || note.title)
    setEditingTitle(false)
  }

  return (
    <div className={`${CARD} rounded-xl overflow-hidden group`}>
      {/* 아코디언 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-pointer"
        onClick={onToggle}>
        <span className="text-[10px] flex-shrink-0" style={{ color: T3 }}>{isOpen ? '▼' : '▶'}</span>
        <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
          {editingTitle ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setEditTitle(note.title); setEditingTitle(false) } }}
              className="text-sm font-medium bg-transparent border-b border-[rgba(255,255,255,0.2)] focus:outline-none w-full"
              style={{ color: T1 }}
            />
          ) : (
            <span
              className="text-sm font-medium truncate block hover:opacity-70 cursor-text"
              style={{ color: T1 }}
              onClick={() => { setEditingTitle(true); setEditTitle(note.title) }}>
              {note.title}
            </span>
          )}
        </div>
        {!isOpen && (
          <span className="text-[11px] truncate max-w-48 flex-shrink-0" style={{ color: T3 }}>
            {note.summary || note.content.slice(0, 50)}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete(index) }}
          className="text-[11px] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex-shrink-0 hover:text-red-400"
          style={{ color: T3 }}>
          삭제
        </button>
      </div>

      {/* 펼쳐진 본문 */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-[rgba(255,255,255,0.06)]">
          {/* 핵심문구 */}
          <div className="mt-3 mb-3">
            <input
              value={editSummary}
              onChange={e => setEditSummary(e.target.value)}
              onBlur={() => onEditSummary(index, editSummary)}
              onKeyDown={e => { if (e.key === 'Enter') onEditSummary(index, editSummary) }}
              placeholder="핵심문구 1문장 (목록에서 미리보기로 표시)"
              className="w-full text-[12px] bg-transparent border-b border-[rgba(255,255,255,0.08)] focus:border-[rgba(255,255,255,0.2)] focus:outline-none pb-1.5 transition-colors"
              style={{ color: 'rgba(226,232,240,0.6)' }}
            />
          </div>
          <MarkdownContent content={note.content} className="pt-1" />
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
  const MEDIA_ICONS: Record<string, string> = { '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌' }

  const titleRef = useRef<HTMLInputElement>(null)
  const noteAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.from('learning_resources').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          const r = data as LearningResource
          setResource(r); setTitleInput(r.title); setSourceInput(r.source)
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
      if (next.has(index)) next.delete(index); else next.add(index)
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
    setNoteInput(''); setNoteTitle(defaultNoteTitle())
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

  async function editNoteSummary(index: number, summary: string) {
    if (!resource) return
    const updatedNotes = resource.notes.map((n, i) => i === index ? { ...n, summary } : n)
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
    const md = generateLearningMd({ title: resource.title, source: resource.source, notes: resource.notes })
    downloadMd(md, resource.title)
  }

  if (!resource) return (
    <div className="p-8 text-sm animate-pulse" style={{ color: T3 }}>불러오는 중...</div>
  )

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      {/* 상단 바 */}
      <div className="flex items-center justify-between mb-5">
        <Link href="/learning"
          className="text-sm inline-flex items-center gap-1 transition-colors"
          style={{ color: T2 }}
          onMouseEnter={e => (e.currentTarget.style.color = T1)}
          onMouseLeave={e => (e.currentTarget.style.color = T2)}>
          ← 학습자료 목록
        </Link>
        <button
          onClick={handleDownloadMd}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
          style={{ color: T2, borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.05)' }}>
          MD 다운로드
        </button>
      </div>

      {/* 제목 */}
      <div className="mb-5">
        <input
          ref={titleRef}
          value={titleInput}
          onChange={e => setTitleInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { updateResource({ title: titleInput }); noteAreaRef.current?.focus() }
            if (e.key === 'Escape') setTitleInput(resource.title)
          }}
          onBlur={() => { if (titleInput.trim()) updateResource({ title: titleInput }) }}
          placeholder="학습자료 제목"
          className="text-2xl font-bold w-full focus:outline-none border-b-2 border-transparent pb-1 bg-transparent transition-colors"
          style={{ color: T1, borderBottomColor: 'transparent' }}
          onFocus={e => (e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.2)')}
        />
      </div>

      {/* 메타 정보 */}
      <div className="mb-6 space-y-4">
        {/* 출처 */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: T3, letterSpacing: '.04em' }}>출처</label>
          <div className="flex items-center gap-2 max-w-lg">
            <input
              value={sourceInput}
              onChange={e => setSourceInput(e.target.value)}
              onBlur={() => updateResource({ source: sourceInput })}
              onKeyDown={e => { if (e.key === 'Enter') updateResource({ source: sourceInput }) }}
              placeholder="URL, 도서명, 강의명 등"
              className={`${INPUT_CLS} text-sm flex-1`}
            />
            {sourceInput.startsWith('http') && (
              <a href={sourceInput} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.05)', color: T2 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            )}
          </div>
        </div>

        {/* 매체 */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: T3, letterSpacing: '.04em' }}>매체</label>
          <div className="flex gap-1.5 flex-wrap">
            {MEDIA_TYPES.map(type => (
              <button key={type}
                onClick={() => updateResource({ media_type: resource.media_type === type ? null : type })}
                className="text-xs px-3 py-1 rounded-full border transition-all"
                style={resource.media_type === type
                  ? { background: '#1B3A6B', color: '#E8F0FB', borderColor: '#2A5A9B' }
                  : { background: 'rgba(255,255,255,0.05)', color: T2, borderColor: 'rgba(255,255,255,0.09)' }}>
                {MEDIA_ICONS[type]} {type}
              </button>
            ))}
          </div>
        </div>

        {/* 태그 */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: T3, letterSpacing: '.04em' }}>범주</label>
          <div className="flex gap-1.5 flex-wrap">
            {customTags.map(tag => (
              <button key={tag}
                onClick={() => toggleTag(tag)}
                className="text-xs px-3 py-1 rounded-full border transition-all"
                style={(resource.tags ?? []).includes(tag)
                  ? { background: '#1B3A6B', color: '#E8F0FB', borderColor: '#2A5A9B' }
                  : { background: 'rgba(255,255,255,0.05)', color: T2, borderColor: 'rgba(255,255,255,0.09)' }}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 노트 입력 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: T1 }}>내용 / 노트</h2>
        <div className={`${CARD} rounded-xl p-4 mb-3`}>
          <input
            value={noteTitle}
            onChange={e => setNoteTitle(e.target.value)}
            className="w-full text-xs font-medium focus:outline-none mb-2 border-b pb-1 bg-transparent transition-colors"
            style={{ color: T2, borderBottomColor: 'rgba(255,255,255,0.08)' }}
            placeholder="노트 제목"
          />
          <FormattingToolbar textareaRef={noteAreaRef} value={noteInput} onChange={setNoteInput} />
          <SmartTextarea
            ref={noteAreaRef}
            value={noteInput}
            onChange={setNoteInput}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote() }}
            placeholder="학습 내용, 인사이트 등 (Ctrl+Enter 저장)"
            className="w-full text-sm focus:outline-none resize-none bg-transparent"
            style={{ minHeight: '180px', color: T1 }}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={saveNote}
              disabled={!noteInput.trim()}
              className="text-xs px-4 py-1.5 rounded-lg transition-colors disabled:opacity-30"
              style={{ background: '#1B3A6B', color: '#E8F0FB', border: '1px solid #2A5A9B' }}>
              저장 (Ctrl+Enter)
            </button>
          </div>
        </div>

        {/* 노트 목록 */}
        <div className="space-y-2">
          {resource.notes.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: T3 }}>아직 기록된 내용이 없습니다</p>
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
                onEditSummary={editNoteSummary}
              />
            ))
          )}
        </div>
      </div>

      {/* 삭제 */}
      <div className="border-t pt-6" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <button
          onClick={deleteResource}
          disabled={deleting}
          className="text-sm transition-colors"
          style={{ color: 'rgba(248,113,113,0.6)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.9)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.6)')}>
          이 학습자료 삭제
        </button>
      </div>
    </div>
  )
}
