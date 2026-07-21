'use client'

import { useRef, useEffect, forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
}

const INDENT_SIZE = 5
const KOREAN = '가나다라마바사아자차카타파하'.split('')

function getLineStart(text: string, pos: number): number {
  const idx = text.lastIndexOf('\n', pos - 1)
  return idx === -1 ? 0 : idx + 1
}

function getLineEnd(text: string, pos: number): number {
  const idx = text.indexOf('\n', pos)
  return idx === -1 ? text.length : idx
}

type ListType = 'number' | 'korean' | 'paren' | 'bullet' | 'subbullet' | 'none'

interface LineInfo {
  type: ListType
  seq: number | string
  indentLevel: number
  prefix: string
  content: string
}

function parseLineInfo(line: string): LineInfo {
  const m = line.match(/^( *)/)
  const spaces = m?.[1].length ?? 0
  const indentLevel = Math.floor(spaces / INDENT_SIZE)
  const trimmed = line.slice(spaces)
  let n: RegExpMatchArray | null

  n = trimmed.match(/^(\d+)\. (.*)$/)
  if (n) return { type: 'number', seq: parseInt(n[1]), indentLevel, prefix: ' '.repeat(indentLevel * INDENT_SIZE) + n[1] + '. ', content: n[2] }

  n = trimmed.match(/^([가나다라마바사아자차카타파하])\. (.*)$/)
  if (n) return { type: 'korean', seq: n[1], indentLevel, prefix: ' '.repeat(indentLevel * INDENT_SIZE) + n[1] + '. ', content: n[2] }

  n = trimmed.match(/^(\d+)\) (.*)$/)
  if (n) return { type: 'paren', seq: parseInt(n[1]), indentLevel, prefix: ' '.repeat(indentLevel * INDENT_SIZE) + n[1] + ') ', content: n[2] }

  n = trimmed.match(/^[●▪] (.*)$/)
  if (n) return { type: 'bullet', seq: 0, indentLevel, prefix: ' '.repeat(indentLevel * INDENT_SIZE) + '▪ ', content: n[1] }

  n = trimmed.match(/^[○▫] (.*)$/)
  if (n) return { type: 'subbullet', seq: 0, indentLevel, prefix: ' '.repeat(indentLevel * INDENT_SIZE) + '▫ ', content: n[1] }

  return { type: 'none', seq: 0, indentLevel, prefix: '', content: line }
}

function makePrefix(type: ListType, seq: number | string, indentLevel: number): string {
  const ind = ' '.repeat(indentLevel * INDENT_SIZE)
  if (type === 'number') return ind + seq + '. '
  if (type === 'korean') return ind + seq + '. '
  if (type === 'paren') return ind + seq + ') '
  if (type === 'bullet') return ind + '▪ '
  if (type === 'subbullet') return ind + '▫ '
  return ind
}

function advance(type: ListType, seq: number | string): number | string {
  if (type === 'number' || type === 'paren') return (seq as number) + 1
  if (type === 'korean') {
    const i = KOREAN.indexOf(seq as string)
    return i >= 0 && i < KOREAN.length - 1 ? KOREAN[i + 1] : '가'
  }
  return seq
}

function findNextSeq(lines: string[], beforeIdx: number, type: ListType, indentLevel: number): number | string {
  for (let i = beforeIdx - 1; i >= 0; i--) {
    const info = parseLineInfo(lines[i])
    if (info.indentLevel < indentLevel) break
    if (info.indentLevel === indentLevel && info.type === type) return advance(type, info.seq)
  }
  return type === 'korean' ? '가' : 1
}

