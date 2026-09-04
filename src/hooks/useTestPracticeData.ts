'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAgendaPriorities, setAgendaPriority as setAgendaPriorityDb } from '@/lib/testPractice/priority'
import type { AnnualGoalItem, AnnualGoalTask, TestPracticeTask, AgendaPriority, AnnualGoalStatus } from '@/types'

const EXEC_STATUS_CYCLE: AnnualGoalStatus[] = ['active', 'hold', 'done']

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface UseTestPracticeDataResult {
  items: AnnualGoalItem[]
  agendas: AnnualGoalTask[]
  execsByAgenda: Record<string, TestPracticeTask[]>
  priorityByAgenda: Record<string, AgendaPriority>
  loading: boolean
  saveError: string | null
  addExecTask: (agendaId: string, title: string) => Promise<boolean>
  cycleExecStatus: (exec: TestPracticeTask) => Promise<boolean>
  completeExec: (exec: TestPracticeTask) => Promise<boolean>
  updateExecDueDate: (exec: TestPracticeTask, dueDate: string | null) => Promise<boolean>
  updateExecTitle: (exec: TestPracticeTask, title: string) => Promise<boolean>
  deleteExec: (exec: TestPracticeTask) => Promise<boolean>
  updatePriority: (agendaId: string, priority: AgendaPriority) => Promise<boolean>
}

