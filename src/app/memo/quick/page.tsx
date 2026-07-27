'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MemoTag } from '@/types'

const TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어', '공지']

const TAG_COLORS: Record<MemoTag, string> = {
  '업무관련': 'bg-[rgba(79,141,255,0.15)] text-[#4F8DFF] border-[rgba(79,141,255,0.3)]',
  '회의관련': 'bg-[rgba(139,92,246,0.15)] text-[#A78BFA] border-[rgba(139,92,246,0.3)]',
  '아이디어': 'bg-[rgba(249,158,11,0.15)] text-[#F99E0B] border-[rgba(249,158,11,0.3)]',
  '공지': 'bg-[rgba(239,68,68,0.15)] text-[#FC8181] border-[rgba(239,68,68,0.3)]',
  '완료': 'bg-[rgba(91,98,112,0.15)] text-[#7B8290] border-[rgba(91,98,112,0.3)]',
}

function parseMeetingDate(text: string): string | null {
  const year = new Date().getFullYear()
  const kr = text.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (kr) return `${year}-${kr[1].padStart(2, '0')}-${kr[2].padStart(2, '0')}`
  const slash = text.match(/(\d{1,2})[/\-](\d{1,2})/)
  if (slash) return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
  return null
}

export default function QuickMemoPage() {
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [autoSaved, setAutoSaved] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // ── 자동저장 (localStorage) ──────────────────────────────────────────────
  const saveDraft = useCallback((t: string, tg: MemoTag) => {
    const html = contentRef.current?.innerHTML ?? ''
    if (t || html) {
      localStorage.setItem('quick_memo_draft', JSON.stringify({ title: t, content: html, tag: tg }))
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 1500)
    } else {
      localStorage.removeItem('quick_memo_draft')
    }
  }, [])

  // ── 초기 복원 ────────────────────────────────────────────────────────────
  useEffect(() => {
    document.title = '빠른 메모'
    try {
      const saved = localStorage.getItem('quick_memo_draft')
      if (saved) {
        const { title: t, content: c, tag: tg } = JSON.parse(saved)
        if (t) setTitle(t)
        if (c && contentRef.current) contentRef.current.innerHTML = c
        if (tg) setTag(tg)
      }
    } catch {}
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [])

  // ── ESC 닫기 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') window.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── 이미지 삽입 ──────────────────────────────────────────────────────────
  function insertImage(src: string) {
    const editor = contentRef.current
    if (!editor) return
    editor.focus()
    const img = document.createElement('img')
    img.src = src
    img.style.maxWidth = '100%'
    img.style.borderRadius = '6px'
    img.style.display = 'block'
    img.style.margin = '4px 0'
    const sel = window.getSelection()
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(img)
      const next = document.createRange()
      next.setStartAfter(img)
      next.collapse(true)
      sel.removeAllRanges()
      sel.addRange(next)
    } else {
      editor.appendChild(img)
    }
    saveDraft(title, tag)
  }

  // ── 붙여넣기 (이미지 우선, 텍스트는 기본 동작) ───────────────────────────
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue
        const reader = new FileReader()
        reader.onload = ev => insertImage(ev.target?.result as string)
        reader.readAsDataURL(blob)
        return
      }
    }
  }

  // ── 드래그앤드롭 ─────────────────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    Array.from(e.dataTransfer.files)
      .filter(f => f.type.startsWith('image/'))
      .forEach(file => {
        const reader = new FileReader()
        reader.onload = ev => insertImage(ev.target?.result as string)
        reader.readAsDataURL(file)
      })
  }

  const meetingDate = tag === '회의관련' ? parseMeetingDate(title) : null

  // ── 저장 ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const content = contentRef.current?.innerHTML ?? ''
    if (tag === '회의관련' && meetingDate) {
      const { data: newMeeting } = await supabase
        .from('project_meetings')
        .insert({ title: title.trim(), meeting_date: meetingDate })
        .select('id, title, meeting_date')
        .single()
      if (newMeeting && window.opener) {
        window.opener.dispatchEvent(new CustomEvent('quick-meeting-created', { detail: newMeeting }))
      }
      setSavedMsg('📅 일정에 추가됨!')
    } else {
      await supabase.from('quick_memos').insert({ title: title.trim(), content, tag })
      if (window.opener) window.opener.dispatchEvent(new CustomEvent('quick-memo-saved'))
      setSavedMsg('저장됨!')
    }
    localStorage.removeItem('quick_memo_draft')
    setSaving(false)
    setTitle('')
    if (contentRef.current) contentRef.current.innerHTML = ''
    setTag('업무관련')
    setTimeout(() => {
      setSavedMsg('')
      titleRef.current?.focus()
    }, 1200)
  }

  return (
    <div className="h-screen flex flex-col p-5" style={{ background: '#161B24', colorScheme: 'dark', boxSizing: 'border-box' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#E5E7EB] text-sm tracking-wide">빠른 메모</h3>
        <div className="flex items-center gap-2">
          {autoSaved && <span className="text-[10px] text-[#5B6270]">임시저장됨</span>}
          <button onClick={() => window.close()} className="text-[#5B6270] hover:text-[#E5E7EB] text-lg leading-none transition-colors">×</button>
        </div>
      </div>

      {/* 태그 */}
      <div className="flex gap-1.5 mb-3">
        {TAGS.map(t => (
          <button
            key={t}
            onClick={() => { setTag(t); saveDraft(title, t) }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              tag === t
                ? TAG_COLORS[t]
                : 'bg-[rgba(255,255,255,0.05)] text-[#5B6270] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#A1A7B3]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 제목 */}
      <input
        ref={titleRef}
        value={title}
        onChange={e => { setTitle(e.target.value); saveDraft(e.target.value, tag) }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); contentRef.current?.focus() }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        }}
        placeholder={tag === '회의관련' ? '6월15일 미팅(홍길동/업무내용)' : '제목 (Ctrl+Enter 저장)'}
        className="w-full text-sm placeholder:text-[#5B6270] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 focus:outline-none focus:border-[rgba(255,255,255,0.2)] mb-1.5"
        style={{ background: '#1A1C1F', color: '#E5E7EB' }}
      />

      {tag === '회의관련' && (
        <p className={`text-xs mb-2 px-0.5 ${meetingDate ? 'text-[#A78BFA]' : 'text-[#5B6270]'}`}>
          {meetingDate
            ? `📅 ${meetingDate} 일정으로 등록됩니다`
            : '날짜 포함 시 일정탭에 자동 등록 (예: 6월15일 미팅)'}
        </p>
      )}

      {/* 본문 — contenteditable (텍스트 + 이미지 붙여넣기) */}
      <div
        ref={contentRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="내용 또는 이미지 붙여넣기 (선택)"
        onInput={() => saveDraft(title, tag)}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        }}
        className="qm-editor flex-1 min-h-0 mb-3 w-full text-sm border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 focus:outline-none focus:border-[rgba(255,255,255,0.2)] overflow-y-auto"
        style={{ background: '#1A1C1F', color: '#E5E7EB', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}
      />

      {/* 푸터 */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-[#5B6270]">ESC 닫기 · Ctrl+Enter 저장 · 이미지 붙여넣기 가능</span>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="text-xs bg-[#1c2a3c] text-[rgba(230,231,234,0.85)] border border-[rgba(255,255,255,0.08)] px-4 py-2 rounded-lg hover:bg-[#1f3045] disabled:opacity-30 transition-colors"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}
        >
          {savedMsg || (saving ? '저장 중...' : meetingDate ? '일정 등록' : '저장')}
        </button>
      </div>
    </div>
  )
}
