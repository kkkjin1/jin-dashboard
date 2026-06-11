'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { format, isToday, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import SummaryCards from '@/components/home/SummaryCards'
import TaskColumn from '@/components/home/TaskColumn'
import HomeCalendar from '@/components/home/HomeCalendar'
import { fetchAllTasks, daysUntil, hasUpcomingMidDate, hasUpcomingEndDate } from '@/lib/tasks'
import { createClient } from '@/lib/supabase/client'
import type { Task, Meeting } from '@/types'

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchMeetings, setSearchMeetings] = useState<Pick<Meeting, 'id' | 'title'>[]>([])
  const [meetingsLoaded, setMeetingsLoaded] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const [shortcuts, setShortcuts] = useState<{id: string; title: string; url: string}[]>([])
  const [showAddShortcut, setShowAddShortcut] = useState(false)
  const [newShortcutTitle, setNewShortcutTitle] = useState('')
  const [newShortcutUrl, setNewShortcutUrl] = useState('')

  useEffect(() => {
    fetchAllTasks().then(data => { setTasks(data); setLoading(false) })
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('home_shortcuts')
      if (saved) setShortcuts(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function saveShortcuts(list: typeof shortcuts) {
    setShortcuts(list)
    localStorage.setItem('home_shortcuts', JSON.stringify(list))
  }

  function addShortcut() {
    if (!newShortcutUrl.trim()) return
    const url = newShortcutUrl.startsWith('http') ? newShortcutUrl : 'https://' + newShortcutUrl
    const title = newShortcutTitle.trim() || url
    const item = { id: Date.now().toString(), title, url }
    saveShortcuts([...shortcuts, item])
    setNewShortcutTitle(''); setNewShortcutUrl(''); setShowAddShortcut(false)
  }

  function removeShortcut(id: string) {
    saveShortcuts(shortcuts.filter(s => s.id !== id))
  }

  async function handleSearchChange(val: string) {
    setSearch(val)
    setSearchOpen(!!val)
    if (val && !meetingsLoaded) {
      const { data } = await supabase.from('meetings').select('id, title').order('created_at', { ascending: false })
      setSearchMeetings((data ?? []) as Pick<Meeting, 'id' | 'title'>[])
      setMeetingsLoaded(true)
    }
  }

  const q = search.trim().toLowerCase()
  const matchedTasks = q ? tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.retrospective?.improvement && t.retrospective.improvement.toLowerCase().includes(q))
  ).slice(0, 6) : []
  const matchedMeetings = q ? searchMeetings.filter(m => m.title.toLowerCase().includes(q)).slice(0, 4) : []
  const hasResults = matchedTasks.length > 0 || matchedMeetings.length > 0

  const active = tasks.filter(t => t.status !== '완료')
  const todayTasks = active.filter(t => t.end_date && isToday(parseISO(t.end_date)))
  const weekTasks = active
    .filter(t => { if (!t.end_date) return false; const d = daysUntil(t.end_date); return d >= 1 && d <= 6 })
    .sort((a, b) => daysUntil(a.end_date!) - daysUntil(b.end_date!))
  const midSoonTasks = active
    .filter(t => hasUpcomingMidDate(t) && daysUntil(t.mid_date!) <= 8)
    .sort((a, b) => daysUntil(a.mid_date!) - daysUntil(b.mid_date!))
  const endSoonTasks = active
    .filter(t => hasUpcomingEndDate(t))
    .sort((a, b) => daysUntil(a.end_date!) - daysUntil(b.end_date!))

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-emerald-600 font-medium mb-1">
            {format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">안녕하세요, 팀장님</h1>
          <p className="text-sm text-gray-400 mt-1">오늘과 이번주 마감을 한눈에 확인하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 검색 */}
          <div ref={searchRef} className="relative">
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white focus-within:border-gray-400 transition-colors">
              <span className="text-gray-400 text-sm">🔍</span>
              <input
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => { if (search) setSearchOpen(true) }}
                placeholder="업무·회의록 검색"
                className="text-sm text-gray-700 focus:outline-none w-44 bg-transparent"
              />
              {search && (
                <button onClick={() => { setSearch(''); setSearchOpen(false) }}
                  className="text-gray-300 hover:text-gray-500 text-base leading-none">×</button>
              )}
            </div>
            {searchOpen && (
              <div className="absolute top-full mt-1 right-0 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                {!hasResults ? (
                  <p className="text-xs text-gray-400 text-center py-4">검색 결과 없음</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {matchedTasks.length > 0 && (
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-gray-400 mb-1.5">업무</p>
                        {matchedTasks.map(t => (
                          <Link key={t.id} href={`/tasks/${t.id}`} onClick={() => setSearchOpen(false)}>
                            <div className="py-1.5 px-1 hover:bg-gray-50 rounded-lg flex items-center gap-2">
                              <span className="text-xs text-gray-400">≡</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-800 truncate block">{t.title || '제목 없음'}</span>
                                {t.retrospective?.improvement && t.retrospective.improvement.toLowerCase().includes(q) && (
                                  <span className="text-xs text-red-400 truncate block">개선: {t.retrospective.improvement.slice(0, 40)}</span>
                                )}
                              </div>
                              <span className={`text-xs ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full ${t.status === '완료' ? 'bg-green-50 text-green-600' : t.status === '진행중' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                    {matchedMeetings.length > 0 && (
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-gray-400 mb-1.5">회의록</p>
                        {matchedMeetings.map(m => (
                          <Link key={m.id} href={`/meetings/${m.id}`} onClick={() => setSearchOpen(false)}>
                            <div className="py-1.5 px-1 hover:bg-gray-50 rounded-lg flex items-center gap-2">
                              <span className="text-xs text-gray-400">💬</span>
                              <span className="text-sm text-gray-800 truncate">{m.title || '제목 없음'}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <Link href="/tasks"
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-4 py-2 transition-colors hover:bg-white whitespace-nowrap">
            전체 업무 보기 →
          </Link>
        </div>
      </div>

      {/* 바로가기 */}
      <div className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {shortcuts.map(s => (
            <div key={s.id} className="group relative">
              <a href={s.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 hover:text-gray-800 transition-colors">
                <span className="text-gray-400">🔗</span>
                <span>{s.title}</span>
              </a>
              <button onClick={() => removeShortcut(s.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-400 text-white rounded-full text-xs leading-none items-center justify-center hidden group-hover:flex hover:bg-red-500 transition-colors">
                ×
              </button>
            </div>
          ))}
          {showAddShortcut ? (
            <div className="flex items-center gap-1.5">
              <input value={newShortcutTitle} onChange={e => setNewShortcutTitle(e.target.value)}
                placeholder="이름 (선택)" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-24 focus:outline-none" />
              <input value={newShortcutUrl} onChange={e => setNewShortcutUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addShortcut(); if (e.key === 'Escape') setShowAddShortcut(false) }}
                placeholder="URL" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-36 focus:outline-none" autoFocus />
              <button onClick={addShortcut} className="text-xs bg-gray-800 text-white px-2 py-1.5 rounded-lg">추가</button>
              <button onClick={() => setShowAddShortcut(false)} className="text-xs text-gray-400">취소</button>
            </div>
          ) : (
            <button onClick={() => setShowAddShortcut(true)}
              className="text-xs text-gray-300 hover:text-gray-500 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors">
              + 바로가기
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-20 animate-pulse" />)}
        </div>
      ) : (
        <SummaryCards tasks={tasks} />
      )}

      {loading ? (
        <div className="flex gap-4">
          {[1,2,3,4].map(i => <div key={i} className="flex-1 h-40 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : (
        <div className="flex gap-4">
          <TaskColumn title="오늘 마감" count={todayTasks.length} tasks={todayTasks} accentColor="bg-red-500" dateMode="end_date" />
          <TaskColumn title="이번주 마감" count={weekTasks.length} tasks={weekTasks} accentColor="bg-blue-400" dateMode="end_date" />
          <TaskColumn title="중간공유 임박" count={midSoonTasks.length} tasks={midSoonTasks} accentColor="bg-amber-400" dateMode="mid_date" />
          <TaskColumn title="최종마감 임박" count={endSoonTasks.length} tasks={endSoonTasks} accentColor="bg-rose-500" dateMode="end_date" />
        </div>
      )}

      <HomeCalendar tasks={tasks} />
    </div>
  )
}
