'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useUserSetting } from '@/hooks/useUserSetting'
import type { Task } from '@/types'

interface WeeklyGoal {
  id: string
  week_start: string
  text: string
  task_id?: string
  done: boolean
}

interface Props {
  tasks: Task[]
}

function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function getWeekRange(): string {
  const start = new Date(getWeekStart() + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 4)
  return `${start.getMonth() + 1}/${start.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`
}

export default function WeeklyGoalsWidget({ tasks }: Props) {
  const weekStart = getWeekStart()
  const { value: allGoals, save } = useUserSetting<WeeklyGoal[]>('weekly_goals', [])
  const goals = allGoals.filter(g => g.week_start === weekStart)

  const [newText, setNewText] = useState('')
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [taskSearch, setTaskSearch] = useState('')

  const activeTasks = tasks.filter(t => t.status !== '완료')
  const filteredTasks = activeTasks.filter(t =>
    t.title.toLowerCase().includes(taskSearch.toLowerCase()) ||
    (t.short_name ?? '').toLowerCase().includes(taskSearch.toLowerCase())
  ).slice(0, 6)

  function saveGoals(next: WeeklyGoal[]) {
    const others = allGoals.filter(g => g.week_start !== weekStart)
    save([...others, ...next])
  }

  function addGoal() {
    if (!newText.trim()) return
    saveGoals([...goals, {
      id: Date.now().toString(),
      week_start: weekStart,
      text: newText.trim(),
      done: false,
    }])
    setNewText('')
  }

  function toggleDone(id: string) {
    saveGoals(goals.map(g => g.id === id ? { ...g, done: !g.done } : g))
  }

  function removeGoal(id: string) {
    saveGoals(goals.filter(g => g.id !== id))
  }

  function linkTask(goalId: string, taskId: string) {
    saveGoals(goals.map(g => g.id === goalId ? { ...g, task_id: taskId } : g))
    setLinkingId(null)
    setTaskSearch('')
  }

  function unlinkTask(goalId: string) {
    saveGoals(goals.map(g => g.id === goalId ? { ...g, task_id: undefined } : g))
  }

  return (
    <div className="h-full flex flex-col p-3 font-sans">
      <div className="flex items-center gap-2 mb-2.5 flex-shrink-0">
        <span className="text-sm leading-none">🎯</span>
        <h3 className="text-xs font-semibold text-gray-700">금주 목표</h3>
        <span className="text-[10px] text-gray-400 ml-auto">{getWeekRange()}</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-hide">
        {goals.length === 0 && (
          <p className="text-[11px] text-gray-300 py-1">이번 주 목표를 추가하세요</p>
        )}
        {goals.map(goal => {
          const linkedTask = goal.task_id ? tasks.find(t => t.id === goal.task_id) : null
          const taskStatus = linkedTask?.status
          const statusCls = taskStatus === '완료'
            ? 'bg-green-50 text-green-600'
            : taskStatus === '진행중'
              ? 'bg-blue-50 text-blue-600'
              : 'bg-gray-100 text-gray-500'

          return (
            <div key={goal.id} className="group flex items-start gap-2">
              <button
                onClick={() => toggleDone(goal.id)}
                className={`flex-shrink-0 mt-0.5 w-3.5 h-3.5 rounded border transition-colors ${
                  goal.done
                    ? 'bg-[#0F1E36] border-[#0F1E36]'
                    : 'border-gray-300 hover:border-gray-500'
                }`}
              >
                {goal.done && <span className="text-white text-[8px] leading-none flex items-center justify-center h-full">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] leading-snug ${goal.done ? 'line-through text-gray-300' : 'text-gray-700'}`}>
                  {goal.text}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  {linkedTask ? (
                    <div className="flex items-center gap-1">
                      <Link href={`/tasks/${linkedTask.id}`}
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${statusCls}`}>
                        {linkedTask.short_name ?? linkedTask.title.slice(0, 8)}
                      </Link>
                      <button onClick={() => unlinkTask(goal.id)}
                        className="text-[9px] text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setLinkingId(goal.id); setTaskSearch('') }}
                      className="text-[9px] text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      + 업무 연결
                    </button>
                  )}
                </div>

                {linkingId === goal.id && (
                  <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-md p-2 z-10 relative">
                    <input
                      autoFocus
                      value={taskSearch}
                      onChange={e => setTaskSearch(e.target.value)}
                      placeholder="업무 검색…"
                      className="text-xs w-full border-b border-gray-100 pb-1 mb-1 focus:outline-none text-gray-600 placeholder:text-gray-300"
                    />
                    {filteredTasks.length === 0
                      ? <p className="text-[10px] text-gray-300 py-1 text-center">검색 결과 없음</p>
                      : filteredTasks.map(t => (
                        <button key={t.id} onClick={() => linkTask(goal.id, t.id)}
                          className="w-full text-left text-xs px-1.5 py-1 hover:bg-gray-50 rounded text-gray-600 truncate flex items-center gap-1.5">
                          {t.short_name && <span className="text-[9px] bg-gray-100 text-gray-500 rounded px-1">{t.short_name}</span>}
                          {t.title}
                        </button>
                      ))
                    }
                    <button onClick={() => setLinkingId(null)}
                      className="text-[9px] text-gray-400 mt-1 hover:text-gray-600">취소</button>
                  </div>
                )}
              </div>
              <button onClick={() => removeGoal(goal.id)}
                className="flex-shrink-0 text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                ×
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex-shrink-0 flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addGoal() }}
          placeholder="이번 주 목표 추가…"
          className="flex-1 text-xs border border-white/60 bg-white/50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gray-300 transition-all placeholder:text-gray-300"
        />
        <button onClick={addGoal} disabled={!newText.trim()}
          className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-white/50 disabled:opacity-30 transition-colors">
          +
        </button>
      </div>
    </div>
  )
}
