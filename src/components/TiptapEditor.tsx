'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'

const COLOR_MAP: Record<string, string> = {
  red: '#EF4444', blue: '#3B82F6', green: '#22C55E',
  orange: '#F97316', purple: '#A855F7', gray: '#9CA3AF',
}

function inlineToHtml(text: string): string {
  let s = text
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__(.+?)__/g, '<u>$1</u>')
  s = s.replace(/!!(.+?)!!/g, '<span style="color:#EF4444">$1</span>')
  s = s.replace(/==(.+?)==/g, '<mark style="background:rgba(250,204,21,0.35);border-radius:2px;padding:0 2px">$1</mark>')
  s = s.replace(/~~(.+?)~~/g, '<s>$1</s>')
  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    s = s.replace(new RegExp(`\\{${name}\\}(.+?)\\{\\/${name}\\}`, 'g'), `<span style="color:${hex}">$1</span>`)
  }
  return s
}

const NUM_RE  = /^(\d+)\.\s*(.*)$/
const KOR_RE  = /^([가나다라마바사아자차카타파하])\.\s*(.*)$/
const PAR_RE  = /^(\d+)\)\s*(.*)$/
const BULL_RE = /^[▪●■]\s*(.*)$/
const SUBB_RE = /^[▫○□]\s*(.*)$/

// Convert old custom markdown → HTML for Tiptap loading
function legacyToHtml(text: string): string {
  if (!text) return '<p></p>'
  if (text.trimStart().startsWith('<')) return text
  const lines = text.split('\n')
  let html = ''
  let inOL = false
  let inUL = false

  const closeOL = () => { if (inOL) { html += '</ol>'; inOL = false } }
  const closeUL = () => { if (inUL) { html += '</ul>'; inUL = false } }

  for (const line of lines) {
    const num  = line.match(NUM_RE)
    const kor  = line.match(KOR_RE)
    const par  = line.match(PAR_RE)
    const bull = line.match(BULL_RE)
    const subb = line.match(SUBB_RE)

    if (num || kor || par) {
      closeUL()
      if (!inOL) { html += '<ol>'; inOL = true }
      const body = (num?.[2] ?? kor?.[2] ?? par?.[2]) ?? ''
      html += `<li>${inlineToHtml(body)}</li>`
    } else if (bull || subb) {
      closeOL()
      if (!inUL) { html += '<ul>'; inUL = true }
      html += `<li>${inlineToHtml((bull?.[1] ?? subb?.[1]) ?? '')}</li>`
    } else {
      closeOL(); closeUL()
      if (line.startsWith('# '))   html += `<h1>${inlineToHtml(line.slice(2))}</h1>`
      else if (line.startsWith('## '))  html += `<h2>${inlineToHtml(line.slice(3))}</h2>`
      else if (line.startsWith('### ')) html += `<h3>${inlineToHtml(line.slice(4))}</h3>`
      else if (line.startsWith('> '))   html += `<p><strong>${inlineToHtml(line.slice(2))}</strong></p>`
      else if (line === '')              html += '<p></p>'
      else                               html += `<p>${inlineToHtml(line)}</p>`
    }
  }
  closeOL(); closeUL()
  return html || '<p></p>'
}

const TEXT_COLORS = [
  { hex: '#EF4444', label: 'red' },
  { hex: '#3B82F6', label: 'blue' },
  { hex: '#22C55E', label: 'green' },
  { hex: '#F97316', label: 'orange' },
  { hex: '#A855F7', label: 'purple' },
  { hex: '#9CA3AF', label: 'gray' },
]

const HIGHLIGHTS = [
  { hex: '#FEF08A', label: '노랑' },
  { hex: '#BBF7D0', label: '초록' },
  { hex: '#BFDBFE', label: '파랑' },
  { hex: '#FBCFE8', label: '핑크' },
]

// 모듈 레벨 상수 — 렌더마다 새 참조 생성 방지 (Tiptap v3에서 extensions 참조 변경 시 refreshEditorInstance 호출됨)
const EXTENSIONS = [
  StarterKit,  // StarterKit v3에 Underline 포함
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
]

interface Props {
  value: string
  onChange: (html: string) => void
  onSubmit?: () => void
  onEscape?: () => void
  onExpand?: () => void
  autoFocus?: boolean
  minHeight?: number
  className?: string
  dark?: boolean
}

