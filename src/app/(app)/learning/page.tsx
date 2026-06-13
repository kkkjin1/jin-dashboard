'use client'

import { useEffect, useMemo, useState } from 'react'
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
  const [colMediaFilter, setColMediaFilter] = useState<Record<string, string | null>>({})
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
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${managingTags ? 'bg-[#5DBD97] text-white border-[#5DBD97]' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            태그 관리
          </button>
          <button onClick={() => setAddingInCol('__new__')}
            className="text-sm bg-[#5DBD97] text-white px-4 py-2 rounded-lg hover:bg-[#4aab84] transition-colors">
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
              className="text-xs bg-[#5DBD97] text-white px-3 py-1.5 rounded-lg hover:bg-[#4aab84]">추가</button>
          </div>
        </div>
      )}

      {/* 새 자료 추가 폼 */}
      {addingInCol === '__new__' && (
        <div className="bg-white rounded-xl border border-[#5DBD97]/30 p-5 mb-5 shadow-sm">
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
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${colAddMedia === type ? 'bg-[#5DBD97] text-white border-[#5DBD97]' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                {MEDIA_ICONS[type]} {type}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={resetColAdd} className="text-xs text-gray-400 px-3 py-1.5">취소</button>
              <button onClick={() => handleColAdd('__new__')} disabled={!colAddTitle.trim()}
                className="text-xs bg-[#5DBD97] text-white px-4 py-1.5 rounded-lg disabled:opacity-30">저장</button>
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
                    <button onClick={saveEditSiteShortcut} className="text-xs bg-[#5DBD97] text-white px-2 py-0.5 rounded-lg">저장</button>
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
                <button onClick={addSiteShortcut} className="text-xs bg-[#5DBD97] text-white px-2 py-0.5 rounded-lg">추가</button>
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
              const activeMf = colMediaFilter[tag] ?? null
              const colItems = activeMf ? allColItems.filter(r => r.media_type === activeMf) : allColItems
              return (
                <div key={tag}>
                  {/* 컬럼 헤더 — A 스타일 버튼형 */}
                  <div className="py-2.5 px-3 rounded-xl border border-gray-200 bg-white mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700">{tag}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">{allColItems.length}</span>
                        <button
                          onClick={() => setAddingInCol(addingInCol === tag ? null : tag)}
                          className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-[#5DBD97] hover:bg-[#EBF7F2] rounded transition-colors text-sm leading-none">
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {MEDIA_TYPES.map(mt => (
                        <button key={mt}
                          onClick={() => setColMediaFilter(prev => ({ ...prev, [tag]: prev[tag] === mt ? null : mt }))}
                          className={`text-xs px-2 py-0.5 rounded-lg border transition-colors ${
                            activeMf === mt ? 'bg-[#5DBD97] text-white border-[#5DBD97]' : 'border-gray-200 text-gray-400 bg-gray-50 hover:border-gray-300'
                          }`}>
                          {MEDIA_ICONS[mt]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {addingInCol === tag && (
                      <div className="bg-white rounded-xl border border-[#5DBD97]/30 px-3 py-3 shadow-sm">
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
                              className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${colAddMedia === type ? 'bg-[#5DBD97] text-white border-[#5DBD97]' : 'border-gray-200 text-gray-400'}`}>
                              {MEDIA_ICONS[type]} {type}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1 justify-end">
                          <button onClick={resetColAdd} className="text-xs text-gray-400 px-2 py-1">취소</button>
                          <button onClick={() => handleColAdd(tag)} disabled={!colAddTitle.trim()}
                            className="text-xs bg-[#5DBD97] text-white px-2 py-1 rounded-lg disabled:opacity-30">저장</button>
                        </div>
                      </div>
                    )}
                    {colItems.length === 0 && addingInCol !== tag ? (
                      <p className="text-xs text-gray-300 text-center py-8 bg-gray-50/60 rounded-xl border border-dashed border-gray-100">없음</p>
                    ) : colItems.map(r => (
                      <Link key={r.id} href={`/learning/${r.id}`} className="block">
                        <div className="bg-white rounded-xl border border-gray-200 hover:border-[#5DBD97]/40 hover:shadow-sm px-3 py-4 transition-all">
                          {r.media_type && (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mb-2 ${
                              r.media_type === '책' ? 'bg-amber-50 text-amber-600' :
                              r.media_type === '영상' ? 'bg-rose-50 text-rose-500' :
                              r.media_type === '아티클' ? 'bg-[#EBF7F2] text-[#5DBD97]' :
                              r.media_type === '강의' ? 'bg-[#1C2B3A]/5 text-[#1C2B3A]' :
                              'bg-gray-50 text-gray-500'
                            }`}>
                              {MEDIA_ICONS[r.media_type]} {r.media_type}
                            </span>
                          )}
                          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 break-all mb-1">{r.title}</p>
                          {r.source && <p className="text-xs text-gray-400 truncate">출처: {r.source}</p>}
                          {r.notes.length > 0 && <p className="text-xs text-gray-300 mt-1">{r.notes.length}노트</p>}
                        </div>
                      </Link>
                    ))}
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

