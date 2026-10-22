'use client'

// 회의록·업무 상세에서 글자를 드래그하면 뜨는 "오늘 업무로" 버튼 — 누르면 고른 글자를 그 시점의 오늘 날짜
// 즉석 할 일(quick_todos)로 추가한다. 홈 금주 업무의 오늘 요일 열에 바로 보인다(일정 탭과 같은 테이블).
// 읽기 화면과 편집 중(에디터 안 드래그) 모두 document mouseup으로 잡는다.
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { todayYmd } from '@/lib/tiptapExtensions'

interface Props {
  sourceName: string
  sourceType: '업무' | '회의'
}

interface FloatPos {
  text: string
  x: number
  y: number
}

type Mode = 'button' | 'saved' | 'failed'

// 즉석 할 일 제목은 한 줄 — 여러 줄을 골랐으면 " / "로 잇고 너무 길면 자른다
const MAX_TITLE = 200
function toTodoTitle(text: string): string {
  const one = text.split('\n').map(l => l.trim()).filter(Boolean).join(' / ').replace(/\s+/g, ' ')
  return one.length > MAX_TITLE ? `${one.slice(0, MAX_TITLE)}…` : one
}

export default function TextSelectionCapture({ sourceName, sourceType }: Props) {
  const [float, setFloat] = useState<FloatPos | null>(null)
  const [mode, setMode] = useState<Mode>('button')
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const dismiss = useCallback(() => {
    setFloat(null)
    setMode('button')
  }, [])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (containerRef.current?.contains(e.target as Node)) return
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (text.length < 4) { setFloat(null); setMode('button'); return }
    const range = selection!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setFloat({ text, x: rect.left + rect.width / 2, y: rect.top })
    setMode('button')
  }, [])

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (containerRef.current?.contains(e.target as Node)) return
    dismiss()
  }, [dismiss])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [handleMouseUp, handleMouseDown])

  async function addToToday() {
    if (!float || saving) return
    const title = toTodoTitle(float.text)
    if (!title) return
    setSaving(true)
    const { error } = await supabase.from('quick_todos').insert({ title, target_date: todayYmd() })
    setSaving(false)
    if (error) {
      console.error(`오늘 업무 추가 실패 (${sourceType}: ${sourceName}):`, error.message)
      setMode('failed')
      setTimeout(dismiss, 2000)
      return
    }
    setMode('saved')
    window.getSelection()?.removeAllRanges()
    setTimeout(dismiss, 1200)
  }

  if (!float || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: float.x,
        top: float.y,
        transform: 'translate(-50%, calc(-100% - 6px))',
        zIndex: 9999,
      }}
      // 버튼을 눌러도 에디터 포커스·선택이 풀리지 않도록 기본 동작을 막는다
      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
    >
      {mode === 'saved' ? (
        <div className="flex items-center gap-1.5 bg-[#3B82F6] text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
          ✓ 오늘 업무에 추가됨
        </div>
      ) : mode === 'failed' ? (
        <div className="flex items-center gap-1.5 bg-[#EF4444] text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
          추가 실패 — 저장되지 않았습니다
        </div>
      ) : (
        <button
          onClick={addToToday}
          disabled={saving}
          title="고른 글자를 금주 업무의 오늘 요일에 즉석 할 일로 추가"
          className="bg-[#4C7FE0]/90 backdrop-blur-sm rounded-lg shadow-lg text-white text-[11px] px-2.5 py-1.5 hover:bg-[#3A6CC8] transition-colors whitespace-nowrap disabled:opacity-60"
        >
          {saving ? '추가 중…' : '📌 오늘 업무로'}
        </button>
      )}
    </div>,
    document.body
  )
}
