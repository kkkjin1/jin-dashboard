'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { LearningResource } from '@/types'

const DEFAULT_TAGS = ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']
const MEDIA_TYPES = ['책', '영상', '아티클', '강의', '기타']
const LS_CUSTOM_TAGS_KEY = 'learning_custom_tags'

function loadCustomTags(): string[] {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_TAGS_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_TAGS
  } catch { return DEFAULT_TAGS }
}

function saveCustomTags(tags: string[]) {
  localStorage.setItem(LS_CUSTOM_TAGS_KEY, JSON.stringify(tags))
}

const MEDIA_ICONS: Record<string, string> = {
  '책': '📚', '영상': '🎬', '아티클': '📄', '강의': '🎓', '기타': '📌',
}

export default function LearningPage() {
  const [resources, setResources] = useState<LearningResource[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const [customTags, setCustomTags] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [mediaFilter, setMediaFilter] = useState<string | null>(null)

  const [managingTags, setManagingTags] = useState(false)
  const [newTag, setNewTag] = useState('')

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    setCustomTags(loadCustomTags())
    supabase.from('learning_resources').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setResources((data ?? []) as LearningResource[]); setLoading(false) })
  }, [])

  function updateCustomTags(tags: string[]) {
    setCustomTags(tags)
    saveCustomTags(tags)
  }

  function addTag() {
    const t = newTag.trim()
    if (!t || customTags.includes(t)) return
    updateCustomTags([...customTags, t])
    setNewTag('')
  }

  function removeTag(tag: string) {
    updateCustomTags(customTags.filter(t => t !== tag))
    if (tagFilter === tag) setTagFilter(null)
  }

  async function handleAdd() {
    if (!newTitle.trim()) { setAdding(false); return }
    const { data } = await supabase.from('learning_resources')
      .insert({ title: newTitle.trim(), source: '', notes: [], tags: [], media_type: null })
      .select().single()
    if (data) {
      setNewTitle('')
      setAdding(false)
      router.push(`/learning/${(data as LearningResource).id}`)
    }
  }

  const filtered = resources.filter(r => {
    if (tagFilter && !(r.tags ?? []).includes(tagFilter)) return false
    if (mediaFilter && r.media_type !== mediaFilter) return false
    return true
  })

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">학습자료</h1>
        <div className="flex gap-2">
          <button onClick={() => setManagingTags(prev => !prev)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${managingTags ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            태그 관리
          </button>
          <button onClick={() => setAdding(true)}
            className="text-sm bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
            + 새 자료
          </button>
        </div>
      </div>

      {/* 태그 관리 패널 */}
      {managingTags && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-5">
          <p className="text-xs font-semibold text-gray-500 mb-3">커스텀 태그 관리</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {customTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1">
                {tag}
                <button onClick={() => removeTag(tag)} className="text-gray-300 hover:text-red-400 leading-none">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newTag} onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTag() }}
              placeholder="새 태그 입력 후 엔터"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white" />
            <button onClick={addTag}
              className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">추가</button>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="space-y-2 mb-5">
        {/* 태그 필터 */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setTagFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!tagFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            전체
          </button>
          {customTags.map(tag => (
            <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tagFilter === tag ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
              {tag}
            </button>
          ))}
        </div>

        {/* 매체 필터 */}
        <div className="flex gap-1.5 flex-wrap">
          {MEDIA_TYPES.map(type => (
            <button key={type} onClick={() => setMediaFilter(mediaFilter === type ? null : type)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${mediaFilter === type ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
              {MEDIA_ICONS[type]} {type}
            </button>
          ))}
        </div>
      </div>

      {/* 빠른 추가 */}
      {adding && (
        <div className="bg-white rounded-xl border border-blue-200 px-4 py-3 mb-4">
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
            onBlur={handleAdd}
            placeholder="학습자료 제목 입력 후 엔터"
            className="w-full text-sm focus:outline-none text-gray-700" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-16 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm">자료가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(resource => (
            <Link key={resource.id} href={`/learning/${resource.id}`}>
              <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200 transition-colors flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {resource.media_type && (
                      <span className="text-xs text-gray-400">{MEDIA_ICONS[resource.media_type] ?? ''} {resource.media_type}</span>
                    )}
                    {(resource.tags ?? []).map(tag => (
                      <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <p className="text-sm font-medium text-gray-800">{resource.title}</p>
                  {resource.source && <p className="text-xs text-gray-400 mt-0.5">출처: {resource.source}</p>}
                </div>
                <div className="flex-shrink-0 text-right ml-4">
                  <p className="text-xs text-gray-300">{resource.notes.length}개 노트</p>
                  <p className="text-xs text-gray-300">{format(parseISO(resource.created_at), 'M/d', { locale: ko })}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
