'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { LearningResource } from '@/types'
import LearningRow from './LearningRow'
import type { ColWidths } from './colWidths'

const TAG_COLORS = [
  '#4C7FE0', '#22C55E', '#F59E0B', '#A855F7',
  '#EF4444', '#06B6D4', '#EC4899', '#84CC16',
]

function tagColor(tag: string, allTags: string[]): string {
  const idx = allTags.indexOf(tag)
  return TAG_COLORS[idx % TAG_COLORS.length] ?? '#4C7FE0'
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group/resize"
      style={{ width: 10, alignSelf: 'stretch', cursor: 'col-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        style={{ width: 1, height: 14, borderRadius: 1, background: 'rgba(255,255,255,0.2)', transition: 'background 0.15s' }}
        className="group-hover/resize:!bg-[rgba(255,255,255,0.55)]"
      />
    </div>
  )
}

interface Props {
  tag: string
  allTags: string[]
  resources: LearningResource[]
  colWidths: ColWidths
  onResizeCol: (col: keyof ColWidths, e: React.MouseEvent) => void
  onNavigate: (id: string) => void
  onCycleStatus: (r: LearningResource) => void
}

const INIT_SHOW = 5

export default function LearningSection({ tag, allTags, resources, colWidths, onResizeCol, onNavigate, onCycleStatus }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [showAll,   setShowAll]   = useState(false)

  const dot     = tagColor(tag, allTags)
  const visible = showAll ? resources : resources.slice(0, INIT_SHOW)
  const hasMore = resources.length > INIT_SHOW && !showAll

  if (resources.length === 0) return null

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2.5 px-4 py-3.5 cursor-pointer select-none"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => setCollapsed(v => !v)}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
        <span className="text-[14px] font-semibold flex-1" style={{ color: '#E2E8F0' }}>{tag}</span>
        <span
          className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {resources.length}개
        </span>
        <span style={{ color: 'rgba(226,232,240,0.3)' }}>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </span>
      </div>

      {!collapsed && (
        <>
          {/* 변수행 (컬럼 헤더 + 리사이즈 핸들) */}
          <div
            className="flex items-center select-none px-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '7px 16px' }}
          >
            {/* 미디어 */}
            <span style={{ width: 24, flexShrink: 0, marginRight: 8 }} />

            {/* 제목 */}
            <span
              className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
              style={{ width: colWidths.title, color: 'rgba(226,232,240,0.3)', overflow: 'hidden' }}
            >
              제목
            </span>
            <ResizeHandle onMouseDown={e => { e.stopPropagation(); onResizeCol('title', e) }} />

            {/* 출처 */}
            <span
              className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
              style={{ width: colWidths.source, color: 'rgba(226,232,240,0.3)', overflow: 'hidden' }}
            >
              출처
            </span>
            <ResizeHandle onMouseDown={e => { e.stopPropagation(); onResizeCol('source', e) }} />

            {/* 상태 */}
            <span
              className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 text-center"
              style={{ width: colWidths.status, color: 'rgba(226,232,240,0.3)' }}
            >
              상태
            </span>
            <ResizeHandle onMouseDown={e => { e.stopPropagation(); onResizeCol('status', e) }} />

            {/* 노트 */}
            <span
              className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 text-right"
              style={{ width: 44, color: 'rgba(226,232,240,0.3)' }}
            >
              노트
            </span>
            <span style={{ width: 20, flexShrink: 0 }} />
          </div>

          {/* 리소스 목록 */}
          <div>
            {visible.map(r => (
              <LearningRow
                key={r.id}
                resource={r}
                colWidths={colWidths}
                onNavigate={() => onNavigate(r.id)}
                onCycleStatus={() => onCycleStatus(r)}
              />
            ))}

            {/* 더보기 / 접기 */}
            {resources.length > INIT_SHOW && (
              <button
                onClick={() => setShowAll(v => !v)}
                className="w-full py-2.5 text-[12px] transition-colors text-center"
                style={{ color: 'rgba(226,232,240,0.35)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.6)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.35)')}
              >
                {hasMore ? `${resources.length - INIT_SHOW}개 더보기 ↓` : '접기 ↑'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
