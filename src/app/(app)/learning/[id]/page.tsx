'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import type { LearningResource, NoteEntry } from '@/types'
import { generateLearningMd, downloadMd } from '@/lib/markdown'
import SmartTextarea from '@/components/SmartTextarea'
import FormattingToolbar from '@/components/FormattingToolbar'

const T1 = 'rgba(226,232,240,0.9)'
const T2 = 'rgba(226,232,240,0.5)'
const T3 = 'rgba(226,232,240,0.28)'
const CARD = 'bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)]'
const INPUT_CLS = 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[rgba(255,255,255,0.22)] transition-colors'

export default function LearningDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [resource, setResource] = useState<LearningResource | null>(null)
  const [titleInput, setTitleInput] = useState('')
  const [sourceInput, setSourceInput] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteSummary, setNoteSummary] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [deleting, setDeleting] = useState(false)

  const { value: customTags } = useUserSetting<string[]>(
    'learning_custom_tags',
    ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']
  )
  const MEDIA_TYPES = ['책', '영상', '아티클', '강의', '기타']
  const MEDIA_ICONS: Record<string, string> = {
    '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌',
  }

  const titleRef = useRef<HTMLInputElement>(null)
  const noteAreaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // refs hold latest values so the timer callback always writes correct data
  const pendingContent = useRef('')
  const pendingSummary = useRef('')
  const otherNotes = useRef<NoteEntry[]>([])
  const note0Meta = useRef({ title: '', created_at: '' })

  useEffect(() => {
    supabase.from('learning_resources').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return
        const r = data as LearningResource
        setResource(r)
        setTitleInput(r.title)
        setSourceInput(r.source ?? '')
        const n0 = r.notes[0]
        const c = n0?.content ?? ''
        const s = n0?.summary ?? ''
        setNoteContent(c)
        setNoteSummary(s)
        pendingContent.current = c
        pendingSummary.current = s
        otherNotes.current = r.notes.slice(1)
        note0Meta.current = {
          title: n0?.title ?? '',
          created_at: n0?.created_at ?? new Date().toISOString(),
        }
      })
    setTimeout(() => titleRef.current?.focus(), 100)
  }, [id])

  async function flushNoteSave() {
    const newNote: NoteEntry = {
      title: note0Meta.current.title,
      summary: pendingSummary.current,
      content: pendingContent.current,
      created_at: note0Meta.current.created_at,
      edited_at: new Date().toISOString(),
    }
    const updatedNotes = [newNote, ...otherNotes.current]
    await supabase.from('learning_resources').update({ notes: updatedNotes }).eq('id', id)
    setResource(prev => prev ? { ...prev, notes: updatedNotes } : prev)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  function scheduleNoteSave() {
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushNoteSave, 1200)
  }

  function handleContentChange(val: string) {
    setNoteContent(val)
    pendingContent.current = val
    scheduleNoteSave()
  }

  function handleSummaryBlur() {
    pendingSummary.current = noteSummary
    scheduleNoteSave()
  }

  async function updateResource(updates: Partial<LearningResource>) {
    await supabase.from('learning_resources').update(updates).eq('id', id)
    setResource(prev => prev ? { ...prev, ...updates } : prev)
  }

  function toggleTag(tag: string) {
    if (!resource) return
    const tags = resource.tags ?? []
    updateResource({ tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] })
  }

  async function deleteResource() {
    if (!confirm('이 학습자료를 삭제하시겠습니까?')) return
    setDeleting(true)
    await supabase.from('learning_resources').delete().eq('id', id)
    router.push('/learning')
  }

  function handleDownloadMd() {
    if (!resource) return
    downloadMd(generateLearningMd({ title: resource.title, source: resource.source, notes: resource.notes }), resource.title)
  }

  if (!resource) return <div className="p-8 text-sm animate-pulse" style={{ color: T3 }}>불러오는 중...</div>

  return (
    <div className="h-full overflow-y-auto px-5 py-4">

      {/* 상단 바 */}
      <div className="flex items-center justify-between mb-5">
        <Link href="/learning" className="text-sm inline-flex items-center gap-1" style={{ color: T2 }}>
          ← 학습자료 목록
        </Link>
        <div className="flex items-center gap-3">
          {saveStatus !== 'idle' && (
            <span className="text-[11px]" style={{ color: saveStatus === 'saved' ? 'rgba(52,211,153,0.7)' : T3 }}>
              {saveStatus === 'saving' ? '저장 중...' : '저장됨 ✓'}
            </span>
          )}
          <button onClick={handleDownloadMd}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ color: T2, borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.05)' }}>
            MD 다운로드
          </button>
        </div>
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
          onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.2)' }}
          onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; if (titleInput.trim()) updateResource({ title: titleInput }) }}
          placeholder="학습자료 제목"
          className="text-2xl font-bold w-full focus:outline-none border-b-2 pb-1 bg-transparent transition-colors"
          style={{ color: T1, borderBottomColor: 'transparent' }}
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
              style={{ color: T1 }}
            />
            {sourceInput.startsWith('http') && (
              <a href={sourceInput} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border"
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

        {/* 범주 */}
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

      {/* 내용 / 노트 — 단일 편집 영역 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: T1 }}>내용 / 노트</h2>
        <div className={`${CARD} rounded-xl p-4`}>
          {/* 핵심문구 */}
          <input
            value={noteSummary}
            onChange={e => setNoteSummary(e.target.value)}
            onBlur={handleSummaryBlur}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                pendingSummary.current = noteSummary
                scheduleNoteSave()
                noteAreaRef.current?.focus()
              }
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.2)' }}
            placeholder="핵심문구 1문장"
            className="w-full text-[13px] font-medium bg-transparent border-b focus:outline-none pb-2 mb-4 transition-colors"
            style={{ color: 'rgba(226,232,240,0.75)', borderBottomColor: 'rgba(255,255,255,0.09)' }}
          />
          {/* 서식 도구 */}
          <FormattingToolbar textareaRef={noteAreaRef} value={noteContent} onChange={handleContentChange} />
          {/* 본문 */}
          <SmartTextarea
            ref={noteAreaRef}
            value={noteContent}
            onChange={handleContentChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                if (saveTimer.current) clearTimeout(saveTimer.current)
                flushNoteSave()
              }
            }}
            placeholder="학습 내용, 인사이트 등... (Ctrl+Enter 즉시 저장)"
            className="w-full text-sm focus:outline-none resize-none bg-transparent"
            style={{ minHeight: '260px', color: T1 }}
          />
        </div>
      </div>

      {/* 삭제 */}
      <div className="border-t pt-6" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <button
          onClick={deleteResource}
          disabled={deleting}
          className="text-sm transition-colors"
          style={{ color: 'rgba(248,113,113,0.55)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.9)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.55)')}>
          이 학습자료 삭제
        </button>
      </div>
    </div>
  )
}