function renumberSequential(lines: string[]): string[] {
  const result = [...lines]
  const lastSeq: Map<string, number | string> = new Map()

  for (let i = 0; i < result.length; i++) {
    const info = parseLineInfo(result[i])

    if (info.type === 'none') {
      if (!info.content.trim()) lastSeq.clear()
      continue
    }
    if (info.type === 'bullet' || info.type === 'subbullet') continue

    for (const k of [...lastSeq.keys()]) {
      if (parseInt(k.split('-')[1]) > info.indentLevel) lastSeq.delete(k)
    }

    const key = `${info.type}-${info.indentLevel}`
    const nextSeq: number | string = lastSeq.has(key)
      ? advance(info.type, lastSeq.get(key)!)
      : (info.type === 'korean' ? '가' : 1)

    result[i] = makePrefix(info.type, nextSeq, info.indentLevel) + info.content
    lastSeq.set(key, nextSeq)
  }
  return result
}

function renumberForward(lines: string[], fromIdx: number, indentLevel: number, type: ListType, startSeq: number | string): string[] {
  if (type === 'bullet' || type === 'subbullet' || type === 'none') return lines
  let seq = startSeq
  const result = [...lines]
  for (let i = fromIdx; i < result.length; i++) {
    const info = parseLineInfo(result[i])
    if (info.indentLevel < indentLevel) break
    if (info.indentLevel !== indentLevel || info.type !== type) continue
    result[i] = makePrefix(type, seq, indentLevel) + info.content
    seq = advance(type, seq)
  }
  return result
}

function replaceRange(el: HTMLTextAreaElement, start: number, end: number, text: string) {
  el.focus()
  el.setSelectionRange(start, end)
  document.execCommand('insertText', false, text)
}

// ── Custom undo/redo stack ──────────────────────────────────────────────────
interface HistoryEntry { value: string; cursor: number }

