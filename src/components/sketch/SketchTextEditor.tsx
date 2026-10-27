'use client'

// 생각스케치 TEXT/Post-it(BoxOverlay) · 카드 보드(StickyCardNode) 공용 리치텍스트
// 표면 — "편집 중인 카드에만 Tiptap을 마운트하고, 그 외엔 정적 HTML 프리뷰"(② 구조).
// Quick Memo(TiptapEditor.tsx)와 동일한 extension 코어(tiptapExtensions.ts)를 그대로
// 재사용해 Markdown 입력 규칙·문서 스키마(=paste normalize)가 완전히 동일하게 동작한다.
// Sketch 전용으로 추가되는 것은: block 단위 A-/A+ 글자크기(tiptapFontSize.ts)와
// 이 파일의 드래그/캐럿 배치 wiring뿐 — 새 Markdown/서식 체계를 따로 만들지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Pen, Highlighter, Table2, AlignCenter, PaintBucket } from 'lucide-react'
import type { EditorView } from '@tiptap/pm/view'
import type { JSONContent } from '@tiptap/core'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { CellSelection, TableMap, cellAround } from '@tiptap/pm/tables'
import {
  BASE_TIPTAP_EXTENSIONS, ToggleInputRules, legacyToHtml, handleListKeymapWorkaround, moveBlockInToggle,
  getVoiceAtSelection, toggleVoiceAtSelection, VOICE_TARGETS, type VoiceTarget,
} from '@/lib/tiptapExtensions'
import { FontSize, getCurrentBlockFontSize } from '@/lib/tiptapFontSize'
import { parseSpreadsheetClipboard } from '@/lib/spreadsheetClipboard'
import { TableDragHandle } from './TableDragHandle'

const RED = '#EF4444'
const HILITE = '#FEF08A'
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 48
const FONT_SIZE_STEP = 1.5
const TABLE_BAR_H = 30

// 모듈 레벨 상수 — TiptapEditor.tsx와 동일한 이유(참조 안정성)로 컴포넌트 바깥에 둔다.
// 표는 문서 흐름 안의 블록 노드(Table) — 예전처럼 본문 위에 떠 있는 오버레이가 아니라
// 텍스트 줄 사이에 끼어들어가고, 위아래 텍스트가 표 높이만큼 자연스럽게 밀린다.
// StarterKit v3의 TrailingNode 덕분에 표가 문서 마지막이어도 아래에 빈 줄이 항상 남는다.
// 셀 정렬·음영 — td/th의 inline style(text-align, background-color)로 저장해서 프리뷰(저장 HTML
// 그대로 렌더)에서도 별도 처리 없이 똑같이 보인다. 여러 칸을 드래그로 선택하면 한꺼번에 적용된다.
const cellStyleAttributes = {
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.textAlign || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.align ? { style: `text-align: ${attrs.align}` } : {}),
  },
  shade: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.shade ? { style: `background-color: ${attrs.shade}` } : {}),
  },
}
const StyledTableCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellStyleAttributes } } })
const StyledTableHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellStyleAttributes } } })

// 셀 음영 팔레트 — 반투명이라 라이트/다크 둘 다 글자가 읽힌다. (보라 계열 제외)
const CELL_SHADES: { label: string; color: string | null }[] = [
  { label: '없음', color: null },
  { label: '회색', color: 'rgba(120, 120, 120, 0.18)' },
  { label: '파랑', color: 'rgba(76, 127, 224, 0.18)' },
  { label: '청록', color: 'rgba(107, 182, 199, 0.24)' },
  { label: '초록', color: 'rgba(34, 197, 94, 0.18)' },
  { label: '노랑', color: 'rgba(234, 179, 8, 0.24)' },
  { label: '주황', color: 'rgba(249, 115, 22, 0.20)' },
  { label: '빨강', color: 'rgba(239, 68, 68, 0.18)' },
]

const SKETCH_EXTENSIONS = [
  ...BASE_TIPTAP_EXTENSIONS, FontSize, ToggleInputRules,
  Table.configure({ resizable: true, HTMLAttributes: { class: 'sketch-table' } }),
  TableRow, StyledTableHeader, StyledTableCell,
]
// 안건 메모(업무 개요) 화면용 — 예전 TiptapEditor로 쓴 메모에 붙여넣은 이미지(base64)가 들어 있어서,
// 이미지 스키마가 없으면 편집하는 순간 이미지가 벗겨진 채 저장된다. 스키마만 넣고, 새로 붙여넣는
// 이미지는 생각스케치와 똑같이 FreeNoteCanvas가 떠 있는 이미지로 만든다.
const SKETCH_EXTENSIONS_WITH_IMAGE = [...SKETCH_EXTENSIONS, Image.configure({ allowBase64: true })]

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

