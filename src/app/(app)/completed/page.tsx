'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task, AchievementCategory } from '@/types'

const COLUMNS: { key: AchievementCategory | null; label: string; color: string }[] = [
  { key: null, label: '대기', color: 'border-gray-200 bg-gray-50' },
  { key: '성과', label: '성과', color: 'border-blue-200 bg-blue-50' },
  { key: '개선', label: '개선', color: 'border-green-200 bg-green-50' },
  { key: '리소스', label: '리소스', color: 'border-purple-200 bg-purple-50' },
  { key: '수명', label: '수명', color: 'border-amber-200 bg-amber-50' },
  { key: '기타', label: '기타', color: 'border-gray-200 bg-gray-100' },
]

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

export default function CompletedPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [monthFilter, setMonthFilter] = useState<string>('전체')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchAllTasks().then(all => setTasks(all.filter(t => t.status === '완료')))
  }, [])

  const allMonths = useMemo(() => {
    const months = new Set<string>()
    tasks.forEach(t => (t.work_months ?? []).forEach(m => months.add(m)))
    return Array.from(months).sort().reverse()
  }, [tasks])

  const filtered = monthFilter === '전체'
    ? tasks
    : tasks.filter(t => (t.work_months ?? []).includes(monthFilter))

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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">완료 성과</h1>
          <p className="text-xs text-gray-400 mt-0.5">완료된 업무를 드래그해서 카테고리로 분류하세요</p>
        </div>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none">
          <option value="전체">전체 작업월</option>
          {allMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const colTasks = getColTasks(col.key)
          const colKey = col.key ?? '__null__'
          return (
            <div
              key={colKey}
              onDragOver={e => { e.preventDefault(); setDragOverCol(colKey) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.key)}
              className={`flex-shrink-0 w-56 rounded-xl border-2 p-3 transition-colors ${col.color} ${dragOverCol === colKey ? 'opacity-80 scale-[1.01]' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
              </div>
              <div className="space-y-2 min-h-20">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDraggedId(task.id)}
                    onDragEnd={() => { setDraggedId(null); setDragOverCol(null) }}
                    className={`bg-white rounded-lg border border-gray-100 p-2.5 cursor-grab active:cursor-grabbing hover:border-gray-200 transition-all ${draggedId === task.id ? 'opacity-50' : ''}`}
                  >
                    <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()}>
                      <p className="text-xs font-medium text-gray-800 leading-snug mb-1.5">
                        {task.title || <span className="text-gray-300 italic">제목 없음</span>}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{task.type}</span>
                      <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{task.part}</span>
                      {(task.work_months ?? []).length > 0 && (
                        <span className="text-xs text-gray-300">{formatMonth((task.work_months ?? []).at(-1)!)}</span>
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
    </div>
  )
}
