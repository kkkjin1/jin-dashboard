'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import { EmptyState } from '@/components/ui/EmptyState'
import type { LearningResource } from '@/types'

const DEFAULT_TAGS = ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']
const TAG_BADGE: Record<string, string> = {
  'HR':      'bg-[#BADEC8]/50 text-[#2D5A45] border-[#BADEC8]/60',
  '경제':    'bg-[#90A7D8]/40 text-[#1E3A6B] border-[#90A7D8]/50',
  '리더십':  'bg-[#BFE4B5]/50 text-[#2D5A35] border-[#BFE4B5]/60',
  '평가보상':'bg-[#F3E482]/50 text-[#5A4A10] border-[#F3E482]/60',
  '데이터':  'bg-[#D3E69B]/50 text-[#3A4A10] border-[#D3E69B]/60',
  '조직문화':'bg-[#EBA698]/40 text-[#6B2D25] border-[#EBA698]/50',
  '기획':    'bg-slate-100/80 text-slate-600 border-slate-200',
  '미분류':  'bg-gray-100/80 text-gray-500 border-gray-200',
}
const MEDIA_TYPES = ['책', '영상', '아티클', '강의', '기타']
const MEDIA_ICONS: Record<string, string> = { '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌' }

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

type SiteShortcut = { id: string; title: string; url: string }

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-gray-900 text-white border-gray-900 shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

