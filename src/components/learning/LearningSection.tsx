'use client'

import { useRef, useState } from 'react'
import { Users, TrendingUp, Compass, Award, Database, Building2, ClipboardList, FolderOpen, Tag, type LucideIcon } from 'lucide-react'
import type { LearningResource } from '@/types'
import LearningRow, { getStatus } from './LearningRow'

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

export function tagIcon(tag: string): LucideIcon {
  return TAG_ICONS[tag] ?? Tag
}

// 범주 카드 안 좌우 2단: 왼쪽=도서, 오른쪽=링크·기타(아티클→영상→강의→기타 순, 같은 유형 안은 최신순)
const OTHER_ORDER = ['아티클', '영상', '강의', '기타']
function otherRank(r: LearningResource): number {
  const i = OTHER_ORDER.indexOf(r.media_type ?? '')
  return i < 0 ? OTHER_ORDER.length - 1 : i
}

const ROW_H = 42
const HEAD_H = 54  // 범주 제목 행 높이
const VISIBLE_ROWS = 6

interface Props {
  tag: string
  allTags: string[]
  resources: LearningResource[]
  onNavigate: (id: string) => void
  onCycleStatus: (r: LearningResource) => void
  onRenameTag: (oldTag: string, newTag: string) => void
  coverColor?: string  // 이 범주의 책 미니 표지 색 (책장 분야색)
}

export default function LearningSection({ tag, resources, onNavigate, onCycleStatus, onRenameTag, coverColor }: Props) {
  // 범주색 = 책장 분야색 (미니 표지와 같은 색)
  const color = coverColor ?? '#94A3B8'
  const doneCount = resources.filter(r => getStatus(r.tags ?? []) === 'done').length
  const Icon = tagIcon(tag)
  const editable = tag !== '미분류'
  const books  = resources.filter(r => r.media_type === '책')
  const others = resources.filter(r => r.media_type !== '책')
    .map((r, i) => ({ r, i })).sort((x, y) => otherRank(x.r) - otherRank(y.r) || x.i - y.i).map(x => x.r)

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
      className="relative rounded-2xl overflow-hidden flex flex-col"
      style={{
        height: HEAD_H + ROW_H * VISIBLE_ROWS,
        // 유리 박스(무채색): 반투명 흰 판 + 흐림 + 윗변 하이라이트 + 옅은 그림자. 범주색 없음, 아주 연한 실선
        background: 'linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 100%)',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
        border: '1px solid rgba(var(--ink-rgb),0.07)',  // 아주 연한 실선 — 유리 가장자리
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 2px rgba(var(--ink-rgb),0.04), 0 10px 26px -14px rgba(var(--ink-rgb),0.18)',
      }}
    >
      {/* 카드 헤더 — 범주명 클릭해서 바로 이름 변경 (미분류 제외) */}
      <div
        className="relative flex items-center gap-2.5 px-3.5 flex-shrink-0"
        style={{ height: HEAD_H, borderBottom: '1px solid rgba(var(--ink-rgb),0.06)' }}
      >
        {/* 아이콘 배지 */}
        <span
          className="flex items-center justify-center flex-shrink-0 rounded-lg"
          style={{ width: 26, height: 26, background: `${color}1F` }}
        >
          <Icon size={14} style={{ color }} />
        </span>
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
            className="text-[14px] font-bold flex-1 min-w-0 bg-transparent focus:outline-none"
            style={{ color: 'rgba(var(--text-rgb),1)' }}
          />
        ) : (
          <span
            className="text-[14px] font-bold flex-1 truncate"
            style={{ color: 'rgba(var(--text-rgb),1)', cursor: editable ? 'text' : 'default' }}
            onClick={startEdit}
            title={editable ? '클릭해서 이름 변경' : undefined}
          >
            {tag}
          </span>
        )}
        {/* 단 개수 — 단 제목 행 대신 범주 행에서 표시 */}
        {resources.length > 0 && (
          <span className="text-[10.5px] tabular-nums flex-shrink-0" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>
            도서 {books.length} · 링크 {others.length}
          </span>
        )}
        {/* 완료 진행: 완료 n/전체 + 짧은 막대 */}
        {resources.length > 0 ? (
          <span className="flex items-center gap-1.5 flex-shrink-0" title={`완료 ${doneCount} / 전체 ${resources.length}`}>
            <span className="text-[10.5px] tabular-nums" style={{ color: 'rgba(var(--text-rgb),0.45)' }}>
              완료 <b style={{ color: doneCount ? color : undefined, fontWeight: 600 }}>{doneCount}</b>/{resources.length}
            </span>
            <span className="rounded-full overflow-hidden" style={{ width: 40, height: 4, background: 'rgba(var(--ink-rgb),0.08)' }}>
              <span className="block h-full rounded-full" style={{ width: `${(doneCount / resources.length) * 100}%`, background: color }} />
            </span>
          </span>
        ) : (
          <span className="text-[10.5px] flex-shrink-0" style={{ color: 'rgba(var(--text-rgb),0.3)' }}>0</span>
        )}
      </div>

      {/* 리소스 목록 — 6개 높이만큼만 보이고 나머지는 스크롤 (스크롤바는 투명) */}
      {resources.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11.5px]" style={{ color: 'rgba(var(--text-rgb),0.25)' }}>자료 없음</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-2">
          {([['도서', books], ['링크·기타', others]] as const).map(([label, list], ci) => (
            <div
              key={label}
              className="relative min-w-0 min-h-0 flex flex-col"
              style={ci === 0 ? { borderRight: '1px solid rgba(var(--ink-rgb),0.06)' } : undefined}
            >
              <div className="relative flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                {list.map(r => (
                  <LearningRow
                    key={r.id}
                    resource={r}
                    onNavigate={() => onNavigate(r.id)}
                    onCycleStatus={() => onCycleStatus(r)}
                    coverColor={coverColor}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
