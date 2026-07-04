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

type SiteShortcut = { id: string; title: string; url: string }

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-gray-900 text-white border-gray-900 shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

export default function LearningPage() {
  const [resources, setResources] = useState<LearningResource[]>([])
  const [loading, setLoading] = useState(true)

  const { value: customTags, save: saveCustomTagsRemote } = useUserSetting<string[]>('learning_custom_tags', DEFAULT_TAGS)
  const { value: siteShortcuts, save: saveSiteShortcutsRemote } = useUserSetting<SiteShortcut[]>('learning_site_shortcuts', [])

  // 카드 추가 폼
  const [addingInCol, setAddingInCol] = useState<string | null>(null)
  const [colAddTitle, setColAddTitle] = useState('')
  const [colAddSource, setColAddSource] = useState('')
  const [colAddMedia, setColAddMedia] = useState<string>('')

  // 범주 관리
  const [newTagInput, setNewTagInput] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)

  // 완료 섹션 토글 (per tag)
  const [showDoneForTag, setShowDoneForTag] = useState<Set<string>>(new Set())

  // 드래그
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)

  // 사이트 단축키
  const [showAddSite, setShowAddSite] = useState(false)
  const [newSiteTitle, setNewSiteTitle] = useState('')
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
  const [editSiteTitle, setEditSiteTitle] = useState('')
  const [editSiteUrl, setEditSiteUrl] = useState('')

  const supabase = createClient()

  useEffect(() => {
    supabase.from('learning_resources').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setResources((data ?? []) as LearningResource[]); setLoading(false) })
  }, [])

  // ── 범주 CRUD ──────────────────────────────────────────
  function addCustomTag() {
    const t = newTagInput.trim()
    if (!t || customTags.includes(t)) return
    saveCustomTagsRemote([...customTags, t])
    setNewTagInput(''); setShowAddTag(false)
  }

  function removeTag(tag: string) {
    if (!confirm(`"${tag}" 범주를 삭제하시겠습니까?\n해당 범주의 자료는 미분류로 이동됩니다.`)) return
    saveCustomTagsRemote(customTags.filter(t => t !== tag))
  }

  // ── 자료 추가 ──────────────────────────────────────────
  async function handleColAdd(tag: string) {
    if (!colAddTitle.trim()) { resetColAdd(); return }
    const initTags = tag === '미분류' ? [] : [tag]
    const { data } = await supabase.from('learning_resources')
      .insert({ title: colAddTitle.trim(), source: colAddSource.trim(), notes: [], tags: initTags, media_type: colAddMedia || null })
      .select().single()
    if (data) setResources(prev => [data as LearningResource, ...prev])
    resetColAdd()
  }

  function resetColAdd() { setAddingInCol(null); setColAddTitle(''); setColAddSource(''); setColAddMedia('') }

  // ── 완료 상태 토글 ─────────────────────────────────────
  async function toggleDoneStatus(resourceId: string, done: boolean) {
    const resource = resources.find(r => r.id === resourceId)
    if (!resource) return
    const withoutDone = (resource.tags ?? []).filter(t => t !== '_done')
    const newTags = done ? [...withoutDone, '_done'] : withoutDone
    await supabase.from('learning_resources').update({ tags: newTags }).eq('id', resourceId)
    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, tags: newTags } : r))
    setDragOverTarget(null)
  }

  function toggleDoneSection(tag: string) {
    setShowDoneForTag(prev => { const s = new Set(prev); s.has(tag) ? s.delete(tag) : s.add(tag); return s })
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTarget(null)
  }

  // ── 사이트 단축키 ──────────────────────────────────────
  function saveSiteShortcuts(list: SiteShortcut[]) { saveSiteShortcutsRemote(list) }
  function addSiteShortcut() {
    if (!newSiteUrl.trim()) return
    const url = newSiteUrl.startsWith('http') ? newSiteUrl : 'https://' + newSiteUrl
    saveSiteShortcuts([...siteShortcuts, { id: Date.now().toString(), title: newSiteTitle.trim() || url, url }])
    setNewSiteTitle(''); setNewSiteUrl(''); setShowAddSite(false)
  }
  function removeSiteShortcut(id: string) { saveSiteShortcuts(siteShortcuts.filter(s => s.id !== id)) }
  function saveEditSiteShortcut() {
    if (!editSiteUrl.trim() || !editingSiteId) return
    const url = editSiteUrl.startsWith('http') ? editSiteUrl : 'https://' + editSiteUrl
    saveSiteShortcuts(siteShortcuts.map(s => s.id === editingSiteId ? { ...s, title: editSiteTitle.trim() || url, url } : s))
    setEditingSiteId(null); setEditSiteTitle(''); setEditSiteUrl('')
  }

  // ── 데이터 그루핑 ──────────────────────────────────────
  const tagCols = [...customTags, '미분류']

  const tagGroups = useMemo(() => {
    const result: Record<string, { active: LearningResource[], done: LearningResource[] }> = {}
    tagCols.forEach(col => { result[col] = { active: [], done: [] } })
    resources.forEach(r => {
      const tags = r.tags ?? []
      const firstKnown = tags.find(t => customTags.includes(t))
      const col = firstKnown ?? '미분류'
      const isDone = tags.includes('_done')
      const target = result[col] ?? result['미분류']
      isDone ? target.done.push(r) : target.active.push(r)
    })
    return result
  }, [resources, customTags])

  const totalCount = resources.length

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 mr-auto">학습자료</h1>
        <span className="text-xs text-gray-400">{totalCount}개</span>
        <button onClick={() => setAddingInCol('__new__')}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-sm">
          + 새 자료
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="pb-6 space-y-6">

          {/* 새 자료 빠른 추가 */}
          {addingInCol === '__new__' && (
            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5">
              <input autoFocus value={colAddTitle} onChange={e => setColAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') resetColAdd() }}
                placeholder="제목 *"
                className="w-full text-sm font-semibold focus:outline-none text-gray-800 mb-3 border-b border-white/60 pb-2 bg-transparent" />
              <input value={colAddSource} onChange={e => setColAddSource(e.target.value)}
                placeholder="출처 URL / 제목 (선택)"
                className="w-full text-xs focus:outline-none text-gray-500 mb-3 bg-transparent" />
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {MEDIA_TYPES.map(type => (
                  <button key={type} onClick={() => setColAddMedia(colAddMedia === type ? '' : type)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${colAddMedia === type ? pOn : pOff}`}>
                    {MEDIA_ICONS[type]} {type}
                  </button>
                ))}
                <div className="ml-auto flex gap-2">
                  <button onClick={resetColAdd} className={`${pill} ${pOff}`}>취소</button>
                  <button onClick={() => handleColAdd('미분류')} disabled={!colAddTitle.trim()} className={`${pill} ${pOn} disabled:opacity-30`}>저장</button>
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
                      <button onClick={() => { setEditingSiteId(s.id); setEditSiteTitle(s.title); setEditSiteUrl(s.url) }}
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
                    placeholder="이름" autoFocus
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

          {/* 범주별 섹션 */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl h-28 animate-pulse" />)}
            </div>
          ) : totalCount === 0 ? (
            <EmptyState icon="learning" title="아직 학습 자료가 없어요" description="책, 아티클, 강의 등 기록하고 싶은 자료를 추가해보세요" />
          ) : (
            <>
              {tagCols.map(tag => {
                const { active, done } = tagGroups[tag] ?? { active: [], done: [] }
                const total = active.length + done.length
                if (total === 0 && tag === '미분류') return null
                const isDoneOpen = showDoneForTag.has(tag)
                const activeTarget = `${tag}:active`
                const doneTarget = `${tag}:done`

                return (
                  <div key={tag} className="border-t border-white/40 pt-4">
                    {/* 범주 헤더 */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TAG_BADGE[tag] ?? 'bg-gray-100/80 text-gray-500 border-gray-200'}`}>{tag}</span>
                      <span className="text-xs text-gray-400">{total}개</span>
                      <button onClick={() => setAddingInCol(tag)}
                        className="text-xs text-gray-300 hover:text-gray-600 border border-dashed border-white/50 hover:border-white/70 rounded-full px-2.5 py-0.5 transition-colors bg-white/20">
                        + 추가
                      </button>
                      {tag !== '미분류' && (
                        <button onClick={() => removeTag(tag)}
                          className="text-[10px] text-gray-200 hover:text-red-400 transition-colors ml-auto px-2 py-0.5 rounded-full border border-white/40 hover:border-red-200">
                          범주 삭제
                        </button>
                      )}
                    </div>

                    {/* 자료 추가 폼 */}
                    {addingInCol === tag && (
                      <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-4 mb-3">
                        <input autoFocus value={colAddTitle} onChange={e => setColAddTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') resetColAdd() }}
                          placeholder="제목 *"
                          className="w-full text-sm font-semibold focus:outline-none text-gray-800 mb-2 border-b border-white/60 pb-2 bg-transparent" />
                        <input value={colAddSource} onChange={e => setColAddSource(e.target.value)}
                          placeholder="출처 URL / 제목 (선택)"
                          className="w-full text-xs focus:outline-none text-gray-500 mb-2 bg-transparent" />
                        <div className="flex items-center gap-1.5 flex-wrap">
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

                    {/* 보는중 그리드 */}
                    <div
                      className={`grid grid-cols-2 md:grid-cols-4 gap-3 min-h-[2.5rem] rounded-2xl transition-colors ${dragOverTarget === activeTarget ? 'ring-1 ring-[#BADEC8]/60 bg-[#BADEC8]/10' : ''}`}
                      onDragOver={e => { e.preventDefault(); setDragOverTarget(activeTarget) }}
                      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('resourceId'); if (id) toggleDoneStatus(id, false) }}
                      onDragLeave={handleDragLeave}>
                      {active.length === 0 ? (
                        <div className="col-span-2 md:col-span-4 text-center text-[10px] text-gray-300 py-3">
                          {dragOverTarget === activeTarget ? '여기에 놓기 (보는중)' : '자료 없음'}
                        </div>
                      ) : active.map(r => (
                        <div key={r.id} className="cursor-grab active:cursor-grabbing"
                          draggable onDragStart={e => { e.dataTransfer.setData('resourceId', r.id) }}>
                          <Link href={`/learning/${r.id}`} className="block">
                            <div className="bg-white/50 backdrop-blur-xl border border-white/70 hover:bg-white/70 hover:shadow-md rounded-2xl p-3 transition-all h-28 flex flex-col overflow-hidden">
                              <p className="text-xs font-bold text-gray-800 leading-snug line-clamp-3 flex-1">{r.title}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-shrink-0">
                                {r.media_type && <span className="text-sm">{MEDIA_ICONS[r.media_type]}</span>}
                                {r.source && <p className="text-[9px] text-gray-400 truncate flex-1">출처: {r.source}</p>}
                                {r.notes.length > 0 && <span className="text-[9px] text-gray-400 bg-white/60 border border-white/70 px-1 py-0.5 rounded-full flex-shrink-0">{r.notes.length}노트</span>}
                              </div>
                            </div>
                          </Link>
                        </div>
                      ))}
                    </div>

                    {/* 완료 토글 */}
                    {(done.length > 0 || dragOverTarget === doneTarget) && (
                      <div className="mt-2">
                        <button onClick={() => toggleDoneSection(tag)}
                          className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors mb-2">
                          <span className="text-[8px]">{isDoneOpen ? '▼' : '▶'}</span>
                          완료 {done.length}개
                        </button>
                        {isDoneOpen && (
                          <div
                            className={`grid grid-cols-2 md:grid-cols-4 gap-3 rounded-2xl transition-colors ${dragOverTarget === doneTarget ? 'ring-1 ring-gray-300/60 bg-gray-100/30' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDragOverTarget(doneTarget) }}
                            onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('resourceId'); if (id) toggleDoneStatus(id, true) }}
                            onDragLeave={handleDragLeave}>
                            {done.map(r => (
                              <div key={r.id} className="cursor-grab active:cursor-grabbing opacity-55 hover:opacity-80 transition-opacity"
                                draggable onDragStart={e => { e.dataTransfer.setData('resourceId', r.id) }}>
                                <Link href={`/learning/${r.id}`} className="block">
                                  <div className="bg-white/30 backdrop-blur-xl border border-white/50 rounded-2xl p-3 transition-all h-28 flex flex-col overflow-hidden">
                                    <p className="text-xs font-semibold text-gray-600 leading-snug line-clamp-3 flex-1 line-through decoration-gray-300">{r.title}</p>
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-shrink-0">
                                      {r.media_type && <span className="text-sm opacity-60">{MEDIA_ICONS[r.media_type]}</span>}
                                      {r.source && <p className="text-[9px] text-gray-400 truncate flex-1">출처: {r.source}</p>}
                                    </div>
                                  </div>
                                </Link>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 완료 드롭존 (완료 항목 없을 때도 드래그 가능하도록) */}
                    {done.length === 0 && dragOverTarget !== doneTarget && (
                      <div
                        className="mt-2 h-6 rounded-xl border border-dashed border-white/40 transition-all"
                        onDragOver={e => { e.preventDefault(); setDragOverTarget(doneTarget) }}
                        onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('resourceId'); if (id) toggleDoneStatus(id, true) }}
                        onDragLeave={handleDragLeave}>
                        <p className="text-[9px] text-gray-300 text-center leading-6">완료로 드래그</p>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 범주 추가 */}
              <div className="pt-2">
                {showAddTag ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); if (e.key === 'Escape') { setShowAddTag(false); setNewTagInput('') } }}
                      placeholder="새 범주 이름"
                      className="flex-1 text-xs bg-white/50 border border-white/70 rounded-full px-3 py-1.5 focus:outline-none" />
                    <button onClick={addCustomTag} className={`${pill} ${pOn}`}>추가</button>
                    <button onClick={() => { setShowAddTag(false); setNewTagInput('') }} className={`${pill} ${pOff}`}>취소</button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddTag(true)}
                    className="w-full bg-white/20 backdrop-blur-xl border border-dashed border-white/50 rounded-2xl py-4 hover:bg-white/30 transition-all text-gray-400 hover:text-gray-600 text-xs font-medium">
                    + 범주 추가
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
