'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import OrderedList from '@tiptap/extension-ordered-list'
import { mergeAttributes } from '@tiptap/core'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { ArrowShortcuts } from '@/lib/arrowShortcuts'

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

const NUM_RE  = /^(\d+)\.\s+(.*)$/
const PAR_RE  = /^(\d+)\)\s+(.*)$/
const KOR_RE  = /^([가나다라마바사아자차카타파하])[.)]\s*(.*)$/
const BULL_RE = /^[-*▪●■]\s+(.*)$/
const SUBB_RE = /^[▫○□]\s+(.*)$/

type LegacyKind = 'ol1' | 'ol2' | 'ul3' | 'ul4' | 'h1' | 'h2' | 'h3' | 'quote' | 'blank' | 'text'
interface LegacyLine { kind: LegacyKind; body: string }

// Convert old custom markdown → HTML for Tiptap loading
// Hierarchy: 1. → 1) / 가. → • → ○
function legacyToHtml(text: string): string {
  if (!text) return '<p></p>'
  if (text.trimStart().startsWith('<')) return text

  const parsed: LegacyLine[] = text.split('\n').map(raw => {
    const t = raw.trimStart()
    const num  = t.match(NUM_RE)
    const par  = t.match(PAR_RE)
    const kor  = t.match(KOR_RE)
    const bull = t.match(BULL_RE)
    const subb = t.match(SUBB_RE)
    if (num)  return { kind: 'ol1',   body: num[2] }
    if (par)  return { kind: 'ol2',   body: par[2] }
    if (kor)  return { kind: 'ol2',   body: kor[2] }
    if (bull) return { kind: 'ul3',   body: bull[1] }
    if (subb) return { kind: 'ul4',   body: subb[1] }
    if (t.startsWith('# '))   return { kind: 'h1',    body: t.slice(2) }
    if (t.startsWith('## '))  return { kind: 'h2',    body: t.slice(3) }
    if (t.startsWith('### ')) return { kind: 'h3',    body: t.slice(4) }
    if (t.startsWith('> '))   return { kind: 'quote', body: t.slice(2) }
    if (t === '')             return { kind: 'blank',  body: '' }
    return { kind: 'text', body: t }
  })

  let html = ''
  let i = 0

  while (i < parsed.length) {
    const item = parsed[i]

    if (item.kind === 'ol1') {
      html += '<ol>'
      while (i < parsed.length && ['ol1', 'ol2', 'ul3', 'ul4'].includes(parsed[i].kind)) {
        if (parsed[i].kind === 'ol1') {
          html += `<li>${inlineToHtml(parsed[i].body)}`
          i++
          // Collect sub-items belonging to this ol1 item
          if (i < parsed.length && parsed[i].kind === 'ol2') {
            html += '<ol>'
            while (i < parsed.length && parsed[i].kind === 'ol2') {
              html += `<li>${inlineToHtml(parsed[i].body)}`
              i++
              if (i < parsed.length && parsed[i].kind === 'ul3') {
                html += '<ul>'
                while (i < parsed.length && (parsed[i].kind === 'ul3' || parsed[i].kind === 'ul4')) {
                  if (parsed[i].kind === 'ul3') {
                    html += `<li>${inlineToHtml(parsed[i].body)}`
                    i++
                    if (i < parsed.length && parsed[i].kind === 'ul4') {
                      html += '<ul>'
                      while (i < parsed.length && parsed[i].kind === 'ul4') {
                        html += `<li>${inlineToHtml(parsed[i].body)}</li>`
                        i++
                      }
                      html += '</ul>'
                    }
                    html += '</li>'
                  } else { break }
                }
                html += '</ul>'
              }
              html += '</li>'
            }
            html += '</ol>'
          } else if (i < parsed.length && parsed[i].kind === 'ul3') {
            html += '<ul>'
            while (i < parsed.length && (parsed[i].kind === 'ul3' || parsed[i].kind === 'ul4')) {
              if (parsed[i].kind === 'ul3') {
                html += `<li>${inlineToHtml(parsed[i].body)}`
                i++
                if (i < parsed.length && parsed[i].kind === 'ul4') {
                  html += '<ul>'
                  while (i < parsed.length && parsed[i].kind === 'ul4') {
                    html += `<li>${inlineToHtml(parsed[i].body)}</li>`
                    i++
                  }
                  html += '</ul>'
                }
                html += '</li>'
              } else { break }
            }
            html += '</ul>'
          }
          html += '</li>'
        } else {
          // ol2/ul3/ul4 without preceding ol1 — treat as standalone within this ol
          html += `<li>${inlineToHtml(parsed[i].body)}</li>`
          i++
        }
      }
      html += '</ol>'
    } else if (item.kind === 'ol2') {
      html += '<ol>'
      while (i < parsed.length && parsed[i].kind === 'ol2') {
        html += `<li>${inlineToHtml(parsed[i].body)}</li>`
        i++
      }
      html += '</ol>'
    } else if (item.kind === 'ul3') {
      html += '<ul>'
      while (i < parsed.length && (parsed[i].kind === 'ul3' || parsed[i].kind === 'ul4')) {
        if (parsed[i].kind === 'ul3') {
          html += `<li>${inlineToHtml(parsed[i].body)}`
          i++
          if (i < parsed.length && parsed[i].kind === 'ul4') {
            html += '<ul>'
            while (i < parsed.length && parsed[i].kind === 'ul4') {
              html += `<li>${inlineToHtml(parsed[i].body)}</li>`
              i++
            }
            html += '</ul>'
          }
          html += '</li>'
        } else { break }
      }
      html += '</ul>'
    } else if (item.kind === 'ul4') {
      html += '<ul>'
      while (i < parsed.length && parsed[i].kind === 'ul4') {
        html += `<li>${inlineToHtml(parsed[i].body)}</li>`
        i++
      }
      html += '</ul>'
    } else if (item.kind === 'h1') { html += `<h1>${inlineToHtml(item.body)}</h1>`; i++
    } else if (item.kind === 'h2') { html += `<h2>${inlineToHtml(item.body)}</h2>`; i++
    } else if (item.kind === 'h3') { html += `<h3>${inlineToHtml(item.body)}</h3>`; i++
    } else if (item.kind === 'quote') { html += `<p><strong>${inlineToHtml(item.body)}</strong></p>`; i++
    } else if (item.kind === 'blank') { html += '<p></p>'; i++
    } else { html += `<p>${inlineToHtml(item.body)}</p>`; i++ }
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

// list-style:none + CSS counter로 4단계(1. → 1) → • → ○) 넘버링을 직접 그리다 보니
// counter-reset이 항상 0에서 시작해서, "2."를 입력해 만든 ol의 start="2"가 화면엔
// 반영 안 되고 무조건 1부터 보이는 문제가 있었다 — start를 --ol-start CSS 변수로도
// 내보내서 globals.css의 counter-reset이 그 값에서 이어가도록 한다.
const CustomOrderedList = OrderedList.extend({
  renderHTML({ HTMLAttributes }) {
    const { start, type, ...rest } = HTMLAttributes
    const attrs = mergeAttributes(this.options.HTMLAttributes, rest)
    if (start !== 1) {
      attrs.start = start
      attrs.style = `--ol-start:${start - 1}`
    }
    if (type && type !== '1') attrs.type = type
    return ['ol', attrs, 0]
  },
})

// 모듈 레벨 상수 — 렌더마다 새 참조 생성 방지 (Tiptap v3에서 extensions 참조 변경 시 refreshEditorInstance 호출됨)
const EXTENSIONS = [
  StarterKit.configure({ orderedList: false }),  // StarterKit v3에 Underline 포함
  CustomOrderedList,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Image.configure({ allowBase64: true }),
  ArrowShortcuts,
]

interface Props {
  value: string
  onChange: (html: string) => void
  onSubmit?: () => void
  onEscape?: () => void
  onExpand?: () => void
  onSelectionChange?: (text: string) => void
  autoFocus?: boolean
  minHeight?: number
  className?: string
  dark?: boolean
  hideToolbar?: boolean
}

export default function TiptapEditor({
  value, onChange, onSubmit, onEscape, onExpand, onSelectionChange, autoFocus, minHeight = 160, className, dark, hideToolbar,
}: Props) {
  // Refs로 콜백 최신값 유지 — useCallback deps를 [] 로 고정해 Tiptap이 매 렌더마다 options 변경을 감지하지 않도록 함
  const onChangeRef          = useRef(onChange)
  const onSubmitRef          = useRef(onSubmit)
  const onEscapeRef          = useRef(onEscape)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const editorRef            = useRef<ReturnType<typeof useEditor>>(null)
  useEffect(() => {
    onChangeRef.current = onChange
    onSubmitRef.current = onSubmit
    onEscapeRef.current = onEscape
    onSelectionChangeRef.current = onSelectionChange
  })

  const stableKeyDown = useCallback((_view: unknown, e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { onSubmitRef.current?.(); return true }
    if (e.key === 'Escape') { onEscapeRef.current?.(); return true }
    const ed = editorRef.current
    if (!ed) return false
    if (e.altKey && e.key === '1') {
      ed.isActive('textStyle', { color: '#EF4444' })
        ? ed.chain().focus().unsetColor().run()
        : ed.chain().focus().setColor('#EF4444').run()
      return true
    }
    if (e.altKey && e.key === '2') {
      ed.chain().focus().toggleHighlight({ color: '#FEF08A' }).run()
      return true
    }
    // Tab/Shift-Tab을 리스트 밖(또는 더 이상 들여쓰기/내어쓰기 불가한 위치)에서 누르면
    // sinkListItem/liftListItem이 실패(false)해 브라우저 기본 동작인 "다음 포커스 요소로 이동"이
    // 발생해 에디터 밖으로 커서가 튕겨나갔다 — 항상 여기서 처리하고 true를 반환해 막는다.
    if (e.key === 'Tab') {
      e.shiftKey
        ? ed.chain().focus().liftListItem('listItem').run()
        : ed.chain().focus().sinkListItem('listItem').run()
      return true
    }
    return false
  }, [])

  const stablePaste = useCallback((_view: unknown, e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return false
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue
        const reader = new FileReader()
        reader.onload = ev => {
          const src = ev.target?.result as string
          editorRef.current?.chain().focus().setImage({ src }).run()
        }
        reader.readAsDataURL(blob)
        return true
      }
    }
    return false
  }, [])

  const stableDrop = useCallback((_view: unknown, e: DragEvent, _slice: unknown, moved: boolean) => {
    if (moved || !e.dataTransfer?.files.length) return false
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith('image/')) {
        e.preventDefault()
        const reader = new FileReader()
        reader.onload = ev => {
          const src = ev.target?.result as string
          editorRef.current?.chain().focus().setImage({ src }).run()
        }
        reader.readAsDataURL(file)
        return true
      }
    }
    return false
  }, [])

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: legacyToHtml(value),
    editorProps: {
      attributes: { class: `${dark ? 'tiptap-input-dark' : 'tiptap-input'} outline-none`, style: `min-height:${minHeight}px; padding:8px 0;` },
      handleKeyDown: stableKeyDown,
      handlePaste: stablePaste,
      handleDrop: stableDrop,
    },
  })

  editorRef.current = editor

  // useEditor options의 onUpdate/onSelectionUpdate는 Tiptap v3에서 신뢰성 없음.
  // editor.on() 방식으로 등록해야 실제로 발화함.
  useEffect(() => {
    if (!editor) return
    const handleUpdate = () => { onChangeRef.current(editor.getHTML()) }
    const handleSelection = () => {
      if (!onSelectionChangeRef.current) return
      const { from, to } = editor.state.selection
      const text = from !== to ? editor.state.doc.textBetween(from, to, ' ').trim() : ''
      onSelectionChangeRef.current(text)
    }
    editor.on('update', handleUpdate)
    editor.on('selectionUpdate', handleSelection)
    return () => {
      editor.off('update', handleUpdate)
      editor.off('selectionUpdate', handleSelection)
    }
  }, [editor])

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
      {!hideToolbar && <div className={`flex items-center gap-0.5 border-b pb-2 mb-2 flex-wrap ${d ? 'border-[rgba(255,255,255,0.09)]' : 'border-gray-100'}`}>
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
            style={{ backgroundColor: hex }} title={`${label}${hex === '#EF4444' ? ' (Alt+1)' : ''}`} />
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
            style={{ backgroundColor: hex }} title={`형광 ${label}${hex === '#FEF08A' ? ' (Alt+2)' : ''}`} />
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
      </div>}

      <EditorContent editor={editor} />
    </div>
  )
}
