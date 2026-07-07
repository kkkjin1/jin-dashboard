'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
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
  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    s = s.replace(new RegExp(`\\{${name}\\}(.+?)\\{\\/${name}\\}`, 'g'), `<span style="color:${hex}">$1</span>`)
  }
  return s
}

// Convert old custom markdown → HTML for Tiptap loading
function legacyToHtml(text: string): string {
  if (!text) return '<p></p>'
  if (text.trimStart().startsWith('<')) return text
  const lines = text.split('\n')
  let html = ''
  for (const line of lines) {
    if (line.startsWith('# ')) html += `<h1>${inlineToHtml(line.slice(2))}</h1>`
    else if (line.startsWith('## ')) html += `<h2>${inlineToHtml(line.slice(3))}</h2>`
    else if (line.startsWith('### ')) html += `<h3>${inlineToHtml(line.slice(4))}</h3>`
    else if (line.startsWith('> ')) html += `<p><strong>${inlineToHtml(line.slice(2))}</strong></p>`
    else if (line === '') html += '<p></p>'
    else html += `<p>${inlineToHtml(line)}</p>`
  }
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

interface Props {
  value: string
  onChange: (html: string) => void
  onSubmit?: () => void
  onEscape?: () => void
  onExpand?: () => void
  autoFocus?: boolean
  minHeight?: number
  className?: string
}

export default function TiptapEditor({
  value, onChange, onSubmit, onEscape, onExpand, autoFocus, minHeight = 160, className,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: legacyToHtml(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'tiptap-input outline-none',
        style: `min-height:${minHeight}px; padding:8px 0;`,
      },
      handleKeyDown: (_view, e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { onSubmit?.(); return true }
        if (e.key === 'Escape') { onEscape?.(); return true }
        // Ctrl+Q → 빨강 텍스트 토글
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'q') {
          if (editor?.isActive('textStyle', { color: '#EF4444' })) {
            editor.chain().focus().unsetColor().run()
          } else {
            editor?.chain().focus().setColor('#EF4444').run()
          }
          return true
        }
        // Ctrl+W → 노랑 형광펜 토글
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'w') {
          editor?.chain().focus().toggleHighlight({ color: '#FEF08A' }).run()
          return true
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (autoFocus && editor) {
      const t = setTimeout(() => editor.commands.focus('end'), 50)
      return () => clearTimeout(t)
    }
  }, [autoFocus, editor])

  if (!editor) return null

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-gray-100 pb-2 mb-2 flex-wrap">
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          className={`text-xs font-bold px-2 py-1 rounded min-w-[26px] ${editor.isActive('bold') ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-600'}`}>B</button>
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
          className={`text-xs underline px-2 py-1 rounded min-w-[26px] ${editor.isActive('underline') ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-600'}`}>U</button>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        {([1, 2, 3] as const).map(level => (
          <button key={level} type="button"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level }).run() }}
            className={`text-[11px] px-1.5 py-1 rounded font-semibold ${editor.isActive('heading', { level }) ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-600'}`}>H{level}</button>
        ))}

        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        {/* Text colors */}
        {TEXT_COLORS.map(({ hex, label }) => (
          <button key={label} type="button"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(hex).run() }}
            className="w-[14px] h-[14px] rounded-full hover:scale-125 flex-shrink-0 transition-transform"
            style={{ backgroundColor: hex }} title={`${label}${hex === '#EF4444' ? ' (Ctrl+Q)' : ''}`} />
        ))}
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetColor().run() }}
          className="text-[10px] text-gray-400 hover:text-gray-700 px-0.5" title="글자색 제거">⊘</button>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        {/* Highlights */}
        {HIGHLIGHTS.map(({ hex, label }) => (
          <button key={label} type="button"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHighlight({ color: hex }).run() }}
            className="w-[14px] h-[14px] rounded hover:scale-125 flex-shrink-0 transition-transform border border-gray-200"
            style={{ backgroundColor: hex }} title={`형광 ${label}${hex === '#FEF08A' ? ' (Ctrl+W)' : ''}`} />
        ))}
        <button type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetHighlight().run() }}
          className="text-[10px] text-gray-400 hover:text-gray-700 px-0.5" title="형광 제거">⊘</button>

        {onExpand && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <button type="button"
              onMouseDown={e => { e.preventDefault(); onExpand() }}
              className="ml-auto text-xs px-1.5 py-1 rounded hover:bg-gray-100 text-gray-400" title="크게 쓰기">⛶</button>
          </>
        )}
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}
