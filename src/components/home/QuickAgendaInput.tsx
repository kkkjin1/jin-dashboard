'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function parseDate(text: string): { date: string | null; cleaned: string } {
  const today = new Date()
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
  const dayMap: Record<string, number> = {
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
    '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6,
  }
  const nextWeekday = (t: number) => {
    const d = new Date(today); d.setDate(d.getDate() + ((t - d.getDay() + 7) % 7 || 7)); return d
  }
  const nextNextWeekday = (t: number) => {
    const d = nextWeekday(t); d.setDate(d.getDate() + 7); return d
  }
  const patterns: { re: RegExp; fn: (m: RegExpMatchArray) => string }[] = [
    { re: /(\d{1,2})\/(\d{1,2})/, fn: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /(\d{1,2})월\s*(\d{1,2})일/, fn: m => toISO(new Date(today.getFullYear(), +m[1] - 1, +m[2])) },
    { re: /오늘/, fn: () => toISO(today) },
    { re: /내일/, fn: () => toISO(addDays(1)) },
    { re: /모레/, fn: () => toISO(addDays(2)) },
    { re: /이번\s*달\s*(말|끝)?/, fn: () => toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)) },
    { re: /이번\s*주\s*(내|말|끝|금요일|금)?/, fn: () => toISO(nextWeekday(5)) },
    { re: /이번\s*주\s*(월|화|수|목|토|일|월요일|화요일|수요일|목요일|토요일|일요일)/, fn: m => toISO(nextWeekday(dayMap[m[1].replace(/요일$/, '')] ?? 5)) },
    { re: /다음\s*주\s*(월|화|수|목|금|토|일|월요일|화요일|수요일|목요일|금요일|토요일|일요일|내|말|끝)?/, fn: m => toISO(nextNextWeekday(dayMap[(m[1] ?? '').replace(/요일$/, '')] ?? 5)) },
  ]
  for (const { re, fn } of patterns) {
    const m = text.match(re)
    if (m) return { date: fn(m), cleaned: text.replace(re, '').replace(/\s{2,}/g, ' ').trim() }
  }
  return { date: null, cleaned: text }
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return 100 + (q.length / t.length) * 50
  const qWords = q.split(/\s+/).filter(Boolean)
  const tWords = t.split(/\s+/).filter(Boolean)
  let matched = 0
  for (const qw of qWords) {
    if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) matched++
  }
  return matched === 0 ? 0 : (matched / qWords.length) * 60
}

interface AgendaItemOption {
  id: string
  title: string
  groupName: string | null
}

export interface AddedSubTask {
  id: string
  title: string
  target_date: string | null
  status: string
  agenda_item_id: string
  agenda_items: {
    id: string
    title: string
    agenda_groups: { id: string; name: string } | null
  } | null
}

interface Props {
  onAdded?: (st: AddedSubTask) => void
}

