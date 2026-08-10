'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { LearningResource } from '@/types'
import { useUserSetting } from '@/hooks/useUserSetting'
import LearningSearchToolbar, { type StatusFilter, type MediaFilter } from './LearningSearchToolbar'
import LearningSection from './LearningSection'
import { getStatus } from './LearningRow'

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
  const allTags = [...customTags, '미분류']
  const hasActiveFilter = search.trim() !== '' || statusFilter !== '전체' || mediaFilter !== '전체'
  const groups = useMemo(() => {
    const map = new Map<string, LearningResource[]>()
    allTags.forEach(t => map.set(t, []))
    filtered.forEach(r => {
      const tags = r.tags ?? []
      const cat  = tags.find(t => customTags.includes(t)) ?? '미분류'
      const key  = map.has(cat) ? cat : '미분류'
      map.get(key)!.push(r)
    })
    const entries = Array.from(map.entries())
    // 필터/검색 중이 아니면 자료가 없는 카테고리도 구조 확인용으로 노출
    return hasActiveFilter ? entries.filter(([, items]) => items.length > 0) : entries
  }, [filtered, customTags, hasActiveFilter])

  function renameTag(oldTag: string, newTag: string) {
    const name = newTag.trim()
    if (!name || name === oldTag || customTags.includes(name)) return
    saveCustomTags(customTags.map(t => t === oldTag ? name : t))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#0F1319' }}>

      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-start pt-6 pb-3">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: '#E2E8F0' }}>학습자료</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'rgba(226,232,240,0.35)' }}>아티클, 도서, 강의 등 학습 자료를 관리하세요.</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors"
            style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: '#9DBEF5' }}
          >
            + 새 자료
          </button>
        </div>
      </div>

      {/* 사이트 단축키 */}
      {siteShortcuts.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 pb-3 flex-wrap">
          <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.3)' }}>빠른 링크</span>
          {siteShortcuts.map(s => (
            <a
              key={s.id}
              href={s.url}
              target="_blank" rel="noopener noreferrer"
              className="text-[12px] px-3 py-1 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.6)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#E2E8F0')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(226,232,240,0.6)')}
            >
              {s.title}
            </a>
          ))}
        </div>
      )}

      {/* 새 자료 입력 폼 */}
      {adding && (
        <div
          className="flex-shrink-0 rounded-2xl px-5 py-4 mb-3 flex flex-col gap-2"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <input
            autoFocus
            value={addTitle}
            onChange={e => setAddTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); if (e.key === 'Escape') { setAdding(false); setAddTitle('') } }}
            placeholder="자료 제목 입력 후 Enter"
            className="w-full text-[13px] bg-transparent focus:outline-none placeholder:text-[rgba(226,232,240,0.3)]"
            style={{ color: '#E2E8F0' }}
          />
          <div className="flex gap-2">
            <input
              value={addSource}
              onChange={e => setAddSource(e.target.value)}
              placeholder="출처 URL"
              className="flex-1 text-[12px] px-3 py-1.5 rounded-lg bg-transparent focus:outline-none placeholder:text-[rgba(226,232,240,0.2)]"
              style={{ color: 'rgba(226,232,240,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <select
              value={addTag}
              onChange={e => setAddTag(e.target.value)}
              className="text-[12px] px-3 py-1.5 rounded-lg focus:outline-none [color-scheme:dark] [&>option]:bg-[#26282E]"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.7)' }}
            >
              <option value="">범주 선택</option>
              {customTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={handleAdd}
              className="text-[12px] px-4 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(76,127,224,0.2)', border: '1px solid rgba(76,127,224,0.3)', color: '#9DBEF5' }}
            >
              추가
            </button>
            <button
              onClick={() => { setAdding(false); setAddTitle('') }}
              className="text-[12px] px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(226,232,240,0.4)' }}
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
        customTags={customTags}     setCustomTags={saveCustomTags}
        total={filtered.length}
      />

      {/* 본문 — 한 행에 최대 4칸, 넘치면 다음 행으로 (가로 스크롤 없음) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-56 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-[13px]" style={{ color: 'rgba(226,232,240,0.3)' }}>조건에 맞는 자료가 없습니다</p>
            <button
              onClick={() => { setSearch(''); setStatusFilter('전체'); setMediaFilter('전체') }}
              className="text-[12px] px-4 py-1.5 rounded-full transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div
            className="grid gap-3 pb-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', maxWidth: 'calc(4 * 500px + 3 * 12px)' }}
          >
            {groups.map(([tag, items]) => (
              <LearningSection
                key={tag}
                tag={tag}
                allTags={allTags}
                resources={items}
                onNavigate={id => router.push(`/learning/${id}`)}
                onCycleStatus={cycleStatus}
                onRenameTag={renameTag}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
