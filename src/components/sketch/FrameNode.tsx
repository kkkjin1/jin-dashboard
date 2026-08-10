'use client'

import { useState, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { ChevronRight, ChevronDown, Trash2 } from 'lucide-react'

export type FrameData = {
  title: string
  collapsed: boolean
  frameWidth: number
  frameHeight: number
  onTitleChange: (id: string, title: string) => void
  onCollapseToggle: (id: string) => void
  onDelete: (id: string) => void
}

export type FrameNodeType = Node<FrameData, 'frame'>

export function FrameNodeComponent({ id, data, selected }: NodeProps<FrameNodeType>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.title)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setDraft(data.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    setEditing(false)
    const next = draft.trim() || '제목 없는 프레임'
    if (next !== data.title) data.onTitleChange(id, next)
  }

  const borderColor = selected
    ? 'rgba(76,127,224,0.75)'
    : 'rgba(255,255,255,0.18)'

  return (
    <div
      className="relative w-full h-full"
      style={{
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.015)',
        boxSizing: 'border-box',
      }}
    >
      {/* 이름표 — 프레임 안쪽 좌상단, 평소엔 흐리게, 마우스 올리면 진하게.
          프레임 몸통 자체가 드래그 핸들이라 이 라벨이 커져도 이동에는 영향 없음. */}
      <div
        className={`absolute inline-flex items-center gap-3 transition-opacity duration-150 ${
          editing ? 'opacity-100' : 'opacity-30 hover:opacity-100'
        }`}
        style={{ top: 18, left: 20, right: 20, maxWidth: data.frameWidth - 40 }}
      >
        <button
          className="nodrag nopan flex-shrink-0 transition-opacity hover:opacity-70"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => data.onCollapseToggle(id)}
          title={data.collapsed ? '펼치기' : '접기'}
        >
          {data.collapsed
            ? <ChevronRight size={22} style={{ color: '#9DBEF5' }} />
            : <ChevronDown size={22} style={{ color: '#9DBEF5' }} />}
        </button>

        {editing ? (
          <input
            ref={inputRef}
            className="nodrag nopan bg-transparent focus:outline-none font-semibold"
            style={{ color: '#E2E8F0', fontSize: 56, lineHeight: 1.1, width: `${Math.max(4, draft.length + 1)}ch` }}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setDraft(data.title); setEditing(false) }
            }}
          />
        ) : (
          <span
            className="nodrag nopan truncate cursor-text select-none font-semibold"
            style={{ color: '#E2E8F0', fontSize: 56, lineHeight: 1.1 }}
            onClick={startEdit}
            title="클릭해서 제목 수정"
          >
            {data.title}
          </span>
        )}

        <button
          className="nodrag nopan flex-shrink-0 transition-opacity hover:opacity-70 hover:text-red-400"
          style={{ color: '#E2E8F0' }}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => data.onDelete(id)}
          title="프레임 삭제"
        >
          <Trash2 size={22} />
        </button>
      </div>
    </div>
  )
}
