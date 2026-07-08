'use client'

import { useEffect } from 'react'
import TiptapEditor from './TiptapEditor'

interface Props {
  value: string
  onChange: (v: string) => void
  onSave?: () => void
  onClose: () => void
  title?: string
}

export default function FullscreenNoteEditor({ value, onChange, onSave, onClose, title }: Props) {
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
                className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3.5 py-1.5 rounded-lg hover:bg-[#D5E6F7] transition-colors">
                저장
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>
        {/* Editor */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <TiptapEditor
            value={value}
            onChange={onChange}
            onSubmit={() => { onSave?.(); onClose() }}
            onEscape={onClose}
            autoFocus
            minHeight={400}
          />
        </div>
      </div>
    </>
  )
}
