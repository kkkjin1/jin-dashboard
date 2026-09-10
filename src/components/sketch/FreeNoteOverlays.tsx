'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Trash2, RotateCw } from 'lucide-react'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { useAutosave } from '@/hooks/useAutosave'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
const BASE_TEXT = '#E2E8F0'

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
            style={{ top: -30, width: 20, height: 20, marginLeft: -10, background: 'rgba(15,19,25,0.85)', border: `1.5px solid ${accentColor}`, cursor: 'grab' }}
            onPointerDown={startRotate}
            title="드래그해서 회전"
          >
            <RotateCw size={11} color={accentColor} />
          </div>
          {CORNERS.map(c => (
            <div
              key={c.key}
              className="absolute rounded-[2px]"
              style={{ width: 10, height: 10, background: accentColor, border: '1.5px solid rgba(255,255,255,0.85)', ...c.style }}
              onPointerDown={startResize(c.key)}
            />
          ))}
          {/* 회전 핸들(위쪽 중앙)과 겹치지 않도록 오른쪽 바깥에 세로로 배치 */}
          <div className="absolute flex flex-col items-center gap-1 px-1 py-1 rounded-md nodrag" style={{ left: '100%', top: 0, marginLeft: 6, background: 'rgba(15,19,25,0.85)' }}>
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
      <div className="relative w-full h-full rounded-lg overflow-hidden" style={{ border: selected ? '1.5px solid rgba(76,127,224,0.75)' : '1px solid rgba(255,255,255,0.08)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className="w-full h-full object-contain select-none" style={{ background: 'rgba(255,255,255,0.03)' }} />
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

  const [autosaveContent, setAutosaveContent] = useState(content ?? '')
  useAutosave({
    supabase, enabled: isEditing, entityType: 'sketch_note_element', entityId: id, fieldKey: 'content', value: autosaveContent,
  })

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const html = e.currentTarget.innerHTML
    setAutosaveContent(html)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onContentChange(html), 500)
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
      <div className="w-full h-full rounded-lg p-2.5 overflow-hidden" style={{ background: palette.bg, border: `1.5px solid ${palette.border}`, boxShadow: '0 4px 14px rgba(0,0,0,0.22)' }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onPointerDown={e => e.stopPropagation()}
          data-placeholder="메모…"
          className="freenote-body w-full h-full outline-none overflow-y-auto scrollbar-hide leading-snug"
          style={{ color: BASE_TEXT, fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
        />
      </div>
    </OverlayFrame>
  )
}
