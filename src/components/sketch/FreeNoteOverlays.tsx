'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Trash2, RotateCw, Pen, Highlighter, Maximize2 } from 'lucide-react'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { useAutosave } from '@/hooks/useAutosave'
import type { AutosaveFailureReason, AutosaveStatus } from '@/lib/autosave/types'
import type { SketchCard, SketchEdge, SketchFrame, SketchTableData } from '@/types'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
// 구조색(카드/셀 기본 텍스트) — CATEGORY_PALETTE(사용자 콘텐츠색)와 별개로, 카드 배경이
// 테마에 따라 옅어지므로(저알파 tint가 페이지 배경과 블렌드) 텍스트도 함께 반전돼야 대비가 유지된다.
const BASE_TEXT = 'var(--text-primary)'
const TABLE_ACCENT = '#6BB6C7'
const TABLE_ACCENT_BG = 'rgba(107,182,199,0.14)'
const TABLE_ACCENT_BORDER = 'rgba(107,182,199,0.4)'

// ── Autosave 상태 표시 — 눈에 띄지 않는 수준의 짧은 텍스트만(quick memo의
// AutosaveStatusBadge와 동일한 "honest status" 원칙: 성공 안 했는데 저장됨으로
// 보이는 표시는 하지 않는다). idle/local-saving/pending-sync처럼 매 타이핑마다
// 바뀌는 상태는 너무 잦아서 오히려 산만해지므로 표시하지 않는다.
export function AutosaveStatusHint({ status, failureReason }: { status: AutosaveStatus; failureReason: AutosaveFailureReason | null }) {
  const map: Partial<Record<AutosaveStatus, { text: string; color: string }>> = {
    syncing:  { text: '저장 중…', color: 'rgba(var(--text-rgb),0.4)' },
    saved:    { text: '저장됨', color: 'rgba(102,204,153,0.75)' },
    retrying: { text: failureReason === 'network' ? '오프라인 — 재연결 시 저장' : '저장 재시도 중', color: '#F99E0B' },
    error:    { text: '저장 실패(로컬 보관)', color: '#FC8181' },
    conflict: { text: '충돌 발생', color: '#F99E0B' },
  }
  const cur = map[status]
  if (!cur) return null
  return <span className="text-[10px] flex-shrink-0" style={{ color: cur.color }}>{cur.text}</span>
}

// ── Autosave 복구 배너(포스트잇/표처럼 작은 카드용 컴팩트 버전) — 자동 적용하지
// 않고 사용자가 적용/무시를 직접 고른다(architecture Ch.6). 카드마다 독립된
// useAutosave 인스턴스를 쓰므로 여러 개가 동시에 있어도 서로 섞이지 않는다.
function CompactRecoveryBanner({ onApply, onDiscard }: { onApply: () => void; onDiscard: () => void }) {
  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px]"
      style={{ background: 'rgba(76,127,224,0.16)', border: '1px solid rgba(76,127,224,0.35)', color: 'var(--accent-badge-text)' }}
      onPointerDown={e => e.stopPropagation()}>
      <span className="flex-1 truncate">복구 가능한 내용 있음</span>
      <button onClick={onApply} className="underline underline-offset-2 flex-shrink-0">적용</button>
      <button onClick={onDiscard} className="underline underline-offset-2 flex-shrink-0">무시</button>
    </div>
  )
}

// ── 서식바(A-/A+/강조) — 문서 본문(FreeNoteCanvas)·포스트잇 공용 ────────────────
// SketchCanvas.tsx의 카드 에디터가 이미 쓰는 block(줄) 단위 font-size 조절 +
// Alt+1(빨간펜)/Alt+2(형광펜) 토글을 자유노트 쪽 텍스트에도 그대로 적용한다.
const RED = '#EF4444'
const HILITE = '#FEF08A'
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 48
const FONT_SIZE_STEP = 1.5

// node로부터 위로 올라가며 root의 direct child(= block)를 찾는다.
function closestBlock(root: HTMLElement, node: globalThis.Node | null): HTMLElement | null {
  let cur: globalThis.Node | null = node
  while (cur && cur !== root) {
    if (cur.parentNode === root) return cur as HTMLElement
    cur = cur.parentNode
  }
  return null
}

