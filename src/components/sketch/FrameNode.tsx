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

const TITLE_BAR_H = 36

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
      {/* Title bar — drag handle for the whole frame */}
      <div
        className="absolute left-0 right-0 flex items-center gap-1 px-2"
        style={{
          top: -TITLE_BAR_H,
          height: TITLE_BAR_H,
          background: 'rgba(22,27,36,0.85)',
          border: `1px solid ${borderColor}`,
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          backdropFilter: 'blur(4px)',
        }}
      >
        <button
          className="nodrag nopan flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => data.onCollapseToggle(id)}
          title={data.collapsed ? '펼치기' : '접기'}
        >
          {data.collapsed
            ? <ChevronRight size={12} style={{ color: '#9DBEF5' }} />
            : <ChevronDown size={12} style={{ color: '#9DBEF5' }} />}
        </button>

        {editing ? (
          <input
            ref={inputRef}
            className="nodrag nopan flex-1 bg-transparent focus:outline-none text-[11px] font-medium min-w-0"
            style={{ color: '#E2E8F0' }}
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
            className="nodrag nopan flex-1 text-[11px] font-medium truncate cursor-text select-none"
            style={{ color: 'rgba(226,232,240,0.65)' }}
            onClick={startEdit}
            title="클릭해서 제목 수정"
          >
            {data.title}
          </span>
        )}

        <button
          className="nodrag nopan flex-shrink-0 opacity-30 hover:opacity-80 hover:text-red-400 transition-all"
          style={{ color: 'rgba(226,232,240,0.7)' }}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => data.onDelete(id)}
          title="프레임 삭제"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}
