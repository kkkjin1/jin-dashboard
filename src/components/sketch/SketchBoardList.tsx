'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Trash2, PenTool } from 'lucide-react'
import type { SketchBoard } from '@/types'

type BoardWithCount = SketchBoard & { sketch_cards?: { count: number }[] }

export default function SketchBoardList() {
  const supabase = createClient()
  const router = useRouter()

  const [boards, setBoards] = useState<BoardWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('sketch_boards').select('*, sketch_cards(count)').order('updated_at', { ascending: false })
      .then(({ data }) => { setBoards((data ?? []) as BoardWithCount[]); setLoading(false) })
  }, [])

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  async function handleAdd() {
    const name = newName.trim()
    if (!name) { setAdding(false); return }
    const { data, error } = await supabase.from('sketch_boards').insert({ name }).select().single()
    if (error || !data) { console.error('보드 생성 실패:', error?.message); return }
    router.push(`/sketch/${data.id}`)
  }

  async function deleteBoard(id: string, name: string) {
    if (!confirm(`'${name}' 보드를 삭제하시겠습니까? 안의 카드도 모두 삭제됩니다.`)) return
    await supabase.from('sketch_boards').delete().eq('id', id)
    setBoards(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-start pt-6 pb-3">
        <div>
          <h1 className="text-[20px] font-bold flex items-center gap-2" style={{ color: '#E2E8F0' }}>
            <PenTool size={18} strokeWidth={1.75} />
            생각스케치
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'rgba(226,232,240,0.35)' }}>
            무한 캔버스에 생각을 자유롭게 흩어놓는 보드입니다.
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => (adding ? setAdding(false) : setAdding(true))}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors"
            style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: '#9DBEF5' }}
          >
            + 새 보드
          </button>
        </div>
      </div>

      {/* 새 보드 입력 폼 */}
      {adding && (
        <div
          className="flex-shrink-0 rounded-2xl px-5 py-4 mb-4 flex items-center gap-2"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd()
              if (e.key === 'Escape') { setAdding(false); setNewName('') }
            }}
            placeholder="보드 이름 입력 후 Enter (예: 채용, 평가보상)"
            className="flex-1 text-[13px] bg-transparent focus:outline-none placeholder:text-[rgba(226,232,240,0.3)]"
            style={{ color: '#E2E8F0' }}
          />
          <button
            onClick={handleAdd}
            className="text-[12px] px-4 py-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ background: 'rgba(76,127,224,0.2)', border: '1px solid rgba(76,127,224,0.3)', color: '#9DBEF5' }}
          >
            만들기
          </button>
          <button
            onClick={() => { setAdding(false); setNewName('') }}
            className="text-[12px] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'rgba(226,232,240,0.4)' }}
          >
            취소
          </button>
        </div>
      )}

      {/* 보드 그리드 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-[13px]" style={{ color: 'rgba(226,232,240,0.3)' }}>아직 보드가 없습니다</p>
            <button
              onClick={() => setAdding(true)}
              className="text-[12px] px-4 py-1.5 rounded-full transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}
            >
              첫 보드 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-6">
            {boards.map(board => (
              <div
                key={board.id}
                onClick={() => router.push(`/sketch/${board.id}`)}
                className="group relative h-28 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)')}
              >
                <p className="text-[14px] font-semibold truncate pr-6" style={{ color: '#E2E8F0' }}>{board.name}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.35)' }}>
                    카드 {board.sketch_cards?.[0]?.count ?? 0}개
                  </span>
                  <span className="text-[10px]" style={{ color: 'rgba(226,232,240,0.28)' }}>
                    {format(parseISO(board.updated_at), 'M/d', { locale: ko })}
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteBoard(board.id, board.name) }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'rgba(226,232,240,0.28)' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#f87171')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(226,232,240,0.28)')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