// Chrome contentEditable은 Enter로 줄을 나누면 두 번째 줄부터 <div>로 감싸고,
// 첫 줄만 감싸는 요소 없이 root의 loose child로 남는다 — 이 첫 줄에도 개별
// font-size를 걸 수 있도록, 처음 만지는 시점에 <div>로 한 번 감싸준다.
function normalizeLeadingText(root: HTMLElement) {
  const first = root.firstChild
  if (!first) return
  if (first.nodeType === globalThis.Node.ELEMENT_NODE && (first as Element).tagName === 'DIV') return
  const sel = window.getSelection()
  const hadSelectionHere = !!(sel && sel.rangeCount > 0 && sel.anchorNode && root.contains(sel.anchorNode))
  const restoreNode = hadSelectionHere ? sel!.anchorNode : null
  const restoreOffset = hadSelectionHere ? sel!.anchorOffset : 0
  const wrapper = document.createElement('div')
  let node: ChildNode | null = root.firstChild
  while (node && !(node.nodeType === globalThis.Node.ELEMENT_NODE && (node as Element).tagName === 'DIV')) {
    const next: ChildNode | null = node.nextSibling
    wrapper.appendChild(node)
    node = next
  }
  root.insertBefore(wrapper, root.firstChild)
  if (hadSelectionHere && restoreNode && sel) {
    try {
      const range = document.createRange()
      range.setStart(restoreNode, restoreOffset)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch {}
  }
}

// 현재 selection이 속한 block(들)을 반환한다 — cursor만 있으면 1개, 여러 block에
// 걸쳐 드래그 선택했으면 그 사이 block 전부.
function resolveSelectedBlocks(root: HTMLElement): HTMLElement[] {
  normalizeLeadingText(root)
  const fallback = (): HTMLElement[] => {
    const first = root.firstElementChild as HTMLElement | null
    return first ? [first] : []
  }
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) return fallback()
  const startBlock = closestBlock(root, sel.anchorNode)
  const endBlock = closestBlock(root, sel.focusNode)
  if (!startBlock) return fallback()
  if (!endBlock || startBlock === endBlock) return [startBlock]
  const children = Array.from(root.children) as HTMLElement[]
  const i1 = children.indexOf(startBlock)
  const i2 = children.indexOf(endBlock)
  if (i1 === -1 || i2 === -1) return [startBlock]
  const [lo, hi] = i1 <= i2 ? [i1, i2] : [i2, i1]
  return children.slice(lo, hi + 1)
}

function getBlockFontSize(block: HTMLElement, fallback: number): number {
  const n = parseFloat(getComputedStyle(block).fontSize)
  return Number.isNaN(n) ? fallback : n
}

// selectionchange마다(타이핑 중 매 키 입력마다) 호출되므로 DOM을 건드리지 않는다.
function peekCurrentBlockFontSize(root: HTMLElement, fallback: number): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    const first = root.firstElementChild as HTMLElement | null
    return first ? getBlockFontSize(first, fallback) : fallback
  }
  const block = closestBlock(root, sel.anchorNode)
  return block ? getBlockFontSize(block, fallback) : fallback
}

// 다른 서식은 없어도 "빨간펜"(Alt+1)/"형광펜"(Alt+2)만은 지원 — 선택 영역 있으면
// 그 부분만, 없으면 토글.
function toggleRedPen() {
  document.execCommand('styleWithCSS', false, 'true')
  const current = document.queryCommandValue('foreColor')
  const isRed = current === 'rgb(239, 68, 68)' || current.toLowerCase() === RED.toLowerCase()
  document.execCommand('foreColor', false, isRed ? BASE_TEXT : RED)
}
function toggleHighlight() {
  document.execCommand('styleWithCSS', false, 'true')
  const cmd = document.queryCommandSupported?.('hiliteColor') ? 'hiliteColor' : 'backColor'
  const current = document.queryCommandValue(cmd)
  const isHi = current === 'rgb(254, 240, 138)' || current.toLowerCase() === HILITE.toLowerCase()
  document.execCommand(cmd, false, isHi ? 'transparent' : HILITE)
}

// Chrome contentEditable에서 Enter를 연달아 눌러 빈 줄을 여러 개 만들면, 두 번째부터
// 이어지는 빈 <div>에 <br>이 안 붙는 경우가 있다 — <br> 없는 빈 div는 line box 높이가
// 0으로 접혀서 클릭해도 캐럿이 안 잡힌다. 매 input마다 빈 블록에 <br>을 채워 넣는다.
export function ensureEmptyBlocksHaveBr(root: HTMLElement) {
  Array.from(root.children).forEach(child => {
    if (child.childNodes.length === 0) child.appendChild(document.createElement('br'))
  })
}

/** 본문(FreeNoteCanvas)·포스트잇(BoxOverlay) 공용 서식바 — A-/A+·강조·형광펜.
 *  editorRef가 가리키는 contentEditable에 직접 keydown을 걸어 Alt+1/Alt+2/
 *  Ctrl·Cmd+Shift+.,도 함께 지원한다. */