// 테스트실무 화면의 데이터 계층 — annual_goal_items(목표)/annual_goal_tasks(과제)는
// 조회만 하고, test_practice_tasks(실행 TASK)와 test_practice_agenda_priority(우선순위)만 쓴다.
export function useTestPracticeData(category: string, onMutate?: () => void): UseTestPracticeDataResult {
  const supabase = createClient()

  const [items, setItems] = useState<AnnualGoalItem[]>([])
  const [agendas, setAgendas] = useState<AnnualGoalTask[]>([])
  const [execsByAgenda, setExecsByAgenda] = useState<Record<string, TestPracticeTask[]>>({})
  const [priorityByAgenda, setPriorityByAgenda] = useState<Record<string, AgendaPriority>>({})
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 최소한의 실패 표시 — 별도 toast 시스템 없이, 짧게 떴다 사라지는 배너 하나만 공유
  function reportSaveError(action: string, message: string) {
    console.error(`[테스트실무] ${action} 실패:`, message)
    setSaveError(`${action} 실패`)
    if (saveErrorTimer.current) clearTimeout(saveErrorTimer.current)
    saveErrorTimer.current = setTimeout(() => setSaveError(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)

    let itemQuery = supabase.from('annual_goal_items').select('*').order('category').order('sort_order')
    if (category !== '전체') itemQuery = itemQuery.eq('category', category)
    const { data: itemData } = await itemQuery
    const fetchedItems = (itemData ?? []) as AnnualGoalItem[]
    setItems(fetchedItems)

    if (fetchedItems.length === 0) {
      setAgendas([]); setExecsByAgenda({}); setPriorityByAgenda({}); setLoading(false); return
    }

    const { data: agendaData } = await supabase.from('annual_goal_tasks')
      .select('*')
      .in('item_id', fetchedItems.map(i => i.id))
      .order('sort_order')
    const fetchedAgendas = (agendaData ?? []) as AnnualGoalTask[]
    setAgendas(fetchedAgendas)

    if (fetchedAgendas.length === 0) {
      setExecsByAgenda({}); setPriorityByAgenda({}); setLoading(false); return
    }

    const agendaIds = fetchedAgendas.map(a => a.id)
    const [{ data: execData }, priorities] = await Promise.all([
      supabase.from('test_practice_tasks').select('*').in('annual_goal_task_id', agendaIds).order('sort_order'),
      fetchAgendaPriorities(supabase, agendaIds),
    ])
    const fetchedExecs = (execData ?? []) as TestPracticeTask[]
    const byAgenda: Record<string, TestPracticeTask[]> = {}
    fetchedExecs.forEach(e => { (byAgenda[e.annual_goal_task_id] ??= []).push(e) })
    setExecsByAgenda(byAgenda)
    setPriorityByAgenda(priorities)

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  useEffect(() => { load() }, [load])

  async function addExecTask(agendaId: string, title: string): Promise<boolean> {
    const t = title.trim()
    if (!t) return false
    const existing = execsByAgenda[agendaId] ?? []
    const { data, error } = await supabase.from('test_practice_tasks')
      .insert({ annual_goal_task_id: agendaId, title: t, status: 'active', sort_order: existing.length })
      .select().single()
    if (error || !data) { reportSaveError('실행TASK 추가', error?.message ?? 'unknown'); return false }
    const created = data as TestPracticeTask
    setExecsByAgenda(prev => ({ ...prev, [agendaId]: [...(prev[agendaId] ?? []), created] }))
    onMutate?.()
    return true
  }

  async function cycleExecStatus(exec: TestPracticeTask): Promise<boolean> {
    const next = EXEC_STATUS_CYCLE[(EXEC_STATUS_CYCLE.indexOf(exec.status) + 1) % EXEC_STATUS_CYCLE.length]
    // done으로 들어가는 순간 오늘 날짜로 완료일 기록 — 완료성과/회고 등 날짜 기반 조회가 이 값을 사용
    const completedAt = next === 'done' ? todayStr() : null
    const { error } = await supabase.from('test_practice_tasks').update({ status: next, completed_at: completedAt }).eq('id', exec.id)
    if (error) { reportSaveError('상태 변경', error.message); return false }
    setExecsByAgenda(prev => ({
      ...prev,
      [exec.annual_goal_task_id]: (prev[exec.annual_goal_task_id] ?? []).map(e => e.id === exec.id ? { ...e, status: next, completed_at: completedAt } : e),
    }))
    onMutate?.()
    return true
  }

  // 여러 실행 TASK 중 하나를 상태 순환 없이 즉시 완료 처리 (hover 완료 버튼용)
  async function completeExec(exec: TestPracticeTask): Promise<boolean> {
    if (exec.status === 'done') return true
    const completedAt = todayStr()
    const { error } = await supabase.from('test_practice_tasks').update({ status: 'done', completed_at: completedAt }).eq('id', exec.id)
    if (error) { reportSaveError('완료 처리', error.message); return false }
    setExecsByAgenda(prev => ({
      ...prev,
      [exec.annual_goal_task_id]: (prev[exec.annual_goal_task_id] ?? []).map(e => e.id === exec.id ? { ...e, status: 'done', completed_at: completedAt } : e),
    }))
    onMutate?.()
    return true
  }

  async function updateExecDueDate(exec: TestPracticeTask, dueDate: string | null): Promise<boolean> {
    const { error } = await supabase.from('test_practice_tasks').update({ due_date: dueDate }).eq('id', exec.id)
    if (error) { reportSaveError('완료일 변경', error.message); return false }
    setExecsByAgenda(prev => ({
      ...prev,
      [exec.annual_goal_task_id]: (prev[exec.annual_goal_task_id] ?? []).map(e => e.id === exec.id ? { ...e, due_date: dueDate } : e),
    }))
    return true
  }

  async function updateExecTitle(exec: TestPracticeTask, title: string): Promise<boolean> {
    const { error } = await supabase.from('test_practice_tasks').update({ title }).eq('id', exec.id)
    if (error) { reportSaveError('제목 변경', error.message); return false }
    setExecsByAgenda(prev => ({
      ...prev,
      [exec.annual_goal_task_id]: (prev[exec.annual_goal_task_id] ?? []).map(e => e.id === exec.id ? { ...e, title } : e),
    }))
    return true
  }

  async function deleteExec(exec: TestPracticeTask): Promise<boolean> {
    const { error } = await supabase.from('test_practice_tasks').delete().eq('id', exec.id)
    if (error) { reportSaveError('삭제', error.message); return false }
    setExecsByAgenda(prev => ({
      ...prev,
      [exec.annual_goal_task_id]: (prev[exec.annual_goal_task_id] ?? []).filter(e => e.id !== exec.id),
    }))
    onMutate?.()
    return true
  }

  async function updatePriority(agendaId: string, priority: AgendaPriority): Promise<boolean> {
    const prevPriority = priorityByAgenda[agendaId]
    setPriorityByAgenda(prev => ({ ...prev, [agendaId]: priority }))
    const ok = await setAgendaPriorityDb(supabase, agendaId, priority)
    if (!ok) {
      reportSaveError('우선순위 변경', 'unknown')
      setPriorityByAgenda(prev => ({ ...prev, [agendaId]: prevPriority }))
      return false
    }
    return true
  }

  return { items, agendas, execsByAgenda, priorityByAgenda, loading, saveError, addExecTask, cycleExecStatus, completeExec, updateExecDueDate, updateExecTitle, deleteExec, updatePriority }
}
