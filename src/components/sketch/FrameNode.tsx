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

// 프레임 위에 얹히는 이름표(칩)가 차지하는 공간. 칩은 내용 길이만큼만 넓어지는
// 고정 크기라, 프레임이 커지거나 작아져도 이름표 자체는 항상 같은 두께로 보인다
// (전체 폭을 채우는 바 방식은 프레임이 커질수록 상대적으로 얇아 보이는 문제가 있었음).
const TITLE_BAR_H = 30

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
      {/* 이름표 칩 — 프레임 테두리 위, 내용 길이만큼만 넓어짐. 프레임 몸통 자체가
          드래그 핸들이라 이 칩이 없어도 프레임 이동은 그대로 된다. */}
      <div
        className="absolute inline-flex items-center gap-1 px-2 py-1 rounded-full"
        style={{
          top: -TITLE_BAR_H,
          left: 10,
          background: 'rgba(22,27,36,0.9)',
          border: `1px solid ${borderColor}`,
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
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
            className="nodrag nopan bg-transparent focus:outline-none text-[11px] font-medium"
            style={{ color: '#E2E8F0', width: `${Math.max(4, draft.length + 1)}ch` }}
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
            className="nodrag nopan max-w-[220px] text-[11px] font-medium truncate cursor-text select-none"
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