export function BlockFormatBar({ editorRef, fallbackSize, className }: {
  editorRef: React.RefObject<HTMLElement | null>
  fallbackSize: number
  className?: string
}) {
  const [size, setSize] = useState(fallbackSize)

  const adjust = useCallback((delta: number) => {
    const root = editorRef.current
    if (!root) return
    const blocks = resolveSelectedBlocks(root)
    if (blocks.length === 0) return
    blocks.forEach(block => {
      const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, +(getBlockFontSize(block, fallbackSize) + delta).toFixed(1)))
      block.style.fontSize = `${next}px`
    })
    setSize(getBlockFontSize(blocks[0], fallbackSize))
  }, [editorRef, fallbackSize])

  useEffect(() => {
    const root = editorRef.current
    if (!root) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key === '1') { e.preventDefault(); toggleRedPen(); return }
      if (e.altKey && e.key === '2') { e.preventDefault(); toggleHighlight(); return }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) {
        e.preventDefault(); e.stopPropagation()
        adjust(e.code === 'Period' ? FONT_SIZE_STEP : -FONT_SIZE_STEP)
      }
    }
    function onSelectionChange() {
      if (!root || !window.getSelection()?.anchorNode || !root.contains(window.getSelection()!.anchorNode)) return
      setSize(peekCurrentBlockFontSize(root, fallbackSize))
    }
    root.addEventListener('keydown', onKeyDown)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      root.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [editorRef, fallbackSize, adjust])

  return (
    <div className={`flex items-center gap-1 px-1.5 py-1 rounded-lg flex-shrink-0 nodrag ${className ?? ''}`}
      style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.08)', width: 'fit-content' }}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold opacity-60 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity flex-shrink-0"
        style={{ color: BASE_TEXT }}
        onMouseDown={e => e.preventDefault()}
        onClick={() => adjust(-FONT_SIZE_STEP)}
        title="현재 텍스트 블록 글씨 작게 (Ctrl/Cmd+Shift+,)"
      >A−</button>
      <span className="text-[9px] font-mono opacity-40 w-7 text-center flex-shrink-0 select-none" style={{ color: BASE_TEXT }}>
        {Math.round(size)}px
      </span>
      <button
        className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold opacity-60 hover:opacity-100 hover:bg-[rgba(var(--ink-rgb),0.08)] transition-opacity flex-shrink-0"
        style={{ color: BASE_TEXT }}
        onMouseDown={e => e.preventDefault()}
        onClick={() => adjust(FONT_SIZE_STEP)}
        title="현재 텍스트 블록 글씨 크게 (Ctrl/Cmd+Shift+.)"
      >A+</button>
      <div className="w-px h-3.5 mx-0.5 flex-shrink-0" style={{ background: 'rgba(var(--ink-rgb),0.16)' }} />
      <button
        className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(239,68,68,0.15)] transition-opacity flex-shrink-0"
        style={{ color: RED }}
        onMouseDown={e => e.preventDefault()}
        onClick={toggleRedPen}
        title="강조 · 빨간펜 (Alt+1)"
      ><Pen size={12} /></button>
      <button
        className="w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-[rgba(234,179,8,0.18)] transition-opacity flex-shrink-0"
        style={{ color: '#EAB308' }}
        onMouseDown={e => e.preventDefault()}
        onClick={toggleHighlight}
        title="형광펜 (Alt+2)"
      ><Highlighter size={12} /></button>
    </div>
  )
}

