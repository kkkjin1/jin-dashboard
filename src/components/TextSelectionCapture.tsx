'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import type { MemoTag } from '@/types'

interface Props {
  sourceName: string
  sourceType: '업무' | '회의'
}

interface FloatPos {
  text: string
  x: number
  y: number
}

interface AgendaItemResult {
  id: string
  title: string
  groupName: string
}

const TAG_OPTIONS: { tag: MemoTag; label: string; cls: string }[] = [
  { tag: '아이디어', label: '아이디어', cls: 'bg-[#DCC8C8]/70 text-[#6A3A3A] border-[#CCA8A8]/60' },
  { tag: '업무관련', label: '업무관련', cls: 'bg-[#C8D8C8]/70 text-[#3A5A3A] border-[#A8C4A8]/60' },
  { tag: '회의관련', label: '회의관련', cls: 'bg-[#C8D0DC]/70 text-[#3A4A5A] border-[#A8B8CC]/60' },
]

type Mode = 'button' | 'memo' | 'link-item' | 'saved-memo' | 'saved-link'

export default function TextSelectionCapture({ sourceName, sourceType }: Props) {
  const [float, setFloat] = useState<FloatPos | null>(null)
  const [mode, setMode] = useState<Mode>('button')
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState<MemoTag>('아이디어')
  const [saving, setSaving] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [allItems, setAllItems] = useState<AgendaItemResult[]>([])
  const [itemSearching, setItemSearching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const dismiss = useCallback(() => {
    setFloat(null)
    setMode('button')
    setItemSearch('')
    setAllItems([])
  }, [])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (containerRef.current?.contains(e.target as Node)) return
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (text.length < 4) { setFloat(null); setMode('button'); return }
    const range = selection!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setFloat({ text, x: rect.left + rect.width / 2, y: rect.top })
    setTitle(text.split('\n')[0].replace(/#+\s*/g, '').trim().slice(0, 50))
    setTag('아이디어')
    setMode('button')
    setItemSearch('')
    setAllItems([])
  }, [])

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (containerRef.current?.contains(e.target as Node)) return
    dismiss()
  }, [dismiss])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [handleMouseUp, handleMouseDown])

  // link-item 모드 진입 시 전체 로드 (meetings 페이지와 동일한 패턴)
  useEffect(() => {
    if (mode !== 'link-item') return
    setItemSearching(true)
    supabase
      .from('agenda_items')
      .select('id, title, agenda_groups(name)')
      .neq('status', 'done')
      .order('sort_order')
      .then(({ data }) => {
        setAllItems(
          (data ?? []).map((d: any) => ({
            id: d.id,
            title: d.title,
            groupName: d.agenda_groups?.name ?? '',
          }))
        )
        setItemSearching(false)
      })
  }, [mode])

  async function saveMemo() {
    if (!float || !title.trim()) return
    setSaving(true)
    const content = `[${sourceType}: ${sourceName}]\n\n${float.text}`
    await supabase.from('quick_memos').insert({ title: title.trim(), content, tag })
    setSaving(false)
    setMode('saved-memo')
    window.getSelection()?.removeAllRanges()
    setTimeout(dismiss, 1000)
  }

  async function linkToItem(item: AgendaItemResult) {
    if (!float) return
    setSaving(true)
    const today = new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    const stTitle = `${sourceName.slice(0, 30)} · ${today}`

    // 기존 서브태스크의 최대 sort_order 조회
    const { data: existingSTs } = await supabase
      .from('agenda_sub_tasks')
      .select('sort_order')
      .eq('agenda_item_id', item.id)
      .order('sort_order', { ascending: false })
      .limit(1)
    const nextOrder = ((existingSTs?.[0] as any)?.sort_order ?? 0) + 1

    // 새 서브태스크 생성
    const { data: newST } = await supabase
      .from('agenda_sub_tasks')
      .insert({ agenda_item_id: item.id, title: stTitle, status: 'active', sort_order: nextOrder })
      .select()
      .single()

    // 선택된 텍스트를 노트로 추가
    if (newST) {
      const safeHtml = `<p>${float.text.replace(/\n/g, '</p><p>')}</p>`
      await supabase.from('sub_task_notes').insert({
        sub_task_id: (newST as any).id,
        title: `${sourceType} 발췌`,
        content: safeHtml,
      })
    }

    setSaving(false)
    setMode('saved-link')
    window.getSelection()?.removeAllRanges()
    setTimeout(dismiss, 1200)
  }

  if (!float || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: float.x,
        top: float.y,
        transform: 'translate(-50%, calc(-100% - 6px))',
        zIndex: 9999,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {mode === 'saved-memo' ? (
        <div className="flex items-center gap-1.5 bg-[#5DBD97] text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
          ✓ 메모에 저장됨
        </div>
      ) : mode === 'saved-link' ? (
        <div className="flex items-center gap-1.5 bg-[#3B82F6] text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
          ✓ 업무에 연동됨
        </div>
      ) : mode === 'button' ? (
        <div className="flex items-center gap-0 bg-[#1B3A6B]/90 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={() => setMode('memo')}
            className="text-white text-[11px] px-2.5 py-1.5 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            💡 메모
          </button>
          <div className="w-px h-4 bg-white/20 flex-shrink-0" />
          <button
            onClick={() => setMode('link-item')}
            className="text-white text-[11px] px-2.5 py-1.5 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            📌 업무 연동
          </button>
        </div>
      ) : mode === 'memo' ? (
        <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl shadow-2xl p-3 w-60">
          <div className="flex gap-1 mb-2 flex-wrap">
            {TAG_OPTIONS.map(({ tag: t, label, cls }) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                  tag === t ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]' : cls
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveMemo()
              if (e.key === 'Escape') dismiss()
            }}
            placeholder="메모 제목 (Enter 저장)"
            className="w-full text-xs text-gray-700 border-b border-gray-100 pb-1.5 mb-2 focus:outline-none bg-transparent"
          />
          <p className="text-[9px] text-gray-300 leading-relaxed line-clamp-2 mb-2">
            {float.text.slice(0, 60)}{float.text.length > 60 ? '…' : ''}
          </p>
          <p className="text-[9px] text-gray-300 mb-2">출처: {sourceType} · {sourceName.slice(0, 20)}</p>
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={dismiss}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-0.5 transition-colors"
            >
              취소
            </button>
            <button
              onClick={saveMemo}
              disabled={saving || !title.trim()}
              className="text-[10px] bg-[#1B3A6B] text-white px-3 py-1 rounded-lg hover:bg-[#22497E] disabled:opacity-40 transition-colors"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      ) : mode === 'link-item' ? (
        <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl shadow-2xl p-3 w-64">
          <p className="text-[10px] text-gray-500 mb-1.5 font-medium">어떤 업무에 추가할까요?</p>
          <input
            autoFocus
            value={itemSearch}
            onChange={e => setItemSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') dismiss() }}
            placeholder="업무명 검색…"
            className="w-full text-xs text-gray-700 border-b border-gray-100 pb-1.5 mb-1.5 focus:outline-none bg-transparent"
          />
          {itemSearching && (
            <p className="text-[9px] text-gray-300 mb-1">불러오는 중…</p>
          )}
          {!itemSearching && itemSearch.trim().length > 0 &&
            allItems.filter(i => i.title.includes(itemSearch.trim()) || i.groupName.includes(itemSearch.trim())).length === 0 && (
            <p className="text-[9px] text-gray-300 mb-1">결과 없음</p>
          )}
          <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
            {(itemSearch.trim()
              ? allItems.filter(i => i.title.includes(itemSearch.trim()) || i.groupName.includes(itemSearch.trim()))
              : allItems.slice(0, 8)
            ).map(item => (
              <button
                key={item.id}
                onClick={() => linkToItem(item)}
                disabled={saving}
                className="text-left text-[10px] px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40"
              >
                {item.groupName && (
                  <span className="text-gray-400 text-[9px]">{item.groupName} · </span>
                )}
                <span className="text-gray-700 font-medium">{item.title}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-between items-center mt-2">
            <p className="text-[9px] text-gray-300">업무 설명에 발췌 추가됨</p>
            <button
              onClick={dismiss}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-0.5 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  )
}
