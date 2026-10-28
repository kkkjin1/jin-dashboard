'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Task, Meeting } from '@/types'
import { loadAgendaSearchExtras } from '@/lib/agendaSearchExtras'

const STATUS_COLORS: Record<string, string> = {
  '진행필요': 'bg-gray-100 text-gray-500',
  '진행중': 'bg-blue-50 text-blue-600',
  '완료': 'bg-green-50 text-green-600',
}

interface AgendaItem { id: string; title: string; status: string; group_name: string; desc: string; extras: { label: string; text: string }[] }
interface AgendaSubTask { id: string; title: string; status: string; agenda_item_id: string; item_title: string; kind: 'task' | 'record'; body: string }
interface SketchRow { id: string; name: string; body: string }
interface MemoRow { id: string; title: string; tag: string[]; body: string }

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// 본문 매칭일 때 검색어 주변 미리보기 스니펫 생성 (제목엔 없고 본문에만 있는 경우 표시)
function bodySnippet(text: string, q: string, radius = 36): string {
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return ''
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

// 여러 노트(row별 title/content)를 부모 id(meeting_id, task_id 등)별로 합쳐
// 검색 가능한 평문 텍스트로 만든다.
function groupNoteBodies(rows: { parentId: string; title?: string | null; content?: string | null }[]): Record<string, string> {
  const acc: Record<string, string> = {}
  rows.forEach(r => {
    const text = `${stripHtml(r.title ?? '')} ${stripHtml(r.content ?? '')}`.trim()
    acc[r.parentId] = acc[r.parentId] ? `${acc[r.parentId]} ${text}` : text
  })
  return acc
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Pick<Meeting, 'id' | 'title'>[]>([])
  const [memos, setMemos] = useState<MemoRow[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])
  const [agendaSubTasks, setAgendaSubTasks] = useState<AgendaSubTask[]>([])
  const [meetingBodies, setMeetingBodies] = useState<Record<string, string>>({})
  const [taskBodies, setTaskBodies] = useState<Record<string, string>>({})
  const [sketches, setSketches] = useState<SketchRow[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    function onExternalOpen() { setOpen(true) }
    document.addEventListener('keydown', onKey)
    window.addEventListener('open-global-search', onExternalOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('open-global-search', onExternalOpen)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      // 열 때마다 새로 받는다 — 한 번만 받으면 방금 고친 안건 본문·히스토리가 새로고침 전까지 검색에 안 걸렸다.
      // 받는 동안은 직전 결과로 검색되고, 도착하면 바뀐다.
      {
        Promise.all([
          supabase.from('tasks').select('id, title, status, part, type').order('created_at', { ascending: false }),
          supabase.from('meetings').select('id, title').order('created_at', { ascending: false }),
          supabase.from('quick_memos').select('id, title, tag, content').order('created_at', { ascending: false }),
          // 완료된 안건·할 일도 검색한다(진행필요/진행중이 위로 정렬됨)
          supabase.from('agenda_items').select('id, title, status, description, agenda_groups(name)').order('sort_order'),
          supabase.from('agenda_sub_tasks').select('id, title, status, kind, body, agenda_item_id, agenda_items(title)').order('sort_order'),
          supabase.from('meeting_notes').select('meeting_id, title, content'),
          supabase.from('notes').select('task_id, title, content'),
          supabase.from('sketch_boards').select('id, name, note_body, board_type, parent_board_id, agenda_item_id').order('updated_at', { ascending: false }),
          loadAgendaSearchExtras(supabase),
        ]).then(([{ data: t }, { data: m }, { data: memo }, { data: ai }, { data: ast }, { data: mn }, { data: tn }, { data: sb }, extras]) => {
          const extrasByItem: Record<string, { label: string; text: string }[]> = {}
          for (const e of extras) (extrasByItem[e.agendaItemId] ??= []).push({ label: e.label, text: e.text })
          setTasks((t ?? []) as Task[])
          setMeetings((m ?? []) as Pick<Meeting, 'id' | 'title'>[])
          setMeetingBodies(groupNoteBodies((mn ?? []).map((n: any) => ({ parentId: n.meeting_id, title: n.title, content: n.content }))))
          setTaskBodies(groupNoteBodies((tn ?? []).map((n: any) => ({ parentId: n.task_id, title: n.title, content: n.content }))))
          setMemos((memo ?? []).map((m: any) => ({
            id: m.id, title: m.title ?? '', tag: m.tag ?? [], body: stripHtml(m.content ?? ''),
          })))
          setAgendaItems((ai ?? []).map((a: any) => {
            const g = Array.isArray(a.agenda_groups) ? a.agenda_groups[0] : a.agenda_groups
            return { id: a.id, title: a.title, status: a.status, group_name: g?.name ?? '', desc: stripHtml(a.description ?? ''), extras: extrasByItem[a.id] ?? [] }
          }).sort((a: AgendaItem, b: AgendaItem) => Number(a.status === 'done') - Number(b.status === 'done')))
          setAgendaSubTasks((ast ?? []).map((s: any): AgendaSubTask => {
            const item = Array.isArray(s.agenda_items) ? s.agenda_items[0] : s.agenda_items
            return { id: s.id, title: s.title, status: s.status, agenda_item_id: s.agenda_item_id, item_title: item?.title ?? '', kind: s.kind === 'record' ? 'record' : 'task', body: stripHtml(s.body ?? '') }
          }).sort((a: AgendaSubTask, b: AgendaSubTask) => Number(a.status === 'done') - Number(b.status === 'done')))
          // 안건 숨김 보드·마인드맵 자식 보드는 빼고 생각스케치 목록에 보이는 노트만
          setSketches((sb ?? []).filter((b: any) => !b.parent_board_id && !b.agenda_item_id)
            .map((b: any) => ({ id: b.id, name: b.name ?? '', body: b.board_type === 'freenote' ? stripHtml(b.note_body ?? '') : '' })))
        })
      }
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const matchedTasks = q ? tasks.filter(t => t.title?.toLowerCase().includes(q) || (taskBodies[t.id] ?? '').toLowerCase().includes(q)).slice(0, 4) : []
  const matchedMeetings = q ? meetings.filter(m => m.title?.toLowerCase().includes(q) || (meetingBodies[m.id] ?? '').toLowerCase().includes(q)).slice(0, 3) : []
  const matchedMemos = q ? memos.filter(m => m.title?.toLowerCase().includes(q) || m.body?.toLowerCase().includes(q)).slice(0, 3) : []
  const matchedAgendaItems = q ? agendaItems.filter(a => a.title?.toLowerCase().includes(q) || a.group_name?.toLowerCase().includes(q) || a.desc?.toLowerCase().includes(q) || a.extras.some(e => e.text.toLowerCase().includes(q))).slice(0, 8) : []
  const matchedAgendaSubTasks = q ? agendaSubTasks.filter(s => s.title?.toLowerCase().includes(q) || s.item_title?.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)).slice(0, 6) : []
  const matchedSketches = q ? sketches.filter(s => s.name.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)).slice(0, 3) : []
  const hasResults = matchedTasks.length > 0 || matchedMeetings.length > 0 || matchedMemos.length > 0 || matchedAgendaItems.length > 0 || matchedAgendaSubTasks.length > 0 || matchedSketches.length > 0

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={() => { setOpen(false); setQuery('') }} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[560px] max-w-[90vw] rounded-2xl z-[60] overflow-hidden"
        style={{ background: 'var(--surface-modal2)', border: '1px solid rgba(var(--ink-rgb),0.08)', boxShadow: 'var(--shadow-modal)' }}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(var(--ink-rgb),0.07)]">
          <span className="text-[var(--text-muted)] text-sm">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="안건 · 히스토리 · 할 일 · 업무 · 회의록 · 메모 · 생각스케치 검색..."
            className="flex-1 text-sm text-[var(--text-primary)] focus:outline-none bg-transparent placeholder:text-[rgba(var(--text-rgb),0.35)]"
          />
          <kbd className="text-[10px] text-[var(--text-muted)] bg-[rgba(var(--ink-rgb),0.06)] px-2 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {!q ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6">검색어를 입력하세요</p>
          ) : !hasResults ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6">검색 결과 없음</p>
          ) : (
            <div className="divide-y divide-[rgba(var(--ink-rgb),0.06)]">
              {matchedAgendaItems.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">프로젝트 안건</p>
                  {matchedAgendaItems.map(a => {
                    const titleHit = a.title?.toLowerCase().includes(q)
                    // 본문 → 포스트잇·표·마인드맵 순으로 처음 걸린 곳을 보여준다
                    const descSnippet = !titleHit ? bodySnippet(a.desc, q) : ''
                    const extraHit = !titleHit && !descSnippet ? a.extras.find(e => e.text.toLowerCase().includes(q)) : undefined
                    const snippet = descSnippet ? `본문: ${descSnippet}` : extraHit ? `${extraHit.label}: ${bodySnippet(extraHit.text, q)}` : ''
                    return (
                      <div key={a.id} className="py-2 px-2 hover:bg-[var(--surface-hover)] rounded-lg cursor-pointer"
                        onClick={() => { router.push(`/project/items/${a.id}`); setOpen(false); setQuery('') }}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">{a.group_name || '안건'}</span>
                          <span className="text-sm text-[rgba(var(--text-rgb),0.9)] truncate">{a.title || '제목 없음'}</span>
                          {a.status === 'done' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 flex-shrink-0 ml-auto">완료</span>}
                        </div>
                        {snippet && <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 pl-1 truncate">{snippet}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
              {matchedAgendaSubTasks.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">히스토리 · 할 일</p>
                  {matchedAgendaSubTasks.map(s => {
                    const snippet = s.kind === 'record' && !s.title?.toLowerCase().includes(q) ? bodySnippet(s.body, q) : ''
                    return (
                      <div key={s.id} className="py-2 px-2 hover:bg-[var(--surface-hover)] rounded-lg cursor-pointer"
                        onClick={() => { router.push(`/project/items/${s.agenda_item_id}?focus=${s.id}`); setOpen(false); setQuery('') }}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[rgba(var(--ink-rgb),0.06)] text-[var(--text-muted)] flex-shrink-0">{s.kind === 'record' ? '히스토리' : s.status === 'done' ? '할 일 · 완료' : '할 일'}</span>
                          <span className="text-sm text-[rgba(var(--text-rgb),0.9)] truncate">{s.title || '제목 없음'}</span>
                          <span className="text-[10px] text-[rgba(var(--text-rgb),0.35)] ml-auto flex-shrink-0 truncate max-w-[140px]">{s.item_title}</span>
                        </div>
                        {snippet && <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 pl-1 truncate">본문: {snippet}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
              {matchedTasks.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">업무</p>
                  {matchedTasks.map(t => {
                    const titleHit = t.title?.toLowerCase().includes(q)
                    const snippet = !titleHit ? bodySnippet(taskBodies[t.id] ?? '', q) : ''
                    return (
                      <Link key={t.id} href={`/tasks/${t.id}`} onClick={() => { setOpen(false); setQuery('') }}>
                        <div className="py-2 px-2 hover:bg-[var(--surface-hover)] rounded-lg">
                          <div className="flex items-center gap-2.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                            <span className="text-sm text-[rgba(var(--text-rgb),0.9)] truncate">{t.title || '제목 없음'}</span>
                            <span className="text-xs text-[rgba(var(--text-rgb),0.35)] ml-auto flex-shrink-0">{t.part} · {t.type}</span>
                          </div>
                          {snippet && <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 pl-1 truncate">본문: {snippet}</p>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
              {matchedMeetings.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">회의록</p>
                  {matchedMeetings.map(m => {
                    const titleHit = m.title?.toLowerCase().includes(q)
                    const snippet = !titleHit ? bodySnippet(meetingBodies[m.id] ?? '', q) : ''
                    return (
                      <div key={m.id} className="group/row py-2 px-2 hover:bg-[var(--surface-hover)] rounded-lg">
                        <div className="flex items-center gap-2">
                          <Link href={`/meetings/${m.id}`} onClick={() => { setOpen(false); setQuery('') }}
                            className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-emerald-400 flex-shrink-0">💬</span>
                            <span className="text-sm text-[rgba(var(--text-rgb),0.9)] truncate">{m.title || '제목 없음'}</span>
                          </Link>
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              if (!confirm(`'${m.title}' 회의록을 삭제하시겠습니까?`)) return
                              await supabase.from('meetings').delete().eq('id', m.id)
                              setMeetings(prev => prev.filter(x => x.id !== m.id))
                            }}
                            className="opacity-0 group-hover/row:opacity-100 flex-shrink-0 text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded transition-all">
                            삭제
                          </button>
                        </div>
                        {snippet && <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 pl-5 truncate">본문: {snippet}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
              {matchedMemos.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">메모</p>
                  {matchedMemos.map(m => {
                    const titleHit = m.title?.toLowerCase().includes(q)
                    const snippet = !titleHit ? bodySnippet(m.body, q) : ''
                    return (
                      <Link key={m.id} href="/memos"
                        onClick={() => { localStorage.setItem('memos_open_id', m.id); setOpen(false); setQuery('') }}>
                        <div className="py-2 px-2 hover:bg-[var(--surface-hover)] rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-muted)]">📝</span>
                            <span className="text-sm text-[rgba(var(--text-rgb),0.9)] truncate">{m.title || '제목 없음'}</span>
                            <span className="text-[10px] text-[rgba(var(--text-rgb),0.35)] ml-auto flex-shrink-0">{m.tag.join(', ')}</span>
                          </div>
                          {snippet && <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 pl-5 truncate">본문: {snippet}</p>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
              {matchedSketches.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">생각스케치</p>
                  {matchedSketches.map(s => {
                    const snippet = !s.name.toLowerCase().includes(q) ? bodySnippet(s.body, q) : ''
                    return (
                      <Link key={s.id} href={`/sketch/${s.id}`} onClick={() => { setOpen(false); setQuery('') }}>
                        <div className="py-2 px-2 hover:bg-[var(--surface-hover)] rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-muted)]">✏️</span>
                            <span className="text-sm text-[rgba(var(--text-rgb),0.9)] truncate">{s.name || '제목 없음'}</span>
                          </div>
                          {snippet && <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 pl-5 truncate">본문: {snippet}</p>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-[rgba(var(--ink-rgb),0.06)] flex items-center gap-3">
          <span className="text-[10px] text-[var(--text-muted)]">Ctrl+K 열기/닫기 · ESC 닫기 · Enter 이동</span>
        </div>
      </div>
    </>
  )
}
