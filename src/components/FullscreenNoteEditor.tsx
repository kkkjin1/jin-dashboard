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
  // Escape/배경클릭으로 닫을 때도 저장 후 닫기 — 저장 없이 닫으면 입력 내용이 유실됨
  function closeWithSave() {
    onSave?.()
    onClose()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeWithSave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, onSave])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[85]" onClick={closeWithSave} />
      <div className="fixed inset-4 md:inset-10 bg-white rounded-2xl shadow-2xl z-[86] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700">{title || '노트 편집'}</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-300 hidden md:block">ESC 닫기 · Ctrl+Enter 저장</span>
            {onSave && (
              <button
                onClick={closeWithSave}
                className="text-xs bg-[rgba(76,127,224,0.1)] text-[#4C7FE0] border border-[rgba(76,127,224,0.25)] px-3.5 py-1.5 rounded-lg hover:bg-[rgba(76,127,224,0.18)] transition-colors">
                저장
              </button>
            )}
            <button onClick={closeWithSave} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>
        {/* Editor */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <TiptapEditor
            value={value}
            onChange={onChange}
            onSubmit={closeWithSave}
            onEscape={closeWithSave}
            autoFocus
            minHeight={400}
          />
        </div>
      </div>
    </>
  )
}
