'use client'

// 생각스케치 TEXT/Post-it(BoxOverlay) · 카드 보드(StickyCardNode) 공용 리치텍스트
// 표면 — "편집 중인 카드에만 Tiptap을 마운트하고, 그 외엔 정적 HTML 프리뷰"(② 구조).
// Quick Memo(TiptapEditor.tsx)와 동일한 extension 코어(tiptapExtensions.ts)를 그대로
// 재사용해 Markdown 입력 규칙·문서 스키마(=paste normalize)가 완전히 동일하게 동작한다.
// Sketch 전용으로 추가되는 것은: block 단위 A-/A+ 글자크기(tiptapFontSize.ts)와
// 이 파일의 드래그/캐럿 배치 wiring뿐 — 새 Markdown/서식 체계를 따로 만들지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Pen, Highlighter, Table2 } from 'lucide-react'
import type { EditorView } from '@tiptap/pm/view'
import type { JSONContent } from '@tiptap/core'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { BASE_TIPTAP_EXTENSIONS, ToggleInputRules, legacyToHtml, handleListKeymapWorkaround } from '@/lib/tiptapExtensions'
import { FontSize, getCurrentBlockFontSize } from '@/lib/tiptapFontSize'
import { parseSpreadsheetClipboard } from '@/lib/spreadsheetClipboard'

const RED = '#EF4444'
const HILITE = '#FEF08A'
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 48
const FONT_SIZE_STEP = 1.5

// 모듈 레벨 상수 — TiptapEditor.tsx와 동일한 이유(참조 안정성)로 컴포넌트 바깥에 둔다.
// 표는 문서 흐름 안의 블록 노드(Table) — 예전처럼 본문 위에 떠 있는 오버레이가 아니라
// 텍스트 줄 사이에 끼어들어가고, 위아래 텍스트가 표 높이만큼 자연스럽게 밀린다.
// StarterKit v3의 TrailingNode 덕분에 표가 문서 마지막이어도 아래에 빈 줄이 항상 남는다.
const SKETCH_EXTENSIONS = [
  ...BASE_TIPTAP_EXTENSIONS, FontSize, ToggleInputRules,
  Table.configure({ resizable: true, HTMLAttributes: { class: 'sketch-table' } }),
  TableRow, TableHeader, TableCell,
]

// Excel/Sheets 셀 범위 → Table 노드 JSON. 셀 안 줄바꿈은 문단으로 나눈다.
function matrixToTableJson(matrix: string[][]): JSONContent {
  return {
    type: 'table',
    content: matrix.map(row => ({
      type: 'tableRow',
      content: row.map(cell => ({
        type: 'tableCell',
        content: cell.split('\n').map(line => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
      })),
    })),
  }
}

// 붙여넣은 직후 커서를 표 바로 아래 줄로 옮긴다 — 표 마지막 칸에 커서가 남으면 다음
// 텍스트(2행)를 쓰려고 표 밖으로 다시 클릭해야 한다. 아래 줄이 문단이 아니면 하나 만든다.
function moveCursorBelowTable(ed: Editor) {
  const { $from } = ed.state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== 'table') continue
    const after = $from.after(d)
    const next = ed.state.doc.nodeAt(after)
    if (next?.type.name === 'paragraph') ed.chain().focus().setTextSelection(after + 1).run()
    else ed.chain().focus().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).run()
    return
  }
}

interface CaretPos { x: number; y: number }

function isContentEmpty(html: string): boolean {
  if (!html) return true
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text.length === 0
}

// 'card' = Post-it/카드보드 카드처럼 고정 박스 안에서 flex-1로 채우고 넘치면
// 스크롤(기존 동작). 'document' = 자유노트 본문(note_body)처럼 카드 경계 없이
// 문서 흐름을 따라 자연스럽게 늘어나야 하는 표면 — flex-1/overflow를 걸지 않는다.
type SketchTextEditorVariant = 'card' | 'document'

export interface SketchTextEditorProps {
  content: string
  onContentChange: (html: string) => void
  editing: boolean
  onEnterEdit: () => void
  onExitEdit: () => void
  fallbackFontSize: number
  placeholder?: string
  textColor: string
  variant?: SketchTextEditorVariant
}

function surfaceClassName(variant: SketchTextEditorVariant): string {
  return variant === 'document'
    ? 'freenote-body tiptap-input leading-relaxed outline-none relative'
    : 'freenote-body tiptap-input flex-1 min-h-0 overflow-y-auto scrollbar-hide leading-snug outline-none'
}

