'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_PALETTE, MEMO_TAG, colorKeyFromName } from '@/lib/categoryColors'
import dynamic from 'next/dynamic'
import { MemoPageSkeleton } from '@/components/ui/Skeleton'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { QuickMemo, MemoTag } from '@/types'
import MarkdownContent from '@/components/MarkdownContent'
import SmartTextarea from '@/components/SmartTextarea'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

const ALL_TAGS: MemoTag[] = ['공지', '업무관련', '회의관련', '아이디어', '완료']
const FILTER_TAGS = ['전체', ...ALL_TAGS] as const
type FilterTag = typeof FILTER_TAGS[number]

function formatMonthLabel(ym: string): string {
  if (ym === '날짜 없음') return '날짜 미지정'
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[#4C7FE0] text-white border-[#4C7FE0] shadow-sm'
const pOff = 'bg-white/[0.06] backdrop-blur-xl border-white/[0.09] text-white/50 hover:bg-white/[0.1] hover:text-[#E2E8F0]'

function memoTagStyle(tag: string) {
  const c = CATEGORY_PALETTE[MEMO_TAG[tag] ?? colorKeyFromName(tag)]
  return { background: c.bg, color: c.text, borderColor: c.border }
}
function memoTagSolid(tag: string): string {
  return CATEGORY_PALETTE[MEMO_TAG[tag] ?? colorKeyFromName(tag)].solid
}

interface MemoRowProps {
  memo: QuickMemo
  onEdit: (m: QuickMemo) => void
  onDelete: (id: string) => void
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  titleWidth?: number
  onResizeTitle?: (e: React.MouseEvent) => void
}

function MemoRow({ memo, onEdit, onDelete, draggable: drag, onDragStart, onDragOver, onDrop, selected, onToggleSelect, titleWidth = 150, onResizeTitle }: MemoRowProps) {
  return (
    <div
      draggable={drag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => onEdit(memo)}
      className={`group flex items-center gap-0 cursor-pointer select-none transition-colors ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
      style={{ padding: '9px 4px', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
      <input type="checkbox" checked={selected ?? false}
        onChange={e => { e.stopPropagation(); onToggleSelect?.(memo.id) }}
        onClick={e => e.stopPropagation()}
        className="w-3 h-3 rounded accent-gray-400 flex-shrink-0 cursor-pointer mr-3" />
      <div style={{ width: 2.5, height: 26, background: memoTagSolid(memo.tag), flexShrink: 0, borderRadius: 2, marginRight: 8 }} />
      <p style={{ fontSize: 12, fontWeight: 500, flexShrink: 0, width: titleWidth, minWidth: titleWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#E2E8F0' }}>
        {memo.title}
      </p>
      {/* 구분선 — 드래그로 제목 폭 조정 */}
      <div
        onMouseDown={e => { e.stopPropagation(); onResizeTitle?.(e) }}
        onClick={e => e.stopPropagation()}
        className="group/resize"
        style={{ width: 10, alignSelf: 'stretch', cursor: 'col-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1, height: 14, borderRadius: 1, background: 'rgba(255,255,255,0.1)', transition: 'background 0.15s' }}
          className="group-hover/resize:!bg-[rgba(255,255,255,0.35)]" />
      </div>
      <p style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#98A1B2', fontSize: 11, marginLeft: 4 }}>
        {memo.content ? stripHtml(memo.content) : ''}
      </p>
      <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0" style={memoTagStyle(memo.tag)}>
        {memo.tag}
      </span>
      <span style={{ fontSize: 10, color: '#7B8397', flexShrink: 0 }}>
        {format(parseISO(memo.created_at), 'M/d', { locale: ko })}
      </span>
      <button onClick={e => { e.stopPropagation(); onDelete(memo.id) }}
        className="text-[9px] text-white/[0.28] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        삭제
      </button>
    </div>
  )
}

interface EditModalProps {
  memo: QuickMemo
  onSave: (id: string, title: string, content: string, tag: MemoTag) => void
  onAutoSave: (id: string, title: string, content: string, tag: MemoTag) => Promise<void>
  onClose: () => void
}

function EditModal({ memo, onSave, onAutoSave, onClose }: EditModalProps) {
  const [title, setTitle] = useState(memo.title)
  const [content, setContent] = useState(memo.content)
  const [tag, setTag] = useState<MemoTag>(memo.tag)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saving' | 'saved' | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!title.trim()) return
    setAutoSaveStatus('saving')
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      await onAutoSave(memo.id, title, content, tag)
      setAutoSaveStatus('saved')
      setTimeout(() => setAutoSaveStatus(null), 2000)
    }, 1500)
    return () => clearTimeout(autoSaveTimer.current)
  }, [title, content, tag])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div
        className="backdrop-blur-xl rounded-3xl p-6 w-full max-w-sm md:max-w-4xl flex flex-col"
        style={{
          height: 'min(96vh, 1100px)',
          maxHeight: '96vh',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.07) inset',
        }}
        onClick={e => e.stopPropagation()}>
        {/* 태그 + 닫기 */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            {ALL_TAGS.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${tag === t ? pOn : 'hover:bg-white/[0.06] hover:opacity-80'}`}
                style={tag !== t ? memoTagStyle(t) : undefined}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-white/[0.28] hover:text-white/70 text-lg leading-none ml-3 flex-shrink-0 transition-colors">×</button>
        </div>
        {/* 제목 */}
        <input value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(memo.id, title, content, tag) }}
          autoFocus={!memo.content}
          placeholder="제목"
          className="w-full text-base font-semibold text-[#E2E8F0] pb-2 mb-3 focus:outline-none bg-transparent flex-shrink-0 placeholder:text-white/30"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
        {/* 내용 영역 — WYSIWYG */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <TiptapEditor
            dark
            value={content}
            onChange={setContent}
            onSubmit={() => onSave(memo.id, title, content, tag)}
            autoFocus={!!memo.content || !memo.content}
            minHeight={400}
            className="p-3"
          />
        </div>
        {/* 하단 버튼 */}
        <div className="flex justify-between items-center mt-4 flex-shrink-0">
          <p className="text-[10px] text-white/[0.28]">
            {autoSaveStatus === 'saving' ? '저장 중…' :
             autoSaveStatus === 'saved'  ? '✓ 자동저장됨' :
             'Ctrl+Enter 저장 · Esc 닫기'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className={`${pill} ${pOff}`}>취소</button>
            <button onClick={() => onSave(memo.id, title, content, tag)} className={`${pill} ${pOn}`}>저장</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MemosPage() {
  const [memos, setMemos] = useState<QuickMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<QuickMemo | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filterTag, setFilterTag] = useState<FilterTag>('전체')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTag, setNewTag] = useState<MemoTag>('업무관련')
  const [inlineTag, setInlineTag] = useState<MemoTag | null>(null)
  const [inlineTitle, setInlineTitle] = useState('')
  const [inlineContent, setInlineContent] = useState('')
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [rowTag, setRowTag] = useState<MemoTag>('업무관련')
  const [rowTitle, setRowTitle] = useState('')
  const [rowContent, setRowContent] = useState('')
  const [rowDate, setRowDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [titleWidth, setTitleWidth] = useState(150)
  const inlineContentRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('quick_memos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as QuickMemo[]
        setMemos(list)
        setLoading(false)
        const openId = localStorage.getItem('memos_open_id')
        if (openId) {
          localStorage.removeItem('memos_open_id')
          const target = list.find(m => m.id === openId)
          if (target) setEditing(target)
        }
      })
  }, [])

  async function autoSave(id: string, title: string, content: string, tag: MemoTag) {
    if (!title.trim()) return
    await supabase.from('quick_memos').update({ title: title.trim(), content: content.trim(), tag }).eq('id', id)
    setMemos(prev => prev.map(m => m.id === id ? { ...m, title: title.trim(), content: content.trim(), tag } : m))
  }

  async function saveEdit(id: string, title: string, content: string, tag: MemoTag) {
    if (!title.trim()) return
    await supabase.from('quick_memos').update({ title: title.trim(), content: content.trim(), tag }).eq('id', id)
    setMemos(prev => prev.map(m => m.id === id ? { ...m, title: title.trim(), content: content.trim(), tag } : m))
    setEditing(null)
  }

  async function handleAddSave() {
    if (!newTitle.trim()) { setShowAddForm(false); return }
    const { data } = await supabase.from('quick_memos')
      .insert({ title: newTitle.trim(), content: newContent.trim(), tag: newTag })
      .select().single()
    if (data) {
      const newMemo = data as QuickMemo
      setMemos(prev => [newMemo, ...prev])
      setEditing(newMemo)
    }
    setNewTitle(''); setNewContent(''); setShowAddForm(false)
  }

  async function handleInlineSave(tag: MemoTag) {
    if (!inlineTitle.trim()) { setInlineTag(null); setInlineTitle(''); setInlineContent(''); return }
    const { data } = await supabase.from('quick_memos')
      .insert({ title: inlineTitle.trim(), content: inlineContent.trim(), tag })
      .select().single()
    if (data) {
      const newMemo = data as QuickMemo
      setMemos(prev => [newMemo, ...prev])
      setEditing(newMemo)
    }
    setInlineTag(null); setInlineTitle(''); setInlineContent('')
  }

  async function handleRowSave() {
    if (!rowTitle.trim()) return
    const created_at = new Date(rowDate + 'T12:00:00').toISOString()
    const { data } = await supabase.from('quick_memos')
      .insert({ title: rowTitle.trim(), content: rowContent.trim(), tag: rowTag, created_at })
      .select().single()
    if (data) setMemos(prev => [data as QuickMemo, ...prev])
    setRowTitle('')
    setRowContent('')
    setRowDate(new Date().toISOString().slice(0, 10))
  }

  async function deleteMemo(id: string) {
    if (!confirm('메모를 삭제하시겠습니까?')) return
    await supabase.from('quick_memos').delete().eq('id', id)
    setMemos(prev => prev.filter(m => m.id !== id))
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 ${selectedIds.size}개 메모를 삭제하시겠습니까?`)) return
    await supabase.from('quick_memos').delete().in('id', Array.from(selectedIds))
    setMemos(prev => prev.filter(m => !selectedIds.has(m.id)))
    setSelectedIds(new Set())
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function handleDropOnTag(tag: MemoTag) {
    if (!draggingId) return
    const memo = memos.find(m => m.id === draggingId)
    if (!memo || memo.tag === tag) { setDraggingId(null); return }
    await supabase.from('quick_memos').update({ tag }).eq('id', draggingId)
    setMemos(prev => prev.map(m => m.id === draggingId ? { ...m, tag } : m))
    setDraggingId(null)
  }

  function toggleMonthCollapse(ym: string) {
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(ym) ? s.delete(ym) : s.add(ym); return s })
  }

  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set())

  // '전체' 뷰: 공지 상단 고정 + 나머지 범주별 섹션
  const NON_NOTICE_TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어', '완료']
  const noticeMemos = useMemo(() => memos.filter(m => m.tag === '공지'), [memos])
  const tagSections = useMemo(() => {
    if (filterTag !== '전체') return []
    return NON_NOTICE_TAGS.map(tag => ({ tag, items: memos.filter(m => m.tag === tag) })).filter(g => g.items.length > 0)
  }, [memos, filterTag])

  // 필터 뷰: 월별 그루핑
  const displayed = useMemo(() => {
    if (filterTag === '전체') return []
    return memos.filter(m => m.tag === filterTag)
  }, [memos, filterTag])

  const monthGroups = useMemo(() => {
    const map = new Map<string, QuickMemo[]>()
    displayed.forEach(m => {
      const ym = m.created_at ? m.created_at.slice(0, 7) : '날짜 없음'
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym)!.push(m)
    })
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [displayed])

  useEffect(() => {
    const allYMs = monthGroups.map(([ym]) => ym)
    const latest = allYMs[0] ?? null
    setCollapsedMonths(new Set(allYMs.filter(ym => ym !== latest)))
  }, [filterTag])

  function toggleTagCollapse(tag: string) {
    setCollapsedTags(prev => { const s = new Set(prev); s.has(tag) ? s.delete(tag) : s.add(tag); return s })
  }

  function startResizeTitle(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = titleWidth
    const onMove = (ev: MouseEvent) => setTitleWidth(Math.max(80, Math.min(320, startW + ev.clientX - startX)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (loading) return <MemoPageSkeleton />

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {editing && <EditModal memo={editing} onSave={saveEdit} onAutoSave={autoSave} onClose={() => setEditing(null)} />}

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-[#E2E8F0] mr-auto">메모</h1>
        {selectedIds.size > 0 && (
          <button onClick={deleteSelected}
            className="text-xs border text-red-400 border-red-400/30 px-3 py-1.5 rounded-full transition-all hover:bg-red-400/10">
            {selectedIds.size}개 삭제
          </button>
        )}
        <span className="text-xs text-white/50 border border-white/[0.09] px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          총 {memos.length}개
        </span>
        <button onClick={() => setShowAddForm(v => !v)}
          className="text-sm bg-[#4C7FE0]/40 text-[#A8C4F0] border border-[#4C7FE0]/50 px-4 py-2 rounded-full hover:bg-[#4C7FE0]/60 transition-colors">
          + 메모 추가
        </button>
      </div>

      {/* 빠른 추가 폼 */}
      {showAddForm && (
        <div className="flex-shrink-0 backdrop-blur-xl rounded-3xl p-5 mb-3 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {ALL_TAGS.map(t => (
              <button key={t} onClick={() => setNewTag(t)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${newTag === t ? pOn : 'hover:opacity-80'}`}
                style={newTag !== t ? memoTagStyle(t) : undefined}>
                {t}
              </button>
            ))}
          </div>
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inlineContentRef.current?.focus() } if (e.key === 'Escape') setShowAddForm(false) }}
            placeholder="제목"
            className="w-full text-sm font-semibold text-[#E2E8F0] focus:outline-none pb-2 mb-2 bg-transparent placeholder:text-white/30"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
          <textarea ref={inlineContentRef} value={newContent} onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddSave() }}
            placeholder="내용 (선택, Ctrl+Enter 저장)" rows={2}
            className="w-full text-xs focus:outline-none resize-none text-white/50 bg-transparent placeholder:text-white/30" />
          <div className="flex gap-2 justify-end mt-2">
            <button onClick={() => setShowAddForm(false)} className={`${pill} ${pOff}`}>취소</button>
            <button onClick={handleAddSave} className={`${pill} ${pOn}`}>저장</button>
          </div>
        </div>
      )}

      {/* 태그 필터 pills */}
      <div className="flex-shrink-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide mb-4">
        {FILTER_TAGS.map(tag => (
          <button key={tag} onClick={() => setFilterTag(tag)}
            className={`text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap ${
              filterTag === tag ? pOn : tag !== '전체' ? 'hover:opacity-80 backdrop-blur-xl' : pOff
            }`}
            style={filterTag !== tag && tag !== '전체' ? memoTagStyle(tag) : undefined}>
            {tag}
            {tag !== '전체' && (
              <span className="ml-1 opacity-60">{memos.filter(m => m.tag === tag).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {/* 변수행 — scroll 최상단, 데이터 행과 동일 스타일로 붙어있음 */}
        <MemoInputRow
          tag={rowTag} setTag={setRowTag}
          title={rowTitle} setTitle={setRowTitle}
          content={rowContent} setContent={setRowContent}
          date={rowDate} setDate={setRowDate}
          onSave={handleRowSave}
          titleWidth={titleWidth} onResizeTitle={startResizeTitle}
        />

        {filterTag === '전체' ? (
          /* ── 전체 뷰: 공지 상단 고정 + 범주별 섹션 ── */
          <div className="space-y-6 pb-6">
            {/* 공지 — 상단 고정 */}
            {noticeMemos.length > 0 && (
              <div>
                <button onClick={() => toggleTagCollapse('공지')}
                  className="flex items-center gap-2 w-full text-left group mb-3 pb-2"
                  style={{ borderBottom: '1px solid rgba(221,208,160,0.25)' }}>
                  <span className="text-[10px] mr-0.5">📌</span>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full border" style={memoTagStyle('공지')}>공지</span>
                  <span className="text-xs text-white/50 border border-white/[0.09] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>{noticeMemos.length}개</span>
                  <span className="text-[10px] text-white/[0.28] ml-auto group-hover:text-white/50 transition-colors">
                    {collapsedTags.has('공지') ? '▶' : '▼'}
                  </span>
                </button>
                {!collapsedTags.has('공지') && (
                  <div style={{ border: '0.5px solid rgba(224,165,107,0.22)', borderRadius: 10, background: 'rgba(224,165,107,0.05)' }}>
                    {noticeMemos.map(memo => (
                      <MemoRow key={memo.id} memo={memo} onEdit={setEditing} onDelete={deleteMemo}
                        draggable onDragStart={() => setDraggingId(memo.id)}
                        onDragOver={e => e.preventDefault()} onDrop={() => handleDropOnTag(memo.tag)}
                        selected={selectedIds.has(memo.id)} onToggleSelect={toggleSelect}
                        titleWidth={titleWidth} onResizeTitle={startResizeTitle} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 나머지 범주별 섹션 */}
            {tagSections.map(({ tag, items }) => {
              const isCollapsed = collapsedTags.has(tag)
              return (
                <div key={tag} style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
                  <button onClick={() => toggleTagCollapse(tag)}
                    className="flex items-center gap-2 w-full text-left group mb-3 pb-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full border" style={memoTagStyle(tag)}>{tag}</span>
                    <span className="text-xs text-white/50 border border-white/[0.09] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>{items.length}개</span>
                    <span className="text-[10px] text-white/[0.28] ml-auto group-hover:text-white/50 transition-colors">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div>
                      {items.map(memo => (
                        <MemoRow key={memo.id} memo={memo} onEdit={setEditing} onDelete={deleteMemo}
                          draggable onDragStart={() => setDraggingId(memo.id)}
                          onDragOver={e => e.preventDefault()} onDrop={() => handleDropOnTag(memo.tag)}
                          selected={selectedIds.has(memo.id)} onToggleSelect={toggleSelect}
                          titleWidth={titleWidth} onResizeTitle={startResizeTitle} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {noticeMemos.length === 0 && tagSections.length === 0 && (
              <div className="flex items-center justify-center h-40">
                <p className="text-white/[0.28] text-sm">메모가 없습니다. 추가해 보세요!</p>
              </div>
            )}

            {/* 인라인 추가 */}
            <InlineAddForm
              inlineTag={inlineTag} setInlineTag={setInlineTag}
              inlineTitle={inlineTitle} setInlineTitle={setInlineTitle}
              inlineContent={inlineContent} setInlineContent={setInlineContent}
              inlineContentRef={inlineContentRef} handleInlineSave={handleInlineSave}
              pill={pill} pOn={pOn} pOff={pOff} ALL_TAGS={ALL_TAGS} />
          </div>
        ) : (
          /* ── 필터 뷰: 월별 그루핑 ── */
          <div className="space-y-6 pb-6">
            {displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <p className="text-white/[0.28] text-sm">해당 태그의 메모가 없습니다</p>
                <button onClick={() => setFilterTag('전체')} className={`${pill} ${pOff} text-white/50`}>전체 보기</button>
              </div>
            ) : monthGroups.map(([ym, items], idx) => {
              const isCollapsed = collapsedMonths.has(ym)
              return (
                <div key={ym}>
                  <button onClick={() => toggleMonthCollapse(ym)}
                    className="flex items-center gap-2 mb-4 w-full text-left group py-1 pb-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-sm font-semibold text-white/70 group-hover:text-[#E2E8F0] transition-colors">{formatMonthLabel(ym)}</span>
                    <span className="text-xs text-white/50 border border-white/[0.09] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>{items.length}개</span>
                    {idx === 0 && <span className="text-[10px] text-[#A8C4F0] border border-[#4C7FE0]/40 px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(27,58,107,0.2)' }}>최신</span>}
                    <span className="text-xs text-white/[0.28] ml-auto group-hover:text-white/50 transition-colors">{isCollapsed ? '▶' : '▼'}</span>
                  </button>
                  {!isCollapsed && (
                    <div>
                      {items.map((memo: QuickMemo) => (
                        <MemoRow key={memo.id} memo={memo} onEdit={setEditing} onDelete={deleteMemo}
                          draggable onDragStart={() => setDraggingId(memo.id)}
                          onDragOver={e => e.preventDefault()} onDrop={() => handleDropOnTag(memo.tag)}
                          selected={selectedIds.has(memo.id)} onToggleSelect={toggleSelect}
                          titleWidth={titleWidth} onResizeTitle={startResizeTitle} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MemoInputRow({ tag, setTag, title, setTitle, content, setContent, date, setDate, onSave, titleWidth = 150, onResizeTitle }: {
  tag: MemoTag; setTag: (t: MemoTag) => void
  title: string; setTitle: (v: string) => void
  content: string; setContent: (v: string) => void
  date: string; setDate: (v: string) => void
  onSave: () => void
  titleWidth?: number
  onResizeTitle?: (e: React.MouseEvent) => void
}) {
  return (
    <div className="flex items-center gap-0" style={{ padding: '7px 4px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
      {/* 체크 placeholder */}
      <div className="w-3 h-3 flex-shrink-0 mr-3" />
      <div style={{ width: 2.5, height: 22, background: memoTagSolid(tag), flexShrink: 0, borderRadius: 2, marginRight: 8 }} />
      <input
        value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave() }}
        placeholder="제목"
        className="text-xs font-medium focus:outline-none bg-transparent placeholder:text-white/20"
        style={{ color: '#E2E8F0', width: titleWidth, minWidth: titleWidth, flexShrink: 0 }}
      />
      {/* 구분선 — 드래그로 제목 폭 조정 */}
      <div
        onMouseDown={onResizeTitle}
        className="group/resize"
        style={{ width: 10, alignSelf: 'stretch', cursor: 'col-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1, height: 14, borderRadius: 1, background: 'rgba(255,255,255,0.15)' }}
          className="group-hover/resize:!bg-[rgba(255,255,255,0.4)]" />
      </div>
      <input
        value={content} onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave() }}
        placeholder="내용"
        className="flex-1 text-xs focus:outline-none bg-transparent placeholder:text-white/20 ml-1"
        style={{ color: '#98A1B2' }}
      />
      <select value={tag} onChange={e => setTag(e.target.value as MemoTag)}
        className="text-[9px] px-1.5 py-0.5 rounded-full border focus:outline-none"
        style={{ ...memoTagStyle(tag), cursor: 'pointer' }}>
        {ALL_TAGS.map(t => <option key={t} value={t} style={{ background: '#1e2130', color: '#E2E8F0' }}>{t}</option>)}
      </select>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        className="text-[10px] focus:outline-none rounded px-1 py-0.5"
        style={{ color: '#7B8397', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', colorScheme: 'dark' } as React.CSSProperties}
      />
      <button onClick={onSave} disabled={!title.trim()}
        className="text-[10px] px-2.5 py-1 rounded-full flex-shrink-0 transition-all"
        style={{
          background: title.trim() ? 'rgba(76,127,224,0.3)' : 'rgba(255,255,255,0.04)',
          color: title.trim() ? '#A8C4F0' : 'rgba(255,255,255,0.2)',
          border: `1px solid ${title.trim() ? 'rgba(76,127,224,0.4)' : 'rgba(255,255,255,0.06)'}`,
        }}>
        추가
      </button>
    </div>
  )
}

function InlineAddForm({ inlineTag, setInlineTag, inlineTitle, setInlineTitle, inlineContent, setInlineContent, inlineContentRef, handleInlineSave, pill, pOn, pOff, ALL_TAGS }: {
  inlineTag: MemoTag | null; setInlineTag: (t: MemoTag | null) => void
  inlineTitle: string; setInlineTitle: (v: string) => void
  inlineContent: string; setInlineContent: (v: string) => void
  inlineContentRef: React.RefObject<HTMLTextAreaElement | null>
  handleInlineSave: (tag: MemoTag) => void
  pill: string; pOn: string; pOff: string
  ALL_TAGS: MemoTag[]
}) {
  return inlineTag ? (
    <div className="backdrop-blur-xl rounded-3xl p-4"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {ALL_TAGS.map(t => (
          <button key={t} onClick={() => setInlineTag(t)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${inlineTag === t ? pOn : ''}`}
            style={inlineTag !== t ? memoTagStyle(t) : undefined}>
            {t}
          </button>
        ))}
      </div>
      <input autoFocus value={inlineTitle} onChange={e => setInlineTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inlineContentRef.current?.focus() } if (e.key === 'Escape') { setInlineTag(null); setInlineTitle(''); setInlineContent('') } }}
        placeholder="제목"
        className="w-full text-sm font-semibold text-[#E2E8F0] focus:outline-none pb-1.5 mb-1.5 bg-transparent placeholder:text-white/30"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
      <textarea ref={inlineContentRef} value={inlineContent} onChange={e => setInlineContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleInlineSave(inlineTag!) }}
        placeholder="내용 (선택)" rows={2}
        className="w-full text-xs focus:outline-none resize-none text-white/50 bg-transparent placeholder:text-white/30" />
      <div className="flex gap-1 justify-end mt-2">
        <button onClick={() => { setInlineTag(null); setInlineTitle(''); setInlineContent('') }} className={`${pill} ${pOff} !text-[10px] !px-2.5 !py-1`}>취소</button>
        <button onClick={() => handleInlineSave(inlineTag!)} className={`${pill} ${pOn} !text-[10px] !px-2.5 !py-1`}>저장</button>
      </div>
    </div>
  ) : (
    <button onClick={() => setInlineTag('업무관련')}
      className="w-full backdrop-blur-xl border border-dashed border-white/[0.09] rounded-3xl py-6 hover:bg-white/[0.06] hover:border-white/[0.15] transition-all text-white/[0.28] hover:text-white/50 text-xs font-medium">
      + 메모 추가
    </button>
  )
}
