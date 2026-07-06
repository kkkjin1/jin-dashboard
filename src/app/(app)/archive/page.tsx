'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DailyLogWidget from '@/components/home/DailyLogWidget'
import DailyJournalWidget from '@/components/home/DailyJournalWidget'
import TomorrowPlanWidget from '@/components/home/TomorrowPlanWidget'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task, Meeting } from '@/types'

function localDateStr(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function todayStr() {
  return localDateStr(new Date())
}

function formatLabel(ds: string) {
  const d = new Date(ds + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(d); target.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  if (diff === 0) return `오늘 (${days[d.getDay()]})`
  if (diff === 1) return `어제 (${days[d.getDay()]})`
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

// 최근 N개월 날짜 리스트 (주별로 묶인 캘린더 같은 구조)
function buildRecentDates(n = 30): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    return localDateStr(d)
  })
}

export default function ArchivePage() {
  const TODAY = todayStr()
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [journalContent, setJournalContent] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title' | 'meeting_date'>[]>([])
  const [journalDates, setJournalDates] = useState<Set<string>>(new Set())
  const [showCalendar, setShowCalendar] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      fetchAllTasks(),
      supabase.from('meetings').select('id, title, meeting_date').order('meeting_date', { ascending: false }),
      // 최근 60일 중 회고 있는 날짜 로드
      supabase.from('daily_journals').select('date').gte('date', (() => {
        const d = new Date(); d.setDate(d.getDate() - 60); return localDateStr(d)
      })()),
    ]).then(([taskData, meetingRes, journalRes]) => {
      setTasks(taskData ?? [])
      setMeetings((meetingRes.data ?? []) as Pick<Meeting, 'id' | 'title' | 'meeting_date'>[])
      if (journalRes.data) {
        setJournalDates(new Set(journalRes.data.map((j: { date: string }) => j.date)))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function navigate(dir: -1 | 1) {
    setSelectedDate(prev => {
      const [y, m, d] = prev.split('-').map(Number)
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() + dir)
      const next = localDateStr(dt)
      if (next > TODAY) return prev
      return next
    })
    setJournalContent('')
  }

  const recentDates = buildRecentDates(30)

  return (
    <div className="flex flex-col h-full min-h-0 py-4 gap-4 font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">일별 아카이브</h1>
          <p className="text-xs text-gray-400 mt-0.5">날짜를 선택해 그 날의 일상 · 회고 · 계획을 돌아보세요</p>
        </div>

        {/* 날짜 네비게이션 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/60 border border-white/70 hover:bg-white/90 text-gray-500 hover:text-gray-800 text-sm transition-all shadow-sm">
            ←
          </button>
          <button
            onClick={() => setShowCalendar(p => !p)}
            className="relative flex items-center gap-2 bg-white/60 backdrop-blur-md border border-white/70 rounded-full px-4 py-2 shadow-sm hover:bg-white/80 transition-all">
            <span className="text-sm font-semibold text-gray-800">{formatLabel(selectedDate)}</span>
            {journalDates.has(selectedDate) && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#A8C0E0]" title="회고 있음" />
            )}
          </button>
          <button
            onClick={() => navigate(1)}
            disabled={selectedDate >= TODAY}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/60 border border-white/70 hover:bg-white/90 text-gray-500 hover:text-gray-800 text-sm transition-all shadow-sm disabled:opacity-30 disabled:cursor-not-allowed">
            →
          </button>
          <input
            type="date"
            max={TODAY}
            value={selectedDate}
            onChange={e => {
              if (e.target.value && e.target.value <= TODAY) {
                setSelectedDate(e.target.value)
                setJournalContent('')
              }
            }}
            className="text-xs border border-white/60 bg-white/50 rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-300 text-gray-600"
          />
        </div>
      </div>

      {/* 최근 날짜 빠른 선택 (회고 있는 날 강조) */}
      <div className="flex-shrink-0 flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {recentDates.map(ds => {
          const d = new Date(ds + 'T00:00:00')
          const dayNames = ['일', '월', '화', '수', '목', '금', '토']
          const isSelected = ds === selectedDate
          const hasJournal = journalDates.has(ds)
          return (
            <button
              key={ds}
              onClick={() => { setSelectedDate(ds); setJournalContent('') }}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl border transition-all text-center ${
                isSelected
                  ? 'bg-[#0F1E36] border-[#0F1E36] text-white shadow-md'
                  : hasJournal
                    ? 'bg-white/70 border-[#A8C0E0]/60 text-gray-700 hover:bg-white/90'
                    : 'bg-white/40 border-white/50 text-gray-400 hover:bg-white/60'
              }`}>
              <span className="text-[9px] font-medium">{dayNames[d.getDay()]}</span>
              <span className="text-xs font-bold">{d.getDate()}</span>
              {hasJournal && !isSelected && (
                <span className="w-1 h-1 rounded-full bg-[#A8C0E0]" />
              )}
              {!hasJournal && !isSelected && (
                <span className="w-1 h-1" />
              )}
            </button>
          )
        })}
      </div>

      {/* 3개 위젯 */}
      <div className="flex-1 grid grid-cols-3 gap-3 min-h-0">
        {/* 오늘일상 */}
        <div className="min-h-0 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
            <DailyLogWidget
              selectedDate={selectedDate}
              onDraftReady={() => {}}
            />
          </div>
        </div>
        {/* 회고 */}
        <div className="min-h-0 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
            <DailyJournalWidget
              selectedDate={selectedDate}
              onNavigate={navigate}
              tasks={tasks}
              meetings={meetings}
              onSaved={content => {
                setJournalContent(content)
                setJournalDates(prev => new Set([...prev, selectedDate]))
              }}
            />
          </div>
        </div>
        {/* 내일 계획 */}
        <div className="min-h-0 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm h-full overflow-hidden font-sans">
            <TomorrowPlanWidget
              selectedDate={selectedDate}
              journalContent={journalContent}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
