'use client'

// 이 페이지는 대시보드의 다른 탭(Sidebar/AppShell 등)을 전혀 import하지 않는다.
// 팀원 4명이 비밀번호로만 접근하는 완전히 독립된 공용 화면 — 어떤 에러가 나도
// 이 파일에 없는 코드(다른 탭)가 렌더링될 수 없다.
// 좌측 메뉴로 일상(자유메모)/업무(그룹→항목→서브태스크)/회의록 3개 섹션을 오간다.

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'

type Subtask = {
  id: string
  item_id: string
  author: string
  entry_type: '업무기록' | '보고일정'
  entry_date: string
  title: string
  content: string
  sort_order: number
  created_at: string
}
type Item = { id: string; group_id: string; title: string; status: 'active' | 'hold' | 'done'; sort_order: number; subtasks: Subtask[] }
type Group = { id: string; name: string; color: string; sort_order: number; items: Item[] }
type SubForm = { type: '업무기록' | '보고일정'; date: string; title: string; content: string }
type Note = { id: string; author: string; content: string; sort_order: number; created_at: string }
type Meeting = { id: string; title: string; meeting_date: string; attendees: string; content: string; created_at: string }
type MeetingForm = { title: string; date: string; attendees: string; content: string }
type Section = 'life' | 'work' | 'meetings'

