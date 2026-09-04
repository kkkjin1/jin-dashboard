'use client'

import { useState } from 'react'
import type { AnnualGoalTask, TestPracticeTask, AgendaPriority } from '@/types'
import { useAgendaMemo } from '@/hooks/useAgendaMemo'
import { DateCellPicker } from '@/components/ui/MiniDatePicker'
import { PRIORITY_ORDER, PRIORITY_STYLE } from './priorityStyle'
import ExecTaskModal from './ExecTaskModal'

const EXEC_STATUS_DOT: Record<TestPracticeTask['status'], string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }

interface Props {
  agenda: AnnualGoalTask
  categoryLabel: string
  itemTitle: string
  itemColor?: string
  execs: TestPracticeTask[]
  priority: AgendaPriority
  onClose: () => void
  onChangePriority: (p: AgendaPriority) => Promise<boolean>
  onAddExec: (title: string) => Promise<boolean>
  onCycleExecStatus: (exec: TestPracticeTask) => Promise<boolean>
  onCompleteExec: (exec: TestPracticeTask) => Promise<boolean>
  onChangeExecDueDate: (exec: TestPracticeTask, dueDate: string | null) => Promise<boolean>
  onUpdateExecTitle: (exec: TestPracticeTask, title: string) => Promise<boolean>
  onDeleteExec: (exec: TestPracticeTask) => Promise<boolean>
  saveError?: string | null
}

const MEMO_STATUS_LABEL: Record<string, string> = { pending: '저장 중…', saving: '저장 중…', saved: '저장됨', failed: '저장 실패' }
const MEMO_STATUS_COLOR: Record<string, string> = { pending: 'rgba(226,232,240,0.35)', saving: 'rgba(226,232,240,0.35)', saved: '#38BE98', failed: '#F87171' }

