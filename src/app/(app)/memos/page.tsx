'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { QuickMemo, MemoTag } from '@/types'

const TAGS: (MemoTag | '전체')[] = ['전체', '업무관련', '회의관련', '아이디어']

const TAG_COLORS: Record<MemoTag, string> = {
  '업무관련': 'bg-blue-50 text-blue-600',
  '회의관련': 'bg-purple-50 text-purple-600',
  '아이디어': 'bg-amber-50 text-amber-600',
}

export default function MemosPage() {
  const [memos, setMemos] = useState<QuickMemo[]>([])
  const [tagFilter, setTagFilter] = useState<MemoTag | '전체'>('전체')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('quick_memos')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setMemos((data ?? []) as QuickMemo[])
        setLoading(false)
      })
  }, [])

  async function deleteMemo(id: string) {
    if (!confirm('메모를 삭제하시겠습니까?')) return
    await supabase.from('quick_memos').delete().eq('id', id)
    setMemos(prev => prev.filter(m => m.id !== id))
  }

  const filtered = tagFilter === '전체' ? memos : memos.filter(m => m.tag === tagFilter)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">메모</h1>
        <span className="text-sm text-gray-400">{filtered.length}개</span>
      </div>

      {/* 태그 필터 */}
      <div className="flex gap-1.5 mb-6">
        {TAGS.map(t => (
          <button
            key={t}
            onClick={() => setTagFilter(t as MemoTag | '전체')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              tagFilter === t
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-300 text-sm mb-2">메모가 없습니다</p>
          <p className="text-gray-200 text-xs">우하단 + 버튼으로 빠른 메모를 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(memo => (
            <div key={memo.id} className="bg-white rounded-xl border border-gray-100 p-4 group hover:border-gray-200 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[memo.tag]}`}>
                      {memo.tag}
                    </span>
                    <span className="text-xs text-gray-300">
                      {format(parseISO(memo.created_at), 'M월 d일 HH:mm', { locale: ko })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mb-1">{memo.title}</p>
                  {memo.content && (
                    <p className="text-sm text-gray-500 whitespace-pre-wrap">{memo.content}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteMemo(memo.id)}
                  className="text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
