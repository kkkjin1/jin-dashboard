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
  '완료': 'bg-gray-50 text-gray-400 border-gray-200',
}

function parseMeetingDate(text: string): string | null {
  const year = new Date().getFullYear()
  const kr = text.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (kr) return `${year}-${kr[1].padStart(2, '0')}-${kr[2].padStart(2, '0')}`
  const slash = text.match(/(\d{1,2})[\/\-](\d{1,2})/)
  if (slash) return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
  return null
}

const DEFAULT_WIDTH = 384
const DEFAULT_HEIGHT = 400
const PANEL_GAP = 8

// 개별 메모 패널 — 자체 state 완전 독립
function SingleMemoPanel({
  index,
  isFirst,
  onClose,
}: {
  index: number
  isFirst: boolean
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT)
  const isResizingW = useRef(false)
  const isResizingH = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)
  const supabase = createClient()

  // 첫 번째 패널에만 draft 복원
  useEffect(() => {
    if (isFirst) {
      try {
        const saved = localStorage.getItem('quick_memo_draft')
        if (saved) {
          const { title: t, content: c, tag: tg } = JSON.parse(saved)
          if (t) setTitle(t)
          if (c) setContent(c)
          if (tg) setTag(tg)
        }
      } catch {}
    }
    setTimeout(() => titleRef.current?.focus(), 100)
  }, [])

  // draft 저장 (첫 번째 패널만)
  useEffect(() => {
    if (!isFirst) return
    if (title || content) {
      localStorage.setItem('quick_memo_draft', JSON.stringify({ title, content, tag }))
    } else {
      localStorage.removeItem('quick_memo_draft')
    }
  }, [title, content, tag, isFirst])

  const meetingDate = tag === '회의관련' ? parseMeetingDate(title) : null

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    if (tag === '회의관련' && meetingDate) {
      const notes = content.trim()
        ? [{ title: '메모', content: content.trim(), created_at: new Date().toISOString() }]
        : []
      const { data: newMeeting } = await supabase.from('meetings').insert({
        title: title.trim(), meeting_date: meetingDate, notes,
      }).select().single()
      if (newMeeting) window.dispatchEvent(new CustomEvent('quick-meeting-created', { detail: newMeeting }))
      setSavedMsg('📅 일정에 추가됨!')
    } else {
      await supabase.from('quick_memos').insert({ title: title.trim(), content: content.trim(), tag })
      window.dispatchEvent(new CustomEvent('quick-memo-saved'))
      setSavedMsg('저장됨!')
    }
    if (isFirst) localStorage.removeItem('quick_memo_draft')
    setSaving(false)
    setTimeout(() => { setSavedMsg(''); onClose() }, 1200)
  }

  function startResizeW(e: React.MouseEvent) {
    e.preventDefault()
    isResizingW.current = true
    const startX = e.clientX; const startW = panelWidth
    const onMove = (ev: MouseEvent) => { if (isResizingW.current) setPanelWidth(Math.max(280, Math.min(800, startW - (ev.clientX - startX)))) }
    const onUp = () => { isResizingW.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  function startResizeH(e: React.MouseEvent) {
    e.preventDefault()
    isResizingH.current = true
    const startY = e.clientY; const startH = panelHeight
    const onMove = (ev: MouseEvent) => { if (isResizingH.current) setPanelHeight(Math.max(200, Math.min(800, startH - (ev.clientY - startY)))) }
    const onUp = () => { isResizingH.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  function startResizeBoth(e: React.MouseEvent) {
    e.preventDefault()
    isResizingW.current = true; isResizingH.current = true
    const startX = e.clientX; const startY = e.clientY; const startW = panelWidth; const startH = panelHeight
    const onMove = (ev: MouseEvent) => {
      if (!isResizingW.current) return
      setPanelWidth(Math.max(280, Math.min(800, startW - (ev.clientX - startX))))
      setPanelHeight(Math.max(200, Math.min(800, startH - (ev.clientY - startY))))
    }
    const onUp = () => { isResizingW.current = false; isResizingH.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  // 오른쪽 끝에서 index 순서대로 왼쪽으로 배치
  const right = 16 + index * (DEFAULT_WIDTH + PANEL_GAP)

  return (
    <div
      style={{ width: panelWidth, height: panelHeight, right }}
      className="fixed bottom-0 z-[63] bg-white rounded-t-2xl shadow-2xl border border-gray-200 overflow-hidden">

      {/* 리사이즈 핸들 */}
      <div onMouseDown={startResizeH} className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-gray-200 transition-colors rounded-t-2xl z-10" />
      <div onMouseDown={startResizeW} className="absolute top-0 left-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-gray-200 transition-colors z-10" />
      <div onMouseDown={startResizeBoth} className="absolute top-0 left-0 w-5 h-5 cursor-nwse-resize z-20 flex items-center justify-center hover:bg-gray-200 transition-colors rounded-tl-2xl" title="대각선 크기 조절">
        <span className="text-gray-300 text-[8px] leading-none select-none">◤</span>
      </div>

      <div className="p-5 pb-20 md:pb-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 text-sm">빠른 메모</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
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
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); contentRef.current?.focus() }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
          }}
          placeholder={tag === '회의관련' ? '6월15일 미팅(홍길동/업무내용)' : '제목 (엔터로 저장)'}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 mb-1.5" />

        {tag === '회의관련' && (
          <p className={`text-xs mb-2 px-0.5 ${meetingDate ? 'text-purple-500' : 'text-gray-300'}`}>
            {meetingDate ? `📅 ${meetingDate} 일정으로 등록됩니다` : '날짜 포함 시 일정탭에 자동 등록 (예: 6월15일 미팅)'}
          </p>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          <SmartTextarea ref={contentRef} value={content} onChange={setContent}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
            }}
            placeholder="내용 (선택, Ctrl+Enter 저장)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 resize-none"
            style={{ minHeight: '80px', resize: 'none' }} />
        </div>

        <div className="flex justify-between items-center mt-3">
          <span className="text-xs text-gray-300">ESC 닫기 · Ctrl+Enter 저장</span>
          <button onClick={handleSave} disabled={!title.trim() || saving}
            className="text-xs bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors">
            {savedMsg || (saving ? '저장 중...' : (meetingDate ? '일정 등록' : '저장'))}
          </button>
        </div>
      </div>
    </div>
  )
}

type BtnPos = { right: number; bottom: number }

export default function QuickMemoPanel() {
  const [panels, setPanels] = useState<string[]>([])
  const [btnPos, setBtnPos] = useState<BtnPos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number; moved: boolean } | null>(null)
  const latestPos = useRef<BtnPos>({ right: 16, bottom: 80 })
  const wasMovedRef = useRef(false)
  const router = useRouter()

  useEffect(() => {
    try {
      const saved = localStorage.getItem('quick_memo_btn_pos')
      if (saved) {
        const p = JSON.parse(saved) as BtnPos
        setBtnPos(p); latestPos.current = p; return
      }
    } catch {}
    const isMobile = window.innerWidth < 768
    const defaultPos: BtnPos = { right: 16, bottom: isMobile ? 80 : 24 }
    setBtnPos(defaultPos); latestPos.current = defaultPos
  }, [])

  function addPanel() {
    setPanels(prev => [...prev, `${Date.now()}-${prev.length}`])
  }

  function removePanel(id: string) {
    setPanels(prev => prev.filter(p => p !== id))
  }

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && panels.length > 0) {
        setPanels(prev => prev.slice(0, -1))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault()
        addPanel()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        const supabaseClient = createClient()
        const { data } = await supabaseClient
          .from('tasks')
          .insert({ title: '', part: '코어', type: '기획', status: '진행필요' })
          .select('id').single()
        if (data) router.push(`/tasks/${(data as { id: string }).id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panels.length, router])

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    btnRef.current?.setPointerCapture(e.pointerId)
    wasMovedRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, startRight: latestPos.current.right, startBottom: latestPos.current.bottom, moved: false }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    dragRef.current.moved = true; wasMovedRef.current = true
    const newPos = {
      right: Math.max(8, Math.min(window.innerWidth - 56, dragRef.current.startRight - dx)),
      bottom: Math.max(8, Math.min(window.innerHeight - 56, dragRef.current.startBottom - dy)),
    }
    latestPos.current = newPos; setBtnPos(newPos)
  }

  function handlePointerUp() {
    if (!dragRef.current) return
    if (dragRef.current.moved) localStorage.setItem('quick_memo_btn_pos', JSON.stringify(latestPos.current))
    dragRef.current = null
  }

  function handleBtnClick() {
    if (wasMovedRef.current) return
    addPanel()
  }

  return (
    <>
      {panels.map((id, idx) => (
        <SingleMemoPanel
          key={id}
          index={idx}
          isFirst={idx === 0}
          onClose={() => removePanel(id)}
        />
      ))}

      {btnPos && (
        <button
          type="button"
          ref={btnRef}
          style={{ right: btnPos.right, bottom: btnPos.bottom }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleBtnClick}
          className="fixed z-[64] w-12 h-12 bg-[#1B3A6B] text-white rounded-full shadow-lg hover:bg-[#1F4070] transition-colors flex items-center justify-center text-xl font-light touch-none select-none cursor-grab active:cursor-grabbing"
          title="빠른 메모 (Ctrl+2) — 길게 드래그해 위치 이동"
        >
          +
        </button>
      )}
    </>
  )
}
