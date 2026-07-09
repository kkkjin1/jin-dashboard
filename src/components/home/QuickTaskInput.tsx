'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaGroup, AgendaItem, AgendaSubTask } from '@/types'

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return 100 + (q.length / t.length) * 50
  const qWords = q.split(/\s+/).filter(Boolean)
  let matched = 0
  for (const qw of qWords) {
    if (t.split(/\s+/).some(tw => tw.includes(qw) || qw.includes(tw))) matched++
  }
  return matched === 0 ? 0 : (matched / qWords.length) * 60
}

interface SearchResult {
  itemId: string
  subtaskId?: string
  title: string
  groupName: string
  groupColor: string
  parentTitle?: string
  score: number
}

export default function QuickTaskInput() {
  const [searchInput, setSearchInput] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [groups, setGroups] = useState<AgendaGroup[]>([])
  const [items, setItems] = useState<AgendaItem[]>([])
  const [subTasks, setSubTasks] = useState<AgendaSubTask[]>([])
  const [loaded, setLoaded] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    Promise.all([
      supabase.from('agenda_groups').select('id, name, color, category, sort_order, is_open, created_at'),
      supabase.from('agenda_items').select('id, title, group_id, status').neq('status', 'done'),
      supabase.from('agenda_sub_tasks').select('id, title, agenda_item_id, status').neq('status', 'done'),
    ]).then(([{ data: g }, { data: i }, { data: s }]) => {
      setGroups((g ?? []) as AgendaGroup[])
      setItems((i ?? []) as AgendaItem[])
      setSubTasks((s ?? []) as AgendaSubTask[])
      setLoaded(true)
    })
  }, [])

  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    if (!searchInput.trim() || !loaded) { setResults([]); setSelectedIdx(0); return }

    const groupMap = Object.fromEntries(groups.map(g => [g.id, g]))
    const itemMap = Object.fromEntries(items.map(i => [i.id, i]))

    const all: SearchResult[] = []

    items.forEach(item => {
      const score = fuzzyScore(searchInput, item.title)
      if (score <= 0) return
      const group = groupMap[item.group_id]
      all.push({ itemId: item.id, title: item.title, groupName: group?.name ?? '', groupColor: group?.color ?? '#9CA3AF', score })
    })

    subTasks.forEach(st => {
      const score = fuzzyScore(searchInput, st.title)
      if (score <= 0) return
      const parent = itemMap[st.agenda_item_id]
      const group = parent ? groupMap[parent.group_id] : undefined
      all.push({
        itemId: st.agenda_item_id,
        subtaskId: st.id,
        title: st.title,
        groupName: group?.name ?? '',
        groupColor: group?.color ?? '#9CA3AF',
        parentTitle: parent?.title,
        score,
      })
    })

    setResults(all.sort((a, b) => b.score - a.score).slice(0, 7))
    setSelectedIdx(0)
  }, [searchInput, items, subTasks, groups, loaded])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[selectedIdx]) go(results[selectedIdx]) }
    else if (e.key === 'Escape') { e.preventDefault(); setSearchInput(''); setResults([]); searchRef.current?.blur() }
  }

  function go(r: SearchResult) {
    const url = r.subtaskId ? `/project/items/${r.itemId}?focus=${r.subtaskId}` : `/project/items/${r.itemId}`
    setSearchInput(''); setResults([])
    router.push(url)
  }

  return (
    <div className="flex-shrink-0">
      <div className={`bg-white border rounded-xl transition-all ${searchInput ? 'border-[#C7D8F0]/80 shadow-sm' : 'border-gray-100'}`}>
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="text-gray-300 text-sm flex-shrink-0">🔍</span>
          <input
            ref={searchRef}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="안건 · 세부업무 검색 — 예) 보상체계, 평가시뮬"
            className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent min-w-0"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setResults([]) }}
              className="text-gray-300 hover:text-gray-500 text-sm flex-shrink-0">✕</button>
          )}
        </div>

        {results.length > 0 && (
          <div className="border-t border-gray-50 pb-1">
            {results.map((r, i) => {
              const isSel = i === selectedIdx
              return (
                <button
                  key={`${r.itemId}-${r.subtaskId ?? ''}`}
                  onMouseDown={e => { e.preventDefault(); go(r) }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${isSel ? 'bg-[#C7D8F0]/20' : 'hover:bg-gray-50'}`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: r.groupColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{r.groupName}</span>
                      {r.parentTitle && (
                        <>
                          <span className="text-[10px] text-gray-300">›</span>
                          <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{r.parentTitle}</span>
                        </>
                      )}
                    </div>
                    <span className={`text-xs ${isSel ? 'text-[#1B3A6B] font-medium' : 'text-gray-700'}`}>
                      {r.title}
                    </span>
                  </div>
                  {r.subtaskId && (
                    <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">세부</span>
                  )}
                  {isSel && <span className="text-[10px] text-gray-300 flex-shrink-0">Enter ↵</span>}
                </button>
              )
            })}
          </div>
        )}

        {searchInput && results.length === 0 && loaded && (
          <div className="border-t border-gray-50 px-4 py-2">
            <p className="text-xs text-gray-300">일치하는 안건이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  )
}
