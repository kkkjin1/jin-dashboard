'use client'

// 안건 상세 하단 "할 일" — 실행 task(agenda_sub_tasks, kind='task')를 체크 한 줄로.
// 날짜(target_date)를 넣으면 홈 오늘·금주 업무에 그대로 나온다(기존 연동 그대로).
// 기록은 위 히스토리 박스에 쓰는 구조라 여기엔 펼치기·노트·첨부가 없다.
import { useEffect, useState } from 'react'
import type { AgendaSubTask, Member } from '@/types'

type Sched = { today: string; tomorrow: string; friday: string }

function dateChip(date: string, sched: Sched): { label: string; color: string; bg: string } {
  if (date < sched.today) return { label: `${Number(date.slice(5, 7))}/${Number(date.slice(8))} 지남`, color: '#B42318', bg: 'rgba(240,68,56,0.10)' }
  if (date === sched.today) return { label: '오늘', color: '#B42318', bg: 'rgba(240,68,56,0.10)' }
  if (date === sched.tomorrow) return { label: '내일', color: '#9A6200', bg: 'rgba(234,170,8,0.14)' }
  if (date <= sched.friday) return { label: '금주', color: '#2F5FB8', bg: 'rgba(76,127,224,0.12)' }
  return { label: `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`, color: 'rgba(var(--text-rgb),0.7)', bg: 'rgba(var(--ink-rgb),0.06)' }
}

