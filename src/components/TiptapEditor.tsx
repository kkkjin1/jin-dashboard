'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { collapseEmptyParagraphs } from '@/lib/htmlCleanup'
import {
  BASE_TIPTAP_EXTENSIONS, legacyToHtml,
  removeEmptyListItemOnBackspace, spliceNestedListOnBackspace, pullAncestorSiblingOnDelete,
} from '@/lib/tiptapExtensions'

// ── Clipboard: ProseMirror document → Markdown (GFM) ─────────────────────────

function inlineToMd(node: any): string {
  let out = ''
  node.forEach((leaf: any) => {
    if (leaf.type.name !== 'text') return
    let t: string = leaf.text ?? ''
    const has = (n: string) => leaf.marks.some((m: any) => m.type.name === n)
    if (has('code')) { out += `\`${t}\``; return }
    if (has('bold')) t = `**${t}**`
    if (has('italic')) t = `_${t}_`
    if (has('strike')) t = `~~${t}~~`
    out += t
  })
  return out
}

function collectMarkdown(node: any, lines: string[], depth: number): void {
  const t: string = node.type.name
  if (t === 'paragraph') {
    lines.push(inlineToMd(node))
  } else if (t === 'heading') {
    lines.push('#'.repeat(node.attrs.level as number) + ' ' + inlineToMd(node))
  } else if (t === 'orderedList') {
    let n: number = (node.attrs.start as number) ?? 1
    node.forEach((item: any) => {
      const indent = '   '.repeat(depth)
      item.forEach((child: any) => {
        if (child.type.name === 'paragraph') {
          lines.push(`${indent}${n}. ${inlineToMd(child)}`)
        } else {
          collectMarkdown(child, lines, depth + 1)
        }
      })
      n++
    })
  } else if (t === 'bulletList') {
    node.forEach((item: any) => {
      const indent = '   '.repeat(depth)
      item.forEach((child: any) => {
        if (child.type.name === 'paragraph') {
          lines.push(`${indent}- ${inlineToMd(child)}`)
        } else {
          collectMarkdown(child, lines, depth + 1)
        }
      })
    })
  } else if (t === 'listItem') {
    // top-level listItem (edge case: partial selection starting inside list)
    node.forEach((child: any) => {
      if (child.type.name === 'paragraph') {
        lines.push('   '.repeat(depth) + '- ' + inlineToMd(child))
      } else {
        collectMarkdown(child, lines, depth + 1)
      }
    })
  } else if (t === 'blockquote') {
    const inner: string[] = []
    node.forEach((child: any) => collectMarkdown(child, inner, 0))
    inner.forEach(l => lines.push(`> ${l}`))
  } else if (t === 'codeBlock') {
    const lang: string = (node.attrs.language as string) ?? ''
    lines.push('```' + lang)
    node.forEach((c: any) => { if (c.type.name === 'text') lines.push(c.text ?? '') })
    lines.push('```')
  }
}

function pmDocToMarkdown(doc: any): string {
  const lines: string[] = []
  doc.forEach((node: any) => collectMarkdown(node, lines, 0))
  return lines.join('\n').trim()
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
const EXTENSIONS = [...BASE_TIPTAP_EXTENSIONS, Image.configure({ allowBase64: true })]

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
    if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (removeEmptyListItemOnBackspace(ed)) return true
      if (spliceNestedListOnBackspace(ed)) return true
    }
    if (e.key === 'Delete' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (pullAncestorSiblingOnDelete(ed)) return true
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
      // 붙여넣는 텍스트에 빈 줄이 여러 개 연달아 있으면(문서에서 문단 구분용으로 흔함)
      // 그만큼 빈 <p>가 쌓여 줄간격이 과도해진다 — 빈 줄 1개(문단 구분)까지만 남긴다.
      transformPastedText: (text: string) => text.replace(/\n{3,}/g, '\n\n'),
      transformPastedHTML: (html: string) => collapseEmptyParagraphs(html),
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

  // Clipboard: text/html (nested DOM) + text/plain (GFM Markdown)
  useEffect(() => {
    if (!editor) return

    const dom = editor.view.dom
    const handleCopy = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      e.preventDefault()

      // text/html: browser DOM selection gives proper nested structure without CSS pseudo-elements
      let htmlContent = editor.getHTML()
      const winSel = window.getSelection()
      if (winSel && winSel.rangeCount > 0 && !winSel.isCollapsed) {
        const range = winSel.getRangeAt(0)
        const tmp = document.createElement('div')
        tmp.appendChild(range.cloneContents())
        htmlContent = tmp.innerHTML
      }

      // text/plain: GFM Markdown serialized from ProseMirror document
      const { selection, doc, schema } = editor.state
      let mdContent: string
      if (!selection.empty) {
        try {
          const slice = doc.slice(selection.from, selection.to)
          const tempDoc = (schema.nodes.doc as any).createAndFill(null, slice.content)
          mdContent = tempDoc ? pmDocToMarkdown(tempDoc) : pmDocToMarkdown(doc)
        } catch {
          mdContent = pmDocToMarkdown(doc)
        }
      } else {
        mdContent = pmDocToMarkdown(doc)
      }

      e.clipboardData.setData('text/html', htmlContent)
      e.clipboardData.setData('text/plain', mdContent)
    }

    dom.addEventListener('copy', handleCopy)
    return () => dom.removeEventListener('copy', handleCopy)
  }, [editor])

  if (!editor) return null

  const d = dark
  const btnCls = (active: boolean, extra = '') =>
    `text-xs px-2 py-1 rounded min-w-[26px] ${extra} ${active
      ? (d ? 'bg-[rgba(var(--ink-rgb),0.12)] text-[rgba(var(--text-rgb),1)]' : 'bg-gray-200 text-gray-900')
      : (d ? 'hover:bg-[rgba(var(--ink-rgb),0.08)] text-[rgba(var(--text-rgb),0.5)]' : 'hover:bg-gray-100 text-gray-600')}`
  const divCls = d ? 'w-px h-4 bg-[rgba(var(--ink-rgb),0.15)] mx-0.5' : 'w-px h-4 bg-gray-200 mx-0.5'
  const resetCls = d ? 'text-[10px] text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.6)] px-0.5' : 'text-[10px] text-gray-400 hover:text-gray-700 px-0.5'

  return (
    <div className={className}>
      {/* Toolbar */}
      {!hideToolbar && <div className={`flex items-center gap-0.5 border-b pb-2 mb-2 flex-wrap ${d ? 'border-[rgba(var(--ink-rgb),0.09)]' : 'border-gray-100'}`}>
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
            className={`w-[14px] h-[14px] rounded hover:scale-125 flex-shrink-0 transition-transform border ${d ? 'border-[rgba(var(--ink-rgb),0.2)]' : 'border-gray-200'}`}
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
              className={`ml-auto text-xs px-1.5 py-1 rounded ${d ? 'hover:bg-[rgba(var(--ink-rgb),0.08)] text-[rgba(var(--text-rgb),0.3)]' : 'hover:bg-gray-100 text-gray-400'}`} title="크게 쓰기">⛶</button>
          </>
        )}
      </div>}

      <EditorContent editor={editor} />
    </div>
  )
}
