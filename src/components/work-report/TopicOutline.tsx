'use client'

import { useState } from 'react'
import { Plus, GripVertical, Pencil, X, Archive } from 'lucide-react'
import type { WorkReportEntry, WorkReportTopic } from '@/types'
import { S, BADGE_LABEL, BADGE_COLOR, isEntryWritten, type TopicChangeBadge } from './style'

export const FIXED_KEYS = ['summary', 'issues', 'next_steps'] as const
export type FixedSectionKey = typeof FIXED_KEYS[number]

export function isFixedKey(key: string): key is FixedSectionKey {
  return (FIXED_KEYS as readonly string[]).includes(key)
}

export interface OutlineTopicRow {
  entry: WorkReportEntry
  topic: WorkReportTopic
  badge: TopicChangeBadge
}

interface Props {
  rows: OutlineTopicRow[]
  allActiveTopics: WorkReportTopic[]
  selection: string
  onSelect: (key: string) => void
  readOnly: boolean
  onAddTopic: (title: string) => void
  onRenameTopic: (topicId: string, title: string) => void
  onReorder: (orderedEntryIds: string[]) => void
  onRemoveFromReport: (topicId: string) => void
  onArchiveTopic: (topicId: string) => void
  // 고정 섹션(요약/이슈/다음단계)은 report 필드에 내용이 있는지를 page.tsx가 계산해 넘긴다 —
  // 이 컴포넌트는 entry 구조를 모르는 report 원문 필드까지 알 필요가 없다.
  summaryWritten: boolean
  issuesWritten: boolean
  nextStepsWritten: boolean
}

// 목차 dot(●/○/◉) — "작성됨/미작성/현재 선택" 3-state. 헤더 진행률과 같은
// isEntryWritten 기준을 쓰되, 현재 선택된 행은 배경 강조와 별개로 dot도 ◉로 바뀐다.
type DotState = 'selected' | 'written' | 'empty'

function StatusDot({ state }: { state: DotState }) {
  if (state === 'selected') {
    return <span aria-hidden className="flex-shrink-0 rounded-full" style={{ width: 6, height: 6, background: S.accent, boxShadow: `0 0 0 2px ${S.accentDim}` }} />
  }
  if (state === 'written') {
    return <span aria-hidden className="flex-shrink-0 rounded-full" style={{ width: 6, height: 6, background: S.t2 }} />
  }
  return <span aria-hidden className="flex-shrink-0 rounded-full" style={{ width: 6, height: 6, border: `1.5px solid ${S.t4}` }} />
}

function SectionLabel({ n, label, active, dot, onClick }: { n: string; label: string; active: boolean; dot: DotState; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors"
      style={{
        color: active ? S.accentText : S.t2,
        background: active ? S.accentDim : 'transparent',
        fontWeight: active ? 600 : 500,
      }}
    >
      <span className="truncate">{n}. {label}</span>
      <StatusDot state={dot} />
    </button>
  )
}

