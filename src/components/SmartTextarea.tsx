'use client'

import { useRef, useEffect, forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
}

function getLineStart(text: string, pos: number): number {
  const idx = text.lastIndexOf('\n', pos - 1)
  return idx === -1 ? 0 : idx + 1
}

function getLineEnd(text: string, pos: number): number {
  const idx = text.indexOf('\n', pos)
  return idx === -1 ? text.length : idx
}

const SmartTextarea = forwardRef<HTMLTextAreaElement, Props>(function SmartTextarea(
  { value, onChange, onKeyDown, ...props },
  forwardedRef
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingCursor = useRef<number | null>(null)

  function setRefs(el: HTMLTextAreaElement | null) {
    localRef.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
  }

  useEffect(() => {
    if (pendingCursor.current !== null && localRef.current) {
      const pos = pendingCursor.current
      localRef.current.selectionStart = pos
      localRef.current.selectionEnd = pos
      pendingCursor.current = null
    }
  })

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    const lineStart = getLineStart(value, start)
    const lineEnd = getLineEnd(value, start)
    const line = value.slice(lineStart, lineEnd)

    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const numMatch = line.match(/^(\s*)(\d+)\. /)
      if (numMatch) {
        e.preventDefault()
        const insert = '\n' + numMatch[1] + (parseInt(numMatch[2]) + 1) + '. '
        onChange(value.slice(0, start) + insert + value.slice(end))
        pendingCursor.current = start + insert.length
        return
      }
      const blackMatch = line.match(/^(\s*)■ /)
      if (blackMatch) {
        e.preventDefault()
        const insert = '\n' + blackMatch[1] + '■ '
        onChange(value.slice(0, start) + insert + value.slice(end))
        pendingCursor.current = start + insert.length
        return
      }
      const whiteMatch = line.match(/^(\s*)□ /)
      if (whiteMatch) {
        e.preventDefault()
        const insert = '\n' + whiteMatch[1] + '□ '
        onChange(value.slice(0, start) + insert + value.slice(end))
        pendingCursor.current = start + insert.length
        return
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (!e.shiftKey) {
        const numMatch = line.match(/^(\s*)(\d+)\. /)
        if (numMatch) {
          const prefix = '    ■ '
          const newLine = prefix + line.slice(numMatch[0].length)
          onChange(value.slice(0, lineStart) + newLine + value.slice(lineEnd))
          pendingCursor.current = lineStart + prefix.length
          return
        }
        const blackMatch = line.match(/^(\s*)■ /)
        if (blackMatch) {
          const prefix = blackMatch[1] + '  □ '
          const newLine = prefix + line.slice(blackMatch[0].length)
          onChange(value.slice(0, lineStart) + newLine + value.slice(lineEnd))
          pendingCursor.current = lineStart + prefix.length
          return
        }
        onChange(value.slice(0, start) + '  ' + value.slice(end))
        pendingCursor.current = start + 2
      } else {
        const whiteMatch = line.match(/^(\s*)□ /)
        if (whiteMatch) {
          const indent = whiteMatch[1].length >= 2 ? whiteMatch[1].slice(0, -2) : ''
          const prefix = indent + '■ '
          const newLine = prefix + line.slice(whiteMatch[0].length)
          onChange(value.slice(0, lineStart) + newLine + value.slice(lineEnd))
          pendingCursor.current = lineStart + prefix.length
          return
        }
        const blackMatch = line.match(/^(\s*)■ /)
        if (blackMatch) {
          const prefix = '  1. '
          onChange(value.slice(0, lineStart) + prefix + line.slice(blackMatch[0].length) + value.slice(lineEnd))
          pendingCursor.current = lineStart + prefix.length
          return
        }
        if (line.startsWith('  ')) {
          onChange(value.slice(0, lineStart) + line.slice(2) + value.slice(lineEnd))
          pendingCursor.current = Math.max(lineStart, start - 2)
        }
      }
      return
    }

    onKeyDown?.(e)
  }

  return (
    <textarea
      ref={setRefs}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
})

export default SmartTextarea
