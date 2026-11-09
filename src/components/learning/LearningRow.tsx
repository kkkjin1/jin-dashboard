'use client'

import { FileText, Link2, PlayCircle, GraduationCap, Bookmark, type LucideIcon } from 'lucide-react'
import type { LearningResource } from '@/types'

type Status = 'todo' | 'doing' | 'done'

// 책 외 유형은 선 아이콘 + 유형별 단색 (영상=빨강, 아티클=파랑, 강의=초록, 기타=주황)
export const MEDIA_ICON: Record<string, LucideIcon> = { 영상: PlayCircle, 아티클: Link2, 강의: GraduationCap, 기타: Bookmark }
export const MEDIA_COLOR: Record<string, string> = { 영상: '#DC2626', 아티클: '#2563EB', 강의: '#16A34A', 기타: '#D97706' }
const STATUS_LABEL: Record<Status, string> = { todo: '보기전', doing: '보는중', done: '완료' }
const STATUS_STYLE: Record<Status, React.CSSProperties> = {
  todo:  { background: 'rgba(var(--ink-rgb),0.06)', color: 'rgba(var(--text-rgb),0.35)', border: '1px solid rgba(var(--ink-rgb),0.09)' },
  doing: { background: 'rgba(251,191,36,0.1)',   color: '#FBB924',                border: '1px solid rgba(251,191,36,0.25)' },
  done:  { background: 'rgba(34,197,94,0.1)',    color: '#4ADE80',                border: '1px solid rgba(34,197,94,0.2)' },
}

export function getStatus(tags: string[]): Status {
  if (tags.includes('_done'))  return 'done'
  if (tags.includes('_doing')) return 'doing'
  return 'todo'
}

// source가 URL이면 도메인만 (www. 제거). URL이 아니면 표시 안 함.
function domainOf(source: string | undefined): string {
  const s = (source ?? '').trim()
  if (!s) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    if (!u.hostname.includes('.')) return ''
    return u.hostname.replace(/^www\./, '')
  } catch { return '' }
}

interface Props {
  resource: LearningResource
  onNavigate: () => void
  onCycleStatus: () => void
  coverColor?: string  // 책일 때 미니 표지 색 (책장 분야색과 동일)
}

export default function LearningRow({ resource, onNavigate, onCycleStatus, coverColor = '#94A3B8' }: Props) {
  const status     = getStatus(resource.tags ?? [])
  const isBook     = resource.media_type === '책'
  const MediaIcon  = MEDIA_ICON[resource.media_type ?? ''] ?? Bookmark
  const mediaColor = MEDIA_COLOR[resource.media_type ?? ''] ?? MEDIA_COLOR['기타']
  const noteCount  = resource.notes?.length ?? 0
  // 보조 정보: 책=저자, 그 외=출처 도메인
  const sub        = isBook ? (resource.author ?? '').trim() : domainOf(resource.source)

  return (
    <div
      className="group flex items-center gap-2 cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.05)', padding: '9px 12px', height: 42, boxSizing: 'border-box' }}
      onClick={onNavigate}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* 미디어 — 책은 책장 표지를 줄인 세로 막대, 나머지는 이모지 */}
      <span className="flex-shrink-0 select-none flex items-center justify-center" style={{ width: 16 }}>
        {isBook ? (
          <span
            className="relative rounded-[2px] overflow-hidden"
            title="책"
            style={{
              width: 11, height: 15,
              background: `linear-gradient(160deg, ${coverColor}, ${coverColor}cc)`,
              opacity: status === 'todo' ? 0.55 : 1,
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }}
          >
            <span className="absolute left-0 top-0 bottom-0" style={{ width: 2, background: 'rgba(0,0,0,0.22)' }} />
          </span>
        ) : (
          <MediaIcon size={13} strokeWidth={2} style={{ color: mediaColor, opacity: 0.85 }} />
        )}
      </span>

      {/* 제목 */}
      <span
        className="text-[12.5px] font-medium truncate flex-1 min-w-0"
        style={{ color: 'rgba(var(--text-rgb),1)' }}
      >
        {resource.title || '제목 없음'}
        {sub && (
          <span className="font-normal text-[11px] ml-1.5" style={{ color: 'rgba(var(--text-rgb),0.38)' }}>
            · {sub}
          </span>
        )}
      </span>

      {/* 노트 수 */}
      {noteCount > 0 && (
        <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: 'rgba(var(--text-rgb),0.3)' }}>
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
