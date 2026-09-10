'use client'

import { useEffect, useRef, useState } from 'react'
import { NodeResizer } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Trash2, GripVertical } from 'lucide-react'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { useAutosave } from '@/hooks/useAutosave'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
const BASE_TEXT = '#E2E8F0'

// 예전 저장분(순수 텍스트)은 그대로 HTML로 꽂으면 <, &, > 가 깨짐 — 우리가 저장한
// 적 있는 콘텐츠(태그 포함)만 HTML로 신뢰하고, 그 외엔 escape 처리 (SketchCanvas와 동일 규칙)
function toDisplayHtml(content: string): string {
  if (/<(span|br|div)[\s/>]/i.test(content)) return content
  return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── 텍스트 요소 ──────────────────────────────────────────────────────────────
export type NoteTextData = {
  content: string
  color: CategoryColorKey
  hasBackground: boolean
  onContentChange: (id: string, content: string) => void
  onColorChange: (id: string, color: CategoryColorKey) => void
  onBackgroundToggle: (id: string, hasBackground: boolean) => void
  onDelete: (id: string) => void
  onResize: (id: string, box: { x: number; y: number; width: number; height: number }) => void
  supabase: SupabaseClient
  /** 방금 만든 텍스트만 true — 마운트 시 1회 편집모드로 자동 진입 */
  autoFocus?: boolean
}
export type NoteTextNode = Node<NoteTextData, 'notetext'>

export function NoteTextNodeComponent({ id, data, selected }: NodeProps<NoteTextNode>) {
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const palette = CATEGORY_PALETTE[data.color]
  const [isEditing, setIsEditing] = useState(false)
  // StickyCardNode와 동일한 이유로 필요 — 텍스트 드래그-선택 중에는 왼쪽 드래그
  // 오버레이가 마우스 이벤트를 가로채면 안 됨.
  const [isSelecting, setIsSelecting] = useState(false)

  useEffect(() => {
    if (!isSelecting) return
    const onWindowMouseUp = () => setIsSelecting(false)
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [isSelecting])

  // 최초 1회만 innerHTML 세팅 — 이후엔 DOM이 진실 소스 (커서 위치 보존)
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = toDisplayHtml(data.content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!data.autoFocus) return
    let rafId: number
    let attempts = 0
    const tryFocus = () => {
      const el = editorRef.current
      if (!el) return
      const hidden = getComputedStyle(el).visibility === 'hidden'
      if (hidden && attempts < 30) { attempts += 1; rafId = requestAnimationFrame(tryFocus); return }
      el.focus()
    }
    rafId = requestAnimationFrame(tryFocus)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [autosaveContent, setAutosaveContent] = useState(data.content)
  useAutosave({
    supabase: data.supabase,
    enabled: isEditing,
    entityType: 'sketch_note_element',
    entityId: id,
    fieldKey: 'content',
    value: autosaveContent,
  })

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const html = e.currentTarget.innerHTML
    setAutosaveContent(html)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => data.onContentChange(id, html), 500)
  }

  return (
    <>
      <NodeResizer
        nodeId={id}
        isVisible={!!selected}
        minWidth={80}
        minHeight={36}
        lineStyle={{ borderColor: 'transparent' }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: palette.solid, border: '1.5px solid rgba(255,255,255,0.85)' }}
        onResizeEnd={(_event, params) => data.onResize(id, params)}
      />
      <div
        className="group relative h-full w-full flex flex-col rounded-xl"
        style={data.hasBackground
          ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }
          : {}}
      >
        <div className={`flex items-center gap-1 px-1.5 pt-1 pb-0.5 flex-shrink-0 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            className="nodrag nopan text-[10px] px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
            style={{
              background: data.hasBackground ? 'rgba(76,127,224,0.22)' : 'rgba(255,255,255,0.08)',
              color: data.hasBackground ? '#9DBEF5' : 'rgba(226,232,240,0.5)',
            }}
            onClick={() => data.onBackgroundToggle(id, !data.hasBackground)}
            title="배경 없음 ↔ 카드형 전환"
          >
            {data.hasBackground ? '카드형' : '배경없음'}
          </button>
          {data.hasBackground && COLOR_KEYS.map(key => (
            <button
              key={key}
              className="nodrag nopan w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform hover:scale-125"
              style={{ background: CATEGORY_PALETTE[key].solid, outline: key === data.color ? `1.5px solid ${CATEGORY_PALETTE[key].text}` : 'none', outlineOffset: 1.5 }}
              onClick={() => data.onColorChange(id, key)}
            />
          ))}
          <button
            className="nodrag nopan ml-auto opacity-50 hover:opacity-100 hover:text-red-400 transition-all flex-shrink-0"
            onClick={() => data.onDelete(id)}
          >
            <Trash2 size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 relative px-2 pb-1.5">
          <div
            ref={editorRef}
            contentEditable
            tabIndex={-1}
            suppressContentEditableWarning
            onInput={handleInput}
            onFocus={() => setIsEditing(true)}
            onBlur={() => { setIsEditing(false); setIsSelecting(false) }}
            onMouseDown={() => setIsSelecting(true)}
            onMouseUp={() => setIsSelecting(false)}
            className="nodrag nopan scrollbar-hide absolute inset-0 w-full h-full overflow-y-auto bg-transparent focus:outline-none leading-snug"
            style={{ color: BASE_TEXT, padding: '2px 8px 2px 16px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontSize: 14 }}
          />
          {/* 왼쪽 절반은 이동용 드래그 핸들, 오른쪽 절반(과 텍스트 선택 드래그 중)은 편집용 — StickyCardNode와 동일 관례 */}
          <div className={`absolute inset-y-0 left-0 w-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing ${isSelecting ? 'pointer-events-none' : ''}`}>
            <GripVertical size={13} className="opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none" style={{ color: palette.solid }} />
          </div>
        </div>
      </div>
    </>
  )
}

// ── 이미지 요소 ──────────────────────────────────────────────────────────────
export type NoteImageData = {
  src: string
  onDelete: (id: string) => void
  onResize: (id: string, box: { x: number; y: number; width: number; height: number }) => void
}
export type NoteImageNode = Node<NoteImageData, 'noteimage'>

export function NoteImageNodeComponent({ id, data, selected }: NodeProps<NoteImageNode>) {
  return (
    <>
      <NodeResizer
        nodeId={id}
        isVisible={!!selected}
        minWidth={40}
        minHeight={40}
        keepAspectRatio
        lineStyle={{ borderColor: 'rgba(76,127,224,0.6)' }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: '#4C7FE0', border: '1.5px solid rgba(255,255,255,0.85)' }}
        onResizeEnd={(_event, params) => data.onResize(id, params)}
      />
      <div
        className="group relative w-full h-full rounded-lg overflow-hidden"
        style={{ border: selected ? '1.5px solid rgba(76,127,224,0.75)' : '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.src}
          alt=""
          draggable={false}
          className="w-full h-full object-contain select-none"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        />
        <button
          className="nodrag nopan absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(15,19,25,0.75)', color: 'rgba(226,232,240,0.7)' }}
          onClick={() => data.onDelete(id)}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </>
  )
}

// ── 박스(단순 사각 도형) ──────────────────────────────────────────────────────
export type NoteBoxData = {
  color: CategoryColorKey
  onColorChange: (id: string, color: CategoryColorKey) => void
  onDelete: (id: string) => void
  onResize: (id: string, box: { x: number; y: number; width: number; height: number }) => void
}
export type NoteBoxNode = Node<NoteBoxData, 'notebox'>

export function NoteBoxNodeComponent({ id, data, selected }: NodeProps<NoteBoxNode>) {
  const palette = CATEGORY_PALETTE[data.color]
  return (
    <>
      <NodeResizer
        nodeId={id}
        isVisible={!!selected}
        minWidth={60}
        minHeight={60}
        color={palette.solid}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: palette.solid, border: '1.5px solid rgba(255,255,255,0.85)' }}
        lineStyle={{ borderColor: palette.border }}
        onResizeEnd={(_event, params) => data.onResize(id, params)}
      />
      <div className="group relative w-full h-full rounded-lg" style={{ background: palette.bg, border: `1.5px solid ${palette.border}` }}>
        <div
          className={`nodrag nopan absolute left-1 flex items-center gap-1 px-1 py-0.5 rounded-md transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{ top: -28, background: 'rgba(15,19,25,0.85)' }}
        >
          {COLOR_KEYS.map(key => (
            <button
              key={key}
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform hover:scale-125"
              style={{ background: CATEGORY_PALETTE[key].solid, outline: key === data.color ? `1.5px solid ${CATEGORY_PALETTE[key].text}` : 'none', outlineOffset: 1.5 }}
              onClick={() => data.onColorChange(id, key)}
            />
          ))}
          <button className="opacity-60 hover:opacity-100 hover:text-red-400 flex-shrink-0" onClick={() => data.onDelete(id)}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </>
  )
}
