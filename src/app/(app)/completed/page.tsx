'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task, AchievementCategory } from '@/types'

const COLUMNS: { key: AchievementCategory | null; label: string; bg: string; accent: string }[] = [
  { key: null, label: '미분류', bg: 'bg-gray-50', accent: 'bg-gray-200' },
  { key: '성과', label: '성과', bg: 'bg-[#EEF2FF]/60', accent: 'bg-[#6366F1]/60' },
  { key: '개선', label: '개선', bg: 'bg-amber-50/60', accent: 'bg-[#F4A35A]/60' },
  { key: '리소스', label: '리소스', bg: 'bg-slate-50', accent: 'bg-slate-200' },
  { key: '수명', label: '수명', bg: 'bg-[#1C2B3A]/5', accent: 'bg-[#1C2B3A]/30' },
  { key: '기타', label: '기타', bg: 'bg-gray-100/60', accent: 'bg-gray-200' },
]

function getTaskMonth(task: Task): string | null {
  if ((task.work_months ?? []).length > 0) return (task.work_months ?? []).at(-1)!
  if (task.end_date) return task.end_date.slice(0, 7)
  if (task.updated_at) return task.updated_at.slice(0, 7)
  return null
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

type QuickPeriod = '전체' | '당월' | '전월' | '상반기' | '하반기' | '올해'

function getQuickPeriodMonths(period: QuickPeriod): string[] | 'all' {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1

  if (period === '전체') return 'all'
  if (period === '올해') {
    return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  }
  if (period === '당월') return [`${y}-${String(m).padStart(2, '0')}`]
  if (period === '전월') {
    const pm = m === 1 ? 12 : m - 1
    const py = m === 1 ? y - 1 : y
    return [`${py}-${String(pm).padStart(2, '0')}`]
  }
  if (period === '상반기') {
    return Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  }
  if (period === '하반기') {
    return Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 7).padStart(2, '0')}`)
  }
  return 'all'
}

export default function CompletedPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('전체')
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const nowYM = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])
  const [fromMonth, setFromMonth] = useState<string>(nowYM)
  const [toMonth, setToMonth] = useState<string>(nowYM)
  const supabase = createClient()

  useEffect(() => {
    fetchAllTasks().then(all => setTasks(all.filter(t => t.status === '완료')))
  }, [])

  const allMonths = useMemo(() => {
    const months = new Set<string>()
    tasks.forEach(t => {
      const m = getTaskMonth(t)
      if (m) months.add(m)
    })
    return Array.from(months).sort().reverse()
  }, [tasks])

  const filtered = useMemo(() => {
    if (monthFilter) {
      return tasks.filter(t => {
        const m = getTaskMonth(t)
        return m === monthFilter
      })
    }
    if (fromMonth && toMonth) {
      return tasks.filter(t => {
        const m = getTaskMonth(t)
        return m ? m >= fromMonth && m <= toMonth : false
      })
    }
    return tasks
  }, [tasks, monthFilter, fromMonth, toMonth])

  function selectQuick(p: QuickPeriod) {
    setQuickPeriod(p)
    setMonthFilter(null)
    const months = getQuickPeriodMonths(p)
    if (months === 'all') {
      setFromMonth('')
      setToMonth('')
    } else if (months.length > 0) {
      setFromMonth(months[0])
      setToMonth(months[months.length - 1])
    }
  }

  function selectMonth(m: string) {
    setMonthFilter(m)
    setQuickPeriod('전체')
  }

  async function handleDrop(category: AchievementCategory | null) {
    if (!draggedId) return
    await supabase.from('tasks').update({ achievement_category: category }).eq('id', draggedId)
    setTasks(prev => prev.map(t => t.id === draggedId ? { ...t, achievement_category: category } : t))
    setDraggedId(null)
    setDragOverCol(null)
  }

  function getColTasks(key: AchievementCategory | null) {
    return filtered.filter(t => (t.achievement_category ?? null) === key)
  }

  const QUICK_PERIODS: QuickPeriod[] = ['전체', '당월', '전월', '상반기', '하반기', '올해']

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">완료 성과</h1>
          <p className="text-xs text-gray-400 mt-0.5">완료된 업무를 드래그해서 카테고리로 분류하세요</p>
        </div>
        <span className="text-sm text-gray-400">총 {filtered.length}건</span>
      </div>

      {/* 성과 요약 바 */}
      <div className="grid grid-cols-6 gap-3 mb-5">
        {COLUMNS.map(col => {
          const count = getColTasks(col.key).length
          return (
            <div key={col.key ?? '__null__'} className={`rounded-xl px-3 py-5 text-center ${col.bg}`}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${col.accent}`} />
                <p className="text-sm font-semibold text-gray-600">{col.label}</p>
              </div>
              <p className="text-3xl font-bold text-gray-800">{count}</p>
            </div>
          )
        })}
      </div>

      {/* 기간 필터 */}
      <div className="mb-5 space-y-2">
        {/* 빠른 선택 버튼 */}
        <div className="flex gap-2 flex-wrap">
          {QUICK_PERIODS.map(p => (
            <button key={p} onClick={() => selectQuick(p)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                quickPeriod === p && !monthFilter
                  ? 'bg-[#6366F1] text-white border-[#6366F1]'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}>
              {p}
            </button>
          ))}
          <div className="w-px h-5 bg-gray-200 self-center mx-1" />
          {/* 월별 선택 */}
          {allMonths.map(m => (
            <button key={m} onClick={() => selectMonth(m)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                monthFilter === m
                  ? 'bg-[#6366F1] text-white border-[#6366F1]'
                  : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'
              }`}>
              {formatMonth(m)}
            </button>
          ))}
        </div>
        {/* 직접 기간 입력 (항상 표시) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">기간</span>
          <input type="month" value={fromMonth} onChange={e => { setFromMonth(e.target.value); setQuickPeriod('전체'); setMonthFilter(null) }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none" />
          <span className="text-xs text-gray-400">~</span>
          <input type="month" value={toMonth} onChange={e => { setToMonth(e.target.value); setQuickPeriod('전체'); setMonthFilter(null) }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none" />
        </div>
      </div>

      {/* 칸반 */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const colTasks = getColTasks(col.key)
          const colKey = col.key ?? '__null__'
          return (
            <div key={colKey}
              onDragOver={e => { e.preventDefault(); setDragOverCol(colKey) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.key)}
              className={`flex-shrink-0 w-64 rounded-xl p-4 transition-colors ${col.bg} ${dragOverCol === colKey ? 'opacity-90 scale-[1.01]' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                </div>
                <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
              </div>
              <div className="space-y-2 min-h-20">
                {colTasks.map(task => (
                  <div key={task.id} draggable
                    onDragStart={() => setDraggedId(task.id)}
                    onDragEnd={() => { setDraggedId(null); setDragOverCol(null) }}
                    className={`bg-white rounded-lg border border-gray-100 p-2.5 cursor-grab active:cursor-grabbing hover:border-gray-200 transition-all ${draggedId === task.id ? 'opacity-50' : ''}`}>
                    <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                      <p className="text-xs font-medium text-gray-800 leading-snug mb-1.5">
                        {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{task.type}</span>
                      <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{task.part}</span>
                      {getTaskMonth(task) && (
                        <span className="text-xs text-gray-300">{formatMonth(getTaskMonth(task)!)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <p className="text-xs text-gray-300 text-center py-4">여기에 드롭</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 회고 기록 (인사이트) */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-gray-800">회고 기록</h2>
          <span className="text-xs text-gray-400">완료 업무의 잘한점 · 아쉬운점 · 개선점</span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-8">해당 기간에 완료된 업무가 없습니다</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map(task => (
              <Link key={task.id} href={`/tasks/${task.id}`}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{task.title || '제목 없음'}</p>
                    <div className="flex gap-1.5 mt-1">
                      {task.part && <span className="text-xs text-gray-400">{task.part}</span>}
                      {task.type && <span className="text-xs text-gray-400">· {task.type}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-300">{getTaskMonth(task) ?? ''}</span>
                </div>
                {(task.retrospective?.good || task.retrospective?.bad || task.retrospective?.improvement) ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`rounded-lg p-3 ${task.retrospective?.good ? 'bg-[#EEF2FF]' : 'bg-gray-50'}`}>
                      <p className="text-[10px] font-semibold text-[#6366F1] mb-1">잘한점</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.good || <span className="text-gray-300">없음</span>}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${task.retrospective?.bad ? 'bg-rose-50' : 'bg-gray-50'}`}>
                      <p className="text-[10px] font-semibold text-rose-500 mb-1">아쉬운점</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.bad || <span className="text-gray-300">없음</span>}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${task.retrospective?.improvement ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-[10px] font-semibold text-[#F4A35A] mb-1">개선점</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.improvement || <span className="text-gray-300">없음</span>}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 italic">회고 미작성 → 업무 상세에서 작성 가능</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
