'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, FileText, MoreVertical, ChevronDown, List, Plus } from 'lucide-react'
import { MemoPageSkeleton } from '@/components/ui/Skeleton'
import { createClient } from '@/lib/supabase/client'
import { clearAutosaveBuffer } from '@/hooks/useAutosave'
import { useUserSetting } from '@/hooks/useUserSetting'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { QuickMemo, MemoTag } from '@/types'
import SmartTextarea from '@/components/SmartTextarea'
import { fetchMembers } from '@/lib/tasks'
import { useOrgData } from '@/hooks/useOrgData'
import { OBS_TAG, teamMembers, filterByObservedMember, observationLabel } from '@/lib/observation'
import type { Member } from '@/types'
import MemoDetailPanel, { pill, pOn, pOff, DROPDOWN_STYLE, memoTagStyle, memoTagSolid, withTag, withoutTag } from '@/components/memo/MemoDetailPanel'
import { broadcastMemo, subscribeMemoSync, openMemoPopup } from '@/lib/memoSync'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// 검색 대상: 제목/본문/태그(다중) — 대소문자 무시. 기존 홈 화면 전역검색(제목만)의 상위호환
function memoMatchesSearch(m: QuickMemo, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return m.title.toLowerCase().includes(q)
    || stripHtml(m.content ?? '').toLowerCase().includes(q)
    || m.tag.some(t => t.toLowerCase().includes(q))
}

const PAGE_SIZE = 60

// 범주(카테고리) 목록 기본값 — 사용자가 필터 탭에서 자유롭게 추가/삭제 가능(user_settings에 저장)
const DEFAULT_CATEGORIES: MemoTag[] = ['공지', '업무관련', '회의관련', '아이디어', '완료']

// 병합 타임라인의 날짜 구분선 라벨 — 오늘/어제는 상대 표기, 그 외는 'M월 d일'
function dateDividerLabel(iso: string | null | undefined): string {
  if (!iso) return '날짜 없음'
  try {
    const d = parseISO(iso)
    if (isToday(d)) return '오늘'
    if (isYesterday(d)) return '어제'
    return format(d, 'M월 d일', { locale: ko })
  } catch { return '' }
}

function inlineDraftKey(tag: MemoTag) { return `memo_inlineadd_draft_${tag}` }

interface MemoListRowProps {
  memo: QuickMemo
  onEdit: (m: QuickMemo) => void
  onDelete: (id: string) => void
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  isOpen?: boolean
  pinned?: boolean
  /** 팀원관찰 메모의 대상·종류 표시 ("홍길동 · 칭찬") */
  obsLabel?: string | null
}

