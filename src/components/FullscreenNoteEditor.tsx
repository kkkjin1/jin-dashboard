'use client'

import { useRef, useEffect } from 'react'
import SmartTextarea from './SmartTextarea'
import FormattingToolbar from './FormattingToolbar'

interface Props {
  value: string
  onChange: (v: string) => void
  onSave?: () => void
  onClose: () => void
  title?: string
}

export default function FullscreenNoteEditor({ value, onChange, onSave, onClose, title }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[85]" onClick={onClose} />
      <div className="fixed inset-4 md:inset-10 bg-white rounded-2xl shadow-2xl z-[86] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700">{title || '노트 편집'}</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-300 hidden md:block">ESC 닫기 · Ctrl+Enter 저장</span>
            {onSave && (
              <button
                onClick={() => { onSave(); onClose() }}
                className="text-xs bg-gray-900 text-white px-3.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                저장
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>
        {/* Toolbar */}
        <div className="px-5 pt-3 flex-shrink-0 border-b border-gray-50">
          <FormattingToolbar textareaRef={ref} value={value} onChange={onChange} />
        </div>
        {/* Textarea — scrollable area, auto-grow inside */}
        <div className="flex-1 overflow-y-auto">
          <SmartTextarea
            ref={ref}
            value={value}
            onChange={onChange}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); onClose() }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                onSave?.()
                onClose()
              }
            }}
            placeholder="내용 입력... (Ctrl+Enter 저장)"
            className="w-full text-sm text-gray-700 focus:outline-none resize-none px-5 py-4"
            style={{ minHeight: '240px' }}
          />
        </div>
      </div>
    </>
  )
}
