'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { LearningResource } from '@/types'
import { useUserSetting } from '@/hooks/useUserSetting'
import LearningSearchToolbar, { type StatusFilter, type MediaFilter } from './LearningSearchToolbar'
import LearningSection from './LearningSection'
import BookShelf from './BookShelf'
import { getStatus } from './LearningRow'
import { resolveTagColors, NO_TAG_COLOR } from '@/lib/learningTagColors'
import { MEDIA_SETTING_KEY, DEFAULT_MEDIA, LOCKED_MEDIA, FALLBACK_MEDIA } from '@/lib/learningMedia'

// '미분류' = 범주 태그가 없는 자료가 모이는 곳. 2026-11-09부터 범주 목록에 '미분류'가 있으면 그 상자가 일반 범주처럼
// 옮기기·이름변경·삭제되고(태그 없는 자료도 거기 보임), 목록에 없을 때만 남는 자료를 위한 자동 상자를 띄운다.
const UNCAT = '미분류'

const DEFAULT_TAGS = ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']

type SiteShortcut = { id: string; title: string; url: string }
type Status = 'todo' | 'doing' | 'done'

export default function LearningNew() {
  const supabase = createClient()
  const router   = useRouter()

  const [resources, setResources] = useState<LearningResource[]>([])
  const [loading,   setLoading]   = useState(true)

  const { value: customTags, save: saveCustomTags } = useUserSetting<string[]>('learning_custom_tags', DEFAULT_TAGS)
  const { value: siteShortcuts } = useUserSetting<SiteShortcut[]>('learning_site_shortcuts', [])
  const { value: view, save: saveView } = useUserSetting<'category' | 'shelf'>('learning_view', 'category')
  const shelf = view === 'shelf'
  const { value: tagColors, save: saveTagColors } = useUserSetting<Record<string, string>>('learning_tag_colors', {})
  const { value: mediaTypes, save: saveMediaTypes } = useUserSetting<string[]>(MEDIA_SETTING_KEY, DEFAULT_MEDIA)
  const coverColorMap = useMemo(() => resolveTagColors(customTags, tagColors), [customTags, tagColors])

  // 필터 상태
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체')
  const [mediaFilter,  setMediaFilter]  = useState<MediaFilter>('전체')

  // 새 자료 추가
  const [adding,    setAdding]    = useState(false)
  const [addTitle,  setAddTitle]  = useState('')
  const [addSource, setAddSource] = useState('')
  const [addTag,    setAddTag]    = useState('')

  useEffect(() => {
    // 최신순(created_at 내림차순) — 각 범주 카드 안에서도 이 순서 그대로 유지됨
    supabase.from('learning_resources').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setResources((data ?? []) as LearningResource[]); setLoading(false) })
  }, [])

  // ── CRUD (기존과 동일) ──────────────────────────────────
  async function handleAdd() {
    const title = addTitle.trim()
    if (!title) { setAdding(false); return }
    const initTags = addTag && addTag !== '미분류' ? [addTag] : []
    const { data, error } = await supabase.from('learning_resources')
      .insert({ title, source: addSource.trim(), notes: [], tags: initTags })
      .select().single()
    if (error) { console.error('학습자료 추가 실패:', error.message); return }
    if (data) setResources(prev => [data as LearningResource, ...prev])
    setAdding(false); setAddTitle(''); setAddSource(''); setAddTag('')
  }

  // ── 범주 순서(상자 ⠿ 끌기) — 범주 추가는 툴바 [범주 관리]에서(그리드 끝 추가 상자는 스크롤이 생겨 뺐다) ──
  function moveCategory(tag: string, target: string, after: boolean) {
    if (tag === target || !customTags.includes(tag) || !customTags.includes(target)) return
    const rest = customTags.filter(t => t !== tag)
    const at = rest.indexOf(target) + (after ? 1 : 0)
    const next = [...rest.slice(0, at), tag, ...rest.slice(at)]
    if (next.join('|') !== customTags.join('|')) saveCustomTags(next)
  }

  // ── 매체 추가·이름변경·삭제 — 목록과 자료의 media_type 을 같이 바꾼다('책'은 잠금) ──
  async function setMediaOf(match: string, next: string | null): Promise<number> {
    const affected = resources.filter(r => r.media_type === match)
    setResources(prev => prev.map(r => r.media_type === match ? { ...r, media_type: next } : r))
    const results = await Promise.all(affected.map(r => supabase.from('learning_resources').update({ media_type: next }).eq('id', r.id)))
    const failed = results.filter(x => x.error).length
    if (failed) console.error('학습자료 매체 갱신 실패:', results.find(x => x.error)?.error?.message)
    return failed
  }
  function addMedia(raw: string) {
    const name = raw.trim()
    if (!name || name === '전체' || mediaTypes.includes(name)) return
    saveMediaTypes([...mediaTypes, name])
  }
  async function renameMedia(oldName: string, raw: string) {
    const name = raw.trim()
    if (!name || name === oldName || name === '전체' || oldName === LOCKED_MEDIA || mediaTypes.includes(name)) return
    saveMediaTypes(mediaTypes.map(m => m === oldName ? name : m))
    if (mediaFilter === oldName) setMediaFilter(name)
    const failed = await setMediaOf(oldName, name)
    if (failed) alert(`매체 이름 변경 중 자료 ${failed}건 저장 실패 — 새로고침 후 확인해 주세요`)
  }
  async function deleteMedia(target: string) {
    if (target === LOCKED_MEDIA) return
    const n = resources.filter(r => r.media_type === target).length
    const to = target !== FALLBACK_MEDIA && mediaTypes.includes(FALLBACK_MEDIA) ? FALLBACK_MEDIA : null
    const msg = n ? `"${target}" 매체를 삭제할까요?\n이 매체 자료 ${n}건은 지워지지 않고 ${to ? `'${to}'로` : '매체 없음으로'} 옮겨집니다.` : `"${target}" 매체를 삭제할까요?`
    if (!confirm(msg)) return
    saveMediaTypes(mediaTypes.filter(m => m !== target))
    if (mediaFilter === target) setMediaFilter('전체')
    const failed = await setMediaOf(target, to)
    if (failed) alert(`매체 삭제 중 자료 ${failed}건 저장 실패 — 새로고침 후 확인해 주세요`)
  }
  function reorderMedia(next: string[]) { saveMediaTypes(next) }

  // ── 범주 상자 ⠿ 끌기 — 브라우저 기본 drag&drop 대신 포인터를 따라가며, 놓은 상자의 왼쪽/오른쪽 절반으로 앞·뒤를 정한다 ──
  const boxEls = useRef(new Map<string, HTMLDivElement>())
  const [boxDrag, setBoxDrag] = useState<string | null>(null)
  const [boxDrop, setBoxDrop] = useState<{ tag: string; after: boolean } | null>(null)
  function startBoxDrag(e: React.PointerEvent, tag: string) {
    if (e.button !== 0) return
    e.preventDefault()
    let target: { tag: string; after: boolean } | null = null
    setBoxDrag(tag)
    const onMove = (ev: PointerEvent) => {
      let hit: { tag: string; after: boolean } | null = null
      for (const [t, el] of boxEls.current) {
        if (!customTags.includes(t)) continue
        const r = el.getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { hit = { tag: t, after: ev.clientX > (r.left + r.right) / 2 }; break }
      }
      if (hit?.tag !== target?.tag || hit?.after !== target?.after) { target = hit; setBoxDrop(hit) }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setBoxDrag(null); setBoxDrop(null)
      if (target) moveCategory(tag, target.tag, target.after)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  async function cycleStatus(r: LearningResource) {
    const cur = getStatus(r.tags ?? [])
    const next: Status = cur === 'todo' ? 'doing' : cur === 'doing' ? 'done' : 'todo'
    const stripped = (r.tags ?? []).filter(t => t !== '_done' && t !== '_doing')
    const newTags  = next === 'done' ? [...stripped, '_done'] : next === 'doing' ? [...stripped, '_doing'] : stripped
    await supabase.from('learning_resources').update({ tags: newTags }).eq('id', r.id)
    setResources(prev => prev.map(x => x.id === r.id ? { ...x, tags: newTags } : x))
  }

  // ── 필터링 ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = resources
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => r.title.toLowerCase().includes(q) || (r.source ?? '').toLowerCase().includes(q))
    }
    if (statusFilter !== '전체') {
      const map: Record<StatusFilter, Status | null> = { '전체': null, '보기전': 'todo', '보는중': 'doing', '완료': 'done' }
      const target = map[statusFilter]
      if (target) list = list.filter(r => getStatus(r.tags ?? []) === target)
    }
    if (mediaFilter !== '전체') {
      list = list.filter(r => r.media_type === mediaFilter)
    }
    return list
  }, [resources, search, statusFilter, mediaFilter])

  // ── 카테고리별 그룹 ────────────────────────────────────
  const hasActiveFilter = search.trim() !== '' || statusFilter !== '전체' || mediaFilter !== '전체'
  const groups = useMemo(() => {
    const map = new Map<string, LearningResource[]>()
    customTags.forEach(t => map.set(t, []))
    const orphans: LearningResource[] = []
    filtered.forEach(r => {
      const cat = (r.tags ?? []).find(t => customTags.includes(t))
      if (cat) map.get(cat)!.push(r)
      else if (map.has(UNCAT)) map.get(UNCAT)!.push(r)   // 범주 없는 자료 → '미분류' 범주 상자
      else orphans.push(r)
    })
    const entries = Array.from(map.entries())
    // '미분류' 범주를 지웠는데 범주 없는 자료가 남아 있으면 그 자료만 모아 맨 뒤에 자동 상자로(옮기기·편집 불가)
    if (orphans.length) entries.push([UNCAT, orphans])
    // 필터/검색 중이 아니면 자료가 없는 카테고리도 구조 확인용으로 노출
    return hasActiveFilter ? entries.filter(([, items]) => items.length > 0) : entries
  }, [filtered, customTags, hasActiveFilter])
  const allTags = groups.map(([t]) => t)

  // ── 분야(범주) 이름 변경·삭제 — 목록과 자료의 태그를 같이 바꾼다 ──────────
  // (예전엔 목록 이름만 바뀌어 자료가 옛 태그로 남고 미분류로 빠지는 버그가 있었음)
  async function retagResources(match: string, fn: (tags: string[]) => string[]): Promise<number> {
    const affected = resources.filter(r => (r.tags ?? []).includes(match))
    setResources(prev => prev.map(r => (r.tags ?? []).includes(match) ? { ...r, tags: fn(r.tags ?? []) } : r))
    const results = await Promise.all(affected.map(r =>
      supabase.from('learning_resources').update({ tags: fn(r.tags ?? []) }).eq('id', r.id)))
    const failed = results.filter(x => x.error)
    if (failed.length) console.error('학습자료 태그 갱신 실패:', failed[0].error?.message)
    return failed.length
  }

  async function renameCategory(oldTag: string, newTag: string): Promise<number> {
    const name = newTag.trim()
    if (!name || name === oldTag || name === '전체' || customTags.includes(name)) return 0
    saveCustomTags(customTags.map(t => t === oldTag ? name : t))
    if (tagColors[oldTag]) {
      const rest = Object.fromEntries(Object.entries(tagColors).filter(([k]) => k !== oldTag))
      saveTagColors({ ...rest, [name]: tagColors[oldTag] })
    }
    const failed = await retagResources(oldTag, tags => tags.map(t => t === oldTag ? name : t))
    if (failed) alert(`범주 이름 변경 중 자료 ${failed}건 저장 실패 — 새로고침 후 확인해 주세요`)
    return failed
  }

  // 자료는 지우지 않고 태그만 떼어 미분류로 보낸다. 취소하면 false.
  async function deleteCategory(target: string): Promise<boolean> {
    const n = resources.filter(r => (r.tags ?? []).includes(target)).length
    const msg = n
      ? `"${target}" 범주를 삭제할까요?\n이 범주가 붙은 학습자료 ${n}건은 지워지지 않고 미분류로 옮겨집니다.`
      : `"${target}" 범주를 삭제할까요?`
    if (!confirm(msg)) return false
    saveCustomTags(customTags.filter(t => t !== target))
    if (tagColors[target]) saveTagColors(Object.fromEntries(Object.entries(tagColors).filter(([k]) => k !== target)))
    const failed = await retagResources(target, tags => tags.filter(t => t !== target))
    if (failed) alert(`범주 삭제 중 자료 ${failed}건 저장 실패 — 새로고침 후 확인해 주세요`)
    return true
  }

  // 범주별/책장 전환 + 새 자료 버튼. 범주별 보기에선 검색 줄 오른쪽(같은 높이 48)으로, 책장 보기에선 제목 오른쪽
  const viewControls = (tall: boolean) => (
    <>
      <div className="rounded-xl p-1 flex gap-0.5" style={{ height: tall ? 48 : undefined, background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid rgba(var(--ink-rgb),0.08)' }}>
        {([['category', '범주별'], ['shelf', '📚 책장']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { saveView(k); setAdding(false) }}
            className={`${tall ? 'text-[13px] px-4' : 'text-[12px] px-3 py-1'} rounded-lg font-medium`}
            style={view === k ? { background: 'var(--accent-primary)', color: '#fff' } : { color: 'rgba(var(--text-rgb),0.55)' }}>
            {l}
          </button>
        ))}
      </div>
      <button
        onClick={() => setAdding(true)}
        className="flex items-center gap-2 px-4 rounded-xl text-[13px] font-medium transition-colors"
        style={{ height: tall ? 48 : 36, background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: 'var(--accent-soft)' }}
      >
        {shelf ? '+ 책 추가' : '+ 새 자료'}
      </button>
    </>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-page)' }}>

      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-start pt-6 pb-3">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: 'rgba(var(--text-rgb),1)' }}>학습자료</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'rgba(var(--text-rgb),0.35)' }}>아티클, 도서, 강의 등 학습 자료를 관리하세요.</p>
        </div>
      </div>

      {/* 사이트 단축키 */}
      {siteShortcuts.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 pb-3 flex-wrap">
          <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(var(--text-rgb),0.3)' }}>빠른 링크</span>
          {siteShortcuts.map(s => (
            <a
              key={s.id}
              href={s.url}
              target="_blank" rel="noopener noreferrer"
              className="text-[12px] px-3 py-1 rounded-lg transition-colors"
              style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', color: 'rgba(var(--text-rgb),0.6)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(var(--text-rgb),1)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(var(--text-rgb),0.6)')}
            >
              {s.title}
            </a>
          ))}
        </div>
      )}

      {shelf ? (
        <BookShelf resources={resources} setResources={setResources} customTags={customTags} saveCustomTags={saveCustomTags}
          onRenameTag={renameCategory} onDeleteTag={deleteCategory}
          tagColors={tagColors} onSetTagColor={(t, c) => saveTagColors({ ...tagColors, [t]: c })}
          adding={adding} setAdding={setAdding} toolbarRight={viewControls(true)} />
      ) : (<>
      {/* 새 자료 입력 폼 */}
      {adding && (
        <div
          className="flex-shrink-0 rounded-2xl px-5 py-4 mb-3 flex flex-col gap-2"
          style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.1)' }}
        >
          <input
            autoFocus
            value={addTitle}
            onChange={e => setAddTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); if (e.key === 'Escape') { setAdding(false); setAddTitle('') } }}
            placeholder="자료 제목 입력 후 Enter"
            className="w-full text-[13px] bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.3)]"
            style={{ color: 'rgba(var(--text-rgb),1)' }}
          />
          <div className="flex gap-2">
            <input
              value={addSource}
              onChange={e => setAddSource(e.target.value)}
              placeholder="출처 URL"
              className="flex-1 text-[12px] px-3 py-1.5 rounded-lg bg-transparent focus:outline-none placeholder:text-[rgba(var(--text-rgb),0.2)]"
              style={{ color: 'rgba(var(--text-rgb),0.7)', border: '1px solid rgba(var(--ink-rgb),0.08)' }}
            />
            <select
              value={addTag}
              onChange={e => setAddTag(e.target.value)}
              className="text-[12px] px-3 py-1.5 rounded-lg focus:outline-none [&>option]:bg-[var(--select-option-bg)]"
              style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', color: 'rgba(var(--text-rgb),0.7)' }}
            >
              <option value="">범주 선택</option>
              {customTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={handleAdd}
              className="text-[12px] px-4 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(76,127,224,0.2)', border: '1px solid rgba(76,127,224,0.3)', color: 'var(--accent-soft)' }}
            >
              추가
            </button>
            <button
              onClick={() => { setAdding(false); setAddTitle('') }}
              className="text-[12px] px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(var(--text-rgb),0.4)' }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 검색 툴바 + 범주 관리 */}
      <LearningSearchToolbar
        search={search}             setSearch={setSearch}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        mediaFilter={mediaFilter}   setMediaFilter={setMediaFilter}
        mediaTypes={mediaTypes}
        onAddMedia={addMedia} onRenameMedia={renameMedia} onDeleteMedia={deleteMedia} onReorderMedia={reorderMedia}
        customTags={customTags}     setCustomTags={saveCustomTags}
        onRenameTag={renameCategory} onDeleteTag={deleteCategory}
        total={filtered.length}
        tagColors={coverColorMap}
        right={viewControls(true)}
      />

      {/* 본문 — 한 행에 최대 4칸, 넘치면 다음 행으로 (가로 스크롤 없음) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-56 rounded-2xl animate-pulse" style={{ background: 'rgba(var(--ink-rgb),0.04)' }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-[13px]" style={{ color: 'rgba(var(--text-rgb),0.3)' }}>조건에 맞는 자료가 없습니다</p>
            <button
              onClick={() => { setSearch(''); setStatusFilter('전체'); setMediaFilter('전체') }}
              className="text-[12px] px-4 py-1.5 rounded-full transition-colors"
              style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.1)', color: 'rgba(var(--text-rgb),0.5)' }}
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div
            className={`grid gap-3 pb-3 ${boxDrag ? 'select-none' : ''}`}
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', maxWidth: 'calc(4 * 500px + 3 * 12px)' }}
          >
            {groups.map(([tag, items]) => {
              const own = customTags.includes(tag)   // 범주 목록에 있는 상자만 옮기기·이름변경·삭제
              const dropHere = boxDrag && boxDrop?.tag === tag && boxDrag !== tag
              return (
                <div key={tag} className="relative" style={{ opacity: boxDrag === tag ? 0.4 : 1 }}
                  ref={el => { if (el) boxEls.current.set(tag, el); else boxEls.current.delete(tag) }}>
                  {dropHere && (
                    <span aria-hidden className="absolute top-2 bottom-2 rounded-full z-20"
                      style={{ width: 3, background: 'var(--accent-primary)', [boxDrop!.after ? 'right' : 'left']: -8 }} />
                  )}
                  <LearningSection
                    tag={tag}
                    allTags={allTags}
                    resources={items}
                    onNavigate={id => router.push(`/learning/${id}`)}
                    onCycleStatus={cycleStatus}
                    onRenameTag={renameCategory}
                    coverColor={coverColorMap[tag] ?? NO_TAG_COLOR}
                    editable={own}
                    onHandlePointerDown={own ? e => startBoxDrag(e, tag) : undefined}
                    onDelete={own ? () => { void deleteCategory(tag) } : undefined}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
      </>)}
    </div>
  )
}
