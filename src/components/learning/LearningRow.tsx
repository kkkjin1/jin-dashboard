'use client'

import { ChevronRight, FileText } from 'lucide-react'
import type { LearningResource } from '@/types'

type Status = 'todo' | 'doing' | 'done'

const MEDIA_EMOJI: Record<string, string> = { 책: '📚', 영상: '🎬', 아티클: '📄', 강의: '🎓', 기타: '📌' }
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
  const status    = getStatus(resource.tags ?? [])
  const mediaEmoji = MEDIA_EMOJI[resource.media_type ?? ''] ?? '📌'
  const noteCount = resource.notes?.length ?? 0
  const source    = resource.source ?? ''
  const sourceDisplay = source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]

  return (
    <div
      className="group flex items-center gap-3 py-3 cursor-pointer transition-colors -mx-4 px-4"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      onClick={onNavigate}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* 미디어 아이콘 */}
      <span className="text-[15px] flex-shrink-0 w-6 text-center select-none">{mediaEmoji}</span>

      {/* 제목 */}
      <span className="flex-1 min-w-0 text-[13px] font-medium truncate" style={{ color: '#E2E8F0' }}>
        {resource.title || '제목 없음'}
      </span>

      {/* 출처 */}
      {sourceDisplay && (
        <a
          href={source.startsWith('http') ? source : `https://${source}`}
          target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-[11px] truncate max-w-[140px] flex-shrink-0 transition-colors hover:underline"
          style={{ color: 'rgba(226,232,240,0.3)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#7EB3FF')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(226,232,240,0.3)')}
        >
          {sourceDisplay}
        </a>
      )}

      {/* 상태 뱃지 */}
      <button
        onClick={e => { e.stopPropagation(); onCycleStatus() }}
        className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 transition-all"
        style={STATUS_STYLE[status]}
      >
        {STATUS_LABEL[status]}
      </button>

      {/* 노트 수 */}
      {noteCount > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <FileText size={11} style={{ color: 'rgba(226,232,240,0.3)' }} />
          <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.3)' }}>{noteCount}</span>
        </div>
      )}

      {/* 화살표 */}
      <div className="w-5 flex justify-end flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight size={13} style={{ color: 'rgba(226,232,240,0.3)' }} />
      </div>
    </div>
  )
}
