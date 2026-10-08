'use client'

// 자유노트 본문 인라인 표를 줄 사이로 옮기는 노션식 손잡이(⋮⋮). 표에 마우스를 올리면
// 표 왼쪽에 손잡이가 뜨고, 끌면 놓일 자리(문서 최상위 블록 사이 경계)에 파란 선이
// 보이며, 놓으면 표 노드를 그 경계로 옮긴다. 공식 @tiptap/extension-drag-handle은
// yjs/collaboration 패키지를 peer로 요구해서 쓰지 않고, HTML5 DnD 대신 pointer
// 이벤트로 직접 처리한다 — 손잡이 mousedown에서 preventDefault해 에디터 포커스를
// 지켜야 편집모드(blur 시 언마운트)가 풀리지 않는다.
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { GripVertical } from 'lucide-react'

const HANDLE_WIDTH = 18
const AUTO_SCROLL_EDGE = 48
const AUTO_SCROLL_STEP = 14

interface DropTarget { pos: number; y: number; left: number }

function findTablePos(editor: Editor, wrapper: Element): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.type.name === 'table' && editor.view.nodeDOM(pos) === wrapper) { found = pos; return false }
    return true
  })
  return found
}

// 드롭 후보 = "줄" 단위 — 문단/제목/목록 항목 줄 같은 텍스트블록 하나하나와(다른 표는
// 통째로 한 칸) 그 사이 경계. 예전엔 문서 최상위 블록만 봐서, 줄이 여러 개인 번호 목록이
// 블록 하나로 취급돼 목록 중간에는 놓을 수 없었다. 표 안의 셀 문단은 후보에서 뺀다.
interface DropItem { pos: number; size: number; rect: DOMRect }

function collectDropItems(editor: Editor, draggedFrom: number): DropItem[] {
  const items: DropItem[] = []
  editor.state.doc.descendants((node, pos) => {
    const isTable = node.type.name === 'table'
    if (!isTable && !node.isTextblock) return true
    if (!(isTable && pos === draggedFrom)) {
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null
      if (dom?.getBoundingClientRect) items.push({ pos, size: node.nodeSize, rect: dom.getBoundingClientRect() })
    }
    return false
  })
  return items
}

// 경계 위치에 표가 스키마상 못 들어가면(예: 목록 항목의 첫 줄 앞, 토글 제목 뒤) 바깥
// 노드 앞/뒤로 한 단계씩 올라가며 들어갈 수 있는 가장 가까운 자리를 찾는다.
function fitTablePos(editor: Editor, pos: number, dir: 'before' | 'after'): number | null {
  const { doc, schema } = editor.state
  const tableType = schema.nodes.table
  let $p = doc.resolve(pos)
  for (;;) {
    const idx = $p.index()
    if ($p.parent.canReplaceWith(idx, idx, tableType)) return $p.pos
    if ($p.depth === 0) return null
    $p = doc.resolve(dir === 'after' ? $p.after() : $p.before())
  }
}

// 포인터 Y가 어떤 줄의 위쪽 절반이면 그 줄 앞(= 윗줄 뒤), 아래쪽 절반이면 그 줄 뒤.
// "줄 앞"은 가능하면 "윗줄 뒤"로 바꿔 목록 항목 안(들여쓰기 유지)에 들어가게 한다.
function findDropTarget(editor: Editor, clientY: number, draggedFrom: number): DropTarget | null {
  const items = collectDropItems(editor, draggedFrom)
  if (items.length === 0) return null
  let i = items.findIndex(it => clientY < it.rect.top + it.rect.height / 2)
  if (i === -1) i = items.length
  if (i === 0) {
    const first = items[0]
    const pos = fitTablePos(editor, first.pos, 'before')
    return pos === null ? null : { pos, y: first.rect.top, left: first.rect.left }
  }
  const prev = items[i - 1]
  const pos = fitTablePos(editor, prev.pos + prev.size, 'after')
  return pos === null ? null : { pos, y: prev.rect.bottom, left: prev.rect.left }
}

