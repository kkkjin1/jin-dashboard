'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MemoTag } from '@/types'
import SmartTextarea from '@/components/SmartTextarea'

const TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어', '공지']

const TAG_COLORS: Record<MemoTag, string> = {
  '업무관련': 'bg-blue-50 text-blue-600 border-blue-200',
  '회의관련': 'bg-purple-50 text-purple-600 border-purple-200',
  '아이디어': 'bg-amber-50 text-amber-600 border-amber-200',
  '공지': 'bg-red-50 text-red-600 border-red-200',
}

function parseMeetingDate(text: string): string | null {
  const year = new Date().getFullYear()
  const kr = text.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (kr) return `${year}-${kr[1].padStart(2, '0')}-${kr[2].padStart(2, '0')}`
  const slash = text.match(/(\d{1,2})[\/\-](\d{1,2})/)
  if (slash) return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
  return null
}

export default function QuickMemoPanel() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [panelWidth, setPanelWidth] = useState(384) // w-96 = 384px
  const [panelHeight, setPanelHeight] = useState(400)
  const isResizingW = useRef(false)
  const isResizingH = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  // draft 복원
  useEffect(() => {
    const saved = localStorage.getItem('quick_memo_draft')
    if (saved) {
      try {
        const { title: t, content: c, tag: tg } = JSON.parse(saved)
        if (t) setTitle(t)
        if (c) setContent(c)
        if (tg) setTag(tg)
      } catch {}
    }
  }, [])

  // draft 저장
  useEffect(() => {
    if (title || content) {
      localStorage.setItem('quick_memo_draft', JSON.stringify({ title, content, tag }))
    } else {
      localStorage.removeItem('quick_memo_draft')
    }
  }, [title, content, tag])

  useEffect(() => {
    if (open) setTimeout(() => titleRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) { setOpen(false); return }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault()
        setOpen(prev => !prev)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        const supabaseClient = createClient()
        const { data } = await supabaseClient
          .from('tasks')
          .insert({ title: '', part: '코어', type: '기획', status: '진행필요' })
          .select('id')
          .single()
        if (data) router.push(`/tasks/${(data as { id: string }).id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function startResizeW(e: React.MouseEvent) {
    e.preventDefault()
    isResizingW.current = true
    const startX = e.clientX
    const startW = panelWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizingW.current) return
      setPanelWidth(Math.max(280, Math.min(800, startW - (ev.clientX - startX))))
    }
    const onUp = () => {
      isResizingW.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startResizeH(e: React.MouseEvent) {
    e.preventDefault()
    isResizingH.current = true
    const startY = e.clientY
    const startH = panelHeight
    const onMove = (ev: MouseEvent) => {
      if (!isResizingH.current) return
      setPanelHeight(Math.max(200, Math.min(800, startH - (ev.clientY - startY))))
    }
    const onUp = () => {
      isResizingH.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startResizeBoth(e: React.MouseEvent) {
    e.preventDefault()
    isResizingW.current = true
    isResizingH.current = true
    const startX = e.clientX
    const startY = e.clientY
    const startW = panelWidth
    const startH = panelHeight
    const onMove = (ev: MouseEvent) => {
      if (!isResizingW.current) return
      setPanelWidth(Math.max(280, Math.min(800, startW - (ev.clientX - startX))))
      setPanelHeight(Math.max(200, Math.min(800, startH - (ev.clientY - startY))))
    }
    const onUp = () => {
      isResizingW.current = false
      isResizingH.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const meetingDate = tag === '회의관련' ? parseMeetingDate(title) : null

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)

    if (tag === '회의관련' && meetingDate) {
      const notes = content.trim()
        ? [{ title: '메모', content: content.trim(), created_at: new Date().toISOString() }]
        : []
      const { data: newMeeting } = await supabase.from('meetings').insert({
        title: title.trim(),
        meeting_date: meetingDate,
        notes,
      }).select().single()
      if (newMeeting) {
        window.dispatchEvent(new CustomEvent('quick-meeting-created', { detail: newMeeting }))
      }
      setSavedMsg('📅 일정에 추가됨!')
    } else {
      await supabase.from('quick_memos').insert({ title: title.trim(), content: content.trim(), tag })
      window.dispatchEvent(new CustomEvent('quick-memo-saved'))
      setSavedMsg('저장됨!')
    }

    localStorage.removeItem('quick_memo_draft')
    setTitle(''); setContent(''); setTag('업무관련')
    setSaving(false)
    setTimeout(() => { setSavedMsg(''); setOpen(false) }, 1200)
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <div
        style={{ width: `${panelWidth}px`, height: open ? `${panelHeight}px` : undefined }}
        className={`fixed bottom-0 right-6 z-50 bg-white rounded-t-2xl shadow-2xl border border-gray-200 transition-transform duration-300 overflow-hidden ${open ? 'translate-y-0' : 'translate-y-full'}`}>

        {/* 상단 리사이즈 핸들 (높이 조절) */}
        <div
          onMouseDown={startResizeH}
          className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-gray-200 transition-colors rounded-t-2xl z-10" />

        {/* 왼쪽 리사이즈 핸들 (너비 조절) */}
        <div
          onMouseDown={startResizeW}
          className="absolute top-0 left-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-gray-200 transition-colors z-10" />

        {/* 왼쪽 상단 대각선 리사이즈 핸들 */}
        <div
          onMouseDown={startResizeBoth}
          className="absolute top-0 left-0 w-5 h-5 cursor-nwse-resize z-20 flex items-center justify-center hover:bg-gray-200 transition-colors rounded-tl-2xl"
          title="대각선 크기 조절">
          <span className="text-gray-300 text-[8px] leading-none select-none">◤</span>
        </div>

        <div className="p-5 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">빠른 메모</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>

          <div className="flex gap-1.5 mb-3">
            {TAGS.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tag === t ? TAG_COLORS[t] : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                {t}
              </button>
            ))}
          </div>

          <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder={tag === '회의관련' ? '6월15일 미팅(홍길동/업무내용)' : '제목 (엔터로 저장)'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 mb-1.5" />

          {tag === '회의관련' && (
            <p className={`text-xs mb-2 px-0.5 ${meetingDate ? 'text-purple-500' : 'text-gray-300'}`}>
              {meetingDate ? `📅 ${meetingDate} 일정으로 등록됩니다` : '날짜 포함 시 일정탭에 자동 등록 (예: 6월15일 미팅)'}
            </p>
          )}

          <SmartTextarea value={content} onChange={setContent}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave() }}
            placeholder="내용 (선택, Ctrl+Enter 저장)"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 resize-none" />

          <div className="flex justify-between items-center mt-3">
            <span className="text-xs text-gray-300">ESC · Ctrl+2 메모 · Ctrl+1 업무추가</span>
            <button onClick={handleSave} disabled={!title.trim() || saving}
              className="text-xs bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors">
              {savedMsg || (saving ? '저장 중...' : (meetingDate ? '일정 등록' : '저장'))}
            </button>
          </div>
        </div>
      </div>

      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-[#10B981] text-white rounded-full shadow-lg hover:bg-[#059669] transition-all hover:scale-110 flex items-center justify-center text-xl font-light"
          title="빠른 메모 (Ctrl+2)">
          +
        </button>
      )}
    </>
  )
}
