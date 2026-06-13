'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
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
const LS_KEY = 'learning_custom_tags'
const MEDIA_ICONS: Record<string, string> = { '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌' }

function loadCustomTags(): string[] {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : DEFAULT_TAGS } catch { return DEFAULT_TAGS }
}
function saveCustomTags(t: string[]) { localStorage.setItem(LS_KEY, JSON.stringify(t)) }

export default function LearningPage() {
  const [resources, setResources] = useState<LearningResource[]>([])
  const [loading, setLoading] = useState(true)
  const [customTags, setCustomTags] = useState<string[]>([])
  const [collapsedColMedia, setCollapsedColMedia] = useState<Set<string>>(new Set())
  const [managingTags, setManagingTags] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [addingTitle, setAddingTitle] = useState('')
  const [showAddInput, setShowAddInput] = useState(false)
  const [addingInCol, setAddingInCol] = useState<string | null>(null)
  const [colAddTitle, setColAddTitle] = useState('')
  const [colAddSource, setColAddSource] = useState('')
  const [colAddNote, setColAddNote] = useState('')
  const [colAddMedia, setColAddMedia] = useState<string>('')
  const [siteShortcuts, setSiteShortcuts] = useState<{id: string; title: string; url: string}[]>([])
  const [showAddSite, setShowAddSite] = useState(false)
  const [newSiteTitle, setNewSiteTitle] = useState('')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
  const [editSiteTitle, setEditSiteTitle] = useState('')
  const [editSiteUrl, setEditSiteUrl] = useState('')
  const supabase = createClient()

  useEffect(() => {
    setCustomTags(loadCustomTags())
    supabase.from('learning_resources').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setResources((data ?? []) as LearningResource[]); setLoading(false) })
    try {
      const saved = localStorage.getItem('learning_site_shortcuts')
      if (saved) setSiteShortcuts(JSON.parse(saved))
    } catch {}
  }, [])

  function updateCustomTags(tags: string[]) { setCustomTags(tags); saveCustomTags(tags) }
  function addCustomTag() {
    const t = newTagInput.trim()
    if (!t || customTags.includes(t)) return
    updateCustomTags([...customTags, t]); setNewTagInput('')
  }

  async function handleAdd() {
    if (!addingTitle.trim()) { setShowAddInput(false); return }
    const { data } = await supabase.from('learning_resources')
      .insert({ title: addingTitle.trim(), source: '', notes: [], tags: [], media_type: null })
      .select().single()
    if (data) {
      setResources(prev => [data as LearningResource, ...prev])
      setAddingTitle('')
      setShowAddInput(false)
    }
  }

  async function handleColAdd(tag: string) {
    if (!colAddTitle.trim()) { setAddingInCol(null); setColAddTitle(''); setColAddSource(''); setColAddNote(''); setColAddMedia(''); return }
    const initTags = (tag === '미분류' || tag === '__new__') ? [] : [tag]
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

  function saveSiteShortcuts(list: {id: string; title: string; url: string}[]) {
    setSiteShortcuts(list)
    localStorage.setItem('learning_site_shortcuts', JSON.stringify(list))
  }

  function addSiteShortcut() {
    if (!newSiteUrl.trim()) return
    const url = newSiteUrl.startsWith('http') ? newSiteUrl : 'https://' + newSiteUrl
    const title = newSiteTitle.trim() || url
    saveSiteShortcuts([...siteShortcuts, { id: Date.now().toString(), title, url }])
    setNewSiteTitle(''); setNewSiteUrl(''); setShowAddSite(false)
  }

  function removeSiteShortcut(id: string) {
    saveSiteShortcuts(siteShortcuts.filter(s => s.id !== id))
  }

  function saveEditSiteShortcut() {
    if (!editSiteUrl.trim() || !editingSiteId) return
    const url = editSiteUrl.startsWith('http') ? editSiteUrl : 'https://' + editSiteUrl
    const title = editSiteTitle.trim() || url
    saveSiteShortcuts(siteShortcuts.map(s => s.id === editingSiteId ? { ...s, title, url } : s))
    setEditingSiteId(null); setEditSiteTitle(''); setEditSiteUrl('')
  }

  const tagCols = [...customTags, '미분류']

  const tagKanbanGroups = useMemo(() => {
    const cols = [...customTags, '미분류']
    const result: Record<string, LearningResource[]> = {}
    cols.forEach(tag => { result[tag] = [] })
    resources.forEach(r => {
      const tags = r.tags ?? []
      const firstKnown = tags.find(t => customTags.includes(t))
      const col = firstKnown ?? '미분류'
      ;(result[col] ?? result['미분류']).push(r)
    })
    return result
  }, [resources, customTags])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">학습자료</h1>
        <div className="flex gap-2">
          <button onClick={() => setManagingTags(p => !p)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${managingTags ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            태그 관리
          </button>
          <button onClick={() => setAddingInCol('__new__')}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            + 새 자료
          </button>
        </div>
      </div>

      {/* 태그 관리 */}
      {managingTags && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-5">
          <p className="text-xs font-semibold text-gray-500 mb-3">커스텀 태그</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {customTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1">
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
        <div className="bg-white rounded-xl border border-[#10B981]/30 p-5 mb-5 shadow-sm">
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
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${colAddMedia === type ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                {MEDIA_ICONS[type]} {type}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={resetColAdd} className="text-xs text-gray-400 px-3 py-1.5">취소</button>
              <button onClick={() => handleColAdd('__new__')} disabled={!colAddTitle.trim()}
                className="text-xs bg-gray-900 text-white px-4 py-1.5 rounded-lg disabled:opacity-30">저장</button>
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
                  className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:border-gray-400 hover:shadow-sm transition-all">
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
              className="text-xs text-gray-300 hover:text-gray-500 border border-dashed border-gray-200 hover:border-gray-300 rounded-full px-3 py-1.5 transition-colors">
              + 사이트 추가
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {tagCols.map((_, i) => <div key={i} className="flex-shrink-0 w-40 bg-white rounded-xl border border-gray-100 h-32 animate-pulse" />)}
        </div>
      ) : resources.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">학습자료가 없습니다</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tagCols.length}, minmax(160px, 1fr))`, gap: '12px' }}>
            {tagCols.map(tag => {
              const allColItems = tagKanbanGroups[tag] ?? []
              // 매체 타입별 그룹핑
              const mediaGroups = (() => {
                const map = new Map<string, LearningResource[]>()
                allColItems.forEach(r => {
                  const mt = r.media_type ?? '미지정'
                  if (!map.has(mt)) map.set(mt, [])
                  map.get(mt)!.push(r)
                })
                // 정해진 순서로 정렬, 없는 타입은 건너뜀
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
                <div key={tag}>
                  {/* 컬럼 헤더 */}
                  <div className="py-1.5 px-2 mb-3">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${TAG_STYLE[tag] ?? 'bg-gray-100 text-gray-500'}`}>
                      {tag}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">{allColItems.length}</span>
                  </div>
                  <div className="space-y-1">
                    {addingInCol === tag && (
                      <div className="bg-white rounded-xl border border-[#10B981]/30 px-3 py-3 shadow-sm mb-2">
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
                      <p className="text-xs text-gray-300 text-center py-8 bg-gray-50/60 rounded-xl border border-dashed border-gray-100">없음</p>
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
                                  <Link key={r.id} href={`/learning/${r.id}`} className="block">
                                    <div className="bg-white rounded-xl border border-gray-200 hover:border-[#10B981]/40 hover:shadow-sm px-3 py-3 transition-all">
                                      <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 break-all mb-1">{r.title}</p>
                                      {r.source && <p className="text-xs text-gray-400 truncate">출처: {r.source}</p>}
                                      {r.notes.length > 0 && <p className="text-xs text-gray-300 mt-1">{r.notes.length}노트</p>}
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

