'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task, AchievementCategory } from '@/types'

const COLUMNS: { key: AchievementCategory | null; label: string; bg: string; dot: string }[] = [
  { key: null,    label: '미분류', bg: 'bg-gray-50 border-gray-100',       dot: 'bg-gray-300' },
  { key: '성과',  label: '성과',   bg: 'bg-emerald-50/60 border-emerald-100', dot: 'bg-emerald-400' },
  { key: '개선',  label: '개선',   bg: 'bg-amber-50/60 border-amber-100',   dot: 'bg-amber-400' },
  { key: '리소스', label: '리소스', bg: 'bg-blue-50/60 border-blue-100',    dot: 'bg-blue-400' },
  { key: '수명',  label: '수명',   bg: 'bg-slate-50 border-slate-100',      dot: 'bg-slate-400' },
  { key: '기타',  label: '기타',   bg: 'bg-gray-100/60 border-gray-200',    dot: 'bg-gray-300' },
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
const QUICK_PERIODS: QuickPeriod[] = ['전체', '당월', '전월', '상반기', '하반기', '올해']

function getQuickPeriodMonths(period: QuickPeriod): string[] | 'all' {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  if (period === '전체') return 'all'
  if (period === '올해') return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  if (period === '당월') return [`${y}-${String(m).padStart(2, '0')}`]
  if (period === '전월') {
    const pm = m === 1 ? 12 : m - 1
    const py = m === 1 ? y - 1 : y
    return [`${py}-${String(pm).padStart(2, '0')}`]
  }
  if (period === '상반기') return Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  if (period === '하반기') return Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 7).padStart(2, '0')}`)
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
    tasks.forEach(t => { const m = getTaskMonth(t); if (m) months.add(m) })
    return Array.from(months).sort().reverse()
  }, [tasks])

  const filtered = useMemo(() => {
    if (monthFilter) return tasks.filter(t => getTaskMonth(t) === monthFilter)
    if (fromMonth && toMonth) return tasks.filter(t => { const m = getTaskMonth(t); return m ? m >= fromMonth && m <= toMonth : false })
    return tasks
  }, [tasks, monthFilter, fromMonth, toMonth])

  function selectQuick(p: QuickPeriod) {
    setQuickPeriod(p)
    setMonthFilter(null)
    const months = getQuickPeriodMonths(p)
    if (months === 'all') { setFromMonth(''); setToMonth('') }
    else if (months.length > 0) { setFromMonth(months[0]); setToMonth(months[months.length - 1]) }
  }

  async function handleDrop(category: AchievementCategory | null) {
    if (!draggedId) return
    await supabase.from('tasks').update({ achievement_category: category }).eq('id', draggedId)
    setTasks(prev => prev.map(t => t.id === draggedId ? { ...t, achievement_category: category } : t))
    setDraggedId(null); setDragOverCol(null)
  }

  function getColTasks(key: AchievementCategory | null) {
    return filtered.filter(t => (t.achievement_category ?? null) === key)
  }

  const achieveCount = filtered.filter(t => t.achievement_category === '성과').length
  const improveCount = filtered.filter(t => t.achievement_category === '개선').length
  const retroCount  = filtered.filter(t => t.retrospective?.good || t.retrospective?.bad || t.retrospective?.improvement).length

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">완료 성과</h1>
        <span className="text-sm text-gray-400">총 {filtered.length}건</span>
      </div>

      {/* 탭 바 */}
      <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto scrollbar-hide w-fit max-w-full">
        {QUICK_PERIODS.map(p => (
          <button key={p} onClick={() => selectQuick(p)}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-all ${
              quickPeriod === p && !monthFilter
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {p}
          </button>
        ))}
        {allMonths.length > 0 && (
          <>
            <div className="w-px h-5 bg-gray-300 mx-1" />
            <select
              value={monthFilter ?? ''}
              onChange={e => {
                if (e.target.value) { setMonthFilter(e.target.value); setQuickPeriod('전체') }
                else setMonthFilter(null)
              }}
              className="text-sm text-gray-500 bg-transparent px-2 py-2 rounded-lg focus:outline-none cursor-pointer hover:text-gray-700 transition-colors">
              <option value="">월 선택</option>
              {allMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </>
        )}
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs text-gray-400 font-medium mb-2">총 완료</p>
          <p className="text-4xl font-bold text-gray-800 mb-1">{filtered.length}</p>
          <p className="text-xs text-gray-400">건</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-5">
          <p className="text-xs text-emerald-600 font-medium mb-2">성과</p>
          <p className="text-4xl font-bold text-emerald-700 mb-1">{achieveCount}</p>
          <p className="text-xs text-emerald-500">건</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-5">
          <p className="text-xs text-amber-600 font-medium mb-2">개선</p>
          <p className="text-4xl font-bold text-amber-700 mb-1">{improveCount}</p>
          <p className="text-xs text-amber-500">건</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
          <p className="text-xs text-blue-600 font-medium mb-2">회고 작성</p>
          <p className="text-4xl font-bold text-blue-700 mb-1">{retroCount}</p>
          <p className="text-xs text-blue-500">
            {filtered.length > 0 ? `${Math.round(retroCount / filtered.length * 100)}%` : '—'}
          </p>
        </div>
      </div>

      {/* 카테고리 칸반 */}
      <div className="flex gap-4 overflow-x-auto pb-4 mb-8">
        {COLUMNS.map(col => {
          const colTasks = getColTasks(col.key)
          const colKey = col.key ?? '__null__'
          return (
            <div key={colKey}
              onDragOver={e => { e.preventDefault(); setDragOverCol(colKey) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.key)}
              className={`flex-shrink-0 w-56 rounded-xl border p-4 transition-all ${col.bg} ${dragOverCol === colKey ? 'scale-[1.02] opacity-90' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                </div>
                <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded-full border border-gray-100">{colTasks.length}</span>
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
                      {getTaskMonth(task) && <span className="text-xs text-gray-300">{formatMonth(getTaskMonth(task)!)}</span>}
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

      {/* 회고 기록 */}
      <div>
        <div className="flex items-center gap-2 mb-4">
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
                    <div className={`rounded-lg p-3 ${task.retrospective?.good ? 'bg-[#ECFDF5]' : 'bg-gray-50'}`}>
                      <p className="text-[10px] font-semibold text-[#10B981] mb-1">잘한점</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.good || <span className="text-gray-300">없음</span>}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${task.retrospective?.bad ? 'bg-rose-50' : 'bg-gray-50'}`}>
                      <p className="text-[10px] font-semibold text-rose-500 mb-1">아쉬운점</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{task.retrospective?.bad || <span className="text-gray-300">없음</span>}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${task.retrospective?.improvement ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-[10px] font-semibold text-amber-500 mb-1">개선점</p>
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
