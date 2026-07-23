'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MemoTag } from '@/types'
import SmartTextarea from '@/components/SmartTextarea'

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
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)
  const supabase = createClient()

  useEffect(() => {
    document.title = '빠른 메모'
    try {
      const saved = localStorage.getItem('quick_memo_draft')
      if (saved) {
        const { title: t, content: c, tag: tg } = JSON.parse(saved)
        if (t) setTitle(t)
        if (c) setContent(c)
        if (tg) setTag(tg)
      }
    } catch {}
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    if (title || content) {
      localStorage.setItem('quick_memo_draft', JSON.stringify({ title, content, tag }))
    } else {
      localStorage.removeItem('quick_memo_draft')
    }
  }, [title, content, tag])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') window.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const meetingDate = tag === '회의관련' ? parseMeetingDate(title) : null

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
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
      await supabase.from('quick_memos').insert({ title: title.trim(), content: content.trim(), tag })
      if (window.opener) window.opener.dispatchEvent(new CustomEvent('quick-memo-saved'))
      setSavedMsg('저장됨!')
    }
    localStorage.removeItem('quick_memo_draft')
    setSaving(false)
    setTitle('')
    setContent('')
    setTag('업무관련')
    setTimeout(() => {
      setSavedMsg('')
      titleRef.current?.focus()
    }, 1200)
  }

  return (
    <div className="h-screen flex flex-col p-5" style={{ background: '#1F2023', colorScheme: 'dark', boxSizing: 'border-box' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#E5E7EB] text-sm tracking-wide">빠른 메모</h3>
        <button
          onClick={() => window.close()}
          className="text-[#5B6270] hover:text-[#E5E7EB] text-lg leading-none transition-colors"
        >
          ×
        </button>
      </div>

      <div className="flex gap-1.5 mb-3">
        {TAGS.map(t => (
          <button
            key={t}
            onClick={() => setTag(t)}
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

      <input
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
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

      <div className="flex-1 min-h-0 mb-3">
        <SmartTextarea
          ref={contentRef}
          value={content}
          onChange={setContent}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
          }}
          placeholder="내용 (선택)"
          className="w-full text-sm placeholder:text-[#5B6270] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 focus:outline-none focus:border-[rgba(255,255,255,0.2)]"
          style={{ minHeight: '120px', resize: 'none', background: '#1A1C1F', color: '#E5E7EB' }}
        />
      </div>

      <div className="flex justify-between items-center">
        <span className="text-xs text-[#5B6270]">ESC 닫기 · Ctrl+Enter 저장</span>
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
