'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import type { LearningResource } from '@/types'

const DEFAULT_TAGS = ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']

const TAG_BADGE: Record<string, string> = {
  'HR':      'bg-[#BADEC8]/60 text-[#1C4A36] border-[#9ECAB4]/70',
  '경제':    'bg-[#B8CCE8]/60 text-[#1A3462] border-[#9AB8D8]/70',
  '리더십':  'bg-[#C0DDB4]/60 text-[#224818] border-[#A4CC98]/70',
  '평가보상':'bg-[#EDD978]/60 text-[#503A06] border-[#D8C458]/70',
  '데이터':  'bg-[#C8DC8C]/60 text-[#304808] border-[#B0C870]/70',
  '조직문화':'bg-[#EAB4AC]/60 text-[#5C201C] border-[#D89890]/70',
  '기획':    'bg-[#C8C4DE]/60 text-[#363260] border-[#B0ACCC]/70',
  '미분류':  'bg-[#D8D4CC]/60 text-[#4C4440] border-[#C0BCAC]/70',
}

const MEDIA_ICONS: Record<string, string> = { '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌' }

type Status = 'todo' | 'doing' | 'done'
const STATUS_LABELS: Record<Status, string> = { todo: '보기전', doing: '보는중', done: '완료' }
const STATUS_SHORT: Record<Status, string> = { todo: '보기전', doing: '보는중', done: '완료' }
const STATUS_KEYS: Status[] = ['todo', 'doing', 'done']

