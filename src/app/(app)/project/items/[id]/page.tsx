'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAutosave } from '@/hooks/useAutosave'
import { useUserSetting } from '@/hooks/useUserSetting'
import type { AgendaItem, AgendaSubTask, Attachment, Member, LearningResource } from '@/types'
import TiptapEditor from '@/components/TiptapEditor'

const STATUS_CYCLE = ['active', 'hold', 'done'] as const
type Status = typeof STATUS_CYCLE[number]
const STATUS_LABEL: Record<Status, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<Status, string> = {
  active: 'bg-blue-50 text-blue-600 border-blue-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
  done:   'bg-gray-100 text-gray-400 border-gray-200',
}
const STATUS_DOT: Record<Status, string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }


interface SubTaskNote {
  id: string
  content: string
  created_at: string
  edited_at?: string | null
  title?: string | null
}

function NoteTitleInput({
  note, placeholder, onSave, onValueChange,
}: {
  note: SubTaskNote
  placeholder: string
  onSave: (title: string) => void
  // STEP B-3: 편집 중인 값을 상위(autosave)로 알리기 위한 선택적 콜백 —
  // 기존 blur/Enter/Escape/canonical save 동작은 전혀 바뀌지 않는다.
  onValueChange?: (val: string) => void
}) {
  const [val, setVal] = useState(note.title ?? '')
  useEffect(() => { setVal(note.title ?? '') }, [note.title])
  return (
    <input
      value={val}
      onChange={e => { setVal(e.target.value); onValueChange?.(e.target.value) }}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
        // Escape로 취소 시 autosave 쪽 추적값도 원래 note.title로 되돌려,
        // 취소된 입력이 draft에 남아있지 않도록 한다.
        if (e.key === 'Escape') { setVal(note.title ?? ''); onValueChange?.(note.title ?? ''); e.currentTarget.blur() }
      }}
      onBlur={() => { const t = val.trim(); if (t !== (note.title ?? '')) onSave(t) }}
      onClick={e => e.stopPropagation()}
      onFocus={e => e.stopPropagation()}
      placeholder={placeholder}
      className="text-xs font-medium bg-transparent border-b border-transparent hover:border-[rgba(255,255,255,0.2)] focus:border-[rgba(255,255,255,0.35)] focus:outline-none transition-colors cursor-text text-[rgba(226,232,240,0.8)] placeholder:text-[rgba(226,232,240,0.3)]"
      style={{ minWidth: '40px', maxWidth: '100%', fieldSizing: 'content' } as React.CSSProperties}
    />
  )
}

interface SubTaskWithNote extends AgendaSubTask {
  currentNote: SubTaskNote | null
  historyNotes: SubTaskNote[]
}

