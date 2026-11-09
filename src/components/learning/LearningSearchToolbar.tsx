'use client'

import { useRef, useEffect, useState } from 'react'
import { Search, ChevronDown, Plus, X, Tags, BookOpen, LayoutGrid, type LucideIcon } from 'lucide-react'
import { tagIcon } from './LearningSection'
import { MEDIA_ICON, MEDIA_COLOR } from './LearningRow'
import { LOCKED_MEDIA } from '@/lib/learningMedia'

export type StatusFilter = '전체' | '보기전' | '보는중' | '완료'
// 매체는 사용자 설정 목록(추가·이름변경·삭제 가능, lib/learningMedia) — '전체' 또는 그 목록 중 하나
export type MediaFilter  = string

const STATUS_OPTIONS: StatusFilter[] = ['전체', '보기전', '보는중', '완료']
const CTRL_H = 48  // 툴바 컨트롤 높이 (기존 30의 1.6배)
// 매체 아이콘·색 — 카드 안 자료 아이콘과 같은 체계 (책=주황 펼친 책)
const M_ICON: Record<string, LucideIcon> = { 전체: LayoutGrid, 책: BookOpen, ...MEDIA_ICON }
const M_COLOR: Record<string, string> = { 전체: '#64748B', 책: '#EA580C', ...MEDIA_COLOR }
// 새로 만든 매체는 '기타'와 같은 아이콘·색 (아이콘은 표에서 바로 고른다 — 함수로 고르면 '렌더 중 컴포넌트 생성' 경고)
const OTHER_ICON = MEDIA_ICON['기타']
const mColor = (m: string) => M_COLOR[m] ?? MEDIA_COLOR['기타']
// 상태별 색
const STATUS_COLOR: Record<StatusFilter, string> = { 전체: '#2563EB', 보기전: '#64748B', 보는중: '#D97706', 완료: '#16A34A' }

interface Props {
  search: string
  setSearch: (v: string) => void
  statusFilter: StatusFilter
  setStatusFilter: (v: StatusFilter) => void
  mediaFilter: MediaFilter
  setMediaFilter: (v: MediaFilter) => void
  mediaTypes: string[]
  onAddMedia: (name: string) => void
  onRenameMedia: (oldName: string, newName: string) => void
  onDeleteMedia: (name: string) => void
  onReorderMedia: (next: string[]) => void
  customTags: string[]
  setCustomTags: (next: string[]) => void
  onRenameTag: (oldTag: string, newTag: string) => void
  onDeleteTag: (tag: string) => void
  total: number
  tagColors?: Record<string, string>  // 범주색 (카드 아이콘 배지와 같은 색)
  right?: React.ReactNode  // 오른쪽 끝 (범주별/책장 전환·새 자료 버튼)
}