/** 비편집 상태 — 가벼운 정적 HTML 프리뷰. Tiptap 인스턴스 없음. */
function SketchPreview({
  content, fallbackFontSize, placeholder, textColor, variant, onMouseDown,
}: {
  content: string
  fallbackFontSize: number
  placeholder?: string
  textColor: string
  variant: SketchTextEditorVariant
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const empty = isContentEmpty(content)
  const className = surfaceClassName(variant)
  const style: React.CSSProperties = {
    color: textColor, fontSize: fallbackFontSize, cursor: 'text', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    ...(variant === 'document' ? { minHeight: 200, maxWidth: 'min(100%, 1100px)' } : {}),
  }
  // ol/h1 등이 .tiptap-input의 "직계 자식"이어야 globals.css의 `.tiptap-input > ol` 류
  // 선택자(리스트 마커, heading 여백)가 먹는다 — 그래서 내용을 감싸는 별도 wrapper
  // div 없이 이 div 자체에 dangerouslySetInnerHTML을 건다(EditorContent도 마찬가지
  // 구조라 편집모드와 프리뷰모드의 마크업 깊이가 동일해야 스타일이 어긋나지 않는다).
  // React는 children과 dangerouslySetInnerHTML을 같은 엘리먼트에 동시에 못 받으므로
  // (children prop이 존재하기만 해도 에러 — 값이 false여도 마찬가지) 두 분기를
  // 아예 별도 엘리먼트로 나눈다.
  if (empty) {
    return (
      <div className={className} style={style} onMouseDown={onMouseDown}>
        <span style={{ opacity: 0.35 }}>{placeholder}</span>
      </div>
    )
  }
  return (
    <div
      className={className}
      style={style}
      onMouseDown={onMouseDown}
      dangerouslySetInnerHTML={{ __html: legacyToHtml(content) }}
    />
  )
}

/** 편집 상태 — 실제 Tiptap 인스턴스가 마운트되는 동안만 존재(언마운트 시 editor.destroy()). */
function MountedSketchEditor({
  content, onContentChange, onExitEdit, fallbackFontSize, textColor, variant, initialCaretPosRef,
}: {
  content: string
  onContentChange: (html: string) => void
  onExitEdit: () => void
  fallbackFontSize: number
  textColor: string
  variant: SketchTextEditorVariant
  initialCaretPosRef: React.RefObject<CaretPos | null>
}) {
  const onContentChangeRef = useRef(onContentChange)
  const onExitEditRef = useRef(onExitEdit)
  const editorRef = useRef<Editor | null>(null)
  const [displaySize, setDisplaySize] = useState(fallbackFontSize)
  // useEditor는 transaction마다 리렌더하지 않으므로, 표 편집 버튼 노출 여부는 state로 따로 추적
  const [inTable, setInTable] = useState(false)
  useEffect(() => {
    onContentChangeRef.current = onContentChange
    onExitEditRef.current = onExitEdit
  })

  const adjustFontSize = useCallback((delta: number) => {
    const ed = editorRef.current
    if (!ed) return
    const current = getCurrentBlockFontSize(ed.state, fallbackFontSize)
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, +(current + delta).toFixed(1)))
    ed.chain().focus().setBlockFontSize(next).run()
  }, [fallbackFontSize])

  const stableKeyDown = useCallback((_view: unknown, e: KeyboardEvent) => {
    const ed = editorRef.current
    if (!ed) return false
    if (e.altKey && e.key === '1') {
      e.preventDefault()
      ed.isActive('textStyle', { color: RED })
        ? ed.chain().focus().unsetColor().run()
        : ed.chain().focus().setColor(RED).run()
      return true
    }
    if (e.altKey && e.key === '2') {
      e.preventDefault()
      ed.chain().focus().toggleHighlight({ color: HILITE }).run()
      return true
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) {
      e.preventDefault()
      adjustFontSize(e.code === 'Period' ? FONT_SIZE_STEP : -FONT_SIZE_STEP)
      return true
    }
    // 표 셀 안의 Tab/Shift+Tab — 엑셀처럼 다음/이전 칸, 마지막 칸에서 Tab이면 행 추가
    if (e.key === 'Tab' && ed.isActive('table')) {
      e.preventDefault()
      if (e.shiftKey) { ed.commands.goToPreviousCell(); return true }
      if (!ed.commands.goToNextCell()) ed.chain().addRowAfter().goToNextCell().run()
      return true
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      e.shiftKey
        ? ed.chain().focus().liftListItem('listItem').run()
        : ed.chain().focus().sinkListItem('listItem').run()
      return true
    }
    return handleListKeymapWorkaround(ed, e)
  }, [adjustFontSize])

  // 표 셀 범위 붙여넣기 — 문서 흐름 안에 Table 노드로 넣는다(커서 위치 = 텍스트 줄 사이).
  // 이미 표 안에 커서가 있으면 prosemirror-tables 기본 동작(셀 단위로 덮어쓰기)에 맡긴다.
  // 여기서 true를 반환하면 ProseMirror가 preventDefault하므로, FreeNoteCanvas의 window paste
  // 핸들러는 그걸 보고 떠있는 표 오버레이를 따로 만들지 않는다.
  const stablePaste = useCallback((_view: EditorView, e: ClipboardEvent) => {
    const ed = editorRef.current
    if (!ed || !e.clipboardData || ed.isActive('table')) return false
    const matrix = parseSpreadsheetClipboard(e.clipboardData)
    if (!matrix) return false
    ed.chain().focus().insertContent(matrixToTableJson(matrix)).run()
    moveCursorBelowTable(ed)
    return true
  }, [])

  const editor = useEditor({
    extensions: SKETCH_EXTENSIONS,
    content: legacyToHtml(content),
    editorProps: {
      attributes: {
        class: surfaceClassName(variant),
        style: `color:${textColor}; font-size:${fallbackFontSize}px; white-space:pre-wrap; overflow-wrap:break-word;`
          + (variant === 'document' ? ' min-height:200px; max-width:min(100%, 1100px);' : ''),
      },
      handleKeyDown: stableKeyDown,
      handlePaste: stablePaste,
      transformPastedText: (text: string) => text.replace(/\n{3,}/g, '\n\n'),
    },
  })

  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    const handleUpdate = () => { onContentChangeRef.current(editor.getHTML()) }
    const handleSelection = () => {
      setDisplaySize(getCurrentBlockFontSize(editor.state, fallbackFontSize))
      setInTable(editor.isActive('table'))
    }
    const handleBlur = () => { onExitEditRef.current() }
    editor.on('update', handleUpdate)
    editor.on('selectionUpdate', handleSelection)
    editor.on('transaction', handleSelection)
    editor.on('blur', handleBlur)
    return () => {
      editor.off('update', handleUpdate)
      editor.off('selectionUpdate', handleSelection)
      editor.off('transaction', handleSelection)
      editor.off('blur', handleBlur)
    }
  }, [editor, fallbackFontSize])

  // 편집모드 진입 시 caret 배치 — 클릭 좌표가 있으면 그 지점에, 없으면(Tab으로 만든
  // 새 카드의 autoFocus 등 클릭 없이 진입한 경우) 문서 끝에 놓는다. React Flow가 새
  // 노드 크기를 측정하는 동안(ResizeObserver 완료 전) wrapper가 visibility:hidden일
  // 수 있고, 그 상태에서 focus()는 브라우저가 조용히 무시하므로(옛 StickyCardNode의
  // RAF 재시도 로직과 동일한 이유) visibility가 풀릴 때까지 프레임 단위로 재시도한다.
  useEffect(() => {
    if (!editor) return
    let rafId: number
    let attempts = 0
    const tryFocus = () => {
      const dom = editor.view.dom as HTMLElement
      const hidden = getComputedStyle(dom).visibility === 'hidden'
      if (hidden && attempts < 30) {
        attempts += 1
        rafId = requestAnimationFrame(tryFocus)
        return
      }
      const initialCaretPos = initialCaretPosRef.current
      if (initialCaretPos) {
        const pos = editor.view.posAtCoords({ left: initialCaretPos.x, top: initialCaretPos.y })
        if (pos) {
          editor.commands.setTextSelection(pos.pos)
          editor.commands.focus()
          return
        }
      }
      editor.commands.focus('end')
    }
    rafId = requestAnimationFrame(tryFocus)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  if (!editor) return null

  return (
    <div className={variant === 'document' ? 'flex flex-col gap-1' : 'flex-1 min-h-0 flex flex-col gap-1'} onPointerDown={e => e.stopPropagation()}>
      <div
        className="nodrag nopan flex items-center gap-1 px-1.5 py-1 rounded-lg flex-shrink-0"
        style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.08)', width: 'fit-content' }}
        onPointerDown={e => e.stopPropagation()}
      >
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold opacity-60 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity flex-shrink-0"
          style={{ color: textColor }} onMouseDown={e => e.preventDefault()} onClick={() => adjustFontSize(-FONT_SIZE_STEP)}
          title="현재 텍스트 블록 글씨 작게 (Ctrl/Cmd+Shift+,)"
        >A−</button>
        <span className="text-[9px] font-mono opacity-40 w-7 text-center flex-shrink-0 select-none" style={{ color: textColor }}>
          {Math.round(displaySize)}px
        </span>
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold opacity-60 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity flex-shrink-0"
          style={{ color: textColor }} onMouseDown={e => e.preventDefault()} onClick={() => adjustFontSize(FONT_SIZE_STEP)}
          title="현재 텍스트 블록 글씨 크게 (Ctrl/Cmd+Shift+.)"
        >A+</button>
        <div className="w-px h-3.5 mx-0.5 flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.16)' }} />
        <button
          className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(239,68,68,0.15)] transition-opacity flex-shrink-0"
          style={{ color: RED }} onMouseDown={e => e.preventDefault()}
          onClick={() => (editor.isActive('textStyle', { color: RED })
            ? editor.chain().focus().unsetColor().run()
            : editor.chain().focus().setColor(RED).run())}
          title="강조 · 빨간펜 (Alt+1)"
        ><Pen size={12} /></button>
        <button
          className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(234,179,8,0.18)] transition-opacity flex-shrink-0"
          style={{ color: '#EAB308' }} onMouseDown={e => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHighlight({ color: HILITE }).run()}
          title="형광펜 (Alt+2)"
        ><Highlighter size={12} /></button>
        <div className="w-px h-3.5 mx-0.5 flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.16)' }} />
        <button
          className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(107,182,199,0.18)] transition-opacity flex-shrink-0"
          style={{ color: '#6BB6C7' }} onMouseDown={e => e.preventDefault()}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()}
          title="커서 위치에 표 넣기 (엑셀 셀 범위를 Ctrl+V해도 표로 들어감)"
        ><Table2 size={12} /></button>
        {inTable && (
          <>
            {([
              ['행+', '아래에 행 추가', () => editor.chain().focus().addRowAfter().run()],
              ['행−', '현재 행 삭제', () => editor.chain().focus().deleteRow().run()],
              ['열+', '오른쪽에 열 추가', () => editor.chain().focus().addColumnAfter().run()],
              ['열−', '현재 열 삭제', () => editor.chain().focus().deleteColumn().run()],
              ['머리행', '첫 행을 머리행으로 켜기/끄기', () => editor.chain().focus().toggleHeaderRow().run()],
              ['표 삭제', '표 전체 삭제', () => editor.chain().focus().deleteTable().run()],
            ] as const).map(([label, title, run]) => (
              <button
                key={label}
                className="h-5 px-1.5 flex items-center justify-center rounded text-[10.5px] opacity-70 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity flex-shrink-0 whitespace-nowrap"
                style={{ color: textColor }} onMouseDown={e => e.preventDefault()} onClick={run} title={title}
              >{label}</button>
            ))}
          </>
        )}
      </div>
      <EditorContent editor={editor} className={variant === 'document' ? undefined : 'flex-1 min-h-0 overflow-y-auto scrollbar-hide'} />
    </div>
  )
}

/** 진입점 — editing 여부에 따라 프리뷰/Tiptap을 스위칭한다. */
export function SketchTextEditor({
  content, onContentChange, editing, onEnterEdit, onExitEdit, fallbackFontSize, placeholder, textColor, variant = 'card',
}: SketchTextEditorProps) {
  const caretPosRef = useRef<CaretPos | null>(null)

  if (!editing) {
    return (
      <SketchPreview
        content={content}
        fallbackFontSize={fallbackFontSize}
        placeholder={placeholder}
        textColor={textColor}
        variant={variant}
        onMouseDown={e => {
          e.stopPropagation()
          caretPosRef.current = { x: e.clientX, y: e.clientY }
          onEnterEdit()
        }}
      />
    )
  }

  return (
    <MountedSketchEditor
      content={content}
      onContentChange={onContentChange}
      onExitEdit={onExitEdit}
      fallbackFontSize={fallbackFontSize}
      textColor={textColor}
      variant={variant}
      initialCaretPosRef={caretPosRef}
    />
  )
}
