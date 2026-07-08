'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaItem, AgendaSubTask } from '@/types'

const STATUS_CYCLE = ['active', 'hold', 'done'] as const
type Status = typeof STATUS_CYCLE[number]
const STATUS_LABEL: Record<Status, string> = { active: '진행중', hold: '보류', done: '완료' }
const STATUS_CLS: Record<Status, string> = {
  active: 'bg-blue-50 text-blue-600 border-blue-200',
  hold:   'bg-amber-50 text-amber-600 border-amber-200',
  done:   'bg-gray-100 text-gray-400 border-gray-200',
}
const STATUS_DOT: Record<Status, string> = { active: '#3B82F6', hold: '#9CA3AF', done: '#10B981' }

export default function AgendaItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const supabase = createClient()

  const [item,     setItem]     = useState<AgendaItem | null>(null)
  const [group,    setGroup]    = useState<{ name: string; color: string } | null>(null)
  const [subTasks, setSubTasks] = useState<AgendaSubTask[]>([])
  const [loading,  setLoading]  = useState(true)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle,    setEditTitle]    = useState('')

  const [addingSubTask, setAddingSubTask] = useState(false)
  const [newSTTitle,    setNewSTTitle]    = useState('')
  const [deletingST,    setDeletingST]    = useState<string | null>(null)

  useEffect(() => { load() }, [id])

  async function load() {
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

    const { data: stData } = await supabase
      .from('agenda_sub_tasks')
      .select('*')
      .eq('agenda_item_id', id)
      .order('sort_order')
    setSubTasks((stData ?? []) as AgendaSubTask[])
    setLoading(false)
  }

  async function cycleStatus() {
    if (!item) return
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status as Status) + 1) % STATUS_CYCLE.length]
    await supabase.from('agenda_items').update({ status: next }).eq('id', id)
    setItem(p => p ? { ...p, status: next } : p)
  }

  async function saveTitle() {
    const t = editTitle.trim()
    if (!t || !item) { setEditingTitle(false); return }
    await supabase.from('agenda_items').update({ title: t }).eq('id', id)
    setItem(p => p ? { ...p, title: t } : p)
    setEditingTitle(false)
  }

  async function cycleSTStatus(st: AgendaSubTask) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(st.status as Status) + 1) % STATUS_CYCLE.length]
    await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', st.id)
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, status: next } : s))
  }

  async function addSubTask() {
    const title = newSTTitle.trim()
    if (!title) { setAddingSubTask(false); return }
    const { data } = await supabase.from('agenda_sub_tasks')
      .insert({ agenda_item_id: id, title, status: 'active', sort_order: subTasks.length })
      .select().single()
    if (data) setSubTasks(p => [...p, data as AgendaSubTask])
    setNewSTTitle(''); setAddingSubTask(false)
  }

  async function deleteSubTask(stId: string) {
    await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSubTasks(p => p.filter(st => st.id !== stId))
    setDeletingST(null)
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  if (!item)   return <div className="flex items-center justify-center h-40 text-sm text-gray-400">안건을 찾을 수 없습니다.</div>

  const doneCount = subTasks.filter(st => st.status === 'done').length

  return (
    <div className="flex flex-col h-full min-h-0 p-4 md:p-6 max-w-3xl">

      {/* 브레드크럼 */}
      <div className="flex items-center gap-1.5 mb-5 text-xs text-gray-400">
        <button onClick={() => router.back()} className="hover:text-gray-700 transition-colors">← 돌아가기</button>
        {group && (
          <>
            <span>·</span>
            <span style={{ color: group.color, fontWeight: 600 }}>{group.name}</span>
          </>
        )}
      </div>

      {/* 제목 + 상태 */}
      <div className="flex items-start gap-3 mb-6">
        {/* 상태 도트 */}
        <button onClick={cycleStatus} title={STATUS_LABEL[item.status as Status]}
          style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_DOT[item.status as Status], border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 7 }} />

        {/* 제목 */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              onBlur={saveTitle}
              className="text-xl font-bold text-gray-900 w-full border-b-2 border-blue-400 focus:outline-none bg-transparent pb-0.5" />
          ) : (
            <h1
              onClick={() => { setEditingTitle(true); setEditTitle(item.title) }}
              className="text-xl font-bold text-gray-900 cursor-text hover:text-gray-700 transition-colors leading-snug"
              style={{ textDecoration: item.status === 'done' ? 'line-through' : 'none', color: item.status === 'done' ? '#9CA3AF' : undefined }}>
              {item.title}
            </h1>
          )}
          <button onClick={cycleStatus}
            className={`mt-2 text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${STATUS_CLS[item.status as Status]}`}>
            {STATUS_LABEL[item.status as Status]}
          </button>
        </div>
      </div>

      {/* 하위 태스크 섹션 */}
      <div className="bg-white/70 rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">하위 태스크</span>
            {subTasks.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {doneCount}/{subTasks.length}
              </span>
            )}
          </div>
          {/* 진척도 바 */}
          {subTasks.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full transition-all"
                  style={{ width: `${(doneCount / subTasks.length) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-400">{Math.round((doneCount / subTasks.length) * 100)}%</span>
            </div>
          )}
        </div>

        <ul className="divide-y divide-gray-50">
          {subTasks.map(st => (
            <li key={st.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 group transition-colors">
              {/* 상태 도트 */}
              <button onClick={() => cycleSTStatus(st)} title={STATUS_LABEL[st.status as Status]}
                style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[st.status as Status], border: 'none', cursor: 'pointer', flexShrink: 0 }} />

              {/* 제목 (클릭 → 상세) */}
              <button
                onClick={() => router.push(`/subtasks/${st.id}`)}
                className="flex-1 text-left text-sm font-medium text-gray-700 hover:text-gray-900 hover:underline transition-colors"
                style={{ textDecoration: st.status === 'done' ? 'line-through' : 'none', color: st.status === 'done' ? '#9CA3AF' : undefined }}>
                {st.title}
              </button>

              {/* 상태 뱃지 */}
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${STATUS_CLS[st.status as Status]}`}>
                {STATUS_LABEL[st.status as Status]}
              </span>

              {/* 삭제 */}
              {deletingST === st.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => deleteSubTask(st.id)} className="text-[10px] text-red-500 font-semibold">삭제</button>
                  <button onClick={() => setDeletingST(null)} className="text-[10px] text-gray-400">취소</button>
                </div>
              ) : (
                <button onClick={() => setDeletingST(st.id)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-300 hover:text-red-400 transition-all flex-shrink-0">
                  삭제
                </button>
              )}
            </li>
          ))}

          {/* 추가 */}
          <li className="px-5 py-2">
            {addingSubTask ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={newSTTitle} onChange={e => setNewSTTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(); if (e.key === 'Escape') { setAddingSubTask(false); setNewSTTitle('') } }}
                  placeholder="하위 태스크 입력 후 Enter"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                <button onClick={addSubTask} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                <button onClick={() => { setAddingSubTask(false); setNewSTTitle('') }} className="text-xs text-gray-400">취소</button>
              </div>
            ) : (
              <button onClick={() => setAddingSubTask(true)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 py-1">
                ＋ 하위 태스크 추가
              </button>
            )}
          </li>
        </ul>
      </div>

      <p className="text-xs text-gray-400 mt-3 px-1">
        하위 태스크를 클릭하면 메모·파일첨부 등 상세 내용을 관리할 수 있습니다.
      </p>
    </div>
  )
}
