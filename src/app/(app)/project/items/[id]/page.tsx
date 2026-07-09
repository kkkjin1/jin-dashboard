'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaItem, AgendaSubTask, Attachment } from '@/types'

const STATUS_CYCLE = ['active', 'hold', 'done'] as const
type Status = typeof STATUS_CYCLE[number]
const STATUS_LABEL: Record<Status, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<Status, string> = {
  active: 'bg-blue-50 text-blue-600 border-blue-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
  done:   'bg-gray-100 text-gray-400 border-gray-200',
}
const STATUS_DOT: Record<Status, string> = { active: '#3B82F6', hold: '#F59E0B', done: '#10B981' }

interface SubTaskWithNote extends AgendaSubTask {
  noteId?: string
  noteContent: string
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
  const [loading,   setLoading]   = useState(true)

  // 설명 박스
  const [description, setDescription] = useState('')
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 제목 편집
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle,    setEditTitle]    = useState('')

  // 아코디언 열림 상태
  const [openST, setOpenST] = useState<Set<string>>(new Set())
  const accordionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 하위태스크 추가
  const [addingSubTask, setAddingSubTask] = useState(false)
  const [newSTTitle,    setNewSTTitle]    = useState('')
  const [deletingST,    setDeletingST]    = useState<string | null>(null)

  // 첨부파일
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingFor, setUploadingFor] = useState<string | null>(null) // 'item' | stId

  // 노트 저장 타이머
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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

      const latestNoteMap: Record<string, { id: string; content: string }> = {}
      ;(noteData ?? []).forEach((n: { id: string; sub_task_id: string; content: string }) => {
        if (!latestNoteMap[n.sub_task_id]) latestNoteMap[n.sub_task_id] = { id: n.id, content: n.content }
      })

      setSubTasks(fetchedSTs.map(st => ({
        ...st,
        noteId:      latestNoteMap[st.id]?.id,
        noteContent: latestNoteMap[st.id]?.content ?? '',
      })))
    } else {
      setSubTasks([])
    }

    // 첨부파일 로드 — 업무 전체(task_id=id) + 서브태스크별(sub_task_id in stIds)
    const stIds = fetchedSTs.map(s => s.id)
    const attFilter = stIds.length > 0
      ? `task_id.eq.${id},sub_task_id.in.(${stIds.join(',')})`
      : `task_id.eq.${id}`
    const { data: attData } = await supabase
      .from('attachments')
      .select('*')
      .or(attFilter)
      .order('created_at', { ascending: false })
    setAttachments((attData ?? []) as Attachment[])

    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // focus 파라미터 처리 — 해당 아코디언 열고 스크롤
  useEffect(() => {
    if (!focusSTId || subTasks.length === 0) return
    setOpenST(prev => { const s = new Set(prev); s.add(focusSTId); return s })
    setTimeout(() => {
      const el = accordionRefs.current[focusSTId]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [focusSTId, subTasks.length])

  // ── description 자동 저장 ────────────────────────────────────────
  function handleDescription(value: string) {
    setDescription(value)
    if (descTimer.current) clearTimeout(descTimer.current)
    descTimer.current = setTimeout(async () => {
      await supabase.from('agenda_items').update({ description: value }).eq('id', id)
    }, 600)
  }

  // ── 제목 저장 ─────────────────────────────────────────────────────
  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !item) { setEditingTitle(false); return }
    await supabase.from('agenda_items').update({ title: t }).eq('id', id)
    setItem(p => p ? { ...p, title: t } : p)
    setEditingTitle(false)
  }

  // ── 상태 순환 ────────────────────────────────────────────────────
  async function cycleStatus() {
    if (!item) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status as Status) + 1) % STATUS_CYCLE.length]
    await supabase.from('agenda_items').update({ status: next }).eq('id', id)
    setItem(p => p ? { ...p, status: next } : p)
  }

  async function cycleSTStatus(st: SubTaskWithNote) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(st.status as Status) + 1) % STATUS_CYCLE.length]
    await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', st.id)
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, status: next } : s))
  }

  // ── 아코디언 토글 ────────────────────────────────────────────────
  function toggleST(stId: string) {
    setOpenST(prev => { const s = new Set(prev); s.has(stId) ? s.delete(stId) : s.add(stId); return s })
  }

  // ── 노트 저장 ────────────────────────────────────────────────────
  function handleNote(st: SubTaskWithNote, value: string) {
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, noteContent: value } : s))
    clearTimeout(noteTimers.current[st.id])
    noteTimers.current[st.id] = setTimeout(async () => {
      if (st.noteId) {
        await supabase.from('sub_task_notes').update({ content: value, edited_at: new Date().toISOString() }).eq('id', st.noteId)
      } else {
        const { data } = await supabase.from('sub_task_notes').insert({ sub_task_id: st.id, title: st.title, content: value }).select('id').single()
        if (data) setSubTasks(p => p.map(s => s.id === st.id ? { ...s, noteId: (data as { id: string }).id } : s))
      }
    }, 600)
  }

  // ── 첨부파일 업로드 ─────────────────────────────────────────────
  // target: 'item' → 업무 전체, stId → 특정 서브태스크
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'item' | string) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadingFor(target)
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = target === 'item'
          ? `agenda-items/${id}/${Date.now()}_${safeName}`
          : `agenda-items/${id}/subtasks/${target}/${Date.now()}_${safeName}`
        const { error } = await supabase.storage.from('attachments').upload(path, file)
        if (error) continue
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertRow: any = target === 'item'
          ? { task_id: id,   sub_task_id: null,   meeting_id: null, name: file.name, type: '파일', url: urlData.publicUrl }
          : { task_id: null, sub_task_id: target, meeting_id: null, name: file.name, type: '파일', url: urlData.publicUrl }
        const { data } = await supabase.from('attachments').insert(insertRow).select().single()
        if (data) setAttachments(prev => [data as Attachment, ...prev])
      }
    } finally {
      setUploadingFor(null)
      e.target.value = ''
    }
  }

  async function deleteAttachment(att: Attachment) {
    const path = att.url.split('/object/public/attachments/')[1]
    if (path) await supabase.storage.from('attachments').remove([path])
    await supabase.from('attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  // 분류 헬퍼
  const itemAtts  = attachments.filter(a => a.task_id === id && !a.sub_task_id)
  const stAtts    = (stId: string) => attachments.filter(a => a.sub_task_id === stId)

  // ── 하위태스크 추가 ──────────────────────────────────────────────
  async function addSubTask() {
    const title = newSTTitle.trim()
    if (!title) { setAddingSubTask(false); return }
    const { data } = await supabase.from('agenda_sub_tasks')
      .insert({ agenda_item_id: id, title, status: 'active', sort_order: subTasks.length })
      .select().single()
    if (data) {
      const newST: SubTaskWithNote = { ...(data as AgendaSubTask), noteContent: '' }
      setSubTasks(p => [...p, newST])
      setOpenST(prev => { const s = new Set(prev); s.add(newST.id); return s })
    }
    setNewSTTitle(''); setAddingSubTask(false)
  }

  // ── 하위태스크 제목 수정 ─────────────────────────────────────────
  const [editingSTId, setEditingSTId] = useState<string | null>(null)
  const [editSTTitle, setEditSTTitle] = useState('')
  async function updateSTTitle(stId: string) {
    const title = editSTTitle.trim()
    if (!title) { setEditingSTId(null); return }
    await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s))
    setEditingSTId(null)
  }

  // ── 하위태스크 삭제 ──────────────────────────────────────────────
  async function deleteSubTask(stId: string) {
    await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSubTasks(p => p.filter(s => s.id !== stId))
    setDeletingST(null)
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  if (!item)   return <div className="flex items-center justify-center h-40 text-sm text-gray-400">안건을 찾을 수 없습니다.</div>

  const groupColor = group?.color ?? '#3B82F6'
  const doneCount  = subTasks.filter(s => s.status === 'done').length

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
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
                className="text-2xl font-bold cursor-text hover:text-gray-700 transition-colors leading-tight"
                style={{ color: item.status === 'done' ? '#9CA3AF' : '#1A2233', textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                {item.title}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button onClick={cycleStatus}
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[item.status as Status]}`}>
                {STATUS_LABEL[item.status as Status]}
              </button>
              {subTasks.length > 0 && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  하위태스크 {doneCount}/{subTasks.length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 전반적인 메모 박스 ── */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white/70">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">업무 개요 · 메모</span>
          </div>
          <textarea
            value={description}
            onChange={e => handleDescription(e.target.value)}
            placeholder="이 업무에 대한 전반적인 맥락, 목표, 진행 상황 등을 자유롭게 기록하세요…"
            className="w-full px-5 py-4 text-sm text-gray-700 bg-transparent focus:outline-none resize-none leading-relaxed"
            style={{ minHeight: 140, fontFamily: 'inherit' }}
          />
          {/* 업무 첨부파일 */}
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">업무 첨부파일</span>
              <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploadingFor === 'item' ? 'bg-gray-100 text-gray-300' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}>
                📎 {uploadingFor === 'item' ? '업로드 중…' : '파일 추가'}
                <input type="file" multiple className="hidden" onChange={e => handleUpload(e, 'item')} disabled={uploadingFor === 'item'} />
              </label>
            </div>
            {itemAtts.length === 0 ? (
              <p className="text-[10px] text-gray-300">이 업무 전체에 해당하는 파일을 첨부하세요</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {itemAtts.map(att => (
                  <div key={att.id} className="flex items-center gap-1 text-[11px] bg-white border border-gray-200 rounded-lg px-2.5 py-1 group/att">
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="text-gray-600 hover:text-gray-900 hover:underline transition-colors truncate max-w-[180px]">
                      📄 {att.name}
                    </a>
                    <button onClick={() => deleteAttachment(att)}
                      className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
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

          {subTasks.map(st => {
            const isOpen  = openST.has(st.id)
            const stColor = st.status === 'done' ? '#9CA3AF' : (st.status === 'hold' ? '#F59E0B' : groupColor)
            const isFocus = focusSTId === st.id
            return (
              <div key={st.id}
                ref={el => { accordionRefs.current[st.id] = el }}
                className="rounded-xl border overflow-hidden transition-all"
                style={{ borderColor: isFocus && isOpen ? stColor : '#E5E9F0', boxShadow: isFocus && isOpen ? `0 0 0 2px ${stColor}30` : 'none' }}>
                {/* 아코디언 헤더 */}
                <div
                  className="flex items-center gap-2.5 px-4 py-4 cursor-pointer select-none group/acc hover:bg-gray-50/70 transition-colors"
                  style={{ background: isOpen ? `${stColor}08` : 'white' }}
                  onClick={() => toggleST(st.id)}>
                  <span style={{ fontSize: 8, color: '#8FA0B5', display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, lineHeight: 1 }}>▶</span>
                  <button onClick={e => { e.stopPropagation(); cycleSTStatus(st) }} title={STATUS_LABEL[st.status as Status]}
                    style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: stColor, border: 'none', cursor: 'pointer', padding: 0 }} />
                  <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                    {editingSTId === st.id ? (
                      <input autoFocus value={editSTTitle}
                        onChange={e => setEditSTTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateSTTitle(st.id); if (e.key === 'Escape') setEditingSTId(null) }}
                        onBlur={() => updateSTTitle(st.id)}
                        className="text-sm font-semibold text-gray-800 w-full border-b border-blue-400 focus:outline-none bg-transparent"
                        onClick={e => e.stopPropagation()} />
                    ) : (
                      <span
                        className="text-sm font-semibold cursor-text"
                        style={{ color: st.status === 'done' ? '#9CA3AF' : '#1A2233', textDecoration: st.status === 'done' ? 'line-through' : 'none' }}
                        onDoubleClick={e => { e.stopPropagation(); setEditingSTId(st.id); setEditSTTitle(st.title) }}>
                        {st.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover/acc:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditingSTId(st.id); setEditSTTitle(st.title) }}
                      className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors px-1">수정</button>
                    {deletingST === st.id ? (
                      <>
                        <button onClick={() => deleteSubTask(st.id)} className="text-[10px] text-red-500 font-semibold px-1">삭제</button>
                        <button onClick={() => setDeletingST(null)} className="text-[10px] text-gray-400 px-1">취소</button>
                      </>
                    ) : (
                      <button onClick={() => setDeletingST(st.id)} className="text-[10px] text-gray-300 hover:text-red-400 transition-colors px-1">삭제</button>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ml-1 ${STATUS_CLS[st.status as Status]}`}>
                    {STATUS_LABEL[st.status as Status]}
                  </span>
                </div>

                {/* 아코디언 본문 */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #E5E9F0', background: '#FAFBFD' }}>
                    <textarea
                      value={st.noteContent}
                      onChange={e => handleNote(st, e.target.value)}
                      placeholder={`${st.title}에 대한 진전 내용, 결정사항, 링크 등을 아카이빙하세요…`}
                      className="w-full px-5 py-4 text-sm text-gray-700 bg-transparent focus:outline-none resize-none leading-relaxed"
                      style={{ minHeight: 120, fontFamily: 'inherit' }}
                      autoFocus={isFocus && focusSTId === st.id}
                    />
                    {/* 서브태스크 첨부파일 */}
                    <div className="border-t border-gray-100/80 px-5 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: stColor }}>
                          📎 {st.title} · 첨부파일
                        </span>
                        <label className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${uploadingFor === st.id ? 'text-gray-300' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}>
                          {uploadingFor === st.id ? '업로드 중…' : '파일 추가'}
                          <input type="file" multiple className="hidden" onChange={e => handleUpload(e, st.id)} disabled={uploadingFor === st.id} />
                        </label>
                      </div>
                      {stAtts(st.id).length === 0 ? (
                        <p className="text-[10px] text-gray-300">이 하위 태스크에만 연결된 파일을 첨부하세요</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {stAtts(st.id).map(att => (
                            <div key={att.id} className="flex items-center gap-1 text-[11px] bg-white border rounded-lg px-2.5 py-1 group/att"
                              style={{ borderColor: `${stColor}40` }}>
                              <a href={att.url} target="_blank" rel="noopener noreferrer"
                                className="hover:underline transition-colors truncate max-w-[180px]"
                                style={{ color: stColor }}>
                                📄 {att.name}
                              </a>
                              <button onClick={() => deleteAttachment(att)}
                                className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 ml-0.5">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* 하위태스크 추가 */}
          <div className="rounded-xl border border-dashed border-gray-200 overflow-hidden">
            {addingSubTask ? (
              <div className="flex items-center gap-2 px-4 py-3">
                <input autoFocus value={newSTTitle}
                  onChange={e => setNewSTTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(); if (e.key === 'Escape') { setAddingSubTask(false); setNewSTTitle('') } }}
                  placeholder="하위 태스크 이름 입력 후 Enter (프로젝트탭과 자동 연동)"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                <button onClick={addSubTask} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                <button onClick={() => { setAddingSubTask(false); setNewSTTitle('') }} className="text-xs text-gray-400 px-2">취소</button>
              </div>
            ) : (
              <button onClick={() => setAddingSubTask(true)}
                className="w-full flex items-center gap-1.5 px-4 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
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
    </div>
  )
}