type SiteShortcut = { id: string; title: string; url: string }

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
const pOff = 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)]'

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

  // 범주 필터 (null = 전체)
  const [filterTag, setFilterTag] = useState<string | null>(null)

  // 드래그
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

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
    if (filterTag === tag) setFilterTag(null)
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
  const displayCols = filterTag ? [filterTag] : tagCols

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
        <h1 className="text-xl font-bold text-[#E2E8F0] mr-auto">학습자료</h1>
        <span className="text-xs text-[rgba(226,232,240,0.4)]">{resources.length}개</span>
        <button onClick={() => setShowAddForm(v => !v)}
          className="text-sm bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-4 py-2 rounded-full hover:bg-[#D5E6F7] transition-colors shadow-sm">
          + 새 자료
        </button>
      </div>

      {/* 범주 필터 바 */}
      <div className="flex-shrink-0 pb-4 flex items-center gap-2 flex-wrap">
        {filterTag && (
          <button onClick={() => setFilterTag(null)}
            className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] border border-[rgba(255,255,255,0.09)] rounded-full px-2 py-1 bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)] transition-all">
            ← 전체
          </button>
        )}
        {customTags.map(tag => {
          const badge = TAG_BADGE[tag] ?? 'bg-[#D8D4CC]/60 text-[#4C4440] border-[#C0BCAC]/70'
          const isActive = filterTag === tag
          return (
            <div key={tag}
              onClick={() => setFilterTag(isActive ? null : tag)}
              className={`relative group flex items-center justify-center rounded-full px-3 py-1 cursor-pointer border transition-all select-none
                ${badge} ${isActive ? 'ring-2 ring-offset-1 ring-current/40 shadow-sm' : 'opacity-70 hover:opacity-100'}`}>
              <span className="text-xs font-semibold">{tag}</span>
              <button
                onClick={e => { e.stopPropagation(); removeTag(tag) }}
                className="absolute right-1.5 text-[10px] opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-red-500 transition-all leading-none">
                ×
              </button>
            </div>
          )
        })}
        {showAddTag ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); if (e.key === 'Escape') { setShowAddTag(false); setNewTagInput('') } }}
              placeholder="범주명"
              className="text-xs bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 focus:outline-none w-24" />
            <button onClick={addCustomTag} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-2.5 py-1.5 rounded-full">추가</button>
            <button onClick={() => { setShowAddTag(false); setNewTagInput('') }} className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]">취소</button>
          </div>
        ) : (
          <button onClick={() => setShowAddTag(true)}
            className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] border border-dashed border-[rgba(255,255,255,0.09)] hover:border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)] transition-all">
            + 범주
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="pb-6 space-y-5">

          {/* 새 자료 추가 폼 */}
          {showAddForm && (
            <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {['책','영상','아티클','강의','기타'].map(type => (
                  <button key={type} onClick={() => setAddingMedia(addingMedia === type ? '' : type)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${addingMedia === type ? pOn : pOff}`}>
                    {MEDIA_ICONS[type]} {type}
                  </button>
                ))}
                <select value={addTag} onChange={e => setAddTag(e.target.value)}
                  className="ml-auto text-xs bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 focus:outline-none text-[rgba(226,232,240,0.7)]">
                  <option value="">범주 선택</option>
                  {customTags.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="미분류">미분류</option>
                </select>
              </div>
              <input autoFocus value={addTitle} onChange={e => setAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') resetAdd() }}
                placeholder="제목 *"
                className="w-full text-sm font-semibold focus:outline-none text-[rgba(226,232,240,0.9)] mb-2 border-b border-[rgba(255,255,255,0.09)] pb-2 bg-transparent" />
              <input value={addSource} onChange={e => setAddSource(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                placeholder="출처 URL / 제목 (선택, Enter로 저장)"
                className="w-full text-xs focus:outline-none text-[rgba(226,232,240,0.5)] mb-3 bg-transparent" />
              <div className="flex gap-2 justify-end">
                <button onClick={resetAdd} className={`${pill} ${pOff}`}>취소</button>
                <button onClick={handleAdd} disabled={!addTitle.trim()} className={`${pill} ${pOn} disabled:opacity-30`}>저장</button>
              </div>
            </div>
          )}

          {/* 자주 가는 사이트 */}
          <div>
            <p className="text-xs font-semibold text-[rgba(226,232,240,0.4)] mb-2">자주 가는 사이트</p>
            <div className="flex gap-2 flex-wrap items-center">
              {siteShortcuts.map(s => {
                if (editingSiteId === s.id) return (
                  <div key={s.id} className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl rounded-2xl border border-[rgba(255,255,255,0.09)] p-2.5 w-44 shadow-sm">
                    <input value={editSiteTitle} onChange={e => setEditSiteTitle(e.target.value)} placeholder="이름" autoFocus
                      className="text-sm font-medium text-[rgba(226,232,240,0.9)] w-full focus:outline-none border-b border-[rgba(255,255,255,0.09)] pb-1 mb-1 bg-transparent" />
                    <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditSite(); if (e.key === 'Escape') setEditingSiteId(null) }}
                      placeholder="URL" className="text-xs text-[rgba(226,232,240,0.4)] w-full focus:outline-none bg-transparent" />
                    <div className="flex gap-1 mt-2 justify-end">
                      <button onClick={() => setEditingSiteId(null)} className={`${pill} ${pOff} !text-[10px] !px-2 !py-1`}>취소</button>
                      <button onClick={saveEditSite} className={`${pill} ${pOn} !text-[10px] !px-2 !py-1`}>저장</button>
                    </div>
                  </div>
                )
                return (
                  <div key={s.id} className="group relative">
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 hover:bg-[rgba(255,255,255,0.06)] hover:shadow-sm transition-all">
                      <span className="text-xs font-medium text-[rgba(226,232,240,0.8)] truncate max-w-28">🔗 {s.title}</span>
                    </a>
                    <div className="absolute -top-1.5 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button onClick={() => { setEditingSiteId(s.id); setEditSiteTitle(s.title); setEditSiteUrl(s.url) }}
                        className="w-4 h-4 bg-[#B8CCE8] text-[#1A3462] rounded-full text-[9px] flex items-center justify-center hover:bg-[#9AB8D8]">✎</button>
                      <button onClick={() => removeSite(s.id)}
                        className="w-4 h-4 bg-gray-300 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-400">×</button>
                    </div>
                  </div>
                )
              })}
              {showAddSite ? (
                <div className="bg-[rgba(255,255,255,0.06)] backdrop-blur-xl rounded-2xl border border-[rgba(255,255,255,0.09)] p-2.5 w-44 shadow-sm">
                  <input value={newSiteTitle} onChange={e => setNewSiteTitle(e.target.value)} placeholder="이름" autoFocus
                    className="text-sm font-medium text-[rgba(226,232,240,0.9)] w-full focus:outline-none border-b border-[rgba(255,255,255,0.09)] pb-1 mb-1 bg-transparent" />
                  <input value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSite(); if (e.key === 'Escape') setShowAddSite(false) }}
                    placeholder="URL" className="text-xs text-[rgba(226,232,240,0.4)] w-full focus:outline-none bg-transparent" />
                  <div className="flex gap-1 mt-2 justify-end">
                    <button onClick={() => setShowAddSite(false)} className={`${pill} ${pOff} !text-[10px] !px-2 !py-1`}>취소</button>
                    <button onClick={addSite} className={`${pill} ${pOn} !text-[10px] !px-2 !py-1`}>추가</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setShowAddSite(true); setEditingSiteId(null) }}
                  className="text-xs text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.5)] border border-dashed border-[rgba(255,255,255,0.09)] hover:border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 transition-colors bg-[rgba(255,255,255,0.06)]">
                  + 사이트 추가
                </button>
              )}
            </div>
          </div>

          {/* 범주별 섹션 */}
          {loading ? (
            <div className="space-y-1">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-9 rounded-md animate-pulse bg-[rgba(255,255,255,0.06)]" />)}
            </div>
          ) : (
            <div className="space-y-5">
              {displayCols.map(tag => {
                const groups = tagGroups[tag] ?? { todo: [], doing: [], done: [] }
                const total = groups.todo.length + groups.doing.length + groups.done.length
                const badge = TAG_BADGE[tag] ?? 'bg-[#D8D4CC]/60 text-[#4C4440] border-[#C0BCAC]/70'

                return (
                  <div key={tag}>
                    {/* 범주 헤더 */}
                    <div className="flex items-center gap-2 mb-1 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${badge}`}>{tag}</span>
                      <span className="text-[10px] text-[rgba(226,232,240,0.4)]">{total}개</span>
                    </div>

                    {/* 자료 flat 리스트 (상태별 드롭존 유지) */}
                    {STATUS_KEYS.map(status => {
                      const items = groups[status]
                      if (items.length === 0 && !isDragging) return null
                      const isDone = status === 'done'
                      const groupKey = `${tag}:${status}`
                      const isOver = dragOverTarget === groupKey

                      return (
                        <div key={status}
                          className={`transition-colors rounded-md ${isOver ? 'bg-[#BADEC8]/08' : ''}`}
                          onDragOver={e => { e.preventDefault(); setDragOverTarget(groupKey) }}
                          onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('rid'); if (id) setResourceStatus(id, status) }}
                          onDragLeave={handleDragLeave}>
                          {items.length === 0 && isOver ? (
                            <div className="text-center text-[10px] text-[rgba(226,232,240,0.3)] py-2">
                              여기에 놓기 → {STATUS_LABELS[status]}
                            </div>
                          ) : items.map(r => (
                            <div key={r.id}
                              className={`cursor-grab active:cursor-grabbing ${isDone ? 'opacity-40 hover:opacity-60' : ''}`}
                              draggable
                              onDragStart={e => { e.dataTransfer.setData('rid', r.id); setIsDragging(true) }}
                              onDragEnd={() => setIsDragging(false)}>
                              <Link href={`/learning/${r.id}`}
                                className="flex items-center gap-3 py-2.5 -mx-1 px-1 hover:bg-[rgba(255,255,255,0.04)] rounded-md transition-colors"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {r.media_type
                                  ? <span className="text-sm flex-shrink-0">{MEDIA_ICONS[r.media_type]}</span>
                                  : <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[rgba(226,232,240,0.2)]" />
                                }
                                <div className="flex-1 min-w-0">
                                  <p className={`text-[12px] font-medium truncate ${isDone ? 'text-[rgba(226,232,240,0.35)] line-through decoration-gray-300' : 'text-[rgba(226,232,240,0.9)]'}`}>{r.title}</p>
                                  {r.source && (
                                    <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(226,232,240,0.35)' }}>{r.source}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {r.notes.length > 0 && <span className="text-[9px] text-[rgba(226,232,240,0.4)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] px-1.5 py-0.5 rounded-full">{r.notes.length}노트</span>}
                                  {status !== 'todo' && (
                                    <span className="text-[9px]" style={{ color: status === 'done' ? 'rgba(226,232,240,0.25)' : 'rgba(52,211,153,0.7)' }}>
                                      {STATUS_SHORT[status]}
                                    </span>
                                  )}
                                  <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.28)' }}>
                                    {format(parseISO(r.created_at), 'M.d')}
                                  </span>
                                </div>
                              </Link>
                            </div>
                          ))}
                        </div>
                      )
                    })}
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
