'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
  autoFocus?: boolean
  style?: React.CSSProperties
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = '내용을 입력하세요…',
  minHeight = 120,
  autoFocus = false,
  style,
}: Props) {
  const [editing, setEditing] = useState(autoFocus || !value.trim())
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) setEditing(true)
  }, [autoFocus])

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      const len = ref.current.value.length
      ref.current.setSelectionRange(len, len)
    }
  }, [editing])

  const baseStyle: React.CSSProperties = {
    minHeight,
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.65,
    padding: '16px 20px',
    ...style,
  }

  if (editing) {
    return (
      <div className="relative">
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { if (value.trim()) setEditing(false) }}
          placeholder={placeholder}
          className="w-full text-gray-700 bg-transparent focus:outline-none resize-none"
          style={baseStyle}
        />
        <span className="absolute bottom-1.5 right-3 text-[9px] text-gray-300 pointer-events-none select-none">
          Markdown 지원
        </span>
      </div>
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="md-preview cursor-text group/mdprev relative text-gray-700"
      style={baseStyle}
      title="클릭하여 편집"
    >
      {value.trim() ? (
        <>
          <ReactMarkdown>{value}</ReactMarkdown>
          <span className="absolute bottom-1.5 right-3 text-[9px] text-gray-300 opacity-0 group-hover/mdprev:opacity-100 transition-opacity select-none pointer-events-none">
            클릭하여 편집
          </span>
        </>
      ) : (
        <span className="text-gray-300">{placeholder}</span>
      )}
    </div>
  )
}
