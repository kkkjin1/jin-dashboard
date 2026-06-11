'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { QuickMemo, MemoTag } from '@/types'

const NON_NOTICE_TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어']

const TAG_COLORS: Record<MemoTag, string> = {
  '공지': 'border-t-red-400',
  '업무관련': 'border-t-blue-400',
  '회의관련': 'border-t-purple-400',
  '아이디어': 'border-t-amber-400',
}

const TAG_BADGE: Record<MemoTag, string> = {
  '공지': 'bg-red-50 text-red-600',
  '업무관련': 'bg-blue-50 text-blue-600',
  '회의관련': 'bg-purple-50 text-purple-600',
  '아이디어': 'bg-amber-50 text-amber-600',
}

interface MemoCardProps {
  memo: QuickMemo
  onEdit: (m: QuickMemo) => void
  onDelete: (id: string) => void
  draggable?: boolean
  onDragStart?: () => void
}

function MemoCard({ memo, onEdit, onDelete, draggable: drag, onDragStart }: MemoCardProps) {
  return (
    <div
      draggable={drag}
      onDragStart={onDragStart}
      className="bg-white rounded-xl border border-gray-100 p-3 group hover:border-gray-200 transition-colors cursor-pointer select-none"
      onClick={() => onEdit(memo)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 mb-0.5 leading-snug">{memo.title}</p>
          {memo.content && <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3">{memo.content}</p>}
          <p className="text-xs text-gray-300 mt-1">{format(parseISO(memo.created_at), 'M/d HH:mm', { locale: ko })}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(memo.id) }}
          className="text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">삭제</button>
      </div>
    </div>
  )
}

interface EditModalProps {
  memo: QuickMemo
  onSave: (id: string, title: string, content: string, tag: MemoTag) => void
  onClose: () => void
}

function EditModal({ memo, onSave, onClose }: EditModalProps) {
  const [title, setTitle] = useState(memo.title)
  const [content, setContent] = useState(memo.content)
  const [tag, setTag] = useState<MemoTag>(memo.tag)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-96" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 mb-4">메모 수정</h3>
        <div className="flex gap-1.5 mb-3">
          {(['업무관련','회의관련','아이디어','공지'] as MemoTag[]).map(t => (
            <button key={t} onClick={() => setTag(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tag === t ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400'}`}>
              {t}
            </button>
          ))}
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(memo.id, title, content, tag) }}
          autoFocus
          className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 pb-1 mb-3 focus:outline-none" />
        <textarea value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(memo.id, title, content, tag) }}
          className="w-full text-sm text-gray-500 focus:outline-none resize-none border border-gray-100 rounded-lg p-2" rows={4} />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">취소</button>
          <button onClick={() => onSave(memo.id, title, content, tag)}
            className="text-xs bg-gray-800 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700">저장</button>
        </div>
      </div>
    </div>
  )
}

export default function MemosPage() {
  const [memos, setMemos] = useState<QuickMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<QuickMemo | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverTag, setDragOverTag] = useState<MemoTag | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('quick_memos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setMemos((data ?? []) as QuickMemo[]); setLoading(false) })
  }, [])

  async function saveEdit(id: string, title: string, content: string, tag: MemoTag) {
    if (!title.trim()) return
    await supabase.from('quick_memos').update({ title: title.trim(), content: content.trim(), tag }).eq('id', id)
    setMemos(prev => prev.map(m => m.id === id ? { ...m, title: title.trim(), content: content.trim(), tag } : m))
    setEditing(null)
  }

  async function deleteMemo(id: string) {
    if (!confirm('메모를 삭제하시겠습니까?')) return
    await supabase.from('quick_memos').delete().eq('id', id)
    setMemos(prev => prev.filter(m => m.id !== id))
  }

  async function handleDropOnTag(tag: MemoTag) {
    if (!draggingId) return
    const memo = memos.find(m => m.id === draggingId)
    if (!memo || memo.tag === tag) { setDraggingId(null); setDragOverTag(null); return }
    await supabase.from('quick_memos').update({ tag }).eq('id', draggingId)
    setMemos(prev => prev.map(m => m.id === draggingId ? { ...m, tag } : m))
    setDraggingId(null)
    setDragOverTag(null)
  }

  const notices = memos.filter(m => m.tag === '공지')

  if (loading) return (
    <div className="p-8">
      <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 h-20 animate-pulse" />)}</div>
    </div>
  )

  return (
    <div className="p-8">
      {editing && <EditModal memo={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">메모</h1>
        <span className="text-sm text-gray-400">총 {memos.length}개</span>
      </div>

      {/* 상단: 공지 구역 (칸반 수평) */}
      <div className="mb-6"
        onDragOver={e => { e.preventDefault(); setDragOverTag('공지') }}
        onDragLeave={() => setDragOverTag(null)}
        onDrop={() => handleDropOnTag('공지')}>
        <div className={`border-2 border-t-4 ${TAG_COLORS['공지']} rounded-xl p-4 transition-colors ${dragOverTag === '공지' ? 'border-red-300 bg-red-50/30' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-red-500">📌 공지</span>
            <span className="text-xs text-gray-400">{notices.length}</span>
          </div>
          {notices.length === 0 ? (
            <p className="text-xs text-gray-300 py-2">공지 메모를 여기로 드래그하거나 퀵메모에서 '공지'로 추가하세요</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {notices.map(memo => (
                <div key={memo.id} className="flex-shrink-0 w-52">
                  <MemoCard memo={memo} onEdit={setEditing} onDelete={deleteMemo}
                    draggable onDragStart={() => setDraggingId(memo.id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 하단: 3-column 칸반 */}
      <div className="grid grid-cols-3 gap-4">
        {NON_NOTICE_TAGS.map(tag => {
          const colMemos = memos.filter(m => m.tag === tag)
          const isOver = dragOverTag === tag
          return (
            <div key={tag}
              onDragOver={e => { e.preventDefault(); setDragOverTag(tag) }}
              onDragLeave={() => setDragOverTag(null)}
              onDrop={() => handleDropOnTag(tag)}
              className={`border-2 border-t-4 ${TAG_COLORS[tag]} rounded-xl p-4 min-h-48 transition-colors ${isOver ? 'bg-blue-50/20 border-blue-200' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TAG_BADGE[tag]}`}>{tag}</span>
                <span className="text-xs text-gray-400">{colMemos.length}</span>
              </div>
              <div className="space-y-2">
                {colMemos.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-6">없음</p>
                ) : (
                  colMemos.map(memo => (
                    <MemoCard key={memo.id} memo={memo} onEdit={setEditing} onDelete={deleteMemo}
                      draggable onDragStart={() => setDraggingId(memo.id)} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
