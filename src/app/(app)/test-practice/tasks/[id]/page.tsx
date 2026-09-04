'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { TestPracticeTask, Member, AnnualGoalStatus } from '@/types'
import TiptapEditor from '@/components/TiptapEditor'
import { GlassSelect } from '@/components/ui/GlassSelect'
import { DateCellPicker } from '@/components/ui/MiniDatePicker'

const STATUS_CYCLE: AnnualGoalStatus[] = ['active', 'hold', 'done']
const STATUS_LABEL: Record<AnnualGoalStatus, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<AnnualGoalStatus, string> = {
  active: 'bg-blue-50 text-blue-600 border-blue-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
  done:   'bg-gray-100 text-gray-400 border-gray-200',
}
const STATUS_DOT: Record<AnnualGoalStatus, string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }

function fallbackLabel(c: string) { return c.replace(/^\d+\.\s*/, '') }

interface GoalPath {
  categoryLabel: string
  itemTitle: string
  itemColor: string
  taskTitle: string
}

// 담당자/기간 metadata 셀 공통 레이아웃 — 라벨은 항상 작게 위, 값은 아래
function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(226,232,240,0.35)' }}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export default function TestPracticeTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [task, setTask] = useState<TestPracticeTask | null>(null)
  const [goalPath, setGoalPath] = useState<GoalPath | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [description, setDescription] = useState('')
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('test_practice_tasks')
      // annual_goal_task_id -> annual_goal_tasks -> item_id -> annual_goal_items (읽기 전용 참조, 복제하지 않음)
      .select('*, annual_goal_tasks(title, item_id, annual_goal_items(title, color, category))')
      .eq('id', id)
      .single()

    if (!data) { setNotFound(true); setLoading(false); return }

    type Joined = TestPracticeTask & {
      annual_goal_tasks: { title: string; item_id: string; annual_goal_items: { title: string; color: string; category: string } } | null
    }
    const { annual_goal_tasks, ...rest } = data as Joined
    setTask(rest)
    setDescription(rest.description ?? '')

    if (annual_goal_tasks) {
      const category = annual_goal_tasks.annual_goal_items?.category ?? ''
      const { data: labelRow } = await supabase
        .from('annual_goal_category_labels')
        .select('name')
        .eq('category_key', category)
        .maybeSingle()
      setGoalPath({
        categoryLabel: labelRow?.name ?? fallbackLabel(category),
        itemTitle: annual_goal_tasks.annual_goal_items?.title ?? '',
        itemColor: annual_goal_tasks.annual_goal_items?.color ?? '#3B82F6',
        taskTitle: annual_goal_tasks.title,
      })
    }

    setLoading(false)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('members').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDescription(value: string) {
    setDescription(value)
    if (descTimer.current) clearTimeout(descTimer.current)
    descTimer.current = setTimeout(async () => {
      await supabase.from('test_practice_tasks').update({ description: value }).eq('id', id)
    }, 600)
  }

  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !task) { setEditingTitle(false); return }
    await supabase.from('test_practice_tasks').update({ title: t }).eq('id', id)
    setTask(p => p ? { ...p, title: t } : p)
    setEditingTitle(false)
  }

  async function cycleStatus() {
    if (!task) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length]
    await supabase.from('test_practice_tasks').update({ status: next }).eq('id', id)
    setTask(p => p ? { ...p, status: next } : p)
  }

  async function updateAssignee(assigneeId: string | null) {
    await supabase.from('test_practice_tasks').update({ assignee_id: assigneeId }).eq('id', id)
    setTask(p => p ? { ...p, assignee_id: assigneeId } : p)
  }
  async function updateStartDate(date: string | null) {
    await supabase.from('test_practice_tasks').update({ start_date: date }).eq('id', id)
    setTask(p => p ? { ...p, start_date: date } : p)
  }
  async function updateDueDate(date: string | null) {
    await supabase.from('test_practice_tasks').update({ due_date: date }).eq('id', id)
    setTask(p => p ? { ...p, due_date: date } : p)
  }

  async function deleteTask() {
    await supabase.from('test_practice_tasks').delete().eq('id', id)
    router.push('/test-practice')
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  if (notFound || !task) return <div className="flex items-center justify-center h-40 text-sm text-gray-400">실행 TASK를 찾을 수 없습니다.</div>

  const itemColor = goalPath?.itemColor ?? '#3B82F6'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto px-4 md:px-6 py-6 pb-16 flex flex-col gap-5">

        {/* ── 브레드크럼 — 테스트실무 > 영역 > 목표 > 과제(전략/맥락 경로) ── */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
          <button onClick={() => router.push('/test-practice')} className="hover:text-gray-700 transition-colors font-medium">
            테스트실무
          </button>
          {goalPath && (
            <>
              <span>›</span>
              <span style={{ color: 'rgba(226,232,240,0.5)' }}>{goalPath.categoryLabel}</span>
              <span>›</span>
              <span style={{ color: itemColor, fontWeight: 600 }}>{goalPath.itemTitle}</span>
              <span>›</span>
              <span className="text-gray-500 truncate max-w-[220px]">{goalPath.taskTitle}</span>
            </>
          )}
        </div>

        {/* ── 실행 TASK 라벨 + 제목 + 상태 dot (연간목표 TASK 이름과 명확히 분리) ── */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(226,232,240,0.35)' }}>실행 TASK</div>
          <div className="flex items-center gap-3">
            <button onClick={cycleStatus} title={STATUS_LABEL[task.status]}
              style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_DOT[task.status], border: 'none', cursor: 'pointer', flexShrink: 0 }} />
            {editingTitle ? (
              <input autoFocus value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                onBlur={saveTitle}
                className="flex-1 min-w-0 text-2xl font-bold text-gray-900 border-b-2 border-blue-400 focus:outline-none bg-transparent pb-0.5" />
            ) : (
              <h1 onClick={() => { setEditingTitle(true); setEditTitle(task.title) }}
                className="flex-1 min-w-0 text-2xl font-bold cursor-text hover:text-[rgba(226,232,240,0.7)] transition-colors leading-tight truncate"
                style={{ color: task.status === 'done' ? '#9CA3AF' : '#E2E8F0', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                {task.title}
              </h1>
            )}
          </div>
        </div>

        {/* ── metadata — 담당자 / 상태 / 시작일 / 완료일을 한 행(모바일은 2x2)으로 압축 배치 ── */}
        <div className="surface-card rounded-2xl px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
            <MetaCell label="담당자">
              <GlassSelect value={task.assignee_id ?? ''} onChange={v => updateAssignee(v || null)} options={members.map(m => ({ value: m.id, label: m.name }))} placeholder="-" variant="pill" activeWhenFilled />
            </MetaCell>
            <MetaCell label="상태">
              <button onClick={cycleStatus} className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[task.status]}`}>
                {STATUS_LABEL[task.status]}
              </button>
            </MetaCell>
            <MetaCell label="시작일">
              <div style={{ width: 96 }}>
                <DateCellPicker label="시작" value={task.start_date ?? null} color={itemColor} onChange={updateStartDate} />
              </div>
            </MetaCell>
            <MetaCell label="완료일">
              <div style={{ width: 96 }}>
                <DateCellPicker label="완료" value={task.due_date ?? null} color="#86EFAC" onChange={updateDueDate} />
              </div>
            </MetaCell>
          </div>
        </div>

        {/* ── 실무 내용 — 이 화면의 핵심 콘텐츠, 가장 넓은 편집 공간을 준다 ── */}
        <div className="surface-card rounded-2xl overflow-hidden" style={{ borderLeft: `3px solid ${itemColor}55` }}>
          <div className="px-5 pt-4 pb-2">
            <span className="text-xs font-semibold" style={{ color: 'rgba(226,232,240,0.55)' }}>실무 내용</span>
          </div>
          <TiptapEditor dark value={description} onChange={handleDescription} minHeight={220} className="px-5 pb-5" />
        </div>

        {/* ── danger zone ── */}
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ border: '1px solid rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.04)' }}>
          <span className="text-xs" style={{ color: 'rgba(226,232,240,0.4)' }}>이 실행 TASK를 삭제하면 되돌릴 수 없습니다.</span>
          {confirmingDelete ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={deleteTask} className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors px-2 py-1">정말 삭제</button>
              <button onClick={() => setConfirmingDelete(false)} className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors px-2 py-1">취소</button>
            </div>
          ) : (
            <button onClick={() => setConfirmingDelete(true)}
              className="text-xs font-medium text-red-400/80 hover:text-red-400 border border-red-500/25 hover:border-red-500/40 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0">
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