// ── 세부task 아코디언 (STEP B-2: 별도 컴포넌트로 추출) ────────────────────
// 목적은 오직 React Rules of Hooks를 지키면서 세부task별로 독립된
// useAutosave() 호출을 하기 위함 — JSX/동작 자체는 원래 subTasks.map() 안에
// 있던 것을 그대로 옮긴 것이며, canonical 저장 로직(updateSTTitle 등)은
// 부모의 기존 함수를 props로 그대로 전달받아 호출한다(본문 무수정).
function SubTaskAccordion({
  st, isOpen, isFocus, focusSTId, groupColor, members, sched, supabase,
  editingSTId, editingSTVal, setEditingSTId, setEditingSTVal, saveSTTitle,
  deletingST, setDeletingST,
  selectedNoteIds, setSelectedNoteIds, addingNoteFor, uploadingFor,
  toggleST, cycleSTStatus, updateSubTaskDate, updateSTAssignee, updateSTMidDate, updateSTDueDate, deleteSubTask,
  addNoteEntry, updateNoteTitle, handleNoteChange, handleUpload, deleteAttachment,
  stDateLabel, formatNoteDate, stAtts, setExpandFor, expandFor, onAccordionRef, onTagToggle,
}: {
  st: SubTaskWithNote
  isOpen: boolean
  isFocus: boolean
  focusSTId: string | null
  groupColor: string
  members: Member[]
  sched: { today: string; tomorrow: string; friday: string }
  supabase: ReturnType<typeof createClient>
  editingSTId: string | null
  editingSTVal: string
  setEditingSTId: (id: string | null) => void
  setEditingSTVal: (val: string) => void
  saveSTTitle: () => void
  deletingST: string | null
  setDeletingST: (id: string | null) => void
  selectedNoteIds: Record<string, string>
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Record<string, string>>>
  addingNoteFor: string | null
  uploadingFor: string | null
  toggleST: (stId: string) => void
  cycleSTStatus: (st: SubTaskWithNote) => void
  updateSubTaskDate: (stId: string, date: string | null) => void
  updateSTAssignee: (stId: string, assigneeId: string | null) => void
  updateSTMidDate: (stId: string, date: string | null) => void
  updateSTDueDate: (stId: string, date: string | null) => void
  deleteSubTask: (stId: string) => void
  addNoteEntry: (st: SubTaskWithNote) => void
  updateNoteTitle: (noteId: string, stId: string, title: string) => void
  handleNoteChange: (st: SubTaskWithNote, noteId: string, value: string) => void
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>, target: 'item' | string) => void
  deleteAttachment: (att: Attachment) => void
  stDateLabel: (date: string) => string
  formatNoteDate: (dateStr: string) => string
  stAtts: (stId: string) => Attachment[]
  setExpandFor: (v: string | null) => void
  expandFor: string | null
  onAccordionRef: (el: HTMLDivElement | null) => void
  onTagToggle: (stId: string, tags: string[]) => void
}) {
  const stColor = st.status === 'done' ? '#9CA3AF' : (st.status === 'hold' ? '#F59E0B' : groupColor)
  const isEditing = editingSTId === st.id

  const { value: customTags } = useUserSetting<string[]>(
    'learning_custom_tags',
    ['HR', '경제', '리더십', '평가보상', '데이터', '조직문화', '기획']
  )
  const [relatedResources, setRelatedResources] = useState<LearningResource[]>([])

  useEffect(() => {
    const tags = st.tags ?? []
    if (tags.length === 0) { setRelatedResources([]); return }
    supabase.from('learning_resources')
      .select('*')
      .overlaps('tags', tags)
      .order('updated_at', { ascending: false })
      .then(({ data }) => setRelatedResources((data ?? []) as LearningResource[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.tags])

  async function toggleTag(tag: string) {
    const current = st.tags ?? []
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    await supabase.from('agenda_sub_tasks').update({ tags: next }).eq('id', st.id)
    onTagToggle(st.id, next)
  }

  // note 목록/선택 — "크게 편집" 오버레이와 동일한 selectedNoteIds를 공유하므로
  // 항상 같은 note를 가리킨다. isOpen 여부와 무관하게 미리 계산해서(단순 배열
  // 연산이라 비용 없음) 아래 note autosave 훅에 무조건적으로 넘길 수 있게 한다.
  const allNotes = st.currentNote ? [st.currentNote, ...st.historyNotes] : st.historyNotes
  const selId = selectedNoteIds[st.id] ?? allNotes[0]?.id ?? null
  const selectedNote = allNotes.find(n => n.id === selId) ?? null

  // note title 편집 중인 실시간 값 — NoteTitleInput의 onValueChange로 전달받음(STEP B-3).
  // 선택된 note가 바뀌면 이전 note의 값이 새 note의 autosave로 잘못 넘어가지
  // 않도록 즉시 새 note.title로 리셋한다 — effect가 아니라 렌더 중 직접 비교/
  // 리셋하는 React 권장 패턴(prop 변경에 따른 state 조정)을 사용한다.
  const [noteTitleVal, setNoteTitleVal] = useState(selectedNote?.title ?? '')
  const prevNoteIdRef = useRef(selectedNote?.id)
  if (prevNoteIdRef.current !== selectedNote?.id) {
    prevNoteIdRef.current = selectedNote?.id
    setNoteTitleVal(selectedNote?.title ?? '')
  }

  // Autosave (세부task title만, STEP B-2) — canonical UPDATE(updateSTTitle)는
  // 그대로 유지, 이 훅은 autosave_drafts/content_versions에만 병행 기록한다.
  // entity_id는 항상 실존하는 agenda_sub_tasks.id이므로 qid/rebind 불필요.
  useAutosave({
    supabase,
    enabled: isEditing,
    entityType: 'agenda_sub_task',
    entityId: st.id,
    fieldKey: 'title',
    value: editingSTVal,
  })

  // Autosave (세부task note content/title, STEP B-3) — canonical UPDATE
  // (handleNoteChange/updateNoteTitle)는 그대로 유지. 같은 note를 "크게 편집"
  // 오버레이가 동시에 열어둔 경우(expandFor === st.id) 중복 write를 막기 위해
  // 이 인라인 쪽은 비활성화하고 오버레이 쪽만 활성화한다.
  const inlineNoteAutosaveEnabled = isOpen && !!selectedNote && expandFor !== st.id
  useAutosave({
    supabase,
    enabled: inlineNoteAutosaveEnabled,
    entityType: 'sub_task_note',
    entityId: selectedNote?.id ?? '',
    fieldKey: 'content',
    value: selectedNote?.content ?? '',
  })
  useAutosave({
    supabase,
    enabled: inlineNoteAutosaveEnabled,
    entityType: 'sub_task_note',
    entityId: selectedNote?.id ?? '',
    fieldKey: 'title',
    value: noteTitleVal,
  })

  return (
    <div
      ref={onAccordionRef}
      className="rounded-xl border overflow-hidden transition-all"
      style={{ borderColor: isFocus && isOpen ? stColor : 'rgba(255,255,255,0.08)', boxShadow: isFocus && isOpen ? `0 0 0 2px ${stColor}30` : 'none' }}>
      {/* 아코디언 헤더 — 외부 div onClick으로 토글, 내부 인터랙티브 요소는 stopPropagation */}
      <div
        onClick={() => toggleST(st.id)}
        className="relative flex items-center gap-2.5 px-4 py-4 select-none group/acc hover:bg-[rgba(255,255,255,0.06)] transition-colors cursor-pointer"
        style={{ background: isOpen ? `${stColor}18` : 'rgba(255,255,255,0.03)' }}>
        {/* ▶ 비주얼 (클릭은 외부 div가 처리) */}
        <span className="flex-shrink-0 p-1 -m-1" style={{ fontSize: 8, lineHeight: 1 }}>
          <span style={{ display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: '#8FA0B5' }}>▶</span>
        </span>
        {/* 상태 점 */}
        <button type="button"
          onClick={e => { e.stopPropagation(); cycleSTStatus(st) }}
          title={STATUS_LABEL[st.status as Status]}
          style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: stColor, border: 'none', cursor: 'pointer', padding: 0 }} />
        {/* 타이틀: 편집 중이면 input, 아니면 텍스트 */}
        {isEditing ? (
          <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              value={editingSTVal}
              onChange={e => setEditingSTVal(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveSTTitle()
                if (e.key === 'Escape') setEditingSTId(null)
              }}
              onBlur={saveSTTitle}
              className="text-sm font-semibold bg-transparent border-b-2 border-blue-400 focus:outline-none w-full"
              style={{ color: st.status === 'done' ? '#9CA3AF' : '#E2E8F0', textDecoration: st.status === 'done' ? 'line-through' : 'none' }}
            />
          </div>
        ) : (
          <span className="flex-1 min-w-0 text-sm font-semibold truncate"
            style={{ color: st.status === 'done' ? '#9CA3AF' : '#E2E8F0', textDecoration: st.status === 'done' ? 'line-through' : 'none' }}>
            {st.title}
          </span>
        )}
        {/* ✏ 제목 수정 */}
        {!isEditing && (
          <button type="button"
            onClick={e => { e.stopPropagation(); setEditingSTId(st.id); setEditingSTVal(st.title) }}
            className="opacity-0 group-hover/acc:opacity-60 hover:!opacity-100 transition-opacity text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.9)] text-[10px] px-0.5 flex-shrink-0"
            title="이름 수정">✏</button>
        )}
        {/* 날짜 뱃지 */}
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {st.target_date ? (
            <button
              onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, null) }}
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold border-none cursor-pointer flex-shrink-0"
              style={{
                background: st.target_date === sched.today ? '#FEE2E2' : st.target_date === sched.tomorrow ? '#FEF3C7' : '#EFF6FF',
                color:      st.target_date === sched.today ? '#DC2626' : st.target_date === sched.tomorrow ? '#92400E' : '#1D4ED8',
              }}>
              {stDateLabel(st.target_date)} ×
            </button>
          ) : (
            <div className="absolute right-28 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 pointer-events-none group-hover/acc:opacity-100 group-hover/acc:pointer-events-auto transition-opacity z-20 bg-[rgba(20,25,32,0.92)] rounded-md px-1 py-0.5 backdrop-blur-sm shadow-lg">
              <button onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, sched.today) }}    className="text-[9px] px-1.5 py-0.5 rounded bg-red-50   text-red-600   hover:bg-red-100   border border-red-100   font-medium">오늘</button>
              <button onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, sched.tomorrow) }} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 font-medium">내일</button>
              <button onClick={e => { e.stopPropagation(); updateSubTaskDate(st.id, sched.friday) }}   className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50  text-blue-600  hover:bg-blue-100  border border-blue-100  font-medium">금주</button>
              <label className="relative cursor-pointer text-gray-400 hover:text-gray-600 text-[10px] px-0.5" title="특정일 선택">
                📅<input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onChange={e => { e.stopPropagation(); if (e.target.value) updateSubTaskDate(st.id, e.target.value) }} />
              </label>
            </div>
          )}
        </div>
        {/* 삭제 */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover/acc:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {deletingST === st.id ? (
            <>
              <button onClick={e => { e.stopPropagation(); deleteSubTask(st.id) }} className="text-[10px] text-red-500 font-semibold px-1">삭제</button>
              <button onClick={e => { e.stopPropagation(); setDeletingST(null) }} className="text-[10px] text-[rgba(226,232,240,0.4)] px-1">취소</button>
            </>
          ) : (
            <button onClick={e => { e.stopPropagation(); setDeletingST(st.id) }} className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-red-400 transition-colors px-1">삭제</button>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ml-1 ${STATUS_CLS[st.status as Status]}`}>
          {STATUS_LABEL[st.status as Status]}
        </span>
        {/* 담당자 선택 — 헤더 row에서 바로 지정 */}
        <select
          value={st.assignee_id ?? ''}
          onChange={e => { e.stopPropagation(); updateSTAssignee(st.id, e.target.value || null) }}
          onClick={e => e.stopPropagation()}
          className="ml-1.5 text-xs bg-transparent border-none outline-none cursor-pointer flex-shrink-0 [&>option]:bg-[#1E2228]"
          style={{ color: st.assignee_id ? 'rgba(226,232,240,0.8)' : 'rgba(226,232,240,0.35)', colorScheme: 'dark' }}>
          <option value="">-</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {st.assignee_id && st.due_date && (
          <span className="text-[9px] text-emerald-400/60 flex-shrink-0">~{stDateLabel(st.due_date)}</span>
        )}
      </div>

      {/* 아코디언 본문 — 날짜 패널 (allNotes/selId/selectedNote는 컴포넌트
          상단에서 이미 계산됨 — note autosave 훅이 무조건적으로 참조하기 위함) */}
      {isOpen && (() => {
        return (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
            {/* ── 마일스톤 날짜 (담당자 지정 시) ── */}
            {st.assignee_id && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }} onClick={e => e.stopPropagation()}>
                <label className="flex items-center gap-1.5">
                  <span className="text-[9px] text-[rgba(226,232,240,0.35)] uppercase tracking-wider flex-shrink-0">중간보고</span>
                  <input type="date"
                    value={st.mid_date ?? ''}
                    onChange={e => updateSTMidDate(st.id, e.target.value || null)}
                    className="text-[11px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-md px-2 py-0.5 text-[rgba(226,232,240,0.75)] focus:outline-none [color-scheme:dark]"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-[9px] text-[rgba(226,232,240,0.35)] uppercase tracking-wider flex-shrink-0">완료일자</span>
                  <input type="date"
                    value={st.due_date ?? ''}
                    onChange={e => updateSTDueDate(st.id, e.target.value || null)}
                    className="text-[11px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-md px-2 py-0.5 text-[rgba(226,232,240,0.75)] focus:outline-none [color-scheme:dark]"
                  />
                </label>
              </div>
            )}
            {/* 날짜 목록 + 에디터 */}
            <div style={{ display: 'flex', minHeight: 160 }}>
              {/* 왼쪽: 날짜 목록 */}
              <div style={{ width: 80, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={e => { e.stopPropagation(); addNoteEntry(st) }}
                  disabled={addingNoteFor === st.id}
                  style={{ padding: '7px 8px', fontSize: 10, color: '#5DBD97', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', textAlign: 'center', fontWeight: 600, flexShrink: 0, opacity: addingNoteFor === st.id ? 0.4 : 1 }}>
                  {addingNoteFor === st.id ? '…' : '+ 추가'}
                </button>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {allNotes.map(note => {
                    const isSelected = note.id === selId
                    return (
                      <button key={note.id}
                        onClick={e => { e.stopPropagation(); setSelectedNoteIds(p => ({ ...p, [st.id]: note.id })) }}
                        style={{ width: '100%', padding: '7px 8px', fontSize: 11, textAlign: 'center', background: isSelected ? `${stColor}22` : 'transparent', color: isSelected ? stColor : 'rgba(226,232,240,0.45)', fontWeight: isSelected ? 700 : 400, cursor: 'pointer', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'block', lineHeight: 1.3 }}>
                        {formatNoteDate(note.created_at)}
                      </button>
                    )
                  })}
                  {allNotes.length === 0 && (
                    <div style={{ padding: '16px 8px', fontSize: 10, color: '#CBD5E1', textAlign: 'center' }}>기록 없음</div>
                  )}
                </div>
              </div>
              {/* 오른쪽: 선택된 노트 에디터 */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {selectedNote ? (
                  <>
                    <div className="flex items-center justify-between px-4 pt-2 pb-0.5 gap-2 flex-shrink-0">
                      <NoteTitleInput
                        note={selectedNote}
                        placeholder={`${formatNoteDate(selectedNote.created_at)} 기록`}
                        onSave={title => updateNoteTitle(selectedNote.id, st.id, title)}
                        onValueChange={setNoteTitleVal}
                      />
                      <button onClick={e => { e.stopPropagation(); setExpandFor(st.id) }}
                        className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,0.07)] transition-colors flex-shrink-0">
                        크게 편집
                      </button>
                    </div>
                    <TiptapEditor
                      dark
                      key={selectedNote.id}
                      value={selectedNote.content}
                      onChange={v => handleNoteChange(st, selectedNote.id, v)}
                      minHeight={100}
                      autoFocus={isFocus && focusSTId === st.id && selectedNote.id === allNotes[0]?.id}
                      className="px-4 py-1"
                    />
                  </>
                ) : (
                  <div style={{ padding: '24px', color: '#8FA0B5', fontSize: 12, textAlign: 'center' }}>+ 추가를 눌러 첫 기록을 남기세요</div>
                )}
              </div>
            </div>
            {/* 서브태스크 첨부파일 */}
            <div className="border-t border-[rgba(255,255,255,0.07)] px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: stColor }}>
                  📎 {st.title} · 첨부파일
                </span>
                <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploadingFor === st.id ? 'text-[rgba(226,232,240,0.3)]' : 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] text-[rgba(226,232,240,0.5)] hover:border-[rgba(255,255,255,0.22)] hover:text-[rgba(226,232,240,0.8)]'}`}>
                  {uploadingFor === st.id ? '업로드 중…' : '파일 추가'}
                  <input type="file" multiple className="hidden" onChange={e => handleUpload(e, st.id)} disabled={uploadingFor === st.id} />
                </label>
              </div>
              {stAtts(st.id).length === 0 ? (
                <p className="text-[10px] text-[rgba(226,232,240,0.35)]">이 하위 태스크에만 연결된 파일을 첨부하세요</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {stAtts(st.id).map(att => (
                    <div key={att.id} className="flex items-center gap-1 text-[11px] bg-[rgba(255,255,255,0.05)] border rounded-lg px-2.5 py-1 group/att"
                      style={{ borderColor: `${stColor}40` }}>
                      <a href={att.url} target="_blank" rel="noopener noreferrer"
                        className="hover:underline transition-colors truncate max-w-[180px]"
                        style={{ color: stColor }}>
                        📄 {att.name}
                      </a>
                      <button onClick={() => deleteAttachment(att)}
                        className="text-[rgba(226,232,240,0.3)] hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 관련 학습자료 */}
            <div className="border-t border-[rgba(255,255,255,0.07)] px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: stColor }}>
                  📚 관련 학습자료
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {customTags.map(tag => {
                  const selected = (st.tags ?? []).includes(tag)
                  return (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      className="text-[10px] px-2 py-0.5 rounded-full border transition-all"
                      style={selected
                        ? { background: '#4C7FE0', color: 'rgba(220,230,252,0.9)', borderColor: 'rgba(76,127,224,0.5)' }
                        : { background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.4)', borderColor: 'rgba(255,255,255,0.09)' }}>
                      {tag}
                    </button>
                  )
                })}
              </div>
              {(st.tags ?? []).length > 0 && (
                relatedResources.length === 0
                  ? <p className="text-[10px] text-[rgba(226,232,240,0.3)]">매칭되는 학습자료 없음</p>
                  : <div className="flex flex-col gap-1">
                      {relatedResources.map(r => (
                        <a key={r.id} href={`/learning/${r.id}`}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors group/lr">
                          <span className="text-[10px] text-[rgba(226,232,240,0.7)] truncate flex-1 group-hover/lr:text-[rgba(226,232,240,0.95)]">{r.title}</span>
                          {r.source && <span className="text-[9px] text-[rgba(226,232,240,0.3)] truncate max-w-[100px]">{r.source}</span>}
                          <span className="text-[rgba(226,232,240,0.2)] group-hover/lr:text-[rgba(226,232,240,0.4)] text-[10px] flex-shrink-0">→</span>
                        </a>
                      ))}
                    </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function AgendaItemDetailPage() {
  const { id }         = useParams<{ id: string }>()
  const router         = useRouter()
  const searchParams   = useSearchParams()
  const focusSTId      = searchParams.get('focus')
  const supabase       = createClient()

  const [item,      setItem]      = useState<AgendaItem | null>(null)
  const [group,     setGroup]     = useState<{ name: string; color: string } | null>(null)
  const [subTasks,  setSubTasks]  = useState<SubTaskWithNote[]>([])
  const [members,   setMembers]   = useState<Member[]>([])
  const [loading,   setLoading]   = useState(true)

  // 설명 박스
  const [description, setDescription] = useState('')
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 제목 편집
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle,    setEditTitle]    = useState('')

  // 아코디언 열림 상태
  const [openST, setOpenST] = useState<Set<string>>(new Set())

  // 하위태스크 제목 인라인 편집
  const [editingSTId,  setEditingSTId]  = useState<string | null>(null)
  const [editingSTVal, setEditingSTVal] = useState('')
  const accordionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 하위태스크 추가
  const [addingSubTask, setAddingSubTask] = useState(false)
  const [newSTTitle,    setNewSTTitle]    = useState('')
  const [deletingST,    setDeletingST]    = useState<string | null>(null)
  const [expandFor,     setExpandFor]     = useState<string | null>(null)

  // 날짜 패널 — 선택된 노트 id (stId → noteId). STEP B-3의 "크게 편집" note
  // autosave가 early return 이전에 이 값을 참조해야 해서 선언을 앞으로 옮김
  // (원래 위치·동작은 그대로, 선언 순서만 이동).
  const [selectedNoteIds, setSelectedNoteIds] = useState<Record<string, string>>({})
  const [addingNoteFor, setAddingNoteFor] = useState<string | null>(null)

  // 첨부파일
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingFor, setUploadingFor] = useState<string | null>(null) // 'item' | stId
  const [uploadError,  setUploadError]  = useState<string>('')

  // STEP D Group 2: canonical write 실패 감지 + 표시용 단일 공통 에러 상태.
  // 이 컴포넌트에 정의된 모든 canonical write 핸들러(제목/설명/상태/날짜/담당자/
  // 세부task/note/생성/삭제)가 공유해서 쓴다 — SubTaskAccordion엔 상태를 두지
  // 않고 handler를 그대로 prop으로 전달받는 기존 구조를 그대로 활용.
  const [saveError, setSaveError] = useState('')
  const SAVE_ERROR_MSG   = '저장 실패 — 화면에는 반영됐지만 서버에 저장되지 않았을 수 있습니다. 새로고침 후 다시 확인해주세요.'
  const CREATE_ERROR_MSG = '생성 실패 — 잠시 후 다시 시도해주세요.'
  const DELETE_ERROR_MSG = '삭제 실패 — 목록에서 사라졌지만 실제로는 삭제되지 않았을 수 있습니다. 새로고침 후 확인해주세요.'

  // 노트 저장 타이머
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Autosave (안건 자체 title/description만, STEP B-1) ───────────────────
  // canonical UPDATE(saveTitle/handleDescription)는 그대로 유지 — 이 훅은
  // autosave_drafts/content_versions에만 병행 기록한다(agenda_items에는 쓰지 않음).
  // entity_id는 항상 실존하는 agenda_items.id(URL 파라미터)이므로 qid/rebind 불필요.
  useAutosave({
    supabase,
    enabled: !!id && editingTitle,
    entityType: 'project_item',
    entityId: id,
    fieldKey: 'title',
    value: editTitle,
  })
  useAutosave({
    supabase,
    enabled: !!id,
    entityType: 'project_item',
    entityId: id,
    fieldKey: 'description',
    value: description,
  })

  // ── "크게 편집" 오버레이의 note autosave (STEP B-3) ──────────────────────
  // expandST/selectedNote는 원래 렌더링 직전(early return 이후)에 계산되던
  // 값인데, 훅은 early return보다 먼저 호출돼야 하므로 여기로 끌어올렸다
  // (subTasks/expandFor는 이미 위에서 선언된 state라 계산 자체는 가능).
  // 아래 두 useAutosave()는 오버레이가 열려서 이 note를 보여줄 때만
  // enabled=true — 같은 note를 인라인 아코디언도 동시에 열어둔 경우
  // SubTaskAccordion 쪽 note autosave는 expandFor===st.id일 때 비활성화되어
  // 중복 write가 발생하지 않는다.
  const overlayST = (expandFor && expandFor !== 'description')
    ? (subTasks.find(s => s.id === expandFor) ?? null) : null
  const overlayAllNotes = overlayST ? (overlayST.currentNote ? [overlayST.currentNote, ...overlayST.historyNotes] : overlayST.historyNotes) : []
  const overlaySelId = overlayST ? (selectedNoteIds[overlayST.id] ?? overlayAllNotes[0]?.id ?? null) : null
  const overlaySelectedNote = overlayAllNotes.find(n => n.id === overlaySelId) ?? null

  const [overlayNoteTitleVal, setOverlayNoteTitleVal] = useState(overlaySelectedNote?.title ?? '')
  const prevOverlayNoteIdRef = useRef(overlaySelectedNote?.id)
  if (prevOverlayNoteIdRef.current !== overlaySelectedNote?.id) {
    prevOverlayNoteIdRef.current = overlaySelectedNote?.id
    setOverlayNoteTitleVal(overlaySelectedNote?.title ?? '')
  }

  useAutosave({
    supabase,
    enabled: !!overlaySelectedNote,
    entityType: 'sub_task_note',
    entityId: overlaySelectedNote?.id ?? '',
    fieldKey: 'content',
    value: overlaySelectedNote?.content ?? '',
  })
  useAutosave({
    supabase,
    enabled: !!overlaySelectedNote,
    entityType: 'sub_task_note',
    entityId: overlaySelectedNote?.id ?? '',
    fieldKey: 'title',
    value: overlayNoteTitleVal,
  })

  // ── 날짜 헬퍼 ──────────────────────────────────────────────────
  const sched = (() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const d = new Date(), tom = new Date(d), fri = new Date(d)
    tom.setDate(d.getDate() + 1)
    fri.setDate(d.getDate() + (5 - d.getDay() + 7) % 7)
    return { today: fmt(d), tomorrow: fmt(tom), friday: fmt(fri) }
  })()
  function stDateLabel(date: string) {
    if (date === sched.today) return '오늘'
    if (date === sched.tomorrow) return '내일'
    const d = new Date(date + 'T00:00:00')
    return `${d.getMonth()+1}/${d.getDate()}`
  }

  // ── 데이터 로드 ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data: iData } = await supabase
      .from('agenda_items')
      .select('*, agenda_groups(name, color)')
      .eq('id', id)
      .single()
    if (!iData) { setLoading(false); return }

    const { agenda_groups, ...rest } = iData as AgendaItem & { agenda_groups: { name: string; color: string } }
    setItem(rest)
    setGroup(agenda_groups)
    setDescription(rest.description ?? '')

    const { data: stData } = await supabase
      .from('agenda_sub_tasks')
      .select('*')
      .eq('agenda_item_id', id)
      .order('sort_order')

    const fetchedSTs = (stData ?? []) as AgendaSubTask[]

    // 각 서브태스크의 최신 노트 불러오기
    if (fetchedSTs.length > 0) {
      const { data: noteData } = await supabase
        .from('sub_task_notes')
        .select('*')
        .in('sub_task_id', fetchedSTs.map(s => s.id))
        .order('created_at', { ascending: false })

      const allNotesMap: Record<string, SubTaskNote[]> = {}
      ;(noteData ?? []).forEach((n: SubTaskNote & { sub_task_id: string }) => {
        if (!allNotesMap[n.sub_task_id]) allNotesMap[n.sub_task_id] = []
        allNotesMap[n.sub_task_id].push(n)
      })

      setSubTasks(fetchedSTs.map(st => {
        const stNotes = allNotesMap[st.id] ?? []
        return { ...st, currentNote: stNotes[0] ?? null, historyNotes: stNotes.slice(1) }
      }))
    } else {
      setSubTasks([])
    }

    // 첨부파일 로드 — 업무(agenda_item_id=id) + 서브태스크별(sub_task_id in stIds)
    const stIds = fetchedSTs.map(s => s.id)
    const attFilter = stIds.length > 0
      ? `agenda_item_id.eq.${id},sub_task_id.in.(${stIds.join(',')})`
      : `agenda_item_id.eq.${id}`
    const { data: attData } = await supabase
      .from('attachments')
      .select('*')
      .or(attFilter)
      .order('created_at', { ascending: false })
    setAttachments((attData ?? []) as Attachment[])

    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  // fetchMembers는 내부에서 별도 createClient를 쓰므로 세션이 다를 수 있음
  // → 이 컴포넌트의 supabase 인스턴스로 직접 쿼리
  useEffect(() => {
    supabase.from('members').select('id, name').is('archived_at', null).order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // focus 파라미터 처리 — 해당 아코디언 열고 스크롤
  useEffect(() => {
    if (!focusSTId || subTasks.length === 0) return
    setOpenST(prev => { const s = new Set(prev); s.add(focusSTId); return s })
    setTimeout(() => {
      const el = accordionRefs.current[focusSTId]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [focusSTId, subTasks.length])

  // 크게 편집 ESC 닫기
  useEffect(() => {
    if (!expandFor) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setExpandFor(null) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [expandFor])

  // ── description 자동 저장 ────────────────────────────────────────
  function handleDescription(value: string) {
    setDescription(value)
    if (descTimer.current) clearTimeout(descTimer.current)
    descTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('agenda_items').update({ description: value }).eq('id', id)
      setSaveError(error ? SAVE_ERROR_MSG : '')
    }, 600)
  }

  // ── 제목 저장 ─────────────────────────────────────────────────────
  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !item) { setEditingTitle(false); return }
    const { error } = await supabase.from('agenda_items').update({ title: t }).eq('id', id)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setItem(p => p ? { ...p, title: t } : p)
    setEditingTitle(false)
  }

  // ── 상태 순환 ────────────────────────────────────────────────────
  async function cycleStatus() {
    if (!item) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status as Status) + 1) % STATUS_CYCLE.length]
    const { error } = await supabase.from('agenda_items').update({ status: next }).eq('id', id)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setItem(p => p ? { ...p, status: next } : p)
  }

  async function cycleSTStatus(st: SubTaskWithNote) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(st.status as Status) + 1) % STATUS_CYCLE.length]
    const { error } = await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', st.id)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, status: next } : s))
  }

  // ── 아코디언 토글 ────────────────────────────────────────────────
  function toggleST(stId: string) {
    setOpenST(prev => {
      const s = new Set(prev)
      s.has(stId) ? s.delete(stId) : s.add(stId)
      return s
    })
  }

  function saveSTTitle() {
    if (!editingSTId) return
    const t = editingSTVal.trim()
    if (t) updateSTTitle(editingSTId, t)
    setEditingSTId(null)
  }

  // ── 날짜 포맷 ──────────────────────────────────────────────────
  function formatNoteDate(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (noteDay.getTime() === today.getTime()) return '오늘'
    if (noteDay.getTime() === yesterday.getTime()) return '어제'
    return `${d.getMonth()+1}/${d.getDate()}`
  }

  function hasNoteContent(html: string) {
    return html.replace(/<[^>]*>/g, '').trim().length > 0
  }

  // ── 노트 내용 저장 (any note by id) ────────────────────────────
  function handleNoteChange(st: SubTaskWithNote, noteId: string, value: string) {
    setSubTasks(p => p.map(s => {
      if (s.id !== st.id) return s
      return {
        ...s,
        currentNote: s.currentNote?.id === noteId ? { ...s.currentNote, content: value } : s.currentNote,
        historyNotes: s.historyNotes.map(n => n.id === noteId ? { ...n, content: value } : n),
      }
    }))
    clearTimeout(noteTimers.current[noteId])
    noteTimers.current[noteId] = setTimeout(async () => {
      const { error } = await supabase.from('sub_task_notes').update({ content: value, edited_at: new Date().toISOString() }).eq('id', noteId)
      setSaveError(error ? SAVE_ERROR_MSG : '')
    }, 600)
  }

  // ── 새 기록 추가 ────────────────────────────────────────────────
  async function addNoteEntry(st: SubTaskWithNote) {
    setAddingNoteFor(st.id)
    const { data, error } = await supabase.from('sub_task_notes')
      .insert({ sub_task_id: st.id, title: null, content: '' })
      .select('id, content, created_at, edited_at').single()
    if (error) {
      setSaveError(CREATE_ERROR_MSG)
      setAddingNoteFor(null)
      return
    }
    setSaveError('')
    if (data) {
      const newNote = data as SubTaskNote
      setSelectedNoteIds(p => ({ ...p, [st.id]: newNote.id }))
      setSubTasks(p => p.map(s => {
        if (s.id !== st.id) return s
        return {
          ...s,
          currentNote: newNote,
          historyNotes: s.currentNote ? [s.currentNote, ...s.historyNotes] : s.historyNotes,
        }
      }))
    }
    setAddingNoteFor(null)
  }

  // ── 기록 제목 저장 ──────────────────────────────────────────────
  async function updateNoteTitle(noteId: string, stId: string, title: string) {
    const { error } = await supabase.from('sub_task_notes').update({ title: title || null }).eq('id', noteId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => {
      if (s.id !== stId) return s
      return {
        ...s,
        currentNote: s.currentNote?.id === noteId ? { ...s.currentNote, title: title || null } : s.currentNote,
        historyNotes: s.historyNotes.map(n => n.id === noteId ? { ...n, title: title || null } : n),
      }
    }))
  }


  // ── 첨부파일 업로드 ─────────────────────────────────────────────
  // target: 'item' → 업무 전체, stId → 특정 서브태스크
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'item' | string) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadingFor(target)
    setUploadError('')
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = target === 'item'
          ? `agenda-items/${id}/${Date.now()}_${safeName}`
          : `agenda-items/${id}/subtasks/${target}/${Date.now()}_${safeName}`
        const { error: storageErr } = await supabase.storage.from('attachments').upload(path, file)
        if (storageErr) { setUploadError(`스토리지 오류: ${storageErr.message}`); continue }
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertRow: any = target === 'item'
          ? { task_id: null, agenda_item_id: id,   sub_task_id: null,   meeting_id: null, name: file.name, type: '파일', url: urlData.publicUrl }
          : { task_id: null, agenda_item_id: null, sub_task_id: target, meeting_id: null, name: file.name, type: '파일', url: urlData.publicUrl }
        const { data, error: dbErr } = await supabase.from('attachments').insert(insertRow).select().single()
        if (dbErr) { setUploadError(`DB 오류: ${dbErr.message}`); continue }
        if (data) setAttachments(prev => [data as Attachment, ...prev])
      }
    } finally {
      setUploadingFor(null)
      e.target.value = ''
    }
  }

  async function deleteAttachment(att: Attachment) {
    let hadError = false
    const path = att.url.split('/object/public/attachments/')[1]
    if (path) {
      const { error: storageErr } = await supabase.storage.from('attachments').remove([path])
      if (storageErr) hadError = true
    }
    const { error: dbErr } = await supabase.from('attachments').delete().eq('id', att.id)
    if (dbErr) hadError = true
    setSaveError(hadError ? DELETE_ERROR_MSG : '')
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  // 분류 헬퍼
  const itemAtts  = attachments.filter(a => a.agenda_item_id === id && !a.sub_task_id)
  const stAtts    = (stId: string) => attachments.filter(a => a.sub_task_id === stId)

  // ── 하위태스크 추가 ──────────────────────────────────────────────
  async function addSubTask() {
    const title = newSTTitle.trim()
    if (!title) { setAddingSubTask(false); return }
    const { data, error } = await supabase.from('agenda_sub_tasks')
      .insert({ agenda_item_id: id, title, status: 'active', sort_order: subTasks.length })
      .select().single()
    if (error) {
      // 실패 시 입력값/폼을 그대로 유지 — 재시도 가능하게 함(Group 1 Meeting Notes와 동일 원칙)
      setSaveError(CREATE_ERROR_MSG)
      return
    }
    setSaveError('')
    if (data) {
      const newST: SubTaskWithNote = { ...(data as AgendaSubTask), currentNote: null, historyNotes: [] }
      setSubTasks(p => [...p, newST])
      setOpenST(prev => { const s = new Set(prev); s.add(newST.id); return s })
    }
    setNewSTTitle(''); setAddingSubTask(false)
  }

  // ── 하위태스크 제목 수정 ─────────────────────────────────────────
  async function updateSTTitle(stId: string, title: string) {
    const { error } = await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s))
  }

  // ── 하위태스크 삭제 ──────────────────────────────────────────────
  async function deleteSubTask(stId: string) {
    const { error } = await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSaveError(error ? DELETE_ERROR_MSG : '')
    setSubTasks(p => p.filter(s => s.id !== stId))
    setDeletingST(null)
  }

  async function updateSubTaskDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('agenda_sub_tasks') as any).update({ target_date: date }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, target_date: date ?? undefined } : s))
  }

  async function updateSTAssignee(stId: string, assigneeId: string | null) {
    const { error } = await supabase.from('agenda_sub_tasks').update({ assignee_id: assigneeId }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, assignee_id: assigneeId } : s))
  }

  async function updateSTMidDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('agenda_sub_tasks') as any).update({ mid_date: date || null }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, mid_date: date || null } : s))
  }

  async function updateSTDueDate(stId: string, date: string | null) {
    const { error } = await supabase.from('agenda_sub_tasks').update({ due_date: date || null }).eq('id', stId)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, due_date: date || null } : s))
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  if (!item)   return <div className="flex items-center justify-center h-40 text-sm text-gray-400">안건을 찾을 수 없습니다.</div>

  const groupColor = group?.color ?? '#3B82F6'
  const doneCount  = subTasks.filter(s => s.status === 'done').length
  const expandST = (expandFor && expandFor !== 'description')
    ? (subTasks.find(s => s.id === expandFor) ?? null) : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto px-4 md:px-6 py-6 pb-16 flex flex-col gap-6">

        {/* ── 브레드크럼 ── */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <button onClick={() => router.back()} className="hover:text-gray-700 transition-colors flex items-center gap-1">
            <span>←</span> <span>돌아가기</span>
          </button>
          {group && (
            <>
              <span>·</span>
              <span style={{ color: groupColor, fontWeight: 600 }}>{group.name}</span>
            </>
          )}
          <span>·</span>
          <span className="text-gray-500 truncate max-w-[200px]">{item.title}</span>
        </div>

        {/* 저장 실패 안내 — canonical write 실패 시 공통 표시(STEP D Group 2) */}
        {saveError && (
          <div className="px-4 py-2.5 rounded-xl text-xs flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FC8181' }}>
            <span>⚠</span>
            <span className="flex-1">{saveError}</span>
            <button onClick={() => setSaveError('')} className="text-[10px] opacity-70 hover:opacity-100 flex-shrink-0">닫기</button>
          </div>
        )}

        {/* ── 제목 + 상태 ── */}
        <div className="flex items-start gap-3">
          <button onClick={cycleStatus} title={STATUS_LABEL[item.status as Status]}
            style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_DOT[item.status as Status], border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 8 }} />
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input autoFocus value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                onBlur={saveTitle}
                className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-400 focus:outline-none bg-transparent pb-0.5" />
            ) : (
              <h1
                onClick={() => { setEditingTitle(true); setEditTitle(item.title) }}
                className="text-2xl font-bold cursor-text hover:text-[rgba(226,232,240,0.7)] transition-colors leading-tight"
                style={{ color: item.status === 'done' ? '#9CA3AF' : '#E2E8F0', textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                {item.title}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button onClick={cycleStatus}
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[item.status as Status]}`}>
                {STATUS_LABEL[item.status as Status]}
              </button>
              {subTasks.length > 0 && (
                <span className="text-xs text-[rgba(226,232,240,0.5)] bg-white/[0.06] border border-white/[0.09] px-2.5 py-1 rounded-full">
                  하위태스크 {doneCount}/{subTasks.length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 전반적인 메모 박스 ── */}
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.4)] uppercase tracking-wider">업무 개요 · 메모</span>
            <button onClick={() => setExpandFor('description')}
              className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.65)] px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors">
              크게 편집
            </button>
          </div>
          <TiptapEditor
            dark
            value={description}
            onChange={handleDescription}
            minHeight={140}
            className="px-5 py-4"
          />
          {/* 업무 첨부파일 */}
          <div className="border-t border-[rgba(255,255,255,0.06)] px-5 py-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold text-[rgba(226,232,240,0.35)] uppercase tracking-wider">업무 첨부파일</span>
              <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploadingFor === 'item' ? 'bg-[rgba(255,255,255,0.04)] text-[rgba(226,232,240,0.25)]' : 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-[rgba(226,232,240,0.5)] hover:border-[rgba(255,255,255,0.2)] hover:text-[rgba(226,232,240,0.8)]'}`}>
                📎 {uploadingFor === 'item' ? '업로드 중…' : '파일 추가'}
                <input type="file" multiple className="hidden" onChange={e => handleUpload(e, 'item')} disabled={uploadingFor === 'item'} />
              </label>
              {uploadError && <span className="text-[10px] text-red-400 ml-1">{uploadError}</span>}
            </div>
            {itemAtts.length === 0 ? (
              <p className="text-[10px] text-[rgba(226,232,240,0.3)]">이 업무 전체에 해당하는 파일을 첨부하세요</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {itemAtts.map(att => (
                  <div key={att.id} className="flex items-center gap-1 text-[11px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-lg px-2.5 py-1 group/att">
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="text-[rgba(226,232,240,0.65)] hover:text-[rgba(226,232,240,0.9)] hover:underline transition-colors truncate max-w-[180px]">
                      📄 {att.name}
                    </a>
                    <button onClick={() => deleteAttachment(att)}
                      className="text-[rgba(226,232,240,0.2)] hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 하위태스크 아코디언 ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">하위 태스크 · 아카이빙</span>
            <span className="text-[10px] text-gray-400">토글 이름 = 프로젝트탭 하위태스크와 연동</span>
          </div>

          {subTasks.map(st => (
            <SubTaskAccordion
              key={st.id}
              st={st}
              isOpen={openST.has(st.id)}
              isFocus={focusSTId === st.id}
              focusSTId={focusSTId}
              groupColor={groupColor}
              members={members}
              sched={sched}
              supabase={supabase}
              editingSTId={editingSTId}
              editingSTVal={editingSTVal}
              setEditingSTId={setEditingSTId}
              setEditingSTVal={setEditingSTVal}
              saveSTTitle={saveSTTitle}
              deletingST={deletingST}
              setDeletingST={setDeletingST}
              selectedNoteIds={selectedNoteIds}
              setSelectedNoteIds={setSelectedNoteIds}
              addingNoteFor={addingNoteFor}
              uploadingFor={uploadingFor}
              toggleST={toggleST}
              cycleSTStatus={cycleSTStatus}
              updateSubTaskDate={updateSubTaskDate}
              updateSTAssignee={updateSTAssignee}
              updateSTMidDate={updateSTMidDate}
              updateSTDueDate={updateSTDueDate}
              deleteSubTask={deleteSubTask}
              addNoteEntry={addNoteEntry}
              updateNoteTitle={updateNoteTitle}
              handleNoteChange={handleNoteChange}
              handleUpload={handleUpload}
              deleteAttachment={deleteAttachment}
              stDateLabel={stDateLabel}
              formatNoteDate={formatNoteDate}
              stAtts={stAtts}
              setExpandFor={setExpandFor}
              expandFor={expandFor}
              onAccordionRef={el => { accordionRefs.current[st.id] = el }}
              onTagToggle={(stId, tags) => setSubTasks(p => p.map(s => s.id === stId ? { ...s, tags } : s))}
            />
          ))}

          {/* 하위태스크 추가 */}
          <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] overflow-hidden">
            {addingSubTask ? (
              <div className="flex items-center gap-2 px-4 py-3">
                <input autoFocus value={newSTTitle}
                  onChange={e => setNewSTTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(); if (e.key === 'Escape') { setAddingSubTask(false); setNewSTTitle('') } }}
                  placeholder="하위 태스크 이름 입력 후 Enter (프로젝트탭과 자동 연동)"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                <button onClick={addSubTask} className="text-xs bg-[rgba(76,127,224,0.1)] text-[#4C7FE0] border border-[rgba(76,127,224,0.25)] px-3 py-1.5 rounded-lg">추가</button>
                <button onClick={() => { setAddingSubTask(false); setNewSTTitle('') }} className="text-xs text-gray-400 px-2">취소</button>
              </div>
            ) : (
              <button onClick={() => setAddingSubTask(true)}
                className="w-full flex items-center gap-1.5 px-4 py-3 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                <span style={{ fontSize: 13 }}>＋</span>
                <span>하위 태스크 추가 (프로젝트탭과 쌍방 연동)</span>
              </button>
            )}
          </div>

          {subTasks.length === 0 && !addingSubTask && (
            <p className="text-xs text-gray-400 text-center py-2">
              하위 태스크를 추가하면 프로젝트 목록에서도 동일하게 표시됩니다.
            </p>
          )}
        </div>
      </div>

      {/* 크게 편집 오버레이 */}
      {expandFor && (() => {
        if (expandFor === 'description') {
          return (
            <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0F1319' }}>
              <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: `4px solid ${groupColor}` }}>
                <div>
                  <div className="text-[10px] text-[rgba(226,232,240,0.4)] font-semibold uppercase tracking-wider mb-0.5">업무 개요 · 메모</div>
                  <div className="text-sm font-semibold text-[rgba(226,232,240,0.9)]">{item?.title ?? ''}</div>
                </div>
                <button onClick={() => setExpandFor(null)}
                  className="flex items-center gap-1.5 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors border border-[rgba(255,255,255,0.08)]">
                  <span>ESC</span><span> 닫기</span>
                </button>
              </div>
              {saveError && (
                <div className="mx-8 mt-3 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FC8181' }}>
                  <span>⚠</span>
                  <span className="flex-1">{saveError}</span>
                  <button onClick={() => setSaveError('')} className="text-[10px] opacity-70 hover:opacity-100 flex-shrink-0">닫기</button>
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-auto">
                <TiptapEditor dark value={description} onChange={handleDescription} autoFocus minHeight={300} className="px-8 py-4" />
              </div>
            </div>
          )
        }
        if (!expandST) return null
        const allNotes = expandST.currentNote ? [expandST.currentNote, ...expandST.historyNotes] : expandST.historyNotes
        const selId = selectedNoteIds[expandST.id] ?? allNotes[0]?.id ?? null
        const selectedNote = allNotes.find(n => n.id === selId) ?? null
        const expandStColor = expandST.status === 'done' ? '#9CA3AF' : (expandST.status === 'hold' ? '#F59E0B' : groupColor)
        return (
          <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0F1319' }}>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: `4px solid ${expandStColor}` }}>
              <div>
                <div className="text-[10px] text-[rgba(226,232,240,0.4)] font-semibold uppercase tracking-wider mb-0.5">세부task · 노트</div>
                <div className="text-sm font-semibold text-[rgba(226,232,240,0.9)]">{expandST.title}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => addNoteEntry(expandST)} disabled={addingNoteFor === expandST.id}
                  className="text-xs text-[#5DBD97] hover:text-[#4aab84] disabled:text-[rgba(226,232,240,0.25)] disabled:cursor-not-allowed border border-[#5DBD97]/30 disabled:border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1.5 transition-colors">
                  {addingNoteFor === expandST.id ? '추가 중…' : '+ 새 기록'}
                </button>
                <button onClick={() => setExpandFor(null)}
                  className="flex items-center gap-1.5 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors border border-[rgba(255,255,255,0.08)]">
                  <span>ESC</span><span> 닫기</span>
                </button>
              </div>
            </div>
            {saveError && (
              <div className="mx-5 mt-3 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FC8181' }}>
                <span>⚠</span>
                <span className="flex-1">{saveError}</span>
                <button onClick={() => setSaveError('')} className="text-[10px] opacity-70 hover:opacity-100 flex-shrink-0">닫기</button>
              </div>
            )}
            <div className="flex-1 min-h-0 flex">
              {/* 왼쪽: 날짜 목록 */}
              <div style={{ width: 100, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {allNotes.map(note => {
                  const isSelected = note.id === selId
                  return (
                    <button key={note.id}
                      onClick={() => setSelectedNoteIds(p => ({ ...p, [expandST.id]: note.id }))}
                      style={{ padding: '10px 12px', fontSize: 12, textAlign: 'center', background: isSelected ? `${expandStColor}22` : 'transparent', color: isSelected ? expandStColor : 'rgba(226,232,240,0.4)', fontWeight: isSelected ? 700 : 400, cursor: 'pointer', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'block', width: '100%', lineHeight: 1.3 }}>
                      {formatNoteDate(note.created_at)}
                    </button>
                  )
                })}
              </div>
              {/* 오른쪽: 에디터 */}
              <div className="flex-1 min-w-0 overflow-auto">
                {selectedNote ? (
                  <>
                    <div className="px-8 pt-4 pb-0 flex items-center gap-2">
                      <NoteTitleInput note={selectedNote} placeholder={`${formatNoteDate(selectedNote.created_at)} 기록`} onSave={title => updateNoteTitle(selectedNote.id, expandST.id, title)} onValueChange={setOverlayNoteTitleVal} />
                    </div>
                    <TiptapEditor
                      dark
                      key={selectedNote.id}
                      value={selectedNote.content}
                      onChange={v => handleNoteChange(expandST, selectedNote.id, v)}
                      autoFocus
                      minHeight={300}
                      className="px-8 py-4"
                    />
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-[rgba(226,232,240,0.3)]">+ 새 기록을 추가하세요</div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
