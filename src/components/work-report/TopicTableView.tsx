'use client'

import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MoreHorizontal, Pencil, Plus, X } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { useCanonicalSync, canonicalStatusText } from '@/hooks/useCanonicalSync'
import { S, hasContent } from './style'
import RestoreTopicModal from './RestoreTopicModal'

// "테이블 작성" — 이번 회차 전체 topic × (이번 업데이트/경영진 전달 포인트/다음 액션)을
// 한 화면에서 빠르게 보고/수정하는 editing surface. "보고서 작성"(ReportEditorPanel)과
// 동일한 work_report_entries를 편집하므로, row는 useCanonicalSync(src/hooks/
// useCanonicalSync.ts)를 그대로 재사용해 같은 debounce/저장 semantics를 공유한다 — 새
// 독립 저장 시스템을 만들지 않는다. working_memo(내 작업 메모)는 이 테이블에서 다루지
// 않는다(기존 상세 작성 화면 전용, 스펙 §3).
//
// useAutosave(복구 버퍼)는 재사용하지 않는다 — 필드 하나마다 복구 배너를 다는 것은 촘촘한
// 다중 행 테이블에는 과한 UI이고, 실제 저장 경로(=이 화면이 데이터 정합성을 지켜야 하는
// 지점)는 canonical write뿐이다. 크래시 복구가 필요한 깊은 작업은 "보고서 작성"에서 그대로
// 보장된다.
export type EntryDraft3 = { report_text: string; executive_point: string; next_action: string }

interface RowProps {
  supabase: SupabaseClient
  entry: WorkReportEntry
  topic: WorkReportTopic
  readOnly: boolean
  onEntrySaved: (entry: WorkReportEntry) => void
  onRemoveFromReport: (topicId: string) => void
  onRenameTopic: (topicId: string, title: string) => void
  onArchiveTopic: (topicId: string) => void
}

type FieldKey = 'report_text' | 'executive_point' | 'next_action'

function Cell({
  value, onChange, editing, onEnter, onExit, readOnly, minHeight,
}: {
  value: string
  onChange: (v: string) => void
  editing: boolean
  onEnter: () => void
  onExit: () => void
  readOnly: boolean
  minHeight: number
}) {
  if (!editing) {
    return (
      <button
        type="button"
        onClick={readOnly ? undefined : onEnter}
        className="w-full h-full text-left px-3 py-2.5"
        style={{ cursor: readOnly ? 'default' : 'text', minHeight }}
      >
        {hasContent(value) ? (
          <span
            className="text-[12.5px] leading-[1.6] whitespace-pre-wrap"
            style={{ color: S.t2, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }}
          >
            {value}
          </span>
        ) : (
          <span className="text-[12px]" style={{ color: S.t4 }}>내용 없음</span>
        )}
      </button>
    )
  }
  return (
    <textarea
      autoFocus
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onExit}
      onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.blur() } }}
      className="w-full px-3 py-2.5 text-[12.5px] leading-[1.6] outline-none resize-y"
      style={{ minHeight, background: 'rgba(var(--ink-rgb),0.04)', border: `1px solid ${S.accentBorder}`, color: S.t1 }}
    />
  )
}