export default function LearningPage() {
  const [resources, setResources] = useState<LearningResource[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('전체')
  const { value: customTags, save: saveCustomTagsRemote } = useUserSetting<string[]>('learning_custom_tags', DEFAULT_TAGS)
  const { value: bucketNames, save: saveBucketNamesRemote } = useUserSetting<string[]>('learning_bucket_names', ['읽을 예정', '읽는 중', '완료'])
  const [collapsedColMedia, setCollapsedColMedia] = useState<Set<string>>(new Set())
  const [managingTags, setManagingTags] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [addingInCol, setAddingInCol] = useState<string | null>(null)
  const [colAddTitle, setColAddTitle] = useState('')
  const [colAddSource, setColAddSource] = useState('')
  const [colAddNote, setColAddNote] = useState('')
  const [colAddMedia, setColAddMedia] = useState<string>('')
  const { value: siteShortcuts, save: saveSiteShortcutsRemote } = useUserSetting<SiteShortcut[]>('learning_site_shortcuts', [])
  const [showAddSite, setShowAddSite] = useState(false)
  const [newSiteTitle, setNewSiteTitle] = useState('')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
  const [editSiteTitle, setEditSiteTitle] = useState('')
  const [editSiteUrl, setEditSiteUrl] = useState('')
  const [editingBucketIdx, setEditingBucketIdx] = useState<number | null>(null)
  const [editingBucketName, setEditingBucketName] = useState('')
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('learning_resources').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setResources((data ?? []) as LearningResource[]); setLoading(false) })
  }, [])

  function updateCustomTags(tags: string[]) { saveCustomTagsRemote(tags) }
  function addCustomTag() {
    const t = newTagInput.trim()
    if (!t || customTags.includes(t)) return
    updateCustomTags([...customTags, t]); setNewTagInput('')
  }

  async function handleColAdd(tag: string) {
    if (!colAddTitle.trim()) { setAddingInCol(null); setColAddTitle(''); setColAddSource(''); setColAddNote(''); setColAddMedia(''); return }
    const initTags = (tag === '미분류' || tag === '__new__') ? [] : tag.startsWith('_b') ? [tag] : [tag]
    const notes = colAddNote.trim()
      ? [{ title: '노트', content: colAddNote.trim(), created_at: new Date().toISOString() }]
      : []
    const { data } = await supabase.from('learning_resources')
      .insert({ title: colAddTitle.trim(), source: colAddSource.trim(), notes, tags: initTags, media_type: colAddMedia || null })
      .select().single()
    if (data) setResources(prev => [data as LearningResource, ...prev])
    setColAddTitle(''); setColAddSource(''); setColAddNote(''); setColAddMedia(''); setAddingInCol(null)
  }

  function resetColAdd() { setAddingInCol(null); setColAddTitle(''); setColAddSource(''); setColAddNote(''); setColAddMedia('') }

  function toggleColMedia(key: string) {
    setCollapsedColMedia(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  function saveSiteShortcuts(list: SiteShortcut[]) { saveSiteShortcutsRemote(list) }
  function addSiteShortcut() {
    if (!newSiteUrl.trim()) return
    const url = newSiteUrl.startsWith('http') ? newSiteUrl : 'https://' + newSiteUrl
    const title = newSiteTitle.trim() || url
    saveSiteShortcuts([...siteShortcuts, { id: Date.now().toString(), title, url }])
    setNewSiteTitle(''); setNewSiteUrl(''); setShowAddSite(false)
  }
  function removeSiteShortcut(id: string) { saveSiteShortcuts(siteShortcuts.filter(s => s.id !== id)) }
  function saveEditSiteShortcut() {
    if (!editSiteUrl.trim() || !editingSiteId) return
    const url = editSiteUrl.startsWith('http') ? editSiteUrl : 'https://' + editSiteUrl
    const title = editSiteTitle.trim() || url
    saveSiteShortcuts(siteShortcuts.map(s => s.id === editingSiteId ? { ...s, title, url } : s))
    setEditingSiteId(null); setEditSiteTitle(''); setEditSiteUrl('')
  }

  function saveBucketName(idx: number) {
    const name = editingBucketName.trim()
    if (!name) { setEditingBucketIdx(null); return }
    const names = [...(bucketNames ?? ['읽을 예정', '읽는 중', '완료'])]
    names[idx] = name
    saveBucketNamesRemote(names)
    setEditingBucketIdx(null)
  }

  async function moveToColumn(resourceId: string, targetCol: string) {
    const resource = resources.find(r => r.id === resourceId)
    if (!resource) return
    const currentTags = resource.tags ?? []
    const otherTags = currentTags.filter(t => !customTags.includes(t) && !t.startsWith('_b'))
    const newTags = targetCol === '미분류' ? otherTags : [targetCol, ...otherTags]
    await supabase.from('learning_resources').update({ tags: newTags }).eq('id', resourceId)
    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, tags: newTags } : r))
    setDragOverCol(null)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null)
  }

  const tagCols = [...customTags, '미분류']

  // 기간 필터 적용한 tag kanban
  const tagKanbanGroups = useMemo(() => {
    const periodFiltered = resources.filter(r => inPeriod(r.created_at, period))
    const cols = [...customTags, '미분류']
    const result: Record<string, LearningResource[]> = {}
    cols.forEach(tag => { result[tag] = [] })
    periodFiltered.forEach(r => {
      const tags = r.tags ?? []
      if (tags.some(t => t.startsWith('_b'))) return
      const firstKnown = tags.find(t => customTags.includes(t))
      const col = firstKnown ?? '미분류'
      ;(result[col] ?? result['미분류']).push(r)
    })
    return result
  }, [resources, customTags, period])

  const bucketGroups = useMemo(() => {
    return [0, 1, 2].map(i => resources.filter(r => (r.tags ?? []).includes(`_b${i}`)))
  }, [resources])

  const names = bucketNames ?? ['읽을 예정', '읽는 중', '완료']

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 mr-auto">학습자료</h1>
        <button onClick={() => setManagingTags(p => !p)}
          className={`${pill} ${managingTags ? pOn : pOff}`}>
          태그 관리
        </button>
        <button onClick={() => setAddingInCol('__new__')}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-sm">
          + 새 자료
        </button>
      </div>

      {/* 스크롤 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="pb-6 space-y-5">

          {/* 태그 관리 */}
          {managingTags && (
            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5">
              <p className="text-xs font-semibold text-gray-500 mb-3">커스텀 태그</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {customTags.map(tag => (
                  <span key={tag} className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 ${TAG_BADGE[tag] ?? 'bg-white/60 border-white/80 text-gray-500'}`}>
                    {tag}
                    <button onClick={() => updateCustomTags(customTags.filter(t => t !== tag))}
                      className="text-gray-300 hover:text-red-400 leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomTag() }}
                  placeholder="새 태그 입력 후 엔터"
                  className="flex-1 text-xs bg-white/50 border border-white/70 rounded-full px-3 py-1.5 focus:outline-none" />
                <button onClick={addCustomTag} className={`${pill} ${pOn}`}>추가</button>
              </div>
            </div>
          )}

          {/* 새 자료 추가 폼 */}
          {addingInCol === '__new__' && (
            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5">
              <input autoFocus value={colAddTitle} onChange={e => setColAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') resetColAdd() }}
                placeholder="제목 *"
                className="w-full text-sm font-semibold focus:outline-none text-gray-800 mb-3 border-b border-gray-100 pb-2 bg-transparent" />
              <input value={colAddSource} onChange={e => setColAddSource(e.target.value)}
                placeholder="출처 URL / 제목 (선택)"
                className="w-full text-xs focus:outline-none text-gray-500 mb-2 bg-transparent" />
              <textarea value={colAddNote} onChange={e => setColAddNote(e.target.value)}
                placeholder="노트 내용 (선택)" rows={2}
                className="w-full text-xs focus:outline-none resize-none text-gray-500 leading-relaxed border-b border-gray-100 pb-2 mb-3 bg-transparent" />
              <div className="flex items-center gap-2 flex-wrap">
                {MEDIA_TYPES.map(type => (
                  <button key={type} onClick={() => setColAddMedia(colAddMedia === type ? '' : type)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${colAddMedia === type ? pOn : pOff}`}>
                    {MEDIA_ICONS[type]} {type}
                  </button>
                ))}
                <div className="ml-auto flex gap-2">
                  <button onClick={resetColAdd} className={`${pill} ${pOff}`}>취소</button>
                  <button onClick={() => handleColAdd('__new__')} disabled={!colAddTitle.trim()} className={`${pill} ${pOn} disabled:opacity-30`}>저장</button>
                </div>
              </div>
            </div>
          )}

          {/* 자주 가는 사이트 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">자주 가는 사이트</p>
            <div className="flex gap-2 flex-wrap items-center">
              {siteShortcuts.map(s => {
                if (editingSiteId === s.id) {
                  return (
                    <div key={s.id} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 p-2.5 w-44 shadow-sm">
                      <input value={editSiteTitle} onChange={e => setEditSiteTitle(e.target.value)}
                        placeholder="이름" autoFocus
                        className="text-sm font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
                      <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEditSiteShortcut(); if (e.key === 'Escape') setEditingSiteId(null) }}
                        placeholder="URL"
                        className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
                      <div className="flex gap-1 mt-2 justify-end">
                        <button onClick={() => setEditingSiteId(null)} className={`${pill} ${pOff} !text-[10px] !px-2 !py-1`}>취소</button>
                        <button onClick={saveEditSiteShortcut} className={`${pill} ${pOn} !text-[10px] !px-2 !py-1`}>저장</button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={s.id} className="group relative">
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-white/40 backdrop-blur-xl border border-white/60 rounded-full px-3 py-1.5 hover:bg-white/60 hover:shadow-sm transition-all">
                      <span className="text-xs font-medium text-gray-700 truncate max-w-28">🔗 {s.title}</span>
                    </a>
                    <div className="absolute -top-1.5 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button onClick={() => { setEditingSiteId(s.id); setEditSiteTitle(s.title); setEditSiteUrl(s.url); setShowAddSite(false) }}
                        className="w-4 h-4 bg-[#90A7D8] text-white rounded-full text-[9px] flex items-center justify-center hover:bg-[#1E3A6B]">✎</button>
                      <button onClick={() => removeSiteShortcut(s.id)}
                        className="w-4 h-4 bg-gray-300 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-400">×</button>
                    </div>
                  </div>
                )
              })}
              {showAddSite ? (
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 p-2.5 w-44 shadow-sm">
                  <input value={newSiteTitle} onChange={e => setNewSiteTitle(e.target.value)}
                    placeholder="이름 (필수)" autoFocus
                    className="text-sm font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
                  <input value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSiteShortcut(); if (e.key === 'Escape') setShowAddSite(false) }}
                    placeholder="URL"
                    className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
                  <div className="flex gap-1 mt-2 justify-end">
                    <button onClick={() => setShowAddSite(false)} className={`${pill} ${pOff} !text-[10px] !px-2 !py-1`}>취소</button>
                    <button onClick={addSiteShortcut} className={`${pill} ${pOn} !text-[10px] !px-2 !py-1`}>추가</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setShowAddSite(true); setEditingSiteId(null) }}
                  className="text-xs text-gray-300 hover:text-gray-500 border border-dashed border-white/50 hover:border-white/70 rounded-full px-3 py-1.5 transition-colors bg-white/20">
                  + 사이트 추가
                </button>
              )}
            </div>
          </div>

          {/* 3개 버킷 칸반 */}
          {!loading && (
            <div className="grid grid-cols-3 gap-4">
              {([0, 1, 2] as const).map(i => {
                const colId = `_b${i}`
                const items = bucketGroups[i]
                const isDragOver = dragOverCol === colId
                return (
                  <div key={i}
                    className={`bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4 min-h-[140px] transition-all flex flex-col ${isDragOver ? 'bg-white/60 border-white/80' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOverCol(colId) }}
                    onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('resourceId'); if (id) moveToColumn(id, colId) }}
                    onDragLeave={handleDragLeave}
                  >
                    <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                      {editingBucketIdx === i ? (
                        <input
                          autoFocus
                          value={editingBucketName}
                          onChange={e => setEditingBucketName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveBucketName(i); if (e.key === 'Escape') setEditingBucketIdx(null) }}
                          onBlur={() => saveBucketName(i)}
                          className="flex-1 text-sm font-bold text-gray-800 focus:outline-none border-b-2 border-gray-400 pb-0.5 bg-transparent"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingBucketIdx(i); setEditingBucketName(names[i] ?? `버킷 ${i + 1}`) }}
                          className="flex-1 text-left text-sm font-bold text-gray-800 hover:text-gray-600 transition-colors group"
                        >
                          {names[i] ?? `버킷 ${i + 1}`}
                          <span className="text-[10px] text-gray-300 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
                        </button>
                      )}
                      {items.length > 0 && (
                        <span className="text-xs text-gray-400 bg-white/60 border border-white/70 px-2 py-0.5 rounded-full flex-shrink-0">{items.length}</span>
                      )}
                    </div>
                    <div className="space-y-1.5 flex-1">
                      {items.length === 0 ? (
                        <p className="text-xs text-gray-300 text-center py-6">{isDragOver ? '여기에 놓기' : '없음'}</p>
                      ) : items.map(r => (
                        <div
                          key={r.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('resourceId', r.id) }}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <Link href={`/learning/${r.id}`} className="block">
                            <div className="bg-white/50 rounded-2xl border border-white/70 hover:bg-white/70 hover:shadow-sm px-3 py-2.5 transition-all">
                              <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{r.title}</p>
                              {r.source && <p className="text-xs text-gray-400 truncate mt-0.5">출처: {r.source}</p>}
                              {r.notes.length > 0 && <p className="text-xs text-gray-300 mt-0.5">{r.notes.length}노트</p>}
                            </div>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 태그별 자료 — 계층형 그리드 */}
          <div className="pt-2 border-t border-white/40">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-xs font-semibold text-gray-500">태그별 자료</span>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {PERIODS.map(p => (
                  <button key={p} onClick={() => setPeriod(p)} className={`${pill} ${period === p ? pOn : pOff} !text-[10px] !px-2.5 !py-1`}>{p}</button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map(i => <div key={i} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl h-32 animate-pulse" />)}
            </div>
          ) : resources.filter(r => !(r.tags ?? []).some(t => t.startsWith('_b'))).length === 0 && bucketGroups.every(g => g.length === 0) ? (
            <EmptyState
              icon="learning"
              title="아직 학습 자료가 없어요"
              description="책, 아티클, 강의 등 기록하고 싶은 자료를 추가해보세요"
            />
          ) : (
            <>
              {/* 빈 카테고리 컴팩트 필 로우 */}
              {(() => {
                const emptyTags = tagCols.filter(t => (tagKanbanGroups[t] ?? []).length === 0)
                if (emptyTags.length === 0) return null
                return (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {emptyTags.map(tag => (
                      <button key={tag} onClick={() => setAddingInCol(tag)}
                        className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 opacity-50 hover:opacity-80 transition-opacity ${TAG_BADGE[tag] ?? 'bg-gray-100/80 text-gray-500 border-gray-200'}`}>
                        {tag} <span className="text-[10px]">+</span>
                      </button>
                    ))}
                  </div>
                )
              })()}

              {/* 태그 섹션별 그리드 */}
              {tagCols.map(tag => {
                const colItems = tagKanbanGroups[tag] ?? []
                if (colItems.length === 0) return null
                const featured = colItems.filter(r => r.notes.length > 0)
                const basic    = colItems.filter(r => r.notes.length === 0)
                return (
                  <div key={tag} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TAG_BADGE[tag] ?? 'bg-gray-100/80 text-gray-500 border-gray-200'}`}>{tag}</span>
                      <span className="text-xs text-gray-400">{colItems.length}개</span>
                      <button onClick={() => setAddingInCol(tag)}
                        className="ml-auto text-xs text-gray-300 hover:text-gray-600 border border-dashed border-white/50 hover:border-white/70 rounded-full px-2.5 py-0.5 transition-colors bg-white/20">
                        + 추가
                      </button>
                    </div>

                    {addingInCol === tag && (
                      <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5 mb-3">
                        <input autoFocus value={colAddTitle} onChange={e => setColAddTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') resetColAdd() }}
                          placeholder="제목 *"
                          className="w-full text-sm font-semibold focus:outline-none text-gray-800 mb-2 border-b border-white/60 pb-2 bg-transparent" />
                        <input value={colAddSource} onChange={e => setColAddSource(e.target.value)}
                          placeholder="출처 URL / 제목 (선택)"
                          className="w-full text-xs focus:outline-none text-gray-500 mb-2 bg-transparent" />
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          {MEDIA_TYPES.map(type => (
                            <button key={type} onClick={() => setColAddMedia(colAddMedia === type ? '' : type)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${colAddMedia === type ? pOn : pOff}`}>
                              {MEDIA_ICONS[type]} {type}
                            </button>
                          ))}
                          <div className="ml-auto flex gap-2">
                            <button onClick={resetColAdd} className={`${pill} ${pOff}`}>취소</button>
                            <button onClick={() => handleColAdd(tag)} disabled={!colAddTitle.trim()} className={`${pill} ${pOn} disabled:opacity-30`}>저장</button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className={`grid gap-3 ${colItems.length > 4 ? 'grid-cols-3 md:grid-cols-4' : colItems.length > 1 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1'}`}
                      onDragOver={e => { e.preventDefault(); setDragOverCol(tag) }}
                      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('resourceId'); if (id) moveToColumn(id, tag) }}
                      onDragLeave={handleDragLeave}>
                      {featured.map(r => (
                        <div key={r.id} className="cursor-grab active:cursor-grabbing"
                          draggable onDragStart={e => { e.dataTransfer.setData('resourceId', r.id) }}>
                          <Link href={`/learning/${r.id}`} className="block aspect-square">
                            <div className="bg-white/50 backdrop-blur-xl border border-white/70 hover:bg-white/70 hover:shadow-md rounded-3xl p-4 transition-all aspect-square flex flex-col justify-between overflow-hidden">
                              <div className="flex items-start justify-between gap-1">
                                {r.media_type && <span className="text-xl flex-shrink-0">{MEDIA_ICONS[r.media_type]}</span>}
                                <span className="text-[10px] text-gray-400 bg-white/60 border border-white/70 px-1.5 py-0.5 rounded-full flex-shrink-0 ml-auto">{r.notes.length}노트</span>
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-3 mb-1">{r.title}</p>
                                {r.source && <p className="text-[10px] text-gray-400 truncate">출처: {r.source}</p>}
                              </div>
                            </div>
                          </Link>
                        </div>
                      ))}
                      {basic.map(r => (
                        <div key={r.id} className="cursor-grab active:cursor-grabbing"
                          draggable onDragStart={e => { e.dataTransfer.setData('resourceId', r.id) }}>
                          <Link href={`/learning/${r.id}`} className="block aspect-square">
                            <div className="bg-white/40 backdrop-blur-xl border border-white/60 hover:bg-white/60 hover:shadow-sm rounded-3xl p-4 transition-all aspect-square flex flex-col justify-between overflow-hidden">
                              <div className="flex items-start justify-between">
                                {r.media_type && <span className="text-lg">{MEDIA_ICONS[r.media_type]}</span>}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-3">{r.title}</p>
                                {r.source && <p className="text-[10px] text-gray-400 truncate mt-1">출처: {r.source}</p>}
                              </div>
                            </div>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
