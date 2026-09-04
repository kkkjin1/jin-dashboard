'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TestPracticeTask, Member, AnnualGoalStatus } from '@/types'
import TiptapEditor from '@/components/TiptapEditor'
import { GlassSelect } from '@/components/ui/GlassSelect'
import { DateCellPicker } from '@/components/ui/MiniDatePicker'

const STATUS_LABEL: Record<AnnualGoalStatus, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<AnnualGoalStatus, string> = {
  active: 'bg-blue-500/10 text-blue-300 border-blue-500/25',
  hold:   'bg-amber-500/10 text-amber-300 border-amber-500/25',
  done:   'bg-white/5 text-[rgba(226,232,240,0.4)] border-white/10',
}
const STATUS_DOT: Record<AnnualGoalStatus, string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(226,232,240,0.35)' }}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

type DescStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed'
const DESC_STATUS_LABEL: Record<DescStatus, string> = { idle: '자동 저장', pending: '저장 중…', saving: '저장 중…', saved: '저장됨 ✓', failed: '저장 실패' }
const DESC_STATUS_COLOR: Record<DescStatus, string> = { idle: 'rgba(226,232,240,0.25)', pending: 'rgba(226,232,240,0.35)', saving: 'rgba(226,232,240,0.35)', saved: '#38BE98', failed: '#F87171' }

interface Props {
  exec: TestPracticeTask
  agendaTitle: string
  onClose: () => void
  onCycleStatus: (exec: TestPracticeTask) => Promise<boolean>
  onChangeDueDate: (exec: TestPracticeTask, dueDate: string | null) => Promise<boolean>
  onUpdateTitle: (exec: TestPracticeTask, title: string) => Promise<boolean>
  onDelete: (exec: TestPracticeTask) => Promise<boolean>
  saveError?: string | null
}

