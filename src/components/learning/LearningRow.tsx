'use client'

import { FileText } from 'lucide-react'
import type { LearningResource } from '@/types'

type Status = 'todo' | 'doing' | 'done'

const MEDIA_EMOJI: Record<string, string> = { 책: '📚', 영상: '🎬', 아티클: '📰', 강의: '🎓', 기타: '📌' }
const STATUS_LABEL: Record<Status, string> = { todo: '보기전', doing: '보는중', done: '완료' }
const STATUS_STYLE: Record<Status, React.CSSProperties> = {
  todo:  { background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.35)', border: '1px solid rgba(255,255,255,0.09)' },
  doing: { background: 'rgba(251,191,36,0.1)',   color: '#FBB924',                border: '1px solid rgba(251,191,36,0.25)' },
  done:  { background: 'rgba(34,197,94,0.1)',    color: '#4ADE80',                border: '1px solid rgba(34,197,94,0.2)' },
}

export function getStatus(tags: string[]): Status {
  if (tags.includes('_done'))  return 'done'
  if (tags.includes('_doing')) return 'doing'
  return 'todo'
}

interface Props {
  resource: LearningResource
  onNavigate: () => void
  onCycleStatus: () => void
}

export default function LearningRow({ resource, onNavigate, onCycleStatus }: Props) {
  const status     = getStatus(resource.tags ?? [])
  const mediaEmoji = MEDIA_EMOJI[resource.media_type ?? ''] ?? '📌'
  const noteCount  = resource.notes?.length ?? 0

  return (
    <div
      className="group flex items-center gap-2 cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '9px 12px', height: 42, boxSizing: 'border-box' }}
      onClick={onNavigate}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* 미디어 */}
      <span className="text-[13px] flex-shrink-0 select-none">{mediaEmoji}</span>

      {/* 제목 */}
      <span
        className="text-[12.5px] font-medium truncate flex-1 min-w-0"
        style={{ color: '#E2E8F0' }}
      >
        {resource.title || '제목 없음'}
      </span>

      {/* 노트 수 */}
      {noteCount > 0 && (
        <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: 'rgba(226,232,240,0.3)' }}>
          <FileText size={10} />
          <span className="text-[10px]">{noteCount}</span>
        </span>
      )}

      {/* 상태 */}
      <button
        onClick={e => { e.stopPropagation(); onCycleStatus() }}
        className="text-[9.5px] px-1.5 py-0.5 rounded-full transition-all flex-shrink-0"
        style={STATUS_STYLE[status]}
      >
        {STATUS_LABEL[status]}
      </button>
    </div>
  )
}
