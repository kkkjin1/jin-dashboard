'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { useAutosave } from '@/hooks/useAutosave'
import { S, fmtDateFull, BADGE_LABEL, BADGE_COLOR, type TopicChangeBadge } from './style'
import { isFixedKey, type FixedSectionKey } from './TopicOutline'

const FIXED_META: Record<FixedSectionKey, { no: string; title: string; placeholder: string }> = {
  summary:     { no: '1', title: '핵심 요약',          placeholder: '이번 보고의 핵심을 3~5줄로 요약합니다.' },
  issues:      { no: '3', title: '주요 이슈 / 의사결정', placeholder: '경영진 의사결정이 필요한 이슈를 작성합니다.' },
  next_steps:  { no: '4', title: '다음 단계',           placeholder: '다음 보고 전까지의 계획을 작성합니다.' },
}

interface ReportDraft { summary: string; issues: string; next_steps: string }
interface EntryDraft { report_text: string; executive_point: string; next_action: string; working_memo: string }

interface Props {
  supabase: SupabaseClient
  selection: string
  report: WorkReport
  topic: WorkReportTopic | null
  entry: WorkReportEntry | null
  prevEntry: WorkReportEntry | null
  prevReport: WorkReport | null
  badge: TopicChangeBadge | null
  readOnly: boolean
  onEntrySaved: (entry: WorkReportEntry) => void
  onReportSaved: (report: WorkReport) => void
}

