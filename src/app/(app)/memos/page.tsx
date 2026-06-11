'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { QuickMemo, MemoTag } from '@/types'

const TAGS: (MemoTag | '전체')[] = ['전체', '공지', '업무관련', '회의관련', '아이디어']

const TAG_COLORS: Record<MemoTag, string> = {
  '공지': 'bg-red-50 text-red-600',
  '업무관련': 'bg-blue-50 text-blue-600',
  '회의관련': 'bg-purple-50 text-purple-600',
  '아이디어': 'bg-amber-50 text-amber-600',
}

export default function MemosPage() {
  const [memos, setMemos] = useState<QuickMemo[]>([])
  const [tagFilter, setTagFilter] = useState<MemoTag | '전체'>('전체')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTag, setEditTag] = useState<MemoTag>('업무관련')
  const supabase = createClient()

  useEffect(() => {
    supabase.from('quick_memos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setMemos((data ?? []) as QuickMemo[]); setLoading(false) })
  }, [])

  function startEdit(memo: QuickMemo) {
    setEditingId(memo.id)
    setEditTitle(memo.title)
    setEditContent(memo.content)
    setEditTag(memo.tag)
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return
    await supabase.from('quick_memos').update({ title: editTitle.trim(), content: editContent.trim(), tag: editTag }).eq('id', id)
    setMemos(prev => prev.map(m => m.id === id ? { ...m, title: editTitle.trim(), content: editContent.trim(), tag: editTag } : m))
    setEditingId(null)
  }

  async function deleteMemo(id: string) {
    if (!confirm('메모를 삭제하시겠습니까?')) return
    await supabase.from('quick_memos').delete().eq('id', id)
    setMemos(prev => prev.filter(m => m.id !== id))
  }

  const filtered = tagFilter === '전체' ? memos : memos.filter(m => m.tag === tagFilter)
  const notices = memos.filter(m => m.tag === '공지')

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">메모</h1>
        <span className="text-sm text-gray-400">{filtered.length}개</span>
      </div>

      {/* 공지 핀 섹션 */}
      {notices.length > 0 && tagFilter !== '공지' && (
        <div className="mb-6">
          <p className="text-xs font-medium text-red-500 mb-2">📌 공지</p>
          <div className="space-y-2">
            {notices.map(memo => (
              <div key={memo.id} className="bg-red-50 rounded-xl border border-red-100 p-3">
                <p className="text-sm font-medium text-gray-800">{memo.title}</p>
                {memo.content && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{memo.content}</p>}
              </div>
            ))}
          </div>
          <div className="border-b border-gray-100 mt-4 mb-4" />
        </div>
      )}

      {/* 태그 필터 */}
      <div className="flex gap-1.5 mb-6">
        {TAGS.map(t => (
          <button key={t} onClick={() => setTagFilter(t as MemoTag | '전체')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${tagFilter === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-20 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm mb-2">메모가 없습니다</p>
          <p className="text-gray-200 text-xs">Ctrl+M 또는 우하단 + 버튼으로 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(memo => (
            <div key={memo.id} className="bg-white rounded-xl border border-gray-100 p-4 group hover:border-gray-200 transition-colors">
              {editingId === memo.id ? (
                <div>
                  <div className="flex gap-1.5 mb-2">
                    {(['업무관련', '회의관련', '아이디어', '공지'] as MemoTag[]).map(t => (
                      <button key={t} onClick={() => setEditTag(t)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${editTag === t ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(memo.id); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 pb-1 mb-2 focus:outline-none focus:border-gray-400 bg-transparent" />
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(memo.id) }}
                    className="w-full text-sm text-gray-500 focus:outline-none resize-none bg-transparent"
                    rows={3} />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => saveEdit(memo.id)} className="text-xs bg-gray-800 text-white px-3 py-1 rounded-lg hover:bg-gray-700">저장</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => startEdit(memo)}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[memo.tag]}`}>{memo.tag}</span>
                      <span className="text-xs text-gray-300">{format(parseISO(memo.created_at), 'M월 d일 HH:mm', { locale: ko })}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mb-1">{memo.title}</p>
                    {memo.content && <p className="text-sm text-gray-500 whitespace-pre-wrap">{memo.content}</p>}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <button onClick={() => startEdit(memo)} className="text-xs text-gray-300 hover:text-gray-600">수정</button>
                    <button onClick={() => deleteMemo(memo.id)} className="text-xs text-gray-200 hover:text-red-400">삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