// 엑셀 Ctrl+Shift+방향키 — 지금 칸(이미 칸 선택 중이면 그 시작 칸)부터 그 방향 표 끝 칸까지
// 한 번에 칸 선택. 선택된 칸들에 가운데정렬·음영을 일괄 적용할 때 쓴다.
function extendCellSelectionToEdge(ed: Editor, key: string): boolean {
  const { state } = ed
  const sel = state.selection
  let $anchor, $head
  if (sel instanceof CellSelection) { $anchor = sel.$anchorCell; $head = sel.$headCell }
  else { $anchor = $head = cellAround(sel.$head) }
  if (!$anchor || !$head) return false
  const table = $head.node(-1)
  const tableStart = $head.start(-1)
  const map = TableMap.get(table)
  const rect = map.findCell($head.pos - tableStart)
  let row = rect.top
  let col = rect.left
  if (key === 'ArrowRight') col = map.width - 1
  else if (key === 'ArrowLeft') col = 0
  else if (key === 'ArrowDown') row = map.height - 1
  else if (key === 'ArrowUp') row = 0
  else return false
  const targetPos = tableStart + map.map[row * map.width + col]
  ed.view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, $anchor.pos, targetPos)))
  return true
}

export interface CaretPos { x: number; y: number }

// 저장된 HTML은 그대로 쓴다 — legacyToHtml은 HTML이면 연속 빈 문단을 1개로 합치는데
// (Quick Memo용 붙여넣기 정리), 스케치에서는 사용자가 글을 화면 위쪽으로 올리려고 일부러
// 넣은 빈 줄이 클릭(프리뷰↔편집 전환)할 때마다 사라지는 원인이었다. 옛 평문만 변환한다.
function toSketchHtml(content: string): string {
  if (content && content.trimStart().startsWith('<')) return content
  return legacyToHtml(content)
}

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
  /** 바깥(예: 본문 아래 빈 여백)에서 편집모드로 들일 때 클릭 좌표를 넘기는 용도 — 없으면 내부 ref 사용 */
  caretPosRef?: React.RefObject<CaretPos | null>
  /** 클릭 없이 편집모드에 들어갈 때(보드 첫 진입 등) 문서 끝이 보이게 스크롤할지 — 저장된 스크롤 위치를 복원할 땐 false */
  scrollOnInitialFocus?: boolean
  /** 바깥에서 "포커스가 없으면 스크롤 없이 문서 끝에 커서" 를 호출할 수 있게 채워주는 ref */
  focusEndRef?: React.RefObject<(() => void) | null>
  /** 경영진 의견 줄 표시(Alt+3 CEO / Alt+4 CSO / 툴바) — TiptapEditor의 enableVoice와 같은 표시 */
  enableVoice?: boolean
  /** 기존 본문 안 이미지(base64) 보존 — 안건 메모 화면에서만 */
  allowImages?: boolean
  /** document 표면의 최소 높이(px) — 기본 200(자유노트 본문). 세부task 히스토리 박스는 낮게 */
  docMinHeight?: number
}

function surfaceClassName(variant: SketchTextEditorVariant): string {
  return variant === 'document'
    ? 'freenote-body freenote-doc tiptap-input leading-relaxed outline-none relative'
    : 'freenote-body tiptap-input flex-1 min-h-0 overflow-y-auto scrollbar-hide leading-snug outline-none'
}

/** 비편집 상태 — 가벼운 정적 HTML 프리뷰. Tiptap 인스턴스 없음. */
function SketchPreview({
  content, fallbackFontSize, placeholder, textColor, variant, onMouseDown, docMinHeight,
}: {
  content: string
  fallbackFontSize: number
  placeholder?: string
  textColor: string
  variant: SketchTextEditorVariant
  onMouseDown: (e: React.MouseEvent) => void
  docMinHeight: number
}) {
  const empty = isContentEmpty(content)
  const className = surfaceClassName(variant)
  const style: React.CSSProperties = {
    color: textColor, fontSize: fallbackFontSize, cursor: 'text', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    ...(variant === 'document' ? { minHeight: docMinHeight } : {}),
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
      dangerouslySetInnerHTML={{ __html: toSketchHtml(content) }}
    />
  )
}