export default function TiptapEditor({
  value, onChange, onSubmit, onEscape, onExpand, autoFocus, minHeight = 160, className, dark,
}: Props) {
  // Refs로 콜백 최신값 유지 — useCallback deps를 [] 로 고정해 Tiptap이 매 렌더마다 options 변경을 감지하지 않도록 함
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const onEscapeRef = useRef(onEscape)
  const editorRef   = useRef<ReturnType<typeof useEditor>>(null)
  useEffect(() => { onChangeRef.current = onChange; onSubmitRef.current = onSubmit; onEscapeRef.current = onEscape })

  const stableOnUpdate = useCallback(({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) => {
    onChangeRef.current(editor.getHTML())
  }, [])

  const stableKeyDown = useCallback((_view: unknown, e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { onSubmitRef.current?.(); return true }
    if (e.key === 'Escape') { onEscapeRef.current?.(); return true }
    const ed = editorRef.current
    if (!ed) return false
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
      ed.isActive('textStyle', { color: '#EF4444' })
        ? ed.chain().focus().unsetColor().run()
        : ed.chain().focus().setColor('#EF4444').run()
      return true
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '2') {
      ed.chain().focus().toggleHighlight({ color: '#FEF08A' }).run()
      return true
    }
    return false
  }, [])

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: legacyToHtml(value),
    onUpdate: stableOnUpdate,
    editorProps: {
      attributes: { class: `${dark ? 'tiptap-input-dark' : 'tiptap-input'} outline-none`, style: `min-height:${minHeight}px; padding:8px 0;` },
      handleKeyDown: stableKeyDown,
    },
  })

  editorRef.current = editor

  useEffect(() => {
    if (autoFocus && editor) {
      const t = setTimeout(() => editor.commands.focus('end'), 50)
      return () => clearTimeout(t)
    }
  }, [autoFocus, editor])

  if (!editor) return null

  const d = dark
  const btnCls = (active: boolean, extra = '') =>
    `text-xs px-2 py-1 rounded min-w-[26px] ${extra} ${active
      ? (d ? 'bg-[rgba(255,255,255,0.12)] text-[#E2E8F0]' : 'bg-gray-200 text-gray-900')
      : (d ? 'hover:bg-[rgba(255,255,255,0.08)] text-[rgba(226,232,240,0.5)]' : 'hover:bg-gray-100 text-gray-600')}`
  const divCls = d ? 'w-px h-4 bg-[rgba(255,255,255,0.15)] mx-0.5' : 'w-px h-4 bg-gray-200 mx-0.5'
  const resetCls = d ? 'text-[10px] text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.6)] px-0.5' : 'text-[10px] text-gray-400 hover:text-gray-700 px-0.5'

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className={`flex items-center gap-0.5 border-b pb-2 mb-2 flex-wrap ${d ? 'border-[rgba(255,255,255,0.09)]' : 'border-gray-100'}`}>
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          className={btnCls(editor.isActive('bold'), 'font-bold')}>B</button>
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
          className={btnCls(editor.isActive('underline'), 'underline')}>U</button>

        <div className={divCls} />
        {([1, 2, 3] as const).map(level => (
          <button key={level} type="button"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level }).run() }}
            className={btnCls(editor.isActive('heading', { level }), 'text-[11px] font-semibold')}>H{level}</button>
        ))}

        <div className={divCls} />
        {/* Text colors */}
        {TEXT_COLORS.map(({ hex, label }) => (
          <button key={label} type="button"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(hex).run() }}
            className="w-[14px] h-[14px] rounded-full hover:scale-125 flex-shrink-0 transition-transform"
            style={{ backgroundColor: hex }} title={`${label}${hex === '#EF4444' ? ' (Ctrl+1)' : ''}`} />
        ))}
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetColor().run() }}
          className={resetCls} title="글자색 제거">⊘</button>

        <div className={divCls} />
        {/* Highlights */}
        {HIGHLIGHTS.map(({ hex, label }) => (
          <button key={label} type="button"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHighlight({ color: hex }).run() }}
            className={`w-[14px] h-[14px] rounded hover:scale-125 flex-shrink-0 transition-transform border ${d ? 'border-[rgba(255,255,255,0.2)]' : 'border-gray-200'}`}
            style={{ backgroundColor: hex }} title={`형광 ${label}${hex === '#FEF08A' ? ' (Ctrl+2)' : ''}`} />
        ))}
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetHighlight().run() }}
          className={resetCls} title="형광 제거">⊘</button>

        {onExpand && (
          <>
            <div className={divCls} />
            <button type="button"
              onMouseDown={e => { e.preventDefault(); onExpand() }}
              className={`ml-auto text-xs px-1.5 py-1 rounded ${d ? 'hover:bg-[rgba(255,255,255,0.08)] text-[rgba(226,232,240,0.3)]' : 'hover:bg-gray-100 text-gray-400'}`} title="크게 쓰기">⛶</button>
          </>
        )}
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}
