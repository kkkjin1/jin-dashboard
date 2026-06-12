'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { LearningResource } from '@/types'

const DEFAULT_TAGS = ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']
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
  const [mediaFilter, setMediaFilter] = useState<string | null>(null)
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
    const initTags = tag === '미분류' ? [] : [tag]
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

  const filtered = resources.filter(r => {
    if (mediaFilter && r.media_type !== mediaFilter) return false
    return true
  })

  // Group by first tag (or '미분류')
  const tagColumns = ['미분류', ...customTags]
  const grouped: Record<string, LearningResource[]> = {}
  tagColumns.forEach(t => { grouped[t] = [] })
  filtered.forEach(r => {
    const tags = r.tags ?? []
    const firstTag = tags.find(t => customTags.includes(t))
    const key = firstTag ?? '미분류'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(r)
  })
  const activeColumns = tagColumns

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">학습자료</h1>
        <div className="flex gap-2">
          <button onClick={() => setManagingTags(p => !p)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${managingTags ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            태그 관리
          </button>
          <button onClick={() => setShowAddInput(true)}
            className="text-sm bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
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
              className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700">추가</button>
          </div>
        </div>
      )}

      {/* 인라인 추가 */}
      {showAddInput && (
        <div className="bg-white rounded-xl border border-blue-200 px-4 py-3 mb-5">
          <input autoFocus value={addingTitle} onChange={e => setAddingTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setShowAddInput(false); setAddingTitle('') } }}
            onBlur={handleAdd}
            placeholder="학습자료 제목 입력 후 엔터"
            className="w-full text-sm focus:outline-none text-gray-700" />
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
                    <button onClick={saveEditSiteShortcut} className="text-xs bg-gray-800 text-white px-2 py-0.5 rounded-lg">저장</button>
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
                <button onClick={addSiteShortcut} className="text-xs bg-gray-800 text-white px-2 py-0.5 rounded-lg">추가</button>
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

      {/* 매체 필터 */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {MEDIA_TYPES.map(type => (
          <button key={type} onClick={() => setMediaFilter(mediaFilter === type ? null : type)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${mediaFilter === type ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
            {MEDIA_ICONS[type]} {type}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 h-16 animate-pulse" />)}</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activeColumns.map(tag => {
            const colResources = grouped[tag] ?? []
            return (
              <div key={tag} className="flex-shrink-0 w-60">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-gray-600">{tag}</span>
                  <span className="text-xs text-gray-400">{colResources.length}</span>
                </div>
                <div className="space-y-2">
                  {colResources.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-4 bg-gray-50 rounded-xl border border-gray-100 border-dashed">없음</p>
                  )}
                  {colResources.map(r => (
                    <Link key={r.id} href={`/learning/${r.id}`}>
                      <div className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 hover:border-gray-200 transition-colors overflow-hidden">
                        {r.media_type && <p className="text-xs text-gray-400 mb-0.5 truncate">{MEDIA_ICONS[r.media_type] ?? ''} {r.media_type}</p>}
                        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{r.title}</p>
                        {r.source && <p className="text-xs text-gray-400 mt-0.5 truncate">출처: {r.source}</p>}
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex gap-1 flex-wrap">
                            {(r.tags ?? []).map(t => (
                              <span key={t} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{t}</span>
                            ))}
                          </div>
                          <span className="text-xs text-gray-300 flex-shrink-0">{r.notes.length}노트</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {addingInCol === tag ? (
                    <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-2">
                      <input autoFocus value={colAddTitle} onChange={e => setColAddTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') resetColAdd() }}
                        placeholder="제목 *"
                        className="w-full text-sm font-medium focus:outline-none text-gray-800" />
                      <input value={colAddSource} onChange={e => setColAddSource(e.target.value)}
                        placeholder="출처 URL / 제목 (선택)"
                        className="w-full text-xs focus:outline-none text-gray-500 border-t border-gray-100 pt-2" />
                      <textarea value={colAddNote} onChange={e => setColAddNote(e.target.value)}
                        placeholder="내용 노트 (선택)" rows={3}
                        className="w-full text-xs focus:outline-none resize-none text-gray-500 leading-relaxed" />
                      <div className="flex gap-1 flex-wrap">
                        {MEDIA_TYPES.map(type => (
                          <button key={type} onClick={() => setColAddMedia(colAddMedia === type ? '' : type)}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${colAddMedia === type ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                            {MEDIA_ICONS[type]} {type}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1 justify-end pt-1">
                        <button onClick={resetColAdd} className="text-xs text-gray-400 px-2 py-1">취소</button>
                        <button onClick={() => handleColAdd(tag)} disabled={!colAddTitle.trim()}
                          className="text-xs bg-gray-800 text-white px-3 py-1 rounded-lg disabled:opacity-30">저장</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingInCol(tag); setColAddTitle('') }}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                      + 추가
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