// 카테고리 섹션을 대체하는 카드 — 문서 아이콘 / 제목줄(태그+날짜+더보기) / 내용 프리뷰 2번째 줄
// 개별 카드는 테두리 없이 배경톤으로만 구분(리스트 전체를 감싸는 바깥 박스가 테두리를 담당).
// 열려있는 카드만 강조색 테두리로 구분
function MemoListRow({ memo, onEdit, onDelete, draggable: drag, onDragStart, onDragOver, onDrop, isOpen, pinned, obsLabel }: MemoListRowProps) {
  const visibleTags = memo.tag.slice(0, 2)
  const extraCount = memo.tag.length - visibleTags.length
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const borderClass = isOpen ? 'border-[rgba(76,127,224,0.55)]' : 'border-transparent'
  const bgClass = pinned
    ? 'bg-[rgba(224,165,107,0.05)] hover:bg-[rgba(224,165,107,0.08)]'
    : 'bg-[rgba(var(--ink-rgb),0.025)] hover:bg-[rgba(var(--ink-rgb),0.05)]'
  return (
    <div
      draggable={drag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => onEdit(memo)}
      className={`group flex items-start gap-3 cursor-pointer select-none transition-colors rounded-xl border ${borderClass} ${bgClass}`}
      style={{ padding: '12px', marginBottom: 8 }}>
      {/* 문서 아이콘 — 카테고리 색 대신 중립톤 (레퍼런스 디자인 반영) */}
      <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 28, height: 28, background: 'rgba(107,155,224,0.14)' }}>
        <FileText size={14} style={{ color: 'var(--accent-badge-text)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-[13.5px] font-medium text-[rgba(var(--text-rgb),1)]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {memo.title}
          </p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {obsLabel && (
              <span className="text-[10px] px-2 py-1 rounded-full border font-medium"
                style={{ background: 'rgba(76,127,224,0.12)', color: 'var(--accent-badge-text)', borderColor: 'rgba(76,127,224,0.3)' }}>
                👤 {obsLabel}
              </span>
            )}
            {visibleTags.map(t => (
              <span key={t} className="text-[10px] px-2 py-1 rounded-full border font-medium" style={memoTagStyle(t)}>{t}</span>
            ))}
            {extraCount > 0 && (
              <span className="text-[10px] px-1.5 py-1 rounded-full border font-medium text-[rgba(var(--text-rgb),0.4)] border-[rgba(var(--ink-rgb),0.1)] bg-[rgba(var(--ink-rgb),0.03)]">
                +{extraCount}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            {(() => { try { return format(parseISO(memo.created_at), 'M/d', { locale: ko }) } catch { return '' } })()}
          </span>
          {/* ⋮ 더보기 — 삭제 (오조작 방지: hover 즉시삭제 대신 확인 클릭 한 단계 추가) */}
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
              className="flex items-center justify-center w-5 h-5 rounded text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.7)] hover:bg-[rgba(var(--ink-rgb),0.08)] opacity-0 group-hover:opacity-100 transition-all">
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 py-1 rounded-xl z-10 min-w-[90px]" style={DROPDOWN_STYLE}>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(memo.id) }}
                  className="w-full text-left text-xs px-3 py-1.5 text-red-400/80 hover:bg-red-400/10 hover:text-red-400 transition-colors">
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
        {memo.content && (
          <p className="text-[12px] text-[var(--text-secondary)] mt-1" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stripHtml(memo.content)}
          </p>
        )}
      </div>
    </div>
  )
}

export default function MemosPage() {
  const [memos, setMemos] = useState<QuickMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<QuickMemo | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const { value: categories, save: saveCategories } = useUserSetting<MemoTag[]>('memo_categories', DEFAULT_CATEGORIES)
  const [addingCat, setAddingCat] = useState(false)
  const [addCatValue, setAddCatValue] = useState('')
  const addCatInputRef = useRef<HTMLInputElement>(null)
  const [filterTag, setFilterTag] = useState('전체')
  // 팀원관찰 — 팀원별 걸러 보기(null = 전부), 이름 표시용 팀원 목록
  const [obsFilter, setObsFilter] = useState<string | null>(null)
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const { org } = useOrgData()
  const obsCandidates = useMemo(() => teamMembers(org, allMembers), [org, allMembers])
  const nameById = useMemo(() => Object.fromEntries(allMembers.map(m => [m.id, m.name])), [allMembers])
  useEffect(() => { fetchMembers().then(setAllMembers) }, [])
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [prevFilterKey, setPrevFilterKey] = useState('전체|')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState<MemoTag[]>(['업무관련'])
  const [inlineTags, setInlineTags] = useState<MemoTag[] | null>(null)
  const [inlineTitle, setInlineTitle] = useState('')
  const [inlineContent, setInlineContent] = useState('')
  const inlineContentRef = useRef<HTMLTextAreaElement>(null)
  const newTitleRef = useRef<HTMLInputElement>(null)
  const inlineTitleRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const quickDraftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inlineDraftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const QUICK_DRAFT_KEY = 'memo_quickadd_draft'

  function openAddForm() {
    try {
      const raw = localStorage.getItem(QUICK_DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw) as { title: string; content: string; tag: MemoTag[] | MemoTag }
        setNewTitle(d.title ?? ''); setNewContent(d.content ?? '')
        setNewTags(Array.isArray(d.tag) ? d.tag : d.tag ? [d.tag] : ['업무관련'])
      }
    } catch {}
    setShowAddForm(true)
  }

  // 빠른 추가 폼 초안 로컬 백업
  useEffect(() => {
    if (!showAddForm) return
    clearTimeout(quickDraftTimer.current)
    quickDraftTimer.current = setTimeout(() => {
      try { localStorage.setItem(QUICK_DRAFT_KEY, JSON.stringify({ title: newTitle, content: newContent, tag: newTags })) } catch {}
    }, 500)
    return () => clearTimeout(quickDraftTimer.current)
  }, [newTitle, newContent, newTags, showAddForm])

  function openInlineForm(tag: MemoTag) {
    try {
      const raw = localStorage.getItem(inlineDraftKey(tag))
      if (raw) {
        const d = JSON.parse(raw) as { title: string; content: string }
        setInlineTitle(d.title ?? ''); setInlineContent(d.content ?? '')
      }
    } catch {}
    setInlineTags([tag])
  }

  // 인라인 추가 폼 초안 로컬 백업
  useEffect(() => {
    if (!inlineTags) return
    clearTimeout(inlineDraftTimer.current)
    inlineDraftTimer.current = setTimeout(() => {
      try { localStorage.setItem(inlineDraftKey(inlineTags[0] ?? '업무관련'), JSON.stringify({ title: inlineTitle, content: inlineContent })) } catch {}
    }, 500)
    return () => clearTimeout(inlineDraftTimer.current)
  }, [inlineTitle, inlineContent, inlineTags])

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

  // 팝업창(/memo/view·/memo/quick)에서 저장·삭제·새로 만든 메모를 목록에 바로 반영
  useEffect(() => subscribeMemoSync(msg => {
    if (msg.type === 'updated') {
      const u = msg.memo
      setMemos(prev => prev.map(m => m.id === u.id ? { ...m, title: u.title, content: u.content, tag: u.tag } : m))
    } else if (msg.type === 'deleted') {
      setMemos(prev => prev.filter(m => m.id !== msg.id))
      setEditing(prev => (prev?.id === msg.id ? null : prev))
    } else if (msg.type === 'created') {
      supabase.from('quick_memos').select('*').eq('id', msg.id).single()
        .then(({ data }) => {
          if (!data) return
          setMemos(prev => prev.some(m => m.id === msg.id) ? prev : [data as QuickMemo, ...prev])
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  async function autoSave(id: string, title: string, content: string, tags: MemoTag[]) {
    if (!title.trim()) return
    await supabase.from('quick_memos').update({ title: title.trim(), content: content.trim(), tag: tags }).eq('id', id)
    setMemos(prev => prev.map(m => m.id === id ? { ...m, title: title.trim(), content: content.trim(), tag: tags } : m))
    broadcastMemo({ type: 'updated', memo: { id, title: title.trim(), content: content.trim(), tag: tags } })
  }

  async function saveEdit(id: string, title: string, content: string, tags: MemoTag[]) {
    if (!title.trim()) return
    await supabase.from('quick_memos').update({ title: title.trim(), content: content.trim(), tag: tags }).eq('id', id)
    setMemos(prev => prev.map(m => m.id === id ? { ...m, title: title.trim(), content: content.trim(), tag: tags } : m))
    broadcastMemo({ type: 'updated', memo: { id, title: title.trim(), content: content.trim(), tag: tags } })
  }

  async function handleAddSave() {
    if (!newTitle.trim()) { newTitleRef.current?.focus(); return }
    const { data, error } = await supabase.from('quick_memos')
      .insert({ title: newTitle.trim(), content: newContent, tag: newTags })
      .select().single()
    if (error || !data) return
    setMemos(prev => [data as QuickMemo, ...prev])
    broadcastMemo({ type: 'created', id: (data as QuickMemo).id })
    try { localStorage.removeItem(QUICK_DRAFT_KEY) } catch {}
    setNewTitle(''); setNewContent(''); setShowAddForm(false)
  }

  async function handleInlineSave() {
    if (!inlineTags) return
    if (!inlineTitle.trim()) { inlineTitleRef.current?.focus(); return }
    const { data } = await supabase.from('quick_memos')
      .insert({ title: inlineTitle.trim(), content: inlineContent.trim(), tag: inlineTags })
      .select().single()
    if (data) { setMemos(prev => [data as QuickMemo, ...prev]); broadcastMemo({ type: 'created', id: (data as QuickMemo).id }) }
    try { localStorage.removeItem(inlineDraftKey(inlineTags[0] ?? '업무관련')) } catch {}
    setInlineTags(null); setInlineTitle(''); setInlineContent('')
  }

  // 삭제 race: pending autosave draft가 있는 메모를 지울 때, canonical 삭제 직후
  // 그 메모의 autosave_drafts row(서버)와 로컬 버퍼도 함께 지운다 — meeting_note
  // 삭제(B-5)와 동일 패턴. content_versions는 append-only(UPDATE/DELETE 권한 없음)라
  // 건드리지 않음 — 지워진 메모의 이력이 남는 건 기존 rebind 시나리오와 동일하게 허용.
  async function deleteMemo(id: string): Promise<boolean> {
    if (!confirm('메모를 삭제하시겠습니까?')) return false
    await supabase.from('quick_memos').delete().eq('id', id)
    await supabase.from('autosave_drafts').delete().eq('entity_type', 'quick_memo').eq('entity_id', id)
    clearAutosaveBuffer('quick_memo', id, 'draft')
    setMemos(prev => prev.filter(m => m.id !== id))
    setEditing(prev => (prev?.id === id ? null : prev))
    broadcastMemo({ type: 'deleted', id })
    return true
  }

  // 리스트에서 다른 카테고리 위로 드래그 — 태그를 교체하는 대신 추가(다중 태그이므로)
  async function handleDropOnTag(tag: MemoTag) {
    if (!draggingId) return
    const memo = memos.find(m => m.id === draggingId)
    if (!memo || memo.tag.includes(tag)) { setDraggingId(null); return }
    const nextTags = withTag(memo.tag, tag)
    await supabase.from('quick_memos').update({ tag: nextTags }).eq('id', draggingId)
    setMemos(prev => prev.map(m => m.id === draggingId ? { ...m, tag: nextTags } : m))
    broadcastMemo({ type: 'updated', memo: { id: memo.id, title: memo.title, content: memo.content, tag: nextTags } })
    setDraggingId(null)
  }

  // 필터 탭의 범주 추가/삭제 — user_settings에 저장된 목록만 관리(기존 메모의 태그 값 자체는 건드리지 않음)
  useEffect(() => { if (addingCat) setTimeout(() => addCatInputRef.current?.focus(), 30) }, [addingCat])

  function commitAddCategory() {
    const name = addCatValue.trim()
    if (name && name !== '전체' && !categories.includes(name)) {
      saveCategories([...categories, name])
    }
    setAddingCat(false)
    setAddCatValue('')
  }

  function deleteCategory(cat: MemoTag) {
    saveCategories(categories.filter(c => c !== cat))
    if (filterTag === cat) setFilterTag('전체')
  }

  const searchTrimmed = searchQuery.trim()

  // '고정' 영역 — 공지 태그를 포함한 메모 (기존 데이터 분류체계 그대로 사용, 전체 필터에서만 노출). 검색 중이면 검색어도 함께 적용
  const noticeMemos = useMemo(
    () => memos.filter(m => m.tag.includes('공지') && memoMatchesSearch(m, searchTrimmed)),
    [memos, searchTrimmed]
  )

  // '최근 메모' 영역 — 선택된 필터(+검색어)에 해당하는 메모를 시간순 단일 리스트로 병합
  // 전체 필터에서는 공지(고정 영역에 이미 노출)를 제외한 나머지를 합친다
  const mainListMemos = useMemo(() => {
    const tagged = filterTag === '전체' ? memos.filter(m => !m.tag.includes('공지')) : memos.filter(m => m.tag.includes(filterTag))
    const base = filterTag === OBS_TAG ? filterByObservedMember(tagged, obsFilter) : tagged
    return base
      .filter(m => memoMatchesSearch(m, searchTrimmed))
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [memos, filterTag, searchTrimmed, obsFilter])

  // 팀원관찰은 메모함 범주 설정에 없어도 항상 걸러 보기 칩으로 보인다(빠른 메모 고정 범주)
  const filterCats = categories.includes(OBS_TAG) ? categories : [...categories, OBS_TAG]

  // 리스트가 길어져도 한 번에 다 렌더링하지 않고 필요한 만큼만 노출 — 필터/검색 바뀌면 다시 처음 구간부터
  // (effect 대신 렌더 중 "key가 바뀌면 리셋" 패턴 사용: https://react.dev/learn/you-might-not-need-an-effect)
  const filterKey = `${filterTag}|${searchTrimmed}|${obsFilter ?? ''}`
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setVisibleCount(PAGE_SIZE)
  }
  const visibleMemos = mainListMemos.slice(0, visibleCount)
  const hasMore = mainListMemos.length > visibleMemos.length

  const isEmpty = filterTag === '전체'
    ? noticeMemos.length === 0 && mainListMemos.length === 0
    : mainListMemos.length === 0

  if (loading) return <MemoPageSkeleton />

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {/* 헤더: 1행 제목 단독, 2행 검색(풀와이드) + 액션 — 레퍼런스 레이아웃 */}
      <div className="flex-shrink-0 pt-6 pb-4">
        <h1 className="text-xl font-bold text-[rgba(var(--text-rgb),1)] mb-3">메모</h1>

        <div className="flex items-center gap-3">
          {/* 검색 — 제목/내용/태그 대상. 풀와이드 */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)' }}>
            <Search size={14} style={{ color: 'rgba(var(--text-rgb),0.35)', flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="메모 검색 (제목, 내용, 태그)"
              className="flex-1 min-w-0 bg-transparent text-[13px] focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.25)]"
              style={{ color: 'rgba(var(--text-rgb),1)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.6)] transition-colors flex-shrink-0 text-xs leading-none">✕</button>
            )}
          </div>

          <button onClick={() => (showAddForm ? setShowAddForm(false) : openAddForm())}
            className="text-sm bg-[#4C7FE0]/40 text-[var(--accent-badge-text)] border border-[#4C7FE0]/50 px-4 py-2 rounded-full hover:bg-[#4C7FE0]/60 transition-colors flex-shrink-0">
            + 메모 추가
          </button>
        </div>
      </div>

      {/* 빠른 추가 폼 */}
      {showAddForm && (
        <div className="flex-shrink-0 backdrop-blur-xl rounded-3xl p-5 mb-3 flex-shrink-0"
          style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {categories.map(t => (
              <button key={t} onClick={() => setNewTags(prev => prev.includes(t) ? withoutTag(prev, t) : withTag(prev, t))}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${newTags.includes(t) ? pOn : 'hover:opacity-80'}`}
                style={!newTags.includes(t) ? memoTagStyle(t) : undefined}>
                {t}
              </button>
            ))}
          </div>
          <input ref={newTitleRef} autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setShowAddForm(false) }}
            placeholder="제목 (필수)"
            className="w-full text-sm font-semibold text-[rgba(var(--text-rgb),1)] focus:outline-none pb-2 mb-3 bg-transparent placeholder:text-[rgba(var(--text-rgb),0.3)]"
            style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.06)' }} />
          <SmartTextarea
            value={newContent}
            onChange={setNewContent}
            onKeyDown={e => {
              if (e.key === 'Escape') setShowAddForm(false)
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleAddSave() }
            }}
            placeholder={`내용을 입력하세요...\n- 리스트, → 화살표, Ctrl+B 굵게`}
            className="w-full text-sm text-[rgba(var(--text-rgb),1)] bg-transparent focus:outline-none resize-none scrollbar-hide placeholder:text-[rgba(var(--text-rgb),0.25)] p-3 rounded-xl mb-1"
            style={{
              background: 'rgba(var(--ink-rgb),0.03)',
              border: '1px solid rgba(var(--ink-rgb),0.06)',
              minHeight: 130,
              lineHeight: 1.65,
            }}
          />
          <div className="flex gap-2 justify-end mt-2">
            <button onClick={() => { try { localStorage.removeItem(QUICK_DRAFT_KEY) } catch {}; setNewTitle(''); setNewContent(''); setShowAddForm(false) }} className={`${pill} ${pOff}`}>취소</button>
            <button onClick={handleAddSave} disabled={!newTitle.trim()} className={`${pill} ${pOn} disabled:opacity-40`}>저장</button>
          </div>
        </div>
      )}

      {/* 태그 필터 chip — 얇은 높이(기존 대비 1.5배), pill이 아닌 --radius 수준의 사각 radius, 카테고리 색 dot. 범주 추가/삭제 가능 */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {['전체', ...filterCats].map(tag => {
            const active = filterTag === tag
            const activeColor = tag === '전체' ? 'var(--accent-primary)' : memoTagSolid(tag)
            return (
              <div key={tag}
                onClick={() => setFilterTag(tag)}
                className={`group relative flex items-center justify-center gap-1.5 text-[11px] leading-none font-medium rounded-lg border transition-all whitespace-nowrap cursor-pointer flex-shrink-0 ${
                  active ? 'text-white' : 'text-[rgba(var(--text-rgb),0.5)] border-[rgba(var(--ink-rgb),0.09)] hover:text-[rgba(var(--text-rgb),0.75)] hover:border-[rgba(var(--ink-rgb),0.16)]'
                }`}
                style={{
                  padding: tag === '전체' ? '8px 12px' : '8px 10px',
                  background: active ? activeColor : 'transparent',
                  borderColor: active ? activeColor : undefined,
                }}>
                {tag !== '전체' && (
                  <span className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: active ? 'rgba(var(--ink-rgb),0.85)' : memoTagSolid(tag) }} />
                )}
                {tag}
                {tag !== '전체' && (
                  <span className="opacity-70">{memos.filter(m => m.tag.includes(tag)).length}</span>
                )}
                {tag === '전체' && <span className="opacity-80">{memos.length}</span>}
                {/* 범주 삭제 — hover 시에만 노출 (전체는 삭제 불가) */}
                {tag !== '전체' && tag !== OBS_TAG && (
                  <button onClick={e => { e.stopPropagation(); deleteCategory(tag) }}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity leading-none text-[12px] ${active ? 'text-[rgba(var(--text-rgb),0.7)] hover:text-white' : 'text-[rgba(var(--text-rgb),0.4)] hover:text-red-400'}`}>
                    ×
                  </button>
                )}
              </div>
            )
          })}
          {/* 범주 추가 */}
          {addingCat ? (
            <input ref={addCatInputRef} value={addCatValue} onChange={e => setAddCatValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitAddCategory()
                if (e.key === 'Escape') { setAddingCat(false); setAddCatValue('') }
              }}
              onBlur={commitAddCategory}
              placeholder="범주명"
              className="text-[11px] rounded-lg focus:outline-none flex-shrink-0"
              style={{ padding: '8px 10px', background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(76,127,224,0.4)', color: 'rgba(var(--text-rgb),1)', width: 90 }} />
          ) : (
            <button onClick={() => setAddingCat(true)}
              className="flex items-center justify-center rounded-lg border border-dashed border-[rgba(var(--ink-rgb),0.14)] text-[rgba(var(--text-rgb),0.3)] hover:text-[rgba(var(--text-rgb),0.6)] hover:border-[rgba(var(--ink-rgb),0.25)] transition-all flex-shrink-0"
              style={{ padding: '8px 10px' }}>
              <Plus size={12} />
            </button>
          )}
        </div>
        {/* 정렬/보기 — 정렬은 항상 최신순(실제 동작과 일치), 리스트뷰 아이콘은 추후 뷰 전환용 placeholder */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="flex items-center gap-1 text-[11px] font-medium rounded-lg border border-[rgba(var(--ink-rgb),0.09)] text-[rgba(var(--text-rgb),0.5)]" style={{ padding: '8px 10px' }}>
            최신순 <ChevronDown size={11} />
          </span>
          <button className="flex items-center justify-center rounded-lg border border-[rgba(var(--ink-rgb),0.09)] text-[rgba(var(--text-rgb),0.5)] hover:text-[rgba(var(--text-rgb),0.75)] hover:border-[rgba(var(--ink-rgb),0.16)] transition-all" style={{ padding: '8px' }}>
            <List size={13} />
          </button>
        </div>
      </div>

      {/* 팀원관찰 — 팀원별 걸러 보기 */}
      {filterTag === OBS_TAG && (
        <div className="flex-shrink-0 flex items-center gap-1.5 flex-wrap -mt-2 mb-4">
          <span className="text-[11px] mr-1 text-[var(--text-muted)]">👤 팀원</span>
          {[{ id: null as string | null, name: '전체' }, ...obsCandidates].map(m => {
            const active = obsFilter === m.id
            const count = m.id ? filterByObservedMember(memos.filter(x => x.tag.includes(OBS_TAG)), m.id).length : null
            return (
              <button key={m.id ?? 'all'} onClick={() => setObsFilter(m.id)}
                className={`text-[11px] leading-none font-medium rounded-lg border transition-all ${active ? 'text-white' : 'text-[rgba(var(--text-rgb),0.55)] border-[rgba(var(--ink-rgb),0.09)] hover:text-[rgba(var(--text-rgb),0.8)]'}`}
                style={{ padding: '7px 10px', background: active ? 'var(--accent-primary)' : 'transparent', borderColor: active ? 'var(--accent-primary)' : undefined }}>
                {m.name}{count !== null && <span className="opacity-70 ml-1">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* 본문 — 좌: 리스트, 우: 선택된 메모 상세 패널 */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
      {/* 콘텐츠 — 고정 영역 + 시간순 통합 리스트. 상세 패널과 대칭 이루는 바깥 박스 */}
      <div className="flex-1 min-w-0 rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)' }}>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4">
          {/* 고정 영역 — 최상단 별도 섹션. 전체 필터에서만 노출, 없으면 자연스럽게 숨김 */}
          {filterTag === '전체' && noticeMemos.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px]">📌</span>
                <span className="text-xs font-bold text-[rgba(var(--text-rgb),0.7)]">고정</span>
                <span className="text-[11px] text-[rgba(var(--text-rgb),0.5)] bg-[rgba(var(--ink-rgb),0.08)] px-1.5 py-0.5 rounded-md">{noticeMemos.length}</span>
              </div>
              {noticeMemos.map(memo => (
                <MemoListRow key={memo.id} memo={memo} onEdit={setEditing} onDelete={deleteMemo}
                  draggable onDragStart={() => setDraggingId(memo.id)}
                  onDragOver={e => e.preventDefault()} onDrop={() => handleDropOnTag(memo.tag[0] ?? '업무관련')}
                  isOpen={editing?.id === memo.id} pinned obsLabel={observationLabel(memo, nameById)} />
              ))}
            </div>
          )}

          {/* 최근 메모 — 카테고리 섹션 없이 시간순 단일 리스트, 날짜 변경 시에만 구분선 */}
          <p className="text-xs font-bold text-[rgba(var(--text-rgb),0.7)] mb-2">최근 메모</p>
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <p className="text-[rgba(var(--text-rgb),0.28)] text-sm">
                {searchTrimmed
                  ? `'${searchTrimmed}'에 해당하는 메모가 없습니다`
                  : filterTag === '전체'
                    ? '메모가 없습니다. 추가해 보세요!'
                    : '해당 조건의 메모가 없습니다'}
              </p>
              {(searchTrimmed || filterTag !== '전체') && (
                <button onClick={() => { setSearchQuery(''); setFilterTag('전체') }} className={`${pill} ${pOff} text-[rgba(var(--text-rgb),0.5)]`}>전체 보기</button>
              )}
            </div>
          ) : (
            <div>
              {(() => {
                const dayCounts = new Map<string, number>()
                visibleMemos.forEach(m => {
                  const k = m.created_at ? m.created_at.slice(0, 10) : ''
                  dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1)
                })
                return visibleMemos.map((memo, idx) => {
                  const dayKey = memo.created_at ? memo.created_at.slice(0, 10) : ''
                  const prevDayKey = idx > 0 ? (visibleMemos[idx - 1].created_at ? visibleMemos[idx - 1].created_at.slice(0, 10) : '') : null
                  const showDivider = idx === 0 || dayKey !== prevDayKey
                  return (
                    <div key={memo.id}>
                      {showDivider && (
                        <div className={`flex items-center gap-2 pb-1.5 ${idx === 0 ? '' : 'pt-3'}`}>
                          <span className="text-[11px] font-semibold text-[rgba(var(--text-rgb),0.4)] whitespace-nowrap">{dateDividerLabel(memo.created_at)}</span>
                          <span className="text-[10px] text-[rgba(var(--text-rgb),0.4)] bg-[rgba(var(--ink-rgb),0.06)] px-1.5 py-0.5 rounded-md">{dayCounts.get(dayKey)}</span>
                          <div className="flex-1 h-px bg-[rgba(var(--ink-rgb),0.06)]" />
                        </div>
                      )}
                      <MemoListRow memo={memo} onEdit={setEditing} onDelete={deleteMemo}
                        draggable onDragStart={() => setDraggingId(memo.id)}
                        onDragOver={e => e.preventDefault()} onDrop={() => handleDropOnTag(memo.tag[0] ?? '업무관련')}
                        isOpen={editing?.id === memo.id} obsLabel={observationLabel(memo, nameById)} />
                    </div>
                  )
                })
              })()}
              {hasMore && (
                <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="w-full flex items-center justify-center gap-1.5 mt-2 text-[12px] text-[rgba(var(--text-rgb),0.5)] hover:text-[rgba(var(--text-rgb),0.75)] transition-colors rounded-xl border-[0.5px] border-border"
                  style={{ padding: '10px' }}>
                  더 불러오기 <ChevronDown size={13} />
                </button>
              )}
            </div>
          )}

          {/* 인라인 추가 (기존 기능 유지) */}
          {filterTag === '전체' && (
            <div className="mt-4">
              <InlineAddForm
                inlineTags={inlineTags} setInlineTags={setInlineTags} openInlineForm={openInlineForm}
                inlineTitle={inlineTitle} setInlineTitle={setInlineTitle}
                inlineContent={inlineContent} setInlineContent={setInlineContent}
                inlineContentRef={inlineContentRef} inlineTitleRef={inlineTitleRef} handleInlineSave={handleInlineSave}
                pill={pill} pOn={pOn} pOff={pOff} ALL_TAGS={categories} />
            </div>
          )}
        </div>
      </div>

      {/* 우측 상세 패널 — 데스크톱: 선택 여부와 무관하게 항상 1:3 도킹(빈 상태 포함) / 좁은 화면: 선택 시에만 drawer 오버레이 */}
      <div
        className={editing
          ? 'fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm md:static md:inset-auto md:z-auto md:bg-transparent md:backdrop-blur-none md:flex-shrink-0 md:w-3/4'
          : 'hidden md:flex md:w-3/4 md:flex-shrink-0'}
        onClick={editing ? () => setEditing(null) : undefined}>
        <div
          className={editing
            ? 'w-full max-w-[420px] md:max-w-none md:w-full h-full rounded-l-2xl md:rounded-2xl overflow-hidden flex flex-col'
            : 'w-full h-full rounded-2xl overflow-hidden flex flex-col'}
          style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', boxShadow: editing ? '0 8px 28px rgba(0,0,0,0.3)' : undefined }}
          onClick={editing ? (e => e.stopPropagation()) : undefined}>
          {editing ? (
            <MemoDetailPanel key={editing.id} memo={editing} categories={categories} onSave={saveEdit} onAutoSave={autoSave} onDelete={deleteMemo} onClose={() => setEditing(null)} onPopout={() => openMemoPopup(editing.id)} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-[rgba(var(--text-rgb),0.2)] text-sm">메모를 선택하면 여기에 표시됩니다</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

function InlineAddForm({ inlineTags, setInlineTags, openInlineForm, inlineTitle, setInlineTitle, inlineContent, setInlineContent, inlineContentRef, inlineTitleRef, handleInlineSave, pill, pOn, pOff, ALL_TAGS }: {
  inlineTags: MemoTag[] | null; setInlineTags: React.Dispatch<React.SetStateAction<MemoTag[] | null>>
  openInlineForm: (t: MemoTag) => void
  inlineTitle: string; setInlineTitle: (v: string) => void
  inlineContent: string; setInlineContent: (v: string) => void
  inlineContentRef: React.RefObject<HTMLTextAreaElement | null>
  inlineTitleRef: React.RefObject<HTMLInputElement | null>
  handleInlineSave: () => void
  pill: string; pOn: string; pOff: string
  ALL_TAGS: MemoTag[]
}) {
  function cancel() {
    if (inlineTags) { try { localStorage.removeItem(inlineDraftKey(inlineTags[0] ?? '업무관련')) } catch {} }
    setInlineTags(null); setInlineTitle(''); setInlineContent('')
  }
  return inlineTags ? (
    <div className="backdrop-blur-xl rounded-3xl p-4"
      style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {ALL_TAGS.map(t => (
          <button key={t} onClick={() => setInlineTags(prev => prev
            ? (prev.includes(t) ? withoutTag(prev, t) : withTag(prev, t))
            : [t])}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${inlineTags.includes(t) ? pOn : ''}`}
            style={!inlineTags.includes(t) ? memoTagStyle(t) : undefined}>
            {t}
          </button>
        ))}
      </div>
      <input ref={inlineTitleRef} autoFocus value={inlineTitle} onChange={e => setInlineTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inlineContentRef.current?.focus() } if (e.key === 'Escape') cancel() }}
        placeholder="제목 (필수)"
        className="w-full text-sm font-semibold text-[rgba(var(--text-rgb),1)] focus:outline-none pb-1.5 mb-1.5 bg-transparent placeholder:text-[rgba(var(--text-rgb),0.3)]"
        style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.06)' }} />
      <textarea ref={inlineContentRef} value={inlineContent} onChange={e => setInlineContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleInlineSave() }}
        placeholder="내용 (선택)" rows={2}
        className="w-full text-xs focus:outline-none resize-none text-[rgba(var(--text-rgb),0.5)] bg-transparent placeholder:text-[rgba(var(--text-rgb),0.3)]" />
      <div className="flex gap-1 justify-end mt-2">
        <button onClick={cancel} className={`${pill} ${pOff} !text-[10px] !px-2.5 !py-1`}>취소</button>
        <button onClick={handleInlineSave} disabled={!inlineTitle.trim()} className={`${pill} ${pOn} !text-[10px] !px-2.5 !py-1 disabled:opacity-40`}>저장</button>
      </div>
    </div>
  ) : (
    <button onClick={() => openInlineForm('업무관련')}
      className="w-full backdrop-blur-xl border border-dashed border-[rgba(var(--ink-rgb),0.09)] rounded-3xl py-6 hover:bg-[rgba(var(--ink-rgb),0.06)] hover:border-[rgba(var(--ink-rgb),0.15)] transition-all text-[rgba(var(--text-rgb),0.28)] hover:text-[rgba(var(--text-rgb),0.5)] text-xs font-medium">
      + 메모 추가
    </button>
  )
}