const SmartTextarea = forwardRef<HTMLTextAreaElement, Props>(function SmartTextarea(
  { value, onChange, onKeyDown, ...props },
  forwardedRef
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingCursor = useRef<number | null>(null)

  // History
  const historyStack = useRef<HistoryEntry[]>([])
  const historyIndex = useRef(-1)
  const historyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed initial history entry once on mount
  useEffect(() => {
    historyStack.current = [{ value, cursor: value.length }]
    historyIndex.current = 0
    return () => { if (historyDebounce.current) clearTimeout(historyDebounce.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function pushHistory(val: string, cursor: number) {
    const top = historyStack.current[historyIndex.current]
    if (top?.value === val) return
    // Discard forward entries
    historyStack.current = historyStack.current.slice(0, historyIndex.current + 1)
    historyStack.current.push({ value: val, cursor })
    // Keep at most 200 entries
    if (historyStack.current.length > 200) historyStack.current.shift()
    historyIndex.current = historyStack.current.length - 1
  }

  // Debounced push for regular typing; immediate for structural ops
  function commitHistory(val: string, cursor: number, immediate = false) {
    if (historyDebounce.current) clearTimeout(historyDebounce.current)
    if (immediate) {
      pushHistory(val, cursor)
    } else {
      historyDebounce.current = setTimeout(() => pushHistory(val, cursor), 500)
    }
  }

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

  useEffect(() => {
    const el = localRef.current
    if (!el) return
    const scrollParent = (() => {
      let node: HTMLElement | null = el.parentElement
      while (node && node !== document.body) {
        const { overflowY } = getComputedStyle(node)
        if (overflowY === 'auto' || overflowY === 'scroll') return node
        node = node.parentElement
      }
      return document.documentElement
    })()
    const savedScrollTop = scrollParent.scrollTop
    el.style.overflow = 'hidden'
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    scrollParent.scrollTop = savedScrollTop
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    const lineStart = getLineStart(value, start)
    const lineEnd = getLineEnd(value, start)
    const line = value.slice(lineStart, lineEnd)
    const info = parseLineInfo(line)

    // ── Undo / Redo ──────────────────────────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      if (historyDebounce.current) { clearTimeout(historyDebounce.current); historyDebounce.current = null; pushHistory(value, start) }
      if (historyIndex.current > 0) {
        historyIndex.current--
        const snap = historyStack.current[historyIndex.current]
        onChange(snap.value)
        pendingCursor.current = snap.cursor
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      if (historyIndex.current < historyStack.current.length - 1) {
        historyIndex.current++
        const snap = historyStack.current[historyIndex.current]
        onChange(snap.value)
        pendingCursor.current = snap.cursor
      }
      return
    }

    // ── Enter: continue list ─────────────────────────────────────────────────
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      if (info.type === 'none') { onKeyDown?.(e); return }
      if (e.nativeEvent.isComposing) { onKeyDown?.(e); return }
      e.preventDefault()

      if (!info.content.trim()) {
        const newVal = value.slice(0, lineStart) + value.slice(lineEnd)
        onChange(newVal)
        commitHistory(newVal, lineStart, true)
        pendingCursor.current = lineStart
        return
      }

      const nSeq = advance(info.type, info.seq)
      const newPrefix = makePrefix(info.type, nSeq, info.indentLevel)
      const textAfterCursor = value.slice(start, lineEnd)
      // replaceRange fires native input → handleNativeChange will commit history
      replaceRange(el, start, lineEnd, '\n' + newPrefix + textAfterCursor)
      pendingCursor.current = start + 1 + newPrefix.length
      return
    }

    // ── Space: '- ' → '▪ ' ──────────────────────────────────────────────────
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const linePos = start - lineStart
      const beforeCursor = line.slice(0, linePos)
      const leading = beforeCursor.length - beforeCursor.trimStart().length
      if (beforeCursor.trimStart() === '-') {
        e.preventDefault()
        replaceRange(el, lineStart + leading, start, '▪ ')
        return
      }
    }

    // ── '->' / '-<' → arrow ─────────────────────────────────────────────────
    if ((e.key === '>' || e.key === '<') && !e.ctrlKey && !e.metaKey && !e.shiftKey && start === end) {
      const prevChar = value.slice(start - 1, start)
      if (prevChar === '-') {
        e.preventDefault()
        const prevPrev = start >= 2 ? value.slice(start - 2, start - 1) : ''
        const lead = prevPrev === ' ' ? '' : ' '
        const arrow = e.key === '>' ? `${lead}→ ` : `${lead}← `
        replaceRange(el, start - 1, end, arrow)
        return
      }
    }

    // ── Ctrl+B / Ctrl+U / Ctrl+1 / Ctrl+2 ──────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const sel = value.slice(start, end)
      if (e.key === 'b') {
        e.preventDefault()
        const newVal = value.slice(0, start) + '**' + sel + '**' + value.slice(end)
        onChange(newVal)
        commitHistory(newVal, start + 2, true)
        setTimeout(() => { el.selectionStart = start + 2; el.selectionEnd = end + 2 }, 0)
        return
      }
      if (e.key === 'u') {
        e.preventDefault()
        const newVal = value.slice(0, start) + '__' + sel + '__' + value.slice(end)
        onChange(newVal)
        commitHistory(newVal, start + 2, true)
        setTimeout(() => { el.selectionStart = start + 2; el.selectionEnd = end + 2 }, 0)
        return
      }
      if (e.key === '1') {
        e.preventDefault()
        e.stopPropagation()
        const lineText = value.slice(lineStart, lineEnd)
        let newLine: string
        if (lineText.startsWith('# ')) newLine = lineText.slice(2)
        else if (lineText.startsWith('## ')) newLine = '# ' + lineText.slice(3)
        else newLine = '# ' + lineText
        const delta = newLine.length - lineText.length
        const newVal = value.slice(0, lineStart) + newLine + value.slice(lineEnd)
        onChange(newVal)
        commitHistory(newVal, start + delta, true)
        pendingCursor.current = Math.max(lineStart, start + delta)
        return
      }
      if (e.key === '2') {
        e.preventDefault()
        e.stopPropagation()
        const lineText = value.slice(lineStart, lineEnd)
        let newLine: string
        if (lineText.startsWith('## ')) newLine = lineText.slice(3)
        else if (lineText.startsWith('# ')) newLine = '## ' + lineText.slice(2)
        else newLine = '## ' + lineText
        const delta = newLine.length - lineText.length
        const newVal = value.slice(0, lineStart) + newLine + value.slice(lineEnd)
        onChange(newVal)
        commitHistory(newVal, start + delta, true)
        pendingCursor.current = Math.max(lineStart, start + delta)
        return
      }
    }

    // ── Tab: demote / promote ────────────────────────────────────────────────
    if (e.key === 'Tab') {
      e.preventDefault()
      const lines = value.split('\n')
      const lineIdx = value.slice(0, lineStart).split('\n').length - 1

      if (!e.shiftKey) {
        const demoteMap: Partial<Record<ListType, ListType>> = {
          number: 'korean', korean: 'paren', paren: 'bullet', bullet: 'subbullet',
        }
        const newType = demoteMap[info.type]
        if (!newType) {
          const newVal = value.slice(0, start) + ' '.repeat(INDENT_SIZE) + value.slice(end)
          onChange(newVal)
          const cur = start + INDENT_SIZE
          commitHistory(newVal, cur, true)
          pendingCursor.current = cur
          return
        }
        const newIndent = info.indentLevel + 1
        const seq = findNextSeq(lines, lineIdx, newType, newIndent)
        const newPrefix = makePrefix(newType, seq, newIndent)
        const newLines = [...lines]
        newLines[lineIdx] = newPrefix + info.content
        const newVal = renumberSequential(newLines).join('\n')
        onChange(newVal)
        const cur = lineStart + newPrefix.length
        commitHistory(newVal, cur, true)
        pendingCursor.current = cur
      } else {
        const promoteMap: Partial<Record<ListType, ListType>> = {
          subbullet: 'bullet', bullet: 'paren', paren: 'korean', korean: 'number',
        }
        const newType = promoteMap[info.type]
        if (!newType) {
          if (line.startsWith(' '.repeat(INDENT_SIZE))) {
            const newVal = value.slice(0, lineStart) + line.slice(INDENT_SIZE) + value.slice(lineEnd)
            onChange(newVal)
            const cur = Math.max(lineStart, start - INDENT_SIZE)
            commitHistory(newVal, cur, true)
            pendingCursor.current = cur
          }
          return
        }
        const newIndent = Math.max(0, info.indentLevel - 1)
        const seq = findNextSeq(lines, lineIdx, newType, newIndent)
        const newPrefix = makePrefix(newType, seq, newIndent)
        const newLines = [...lines]
        newLines[lineIdx] = newPrefix + info.content
        const newVal = renumberSequential(newLines).join('\n')
        onChange(newVal)
        const cur = lineStart + newPrefix.length
        commitHistory(newVal, cur, true)
        pendingCursor.current = cur
      }
      return
    }

    onKeyDown?.(e)
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const rawValue = e.target.value
    const cursor = e.target.selectionStart
    const lines = rawValue.split('\n')
    const renumbered = renumberSequential(lines)
    const newValue = renumbered.join('\n')
    onChange(newValue)

    let adjustedCursor = cursor
    if (newValue !== rawValue) {
      let charPos = 0
      let adjustment = 0
      for (let i = 0; i < lines.length; i++) {
        const lineEnd = charPos + lines[i].length
        if (lineEnd >= cursor) break
        adjustment += renumbered[i].length - lines[i].length
        charPos += lines[i].length + 1
      }
      adjustedCursor = cursor + adjustment
      pendingCursor.current = adjustedCursor
    }

    commitHistory(newValue, adjustedCursor)
  }

  return (
    <textarea
      ref={setRefs}
      value={value}
      onChange={handleNativeChange}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
})

export default SmartTextarea