/** 편집 상태 — 실제 Tiptap 인스턴스가 마운트되는 동안만 존재(언마운트 시 editor.destroy()). */
function MountedSketchEditor({
  content, onContentChange, onExitEdit, fallbackFontSize, textColor, variant, initialCaretPosRef, scrollOnInitialFocus, focusEndRef, enableVoice, allowImages, docMinHeight,
}: {
  content: string
  onContentChange: (html: string) => void
  onExitEdit: () => void
  fallbackFontSize: number
  textColor: string
  variant: SketchTextEditorVariant
  initialCaretPosRef: React.RefObject<CaretPos | null>
  scrollOnInitialFocus: boolean
  focusEndRef?: React.RefObject<(() => void) | null>
  enableVoice?: boolean
  allowImages?: boolean
  docMinHeight: number
}) {
  const onContentChangeRef = useRef(onContentChange)
  const onExitEditRef = useRef(onExitEdit)
  const editorRef = useRef<Editor | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [displaySize, setDisplaySize] = useState(fallbackFontSize)
  // useEditor는 transaction마다 리렌더하지 않으므로, 표 편집 버튼 노출 여부는 state로 따로 추적
  const [inTable, setInTable] = useState(false)
  const [cellCentered, setCellCentered] = useState(false)
  const [shadeOpen, setShadeOpen] = useState(false)
  const [tableBarPos, setTableBarPos] = useState<{ top: number; left: number } | null>(null)
  // 본문(document)은 포커스가 빠져도 마운트를 유지하므로 툴바만 포커스 있을 때 보인다
  const [focused, setFocused] = useState(false)
  const [currentVoice, setCurrentVoice] = useState<VoiceTarget | null>(null)
  const enableVoiceRef = useRef(enableVoice)
  useEffect(() => {
    onContentChangeRef.current = onContentChange
    onExitEditRef.current = onExitEdit
    enableVoiceRef.current = enableVoice
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
    // 경영진 의견 표시 — TiptapEditor와 같은 조건(e.code 판별, 한글 조합 중 무시, 대상 줄 없으면 기본 동작)
    if (enableVoiceRef.current && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.isComposing && e.keyCode !== 229
      && (e.code === 'Digit3' || e.code === 'Digit4')) {
      return toggleVoiceAtSelection(ed, e.code === 'Digit3' ? 'CEO' : 'CSO')
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) {
      e.preventDefault()
      adjustFontSize(e.code === 'Period' ? FONT_SIZE_STEP : -FONT_SIZE_STEP)
      return true
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.startsWith('Arrow') && ed.isActive('table')) {
      if (extendCellSelectionToEdge(ed, e.key)) { e.preventDefault(); return true }
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
      // 목록 밖이면 토글 층위 이동 — 위 토글 안으로 넣기 / 감싼 토글 밖으로 꺼내기
      if (!ed.isActive('listItem')) { moveBlockInToggle(ed, e.shiftKey ? 'out' : 'in'); return true }
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
    extensions: allowImages ? SKETCH_EXTENSIONS_WITH_IMAGE : SKETCH_EXTENSIONS,
    content: toSketchHtml(content),
    editorProps: {
      attributes: {
        class: surfaceClassName(variant),
        style: `color:${textColor}; font-size:${fallbackFontSize}px; white-space:pre-wrap; overflow-wrap:break-word;`
          + (variant === 'document' ? ` min-height:${docMinHeight}px;` : ''),
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
      const nowInTable = editor.isActive('table')
      setInTable(nowInTable)
      if (!nowInTable) setShadeOpen(false)
      setCellCentered(nowInTable && (editor.getAttributes('tableCell').align ?? editor.getAttributes('tableHeader').align) === 'center')
      setCurrentVoice(enableVoiceRef.current ? getVoiceAtSelection(editor) : null)
    }
    const handleBlur = () => { setFocused(false); setShadeOpen(false); onExitEditRef.current() }
    const handleFocus = () => { setFocused(true) }
    editor.on('focus', handleFocus)
    editor.on('update', handleUpdate)
    editor.on('selectionUpdate', handleSelection)
    editor.on('transaction', handleSelection)
    editor.on('blur', handleBlur)
    return () => {
      editor.off('update', handleUpdate)
      editor.off('selectionUpdate', handleSelection)
      editor.off('transaction', handleSelection)
      editor.off('blur', handleBlur)
      editor.off('focus', handleFocus)
    }
  }, [editor, fallbackFontSize])

  // 본문(document)의 표 편집 버튼은 맨 위 툴바가 아니라 "지금 커서가 있는 표" 바로 위에 띄운다 —
  // 툴바는 본문 맨 위에 붙어 있어서 아래로 스크롤한 위치의 표에서는 누를 수가 없었다.
  // 표 윗변이 화면 위로 올라간 긴 표는 보이는 영역 맨 위에 붙어 따라오고(표 아래 끝을 넘지는 않음).
  useEffect(() => {
    if (!editor || variant !== 'document') return
    const wrap = wrapRef.current
    if (!wrap) return
    let scroller: HTMLElement | null = wrap.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    const update = () => {
      if (!editor.isActive('table')) { setTableBarPos(null); return }
      const { node } = editor.view.domAtPos(editor.state.selection.from)
      const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null
      const table = el?.closest('.tableWrapper') ?? el?.closest('table')
      if (!table) { setTableBarPos(null); return }
      const wr = wrap.getBoundingClientRect()
      const tr = table.getBoundingClientRect()
      const visibleTop = scroller ? scroller.getBoundingClientRect().top + 4 : 4
      const top = Math.max(tr.top - TABLE_BAR_H - 2, Math.min(visibleTop, tr.bottom - TABLE_BAR_H))
      setTableBarPos(prev => {
        const next = { top: Math.round(top - wr.top), left: Math.round(tr.left - wr.left) }
        return prev && prev.top === next.top && prev.left === next.left ? prev : next
      })
    }
    update()
    editor.on('transaction', update)
    scroller?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      editor.off('transaction', update)
      scroller?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [editor, variant])

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
      // 한 번 쓰고 비운다 — 남겨두면 다음 진입(본문 아래 여백 클릭 등)이 옛 클릭 좌표로 캐럿을 놓는다
      initialCaretPosRef.current = null
      if (initialCaretPos) {
        // 클릭으로 들어온 경우엔 스크롤을 건드리지 않는다 — 클릭한 곳은 이미 화면 안이고,
        // 본문 아래 여백 클릭(좌표가 본문 밖 → 문서 끝)에서 scrollIntoView가 돌면 스크롤이
        // 맨 끝까지 튀어 마지막 줄이 화면 맨 위로 올라갔다.
        const pos = editor.view.posAtCoords({ left: initialCaretPos.x, top: initialCaretPos.y })
        if (pos) editor.commands.setTextSelection(pos.pos)
        editor.commands.focus(pos ? null : 'end', { scrollIntoView: false })
        return
      }
      editor.commands.focus('end', { scrollIntoView: scrollOnInitialFocus })
    }
    rafId = requestAnimationFrame(tryFocus)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    if (!editor || !focusEndRef) return
    focusEndRef.current = () => { if (!editor.isFocused) editor.commands.focus('end', { scrollIntoView: false }) }
    return () => { focusEndRef.current = null }
  }, [editor, focusEndRef])

  if (!editor) return null

  // 표 편집 버튼 — 카드는 상단 툴바 안, 본문(document)은 표 위 떠 있는 바에 넣는다
  const tableButtons = (
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
      <div className="w-px h-3.5 mx-0.5 flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.16)' }} />
      <button
        className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity flex-shrink-0"
        style={{ color: textColor, background: cellCentered ? 'rgba(var(--ink-rgb),0.12)' : undefined }}
        onMouseDown={e => e.preventDefault()}
        onClick={() => editor.chain().focus().setCellAttribute('align', cellCentered ? null : 'center').run()}
        title="선택한 칸 가운데 정렬 켜기/끄기 (여러 칸은 드래그로 선택)"
      ><AlignCenter size={12} /></button>
      <div className="relative flex-shrink-0">
        <button
          className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity"
          style={{ color: textColor, background: shadeOpen ? 'rgba(var(--ink-rgb),0.12)' : undefined }}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShadeOpen(o => !o)}
          title="선택한 칸 음영 색 (여러 칸은 드래그로 선택)"
        ><PaintBucket size={12} /></button>
        {shadeOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-20 flex items-center gap-1 p-1.5 rounded-lg shadow-lg"
            style={{ background: 'var(--bg-page)', border: '1px solid rgba(var(--ink-rgb),0.14)' }}
            onMouseDown={e => e.preventDefault()}
          >
            {CELL_SHADES.map(s => (
              <button
                key={s.label}
                className="w-5 h-5 rounded flex items-center justify-center text-[9px] hover:scale-110 transition-transform"
                style={{ background: s.color ?? 'transparent', border: '1px solid rgba(var(--ink-rgb),0.2)', color: textColor }}
                onClick={() => { editor.chain().focus().setCellAttribute('shade', s.color).run(); setShadeOpen(false) }}
                title={s.label}
              >{s.color ? '' : '✕'}</button>
            ))}
          </div>
        )}
      </div>
    </>
  )

  return (
    <div ref={wrapRef} className={variant === 'document' ? 'relative flex flex-col gap-1' : 'flex-1 min-h-0 flex flex-col gap-1'} onPointerDown={e => e.stopPropagation()}>
      {/* 본문(document)에서는 툴바를 문서 흐름 밖(위 여백)에 띄운다 — 흐름 안에 있으면 클릭으로
          편집모드에 들어갈 때마다 본문 전체가 툴바 높이만큼 밀려 내려가 맞춰둔 위치가 뒤틀리고,
          클릭 좌표로 잡는 캐럿도 한 줄 어긋났다. */}
      <div
        className={`nodrag nopan flex items-center gap-1 px-1.5 py-1 rounded-lg flex-shrink-0${variant === 'document' ? ' absolute left-0 z-10' : ''}`}
        style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.08)', width: 'fit-content', ...(variant === 'document' ? { bottom: '100%', marginBottom: 2, visibility: focused ? 'visible' : 'hidden' } : {}) }}
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
        {enableVoice && (
          <>
            <div className="w-px h-3.5 mx-0.5 flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.16)' }} />
            {VOICE_TARGETS.map(t => (
              <button
                key={t}
                className="h-5 px-1.5 flex items-center justify-center rounded text-[10px] font-semibold opacity-70 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity flex-shrink-0"
                style={{ color: textColor, background: currentVoice === t ? 'rgba(var(--ink-rgb),0.14)' : undefined, opacity: currentVoice === t ? 1 : undefined }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { editor.commands.focus(); toggleVoiceAtSelection(editor, t) }}
                title={`경영진 의견 줄 표시 · ${t} (${t === 'CEO' ? 'Alt+3' : 'Alt+4'}) — 다시 누르면 해제`}
              >{t}</button>
            ))}
          </>
        )}
        <div className="w-px h-3.5 mx-0.5 flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.16)' }} />
        <button
          className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(107,182,199,0.18)] transition-opacity flex-shrink-0"
          style={{ color: '#6BB6C7' }} onMouseDown={e => e.preventDefault()}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()}
          title="커서 위치에 표 넣기 (엑셀 셀 범위를 Ctrl+V해도 표로 들어감)"
        ><Table2 size={12} /></button>
        {inTable && variant !== 'document' && tableButtons}
      </div>
      {/* 본문(document): 표 편집 버튼은 커서가 있는 표 바로 위에 띄운다 (위치 계산은 위 useEffect) */}
      {variant === 'document' && focused && inTable && tableBarPos && (
        <div
          className="nodrag nopan absolute z-20 flex items-center gap-1 px-1.5 rounded-lg shadow-md"
          style={{ top: tableBarPos.top, left: tableBarPos.left, height: TABLE_BAR_H, background: 'var(--bg-page)', border: '1px solid rgba(var(--ink-rgb),0.14)' }}
          onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.preventDefault()}
        >
          {tableButtons}
        </div>
      )}
      <EditorContent editor={editor} className={variant === 'document' ? undefined : 'flex-1 min-h-0 overflow-y-auto scrollbar-hide'} />
      {/* 표 줄간 이동 손잡이 — 본문(document)에서만. 카드는 고정 박스라 왼쪽 여백이 없다 */}
      {variant === 'document' && <TableDragHandle editor={editor} containerRef={wrapRef} />}
    </div>
  )
}

/** 진입점 — editing 여부에 따라 프리뷰/Tiptap을 스위칭한다. */
export function SketchTextEditor({
  content, onContentChange, editing, onEnterEdit, onExitEdit, fallbackFontSize, placeholder, textColor, variant = 'card',
  caretPosRef: externalCaretPosRef, scrollOnInitialFocus = true, focusEndRef, enableVoice, allowImages, docMinHeight = 200,
}: SketchTextEditorProps) {
  const internalCaretPosRef = useRef<CaretPos | null>(null)
  const caretPosRef = externalCaretPosRef ?? internalCaretPosRef

  if (!editing) {
    return (
      <SketchPreview
        content={content}
        fallbackFontSize={fallbackFontSize}
        placeholder={placeholder}
        textColor={textColor}
        variant={variant}
        docMinHeight={docMinHeight}
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
      scrollOnInitialFocus={scrollOnInitialFocus}
      focusEndRef={focusEndRef}
      enableVoice={enableVoice}
      allowImages={allowImages}
      docMinHeight={docMinHeight}
    />
  )
}
