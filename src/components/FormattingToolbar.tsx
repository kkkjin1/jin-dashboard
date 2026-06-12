'use client'

import React from 'react'

const COLORS = ['red', 'blue', 'green', 'orange', 'purple', 'gray'] as const
const COLOR_BG: Record<string, string> = {
  red: 'bg-red-400', blue: 'bg-blue-400', green: 'bg-green-500',
  orange: 'bg-orange-400', purple: 'bg-purple-400', gray: 'bg-gray-400',
}

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
}

export default function FormattingToolbar({ textareaRef, value, onChange }: Props) {
  function wrap(open: string, close: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const newValue = value.slice(0, start) + open + selected + close + value.slice(end)
    onChange(newValue)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + open.length, end + open.length)
    }, 0)
  }

  function insertLinePrefix(prefix: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStartIdx = value.lastIndexOf('\n', start - 1) + 1
    const lineText = value.slice(lineStartIdx)
    const existingHeading = lineText.match(/^(#{1,3} )/)
    if (existingHeading) {
      const newValue = value.slice(0, lineStartIdx) + value.slice(lineStartIdx + existingHeading[1].length)
      onChange(newValue)
      setTimeout(() => { el.focus(); el.setSelectionRange(start - existingHeading[1].length, start - existingHeading[1].length) }, 0)
    } else {
      const newValue = value.slice(0, lineStartIdx) + prefix + value.slice(lineStartIdx)
      onChange(newValue)
      setTimeout(() => { el.focus(); el.setSelectionRange(start + prefix.length, start + prefix.length) }, 0)
    }
  }

  return (
    <div className="flex items-center gap-0.5 border-b border-gray-100 pb-2 mb-2 flex-wrap">
      <button type="button" onMouseDown={e => { e.preventDefault(); wrap('**', '**') }}
        className="text-xs font-bold px-2 py-1 rounded hover:bg-gray-100 text-gray-600 min-w-[26px]" title="굵게">B</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); wrap('__', '__') }}
        className="text-xs underline px-2 py-1 rounded hover:bg-gray-100 text-gray-600 min-w-[26px]" title="밑줄">U</button>
      <div className="w-px h-4 bg-gray-200 mx-0.5" />
      <button type="button" onMouseDown={e => { e.preventDefault(); insertLinePrefix('# ') }}
        className="text-[11px] font-bold px-1.5 py-1 rounded hover:bg-gray-100 text-gray-600" title="큰 제목">H1</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); insertLinePrefix('## ') }}
        className="text-[11px] font-semibold px-1.5 py-1 rounded hover:bg-gray-100 text-gray-600" title="중간 제목">H2</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); insertLinePrefix('### ') }}
        className="text-[11px] px-1.5 py-1 rounded hover:bg-gray-100 text-gray-500" title="작은 제목">H3</button>
      <div className="w-px h-4 bg-gray-200 mx-0.5" />
      {COLORS.map(color => (
        <button key={color} type="button"
          onMouseDown={e => { e.preventDefault(); wrap(`{${color}}`, `{/${color}}`) }}
          className={`w-4 h-4 rounded-full ${COLOR_BG[color]} hover:opacity-70 flex-shrink-0`}
          title={color} />
      ))}
    </div>
  )
}