export default function AgendaDetailPanel({
  agenda, categoryLabel, itemTitle, itemColor, execs, priority,
  onClose, onChangePriority, onAddExec, onCycleExecStatus, onCompleteExec, onChangeExecDueDate,
  onUpdateExecTitle, onDeleteExec, saveError,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [openExecId, setOpenExecId] = useState<string | null>(null)
  const memo = useAgendaMemo(agenda.id)
  const openExec = openExecId ? execs.find(e => e.id === openExecId) ?? null : null

  const done = execs.filter(e => e.status === 'done').length
  const total = execs.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  function submitAdd() {
    const t = newTitle.trim()
    setAdding(false)
    setNewTitle('')
    if (t) onAddExec(t)
  }

  return (
    <div className="h-full flex flex-col min-h-0" style={itemColor ? { borderLeft: `3px solid ${itemColor}55` } : undefined}>
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-5 pt-4 pb-1">
        <span className="text-[11px] truncate" style={{ color: 'rgba(226,232,240,0.4)' }}>
          {categoryLabel} · {itemTitle}
        </span>
        <button onClick={onClose} className="text-[15px] flex-shrink-0 px-1.5 hover:text-white transition-colors" style={{ color: 'rgba(226,232,240,0.4)' }}>×</button>
      </div>

      {saveError && (
        <div className="flex-shrink-0 mx-5 mt-1 mb-1 px-3 py-1.5 rounded-lg text-[11.5px]" style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171' }}>
          {saveError} — 잠시 후 다시 시도해주세요.
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 pb-6 flex flex-col">
        <div className="flex flex-col gap-3.5 pt-1 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: PRIORITY_STYLE[priority].bg, color: PRIORITY_STYLE[priority].text }}>
              {priority}
            </span>
            <h2 className="text-[18px] font-bold mt-2 leading-snug" style={{ color: '#E7EAF0' }}>{agenda.title}</h2>
          </div>

          <div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? '#34D399' : '#4C7FE0' }} />
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: 'rgba(226,232,240,0.4)' }}>{done}/{total} · {pct}%</div>
          </div>
        </div>

        <div className="flex flex-col gap-1 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(226,232,240,0.35)' }}>실행 TASK</span>
          {execs.map(exec => (
            <div key={exec.id} className="group flex items-center gap-2 py-1.5 -mx-1 px-1 rounded-lg hover:bg-[rgba(255,255,255,0.03)] transition-colors">
              <button onClick={() => onCycleExecStatus(exec)} title={exec.status}
                style={{ width: 8, height: 8, borderRadius: '50%', background: EXEC_STATUS_DOT[exec.status], border: 'none', cursor: 'pointer', flexShrink: 0 }} />
              <button onClick={() => setOpenExecId(exec.id)}
                className="flex-1 min-w-0 text-left text-[12.5px] truncate hover:underline">
                <span style={{ color: exec.status === 'done' ? 'rgba(226,232,240,0.4)' : 'rgba(226,232,240,0.85)', textDecoration: exec.status === 'done' ? 'line-through' : 'none' }}>
                  {exec.title}
                </span>
              </button>
              {exec.status !== 'done' && (
                <button onClick={() => onCompleteExec(exec)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(16,185,129,0.14)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}>
                  완료
                </button>
              )}
              <div className="flex-shrink-0" style={{ width: 46 }} onClick={e => e.stopPropagation()}>
                <DateCellPicker label="" value={exec.due_date ?? null} color="#8FB1F0" onChange={v => onChangeExecDueDate(exec, v)} />
              </div>
            </div>
          ))}
          {execs.length === 0 && (
            <div className="text-[11.5px] py-1" style={{ color: 'rgba(226,232,240,0.28)' }}>실행 TASK가 없습니다.</div>
          )}

          {adding ? (
            <input autoFocus value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
              onBlur={submitAdd}
              placeholder="실행 TASK 제목 입력 후 Enter"
              className="text-[12.5px] bg-transparent border-b border-[rgba(255,255,255,0.15)] focus:border-[#4C7FE0] focus:outline-none py-1.5 mt-1 text-[rgba(226,232,240,0.85)] placeholder:text-[rgba(226,232,240,0.25)]" />
          ) : (
            <button onClick={() => setAdding(true)}
              className="text-left text-[11.5px] rounded-lg px-2 py-1.5 mt-1 border border-dashed transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(226,232,240,0.4)' }}>
              + 실행 TASK 추가
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(226,232,240,0.35)' }}>우선순위</span>
          <div className="flex gap-1.5">
            {PRIORITY_ORDER.map(p => {
              const active = p === priority
              const ps = PRIORITY_STYLE[p]
              return (
                <button key={p} onClick={() => onChangePriority(p)}
                  className="flex-1 text-[12px] font-bold py-1.5 rounded-lg transition-colors"
                  style={active
                    ? { background: ps.bg, color: ps.text, border: `1px solid ${ps.border}` }
                    : { background: 'transparent', color: 'rgba(226,232,240,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {p}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(226,232,240,0.35)' }}>메모</span>
            {MEMO_STATUS_LABEL[memo.status] && (
              <span className="text-[10.5px]" style={{ color: MEMO_STATUS_COLOR[memo.status] }}>{MEMO_STATUS_LABEL[memo.status]}</span>
            )}
          </div>
          <textarea
            value={memo.content}
            onChange={e => memo.change(e.target.value)}
            placeholder="메모를 입력하세요"
            rows={4}
            className="text-[12.5px] rounded-lg px-3 py-2.5 resize-none focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(226,232,240,0.85)' }}
          />
        </div>
      </div>

      {openExec && (
        <ExecTaskModal
          exec={openExec}
          agendaTitle={agenda.title}
          onClose={() => setOpenExecId(null)}
          onCycleStatus={onCycleExecStatus}
          onChangeDueDate={onChangeExecDueDate}
          onUpdateTitle={onUpdateExecTitle}
          onDelete={onDeleteExec}
          saveError={saveError}
        />
      )}
    </div>
  )
}