const GROUP_COLORS = ['#4C7FE0', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#9CA3AF']
const STATUS_LABEL: Record<Item['status'], string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_NEXT: Record<Item['status'], Item['status']> = { active: 'hold', hold: 'done', done: 'active' }
const STATUS_STYLE: Record<Item['status'], string> = {
  active: 'bg-[#4C7FE0]/10 text-[#4C7FE0]',
  hold: 'bg-amber-100 text-amber-600',
  done: 'bg-gray-100 text-gray-400',
}
const EMPTY_SUB_FORM: SubForm = { type: '업무기록', date: '', title: '', content: '' }
const EMPTY_MEETING_FORM: MeetingForm = { title: '', date: '', attendees: '', content: '' }

function todayStr() {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function fmtDay(s: string) {
  try {
    const d = parseISO(s)
    if (isToday(d)) return '오늘'
    if (isYesterday(d)) return '어제'
    return format(d, 'M.d (E)', { locale: ko })
  } catch { return s }
}

export default function TeamLogPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [passcode, setPasscode] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [section, setSection] = useState<Section>('life')
  const [author, setAuthor] = useState('')
  const [loadError, setLoadError] = useState('')

  // ── 업무 ──────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<Group[]>([])
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newItemTitle, setNewItemTitle] = useState<Record<string, string>>({})
  const [subForm, setSubForm] = useState<Record<string, SubForm>>({})
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemTitle, setEditItemTitle] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editSubForm, setEditSubForm] = useState<SubForm>(EMPTY_SUB_FORM)
  const [filterAuthor, setFilterAuthor] = useState('전체')
  const [filterType, setFilterType] = useState<'전체' | '업무기록' | '보고일정'>('전체')

  // ── 일상 ──────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<Note[]>([])
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteContent, setEditNoteContent] = useState('')

  // ── 회의록 ────────────────────────────────────────────────────────────
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [meetingForm, setMeetingForm] = useState<MeetingForm>({ ...EMPTY_MEETING_FORM, date: todayStr() })
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null)
  const [editMeetingForm, setEditMeetingForm] = useState<MeetingForm>(EMPTY_MEETING_FORM)

  useEffect(() => {
    try { const a = localStorage.getItem('team_log_author'); if (a) setAuthor(a) } catch {}
    loadAll()
  }, [])

  async function loadAll() {
    try {
      const res = await fetch('/api/team-log/tree')
      if (res.status === 401) { setAuthorized(false); return }
      const json = await res.json()
      if (!json.ok) { setLoadError(json.error ?? '불러오기 실패'); setAuthorized(true); return }
      setGroups(json.groups)
      setAuthorized(true)

      const [notesRes, meetingsRes] = await Promise.all([fetch('/api/team-log/notes'), fetch('/api/team-log/meetings')])
      const notesJson = await notesRes.json()
      const meetingsJson = await meetingsRes.json()
      if (notesJson.ok) setNotes(notesJson.notes)
      if (meetingsJson.ok) setMeetings(meetingsJson.meetings)
    } catch {
      setLoadError('네트워크 오류')
      setAuthorized(false)
    }
  }

  function unauthorizedGuard(res: Response) {
    if (res.status === 401) { setAuthorized(false); return true }
    return false
  }

  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/team-log/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode }),
      })
      if (res.ok) { setPasscode(''); await loadAll() }
      else setAuthError('비밀번호가 올바르지 않습니다.')
    } catch {
      setAuthError('네트워크 오류가 발생했습니다.')
    } finally {
      setAuthLoading(false)
    }
  }

  // ── 일상: 자유 메모 ───────────────────────────────────────────────────
  async function addNote() {
    const res = await fetch('/api/team-log/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: author.trim(), content: '' }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setNotes(prev => [...prev, json.note]); setEditingNoteId(json.note.id); setEditNoteContent('') }
  }

  async function saveNote(id: string) {
    setEditingNoteId(null)
    const res = await fetch('/api/team-log/notes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, author: author.trim(), content: editNoteContent }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      try { if (author.trim()) localStorage.setItem('team_log_author', author.trim()) } catch {}
      setNotes(prev => prev.map(n => n.id === id ? json.note : n))
    }
  }

  async function deleteNote(n: Note) {
    if (!confirm('이 메모를 삭제할까요?')) return
    const res = await fetch('/api/team-log/notes', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setNotes(prev => prev.filter(x => x.id !== n.id))
  }

  // ── 업무: 그룹 ────────────────────────────────────────────────────────
  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!newGroupName.trim()) return
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    const res = await fetch('/api/team-log/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGroupName.trim(), color }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setGroups(prev => [...prev, json.group]); setNewGroupName('') }
  }

  function startEditGroup(g: Group) { setEditingGroupId(g.id); setEditGroupName(g.name) }

  async function saveEditGroup(id: string) {
    const name = editGroupName.trim()
    setEditingGroupId(null)
    if (!name) return
    const res = await fetch('/api/team-log/groups', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => g.id === id ? { ...g, name: json.group.name } : g))
  }

  async function deleteGroup(g: Group) {
    if (!confirm(`"${g.name}" 그룹을 삭제할까요? 안의 항목/기록도 모두 삭제됩니다.`)) return
    const res = await fetch('/api/team-log/groups', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.filter(x => x.id !== g.id))
      if (activeGroupId === g.id) setActiveGroupId(null)
    }
  }

  // ── 업무: 항목 ────────────────────────────────────────────────────────
  async function handleAddItem(groupId: string, e: React.FormEvent) {
    e.preventDefault()
    const title = (newItemTitle[groupId] ?? '').trim()
    if (!title) return
    const res = await fetch('/api/team-log/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: groupId, title }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, items: [...g.items, json.item] } : g))
      setNewItemTitle(prev => ({ ...prev, [groupId]: '' }))
    }
  }

  async function cycleStatus(item: Item) {
    const next = STATUS_NEXT[item.status]
    const res = await fetch('/api/team-log/items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status: next }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === item.id ? { ...i, status: next } : i) })))
  }

  function startEditItem(item: Item, e: React.MouseEvent) { e.stopPropagation(); setEditingItemId(item.id); setEditItemTitle(item.title) }

  async function saveEditItem(id: string) {
    const title = editItemTitle.trim()
    setEditingItemId(null)
    if (!title) return
    const res = await fetch('/api/team-log/items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === id ? { ...i, title: json.item.title } : i) })))
  }

  async function deleteItem(item: Item, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`"${item.title}" 항목을 삭제할까요? 안의 기록도 모두 삭제됩니다.`)) return
    const res = await fetch('/api/team-log/items', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => ({ ...g, items: g.items.filter(i => i.id !== item.id) })))
  }

  function toggleExpand(itemId: string) {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
      return next
    })
  }

  // ── 업무: 서브태스크(기록) ────────────────────────────────────────────
  async function handleAddSubtask(item: Item, e: React.FormEvent) {
    e.preventDefault()
    const form = subForm[item.id] ?? { ...EMPTY_SUB_FORM, date: todayStr() }
    if (!author.trim() || !form.title.trim()) return
    const res = await fetch('/api/team-log/subtasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, author: author.trim(), entry_type: form.type, entry_date: form.date, title: form.title.trim(), content: form.content }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      try { localStorage.setItem('team_log_author', author.trim()) } catch {}
      setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === item.id ? { ...i, subtasks: [...i.subtasks, json.subtask] } : i) })))
      setSubForm(prev => ({ ...prev, [item.id]: { ...EMPTY_SUB_FORM, date: todayStr() } }))
    }
  }

  function startEditSubtask(s: Subtask) {
    setEditingSubtaskId(s.id)
    setEditSubForm({ type: s.entry_type, date: s.entry_date, title: s.title, content: s.content })
  }

  async function saveEditSubtask(id: string) {
    if (!editSubForm.title.trim()) { setEditingSubtaskId(null); return }
    const res = await fetch('/api/team-log/subtasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, author, entry_type: editSubForm.type, entry_date: editSubForm.date, title: editSubForm.title.trim(), content: editSubForm.content }),
    })
    setEditingSubtaskId(null)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) {
      setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => ({ ...i, subtasks: i.subtasks.map(s => s.id === id ? json.subtask : s) })) })))
    }
  }

  async function deleteSubtask(s: Subtask) {
    if (!confirm('이 기록을 삭제할까요?')) return
    const res = await fetch('/api/team-log/subtasks', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => ({ ...i, subtasks: i.subtasks.filter(x => x.id !== s.id) })) })))
  }

  // ── 회의록 ────────────────────────────────────────────────────────────
  async function handleAddMeeting(e: React.FormEvent) {
    e.preventDefault()
    if (!meetingForm.title.trim() || !meetingForm.date) return
    const res = await fetch('/api/team-log/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: meetingForm.title.trim(), meeting_date: meetingForm.date, attendees: meetingForm.attendees, content: meetingForm.content }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) { setMeetings(prev => [json.meeting, ...prev]); setMeetingForm({ ...EMPTY_MEETING_FORM, date: todayStr() }) }
  }

  function startEditMeeting(m: Meeting) {
    setEditingMeetingId(m.id)
    setEditMeetingForm({ title: m.title, date: m.meeting_date, attendees: m.attendees, content: m.content })
  }

  async function saveEditMeeting(id: string) {
    if (!editMeetingForm.title.trim() || !editMeetingForm.date) { setEditingMeetingId(null); return }
    const res = await fetch('/api/team-log/meetings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: editMeetingForm.title.trim(), meeting_date: editMeetingForm.date, attendees: editMeetingForm.attendees, content: editMeetingForm.content }),
    })
    setEditingMeetingId(null)
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMeetings(prev => prev.map(m => m.id === id ? json.meeting : m).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)))
  }

  async function deleteMeeting(m: Meeting) {
    if (!confirm(`"${m.title}" 회의록을 삭제할까요?`)) return
    const res = await fetch('/api/team-log/meetings', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }),
    })
    if (unauthorizedGuard(res)) return
    const json = await res.json()
    if (json.ok) setMeetings(prev => prev.filter(x => x.id !== m.id))
  }

  // ── 파생 데이터 ───────────────────────────────────────────────────────
  const allSubtasks = useMemo(
    () => groups.flatMap(g => g.items.flatMap(i => i.subtasks.map(s => ({ ...s, groupName: g.name, itemTitle: i.title })))),
    [groups]
  )
  const authors = useMemo(() => ['전체', ...Array.from(new Set(allSubtasks.map(s => s.author)))], [allSubtasks])
  const upcomingReports = useMemo(() => {
    const today = todayStr()
    return allSubtasks
      .filter(s => s.entry_type === '보고일정' && s.entry_date >= today)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .slice(0, 5)
  }, [allSubtasks])
  const visibleGroups = activeGroupId ? groups.filter(g => g.id === activeGroupId) : groups

  function matchesFilter(s: Subtask) {
    return (filterAuthor === '전체' || s.author === filterAuthor) && (filterType === '전체' || s.entry_type === filterType)
  }

  if (authorized === null) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5] text-sm text-gray-400">불러오는 중...</div>
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5]">
        <form onSubmit={handlePasscodeSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 w-full max-w-sm">
          <p className="font-semibold text-gray-900 text-sm mb-1">공통업무 로그</p>
          <p className="text-xs text-gray-400 mb-6">팀에서 공유받은 비밀번호를 입력하세요.</p>
          <input
            type="password" value={passcode} onChange={e => setPasscode(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] bg-white placeholder-gray-300"
            placeholder="비밀번호" autoFocus required
          />
          {authError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3">{authError}</p>}
          <button type="submit" disabled={authLoading}
            className="w-full bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 mt-4">
            {authLoading ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    )
  }

  const SECTION_LABEL: Record<Section, string> = { life: '일상', work: '업무', meetings: '회의록' }

  return (
    <div className="min-h-screen bg-[#F4F7F5] flex">
      {/* ── 좌측 메뉴 ── */}
      <aside className="hidden sm:flex flex-col w-56 flex-shrink-0 bg-white border-r border-stone-100 min-h-screen p-4">
        <p className="font-semibold text-gray-900 text-sm mb-4 px-1">공통업무 로그</p>
        <nav className="space-y-0.5">
          {(['life', 'work', 'meetings'] as Section[]).map(s => (
            <div key={s}>
              <button
                onClick={() => setSection(s)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors ${section === s ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {SECTION_LABEL[s]}
              </button>
              {s === 'work' && section === 'work' && (
                <div className="ml-2 mt-0.5 mb-1 space-y-0.5 border-l border-stone-100 pl-2">
                  <button
                    onClick={() => setActiveGroupId(null)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[12.5px] transition-colors ${activeGroupId === null ? 'text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    전체
                  </button>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setActiveGroupId(g.id)}
                      className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-[12.5px] transition-colors ${activeGroupId === g.id ? 'text-[#4C7FE0] font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                      <span className="truncate">{g.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* 모바일 상단 섹션 탭 */}
          <div className="sm:hidden -mt-2 mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {(['life', 'work', 'meetings'] as Section[]).map(s => (
              <button key={s} onClick={() => setSection(s)} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full ${section === s ? 'bg-[#4C7FE0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{SECTION_LABEL[s]}</button>
            ))}
          </div>

          {loadError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{loadError}</p>}

          <div className="flex items-center gap-2">
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="내 이름" className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white w-28" />
          </div>

          {/* ══ 일상 ══ */}
          {section === 'life' && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">일상 · 자유 메모</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {notes.map(n => (
                  <div key={n.id} className="group relative bg-white rounded-xl border border-stone-100 shadow-sm aspect-square p-2 flex flex-col">
                    <button onClick={() => deleteNote(n)} className="absolute top-1 right-1 text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    {editingNoteId === n.id ? (
                      <textarea
                        autoFocus value={editNoteContent}
                        onChange={e => setEditNoteContent(e.target.value)}
                        onBlur={() => saveNote(n.id)}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingNoteId(null) }}
                        className="flex-1 w-full text-[11px] resize-none outline-none"
                        placeholder="메모..."
                      />
                    ) : (
                      <div
                        onClick={() => { setEditingNoteId(n.id); setEditNoteContent(n.content) }}
                        className="flex-1 text-[11px] text-gray-700 whitespace-pre-wrap overflow-hidden cursor-text"
                      >
                        {n.content || <span className="text-gray-300">클릭해서 입력</span>}
                      </div>
                    )}
                    {n.author && <p className="text-[9px] text-gray-300 mt-1 truncate">{n.author}</p>}
                  </div>
                ))}
                <button onClick={addNote} className="bg-white rounded-xl border border-dashed border-stone-200 aspect-square flex items-center justify-center text-gray-300 hover:text-[#4C7FE0] hover:border-[#4C7FE0]/40 transition-colors text-xl">
                  +
                </button>
              </div>
            </div>
          )}

          {/* ══ 업무 ══ */}
          {section === 'work' && (
            <>
              {upcomingReports.length > 0 && (
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">다가오는 보고일정</p>
                  <ul className="space-y-1.5">
                    {upcomingReports.map(s => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="text-[11px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full px-2 py-0.5 flex-shrink-0">{fmtDay(s.entry_date)}</span>
                        <span className="text-gray-800 truncate">{s.title}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{s.author} · {s.itemTitle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <select value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                  {authors.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value as '전체' | '업무기록' | '보고일정')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                  <option value="전체">전체 유형</option>
                  <option value="업무기록">업무기록</option>
                  <option value="보고일정">보고일정</option>
                </select>
              </div>

              <div className="space-y-4">
                {visibleGroups.map(g => (
                  <div key={g.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 group">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
                      {editingGroupId === g.id ? (
                        <input
                          value={editGroupName} autoFocus
                          onChange={e => setEditGroupName(e.target.value)}
                          onBlur={() => saveEditGroup(g.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditGroup(g.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                          className="text-sm font-semibold text-gray-800 border border-[#4C7FE0]/40 rounded px-1.5 py-0.5 flex-1"
                        />
                      ) : (
                        <p className="text-sm font-semibold text-gray-800 flex-1">{g.name}</p>
                      )}
                      <button onClick={() => startEditGroup(g)} className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity px-1">수정</button>
                      <button onClick={() => deleteGroup(g)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity px-1">삭제</button>
                    </div>

                    <div className="divide-y divide-stone-100">
                      {g.items.map(item => {
                        const expanded = expandedItems.has(item.id)
                        const visibleSubtasks = item.subtasks.filter(matchesFilter)
                        const form = subForm[item.id] ?? { ...EMPTY_SUB_FORM, date: todayStr() }
                        return (
                          <div key={item.id} className="px-4 py-2.5">
                            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => toggleExpand(item.id)}>
                              <span className={`text-gray-300 text-[10px] transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>▶</span>
                              <button onClick={e => { e.stopPropagation(); cycleStatus(item) }} className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[item.status]}`}>
                                {STATUS_LABEL[item.status]}
                              </button>
                              {editingItemId === item.id ? (
                                <input
                                  value={editItemTitle} autoFocus onClick={e => e.stopPropagation()}
                                  onChange={e => setEditItemTitle(e.target.value)}
                                  onBlur={() => saveEditItem(item.id)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEditItem(item.id); if (e.key === 'Escape') setEditingItemId(null) }}
                                  className="text-sm border border-[#4C7FE0]/40 rounded px-1.5 py-0.5 flex-1"
                                />
                              ) : (
                                <p className="text-sm text-gray-800 flex-1 truncate">{item.title}</p>
                              )}
                              <span className="text-[11px] text-gray-400 flex-shrink-0">{item.subtasks.length}건</span>
                              <button onClick={e => startEditItem(item, e)} className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">수정</button>
                              <button onClick={e => deleteItem(item, e)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">삭제</button>
                            </div>

                            {expanded && (
                              <div className="mt-2.5 ml-1 space-y-2 border-l-2 border-stone-100 pl-3">
                                {visibleSubtasks.length === 0 && <p className="text-[11px] text-gray-400 py-1">기록이 없습니다.</p>}
                                {visibleSubtasks.map(s => (
                                  editingSubtaskId === s.id ? (
                                    <div key={s.id} className="bg-[#F9FAFB] rounded-lg p-2.5 space-y-1.5">
                                      <div className="flex gap-1.5">
                                        <select value={editSubForm.type} onChange={e => setEditSubForm(prev => ({ ...prev, type: e.target.value as '업무기록' | '보고일정' }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]">
                                          <option value="업무기록">업무기록</option>
                                          <option value="보고일정">보고일정</option>
                                        </select>
                                        <input type="date" value={editSubForm.date} onChange={e => setEditSubForm(prev => ({ ...prev, date: e.target.value }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]" />
                                      </div>
                                      <input value={editSubForm.title} onChange={e => setEditSubForm(prev => ({ ...prev, title: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px]" />
                                      <textarea value={editSubForm.content} rows={2} onChange={e => setEditSubForm(prev => ({ ...prev, content: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px] resize-none" />
                                      <div className="flex gap-1.5">
                                        <button onClick={() => saveEditSubtask(s.id)} className="text-[11px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">저장</button>
                                        <button onClick={() => setEditingSubtaskId(null)} className="text-[11px] font-medium text-gray-500 px-3 py-1.5">취소</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div key={s.id} className="bg-[#F9FAFB] rounded-lg p-2.5 group">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${s.entry_type === '보고일정' ? 'bg-[#4C7FE0]/10 text-[#4C7FE0]' : 'bg-gray-200 text-gray-500'}`}>{s.entry_type}</span>
                                        <span className="text-[10.5px] text-gray-400">{s.author}</span>
                                        <span className="text-[10.5px] text-gray-400">{fmtDay(s.entry_date)}</span>
                                        <button onClick={() => startEditSubtask(s)} className="text-[10.5px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity ml-auto">수정</button>
                                        <button onClick={() => deleteSubtask(s)} className="text-[10.5px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                                      </div>
                                      <p className="text-[13px] text-gray-800 font-medium">{s.title}</p>
                                      {s.content && <p className="text-[12px] text-gray-500 mt-0.5 whitespace-pre-wrap">{s.content}</p>}
                                    </div>
                                  )
                                ))}

                                <form onSubmit={e => handleAddSubtask(item, e)} className="space-y-1.5 pt-1">
                                  <div className="flex gap-1.5">
                                    <select value={form.type} onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, type: e.target.value as '업무기록' | '보고일정' } }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]">
                                      <option value="업무기록">업무기록</option>
                                      <option value="보고일정">보고일정</option>
                                    </select>
                                    <input type="date" value={form.date} onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, date: e.target.value } }))} className="border border-gray-200 rounded-lg px-1.5 py-1 text-[11px]" />
                                  </div>
                                  <input value={form.title} placeholder="제목" onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, title: e.target.value } }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px]" />
                                  <textarea value={form.content} placeholder="내용 (선택)" rows={2} onChange={e => setSubForm(prev => ({ ...prev, [item.id]: { ...form, content: e.target.value } }))} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px] resize-none" />
                                  <button type="submit" className="text-[11px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">기록 추가</button>
                                </form>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      <form onSubmit={e => handleAddItem(g.id, e)} className="flex gap-1.5 px-4 py-2.5">
                        <input value={newItemTitle[g.id] ?? ''} placeholder="+ 항목 추가" onChange={e => setNewItemTitle(prev => ({ ...prev, [g.id]: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px]" />
                        <button type="submit" className="text-[11.5px] font-medium text-[#4C7FE0] px-2">추가</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>

              {activeGroupId === null && (
                <form onSubmit={handleAddGroup} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex gap-2">
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="+ 그룹 추가 (예: 채용, 평가보상)" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <button type="submit" className="bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg px-4 py-2 text-sm font-medium">추가</button>
                </form>
              )}
            </>
          )}

          {/* ══ 회의록 ══ */}
          {section === 'meetings' && (
            <>
              <form onSubmit={handleAddMeeting} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-2">
                <div className="flex gap-2">
                  <input value={meetingForm.title} onChange={e => setMeetingForm(prev => ({ ...prev, title: e.target.value }))} placeholder="회의 제목" required className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <input type="date" value={meetingForm.date} onChange={e => setMeetingForm(prev => ({ ...prev, date: e.target.value }))} required className="border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                </div>
                <input value={meetingForm.attendees} onChange={e => setMeetingForm(prev => ({ ...prev, attendees: e.target.value }))} placeholder="참석자 (예: 김진일, 홍길동)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <textarea value={meetingForm.content} onChange={e => setMeetingForm(prev => ({ ...prev, content: e.target.value }))} placeholder="회의 내용" rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                <button type="submit" className="bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg px-4 py-2 text-sm font-medium">회의록 추가</button>
              </form>

              <div className="space-y-2.5">
                {meetings.length === 0 && <p className="text-xs text-gray-400 text-center py-8">아직 회의록이 없습니다.</p>}
                {meetings.map(m => (
                  editingMeetingId === m.id ? (
                    <div key={m.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-2">
                      <div className="flex gap-2">
                        <input value={editMeetingForm.title} onChange={e => setEditMeetingForm(prev => ({ ...prev, title: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                        <input type="date" value={editMeetingForm.date} onChange={e => setEditMeetingForm(prev => ({ ...prev, date: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-2 text-sm" />
                      </div>
                      <input value={editMeetingForm.attendees} onChange={e => setEditMeetingForm(prev => ({ ...prev, attendees: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      <textarea value={editMeetingForm.content} onChange={e => setEditMeetingForm(prev => ({ ...prev, content: e.target.value }))} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                      <div className="flex gap-1.5">
                        <button onClick={() => saveEditMeeting(m.id)} className="text-[12px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">저장</button>
                        <button onClick={() => setEditingMeetingId(null)} className="text-[12px] font-medium text-gray-500 px-3 py-1.5">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 group">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full px-2 py-0.5">{fmtDay(m.meeting_date)}</span>
                        {m.attendees && <span className="text-[11px] text-gray-400">{m.attendees}</span>}
                        <button onClick={() => startEditMeeting(m)} className="text-[11px] text-gray-300 hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100 transition-opacity ml-auto">수정</button>
                        <button onClick={() => deleteMeeting(m)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                      </div>
                      <p className="text-sm text-gray-800 font-medium">{m.title}</p>
                      {m.content && <p className="text-[12.5px] text-gray-500 mt-1 whitespace-pre-wrap">{m.content}</p>}
                    </div>
                  )
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
