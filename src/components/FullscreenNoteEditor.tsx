'use client'

import { useEffect } from 'react'
import TiptapEditor from './TiptapEditor'

interface Props {
  value: string
  onChange: (v: string) => void
  onSave?: () => void
  onClose: () => void
  title?: string
  dark?: boolean
}

export default function FullscreenNoteEditor({ value, onChange, onSave, onClose, title, dark }: Props) {
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
      <div className={`fixed inset-4 md:inset-10 rounded-2xl shadow-2xl z-[86] flex flex-col overflow-hidden ${dark ? 'bg-[#26282E]' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0 ${dark ? 'border-[rgba(255,255,255,0.06)]' : 'border-gray-100'}`}>
          <span className={`text-sm font-semibold ${dark ? 'text-[rgba(226,232,240,0.85)]' : 'text-gray-700'}`}>{title || '노트 편집'}</span>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] hidden md:block ${dark ? 'text-[rgba(226,232,240,0.3)]' : 'text-gray-300'}`}>ESC 닫기 · Ctrl+Enter 저장</span>
            {onSave && (
              <button
                onClick={closeWithSave}
                className="text-xs bg-[rgba(76,127,224,0.1)] text-[#4C7FE0] border border-[rgba(76,127,224,0.25)] px-3.5 py-1.5 rounded-lg hover:bg-[rgba(76,127,224,0.18)] transition-colors">
                저장
              </button>
            )}
            <button onClick={closeWithSave} className={`text-xl leading-none ${dark ? 'text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]' : 'text-gray-400 hover:text-gray-600'}`}>×</button>
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
            dark={dark}
          />
        </div>
      </div>
    </>
  )
}