function TopicTableRow({ supabase, entry, topic, readOnly, onEntrySaved, onRemoveFromReport, onRenameTopic, onArchiveTopic }: RowProps) {
  const [reportText, setReportText] = useState(entry.report_text)
  const [execText, setExecText] = useState(entry.executive_point)
  const [nextActionText, setNextActionText] = useState(entry.next_action)
  const [editing, setEditing] = useState<FieldKey | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(topic.title)

  const draft: EntryDraft3 = useMemo(
    () => ({ report_text: reportText, executive_point: execText, next_action: nextActionText }),
    [reportText, execText, nextActionText],
  )
  const canonical = useCanonicalSync<EntryDraft3>({
    supabase,
    table: 'work_report_entries',
    id: entry.id,
    draft,
    readOnly,
    onSaved: row => onEntrySaved(row as WorkReportEntry),
  })

  function commitRename() {
    const t = renameValue.trim()
    if (t && t !== topic.title) onRenameTopic(topic.id, t)
    setRenaming(false)
  }

  return (
    <div className="group/row" style={{ display: 'contents' }}>
      <div
        className="px-3 py-2.5 flex items-center gap-1.5 min-w-0"
        style={{ position: 'sticky', left: 0, zIndex: 1, background: S.panel, borderBottom: `1px solid ${S.border}`, borderRight: `1px solid ${S.borderStrong}` }}
      >
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
            onBlur={commitRename}
            className="flex-1 min-w-0 text-[12.5px] px-1.5 py-1 rounded outline-none"
            style={{ background: 'rgba(var(--ink-rgb),0.08)', color: S.t1 }}
          />
        ) : (
          <span className="flex-1 min-w-0 text-[12.5px] font-medium truncate" style={{ color: S.t1 }} title={topic.title}>
            {topic.title}
          </span>
        )}
        {canonical.status !== 'idle' && (
          <span className="flex-shrink-0 text-[9.5px]" style={{ color: canonical.status === 'failed' ? S.danger : S.t4 }}>
            {canonicalStatusText(canonical.status)}
          </span>
        )}
      </div>

      <div style={{ borderBottom: `1px solid ${S.border}` }}>
        <Cell value={reportText} onChange={setReportText} editing={editing === 'report_text'} onEnter={() => setEditing('report_text')} onExit={() => setEditing(null)} readOnly={readOnly} minHeight={64} />
      </div>
      <div style={{ borderBottom: `1px solid ${S.border}` }}>
        <Cell value={execText} onChange={setExecText} editing={editing === 'executive_point'} onEnter={() => setEditing('executive_point')} onExit={() => setEditing(null)} readOnly={readOnly} minHeight={64} />
      </div>
      <div style={{ borderBottom: `1px solid ${S.border}` }}>
        <Cell value={nextActionText} onChange={setNextActionText} editing={editing === 'next_action'} onEnter={() => setEditing('next_action')} onExit={() => setEditing(null)} readOnly={readOnly} minHeight={64} />
      </div>

      <div className="relative flex items-center justify-center" style={{ borderBottom: `1px solid ${S.border}` }}>
        {!readOnly && (
          <>
            <button onClick={() => setMenuOpen(o => !o)} className="p-1 rounded hover:bg-[rgba(var(--ink-rgb),0.08)]" title="더 보기">
              <MoreHorizontal size={13} style={{ color: S.t3 }} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-1 top-full mt-0.5 z-10 rounded-lg py-1 text-[11px]"
                style={{ background: 'var(--surface-elevated)', border: `1px solid ${S.borderStrong}`, minWidth: 150 }}
              >
                <button
                  onClick={() => { onRemoveFromReport(topic.id); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[rgba(var(--ink-rgb),0.06)] flex items-center gap-1.5"
                  style={{ color: S.t2 }}
                >
                  <X size={11} /> 이번 보고에서 제외
                </button>
                <button
                  onClick={() => { setRenaming(true); setRenameValue(topic.title); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[rgba(var(--ink-rgb),0.06)] flex items-center gap-1.5"
                  style={{ color: S.t2 }}
                >
                  <Pencil size={11} /> 주제 이름 변경
                </button>
                <button
                  onClick={() => { onArchiveTopic(topic.id); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[rgba(var(--ink-rgb),0.06)]"
                  style={{ color: S.t2 }}
                >
                  주제 종료
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface Props {
  supabase: SupabaseClient
  entries: WorkReportEntry[]
  topics: WorkReportTopic[]        // 전체 topic (active + archived) — 라벨/후보 계산용
  reports: WorkReport[]            // 전체 report — 기존 주제 불러오기의 "마지막 보고" 계산용
  readOnly: boolean
  onEntrySaved: (entry: WorkReportEntry) => void
  onAddTopic: (title: string) => void
  onAddExistingTopics: (topicIds: string[]) => void
  onRemoveFromReport: (topicId: string) => void
  onRenameTopic: (topicId: string, title: string) => void
  onArchiveTopic: (topicId: string) => void
}

const GRID_COLUMNS = '200px minmax(200px,1fr) minmax(180px,1fr) minmax(160px,1fr) 36px'

export default function TopicTableView({
  supabase, entries, topics, reports, readOnly,
  onEntrySaved, onAddTopic, onAddExistingTopics, onRemoveFromReport, onRenameTopic, onArchiveTopic,
}: Props) {
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const topicsById = useMemo(() => new Map(topics.map(t => [t.id, t])), [topics])
  const rows = useMemo(() => {
    return [...entries]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(entry => ({ entry, topic: topicsById.get(entry.topic_id) }))
      .filter((r): r is { entry: WorkReportEntry; topic: WorkReportTopic } => !!r.topic)
  }, [entries, topicsById])

  const candidateTopics = useMemo(() => {
    const inReport = new Set(entries.map(e => e.topic_id))
    return topics.filter(t => t.status === 'active' && !inReport.has(t.id))
  }, [entries, topics])

  function commitAdd() {
    const t = newTitle.trim()
    if (t) onAddTopic(t)
    setNewTitle('')
    setAdding(false)
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-[13px] font-medium" style={{ color: S.t2 }}>이번 보고에 아직 주제가 없습니다.</p>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRestoreOpen(true)}
                className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium"
                style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}
              >
                + 기존 주제 불러오기
              </button>
              <button
                onClick={() => setAdding(true)}
                className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold"
                style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}
              >
                + 새 주제
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${S.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS }}>
            <div
              className="px-3 py-2 text-[11px] font-semibold"
              style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: S.panel, color: S.t3, borderBottom: `1px solid ${S.borderStrong}`, borderRight: `1px solid ${S.borderStrong}` }}
            >
              주제
            </div>
            {(['이번 업데이트', '경영진 전달 포인트', '다음 액션'] as const).map(label => (
              <div key={label} className="px-3 py-2 text-[11px] font-semibold" style={{ position: 'sticky', top: 0, zIndex: 2, background: S.panel, color: S.t3, borderBottom: `1px solid ${S.borderStrong}` }}>
                {label}
              </div>
            ))}
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: S.panel, borderBottom: `1px solid ${S.borderStrong}` }} />

            {rows.map(({ entry, topic }) => (
              <TopicTableRow
                key={entry.id}
                supabase={supabase}
                entry={entry}
                topic={topic}
                readOnly={readOnly}
                onEntrySaved={onEntrySaved}
                onRemoveFromReport={onRemoveFromReport}
                onRenameTopic={onRenameTopic}
                onArchiveTopic={onArchiveTopic}
              />
            ))}
          </div>
        </div>
      )}

      {!readOnly && rows.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setRestoreOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}
          >
            <Plus size={11} /> 기존 주제 불러오기
          </button>
          {adding ? (
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
              onBlur={commitAdd}
              placeholder="주제 이름"
              className="text-[12px] px-2.5 py-1.5 rounded-lg outline-none"
              style={{ background: 'rgba(var(--ink-rgb),0.06)', color: S.t1, border: `1px solid ${S.accentBorder}` }}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}
            >
              <Plus size={11} /> 새 주제
            </button>
          )}
        </div>
      )}

      {restoreOpen && (
        <RestoreTopicModal
          supabase={supabase}
          candidateTopics={candidateTopics}
          reports={reports}
          onClose={() => setRestoreOpen(false)}
          onRestore={topicIds => { onAddExistingTopics(topicIds); setRestoreOpen(false) }}
        />
      )}
    </div>
  )
}
