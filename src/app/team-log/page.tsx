'use client'

// 이 페이지는 대시보드의 다른 탭(Sidebar/AppShell 등)을 전혀 import하지 않는다.
// 팀원 4명이 비밀번호로만 접근하는 완전히 독립된 공용 화면 — 어떤 에러가 나도
// 이 파일에 없는 코드(다른 탭)가 렌더링될 수 없다.

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'

type Entry = {
  id: string
  author: string
  entry_type: '업무기록' | '보고일정'
  entry_date: string
  title: string
  content: string
  created_at: string
}

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

  const [entries, setEntries] = useState<Entry[]>([])
  const [loadError, setLoadError] = useState('')

  const [author, setAuthor] = useState('')
  const [entryType, setEntryType] = useState<'업무기록' | '보고일정'>('업무기록')
  const [entryDate, setEntryDate] = useState(todayStr())
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [filterAuthor, setFilterAuthor] = useState('전체')
  const [filterType, setFilterType] = useState<'전체' | '업무기록' | '보고일정'>('전체')

  useEffect(() => {
    try { const a = localStorage.getItem('team_log_author'); if (a) setAuthor(a) } catch {}
    loadEntries()
  }, [])

  async function loadEntries() {
    try {
      const res = await fetch('/api/team-log/entries')
      if (res.status === 401) { setAuthorized(false); return }
      const json = await res.json()
      if (!json.ok) { setLoadError(json.error ?? '불러오기 실패'); setAuthorized(true); return }
      setEntries(json.entries)
      setAuthorized(true)
    } catch {
      setLoadError('네트워크 오류')
      setAuthorized(false)
    }
  }

  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/team-log/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })
      if (res.ok) { setPasscode(''); await loadEntries() }
      else setAuthError('비밀번호가 올바르지 않습니다.')
    } catch {
      setAuthError('네트워크 오류가 발생했습니다.')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!author.trim() || !title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/team-log/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: author.trim(), entry_type: entryType, entry_date: entryDate, title: title.trim(), content }),
      })
      if (res.status === 401) { setAuthorized(false); return }
      const json = await res.json()
      if (json.ok) {
        try { localStorage.setItem('team_log_author', author.trim()) } catch {}
        setEntries(prev => [json.entry, ...prev])
        setTitle('')
        setContent('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const authors = useMemo(() => {
    const set = new Set(entries.map(e => e.author))
    return ['전체', ...Array.from(set)]
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter(e =>
      (filterAuthor === '전체' || e.author === filterAuthor) &&
      (filterType === '전체' || e.entry_type === filterType)
    )
  }, [entries, filterAuthor, filterType])

  const upcomingReports = useMemo(() => {
    const today = todayStr()
    return entries
      .filter(e => e.entry_type === '보고일정' && e.entry_date >= today)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .slice(0, 5)
  }, [entries])

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of filtered) {
      const arr = map.get(e.entry_date) ?? []
      arr.push(e)
      map.set(e.entry_date, arr)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

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
            type="password"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] bg-white placeholder-gray-300"
            placeholder="비밀번호"
            autoFocus
            required
          />
          {authError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3">{authError}</p>}
          <button
            type="submit"
            disabled={authLoading}
            className="w-full bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 mt-4"
          >
            {authLoading ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F7F5] px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <p className="font-semibold text-gray-900 text-base">공통업무 로그</p>
          <p className="text-xs text-gray-400 mt-0.5">팀 공용 · 업무기록 · 타임라인 · 보고일정 · 아카이빙</p>
        </div>

        {loadError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{loadError}</p>}

        {upcomingReports.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">다가오는 보고일정</p>
            <ul className="space-y-1.5">
              {upcomingReports.map(e => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="text-[11px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full px-2 py-0.5 flex-shrink-0">{fmtDay(e.entry_date)}</span>
                  <span className="text-gray-800 truncate">{e.title}</span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{e.author}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleAddEntry} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500">기록 추가</p>
          <div className="flex gap-2">
            <input
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="이름"
              required
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0]"
            />
            <select
              value={entryType}
              onChange={e => setEntryType(e.target.value as '업무기록' | '보고일정')}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30"
            >
              <option value="업무기록">업무기록</option>
              <option value="보고일정">보고일정</option>
            </select>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              required
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30"
            />
          </div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0]"
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용 (선택)"
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] resize-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? '추가 중...' : '기록 추가'}
          </button>
        </form>

        <div className="flex items-center gap-2">
          <select
            value={filterAuthor}
            onChange={e => setFilterAuthor(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
          >
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as '전체' | '업무기록' | '보고일정')}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
          >
            <option value="전체">전체 유형</option>
            <option value="업무기록">업무기록</option>
            <option value="보고일정">보고일정</option>
          </select>
        </div>

        <div className="space-y-4">
          {grouped.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">아직 기록이 없습니다.</p>
          )}
          {grouped.map(([date, list]) => (
            <div key={date}>
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">{fmtDay(date)}</p>
              <div className="space-y-1.5">
                {list.map(e => (
                  <div key={e.id} className="bg-white rounded-xl border border-stone-100 shadow-sm p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${e.entry_type === '보고일정' ? 'bg-[#4C7FE0]/10 text-[#4C7FE0]' : 'bg-gray-100 text-gray-500'}`}>
                        {e.entry_type}
                      </span>
                      <span className="text-[11px] text-gray-400">{e.author}</span>
                    </div>
                    <p className="text-sm text-gray-800 font-medium">{e.title}</p>
                    {e.content && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{e.content}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
