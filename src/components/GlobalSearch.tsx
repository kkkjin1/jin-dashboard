'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Task, Meeting, QuickMemo } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  '진행필요': 'bg-gray-100 text-gray-500',
  '진행중': 'bg-blue-50 text-blue-600',
  '완료': 'bg-green-50 text-green-600',
}

interface AgendaItem { id: string; title: string; status: string; group_name: string }
interface AgendaSubTask { id: string; title: string; status: string; agenda_item_id: string; item_title: string }

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title'>[]>([])
  const [memos, setMemos] = useState<Pick<QuickMemo, 'id' | 'title' | 'tag'>[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])
  const [agendaSubTasks, setAgendaSubTasks] = useState<AgendaSubTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      if (!loaded) {
        Promise.all([
          supabase.from('tasks').select('id, title, status, part, type').order('created_at', { ascending: false }),
          supabase.from('meetings').select('id, title').order('created_at', { ascending: false }),
          supabase.from('quick_memos').select('id, title, tag').order('created_at', { ascending: false }),
          supabase.from('agenda_items').select('id, title, status, agenda_groups(name)').neq('status', 'done').order('sort_order'),
          supabase.from('agenda_sub_tasks').select('id, title, status, agenda_item_id, agenda_items(title)').neq('status', 'done').order('sort_order'),
        ]).then(([{ data: t }, { data: m }, { data: memo }, { data: ai }, { data: ast }]) => {
          setTasks((t ?? []) as Task[])
          setMeetings((m ?? []) as Pick<Meeting, 'id' | 'title'>[])
          setMemos((memo ?? []) as Pick<QuickMemo, 'id' | 'title' | 'tag'>[])
          setAgendaItems((ai ?? []).map((a: any) => {
            const g = Array.isArray(a.agenda_groups) ? a.agenda_groups[0] : a.agenda_groups
            return { id: a.id, title: a.title, status: a.status, group_name: g?.name ?? '' }
          }))
          setAgendaSubTasks((ast ?? []).map((s: any) => {
            const item = Array.isArray(s.agenda_items) ? s.agenda_items[0] : s.agenda_items
            return { id: s.id, title: s.title, status: s.status, agenda_item_id: s.agenda_item_id, item_title: item?.title ?? '' }
          }))
          setLoaded(true)
        })
      }
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const matchedTasks = q ? tasks.filter(t => t.title?.toLowerCase().includes(q)).slice(0, 4) : []
  const matchedMeetings = q ? meetings.filter(m => m.title?.toLowerCase().includes(q)).slice(0, 3) : []
  const matchedMemos = q ? memos.filter(m => m.title?.toLowerCase().includes(q)).slice(0, 3) : []
  const matchedAgendaItems = q ? agendaItems.filter(a => a.title?.toLowerCase().includes(q) || a.group_name?.toLowerCase().includes(q)).slice(0, 5) : []
  const matchedAgendaSubTasks = q ? agendaSubTasks.filter(s => s.title?.toLowerCase().includes(q) || s.item_title?.toLowerCase().includes(q)).slice(0, 4) : []
  const hasResults = matchedTasks.length > 0 || matchedMeetings.length > 0 || matchedMemos.length > 0 || matchedAgendaItems.length > 0 || matchedAgendaSubTasks.length > 0

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={() => { setOpen(false); setQuery('') }} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[560px] max-w-[90vw] bg-white rounded-2xl shadow-2xl z-[60] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <span className="text-gray-400 text-sm">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="안건 · 세부업무 · 업무 · 회의록 · 메모 검색..."
            className="flex-1 text-sm text-gray-700 focus:outline-none bg-transparent"
          />
          <kbd className="text-[10px] text-gray-300 bg-gray-100 px-2 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {!q ? (
            <p className="text-xs text-gray-300 text-center py-6">검색어를 입력하세요</p>
          ) : !hasResults ? (
            <p className="text-xs text-gray-400 text-center py-6">검색 결과 없음</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {matchedAgendaItems.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">프로젝트 안건</p>
                  {matchedAgendaItems.map(a => (
                    <div key={a.id} className="py-2 px-2 hover:bg-gray-50 rounded-lg flex items-center gap-2.5 cursor-pointer"
                      onClick={() => { router.push(`/project/items/${a.id}`); setOpen(false); setQuery('') }}>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">{a.group_name || '안건'}</span>
                      <span className="text-sm text-gray-800 truncate">{a.title || '제목 없음'}</span>
                    </div>
                  ))}
                </div>
              )}
              {matchedAgendaSubTasks.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">세부업무</p>
                  {matchedAgendaSubTasks.map(s => (
                    <div key={s.id} className="py-2 px-2 hover:bg-gray-50 rounded-lg flex items-center gap-2.5 cursor-pointer"
                      onClick={() => { router.push(`/project/items/${s.agenda_item_id}?focus=${s.id}`); setOpen(false); setQuery('') }}>
                      <span className="text-xs text-purple-300 flex-shrink-0">└</span>
                      <span className="text-sm text-gray-800 truncate">{s.title || '제목 없음'}</span>
                      <span className="text-[10px] text-gray-300 ml-auto flex-shrink-0 truncate max-w-[100px]">{s.item_title}</span>
                    </div>
                  ))}
                </div>
              )}
              {matchedTasks.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">업무</p>
                  {matchedTasks.map(t => (
                    <Link key={t.id} href={`/tasks/${t.id}`} onClick={() => { setOpen(false); setQuery('') }}>
                      <div className="py-2 px-2 hover:bg-gray-50 rounded-lg flex items-center gap-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                        <span className="text-sm text-gray-800 truncate">{t.title || '제목 없음'}</span>
                        <span className="text-xs text-gray-300 ml-auto flex-shrink-0">{t.part} · {t.type}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {matchedMeetings.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">회의록</p>
                  {matchedMeetings.map(m => (
                    <div key={m.id} className="group/row py-2 px-2 hover:bg-gray-50 rounded-lg flex items-center gap-2">
                      <Link href={`/meetings/${m.id}`} onClick={() => { setOpen(false); setQuery('') }}
                        className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-emerald-400 flex-shrink-0">💬</span>
                        <span className="text-sm text-gray-800 truncate">{m.title || '제목 없음'}</span>
                      </Link>
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          if (!confirm(`'${m.title}' 회의록을 삭제하시겠습니까?`)) return
                          await supabase.from('meetings').delete().eq('id', m.id)
                          setMeetings(prev => prev.filter(x => x.id !== m.id))
                        }}
                        className="opacity-0 group-hover/row:opacity-100 flex-shrink-0 text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded transition-all">
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {matchedMemos.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">메모</p>
                  {matchedMemos.map(m => (
                    <Link key={m.id} href="/memos"
                      onClick={() => { localStorage.setItem('memos_open_id', m.id); setOpen(false); setQuery('') }}>
                      <div className="py-2 px-2 hover:bg-gray-50 rounded-lg flex items-center gap-2">
                        <span className="text-xs text-gray-400">📝</span>
                        <span className="text-sm text-gray-800 truncate">{m.title || '제목 없음'}</span>
                        <span className="text-[10px] text-gray-300 ml-auto flex-shrink-0">{m.tag}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-3">
          <span className="text-[10px] text-gray-300">Ctrl+K 열기/닫기 · ESC 닫기 · Enter 이동</span>
        </div>
      </div>
    </>
  )
}
