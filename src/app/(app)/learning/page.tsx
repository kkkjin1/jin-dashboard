'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import { EmptyState } from '@/components/ui/EmptyState'
import type { LearningResource } from '@/types'

const DEFAULT_TAGS = ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']
const TAG_STYLE: Record<string, string> = {
  'HR':   'bg-emerald-50 text-emerald-700',
  '경제': 'bg-blue-50 text-blue-700',
  '리더십': 'bg-violet-50 text-violet-700',
  '평가보상': 'bg-amber-50 text-amber-700',
  '데이터': 'bg-cyan-50 text-cyan-700',
  '조직문화': 'bg-teal-50 text-teal-700',
  '기획': 'bg-slate-100 text-slate-600',
  '미분류': 'bg-gray-100 text-gray-500',
}
const MEDIA_TYPES = ['책', '영상', '아티클', '강의', '기타']
const MEDIA_ICONS: Record<string, string> = { '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌' }

type SiteShortcut = { id: string; title: string; url: string }

export default function LearningPage() {
  const [resources, setResources] = useState<LearningResource[]>([])
  const [loading, setLoading] = useState(true)
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

  const tagKanbanGroups = useMemo(() => {
    const cols = [...customTags, '미분류']
    const result: Record<string, LearningResource[]> = {}
    cols.forEach(tag => { result[tag] = [] })
    resources.forEach(r => {
      const tags = r.tags ?? []
      if (tags.some(t => t.startsWith('_b'))) return
      const firstKnown = tags.find(t => customTags.includes(t))
      const col = firstKnown ?? '미분류'
      ;(result[col] ?? result['미분류']).push(r)
    })
    return result
  }, [resources, customTags])

  const bucketGroups = useMemo(() => {
    return [0, 1, 2].map(i => resources.filter(r => (r.tags ?? []).includes(`_b${i}`)))
  }, [resources])

  const names = bucketNames ?? ['읽을 예정', '읽는 중', '완료']

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">학습자료</h1>
        <div className="flex gap-2">
          <button onClick={() => setManagingTags(p => !p)}
            className={`text-xs px-3 py-2 rounded-md border transition-colors ${managingTags ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            태그 관리
          </button>
          <button onClick={() => setAddingInCol('__new__')}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors">
            + 새 자료
          </button>
        </div>
      </div>

      {/* 태그 관리 */}
      {managingTags && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-5">
          <p className="text-xs font-semibold text-gray-500 mb-3">커스텀 태그</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {customTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded px-2.5 py-1">
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
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white" />
            <button onClick={addCustomTag}
              className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">추가</button>
          </div>
        </div>
      )}

      {/* 새 자료 추가 폼 */}
      {addingInCol === '__new__' && (
        <div className="bg-white rounded-lg border border-[#10B981]/30 p-5 mb-5 shadow-sm">
          <input autoFocus value={colAddTitle} onChange={e => setColAddTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') resetColAdd() }}
            placeholder="제목 *"
            className="w-full text-sm font-semibold focus:outline-none text-gray-800 mb-3 border-b border-gray-100 pb-2" />
          <input value={colAddSource} onChange={e => setColAddSource(e.target.value)}
            placeholder="출처 URL / 제목 (선택)"
            className="w-full text-xs focus:outline-none text-gray-500 mb-2" />
          <textarea value={colAddNote} onChange={e => setColAddNote(e.target.value)}
            placeholder="노트 내용 (선택)" rows={2}
            className="w-full text-xs focus:outline-none resize-none text-gray-500 leading-relaxed border-b border-gray-100 pb-2 mb-3" />
          <div className="flex items-center gap-2 flex-wrap">
            {MEDIA_TYPES.map(type => (
              <button key={type} onClick={() => setColAddMedia(colAddMedia === type ? '' : type)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${colAddMedia === type ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                {MEDIA_ICONS[type]} {type}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={resetColAdd} className="text-xs text-gray-400 px-3 py-1.5">취소</button>
              <button onClick={() => handleColAdd('__new__')} disabled={!colAddTitle.trim()}
                className="text-xs bg-gray-900 text-white px-4 py-1.5 rounded-md disabled:opacity-30">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 자주 가는 사이트 */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 mb-2">자주 가는 사이트</p>
        <div className="flex gap-2 flex-wrap items-center">
          {siteShortcuts.map(s => {
            if (editingSiteId === s.id) {
              return (
                <div key={s.id} className="bg-white rounded-xl border border-blue-300 p-2.5 w-44 shadow-sm">
                  <input value={editSiteTitle} onChange={e => setEditSiteTitle(e.target.value)}
                    placeholder="이름" autoFocus
                    className="text-sm font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
                  <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEditSiteShortcut(); if (e.key === 'Escape') setEditingSiteId(null) }}
                    placeholder="URL"
                    className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
                  <div className="flex gap-1 mt-2 justify-end">
                    <button onClick={() => setEditingSiteId(null)} className="text-xs text-gray-400 px-2 py-0.5">취소</button>
                    <button onClick={saveEditSiteShortcut} className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-lg">저장</button>
                  </div>
                </div>
              )
            }
            return (
              <div key={s.id} className="group relative">
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:border-gray-400 hover:shadow-sm transition-all">
                  <span className="text-xs font-medium text-gray-700 truncate max-w-28">🔗 {s.title}</span>
                </a>
                <div className="absolute -top-1.5 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => { setEditingSiteId(s.id); setEditSiteTitle(s.title); setEditSiteUrl(s.url); setShowAddSite(false) }}
                    className="w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-blue-600">✎</button>
                  <button onClick={() => removeSiteShortcut(s.id)}
                    className="w-4 h-4 bg-gray-400 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-500">×</button>
                </div>
              </div>
            )
          })}
          {showAddSite ? (
            <div className="bg-white rounded-xl border border-blue-300 p-2.5 w-44 shadow-sm">
              <input value={newSiteTitle} onChange={e => setNewSiteTitle(e.target.value)}
                placeholder="이름 (필수)" autoFocus
                className="text-sm font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
              <input value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSiteShortcut(); if (e.key === 'Escape') setShowAddSite(false) }}
                placeholder="URL"
                className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
              <div className="flex gap-1 mt-2 justify-end">
                <button onClick={() => setShowAddSite(false)} className="text-xs text-gray-400 px-2 py-0.5">취소</button>
                <button onClick={addSiteShortcut} className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-lg">추가</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setShowAddSite(true); setEditingSiteId(null) }}
              className="text-xs text-gray-300 hover:text-gray-500 border border-dashed border-gray-200 hover:border-gray-300 rounded-md px-3 py-1.5 transition-colors">
              + 사이트 추가
            </button>
          )}
        </div>
      </div>

      {/* 3개 버킷 칸반 */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {([0, 1, 2] as const).map(i => {
            const colId = `_b${i}`
            const items = bucketGroups[i]
            const isDragOver = dragOverCol === colId
            return (
              <div key={i}
                className={`rounded-xl border-2 p-4 min-h-[160px] transition-colors flex flex-col ${isDragOver ? 'border-emerald-400 bg-emerald-50/30' : 'bg-white border-gray-100'}`}
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
                      className="flex-1 text-sm font-bold text-gray-800 focus:outline-none border-b-2 border-emerald-400 pb-0.5 bg-transparent"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingBucketIdx(i); setEditingBucketName(names[i] ?? `버킷 ${i + 1}`) }}
                      className="flex-1 text-left text-sm font-bold text-gray-800 hover:text-emerald-600 transition-colors group"
                    >
                      {names[i] ?? `버킷 ${i + 1}`}
                      <span className="text-[10px] text-gray-300 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
                    </button>
                  )}
                  {items.length > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">{items.length}</span>
                  )}
                </div>
                <div className="space-y-1.5 flex-1">
                  {items.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-8">{isDragOver ? '여기에 놓기' : '없음'}</p>
                  ) : items.map(r => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('resourceId', r.id) }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <Link href={`/learning/${r.id}`} className="block">
                        <div className="bg-gray-50 rounded-lg border border-gray-100 hover:border-emerald-200 hover:shadow-sm px-3 py-2.5 transition-all">
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

      {/* 태그 칸반 */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {tagCols.map((_, i) => <div key={i} className="flex-shrink-0 w-40 bg-white rounded-xl border border-gray-100 h-32 animate-pulse" />)}
        </div>
      ) : resources.filter(r => !(r.tags ?? []).some(t => t.startsWith('_b'))).length === 0 && bucketGroups.every(g => g.length === 0) ? (
        <EmptyState
          icon="learning"
          title="아직 학습 자료가 없어요"
          description="책, 아티클, 강의 등 기록하고 싶은 자료를 추가해보세요"
        />
      ) : (
        <>
          {/* 모바일: 태그별 세로 섹션 */}
          <div className="md:hidden space-y-3 pb-4">
            {tagCols.map(tag => {
              const colItems = tagKanbanGroups[tag] ?? []
              return (
                <div key={tag} className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded ${TAG_STYLE[tag] ?? 'bg-gray-100 text-gray-500'}`}>{tag}</span>
                    <span className="text-xs text-gray-400">{colItems.length}</span>
                  </div>
                  {colItems.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-3">없음</p>
                  ) : (
                    <div className="space-y-1.5">
                      {colItems.map(r => (
                        <Link key={r.id} href={`/learning/${r.id}`} className="block">
                          <div className="bg-gray-50 rounded-md px-3 py-2.5">
                            <p className="text-sm font-medium text-gray-800 leading-snug break-words">{r.title}</p>
                            {r.media_type && <p className="text-xs text-gray-400 mt-0.5">{MEDIA_ICONS[r.media_type]} {r.media_type}</p>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 데스크톱: 가로 칸반 */}
          <div className="hidden md:block overflow-x-auto pb-4">
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tagCols.length}, minmax(150px, 1fr))`, gap: '12px' }}>
              {tagCols.map(tag => {
                const allColItems = tagKanbanGroups[tag] ?? []
                const isDragOverTag = dragOverCol === tag
                const mediaGroups = (() => {
                  const map = new Map<string, LearningResource[]>()
                  allColItems.forEach(r => {
                    const mt = r.media_type ?? '미지정'
                    if (!map.has(mt)) map.set(mt, [])
                    map.get(mt)!.push(r)
                  })
                  const result: [string, LearningResource[]][] = []
                  ;[...MEDIA_TYPES, '미지정'].forEach(mt => {
                    if (map.has(mt)) result.push([mt, map.get(mt)!])
                  })
                  map.forEach((list, mt) => {
                    if (![...MEDIA_TYPES, '미지정'].includes(mt)) result.push([mt, list])
                  })
                  return result
                })()
                return (
                  <div key={tag}
                    className={`flex flex-col rounded-xl transition-colors ${isDragOverTag ? 'bg-emerald-50/40 ring-1 ring-emerald-200' : ''}`}
                    style={{ minHeight: 'calc(100vh - 280px)' }}
                    onDragOver={e => { e.preventDefault(); setDragOverCol(tag) }}
                    onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('resourceId'); if (id) moveToColumn(id, tag) }}
                    onDragLeave={handleDragLeave}
                  >
                    <div className="py-1.5 px-2 mb-3">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded ${TAG_STYLE[tag] ?? 'bg-gray-100 text-gray-500'}`}>
                        {tag}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">{allColItems.length}</span>
                    </div>
                    <div className="space-y-1 flex-1 px-1">
                      {addingInCol === tag && (
                        <div className="bg-white rounded-lg border border-[#10B981]/30 px-3 py-3 shadow-sm mb-2">
                          <input autoFocus value={colAddTitle} onChange={e => setColAddTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') resetColAdd() }}
                            placeholder="제목 *"
                            className="w-full text-sm font-semibold focus:outline-none text-gray-800 mb-2 border-b border-gray-100 pb-1" />
                          <input value={colAddSource} onChange={e => setColAddSource(e.target.value)}
                            placeholder="출처 (선택)"
                            className="w-full text-xs focus:outline-none text-gray-500 mb-2" />
                          <div className="flex items-center gap-1 flex-wrap mb-2">
                            {MEDIA_TYPES.map(type => (
                              <button key={type} onClick={() => setColAddMedia(colAddMedia === type ? '' : type)}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${colAddMedia === type ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-400'}`}>
                                {MEDIA_ICONS[type]} {type}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1 justify-end">
                            <button onClick={resetColAdd} className="text-xs text-gray-400 px-2 py-1">취소</button>
                            <button onClick={() => handleColAdd(tag)} disabled={!colAddTitle.trim()}
                              className="text-xs bg-gray-900 text-white px-2 py-1 rounded-lg disabled:opacity-30">저장</button>
                          </div>
                        </div>
                      )}
                      {allColItems.length === 0 && addingInCol !== tag ? (
                        <p className="text-xs text-gray-300 text-center py-8 bg-gray-50/60 rounded-lg border border-dashed border-gray-100">
                          {isDragOverTag ? '여기에 놓기' : '없음'}
                        </p>
                      ) : (
                        mediaGroups.map(([mt, list]) => {
                          const mediaKey = `${tag}-${mt}`
                          const isCollapsed = collapsedColMedia.has(mediaKey)
                          const icon = MEDIA_ICONS[mt] ?? '📌'
                          return (
                            <div key={mt} className="mb-1">
                              <button onClick={() => toggleColMedia(mediaKey)}
                                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 w-full py-1 px-1 rounded transition-colors">
                                <span className="text-[9px]">{isCollapsed ? '▶' : '▼'}</span>
                                <span>{icon} {mt}</span>
                                <span className="text-gray-300">({list.length})</span>
                              </button>
                              {!isCollapsed && (
                                <div className="space-y-1.5 mt-1">
                                  {list.map(r => (
                                    <div
                                      key={r.id}
                                      draggable
                                      onDragStart={e => { e.dataTransfer.setData('resourceId', r.id) }}
                                      className="cursor-grab active:cursor-grabbing"
                                    >
                                      <Link href={`/learning/${r.id}`} className="block">
                                        <div className="bg-white rounded-lg border border-gray-200 hover:border-[#10B981]/40 hover:shadow-sm px-3 py-3 transition-all">
                                          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 break-all mb-1">{r.title}</p>
                                          {r.source && <p className="text-xs text-gray-400 truncate">출처: {r.source}</p>}
                                          {r.notes.length > 0 && <p className="text-xs text-gray-300 mt-1">{r.notes.length}노트</p>}
                                        </div>
                                      </Link>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                      {addingInCol !== tag && (
                        <button onClick={() => setAddingInCol(tag)}
                          className="w-full text-xs text-gray-300 hover:text-gray-500 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-center">
                          + 추가
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
