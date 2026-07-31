'use client'

import { useRef, useEffect, useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'

export type StatusFilter = '전체' | '보기전' | '보는중' | '완료'
export type MediaFilter  = '전체' | '책' | '영상' | '아티클' | '강의' | '기타'

const STATUS_OPTIONS: StatusFilter[] = ['전체', '보기전', '보는중', '완료']
const MEDIA_OPTIONS:  MediaFilter[]  = ['전체', '책', '영상', '아티클', '강의', '기타']
const MEDIA_EMOJI: Record<string, string> = { 전체: '🔍', 책: '📚', 영상: '🎬', 아티클: '📄', 강의: '🎓', 기타: '📌' }

interface Props {
  search: string
  setSearch: (v: string) => void
  statusFilter: StatusFilter
  setStatusFilter: (v: StatusFilter) => void
  mediaFilter: MediaFilter
  setMediaFilter: (v: MediaFilter) => void
  total: number
}

export default function LearningSearchToolbar({
  search, setSearch, statusFilter, setStatusFilter, mediaFilter, setMediaFilter, total,
}: Props) {
  const [mediaOpen, setMediaOpen] = useState(false)
  const mediaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (mediaRef.current && !mediaRef.current.contains(e.target as Node)) setMediaOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const dropdownBase: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
    background: 'rgba(19,22,32,0.98)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, backdropFilter: 'blur(20px)', boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
    minWidth: 110, padding: 4,
  }

  return (
    <div
      className="flex-shrink-0 pb-3"
      style={{ position: 'sticky', top: 0, zIndex: 40, background: '#0F1319' }}
    >
      <div className="flex items-center gap-2">
        {/* 검색 */}
        <div
          className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <Search size={13} style={{ color: 'rgba(226,232,240,0.35)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제목, 출처 검색..."
            className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-[rgba(226,232,240,0.25)]"
            style={{ color: '#E2E8F0' }}
          />
        </div>

        {/* 상태 필터 pills */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-[12px] px-3 py-1.5 rounded-full transition-all flex-shrink-0"
              style={
                statusFilter === s
                  ? { background: '#4C7FE0', color: '#fff', fontWeight: 500 }
                  : { background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {s}
            </button>
          ))}
        </div>

        {/* 미디어 필터 드롭다운 */}
        <div ref={mediaRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMediaOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors"
            style={{
              background: mediaFilter !== '전체' ? 'rgba(76,127,224,0.12)' : 'rgba(255,255,255,0.06)',
              border: mediaFilter !== '전체' ? '1px solid rgba(76,127,224,0.3)' : '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <span className="text-[14px]">{MEDIA_EMOJI[mediaFilter]}</span>
            <span className="text-[12px]" style={{ color: mediaFilter !== '전체' ? '#7EB3FF' : 'rgba(226,232,240,0.5)' }}>{mediaFilter}</span>
            <ChevronDown size={11} style={{ color: 'rgba(226,232,240,0.35)' }} />
          </button>
          {mediaOpen && (
            <div style={dropdownBase}>
              {MEDIA_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => { setMediaFilter(m); setMediaOpen(false) }}
                  className="w-full text-left text-[12px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
                  style={{ color: mediaFilter === m ? '#E2E8F0' : 'rgba(226,232,240,0.5)', background: mediaFilter === m ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                  onMouseEnter={e => { if (mediaFilter !== m) (e.currentTarget.style.background = 'rgba(255,255,255,0.05)') }}
                  onMouseLeave={e => { if (mediaFilter !== m) (e.currentTarget.style.background = 'transparent') }}
                >
                  <span>{MEDIA_EMOJI[m]}</span>{m}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.35)' }}>총 {total}개</span>
      </div>
    </div>
  )
}