function TodoRow({ st, members, sched, onToggleDone, onDate, onAssignee, onRename, onDelete, onToHistory }: {
  st: AgendaSubTask
  members: Member[]
  sched: Sched
  onToggleDone: () => void
  onDate: (date: string | null) => void
  onAssignee: (id: string | null) => void
  onRename: (title: string) => void
  onDelete: () => void
  onToHistory: () => void
}) {
  const done = st.status === 'done'
  const [renaming, setRenaming] = useState(false)
  const [nameVal, setNameVal] = useState(st.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 날짜 메뉴 — 칸이 overflow 영역 안이라 fixed로 띄운다
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    if (!menuPos) return
    const close = () => setMenuPos(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('pointerdown', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('pointerdown', close) }
  }, [menuPos])

  function commitName() {
    const t = nameVal.trim()
    setRenaming(false)
    if (!t) { setNameVal(st.title); return }
    if (t !== st.title) onRename(t)
  }

  // 완료한 할 일은 "지남"·오늘 강조 없이 회색 날짜만
  const chip = !st.target_date ? null
    : done ? { label: `${Number(st.target_date.slice(5, 7))}/${Number(st.target_date.slice(8))}`, color: 'rgba(var(--text-rgb),0.4)', bg: 'rgba(var(--ink-rgb),0.04)' }
    : dateChip(st.target_date, sched)
  const assignee = members.find(m => m.id === st.assignee_id)

  return (
    <div className="group/todo flex items-center gap-2.5 py-2 border-b border-[rgba(var(--ink-rgb),0.05)] min-w-0">
      <input type="checkbox" checked={done} onChange={onToggleDone} aria-label={`${st.title} 완료`}
        className="w-[15px] h-[15px] flex-shrink-0 cursor-pointer" style={{ accentColor: '#3D6FD6' }} />
      {renaming ? (
        <input autoFocus value={nameVal}
          onFocus={e => e.currentTarget.select()}
          onChange={e => setNameVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitName()
            if (e.key === 'Escape') { setNameVal(st.title); setRenaming(false) }
          }}
          onBlur={commitName}
          className="flex-1 min-w-0 text-[13px] bg-transparent border-b border-[rgba(var(--ink-rgb),0.3)] focus:outline-none" />
      ) : (
        <span className="flex-1 min-w-0 text-[13px] truncate cursor-text"
          onDoubleClick={() => { setNameVal(st.title); setRenaming(true) }}
          title="두 번 클릭해서 이름 바꾸기"
          style={{ color: done ? 'rgba(var(--text-rgb),0.4)' : 'rgba(var(--text-rgb),0.9)', textDecoration: done ? 'line-through' : 'none' }}>
          {st.title}
        </span>
      )}
      {st.status === 'hold' && <span className="text-[10px] font-semibold text-amber-600 flex-shrink-0">보류</span>}
      {/* 호버 메뉴 */}
      {!renaming && (
        <span className="flex items-center gap-1.5 opacity-0 group-hover/todo:opacity-100 transition-opacity flex-shrink-0">
          <button type="button" onClick={onToHistory} title="히스토리 박스로 옮기기"
            className="text-[10px] text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.85)] whitespace-nowrap">히스토리로</button>
          {confirmDelete ? (
            <>
              <button type="button" onClick={onDelete} className="text-[10px] text-red-500 font-semibold">삭제</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-[10px] text-[rgba(var(--text-rgb),0.4)]">취소</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-[10px] text-[rgba(var(--text-rgb),0.3)] hover:text-red-400">삭제</button>
          )}
        </span>
      )}
      <button type="button"
        onClick={e => {
          if (menuPos) { setMenuPos(null); return }
          const r = e.currentTarget.getBoundingClientRect()
          setMenuPos({ left: Math.max(8, r.right - 220), top: r.bottom + 6 })
        }}
        className="text-[11px] font-semibold rounded-md px-2 py-0.5 flex-shrink-0 whitespace-nowrap"
        style={chip
          ? { color: chip.color, background: chip.bg }
          : { color: 'rgba(var(--text-rgb),0.4)', border: '1px dashed rgba(var(--ink-rgb),0.2)', fontWeight: 400 }}>
        {chip ? chip.label : '날짜'}
      </button>
      <select value={st.assignee_id ?? ''} onChange={e => onAssignee(e.target.value || null)}
        aria-label="담당자"
        className="text-[12px] bg-transparent border-none outline-none cursor-pointer flex-shrink-0 w-[64px] text-right [&>option]:bg-[var(--select-option-bg)]"
        style={{ color: assignee ? 'rgba(var(--text-rgb),0.7)' : 'rgba(var(--text-rgb),0.3)' }}>
        <option value="">-</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      {menuPos && (
        <div className="fixed z-[100] flex items-center gap-1 p-1.5 rounded-lg shadow-lg"
          style={{ left: menuPos.left, top: menuPos.top, background: 'var(--dropdown-panel-bg)', border: '1px solid rgba(var(--ink-rgb),0.1)' }}
          onPointerDown={e => e.stopPropagation()}>
          {([['오늘', sched.today], ['내일', sched.tomorrow], ['금주', sched.friday]] as const).map(([label, d]) => (
            <button key={label} type="button" onClick={() => { onDate(d); setMenuPos(null) }}
              className="text-[11px] px-2 py-1 rounded hover:bg-[rgba(var(--ink-rgb),0.06)] text-[rgba(var(--text-rgb),0.8)]">{label}</button>
          ))}
          <label className="relative text-[11px] px-2 py-1 rounded hover:bg-[rgba(var(--ink-rgb),0.06)] cursor-pointer text-[rgba(var(--text-rgb),0.8)]">
            날짜 선택
            <input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              onChange={e => { if (e.target.value) { onDate(e.target.value); setMenuPos(null) } }} />
          </label>
          {st.target_date && (
            <button type="button" onClick={() => { onDate(null); setMenuPos(null) }}
              className="text-[11px] px-2 py-1 rounded hover:bg-[rgba(var(--ink-rgb),0.06)] text-[rgba(var(--text-rgb),0.45)]">지우기</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function AgendaTodoList({ tasks, members, sched, onAdd, onToggleDone, onDate, onAssignee, onRename, onDelete, onToHistory }: {
  tasks: AgendaSubTask[]
  members: Member[]
  sched: Sched
  onAdd: (title: string) => Promise<boolean>
  onToggleDone: (st: AgendaSubTask) => void
  onDate: (stId: string, date: string | null) => void
  onAssignee: (stId: string, id: string | null) => void
  onRename: (stId: string, title: string) => void
  onDelete: (stId: string) => void
  onToHistory: (stId: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  // 안 끝난 것 먼저(정렬 순서대로), 완료는 뒤로
  const ordered = [...tasks].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || a.sort_order - b.sort_order)
  const doneCount = tasks.filter(t => t.status === 'done').length

  async function submit() {
    const t = draft.trim()
    if (!t || adding) return
    setAdding(true)
    const ok = await onAdd(t)
    setAdding(false)
    if (ok) setDraft('')
  }

  return (
    <section aria-label="할 일" className="surface-card rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[rgba(var(--ink-rgb),0.06)]">
        <span className="text-[13px] font-semibold text-[rgba(var(--text-rgb),0.9)]">할 일</span>
        <span className="text-[11px] text-[rgba(var(--text-rgb),0.4)]">{doneCount}/{tasks.length}</span>
        <span className="text-[11px] text-[rgba(var(--text-rgb),0.35)]">· 날짜를 넣으면 홈 오늘·금주 업무에 나옵니다</span>
        <span className="flex-1" />
        <label className="flex items-center gap-2 w-full sm:w-[340px] border border-[rgba(var(--ink-rgb),0.1)] rounded-lg px-2.5 py-1.5">
          <span aria-hidden="true" className="text-[13px] text-[rgba(var(--text-rgb),0.4)]">＋</span>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit() }}
            placeholder="할 일 입력 후 Enter" aria-label="할 일 추가" disabled={adding}
            className="flex-1 min-w-0 text-[12px] bg-transparent outline-none placeholder:text-[rgba(var(--text-rgb),0.3)]" />
        </label>
      </div>
      {ordered.length === 0 ? (
        <p className="text-xs text-[rgba(var(--text-rgb),0.4)] text-center py-5">할 일이 없습니다</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-7 px-4 pt-1 pb-2">
          {ordered.map(st => (
            <TodoRow key={st.id} st={st} members={members} sched={sched}
              onToggleDone={() => onToggleDone(st)}
              onDate={d => onDate(st.id, d)}
              onAssignee={id => onAssignee(st.id, id)}
              onRename={t => onRename(st.id, t)}
              onDelete={() => onDelete(st.id)}
              onToHistory={() => onToHistory(st.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