// 실행 TASK 상세 — 별도 페이지(/test-practice/tasks/[id]) 대신 하단 모달로 편집.
// 담당자/시작일/설명은 리스트에 노출되지 않는 필드라 로컬 supabase 업데이트만 하고,
// 목록에 보이는 제목/상태/완료일만 부모 캐시(execsByAgenda)에 동기화한다.
export default function ExecTaskModal({ exec, agendaTitle, onClose, onCycleStatus, onChangeDueDate, onUpdateTitle, onDelete, saveError }: Props) {
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [description, setDescription] = useState(exec.description ?? '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(exec.title)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // 담당자/시작일은 리스트에 노출되지 않아 부모 캐시(execsByAgenda)에 동기화하지 않는 필드라
  // 여기서 직접 로컬 상태로 들고 있어야 저장 후 화면에 반영된다 (안 그러면 exec prop이 안 바뀌어 안 바뀐 것처럼 보임)
  const [startDate, setStartDate] = useState(exec.start_date ?? null)
  const [assigneeId, setAssigneeId] = useState(exec.assignee_id ?? null)
  const [descStatus, setDescStatus] = useState<DescStatus>('idle')
  const [localError, setLocalError] = useState<string | null>(null)
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const descStatusResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function reportLocalError(message: string) {
    console.error('[테스트실무] 실행TASK 저장 실패:', message)
    setLocalError(message)
    if (localErrorTimer.current) clearTimeout(localErrorTimer.current)
    localErrorTimer.current = setTimeout(() => setLocalError(null), 3000)
  }

  useEffect(() => {
    supabase.from('members').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setDescription(exec.description ?? '')
    setEditTitle(exec.title)
    setEditingTitle(false)
    setConfirmingDelete(false)
    setStartDate(exec.start_date ?? null)
    setAssigneeId(exec.assignee_id ?? null)
    setDescStatus('idle')
  }, [exec.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 실무내용이 저장 안 된 상태(pending/saving/failed)일 때만 새로고침/탭 종료를 경고
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (descStatus === 'pending' || descStatus === 'saving' || descStatus === 'failed') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [descStatus])

  function handleDescription(value: string) {
    setDescription(value)
    setDescStatus('pending')
    if (descTimer.current) clearTimeout(descTimer.current)
    if (descStatusResetTimer.current) clearTimeout(descStatusResetTimer.current)
    descTimer.current = setTimeout(async () => {
      setDescStatus('saving')
      const { error } = await supabase.from('test_practice_tasks').update({ description: value }).eq('id', exec.id)
      if (error) { console.error('[테스트실무] 실무내용 저장 실패:', error.message); setDescStatus('failed'); return }
      setDescStatus('saved')
      descStatusResetTimer.current = setTimeout(() => setDescStatus('idle'), 2000)
    }, 600)
  }

  async function saveTitle() {
    const t = editTitle.trim()
    setEditingTitle(false)
    if (!t || t === exec.title) { setEditTitle(exec.title); return }
    const ok = await onUpdateTitle(exec, t)
    if (ok === false) reportLocalError('제목 변경 실패')
  }

  async function updateAssignee(id: string | null) {
    const { error } = await supabase.from('test_practice_tasks').update({ assignee_id: id }).eq('id', exec.id)
    if (error) { reportLocalError('담당자 변경 실패'); return }
    setAssigneeId(id)
  }
  async function updateStartDate(date: string | null) {
    const { error } = await supabase.from('test_practice_tasks').update({ start_date: date }).eq('id', exec.id)
    if (error) { reportLocalError('시작일 변경 실패'); return }
    setStartDate(date)
  }

  async function handleDelete() {
    const ok = await onDelete(exec)
    if (ok === false) { reportLocalError('삭제 실패'); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl flex flex-col gap-5 px-5 md:px-6 pt-5 pb-8 scrollbar-hide"
        style={{ background: '#161A22', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] truncate" style={{ color: 'rgba(226,232,240,0.4)' }}>{agendaTitle}</span>
          <button onClick={onClose} className="text-[15px] flex-shrink-0 px-1.5 hover:text-white transition-colors" style={{ color: 'rgba(226,232,240,0.4)' }}>×</button>
        </div>

        {(saveError || localError) && (
          <div className="px-3 py-1.5 rounded-lg text-[11.5px]" style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171' }}>
            {saveError || localError} — 잠시 후 다시 시도해주세요.
          </div>
        )}

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(226,232,240,0.35)' }}>실행 TASK</div>
          <div className="flex items-center gap-3">
            <button onClick={() => onCycleStatus(exec)} title={STATUS_LABEL[exec.status]}
              style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_DOT[exec.status], border: 'none', cursor: 'pointer', flexShrink: 0 }} />
            {editingTitle ? (
              <input autoFocus value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setEditTitle(exec.title) } }}
                onBlur={saveTitle}
                className="flex-1 min-w-0 text-xl font-bold border-b-2 focus:outline-none bg-transparent pb-0.5"
                style={{ color: '#E2E8F0', borderColor: '#4C7FE0' }} />
            ) : (
              <h2 onClick={() => { setEditingTitle(true); setEditTitle(exec.title) }}
                className="flex-1 min-w-0 text-xl font-bold cursor-text truncate transition-colors"
                style={{ color: exec.status === 'done' ? 'rgba(226,232,240,0.4)' : '#E2E8F0', textDecoration: exec.status === 'done' ? 'line-through' : 'none' }}>
                {exec.title}
              </h2>
            )}
          </div>
        </div>

        <div className="rounded-2xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
            <MetaCell label="담당자">
              <GlassSelect value={assigneeId ?? ''} onChange={v => updateAssignee(v || null)} options={members.map(m => ({ value: m.id, label: m.name }))} placeholder="-" variant="pill" activeWhenFilled />
            </MetaCell>
            <MetaCell label="상태">
              <button onClick={() => onCycleStatus(exec)} className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[exec.status]}`}>
                {STATUS_LABEL[exec.status]}
              </button>
            </MetaCell>
            <MetaCell label="시작일">
              <div style={{ width: 96 }}>
                <DateCellPicker label="" value={startDate} color="#8FB1F0" onChange={updateStartDate} valueSize={13} />
              </div>
            </MetaCell>
            <MetaCell label="완료일">
              <div style={{ width: 96 }}>
                <DateCellPicker label="" value={exec.due_date ?? null} color="#86EFAC" onChange={v => onChangeDueDate(exec, v)} valueSize={13} />
              </div>
            </MetaCell>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-4 pt-3.5 pb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'rgba(226,232,240,0.55)' }}>실무 내용</span>
            <span className="text-[10.5px]" style={{ color: DESC_STATUS_COLOR[descStatus] }}>{DESC_STATUS_LABEL[descStatus]}</span>
          </div>
          <TiptapEditor dark value={description} onChange={handleDescription} minHeight={160} className="px-4 pb-4" />
        </div>

        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ border: '1px solid rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.04)' }}>
          <span className="text-xs" style={{ color: 'rgba(226,232,240,0.4)' }}>이 실행 TASK를 삭제하면 되돌릴 수 없습니다.</span>
          {confirmingDelete ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={handleDelete} className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors px-2 py-1">정말 삭제</button>
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
