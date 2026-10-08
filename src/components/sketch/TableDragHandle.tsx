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

interface DropTarget { pos: number; y: number }

function findTablePos(editor: Editor, wrapper: Element): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.type.name === 'table' && editor.view.nodeDOM(pos) === wrapper) { found = pos; return false }
    return true
  })
  return found
}

// 포인터 Y 아래쪽에서 가장 먼저 만나는 최상위 블록의 "앞" 경계 — 블록 높이의 절반을
// 넘기 전이면 그 블록 앞, 넘었으면 다음 블록 앞(마지막이면 문서 끝)으로 본다.
function findDropTarget(editor: Editor, clientY: number): DropTarget | null {
  const { doc } = editor.state
  let result: DropTarget | null = null
  let lastBottom = 0
  doc.forEach((node, offset) => {
    if (result) return
    const dom = editor.view.nodeDOM(offset) as HTMLElement | null
    if (!dom?.getBoundingClientRect) return
    const r = dom.getBoundingClientRect()
    lastBottom = r.bottom
    if (clientY < r.top + r.height / 2) result = { pos: offset, y: r.top }
  })
  return result ?? { pos: doc.content.size, y: lastBottom }
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
    const target = findDropTarget(editor, e.clientY)
    drag.target = target
    if (!target) { setIndicator(null); return }
    const c = container.getBoundingClientRect()
    const ed = editor.view.dom.getBoundingClientRect()
    setIndicator({ top: target.y - c.top - 1, left: ed.left - c.left, width: ed.width })
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