export default function TopicOutline({
  rows, allActiveTopics, selection, onSelect, readOnly,
  onAddTopic, onRenameTopic, onReorder, onRemoveFromReport, onArchiveTopic,
  summaryWritten, issuesWritten, nextStepsWritten,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [menuTopicId, setMenuTopicId] = useState<string | null>(null)

  function commitAdd() {
    const t = newTitle.trim()
    if (t) onAddTopic(t)
    setNewTitle('')
    setAdding(false)
  }

  function startRename(topic: WorkReportTopic) {
    setEditingId(topic.id)
    setEditTitle(topic.title)
    setMenuTopicId(null)
  }

  function commitRename() {
    if (editingId && editTitle.trim()) onRenameTopic(editingId, editTitle.trim())
    setEditingId(null)
  }

  function handleDrop(targetEntryId: string) {
    if (!dragId || dragId === targetEntryId) { setDragId(null); setDragOverId(null); return }
    const ids = rows.map(r => r.entry.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetEntryId)
    if (from === -1 || to === -1) { setDragId(null); setDragOverId(null); return }
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragId)
    onReorder(next)
    setDragId(null)
    setDragOverId(null)
  }

  function dotFor(key: string, written: boolean): DotState {
    if (selection === key) return 'selected'
    return written ? 'written' : 'empty'
  }

  return (
    <div className="h-full flex flex-col" style={{ width: 190, flexShrink: 0 }}>
      <div className="px-2.5 pt-3 pb-1.5 flex items-center justify-between gap-1.5">
        <p className="text-[10px] font-semibold uppercase truncate" style={{ color: S.t4 }}>
          이번 보고 목차
        </p>
        {!readOnly && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex-shrink-0 flex items-center gap-0.5 text-[10.5px] font-medium transition-colors hover:opacity-80"
            style={{ color: S.t3 }}
          >
            <Plus size={10} /> 주제 추가
          </button>
        )}
      </div>

      {!readOnly && adding && (
        <div className="px-2.5 pb-1.5">
          <input
            autoFocus
            list="work-report-topic-suggestions"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
            onBlur={commitAdd}
            placeholder="주제 이름"
            className="w-full text-[12.5px] px-2 py-1.5 rounded-lg outline-none"
            style={{ background: 'rgba(var(--ink-rgb),0.06)', color: S.t1, border: `1px solid ${S.accentBorder}` }}
          />
          <datalist id="work-report-topic-suggestions">
            {allActiveTopics.map(t => <option key={t.id} value={t.title} />)}
          </datalist>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-3" style={{ scrollbarWidth: 'thin' }}>
        <SectionLabel n="1" label="핵심 요약" active={selection === 'summary'} dot={dotFor('summary', summaryWritten)} onClick={() => onSelect('summary')} />

        <p className="px-2.5 mt-2 mb-1 text-[11.5px] font-semibold" style={{ color: S.t3 }}>2. 주요 내용</p>

        {rows.length === 0 && (
          <p className="px-2.5 pb-1.5 text-[11.5px]" style={{ color: S.t4 }}>등록된 주제가 없습니다.</p>
        )}

        <div className="space-y-0.5">
          {rows.map((row, i) => {
            const active = selection === row.topic.id
            const isEditing = editingId === row.topic.id
            const isDragOver = dragOverId === row.entry.id && dragId !== row.entry.id
            return (
              <div
                key={row.entry.id}
                draggable={!readOnly && !isEditing}
                onDragStart={() => setDragId(row.entry.id)}
                onDragOver={e => { e.preventDefault(); setDragOverId(row.entry.id) }}
                onDrop={() => handleDrop(row.entry.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                className="group/topic relative rounded-lg"
                style={{
                  background: active ? S.accentDim : isDragOver ? 'rgba(var(--ink-rgb),0.05)' : 'transparent',
                  opacity: dragId === row.entry.id ? 0.4 : 1,
                  outline: isDragOver ? `1px dashed ${S.accentBorder}` : 'none',
                }}
              >
                {isEditing ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                      onBlur={commitRename}
                      className="flex-1 text-[12.5px] px-1.5 py-1 rounded outline-none"
                      style={{ background: 'rgba(var(--ink-rgb),0.08)', color: S.t1 }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(row.topic.id)}
                    className="w-full text-left pl-2 pr-7 py-1.5 flex items-center gap-1.5"
                  >
                    {!readOnly && (
                      <GripVertical size={11} className="flex-shrink-0 opacity-0 group-hover/topic:opacity-40 cursor-grab" style={{ color: S.t3 }} />
                    )}
                    <span className="text-[12.5px] truncate flex-1" style={{ color: active ? S.accentText : S.t2, fontWeight: active ? 600 : 400 }}>
                      2.{i + 1} {row.entry.topic_title_snapshot}
                    </span>
                    <StatusDot state={active ? 'selected' : isEntryWritten(row.entry) ? 'written' : 'empty'} />
                  </button>
                )}

                {!isEditing && row.badge !== 'unchanged' && (
                  <span
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-[8.5px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: row.badge === 'new' ? '#0F1319' : S.t1, background: BADGE_COLOR[row.badge] }}
                  >
                    {BADGE_LABEL[row.badge]}
                  </span>
                )}

                {!readOnly && !isEditing && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover/topic:flex items-center gap-0.5" style={{ background: active ? 'var(--surface-active)' : 'var(--surface-primary)' }}>
                    <button onClick={() => startRename(row.topic)} className="p-1 rounded hover:bg-[rgba(var(--ink-rgb),0.08)]" title="이름 수정">
                      <Pencil size={10} style={{ color: S.t3 }} />
                    </button>
                    <button
                      onClick={() => setMenuTopicId(m => m === row.topic.id ? null : row.topic.id)}
                      className="p-1 rounded hover:bg-[rgba(var(--ink-rgb),0.08)]"
                      title="더 보기"
                    >
                      <Archive size={10} style={{ color: S.t3 }} />
                    </button>
                    <button onClick={() => onRemoveFromReport(row.topic.id)} className="p-1 rounded hover:bg-[rgba(239,68,68,0.15)]" title="이번 보고에서 제외">
                      <X size={11} style={{ color: S.t3 }} />
                    </button>
                  </div>
                )}

                {menuTopicId === row.topic.id && (
                  <div
                    className="absolute right-1 top-full mt-0.5 z-10 rounded-lg py-1 text-[11px]"
                    style={{ background: 'var(--surface-elevated)', border: `1px solid ${S.borderStrong}`, minWidth: 140 }}
                  >
                    <button
                      onClick={() => { onArchiveTopic(row.topic.id); setMenuTopicId(null) }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[rgba(var(--ink-rgb),0.06)]"
                      style={{ color: S.t2 }}
                    >
                      주제 보관 (마스터 archive)
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${S.border}` }}>
          <SectionLabel n="3" label="주요 이슈 / 의사결정" active={selection === 'issues'} dot={dotFor('issues', issuesWritten)} onClick={() => onSelect('issues')} />
          <SectionLabel n="4" label="다음 단계" active={selection === 'next_steps'} dot={dotFor('next_steps', nextStepsWritten)} onClick={() => onSelect('next_steps')} />
        </div>
      </div>
    </div>
  )
}