function moveTable(editor: Editor, from: number, target: number) {
  const node = editor.state.doc.nodeAt(from)
  if (!node || node.type.name !== 'table') return
  const to = from + node.nodeSize
  if (target >= from && target <= to) return // 제자리(바로 위/아래 경계)
  editor.chain().focus().command(({ tr }) => {
    tr.delete(from, to)
    tr.insert(tr.mapping.map(target), node)
    return true
  }).run()
}

export function TableDragHandle({ editor, containerRef }: {
  editor: Editor
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [handle, setHandle] = useState<{ top: number; left: number; wrapper: Element } | null>(null)
  const [indicator, setIndicator] = useState<{ top: number; left: number; width: number } | null>(null)
  const dragRef = useRef<{ from: number; target: DropTarget | null } | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const scheduleHide = () => {
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => { if (!dragRef.current) setHandle(null) }, 250)
    }
    function onMove(e: MouseEvent) {
      if (dragRef.current || !container) return
      const target = e.target as Element | null
      if (target?.closest('[data-table-handle]')) { clearTimeout(hideTimer.current); return }
      const wrapper = target?.closest('.tableWrapper')
      if (!wrapper || !editor.view.dom.contains(wrapper)) { scheduleHide(); return }
      clearTimeout(hideTimer.current)
      const c = container.getBoundingClientRect()
      const w = wrapper.getBoundingClientRect()
      setHandle({ top: w.top - c.top, left: w.left - c.left - HANDLE_WIDTH - 2, wrapper })
    }
    container.addEventListener('mousemove', onMove)
    container.addEventListener('mouseleave', scheduleHide)
    return () => {
      container.removeEventListener('mousemove', onMove)
      container.removeEventListener('mouseleave', scheduleHide)
      clearTimeout(hideTimer.current)
    }
  }, [editor, containerRef])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!handle) return
    e.preventDefault()
    e.stopPropagation()
    const from = findTablePos(editor, handle.wrapper)
    if (from < 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { from, target: null }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const container = containerRef.current
    if (!drag || !container) return
    // 긴 문서에서 화면 밖 위치로 옮길 수 있도록 스크롤 영역 가장자리에서 자동 스크롤
    const scroller = container.closest('.overflow-auto') as HTMLElement | null
    if (scroller) {
      const s = scroller.getBoundingClientRect()
      if (e.clientY < s.top + AUTO_SCROLL_EDGE) scroller.scrollBy(0, -AUTO_SCROLL_STEP)
      else if (e.clientY > s.bottom - AUTO_SCROLL_EDGE) scroller.scrollBy(0, AUTO_SCROLL_STEP)
    }
    const target = findDropTarget(editor, e.clientY, drag.from)
    drag.target = target
    if (!target) { setIndicator(null); return }
    const c = container.getBoundingClientRect()
    const ed = editor.view.dom.getBoundingClientRect()
    // 표시선은 그 줄의 들여쓰기 위치에서 시작 — 목록 안에 들어가는지 눈으로 구분되게
    setIndicator({ top: target.y - c.top - 1, left: target.left - c.left, width: ed.right - target.left })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    setIndicator(null)
    setHandle(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (drag?.target) moveTable(editor, drag.from, drag.target.pos)
  }

  return (
    <>
      {handle && (
        <div
          data-table-handle
          className="absolute flex items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity select-none"
          style={{ top: handle.top, left: handle.left, width: HANDLE_WIDTH, height: 24, cursor: 'grab', color: 'var(--text-muted)', zIndex: 5, touchAction: 'none' }}
          title="끌어서 표를 다른 줄 사이로 옮기기"
          onMouseDown={e => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <GripVertical size={14} />
        </div>
      )}
      {indicator && (
        <div
          className="absolute pointer-events-none rounded-full"
          style={{ top: indicator.top, left: indicator.left, width: indicator.width, height: 2, background: '#4C7FE0', zIndex: 5 }}
        />
      )}
    </>
  )
}
