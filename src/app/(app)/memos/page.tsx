'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { QuickMemo, MemoTag } from '@/types'

const NON_NOTICE_TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어']

const TAG_COLORS: Record<MemoTag, string> = {
  '공지': 'bg-red-50 text-red-600',
  '업무관련': 'bg-blue-50 text-blue-600',
  '회의관련': 'bg-purple-50 text-purple-600',
  '아이디어': 'bg-amber-50 text-amber-600',
}

interface MemoCardProps {
  memo: QuickMemo
  onEdit: (memo: QuickMemo) => void
  onDelete: (id: string) => void
  editingId: string | null
  editTitle: string
  editContent: string
  editTag: MemoTag
  setEditTitle: (v: string) => void
  setEditContent: (v: string) => void
  setEditTag: (v: MemoTag) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
}

function MemoCard({ memo, onEdit, onDelete, editingId, editTitle, editContent, editTag, setEditTitle, setEditContent, setEditTag, onSaveEdit, onCancelEdit }: MemoCardProps) {
  const isEditing = editingId === memo.id
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 group hover:border-gray-200 transition-colors">
      {isEditing ? (
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
            onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(memo.id); if (e.key === 'Escape') onCancelEdit() }}
            autoFocus
            className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 pb-1 mb-2 focus:outline-none focus:border-gray-400 bg-transparent" />
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveEdit(memo.id) }}
            className="w-full text-sm text-gray-500 focus:outline-none resize-none bg-transparent" rows={3} />
          <div className="flex gap-2 mt-2">
            <button onClick={() => onSaveEdit(memo.id)} className="text-xs bg-gray-800 text-white px-3 py-1 rounded-lg hover:bg-gray-700">저장</button>
            <button onClick={onCancelEdit} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(memo)}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[memo.tag]}`}>{memo.tag}</span>
              <span className="text-xs text-gray-300">{format(parseISO(memo.created_at), 'M/d HH:mm', { locale: ko })}</span>
            </div>
            <p className="text-sm font-medium text-gray-800 mb-0.5">{memo.title}</p>
            {memo.content && <p className="text-xs text-gray-500 whitespace-pre-wrap">{memo.content}</p>}
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
            <button onClick={() => onEdit(memo)} className="text-xs text-gray-300 hover:text-gray-600">수정</button>
            <button onClick={() => onDelete(memo.id)} className="text-xs text-gray-200 hover:text-red-400">삭제</button>
          </div>
        </div>
      )}
    </div>
  )
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

  const notices = memos.filter(m => m.tag === '공지')
  const otherMemos = memos.filter(m => m.tag !== '공지')
  const filteredOther = tagFilter === '전체' ? otherMemos : otherMemos.filter(m => m.tag === tagFilter)

  const cardProps = { editingId, editTitle, editContent, editTag, setEditTitle, setEditContent, setEditTag, onSaveEdit: saveEdit, onCancelEdit: () => setEditingId(null) }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">메모</h1>
        <span className="text-sm text-gray-400">공지 {notices.length} · 기타 {otherMemos.length}</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-20 animate-pulse" />)}</div>
      ) : (
        <div className="flex gap-5">
          {/* 왼쪽: 공지 (항상 고정) */}
          <div className="w-72 flex-shrink-0">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-xs font-semibold text-red-500">📌 공지</span>
              <span className="text-xs text-gray-300">{notices.length}</span>
            </div>
            {notices.length === 0 ? (
              <div className="text-center py-10 bg-red-50 rounded-xl border border-red-100">
                <p className="text-xs text-red-200">공지가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notices.map(memo => (
                  <div key={memo.id} className="bg-red-50 rounded-xl border border-red-100 p-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => startEdit(memo)}>
                        {editingId === memo.id ? (
                          <div>
                            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(memo.id); if (e.key === 'Escape') setEditingId(null) }}
                              autoFocus
                              className="w-full text-sm font-medium text-gray-800 border-b border-red-200 pb-1 mb-1 focus:outline-none bg-transparent" />
                            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                              className="w-full text-xs text-gray-500 focus:outline-none resize-none bg-transparent" rows={2} />
                            <div className="flex gap-2 mt-1">
                              <button onClick={() => saveEdit(memo.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">저장</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">취소</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-red-700 mb-0.5">{memo.title}</p>
                            {memo.content && <p className="text-xs text-red-600 whitespace-pre-wrap">{memo.content}</p>}
                            <p className="text-xs text-red-300 mt-0.5">{format(parseISO(memo.created_at), 'M/d HH:mm', { locale: ko })}</p>
                          </>
                        )}
                      </div>
                      {editingId !== memo.id && (
                        <button onClick={() => deleteMemo(memo.id)}
                          className="text-xs text-red-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">삭제</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 오른쪽: 나머지 필터 */}
          <div className="flex-1 min-w-0">
            {/* 태그 필터 */}
            <div className="flex gap-1.5 mb-3">
              {(['전체', ...NON_NOTICE_TAGS] as (MemoTag | '전체')[]).map(t => (
                <button key={t} onClick={() => setTagFilter(t)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-colors ${tagFilter === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {t}
                </button>
              ))}
            </div>

            {filteredOther.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-300 text-sm mb-2">메모가 없습니다</p>
                <p className="text-gray-200 text-xs">Ctrl+2 또는 우하단 + 버튼으로 추가하세요</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredOther.map(memo => (
                  <MemoCard key={memo.id} memo={memo} onEdit={startEdit} onDelete={deleteMemo} {...cardProps} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