export default function LearningSearchToolbar({
  search, setSearch, statusFilter, setStatusFilter, mediaFilter, setMediaFilter,
  mediaTypes, onAddMedia, onRenameMedia, onDeleteMedia, onReorderMedia,
  customTags, setCustomTags, onRenameTag, onDeleteTag,
  total, tagColors = {}, right,
}: Props) {
  const [mediaOpen, setMediaOpen] = useState(false)
  const mediaRef = useRef<HTMLDivElement>(null)
  const [tagsOpen, setTagsOpen] = useState(false)   // 범주 관리 팝오버
  const tagsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (mediaRef.current && !mediaRef.current.contains(e.target as Node)) setMediaOpen(false)
      if (tagsRef.current && !tagsRef.current.contains(e.target as Node)) setTagsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ── 범주 관리 (추가/이름변경/삭제/드래그 순서변경) ─────────────────────
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editValue,  setEditValue]  = useState('')
  const [addingTag,  setAddingTag]  = useState(false)
  const [addValue,   setAddValue]   = useState('')
  const [hoveredTag, setHoveredTag] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  function onTagDragStart(index: number) { dragIndexRef.current = index }
  function onTagDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    const next = [...customTags]
    const [item] = next.splice(from, 1)
    next.splice(index, 0, item)
    dragIndexRef.current = index
    setCustomTags(next)
  }
  function onTagDrop(e: React.DragEvent) { e.preventDefault(); dragIndexRef.current = null }

  function startEditTag(tag: string) { setEditingTag(tag); setEditValue(tag) }
  function commitEditTag() {
    const name = editValue.trim()
    if (!name || name === editingTag) { setEditingTag(null); return }
    // 목록 이름만 바꾸면 자료 쪽 태그가 옛 이름으로 남아 미분류로 빠짐 → 상위에서 자료 태그까지 같이 바꾼다
    if (editingTag) onRenameTag(editingTag, name)
    setEditingTag(null)
  }
  function deleteTag(tag: string) {
    onDeleteTag(tag)
  }
  function commitAddTag() {
    const name = addValue.trim()
    if (name && !customTags.includes(name)) setCustomTags([...customTags, name])
    setAddingTag(false); setAddValue('')
  }

  const dropdownBase: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
    background: 'var(--dropdown-panel-bg)', border: '1px solid rgba(var(--ink-rgb),0.1)',
    borderRadius: 12, backdropFilter: 'blur(20px)', boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
    minWidth: 160, padding: 4,
  }

  const MediaI = M_ICON[mediaFilter] ?? OTHER_ICON
  const mediaC = mColor(mediaFilter)
  const MEDIA_OPTIONS: MediaFilter[] = ['전체', ...mediaTypes]

  // ── 매체 편집(드롭다운 안): 이름변경·삭제·끌어서 순서·추가. '책'은 책장 보기가 써서 잠금 ──
  const [mediaEdit, setMediaEdit] = useState(false)
  const [mEditing, setMEditing] = useState<string | null>(null)
  const [mEditValue, setMEditValue] = useState('')
  const [mAdding, setMAdding] = useState(false)
  const [mAddValue, setMAddValue] = useState('')
  const mDragIndex = useRef<number | null>(null)
  function commitMediaRename() {
    const name = mEditValue.trim()
    if (mEditing && name && name !== mEditing) onRenameMedia(mEditing, name)
    setMEditing(null)
  }
  function commitMediaAdd() {
    const name = mAddValue.trim()
    if (name) onAddMedia(name)
    setMAdding(false); setMAddValue('')
  }
  function onMediaDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = mDragIndex.current
    if (from === null || from === index) return
    const next = [...mediaTypes]
    const [item] = next.splice(from, 1)
    next.splice(index, 0, item)
    mDragIndex.current = index
    onReorderMedia(next)
  }
  const mediaOn = mediaFilter !== '전체'

  const ctrlBox: React.CSSProperties = { height: CTRL_H, borderRadius: 12, background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid rgba(var(--ink-rgb),0.08)' }

  // 한 줄 툴바: [검색] [상태 세그먼트] [매체 ▾] [범주 관리 ▾] ······ 총 n개
  return (
    <div
      className="flex-shrink-0 pb-3"
      style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--bg-page)' }}
    >
      <div className="flex items-center gap-2">
        {/* 검색 */}
        <div className="flex items-center gap-2 px-3.5" style={{ ...ctrlBox, width: 280 }}>
          <Search size={15} style={{ color: '#2563EB', opacity: 0.75, flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제목, 출처 검색"
            className="flex-1 min-w-0 bg-transparent text-[13px] focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.3)]"
            style={{ color: 'rgba(var(--text-rgb),1)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'rgba(var(--text-rgb),0.35)' }}><X size={12} /></button>
          )}
        </div>

        {/* 상태 — 세그먼트 컨트롤, 칸마다 상태색 점 + 선택 칸은 상태색 */}
        <div className="flex items-center p-1 flex-shrink-0" style={ctrlBox}>
          {STATUS_OPTIONS.map(st => {
            const c = STATUS_COLOR[st]
            const on = statusFilter === st
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className="flex items-center gap-1.5 text-[13px] px-3 h-full rounded-lg transition-all"
                style={on
                  ? { background: 'var(--surface-primary)', color: c, fontWeight: 600, boxShadow: `0 1px 3px rgba(var(--ink-rgb),0.12), inset 0 0 0 1px ${c}33` }
                  : { color: 'rgba(var(--text-rgb),0.5)' }}
              >
                {st !== '전체' && <span className="rounded-full" style={{ width: 6, height: 6, background: c, opacity: on ? 1 : 0.6 }} />}
                {st}
              </button>
            )
          })}
        </div>

        {/* 매체 필터 드롭다운 — 가로 넓게, 아이콘 색 */}
        <div ref={mediaRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMediaOpen(v => !v)}
            className="flex items-center gap-2 px-3.5 transition-colors"
            style={{ ...ctrlBox, width: 160, ...(mediaOn ? { background: `${mediaC}12`, border: `1px solid ${mediaC}40` } : {}) }}
          >
            <MediaI size={15} style={{ color: mediaC }} />
            <span className="text-[13px] flex-1 text-left" style={{ color: mediaOn ? mediaC : 'rgba(var(--text-rgb),0.6)', fontWeight: mediaOn ? 600 : 400 }}>
              {mediaOn ? mediaFilter : '매체 전체'}
            </span>
            <ChevronDown size={13} style={{ color: 'rgba(var(--text-rgb),0.35)' }} />
          </button>
          {mediaOpen && (
            <div style={{ ...dropdownBase, left: 0, right: 'auto', width: 220 }}>
              {MEDIA_OPTIONS.map(m => {
                const I = M_ICON[m] ?? OTHER_ICON; const c = mColor(m); const on = mediaFilter === m
                const idx = mediaTypes.indexOf(m)
                const locked = m === '전체' || m === LOCKED_MEDIA
                if (mediaEdit && m !== '전체') {
                  // 편집 모드: ⠿ 끌어서 순서 · 이름 클릭해서 변경 · ✕ 삭제 ('책'은 잠금)
                  return (
                    <div key={m}
                      draggable={mEditing !== m}
                      onDragStart={() => { mDragIndex.current = idx }}
                      onDragOver={e => onMediaDragOver(e, idx)}
                      onDrop={e => { e.preventDefault(); mDragIndex.current = null }}
                      className="group/m flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ cursor: mEditing === m ? 'default' : 'grab' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span className="text-[12px] select-none" style={{ color: 'rgba(var(--text-rgb),0.3)' }}>⠿</span>
                      <I size={14} style={{ color: c, flexShrink: 0 }} />
                      {mEditing === m ? (
                        <input autoFocus value={mEditValue} onChange={e => setMEditValue(e.target.value)} onBlur={commitMediaRename}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitMediaRename(); if (e.key === 'Escape') setMEditing(null) }}
                          className="flex-1 min-w-0 text-[13px] px-1.5 py-0.5 rounded focus:outline-none"
                          style={{ background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.4)', color: 'rgba(var(--text-rgb),1)' }} />
                      ) : (
                        <button onClick={() => { if (!locked) { setMEditing(m); setMEditValue(m) } }}
                          title={locked ? '책장 보기에 쓰여서 바꿀 수 없어요' : '눌러서 이름 바꾸기'}
                          className="flex-1 min-w-0 text-left text-[13px] truncate" style={{ color: 'rgba(var(--text-rgb),0.8)', cursor: locked ? 'default' : 'text' }}>
                          {m}{locked && <span className="ml-1 text-[10.5px]" style={{ color: 'rgba(var(--text-rgb),0.35)' }}>고정</span>}
                        </button>
                      )}
                      {!locked && mEditing !== m && (
                        <button onClick={() => onDeleteMedia(m)} title="매체 삭제(자료는 지우지 않음)"
                          className="opacity-0 group-hover/m:opacity-100 flex items-center justify-center rounded-full flex-shrink-0"
                          style={{ width: 16, height: 16, background: 'rgba(220,60,60,0.85)', color: '#fff' }}><X size={9} /></button>
                      )}
                    </div>
                  )
                }
                return (
                  <button
                    key={m}
                    onClick={() => { setMediaFilter(m); setMediaOpen(false) }}
                    className="w-full text-left text-[13px] px-3 py-2 rounded-lg transition-colors flex items-center gap-2.5"
                    style={{ color: on ? c : 'rgba(var(--text-rgb),0.7)', fontWeight: on ? 600 : 400, background: on ? `${c}14` : 'transparent' }}
                    onMouseEnter={e => { if (!on) (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.05)') }}
                    onMouseLeave={e => { if (!on) (e.currentTarget.style.background = 'transparent') }}
                  >
                    <I size={15} style={{ color: c }} />{m === '전체' ? '매체 전체' : m}
                  </button>
                )
              })}
              {/* 매체 편집 줄 */}
              <div className="mt-1 pt-1.5 px-1 flex flex-col gap-1" style={{ borderTop: '1px solid rgba(var(--ink-rgb),0.08)' }}>
                {mediaEdit && (mAdding ? (
                  <input autoFocus value={mAddValue} onChange={e => setMAddValue(e.target.value)} onBlur={commitMediaAdd} placeholder="새 매체 이름"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitMediaAdd(); if (e.key === 'Escape') { setMAdding(false); setMAddValue('') } }}
                    className="text-[12.5px] px-2 py-1 rounded-lg focus:outline-none"
                    style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.15)', color: 'rgba(var(--text-rgb),1)' }} />
                ) : (
                  <button onClick={() => setMAdding(true)} className="flex items-center gap-1.5 text-left text-[12.5px] px-2 py-1 rounded-lg" style={{ color: 'rgba(var(--text-rgb),0.55)' }}>
                    <Plus size={12} /> 매체 추가
                  </button>
                ))}
                <button onClick={() => { setMediaEdit(v => !v); setMEditing(null); setMAdding(false) }}
                  className="text-left text-[12px] px-2 py-1 rounded-lg" style={{ color: mediaEdit ? 'var(--accent-soft)' : 'rgba(var(--text-rgb),0.45)', fontWeight: mediaEdit ? 600 : 400 }}>
                  {mediaEdit ? '✓ 편집 끝내기' : '✎ 매체 편집'}
                </button>
                {mediaEdit && <p className="text-[10.5px] px-2 pb-0.5" style={{ color: 'rgba(var(--text-rgb),0.35)' }}>끌어서 순서 · 이름 눌러 변경 · × 삭제(자료는 남음)</p>}
              </div>
            </div>
          )}
        </div>

        {/* 범주 관리 — 예전 2번째 줄 pill들을 팝오버로 */}
        <div ref={tagsRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setTagsOpen(v => !v)}
            className="flex items-center gap-2 px-3.5 transition-colors"
            style={{ ...ctrlBox, ...(tagsOpen ? { background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.3)' } : {}) }}
          >
            <Tags size={15} style={{ color: '#0D9488' }} />
            <span className="text-[13px]" style={{ color: 'rgba(var(--text-rgb),0.6)' }}>범주 <b style={{ color: '#0D9488', fontWeight: 600 }}>{customTags.length}</b></span>
            <ChevronDown size={13} style={{ color: 'rgba(var(--text-rgb),0.35)' }} />
          </button>
          {tagsOpen && (
            <div style={{ ...dropdownBase, left: 0, right: 'auto', width: 320, padding: 10 }}>
              <div className="flex items-center gap-1.5 flex-wrap">
              {customTags.map((tag, index) => (
                <div
                  key={tag}
                  draggable={editingTag !== tag}
                  onDragStart={() => onTagDragStart(index)}
                  onDragOver={e => onTagDragOver(e, index)}
                  onDrop={onTagDrop}
                  className="relative flex-shrink-0"
                  style={{ cursor: editingTag === tag ? 'default' : 'grab' }}
                  onMouseEnter={() => setHoveredTag(tag)}
                  onMouseLeave={() => setHoveredTag(null)}
                >
                  {editingTag === tag ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitEditTag()
                        if (e.key === 'Escape') setEditingTag(null)
                      }}
                      onBlur={commitEditTag}
                      className="text-[11px] px-2.5 py-1 rounded-full focus:outline-none"
                      style={{
                        background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.4)', color: 'rgba(var(--text-rgb),1)',
                        width: `${Math.max(editValue.length * 12 + 24, 56)}px`,
                      }}
                    />
                  ) : (
                    <button
                      onDoubleClick={() => startEditTag(tag)}
                      className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-all"
                      style={(() => { const c = tagColors[tag] ?? '#94A3B8'; return { background: `${c}14`, color: c, border: `1px solid ${c}33` } })()}
                    >
                      {(() => { const I = tagIcon(tag); return <I size={11} /> })()}
                      {tag}
                    </button>
                  )}
                  {editingTag !== tag && hoveredTag === tag && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteTag(tag) }}
                      className="absolute -top-1 -right-1 flex items-center justify-center rounded-full"
                      style={{ width: 13, height: 13, background: 'rgba(220,60,60,0.85)', color: '#fff' }}
                    >
                      <X size={7} />
                    </button>
                  )}
                </div>
              ))}

              {addingTag ? (
                <input
                  autoFocus
                  value={addValue}
                  onChange={e => setAddValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitAddTag()
                    if (e.key === 'Escape') { setAddingTag(false); setAddValue('') }
                  }}
                  onBlur={commitAddTag}
                  placeholder="범주명"
                  className="text-[11px] px-2.5 py-1 rounded-full focus:outline-none flex-shrink-0"
                  style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.2)', color: 'rgba(var(--text-rgb),1)', width: 68 }}
                />
              ) : (
                <button
                  onClick={() => setAddingTag(true)}
                  className="flex items-center justify-center rounded-full flex-shrink-0 transition-colors"
                  style={{ width: 20, height: 20, background: 'rgba(var(--ink-rgb),0.05)', border: '1px solid rgba(var(--ink-rgb),0.08)', color: 'rgba(var(--text-rgb),0.35)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.09)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.05)')}
                >
                  <Plus size={10} />
                </button>
              )}
              </div>
              <p className="text-[10.5px] mt-2.5" style={{ color: 'rgba(var(--text-rgb),0.35)' }}>끌어서 순서 변경 · 더블클릭 이름 변경 · 마우스 올리고 × 삭제</p>
            </div>
          )}
        </div>

        <span className="text-[12px] flex-shrink-0 ml-1" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>총 {total}개</span>

        {right && <div className="ml-auto flex items-center gap-2 flex-shrink-0">{right}</div>}
      </div>
    </div>
  )
}
