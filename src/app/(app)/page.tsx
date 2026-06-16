'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import HomeCalendar from '@/components/home/HomeCalendar'
import TodayTodoWidget from '@/components/home/TodayTodoWidget'
import { fetchAllTasks } from '@/lib/tasks'
import { createClient } from '@/lib/supabase/client'
import { useUserSetting } from '@/hooks/useUserSetting'
import { HomePageSkeleton } from '@/components/ui/Skeleton'
import type { Task, Meeting, TaskTodo } from '@/types'

interface TodoColItem { id: string; title: string; taskId: string; taskTitle: string | null }

interface CompactColProps {
  title: string
  items: TodoColItem[]
  dot: string
  badgeCls?: string
}

function CompactCol({ title, items, dot, badgeCls = 'bg-gray-200 text-gray-600' }: CompactColProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 min-w-0">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        {items.length > 0 && (
          <span className={`ml-auto text-[10px] ${badgeCls} w-4 h-4 rounded-full flex items-center justify-center font-medium flex-shrink-0`}>
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-300 text-center py-1">없음</p>
      ) : (
        <div className="space-y-0.5">
          {items.slice(0, 5).map(item => (
            <Link key={item.id} href={`/tasks/${item.taskId}`}>
              <div className="py-0.5 px-1 hover:bg-gray-50 rounded transition-colors">
                <span className="text-xs text-gray-800 truncate block">{item.title || '제목 없음'}</span>
                {item.taskTitle && (
                  <span className="text-[10px] text-gray-400 truncate block">{item.taskTitle}</span>
                )}
              </div>
            </Link>
          ))}
          {items.length > 5 && (
            <p className="text-[10px] text-gray-300 px-1 pt-0.5">+{items.length - 5}개 더</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [todos, setTodos] = useState<TaskTodo[]>([])
  const [loading, setLoading] = useState(true)
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [search, setSearch] = useState('')
  const [searchMeetings, setSearchMeetings] = useState<Pick<Meeting, 'id' | 'title'>[]>([])
  const [meetingsLoaded, setMeetingsLoaded] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  type Shortcut = { id: string; title: string; url: string }
  const { value: shortcuts, save: saveShortcutsRemote } = useUserSetting<Shortcut[]>('home_shortcuts', [])
  const [showAddShortcut, setShowAddShortcut] = useState(false)
  const [newShortcutTitle, setNewShortcutTitle] = useState('')
  const [newShortcutUrl, setNewShortcutUrl] = useState('')
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null)
  const [editShortcutTitle, setEditShortcutTitle] = useState('')
  const [editShortcutUrl, setEditShortcutUrl] = useState('')

  useEffect(() => {
    Promise.all([
      fetchAllTasks(),
      supabase.from('meetings').select('id, title, meeting_date').order('meeting_date', { ascending: true }),
      supabase.from('task_todos').select('id, title, schedule_tag, task_id, done, tasks(id, title)').eq('done', false),
    ]).then(([taskData, { data: meetingData }, { data: todosData }]) => {
      setTasks(taskData)
      setMeetings((meetingData ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[])
      setTodos((todosData ?? []) as unknown as TaskTodo[])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function saveShortcuts(list: Shortcut[]) {
    saveShortcutsRemote(list)
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

  function startEditShortcut(s: {id: string; title: string; url: string}) {
    setEditingShortcutId(s.id)
    setEditShortcutTitle(s.title)
    setEditShortcutUrl(s.url)
    setShowAddShortcut(false)
  }

  function saveEditShortcut() {
    if (!editShortcutUrl.trim() || !editingShortcutId) return
    const url = editShortcutUrl.startsWith('http') ? editShortcutUrl : 'https://' + editShortcutUrl
    const title = editShortcutTitle.trim() || url
    saveShortcuts(shortcuts.map(s => s.id === editingShortcutId ? { ...s, title, url } : s))
    setEditingShortcutId(null); setEditShortcutTitle(''); setEditShortcutUrl('')
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

  function toColItems(filtered: TaskTodo[]): TodoColItem[] {
    return filtered.map(t => ({
      id: t.id,
      title: t.title,
      taskId: t.task_id,
      taskTitle: (t.tasks as { id: string; title: string } | null)?.title ?? null,
    }))
  }
  const todayItems = toColItems(todos.filter(t => t.schedule_tag === 'today'))
  const tomorrowItems = toColItems(todos.filter(t => t.schedule_tag === 'tomorrow'))
  const weekItems = toColItems(todos.filter(t => t.schedule_tag === 'this_week'))

  if (loading) return <HomePageSkeleton />

  return (
    <div className="p-6 md:p-12 flex flex-col md:h-full md:overflow-hidden gap-4">

      {/* Row 1: 헤더 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-emerald-600 font-medium">
            {format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">안녕하세요, 팀장님</h1>
        </div>
        <div className="hidden sm:flex items-center gap-2">
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
                              <span className={`text-xs ml-auto flex-shrink-0 px-1.5 py-0.5 rounded ${t.status === '완료' ? 'bg-green-50 text-green-600' : t.status === '진행중' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
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
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-2 transition-colors hover:bg-white whitespace-nowrap">
            전체 업무 →
          </Link>
        </div>
      </div>

      {/* Row 2: 바로가기 */}
      <div className="flex-shrink-0">
        <div className="flex gap-2 flex-wrap items-center">
          {shortcuts.map(s => {
            if (editingShortcutId === s.id) {
              return (
                <div key={s.id} className="bg-white rounded-xl border border-blue-300 p-2.5 w-40 shadow-sm">
                  <input value={editShortcutTitle} onChange={e => setEditShortcutTitle(e.target.value)}
                    placeholder="이름" autoFocus
                    className="text-xs font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
                  <input value={editShortcutUrl} onChange={e => setEditShortcutUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEditShortcut(); if (e.key === 'Escape') setEditingShortcutId(null) }}
                    placeholder="URL"
                    className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
                  <div className="flex gap-1 mt-1.5 justify-end">
                    <button onClick={() => setEditingShortcutId(null)} className="text-xs text-gray-400 px-2 py-0.5">취소</button>
                    <button onClick={saveEditShortcut} className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-lg">저장</button>
                  </div>
                </div>
              )
            }
            return (
              <div key={s.id} className="group relative">
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-3 py-2 hover:border-gray-400 hover:shadow-sm transition-all">
                  <span className="text-xs font-medium text-gray-700 truncate max-w-28">🔗 {s.title}</span>
                </a>
                <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEditShortcut(s)}
                    className="w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-blue-600">✎</button>
                  <button onClick={() => removeShortcut(s.id)}
                    className="w-4 h-4 bg-gray-400 text-white rounded-full text-[9px] flex items-center justify-center hover:bg-red-500">×</button>
                </div>
              </div>
            )
          })}
          {showAddShortcut ? (
            <div className="bg-white rounded-xl border border-blue-300 p-2.5 w-40 shadow-sm">
              <input value={newShortcutTitle} onChange={e => setNewShortcutTitle(e.target.value)}
                placeholder="이름" autoFocus
                className="text-xs font-medium text-gray-800 w-full focus:outline-none border-b border-gray-200 pb-1 mb-1 bg-transparent" />
              <input value={newShortcutUrl} onChange={e => setNewShortcutUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addShortcut(); if (e.key === 'Escape') setShowAddShortcut(false) }}
                placeholder="URL"
                className="text-xs text-gray-400 w-full focus:outline-none bg-transparent" />
              <div className="flex gap-1 mt-1.5 justify-end">
                <button onClick={() => setShowAddShortcut(false)} className="text-xs text-gray-400 px-2 py-0.5">취소</button>
                <button onClick={addShortcut} className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-lg">추가</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setShowAddShortcut(true); setEditingShortcutId(null) }}
              className="flex items-center justify-center border border-dashed border-gray-200 hover:border-gray-300 rounded-md px-3 py-2 text-gray-300 hover:text-gray-400 transition-colors text-xs">
              + 바로가기
            </button>
          )}
        </div>
      </div>

      {/* Row 3: 컴팩트 업무 현황 */}
      {loading ? (
        <div className="flex-shrink-0 grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 h-20 animate-pulse" />)}
        </div>
      ) : (
        <div className="flex-shrink-0 grid grid-cols-3 gap-3">
          <CompactCol title="오늘" items={todayItems} dot="bg-red-500" badgeCls="bg-red-500 text-white" />
          <CompactCol title="내일" items={tomorrowItems} dot="bg-orange-400" badgeCls="bg-orange-400 text-white" />
          <CompactCol title="금주" items={weekItems} dot="bg-blue-400" badgeCls="bg-blue-400 text-white" />
        </div>
      )}

      {/* Row 4: 캘린더 + 오늘할일 */}
      <div className="md:flex-1 md:min-h-0 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 md:overflow-hidden">
          <HomeCalendar tasks={tasks} meetings={meetings} />
        </div>
        <div className="md:overflow-hidden">
          <TodayTodoWidget />
        </div>
      </div>
    </div>
  )
}
