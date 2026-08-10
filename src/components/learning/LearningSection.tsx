'use client'

import { useRef, useState } from 'react'
import { Users, TrendingUp, Compass, Award, Database, Building2, ClipboardList, FolderOpen, Tag, type LucideIcon } from 'lucide-react'
import type { LearningResource } from '@/types'
import LearningRow from './LearningRow'

const TAG_COLORS = [
  '#4C7FE0', '#22C55E', '#F59E0B', '#A855F7',
  '#EF4444', '#06B6D4', '#EC4899', '#84CC16',
]

function tagColor(tag: string, allTags: string[]): string {
  const idx = allTags.indexOf(tag)
  return TAG_COLORS[idx % TAG_COLORS.length] ?? '#4C7FE0'
}

// 범주명과 어울리는 아이콘 매핑. 매칭 없는 커스텀 범주는 기본 Tag 아이콘.
const TAG_ICONS: Record<string, LucideIcon> = {
  'HR': Users,
  '경제': TrendingUp,
  '리더십': Compass,
  '평가보상': Award,
  '데이터': Database,
  '조직문화': Building2,
  '기획': ClipboardList,
  '미분류': FolderOpen,
}

function tagIcon(tag: string): LucideIcon {
  return TAG_ICONS[tag] ?? Tag
}

const ROW_H = 42
const VISIBLE_ROWS = 6

interface Props {
  tag: string
  allTags: string[]
  resources: LearningResource[]
  onNavigate: (id: string) => void
  onCycleStatus: (r: LearningResource) => void
  onRenameTag: (oldTag: string, newTag: string) => void
}

export default function LearningSection({ tag, allTags, resources, onNavigate, onCycleStatus, onRenameTag }: Props) {
  const dot = tagColor(tag, allTags)
  const Icon = tagIcon(tag)
  const editable = tag !== '미분류'

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(tag)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(e: React.MouseEvent) {
    if (!editable) return
    e.stopPropagation()
    setEditValue(tag)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    setEditing(false)
    const next = editValue.trim()
    if (next && next !== tag) onRenameTag(tag, next)
  }

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', height: 44 + ROW_H * VISIBLE_ROWS }}
    >
      {/* 카드 헤더 — 범주명 클릭해서 바로 이름 변경 (미분류 제외) */}
      <div
        className="flex items-center gap-2 px-3.5 flex-shrink-0"
        style={{ height: 44, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Icon size={14} className="flex-shrink-0" style={{ color: dot }} />
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit() }
              if (e.key === 'Escape') setEditing(false)
            }}
            className="text-[13px] font-semibold flex-1 min-w-0 bg-transparent focus:outline-none"
            style={{ color: '#E2E8F0' }}
          />
        ) : (
          <span
            className="text-[13px] font-semibold flex-1 truncate"
            style={{ color: '#E2E8F0', cursor: editable ? 'text' : 'default' }}
            onClick={startEdit}
            title={editable ? '클릭해서 이름 변경' : undefined}
          >
            {tag}
          </span>
        )}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {resources.length}
        </span>
      </div>

      {/* 리소스 목록 — 6개 높이만큼만 보이고 나머지는 스크롤 (스크롤바는 투명) */}
      {resources.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11.5px]" style={{ color: 'rgba(226,232,240,0.25)' }}>자료 없음</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          {resources.map(r => (
            <LearningRow
              key={r.id}
              resource={r}
              onNavigate={() => onNavigate(r.id)}
              onCycleStatus={() => onCycleStatus(r)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