function TextBox({
  label, value, onChange, minHeight, placeholder, readOnly, statusLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  minHeight: number
  placeholder?: string
  readOnly: boolean
  statusLabel?: string
}) {
  return (
    <div>
      {(label || statusLabel) && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold" style={{ color: S.t3 }}>{label}</span>
          {statusLabel && <span className="text-[10px]" style={{ color: S.t4 }}>{statusLabel}</span>}
        </div>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight,
          resize: 'vertical',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${S.border}`,
          borderRadius: S.r,
          padding: '12px 14px',
          color: S.t1,
          fontSize: 13.5,
          lineHeight: 1.7,
          outline: 'none',
        }}
      />
    </div>
  )
}

function statusText(status: string): string {
  switch (status) {
    case 'saved': return '자동저장됨'
    case 'syncing':
    case 'local-saving':
    case 'pending-sync': return '저장 중…'
    case 'retrying': return '재시도 중…'
    case 'conflict': return '충돌 발생'
    default: return ''
  }
}

export default function ReportEditorPanel({
  supabase, selection, report, topic, entry, prevEntry, prevReport, badge, readOnly, onEntrySaved, onReportSaved,
}: Props) {
  const isFixed = isFixedKey(selection)

  // readOnly의 "최신값"을 동기적으로 들고 있는 ref — 아래 두 debounce effect의 setTimeout
  // 콜백이 실행되는 시점에 다시 확인한다. effect의 cleanup(clearTimeout)만으로는 "보고 확정"
  // 처리(confirm 다이얼로그 + 네트워크 왕복 후 readOnly가 true로 바뀌는 데 걸리는 시간) 동안
  // 이미 예약돼 있던 타이머가 그 사이에 발화해버리는 좁은 race window를 완전히 막지 못하므로,
  // 실제 쓰기 직전에 한 번 더 확인해 final report에 뒤늦은 쓰기가 절대 들어가지 않게 한다.
  const readOnlyRef = useRef(readOnly)
  useEffect(() => { readOnlyRef.current = readOnly })

  // ── 고정 섹션(핵심요약/이슈/다음단계) 로컬 상태 — report 3필드를 항상 함께 들고 있는다.
  // report/selection이 바뀔 때의 리셋은 effect+setState가 아니라 page.tsx가 이 컴포넌트에
  // key={`${report.id}:${selection}`}를 주는 방식으로 해결한다(React가 컴포넌트를 통째로
  // 재마운트해 아래 useState 초기값이 새로 평가됨) — react-hooks/set-state-in-effect가
  // 금지하는 "effect 안에서 동기 setState로 상태를 리셋"하는 패턴을 피하기 위함.
  const [summaryText, setSummaryText] = useState(report.summary)
  const [issuesText, setIssuesText] = useState(report.issues)
  const [nextStepsText, setNextStepsText] = useState(report.next_steps)

  const reportDraft: ReportDraft = useMemo(
    () => ({ summary: summaryText, issues: issuesText, next_steps: nextStepsText }),
    [summaryText, issuesText, nextStepsText],
  )
  const reportSavedRef = useRef<ReportDraft>(reportDraft)
  useEffect(() => {
    if (readOnly) return
    if (JSON.stringify(reportDraft) === JSON.stringify(reportSavedRef.current)) return
    const t = setTimeout(async () => {
      if (readOnlyRef.current) return
      reportSavedRef.current = reportDraft
      const { data, error } = await supabase.from('work_reports').update(reportDraft).eq('id', report.id).select().single()
      if (!error && data) onReportSaved(data as WorkReport)
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDraft, readOnly, report.id])

  const reportAutosave = useAutosave({
    supabase,
    enabled: isFixed && !readOnly,
    entityType: 'work_report',
    entityId: report.id,
    fieldKey: 'draft',
    value: reportDraft,
  })

  // ── 주제(entry) 로컬 상태 — entry가 바뀔 때의 리셋도 위와 동일하게 key remount로 처리 ──
  const [reportText, setReportText] = useState(entry?.report_text ?? '')
  const [execText, setExecText] = useState(entry?.executive_point ?? '')
  const [nextActionText, setNextActionText] = useState(entry?.next_action ?? '')
  const [memoText, setMemoText] = useState(entry?.working_memo ?? '')
  const [memoOpen, setMemoOpen] = useState(false)

  const entryDraft: EntryDraft | null = useMemo(() => entry ? {
    report_text: reportText, executive_point: execText, next_action: nextActionText, working_memo: memoText,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  } : null, [entry?.id, reportText, execText, nextActionText, memoText])

  const entrySavedRef = useRef<EntryDraft | null>(entryDraft)
  useEffect(() => {
    if (readOnly || !entry || !entryDraft) return
    if (JSON.stringify(entryDraft) === JSON.stringify(entrySavedRef.current)) return
    const t = setTimeout(async () => {
      if (readOnlyRef.current) return
      entrySavedRef.current = entryDraft
      const { data, error } = await supabase.from('work_report_entries').update(entryDraft).eq('id', entry.id).select().single()
      if (!error && data) onEntrySaved(data as WorkReportEntry)
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDraft, readOnly, entry?.id])

  const entryAutosave = useAutosave({
    supabase,
    enabled: !isFixed && !!entry && !readOnly,
    entityType: 'work_report_entry',
    entityId: entry?.id ?? '',
    fieldKey: 'draft',
    value: entryDraft ?? { report_text: '', executive_point: '', next_action: '', working_memo: '' },
  })

  const activeAutosave = isFixed ? reportAutosave : entryAutosave

  function applyRecovered() {
    if (!activeAutosave.recovered) return
    if (isFixed) {
      const v = activeAutosave.recovered.value as ReportDraft
      setSummaryText(v.summary ?? '')
      setIssuesText(v.issues ?? '')
      setNextStepsText(v.next_steps ?? '')
    } else {
      const v = activeAutosave.recovered.value as EntryDraft
      setReportText(v.report_text ?? '')
      setExecText(v.executive_point ?? '')
      setNextActionText(v.next_action ?? '')
      setMemoText(v.working_memo ?? '')
    }
    activeAutosave.discardRecovered()
  }

  const recoveredBanner = activeAutosave.recovered && !readOnly ? (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-lg mb-3 text-[12px]"
      style={{ background: 'rgba(245,194,71,0.1)', border: '1px solid rgba(245,194,71,0.28)', color: '#F5C247' }}
    >
      <span>이전에 저장되지 않은 임시본이 있습니다.</span>
      <div className="flex items-center gap-2">
        <button onClick={applyRecovered} className="underline">적용</button>
        <button onClick={() => activeAutosave.discardRecovered()} className="underline opacity-70">무시</button>
      </div>
    </div>
  ) : null

  // ── 고정 섹션 렌더 ─────────────────────────────────────────────────────
  if (isFixed) {
    const meta = FIXED_META[selection as FixedSectionKey]
    const value = selection === 'summary' ? summaryText : selection === 'issues' ? issuesText : nextStepsText
    const setValue = selection === 'summary' ? setSummaryText : selection === 'issues' ? setIssuesText : setNextStepsText
    return (
      <div className="h-full overflow-y-auto px-6 py-5">
        <p className="text-[15px] font-semibold mb-4" style={{ color: S.t1 }}>{meta.no}. {meta.title}</p>
        {recoveredBanner}
        <TextBox
          label="작성"
          value={value}
          onChange={setValue}
          minHeight={360}
          placeholder={meta.placeholder}
          readOnly={readOnly}
          statusLabel={statusText(activeAutosave.status)}
        />
      </div>
    )
  }

  // ── 주제 렌더 ──────────────────────────────────────────────────────────
  if (!topic || !entry) return null

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-[15px] font-semibold" style={{ color: S.t1 }}>{entry.topic_title_snapshot}</p>
        {badge && badge !== 'unchanged' && (
          <span
            className="text-[9.5px] font-bold px-1.5 py-0.5 rounded"
            style={{ color: badge === 'new' ? '#0F1319' : S.t1, background: BADGE_COLOR[badge] }}
          >
            {BADGE_LABEL[badge]}
          </span>
        )}
      </div>

      {recoveredBanner}

      {prevEntry && prevReport ? (
        <div className="mb-5">
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: S.t3 }}>
            지난 보고 내용 · {fmtDateFull(prevReport.period_start)}
          </p>
          <div
            className="px-3.5 py-3 rounded-lg text-[13px] leading-[1.7] whitespace-pre-wrap"
            style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${S.border}`, color: S.t3 }}
          >
            {prevEntry.report_text || '(작성된 내용 없음)'}
          </div>
        </div>
      ) : (
        <p className="text-[11.5px] mb-5" style={{ color: S.t4 }}>이번 보고에서 새로 추가된 주제입니다.</p>
      )}

      <div className="space-y-4">
        <TextBox
          label="이번 업데이트"
          value={reportText}
          onChange={setReportText}
          minHeight={220}
          placeholder="자유롭게 줄글로 작성합니다."
          readOnly={readOnly}
          statusLabel={statusText(activeAutosave.status)}
        />
        <TextBox
          label="경영진에게 전달할 포인트 (의사결정 필요사항)"
          value={execText}
          onChange={setExecText}
          minHeight={90}
          readOnly={readOnly}
        />
        <TextBox
          label="다음 액션"
          value={nextActionText}
          onChange={setNextActionText}
          minHeight={90}
          readOnly={readOnly}
        />

        <div>
          <button
            onClick={() => setMemoOpen(o => !o)}
            className="flex items-center gap-1 text-[11px] font-semibold mb-1.5"
            style={{ color: S.t3 }}
          >
            {memoOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            내 작업 메모 (PT 문안에는 포함되지 않음)
          </button>
          {memoOpen && (
            <TextBox
              label=""
              value={memoText}
              onChange={setMemoText}
              minHeight={120}
              placeholder="CFO 미팅, 지급률 재계산 등 기억용 raw note"
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
    </div>
  )
}
