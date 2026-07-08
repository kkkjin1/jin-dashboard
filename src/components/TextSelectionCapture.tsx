'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import type { MemoTag } from '@/types'

interface Props {
  sourceName: string
  sourceType: '업무' | '회의'
}

interface FloatPos {
  text: string
  x: number
  y: number
}

const TAG_OPTIONS: { tag: MemoTag; label: string; cls: string }[] = [
  { tag: '아이디어', label: '아이디어', cls: 'bg-[#DCC8C8]/70 text-[#6A3A3A] border-[#CCA8A8]/60' },
  { tag: '업무관련', label: '업무관련', cls: 'bg-[#C8D8C8]/70 text-[#3A5A3A] border-[#A8C4A8]/60' },
  { tag: '회의관련', label: '회의관련', cls: 'bg-[#C8D0DC]/70 text-[#3A4A5A] border-[#A8B8CC]/60' },
]

export default function TextSelectionCapture({ sourceName, sourceType }: Props) {
  const [float, setFloat] = useState<FloatPos | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState<MemoTag>('아이디어')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const dismiss = useCallback(() => {
    setFloat(null)
    setShowForm(false)
    setSaved(false)
  }, [])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (containerRef.current?.contains(e.target as Node)) return
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (text.length < 4) { setFloat(null); setShowForm(false); return }
    const range = selection!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setFloat({ text, x: rect.left + rect.width / 2, y: rect.top })
    setTitle(text.split('\n')[0].replace(/#+\s*/g, '').trim().slice(0, 50))
    setTag('아이디어')
    setShowForm(false)
    setSaved(false)
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

  async function save() {
    if (!float || !title.trim()) return
    setSaving(true)
    const content = `[${sourceType}: ${sourceName}]\n\n${float.text}`
    await supabase.from('quick_memos').insert({ title: title.trim(), content, tag })
    setSaving(false)
    setSaved(true)
    window.getSelection()?.removeAllRanges()
    setTimeout(dismiss, 1000)
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
      onMouseDown={e => e.stopPropagation()}
    >
      {saved ? (
        <div className="flex items-center gap-1.5 bg-[#5DBD97] text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
          ✓ 메모에 저장됨
        </div>
      ) : !showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 bg-[#1B3A6B]/90 backdrop-blur-sm text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg hover:bg-[#22497E] transition-colors whitespace-nowrap"
        >
          💡 메모 저장
        </button>
      ) : (
        <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl shadow-2xl p-3 w-60">
          <div className="flex gap-1 mb-2 flex-wrap">
            {TAG_OPTIONS.map(({ tag: t, label, cls }) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                  tag === t ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]' : cls
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) save()
              if (e.key === 'Escape') dismiss()
            }}
            placeholder="메모 제목 (Enter 저장)"
            className="w-full text-xs text-gray-700 border-b border-gray-100 pb-1.5 mb-2 focus:outline-none bg-transparent"
          />
          <p className="text-[9px] text-gray-300 leading-relaxed line-clamp-2 mb-2">
            {float.text.slice(0, 60)}{float.text.length > 60 ? '…' : ''}
          </p>
          <p className="text-[9px] text-gray-300 mb-2">출처: {sourceType} · {sourceName.slice(0, 20)}</p>
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={dismiss}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-0.5 transition-colors"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={saving || !title.trim()}
              className="text-[10px] bg-[#1B3A6B] text-white px-3 py-1 rounded-lg hover:bg-[#22497E] disabled:opacity-40 transition-colors"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
