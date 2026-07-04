'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MemoPageSkeleton } from '@/components/ui/Skeleton'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { QuickMemo, MemoTag } from '@/types'

const ALL_TAGS: MemoTag[] = ['공지', '업무관련', '회의관련', '아이디어', '완료']
const FILTER_TAGS = ['전체', ...ALL_TAGS] as const
type FilterTag = typeof FILTER_TAGS[number]

type Period = '이번 주' | '이번 달' | '3개월' | '전체'
const PERIODS: Period[] = ['이번 주', '이번 달', '3개월', '전체']

function getPeriodStart(period: Period): Date | null {
  if (period === '전체') return null
  const now = new Date()
  if (period === '이번 주') {
    const d = new Date(now)
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (period === '이번 달') return new Date(now.getFullYear(), now.getMonth(), 1)
  const d = new Date(now); d.setMonth(now.getMonth() - 3); return d
}

function inPeriod(dateStr: string | null | undefined, period: Period): boolean {
  if (!dateStr) return period === '전체'
  const start = getPeriodStart(period)
  if (!start) return true
  return new Date(dateStr) >= start
}

function formatMonthLabel(ym: string): string {
  if (ym === '날짜 없음') return '날짜 미지정'
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

const TAG_BADGE: Record<MemoTag, string> = {
  '공지':     'bg-[#F3E482]/50 text-[#5A4A10] border-[#F3E482]/60',
  '업무관련':  'bg-[#BADEC8]/40 text-[#2D5A45] border-[#BADEC8]/55',
  '회의관련':  'bg-[#90A7D8]/30 text-[#1E3A6B] border-[#90A7D8]/45',
  '아이디어':  'bg-[#BFE4B5]/40 text-[#2D5A35] border-[#BFE4B5]/55',
  '완료':     'bg-gray-100/80 text-gray-400 border-gray-200',
}

const TAG_ACCENT: Record<MemoTag, string> = {
  '공지':     'border-t-[#F3E482]',
  '업무관련':  'border-t-[#BADEC8]',
  '회의관련':  'border-t-[#90A7D8]',
  '아이디어':  'border-t-[#BFE4B5]',
  '완료':     'border-t-gray-200',
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-gray-900 text-white border-gray-900 shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

interface MemoCardProps {
  memo: QuickMemo
  onEdit: (m: QuickMemo) => void
  onDelete: (id: string) => void
  draggable?: boolean
  onDragStart?: () => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

function MemoCard({ memo, onEdit, onDelete, draggable: drag, onDragStart, selected, onToggleSelect }: MemoCardProps) {
  return (
    <div
      draggable={drag}
      onDragStart={onDragStart}
      onClick={() => onEdit(memo)}
      className={`group relative bg-white/40 backdrop-blur-xl border-t-4 border border-white/60 rounded-3xl p-4 cursor-pointer select-none transition-all overflow-hidden ${TAG_ACCENT[memo.tag]} ${selected ? 'bg-white/70 ring-1 ring-[#BADEC8]/60' : 'hover:bg-white/60 hover:shadow-sm'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <input type="checkbox" checked={selected ?? false}
            onChange={e => { e.stopPropagation(); onToggleSelect?.(memo.id) }}
            onClick={e => e.stopPropagation()}
            className="w-3 h-3 rounded accent-gray-700 flex-shrink-0 cursor-pointer" />
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${TAG_BADGE[memo.tag]}`}>
            {memo.tag}
          </span>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(memo.id) }}
          className="text-xs text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
          삭제
        </button>
      </div>
      <p className="text-sm font-semibold text-gray-800 leading-snug break-words mb-1">
        {memo.title}
      </p>
      {memo.content && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 break-words whitespace-pre-wrap mt-1">
          {memo.content}
        </p>
      )}
      <p className="text-[10px] text-gray-300 mt-3">
        {format(parseISO(memo.created_at), 'M/d HH:mm', { locale: ko })}
      </p>
    </div>
  )
}

interface EditModalProps {
  memo: QuickMemo
  onSave: (id: string, title: string, content: string, tag: MemoTag) => void
  onClose: () => void
}

function EditModal({ memo, onSave, onClose }: EditModalProps) {
  const [title, setTitle] = useState(memo.title)
  const [content, setContent] = useState(memo.content)
  const [tag, setTag] = useState<MemoTag>(memo.tag)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/80 p-6 w-96" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 mb-4">메모 수정</h3>
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {ALL_TAGS.map(t => (
            <button key={t} onClick={() => setTag(t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${tag === t ? pOn : `border-gray-200 text-gray-500 hover:bg-gray-50 ${TAG_BADGE[t]}`}`}>
              {t}
            </button>
          ))}
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(memo.id, title, content, tag) }}
          autoFocus
          placeholder="제목"
          className="w-full text-sm font-semibold text-gray-800 border-b border-gray-200 pb-2 mb-3 focus:outline-none bg-transparent" />
        <textarea value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(memo.id, title, content, tag) }}
          placeholder="내용 (Ctrl+Enter 저장)"
          className="w-full text-sm text-gray-500 focus:outline-none resize-none bg-white/60 border border-gray-100 rounded-2xl p-3" rows={4} />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className={`${pill} ${pOff}`}>취소</button>
          <button onClick={() => onSave(memo.id, title, content, tag)} className={`${pill} ${pOn}`}>저장</button>
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
  const [period, setPeriod] = useState<Period>('이번 달')
  const [filterTag, setFilterTag] = useState<FilterTag>('전체')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTag, setNewTag] = useState<MemoTag>('업무관련')
  const [inlineTag, setInlineTag] = useState<MemoTag | null>(null)
  const [inlineTitle, setInlineTitle] = useState('')
  const [inlineContent, setInlineContent] = useState('')
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
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

  // 기간 + 태그 필터
  const displayed = useMemo(() => {
    const byPeriod = memos.filter(m => inPeriod(m.created_at, period))
    if (filterTag === '전체') return byPeriod
    return byPeriod.filter(m => m.tag === filterTag)
  }, [memos, period, filterTag])

  // 월별 그루핑
  const monthGroups = useMemo(() => {
    const map = new Map<string, QuickMemo[]>()
    displayed.forEach(m => {
      const ym = m.created_at ? m.created_at.slice(0, 7) : '날짜 없음'
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym)!.push(m)
    })
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [displayed])

  // 필터 변경 시 최신 월만 펼침
  useEffect(() => {
    const allYMs = monthGroups.map(([ym]) => ym)
    const latest = allYMs[0] ?? null
    setCollapsedMonths(new Set(allYMs.filter(ym => ym !== latest)))
  }, [period, filterTag])

  if (loading) return <MemoPageSkeleton />

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {editing && <EditModal memo={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 mr-auto">메모</h1>
        {selectedIds.size > 0 && (
          <button onClick={deleteSelected}
            className="text-xs bg-red-50 border border-red-200 text-red-500 px-3 py-1.5 rounded-full hover:bg-red-100 transition-all">
            {selectedIds.size}개 삭제
          </button>
        )}
        <span className="text-xs text-gray-400 bg-white/40 backdrop-blur-xl border border-white/60 px-3 py-1.5 rounded-full">
          총 {memos.length}개
        </span>
        <button onClick={() => setShowAddForm(v => !v)}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-sm">
          + 메모 추가
        </button>
      </div>

      {/* 빠른 추가 폼 */}
      {showAddForm && (
        <div className="flex-shrink-0 bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 mb-3 shadow-sm">
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {ALL_TAGS.map(t => (
              <button key={t} onClick={() => setNewTag(t)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${newTag === t ? pOn : `${TAG_BADGE[t]} hover:opacity-80`}`}>
                {t}
              </button>
            ))}
          </div>
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inlineContentRef.current?.focus() } if (e.key === 'Escape') setShowAddForm(false) }}
            placeholder="제목"
            className="w-full text-sm font-semibold text-gray-800 focus:outline-none border-b border-gray-200 pb-2 mb-2 bg-transparent" />
          <textarea ref={inlineContentRef} value={newContent} onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddSave() }}
            placeholder="내용 (선택, Ctrl+Enter 저장)" rows={2}
            className="w-full text-xs focus:outline-none resize-none text-gray-500 bg-transparent" />
          <div className="flex gap-2 justify-end mt-2">
            <button onClick={() => setShowAddForm(false)} className={`${pill} ${pOff}`}>취소</button>
            <button onClick={handleAddSave} className={`${pill} ${pOn}`}>저장</button>
          </div>
        </div>
      )}

      {/* 기간 필터 */}
      <div className="flex-shrink-0 flex items-center gap-1.5 mb-3">
        {PERIODS.map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`${pill} ${period === p ? pOn : pOff}`}>{p}</button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{displayed.length}개</span>
      </div>

      {/* 태그 필터 pills */}
      <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap mb-4">
        {FILTER_TAGS.map(tag => (
          <button key={tag} onClick={() => setFilterTag(tag)}
            className={`text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap ${
              filterTag === tag
                ? pOn
                : tag !== '전체'
                  ? `${TAG_BADGE[tag as MemoTag]} hover:opacity-80 backdrop-blur-xl`
                  : pOff
            }`}>
            {tag}
            {tag !== '전체' && (
              <span className="ml-1 opacity-60">{memos.filter(m => m.tag === tag).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-gray-300 text-sm">
              {period !== '전체' || filterTag !== '전체'
                ? '해당 기간·태그의 메모가 없습니다'
                : '메모가 없습니다. 추가해 보세요!'}
            </p>
            {(period !== '전체' || filterTag !== '전체') && (
              <button onClick={() => { setPeriod('전체'); setFilterTag('전체') }} className={`${pill} ${pOff} text-gray-400`}>
                전체 보기
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6 pb-6">
            {monthGroups.map(([ym, items], idx) => {
              const isLatest = idx === 0
              const isCollapsed = collapsedMonths.has(ym)
              return (
                <div key={ym}>
                  <button onClick={() => toggleMonthCollapse(ym)}
                    className="flex items-center gap-2 mb-4 w-full text-left group py-1 border-b border-white/50 pb-2">
                    <span className="text-sm font-semibold text-gray-600 group-hover:text-gray-800 transition-colors">
                      {formatMonthLabel(ym)}
                    </span>
                    <span className="text-xs text-gray-400 bg-white/60 border border-white/70 px-2 py-0.5 rounded-full">{items.length}개</span>
                    {isLatest && (
                      <span className="text-[10px] text-[#2D5A45] bg-[#BADEC8]/30 border border-[#BADEC8]/40 px-2 py-0.5 rounded-full">최신</span>
                    )}
                    <span className="text-xs text-gray-300 ml-auto group-hover:text-gray-500 transition-colors">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-0">
                      {items.map((memo: QuickMemo) => (
                        <div key={memo.id} className="break-inside-avoid mb-4"
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => handleDropOnTag(memo.tag)}>
                          <MemoCard
                            memo={memo}
                            onEdit={setEditing}
                            onDelete={deleteMemo}
                            draggable
                            onDragStart={() => setDraggingId(memo.id)}
                            selected={selectedIds.has(memo.id)}
                            onToggleSelect={toggleSelect}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* 인라인 추가 */}
            <div>
              {inlineTag ? (
                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-4 shadow-sm">
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {ALL_TAGS.map(t => (
                      <button key={t} onClick={() => setInlineTag(t)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${inlineTag === t ? pOn : `${TAG_BADGE[t]}`}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <input autoFocus value={inlineTitle} onChange={e => setInlineTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inlineContentRef.current?.focus() } if (e.key === 'Escape') { setInlineTag(null); setInlineTitle(''); setInlineContent('') } }}
                    placeholder="제목"
                    className="w-full text-sm font-semibold text-gray-800 focus:outline-none border-b border-gray-200 pb-1.5 mb-1.5 bg-transparent" />
                  <textarea ref={inlineContentRef} value={inlineContent} onChange={e => setInlineContent(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleInlineSave(inlineTag!) }}
                    placeholder="내용 (선택)" rows={2}
                    className="w-full text-xs focus:outline-none resize-none text-gray-500 bg-transparent" />
                  <div className="flex gap-1 justify-end mt-2">
                    <button onClick={() => { setInlineTag(null); setInlineTitle(''); setInlineContent('') }} className={`${pill} ${pOff} !text-[10px] !px-2.5 !py-1`}>취소</button>
                    <button onClick={() => handleInlineSave(inlineTag!)} className={`${pill} ${pOn} !text-[10px] !px-2.5 !py-1`}>저장</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setInlineTag('업무관련')}
                  className="w-full bg-white/20 backdrop-blur-xl border border-dashed border-white/50 rounded-3xl py-6 hover:bg-white/30 hover:border-white/70 transition-all text-gray-400 hover:text-gray-600 text-xs font-medium">
                  + 메모 추가
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