// 예전 저장분(순수 텍스트)은 그대로 HTML로 꽂으면 <, &, > 가 깨짐 — 태그가 있는
// 저장분만 HTML로 신뢰하고, 그 외엔 escape 처리. null/undefined도 방어(구버전 row 등).
export function toDisplayHtml(content: string | null | undefined): string {
  if (!content) return ''
  if (/<(span|br|div|p|b|i|u)[\s/>]/i.test(content)) return content
  return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type OverlayBox = { x: number; y: number; width: number; height: number; rotation: number }
type Corner = 'nw' | 'ne' | 'sw' | 'se'

function rotateVec(x: number, y: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

// 회전된 사각형의 반대편 코너를 화면상 고정한 채 드래그 중인 코너로 리사이즈한다.
// (Figma/PowerPoint류의 "회전 후 리사이즈" 표준 알고리즘)
function resizeRotatedBox(
  start: OverlayBox,
  corner: Corner,
  screenDelta: { x: number; y: number },
  opts: { minWidth: number; minHeight: number; keepAspectRatio?: boolean },
): OverlayBox {
  const local = rotateVec(screenDelta.x, screenDelta.y, -start.rotation)
  const signX = corner === 'ne' || corner === 'se' ? 1 : -1
  const signY = corner === 'sw' || corner === 'se' ? 1 : -1
  let width = start.width + signX * local.x
  let height = start.height + signY * local.y

  if (opts.keepAspectRatio) {
    const dist0 = Math.hypot(start.width, start.height) || 1
    const distNew = Math.hypot(width, height)
    const scale = Math.max(distNew / dist0, opts.minWidth / start.width, opts.minHeight / start.height)
    width = start.width * scale
    height = start.height * scale
  } else {
    width = Math.max(opts.minWidth, width)
    height = Math.max(opts.minHeight, height)
  }

  const oldCenter = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
  // 드래그 코너의 반대편(고정) 코너 — 새 w/h 기준 중심 대비 상대 위치
  const anchorRel = { x: (corner === 'ne' || corner === 'se' ? -1 : 1) * (start.width / 2), y: (corner === 'sw' || corner === 'se' ? -1 : 1) * (start.height / 2) }
  const anchorWorld = { x: oldCenter.x + rotateVec(anchorRel.x, anchorRel.y, start.rotation).x, y: oldCenter.y + rotateVec(anchorRel.x, anchorRel.y, start.rotation).y }
  const newAnchorRel = { x: (corner === 'ne' || corner === 'se' ? -1 : 1) * (width / 2), y: (corner === 'sw' || corner === 'se' ? -1 : 1) * (height / 2) }
  const newCenter = { x: anchorWorld.x - rotateVec(newAnchorRel.x, newAnchorRel.y, start.rotation).x, y: anchorWorld.y - rotateVec(newAnchorRel.x, newAnchorRel.y, start.rotation).y }

  return { x: newCenter.x - width / 2, y: newCenter.y - height / 2, width, height, rotation: start.rotation }
}

const CORNERS: { key: Corner; style: React.CSSProperties }[] = [
  { key: 'nw', style: { left: -5, top: -5, cursor: 'nwse-resize' } },
  { key: 'ne', style: { right: -5, top: -5, cursor: 'nesw-resize' } },
  { key: 'sw', style: { left: -5, bottom: -5, cursor: 'nesw-resize' } },
  { key: 'se', style: { right: -5, bottom: -5, cursor: 'nwse-resize' } },
]

// ── 공용 프레임: 드래그 이동 / 코너 리사이즈 / 자유 회전 핸들 ────────────────────
function OverlayFrame({
  box, selected, minWidth, minHeight, keepAspectRatio, accentColor, onSelect, onChange, onDelete, children, toolbar,
}: {
  box: OverlayBox
  selected: boolean
  minWidth: number
  minHeight: number
  keepAspectRatio?: boolean
  accentColor: string
  onSelect: () => void
  onChange: (box: OverlayBox) => void
  onDelete: () => void
  children: React.ReactNode
  toolbar?: React.ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<OverlayBox | null>(null)
  const draggingRef = useRef(false)

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect()
    const startBox = box
    const startX = e.clientX, startY = e.clientY
    draggingRef.current = false
    function onMove(ev: PointerEvent) {
      draggingRef.current = true
      setLive({ ...startBox, x: startBox.x + (ev.clientX - startX), y: startBox.y + (ev.clientY - startY) })
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (draggingRef.current) {
        onChange({ ...startBox, x: startBox.x + (ev.clientX - startX), y: startBox.y + (ev.clientY - startY) })
      }
      setLive(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [box, onChange, onSelect])

  const startResize = useCallback((corner: Corner) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    const startBox = box
    const startX = e.clientX, startY = e.clientY
    function onMove(ev: PointerEvent) {
      setLive(resizeRotatedBox(startBox, corner, { x: ev.clientX - startX, y: ev.clientY - startY }, { minWidth, minHeight, keepAspectRatio }))
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onChange(resizeRotatedBox(startBox, corner, { x: ev.clientX - startX, y: ev.clientY - startY }, { minWidth, minHeight, keepAspectRatio }))
      setLive(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [box, minWidth, minHeight, keepAspectRatio, onChange, onSelect])

  const startRotate = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    const startBox = box
    function angleAt(clientX: number, clientY: number): number {
      const rect = rootRef.current!.getBoundingClientRect()
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
      return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90
    }
    function onMove(ev: PointerEvent) {
      setLive({ ...startBox, rotation: angleAt(ev.clientX, ev.clientY) })
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onChange({ ...startBox, rotation: angleAt(ev.clientX, ev.clientY) })
      setLive(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [box, onChange, onSelect])

  const b = live ?? box

  return (
    <div
      ref={rootRef}
      className="absolute"
      style={{ left: b.x, top: b.y, width: b.width, height: b.height, transform: `rotate(${b.rotation}deg)`, transformOrigin: 'center center' }}
      onPointerDown={startDrag}
    >
      {children}
      {selected && (
        <>
          <div
            className="absolute left-1/2 flex items-center justify-center rounded-full nodrag"
            style={{ top: -30, width: 20, height: 20, marginLeft: -10, background: 'var(--surface-tooltip)', border: `1.5px solid ${accentColor}`, cursor: 'grab' }}
            onPointerDown={startRotate}
            title="드래그해서 회전"
          >
            <RotateCw size={11} color={accentColor} />
          </div>
          {CORNERS.map(c => (
            <div
              key={c.key}
              className="absolute rounded-[2px]"
              style={{ width: 10, height: 10, background: accentColor, border: '1.5px solid rgba(var(--ink-rgb),0.85)', ...c.style }}
              onPointerDown={startResize(c.key)}
            />
          ))}
          {/* 회전 핸들(위쪽 중앙)과 겹치지 않도록 오른쪽 바깥에 세로로 배치 */}
          <div className="absolute flex flex-col items-center gap-1 px-1 py-1 rounded-md nodrag" style={{ left: '100%', top: 0, marginLeft: 6, background: 'var(--surface-tooltip)' }}>
            {toolbar}
            <button className="opacity-70 hover:opacity-100 hover:text-red-400 flex-shrink-0" onPointerDown={e => e.stopPropagation()} onClick={onDelete}>
              <Trash2 size={11} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── 이미지 오버레이 ──────────────────────────────────────────────────────────
export function ImageOverlay({
  box, src, selected, onSelect, onChange, onDelete,
}: {
  box: OverlayBox
  src: string
  selected: boolean
  onSelect: () => void
  onChange: (box: OverlayBox) => void
  onDelete: () => void
}) {
  return (
    <OverlayFrame box={box} selected={selected} minWidth={40} minHeight={40} keepAspectRatio accentColor="#4C7FE0" onSelect={onSelect} onChange={onChange} onDelete={onDelete}>
      <div className="relative w-full h-full rounded-lg overflow-hidden" style={{ border: selected ? '1.5px solid rgba(76,127,224,0.75)' : '1px solid rgba(var(--ink-rgb),0.08)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className="w-full h-full object-contain select-none" style={{ background: 'rgba(var(--ink-rgb),0.03)' }} />
      </div>
    </OverlayFrame>
  )
}

// ── 포스트잇 박스 오버레이(메모 텍스트 포함) ──────────────────────────────────
export function BoxOverlay({
  id, box, color, content, selected, onSelect, onChange, onDelete, onColorChange, onContentChange, supabase,
}: {
  id: string
  box: OverlayBox
  color: CategoryColorKey
  content: string
  selected: boolean
  onSelect: () => void
  onChange: (box: OverlayBox) => void
  onDelete: () => void
  onColorChange: (color: CategoryColorKey) => void
  onContentChange: (content: string) => void
  supabase: SupabaseClient
}) {
  const palette = CATEGORY_PALETTE[color]
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [isEditing, setIsEditing] = useState(false)

  // 최초 1회만 innerHTML 세팅 — 이후엔 DOM이 진실 소스(커서 위치 보존)
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = toDisplayHtml(content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // content prop은 이미 canonical에서 로드된 값(부모 elements가 먼저 채워진 뒤에만
  // 이 컴포넌트가 마운트됨)이라 여기서 seed하는 초기값 자체가 정확한 기준값이다 —
  // 1on1/자유노트 본문과 달리 false recovery 방지를 위한 별도 처리가 필요 없다.
  const [autosaveContent, setAutosaveContent] = useState(content ?? '')
  const autosave = useAutosave({
    supabase, enabled: isEditing, entityType: 'sketch_note_element', entityId: id, fieldKey: 'content', value: autosaveContent,
  })

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    ensureEmptyBlocksHaveBr(e.currentTarget)
    const html = e.currentTarget.innerHTML
    setAutosaveContent(html)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onContentChange(html), 500)
  }

  function applyRecovered() {
    if (!autosave.recovered) return
    const html = (autosave.recovered.value as string) ?? ''
    autosave.discardRecovered()
    clearTimeout(saveTimer.current)
    setAutosaveContent(html)
    if (editorRef.current) editorRef.current.innerHTML = toDisplayHtml(html)
    onContentChange(html)
  }

  return (
    <OverlayFrame
      box={box} selected={selected} minWidth={80} minHeight={80} accentColor={palette.solid}
      onSelect={onSelect} onChange={onChange} onDelete={onDelete}
      toolbar={COLOR_KEYS.map(key => (
        <button
          key={key}
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform hover:scale-125"
          style={{ background: CATEGORY_PALETTE[key].solid, outline: key === color ? `1.5px solid ${CATEGORY_PALETTE[key].text}` : 'none', outlineOffset: 1.5 }}
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onColorChange(key)}
        />
      ))}
    >
      <div className="w-full h-full rounded-lg p-2 flex flex-col gap-1 overflow-hidden" style={{ background: palette.bg, border: `1.5px solid ${palette.border}`, boxShadow: '0 4px 14px rgba(0,0,0,0.22)' }}>
        {autosave.recovered && <CompactRecoveryBanner onApply={applyRecovered} onDiscard={() => autosave.discardRecovered()} />}
        {selected && <BlockFormatBar editorRef={editorRef} fallbackSize={13} />}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={() => setIsEditing(true)}
          onBlur={() => { setIsEditing(false); void autosave.flush() }}
          onPointerDown={e => e.stopPropagation()}
          data-placeholder="메모…"
          className="freenote-body flex-1 min-h-0 outline-none overflow-y-auto scrollbar-hide leading-snug"
          style={{ color: BASE_TEXT, fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
        />
        {selected && <AutosaveStatusHint status={autosave.status} failureReason={autosave.failureReason} />}
      </div>
    </OverlayFrame>
  )
}

// ── 표 카드(엑셀처럼: 셀 편집 · 행/열 추가삭제 · 열 너비 드래그) ────────────────
// 구조(행/열 수, 머리글, 배경)는 평범한 React state로 관리해 렌더에 반영한다.
// 셀 텍스트만은 예외 — JSX가 그 내용을 직접 렌더하면 매 키 입력마다 React가
// contentEditable의 text node를 재구성하면서 캐럿이 튄다(BoxOverlay가 이미
// 같은 이유로 content를 state로 렌더하지 않는 것과 같은 문제). 그래서 셀의
// 초기 텍스트만 ref 콜백으로 한 번 심어두고, 이후로는 DOM이 진실 소스다.
function placeCaretEnd(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

export function TableOverlay({
  id, box, data, selected, onSelect, onChange, onDelete, onDataChange, supabase,
}: {
  id: string
  box: OverlayBox
  data: SketchTableData
  selected: boolean
  onSelect: () => void
  onChange: (box: OverlayBox) => void
  onDelete: () => void
  onDataChange: (data: SketchTableData) => void
  supabase: SupabaseClient
}) {
  // data prop은 이미 canonical에서 로드된 값(부모 elements가 먼저 채워진 뒤에만
  // 이 컴포넌트가 마운트됨)이라 seed하는 초기값 자체가 정확한 기준값 — BoxOverlay와
  // 동일한 이유로 false recovery 방지를 위한 별도 처리가 필요 없다.
  const [tableData, setTableData] = useState<SketchTableData>(data)
  // 현재 포커스된 셀 — 행/열 추가·삭제가 "이 셀 기준"으로 동작하게 한다. 저장되는
  // SketchTableData 자체에는 안 넣는다(구조 데이터가 아니라 일시적 UI 상태).
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null)
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  // 표 전체 단위의 편집 상태 — 셀 하나하나에 걸지 않는 이유: Tab/클릭으로 셀
  // 사이를 옮겨다닐 때마다 훅이 꺼졌다 켜졌다 하면 그때마다 bootstrap GET이
  // 다시 돌아 과도한 요청이 생긴다(요청사항 4). 포커스가 표 컨테이너 밖으로
  // 완전히 나갈 때만 꺼지고 flush 되도록 focus/blur를 컨테이너에서 capture한다.
  const [isEditing, setIsEditing] = useState(false)

  const autosave = useAutosave({
    supabase, enabled: isEditing, entityType: 'sketch_note_element', entityId: id, fieldKey: 'table_data', value: tableData,
  })

  function handleContainerFocus() {
    setIsEditing(true)
  }
  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null
    if (next && containerRef.current?.contains(next)) return // 셀/툴바 사이 이동 — 계속 편집 중
    setIsEditing(false)
    void autosave.flush()
  }

  function persist(next: SketchTableData, immediate: boolean) {
    if (immediate) { onDataChange(next); return }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onDataChange(next), 500)
  }

  function applyRecovered() {
    if (!autosave.recovered) return
    const next = autosave.recovered.value as SketchTableData
    autosave.discardRecovered()
    clearTimeout(saveTimer.current)
    // 셀 DOM은 최초 1회만 seed되고 이후엔 DOM이 진실 소스라(캐럿 보존), state만
    // 바꿔서는 화면이 안 바뀐다 — seeded 플래그를 지워 다음 렌더에서 복구된
    // 텍스트로 다시 seed되게 한다.
    cellRefs.current.forEach(td => { delete td.dataset.seeded })
    setTableData(next)
    onDataChange(next)
  }

  function focusCell(r: number, c: number) {
    requestAnimationFrame(() => {
      const td = cellRefs.current.get(`${r}:${c}`)
      if (td) { td.focus(); placeCaretEnd(td) }
    })
  }

  function updateCellText(r: number, c: number, text: string) {
    setTableData(prev => {
      const rows = prev.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? text : cell)) : row))
      const next = { ...prev, rows }
      persist(next, false)
      return next
    })
  }
  function addRow() {
    setTableData(prev => {
      const count = prev.rows[0]?.length ?? prev.colWidths.length
      const insertAt = activeCell ? activeCell.r + 1 : prev.rows.length
      const next = { ...prev, rows: [...prev.rows.slice(0, insertAt), new Array(count).fill(''), ...prev.rows.slice(insertAt)] }
      persist(next, true)
      return next
    })
  }
  function removeRow() {
    setTableData(prev => {
      if (prev.rows.length <= 1) return prev
      const idx = Math.min(activeCell?.r ?? prev.rows.length - 1, prev.rows.length - 1)
      const next = { ...prev, rows: prev.rows.filter((_, i) => i !== idx) }
      setActiveCell(a => (a ? { r: Math.max(0, idx - 1), c: a.c } : a))
      persist(next, true)
      return next
    })
  }
  function addCol() {
    setTableData(prev => {
      const insertAt = activeCell ? activeCell.c + 1 : prev.colWidths.length
      const next = {
        ...prev,
        rows: prev.rows.map(row => [...row.slice(0, insertAt), '', ...row.slice(insertAt)]),
        colWidths: [...prev.colWidths.slice(0, insertAt), 100, ...prev.colWidths.slice(insertAt)],
      }
      persist(next, true)
      return next
    })
  }
  function removeCol() {
    setTableData(prev => {
      if (prev.colWidths.length <= 1) return prev
      const idx = Math.min(activeCell?.c ?? prev.colWidths.length - 1, prev.colWidths.length - 1)
      const next = {
        ...prev,
        rows: prev.rows.map(row => row.filter((_, i) => i !== idx)),
        colWidths: prev.colWidths.filter((_, i) => i !== idx),
      }
      setActiveCell(a => (a ? { r: a.r, c: Math.max(0, idx - 1) } : a))
      persist(next, true)
      return next
    })
  }
  function toggleHeader() { setTableData(prev => { const next = { ...prev, headerRow: !prev.headerRow }; persist(next, true); return next }) }
  function toggleBg() { setTableData(prev => { const next = { ...prev, transparentBg: !prev.transparentBg }; persist(next, true); return next }) }

  function handleCellKeyDown(e: React.KeyboardEvent<HTMLTableCellElement>, r: number, c: number) {
    const rows = tableData.rows
    if (e.key === 'Tab') {
      e.preventDefault()
      let nr = r, nc = c + (e.shiftKey ? -1 : 1)
      if (nc < 0) { nr -= 1; nc = rows[0].length - 1 }
      if (nc >= rows[0].length) { nr += 1; nc = 0 }
      if (nr < 0) return
      if (nr >= rows.length) addRow()
      focusCell(nr, nc)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const downR = r + 1
      if (downR >= rows.length) addRow()
      focusCell(downR, c)
    } else if (e.key === 'Escape') {
      e.currentTarget.blur()
    }
  }

  function startColResize(e: React.PointerEvent, colIndex: number) {
    e.stopPropagation(); e.preventDefault()
    const sx = e.clientX
    const startW = tableData.colWidths[colIndex]
    function onMove(ev: PointerEvent) {
      setTableData(prev => {
        const colWidths = [...prev.colWidths]
        colWidths[colIndex] = Math.max(40, startW + (ev.clientX - sx))
        return { ...prev, colWidths }
      })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setTableData(prev => { persist(prev, true); return prev })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function mkBtn(label: string, title: string, onClick: () => void) {
    return (
      <button
        key={label}
        className="px-1.5 py-0.5 rounded text-[10.5px] flex-shrink-0"
        style={{ background: 'rgba(var(--ink-rgb),0.05)', border: '1px solid rgba(var(--ink-rgb),0.08)', color: 'rgba(var(--text-rgb),0.5)' }}
        onPointerDown={e => e.stopPropagation()}
        onClick={onClick}
        title={title}
      >{label}</button>
    )
  }

  const bg = tableData.transparentBg ? 'transparent' : TABLE_ACCENT_BG
  const border = tableData.transparentBg ? 'rgba(var(--ink-rgb),0.16)' : TABLE_ACCENT_BORDER
  // 열 경계 리사이즈 핸들의 left 오프셋(누적 너비) — 렌더 중 변수 재대입 없이 미리 계산.
  const colLefts = tableData.colWidths.reduce<number[]>((acc, w, i) => { acc.push((acc[i - 1] ?? 0) + w); return acc }, [])

  return (
    <OverlayFrame box={box} selected={selected} minWidth={240} minHeight={140} accentColor={TABLE_ACCENT} onSelect={onSelect} onChange={onChange} onDelete={onDelete}>
      <div
        ref={containerRef}
        onFocusCapture={handleContainerFocus}
        onBlurCapture={handleContainerBlur}
        className="w-full h-full rounded-lg p-2 flex flex-col gap-1.5 overflow-hidden" style={{ background: bg, border: `1.5px solid ${border}` }}>
        {autosave.recovered && <CompactRecoveryBanner onApply={applyRecovered} onDiscard={() => autosave.discardRecovered()} />}
        {selected && (
          <div className="flex items-center gap-1 flex-wrap flex-shrink-0">
            {mkBtn('+행', '현재 행 아래에 행 추가', addRow)}
            {mkBtn('−행', '현재 행 삭제', removeRow)}
            {mkBtn('+열', '현재 열 오른쪽에 열 추가', addCol)}
            {mkBtn('−열', '현재 열 삭제', removeCol)}
            {mkBtn('머리글', '첫 행을 머리글 행으로', toggleHeader)}
            {mkBtn('배경', '카드 배경색 지우기/복원', toggleBg)}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto rounded" onPointerDown={e => e.stopPropagation()}>
          <div className="relative inline-block">
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                {tableData.colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <tbody>
                {tableData.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cellText, ci) => (
                      <td
                        key={ci}
                        ref={el => {
                          if (!el) { cellRefs.current.delete(`${ri}:${ci}`); return }
                          cellRefs.current.set(`${ri}:${ci}`, el)
                          // 최초 1회만 텍스트를 심는다 — 이후엔 DOM이 진실 소스(캐럿 위치 보존).
                          if (el.dataset.seeded !== '1') { el.textContent = cellText; el.dataset.seeded = '1' }
                        }}
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        onFocus={() => setActiveCell({ r: ri, c: ci })}
                        onInput={e => updateCellText(ri, ci, e.currentTarget.textContent ?? '')}
                        onKeyDown={e => handleCellKeyDown(e, ri, ci)}
                        onPointerDown={e => e.stopPropagation()}
                        className="outline-none"
                        style={{
                          border: '1px solid rgba(var(--ink-rgb),0.16)', padding: '5px 8px', fontSize: 12, color: BASE_TEXT,
                          overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', verticalAlign: 'top',
                          fontWeight: tableData.headerRow && ri === 0 ? 600 : 400,
                          background: tableData.headerRow && ri === 0 ? 'rgba(var(--ink-rgb),0.07)' : undefined,
                        }}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {tableData.colWidths.slice(0, -1).map((_, i) => (
              <div key={i} className="absolute top-0 bottom-0"
                style={{ width: 7, marginLeft: -3.5, left: colLefts[i], cursor: 'col-resize', zIndex: 2 }}
                onPointerDown={e => startColResize(e, i)}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          <span>{tableData.rows.length}행 × {tableData.colWidths.length}열</span>
          {selected && <AutosaveStatusHint status={autosave.status} failureReason={autosave.failureReason} />}
        </div>
      </div>
    </OverlayFrame>
  )
}

// ── 마인드맵 카드 — 자유노트 위의 포스트잇처럼 놓지만, 안쪽은 자식 마인드맵 보드의
// 읽기전용 미리보기다. 편집은 더블클릭/확장 아이콘으로 그 자식 보드를 기존
// SketchCanvas로 그대로 여는 방식(별도 미니 편집기를 새로 안 만든다) ──────────────
const MINDMAP_ACCENT = '#4C7FE0'

function cardAbsolutePosition(card: SketchCard, frames: SketchFrame[]): { x: number; y: number } {
  if (!card.frame_id) return { x: card.position_x, y: card.position_y }
  const frame = frames.find(f => f.id === card.frame_id)
  if (!frame) return { x: card.position_x, y: card.position_y }
  return { x: frame.position_x + card.position_x, y: frame.position_y + card.position_y }
}

export function MindmapCardOverlay({
  box, childBoardId, selected, onSelect, onChange, onDelete, onExpand, refreshToken, supabase,
}: {
  box: OverlayBox
  childBoardId: string
  selected: boolean
  onSelect: () => void
  onChange: (box: OverlayBox) => void
  onDelete: () => void
  onExpand: () => void
  /** 확장 모달을 닫을 때마다 값을 바꿔서 미리보기를 새로 불러오게 한다 */
  refreshToken: number
  supabase: SupabaseClient
}) {
  const [title, setTitle] = useState('마인드맵')
  const [cards, setCards] = useState<SketchCard[]>([])
  const [edges, setEdges] = useState<SketchEdge[]>([])
  const [frames, setFrames] = useState<SketchFrame[]>([])
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const previewInnerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('sketch_boards').select('name').eq('id', childBoardId).single(),
      supabase.from('sketch_cards').select('*').eq('board_id', childBoardId),
      supabase.from('sketch_edges').select('*').eq('board_id', childBoardId),
      supabase.from('sketch_frames').select('*').eq('board_id', childBoardId),
    ]).then(([boardRes, cardsRes, edgesRes, framesRes]) => {
      if (cancelled) return
      if (boardRes.data) setTitle(boardRes.data.name)
      setCards((cardsRes.data ?? []) as SketchCard[])
      setEdges((edgesRes.data ?? []) as SketchEdge[])
      setFrames((framesRes.data ?? []) as SketchFrame[])
    })
    return () => { cancelled = true }
  }, [childBoardId, supabase, refreshToken])

  // 카드/연결선 배치가 바뀔 때마다(로드 시, 리사이즈 시) 카드 크기에 맞춰 스케일 조정
  useEffect(() => {
    const wrap = previewWrapRef.current
    const inner = previewInnerRef.current
    if (!wrap || !inner || cards.length === 0) return
    const positions = cards.map(c => cardAbsolutePosition(c, frames))
    const minX = Math.min(...positions.map(p => p.x)) - 20
    const minY = Math.min(...positions.map(p => p.y)) - 20
    const maxX = Math.max(...positions.map((p, i) => p.x + cards[i].width)) + 20
    const maxY = Math.max(...positions.map((p, i) => p.y + cards[i].height)) + 20
    const gw = maxX - minX, gh = maxY - minY
    inner.style.width = `${gw}px`
    inner.style.height = `${gh}px`
    const raf = requestAnimationFrame(() => {
      const availW = wrap.clientWidth, availH = wrap.clientHeight
      if (!availW || !availH) return
      const scale = Math.max(0.22, Math.min(availW / gw, availH / gh, 1))
      inner.style.transform = `scale(${scale})`
    })
    return () => cancelAnimationFrame(raf)
  }, [cards, frames, box.width, box.height])

  const positions = cards.map(c => cardAbsolutePosition(c, frames))
  const minX = positions.length ? Math.min(...positions.map(p => p.x)) - 20 : 0
  const minY = positions.length ? Math.min(...positions.map(p => p.y)) - 20 : 0

  return (
    <OverlayFrame box={box} selected={selected} minWidth={220} minHeight={150} accentColor={MINDMAP_ACCENT} onSelect={onSelect} onChange={onChange} onDelete={onDelete}>
      <div
        className="w-full h-full rounded-lg flex flex-col overflow-hidden"
        style={{ background: 'rgba(76,127,224,0.14)', border: '1.5px solid rgba(76,127,224,0.38)' }}
        onDoubleClick={e => { e.stopPropagation(); onExpand() }}
      >
        <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 flex-shrink-0" style={{ color: 'var(--accent-soft)' }}>
          <span className="text-[12px] font-semibold truncate">{title}</span>
        </div>
        <div ref={previewWrapRef} className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden" style={{ pointerEvents: 'none' }}>
          <div ref={previewInnerRef} className="relative flex-shrink-0">
            <svg className="absolute left-0 top-0 overflow-visible">
              {edges.map(edge => {
                const from = cards.find(c => c.id === edge.source_card_id)
                const to = cards.find(c => c.id === edge.target_card_id)
                if (!from || !to) return null
                const fp = cardAbsolutePosition(from, frames), tp = cardAbsolutePosition(to, frames)
                const x1 = fp.x + from.width / 2 - minX, y1 = fp.y + from.height / 2 - minY
                const x2 = tp.x + to.width / 2 - minX, y2 = tp.y + to.height / 2 - minY
                return <line key={edge.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(157,190,245,0.6)" strokeWidth={1.6} />
              })}
            </svg>
            {cards.map(card => {
              const pos = cardAbsolutePosition(card, frames)
              const pal = CATEGORY_PALETTE[card.color as CategoryColorKey] ?? CATEGORY_PALETTE.blue
              const plain = card.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
              return (
                <div key={card.id} className="absolute rounded-md flex items-center justify-center text-center px-1.5 overflow-hidden"
                  style={{
                    left: pos.x - minX, top: pos.y - minY, width: card.width, height: card.height,
                    background: pal.bg, border: `1.5px solid ${pal.border}`, color: BASE_TEXT, fontSize: 12,
                  }}
                >
                  {plain}
                </div>
              )
            })}
          </div>
        </div>
        <div className="px-2.5 pb-1.5 pt-0.5 text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          카드 {cards.length}개
        </div>
        <button
          className="absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-md flex items-center justify-center transition-opacity"
          style={{
            background: 'var(--surface-tooltip)', border: '1px solid rgba(76,127,224,0.38)', color: 'var(--accent-soft)',
            opacity: selected ? 1 : 0,
          }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onExpand() }}
          title="크게 열어서 편집"
        >
          <Maximize2 size={11} />
        </button>
      </div>
    </OverlayFrame>
  )
}
