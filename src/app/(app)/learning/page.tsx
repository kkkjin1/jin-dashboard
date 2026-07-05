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

const MEDIA_ICONS: Record<string, string> = { '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌' }

type Status = 'todo' | 'doing' | 'done'
const STATUS_LABELS: Record<Status, string> = { todo: '볼 예정', doing: '보는 중', done: '완료' }
const STATUS_KEYS: Status[] = ['todo', 'doing', 'done']

type SiteShortcut = { id: string; title: string; url: string }

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-gray-900 text-white border-gray-900 shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

function getStatus(tags: string[]): Status {
  if (tags.includes('_done')) return 'done'
  if (tags.includes('_doing')) return 'doing'
  return 'todo'
}

export default function LearningPage() {
  const [resources, setResources] = useState<LearningResource[]>([])
  const [loading, setLoading] = useState(true)

  const { value: customTags, save: saveCustomTagsRemote } = useUserSetting<string[]>('learning_custom_tags', DEFAULT_TAGS)
  const { value: siteShortcuts, save: saveSiteShortcutsRemote } = useUserSetting<SiteShortcut[]>('learning_site_shortcuts', [])

  // 새 자료 추가 폼
  const [addingMedia, setAddingMedia] = useState('')
  const [addTitle, setAddTitle] = useState('')
  const [addSource, setAddSource] = useState('')
  const [addTag, setAddTag] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  // 범주 관리
  const [newTagInput, setNewTagInput] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)

  // 그룹 토글: key = `${tag}:${status}` → collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['미분류:todo', '미분류:doing', '미분류:done']))

  // 드래그 오버 대상: `${tag}:${status}`
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
  async function handleAdd() {
    if (!addTitle.trim()) { resetAdd(); return }
    const initTags = addTag && addTag !== '미분류' ? [addTag] : []
    const { data } = await supabase.from('learning_resources')
      .insert({ title: addTitle.trim(), source: addSource.trim(), notes: [], tags: initTags, media_type: addingMedia || null })
      .select().single()
    if (data) setResources(prev => [data as LearningResource, ...prev])
    resetAdd()
  }

  function resetAdd() { setShowAddForm(false); setAddTitle(''); setAddSource(''); setAddTag(''); setAddingMedia('') }

  // ── 상태 변경 ──────────────────────────────────────────
  async function setResourceStatus(resourceId: string, status: Status) {
    const resource = resources.find(r => r.id === resourceId)
    if (!resource) return
    const stripped = (resource.tags ?? []).filter(t => t !== '_done' && t !== '_doing')
    const newTags = status === 'done' ? [...stripped, '_done'] : status === 'doing' ? [...stripped, '_doing'] : stripped
    await supabase.from('learning_resources').update({ tags: newTags }).eq('id', resourceId)
    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, tags: newTags } : r))
    setDragOverTarget(null)
  }

  // ── 그룹 토글 ──────────────────────────────────────────
  function toggleGroup(key: string) {
    setCollapsedGroups(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTarget(null)
  }

  // ── 사이트 단축키 ──────────────────────────────────────
  function saveSC(list: SiteShortcut[]) { saveSiteShortcutsRemote(list) }
  function addSite() {
    if (!newSiteUrl.trim()) return
    const url = newSiteUrl.startsWith('http') ? newSiteUrl : 'https://' + newSiteUrl
    saveSC([...siteShortcuts, { id: Date.now().toString(), title: newSiteTitle.trim() || url, url }])
    setNewSiteTitle(''); setNewSiteUrl(''); setShowAddSite(false)
  }
  function removeSite(id: string) { saveSC(siteShortcuts.filter(s => s.id !== id)) }
  function saveEditSite() {
    if (!editSiteUrl.trim() || !editingSiteId) return
    const url = editSiteUrl.startsWith('http') ? editSiteUrl : 'https://' + editSiteUrl
    saveSC(siteShortcuts.map(s => s.id === editingSiteId ? { ...s, title: editSiteTitle.trim() || url, url } : s))
    setEditingSiteId(null); setEditSiteTitle(''); setEditSiteUrl('')
  }

  // ── 데이터 그루핑 ──────────────────────────────────────
  const tagCols = [...customTags, '미분류']

  const tagGroups = useMemo(() => {
    const result: Record<string, Record<Status, LearningResource[]>> = {}
    tagCols.forEach(col => { result[col] = { todo: [], doing: [], done: [] } })
    resources.forEach(r => {
      const tags = r.tags ?? []
      const firstKnown = tags.find(t => customTags.includes(t))
      const col = firstKnown ?? '미분류'
      const status = getStatus(tags)
      const target = result[col] ?? result['미분류']
      target[status].push(r)
    })
    return result
  }, [resources, customTags])

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-2 flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 mr-auto">학습자료</h1>
        <span className="text-xs text-gray-400">{resources.length}개</span>
        <button onClick={() => setShowAddForm(v => !v)}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-sm">
          + 새 자료
        </button>
      </div>

      {/* 범주 관리 바 */}
      <div className="flex-shrink-0 pb-4 flex items-center gap-2 flex-wrap">
        {customTags.map(tag => (
          <div key={tag} className="group flex items-center gap-0.5 bg-white/40 backdrop-blur-xl border border-white/60 rounded-full px-2.5 py-1 hover:bg-white/60 transition-colors">
            <span className={`text-xs font-semibold ${(TAG_BADGE[tag] ?? 'text-gray-500').split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600'}`}>{tag}</span>
            <button onClick={() => removeTag(tag)}
              className="text-[10px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-0.5 leading-none">×</button>
          </div>
        ))}
        {showAddTag ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); if (e.key === 'Escape') { setShowAddTag(false); setNewTagInput('') } }}
              placeholder="범주명"
              className="text-xs bg-white/50 border border-white/70 rounded-full px-3 py-1.5 focus:outline-none w-24" />
            <button onClick={addCustomTag} className="text-xs bg-gray-900 text-white px-2.5 py-1.5 rounded-full">추가</button>
            <button onClick={() => { setShowAddTag(false); setNewTagInput('') }} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
          </div>
        ) : (
          <button onClick={() => setShowAddTag(true)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-white/60 hover:border-white/80 rounded-full px-3 py-1.5 bg-white/20 hover:bg-white/40 transition-all">
            + 범주
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="pb-6 space-y-5">

          {/* 새 자료 추가 폼 */}
          {showAddForm && (
            <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {['책','영상','아티클','강의','기타'].map(type => (
                  <button key={type} onClick={() => setAddingMedia(addingMedia === type ? '' : type)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${addingMedia === type ? pOn : pOff}`}>
                    {MEDIA_ICONS[type]} {type}
                  </button>
                ))}
                <select value={addTag} onChange={e => setAddTag(e.target.value)}
                  className="ml-auto text-xs bg-white/60 border border-white/70 rounded-full px-3 py-1.5 focus:outline-none text-gray-600">
                  <option value="">범주 선택</option>
                  {customTags.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="미분류">미분류</option>
                </select>
              </div>
              <input autoFocus value={addTitle} onChange={e => setAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') resetAdd() }}
                placeholder="제목 *"
                className="w-full text-sm font-semibold focus:outline-none text-gray-800 mb-2 border-b border-white/60 pb-2 bg-transparent" />
              <input value={addSource} onChange={e => setAddSource(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                placeholder="출처 URL / 제목 (선택, Enter로 저장)"
                className="w-full text-xs focus:outline-none text-gray-500 mb-3 bg-transparent" />
              <div className="flex gap-2 justify-end">
                <button onClick={resetAdd} className={`${pill} ${pOff}`}>취소</button>
                <button onClick={handleAdd} disabled={!addTitle.trim()} className={`${pill} ${pOn} disabled:opacity-30`}>저장</button>
              </div>
            </div>
          )}

          {/* 자주 가는 사이트 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">자주 가는 사이트</p>
            <div className="flex gap-2 flex-wrap items-center">
              {siteShortcuts.map(s => {
                if (editingSiteId === s.id) return (
                  <div key={s.id} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 p-2.5 w-44 shadow-sm">
                    <input value={editSiteTitle} onChange={e => setEditSiteTitle(e.target.value)} placeholder="이름" autoFocus
                      className="text-sm font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
                    <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditSite(); if (e.key === 'Escape') setEditingSiteId(null) }}
                      placeholder="URL" className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
                    <div className="flex gap-1 mt-2 justify-end">
                      <button onClick={() => setEditingSiteId(null)} className={`${pill} ${pOff} !text-[10px] !px-2 !py-1`}>취소</button>
                      <button onClick={saveEditSite} className={`${pill} ${pOn} !text-[10px] !px-2 !py-1`}>저장</button>
                    </div>
                  </div>
                )
                return (
                  <div key={s.id} className="group relative">
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-white/40 backdrop-blur-xl border border-white/60 rounded-full px-3 py-1.5 hover:bg-white/60 hover:shadow-sm transition-all">
                      <span className="text-xs font-medium text-gray-700 truncate max-w-28">🔗 {s.title}</span>
                    </a>
                    <div className="absolute -top-1.5 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button onClick={() => { setEditingSiteId(s.id); setEditSiteTitle(s.title); setEditSiteUrl(s.url) }}
                        className="w-4 h-4 bg-[#90A7D8] text-white rounded-full text-[9px] flex items-center justify-center hover:bg-[#1E3A6B]">✎</button>
                      <button onClick={() => removeSite(s.id)}
                        className="w-4 h-4 bg-gray-300 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-400">×</button>
                    </div>
                  </div>
                )
              })}
              {showAddSite ? (
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 p-2.5 w-44 shadow-sm">
                  <input value={newSiteTitle} onChange={e => setNewSiteTitle(e.target.value)} placeholder="이름" autoFocus
                    className="text-sm font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
                  <input value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSite(); if (e.key === 'Escape') setShowAddSite(false) }}
                    placeholder="URL" className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
                  <div className="flex gap-1 mt-2 justify-end">
                    <button onClick={() => setShowAddSite(false)} className={`${pill} ${pOff} !text-[10px] !px-2 !py-1`}>취소</button>
                    <button onClick={addSite} className={`${pill} ${pOn} !text-[10px] !px-2 !py-1`}>추가</button>
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
            <div className="grid grid-cols-2 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl h-28 animate-pulse" />)}
            </div>
          ) : resources.length === 0 ? (
            <EmptyState icon="learning" title="아직 학습 자료가 없어요" description="책, 아티클, 강의 등 기록하고 싶은 자료를 추가해보세요" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {tagCols.map(tag => {
                const groups = tagGroups[tag] ?? { todo: [], doing: [], done: [] }
                const total = groups.todo.length + groups.doing.length + groups.done.length
                if (total === 0) return null

                return (
                  <div key={tag} className="bg-white/20 backdrop-blur-xl border border-white/50 rounded-2xl p-4">
                    {/* 범주 헤더 */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TAG_BADGE[tag] ?? 'bg-gray-100/80 text-gray-500 border-gray-200'}`}>{tag}</span>
                      <span className="text-xs text-gray-400">{total}개</span>
                    </div>

                    {/* 3개 상태 그룹 */}
                    <div className="space-y-3">
                      {STATUS_KEYS.map(status => {
                        const items = groups[status]
                        const groupKey = `${tag}:${status}`
                        const isCollapsed = collapsedGroups.has(groupKey)
                        const dropTarget = groupKey
                        const isOver = dragOverTarget === dropTarget
                        const isDone = status === 'done'

                        return (
                          <div key={status}>
                            {/* 상태 헤더 토글 */}
                            <button onClick={() => toggleGroup(groupKey)}
                              className="flex items-center gap-2 w-full text-left group mb-2">
                              <span className="text-[10px] text-gray-300 group-hover:text-gray-500 transition-colors">{isCollapsed ? '▶' : '▼'}</span>
                              <span className="text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors">
                                {STATUS_LABELS[status]}
                              </span>
                              <span className="text-[10px] text-gray-300 bg-white/50 border border-white/60 px-1.5 py-0.5 rounded-full">{items.length}</span>
                            </button>

                            {/* 드롭존 + 카드 그리드 */}
                            {!isCollapsed && (
                              <div
                                className={`grid grid-cols-2 gap-3 rounded-2xl min-h-[2.5rem] p-1 -m-1 transition-colors ${isOver ? 'bg-[#BADEC8]/15 ring-1 ring-[#BADEC8]/50' : ''}`}
                                onDragOver={e => { e.preventDefault(); setDragOverTarget(dropTarget) }}
                                onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('rid'); if (id) setResourceStatus(id, status) }}
                                onDragLeave={handleDragLeave}>
                                {items.length === 0 ? (
                                  <div className="col-span-2 text-center text-[10px] text-gray-300 py-4 border border-dashed border-white/40 rounded-xl">
                                    {isOver ? `여기에 놓기 → ${STATUS_LABELS[status]}` : '드래그해서 옮기기'}
                                  </div>
                                ) : items.map(r => (
                                  <div key={r.id}
                                    className={`cursor-grab active:cursor-grabbing transition-opacity ${isDone ? 'opacity-50 hover:opacity-75' : ''}`}
                                    draggable
                                    onDragStart={e => { e.dataTransfer.setData('rid', r.id) }}>
                                    <Link href={`/learning/${r.id}`} className="block">
                                      <div className={`backdrop-blur-xl border rounded-2xl p-3 h-28 flex flex-col overflow-hidden transition-all hover:shadow-sm ${isDone ? 'bg-white/25 border-white/40 hover:bg-white/35' : 'bg-white/50 border-white/70 hover:bg-white/70'}`}>
                                        <p className={`text-xs font-bold leading-snug line-clamp-3 flex-1 ${isDone ? 'text-gray-500 line-through decoration-gray-300' : 'text-gray-800'}`}>{r.title}</p>
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
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