export default function QuickAgendaInput({ onAdded }: Props) {
  const [items, setItems] = useState<AgendaItemOption[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [matches, setMatches] = useState<AgendaItemOption[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [selectedItem, setSelectedItem] = useState<AgendaItemOption | null>(null)
  const [stInput, setStInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const stRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const phase = selectedItem ? 'input' : 'search'
  const { date: parsedDate, cleaned: stTitle } = stInput.trim()
    ? parseDate(stInput.trim())
    : { date: null, cleaned: '' }

  useEffect(() => {
    supabase
      .from('agenda_items')
      .select('id, title, status, agenda_groups(name)')
      .neq('status', 'done')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        if (data) setItems((data as any[]).map(i => ({
          id: i.id,
          title: i.title,
          groupName: i.agenda_groups?.name ?? null,
        })))
      })
  }, [])

  useEffect(() => {
    if (!searchInput.trim()) { setMatches([]); setSelectedIdx(0); return }
    const results = items
      .map(i => ({ i, score: fuzzyScore(searchInput, `${i.groupName ? i.groupName + ' ' : ''}${i.title}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.i)
    setMatches(results)
    setSelectedIdx(0)
  }, [searchInput, items])

  useEffect(() => { searchRef.current?.focus() }, [])
  useEffect(() => { if (selectedItem) stRef.current?.focus() }, [selectedItem])

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[selectedIdx]) selectItem(matches[selectedIdx]) }
    else if (e.key === 'Escape') { e.preventDefault(); setSearchInput(''); setMatches([]) }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSelectedItem(null); setStInput(''); searchRef.current?.focus() }
  }

  function selectItem(item: AgendaItemOption) {
    setSelectedItem(item); setSearchInput(''); setMatches([])
  }

  function reset() {
    setSearchInput(''); setMatches([]); setSelectedIdx(0); setSelectedItem(null); setStInput('')
  }

  async function handleSubmit() {
    if (!stTitle || !selectedItem || saving) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const targetDate = parsedDate ?? today
    const { data } = await supabase
      .from('agenda_sub_tasks')
      .insert({
        agenda_item_id: selectedItem.id,
        title: stTitle,
        status: 'active',
        sort_order: 0,
        target_date: targetDate,
      })
      .select('id')
      .single()
    if (data) {
      const label = selectedItem.groupName
        ? `${selectedItem.groupName} · ${selectedItem.title} › ${stTitle}`
        : `${selectedItem.title} › ${stTitle}`
      setLastAdded(label)
      onAdded?.({
        id: (data as { id: string }).id,
        title: stTitle,
        target_date: targetDate,
        status: 'active',
        agenda_item_id: selectedItem.id,
        agenda_items: {
          id: selectedItem.id,
          title: selectedItem.title,
          agenda_groups: selectedItem.groupName ? { id: '', name: selectedItem.groupName } : null,
        },
      })
    }
    reset()
    setSaving(false)
    searchRef.current?.focus()
  }

  return (
    <div className="flex-shrink-0">
      <div className={`bg-white border rounded-xl transition-all ${(searchInput || selectedItem) ? 'border-[#BADEC8]/80 shadow-sm' : 'border-gray-100'}`}>

        {phase === 'search' && (
          <>
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="text-gray-300 text-sm flex-shrink-0">+</span>
              <input
                ref={searchRef}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="안건 검색 후 Enter — 예) 평가, 보상체계"
                className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent min-w-0"
              />
            </div>
            {matches.length > 0 && (
              <div className="border-t border-gray-50 pb-1">
                {matches.map((item, i) => {
                  const isSelected = i === selectedIdx
                  return (
                    <button
                      key={item.id}
                      onMouseDown={e => { e.preventDefault(); selectItem(item) }}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${isSelected ? 'bg-[#BADEC8]/20' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-[#2D5A45]' : 'bg-gray-200'}`} />
                      <span className={`text-xs min-w-0 truncate ${isSelected ? 'text-[#2D5A45] font-medium' : 'text-gray-500'}`}>
                        {item.groupName && <span className={isSelected ? 'text-[#2D5A45]/60' : 'text-gray-400'}>{item.groupName} · </span>}
                        {item.title}
                      </span>
                      {isSelected && <span className="ml-auto text-[10px] text-gray-300 flex-shrink-0">Enter ↵</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {searchInput && matches.length === 0 && (
              <div className="border-t border-gray-50 px-4 py-2">
                <p className="text-xs text-gray-300">일치하는 안건 없음</p>
              </div>
            )}
          </>
        )}

        {phase === 'input' && selectedItem && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-medium text-[#2D5A45] bg-[#BADEC8]/25 px-2 py-0.5 rounded-md truncate">
                {selectedItem.groupName && <span className="text-[#2D5A45]/60">{selectedItem.groupName} · </span>}
                {selectedItem.title}
              </span>
              <button onClick={reset} className="ml-auto flex-shrink-0 text-[10px] text-gray-300 hover:text-gray-500">✕ 취소</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={stRef}
                value={stInput}
                onChange={e => setStInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="세부task — 예) 자료 준비 7/3까지 (날짜 없으면 오늘)"
                className="flex-1 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none bg-transparent min-w-0"
              />
              {stTitle && parsedDate && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                  {parsedDate.slice(5).replace('-', '/')}
                </span>
              )}
              {stTitle && (
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-shrink-0 text-[11px] bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1 rounded-lg hover:bg-[#D5E6F7] disabled:opacity-40 transition-colors"
                >
                  {saving ? '저장…' : '추가 ↵'}
                </button>
              )}
            </div>
          </div>
        )}

        {!searchInput && !selectedItem && lastAdded && (
          <div className="px-4 pb-2.5 flex items-center gap-1.5">
            <span className="text-[10px] text-[#2D5A45]">✓</span>
            <span className="text-[10px] text-gray-400 truncate">{lastAdded}</span>
          </div>
        )}
      </div>
    </div>
  )
}
