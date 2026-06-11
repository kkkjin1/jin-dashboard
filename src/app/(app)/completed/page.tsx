'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchAllTasks } from '@/lib/tasks'
import type { Task, AchievementCategory } from '@/types'

const COLUMNS: { key: AchievementCategory | null; label: string; color: string; accent: string }[] = [
  { key: null, label: '미분류', color: 'border-gray-200 bg-gray-50', accent: 'bg-gray-400' },
  { key: '성과', label: '성과', color: 'border-blue-200 bg-blue-50', accent: 'bg-blue-500' },
  { key: '개선', label: '개선', color: 'border-green-200 bg-green-50', accent: 'bg-green-500' },
  { key: '리소스', label: '리소스', color: 'border-purple-200 bg-purple-50', accent: 'bg-purple-500' },
  { key: '수명', label: '수명', color: 'border-amber-200 bg-amber-50', accent: 'bg-amber-500' },
  { key: '기타', label: '기타', color: 'border-gray-200 bg-gray-100', accent: 'bg-gray-500' },
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
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">완료 성과</h1>
          <p className="text-xs text-gray-400 mt-0.5">완료된 업무를 드래그해서 카테고리로 분류하세요</p>
        </div>
        <span className="text-sm text-gray-400">총 {filtered.length}건</span>
      </div>

      {/* 성과 요약 바 */}
      <div className="grid grid-cols-6 gap-2 mb-4">
        {COLUMNS.map(col => {
          const count = getColTasks(col.key).length
          return (
            <div key={col.key ?? '__null__'} className={`rounded-xl border-2 p-3 text-center ${col.color}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                <p className="text-xs font-medium text-gray-500">{col.label}</p>
              </div>
              <p className="text-xl font-bold text-gray-800">{count}</p>
            </div>
          )
        })}
      </div>

      {/* 월 필터 (메인상단 pill 형태) */}
      <div className="flex gap-2 flex-wrap mb-5">
        {['전체', ...allMonths].map(m => (
          <button
            key={m}
            onClick={() => setMonthFilter(m)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              monthFilter === m
                ? 'bg-gray-800 text-white border-gray-800'
                : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
            }`}
          >
            {m === '전체' ? '전체 기간' : formatMonth(m)}
          </button>
        ))}
      </div>

      {/* 칸반 */}
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
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                </div>
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
