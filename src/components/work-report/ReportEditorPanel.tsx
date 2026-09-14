'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { useAutosave } from '@/hooks/useAutosave'
import { S, fmtDateFull, BADGE_LABEL, BADGE_COLOR, type TopicChangeBadge } from './style'
import { isFixedKey, type FixedSectionKey } from './TopicOutline'

// ── canonical(work_reports/work_report_entries) 저장 신뢰성 ──────────────
//
// 2026-09-14 자동저장/보안 재검증에서 확인된 결함: 기존 코드는 실제 UPDATE가
// 성공하기도 전에 savedRef를 먼저 갱신했고(낙관적 마킹), 실패해도 재시도/에러
// 표시가 전혀 없었다. 화면의 "자동저장됨" 라벨도 canonical이 아니라 useAutosave
// (autosave_drafts 복구 버퍼) 상태만 반영해, canonical 저장이 조용히 실패해도
// 사용자는 "저장됨"으로 오인할 수 있었다.
//
// useCanonicalSync는 이 두 문제를 최소 구조로 고친다: (1) savedRef는 UPDATE가
// 실제로 성공한 뒤에만 갱신, (2) idle/saving/saved/failed 상태를 노출해 실패를
// 화면에 그대로 보여줌, (3) 실패 시 1회 짧은 재시도(1.5s) — useAutosave.ts의
// CAS/backoff 전체를 새로 들여오지 않고, 딱 필요한 만큼만.
// unmount 시 pending debounce를 취소만 하고 흘려보내던 기존 버그도, 여기서는
// useAutosave.ts의 "unmount flush (best-effort)" 패턴을 그대로 재사용해 고친다
// (topic/보고 전환은 key remount라 이 unmount flush로 커버되지만, "final 확정"은
// remount가 아니므로 flush()를 ref로 외부에 노출해 page.tsx가 확정 직전에
// 명시적으로 호출한다 — 아래 useImperativeHandle 참고).
type CanonicalStatus = 'idle' | 'saving' | 'saved' | 'failed'

function canonicalStatusText(status: CanonicalStatus): string {
  switch (status) {
    case 'saving': return '저장 중…'
    case 'saved': return '저장됨'
    case 'failed': return '저장 실패'
    default: return ''
  }
}

function useCanonicalSync<T>({
  supabase, table, id, draft, readOnly, onSaved, debounceMs = 1200, retryMs = 1500,
}: {
  supabase: SupabaseClient
  table: string
  id: string | null
  draft: T | null
  readOnly: boolean
  onSaved: (row: unknown) => void
  debounceMs?: number
  retryMs?: number
}): { status: CanonicalStatus; flush: () => Promise<void> } {
  const [status, setStatus] = useState<CanonicalStatus>('idle')
  const savedRef = useRef<T | null>(draft)
  const idRef = useRef(id)
  const draftRef = useRef(draft)
  const readOnlyRef = useRef(readOnly)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => { idRef.current = id }, [id])
  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => { readOnlyRef.current = readOnly }, [readOnly])

  const attemptSave = useCallback(async (): Promise<boolean> => {
    const currentId = idRef.current
    const currentDraft = draftRef.current
    if (!currentId || readOnlyRef.current || currentDraft == null) return true
    if (JSON.stringify(currentDraft) === JSON.stringify(savedRef.current)) return true
    if (inFlightRef.current) return false
    inFlightRef.current = true
    setStatus('saving')
    try {
      // `table`은 두 캐노니컬 테이블에 재사용하는 일반 string이라 supabase-js가
      // 테이블별 정확한 Update row 타입을 추론할 수 없다 — 호출부(reportCanonical/
      // entryCanonical)에서 이미 각 테이블에 맞는 T로 고정해 넘기므로 안전하다.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from(table) as any).update(currentDraft).eq('id', currentId).select().single()
      inFlightRef.current = false
      if (error || !data) {
        setStatus('failed')
        return false
      }
      // 실제로 보낸 draft 값에 대해서만 "저장됨"으로 마킹한다 — 요청이 진행되는
      // 동안 더 최신 입력이 들어왔다면 draftRef.current가 이미 앞서 있으므로,
      // 위 dirty-check가 그 값을 자동으로 다시 저장 대상으로 잡는다.
      savedRef.current = currentDraft
      setStatus('saved')
      onSaved(data)
      return true
    } catch {
      inFlightRef.current = false
      setStatus('failed')
      return false
    }
  }, [supabase, table, onSaved])

  // 입력 변화에 따른 debounce 저장
  useEffect(() => {
    if (readOnly || id == null || draft == null) return
    if (JSON.stringify(draft) === JSON.stringify(savedRef.current)) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void attemptSave().then(ok => {
        if (!ok) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
          retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; void attemptSave() }, retryMs)
        }
      })
    }, debounceMs)
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, readOnly, id, debounceMs, retryMs])

  useEffect(() => {
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current) }
  }, [])

  // unmount flush (best-effort) — useAutosave.ts:483-490과 동일한 패턴.
  // topic/보고 전환은 ReportEditorPanel이 key remount되므로 이 unmount로 커버된다.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        void attemptSave()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    await attemptSave()
  }, [attemptSave])

  return { status, flush }
}

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
          background: 'rgba(var(--ink-rgb),0.03)',
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

export type ReportEditorPanelHandle = {
  // page.tsx가 "보고 확정" 직전에 호출 — 지금 화면에 남아있는 pending canonical
  // debounce를 즉시 커밋한다("입력 직후 즉시 확정" 시 마지막 입력 유실 방지).
  flushPending: () => Promise<void>
}

const ReportEditorPanel = forwardRef<ReportEditorPanelHandle, Props>(function ReportEditorPanel({
  supabase, selection, report, topic, entry, prevEntry, prevReport, badge, readOnly, onEntrySaved, onReportSaved,
}, ref) {
  const isFixed = isFixedKey(selection)

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

  const reportCanonical = useCanonicalSync<ReportDraft>({
    supabase,
    table: 'work_reports',
    id: report.id,
    draft: reportDraft,
    readOnly,
    onSaved: row => onReportSaved(row as WorkReport),
  })

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

  const entryCanonical = useCanonicalSync<EntryDraft>({
    supabase,
    table: 'work_report_entries',
    id: entry?.id ?? null,
    draft: entryDraft,
    readOnly,
    onSaved: row => onEntrySaved(row as WorkReportEntry),
  })

  const activeCanonical = isFixed ? reportCanonical : entryCanonical

  useImperativeHandle(ref, () => ({
    flushPending: async () => {
      await Promise.all([reportCanonical.flush(), entryCanonical.flush()])
    },
  }), [reportCanonical, entryCanonical])

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
          statusLabel={canonicalStatusText(activeCanonical.status)}
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
            style={{ background: 'rgba(var(--ink-rgb),0.025)', border: `1px solid ${S.border}`, color: S.t3 }}
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
          statusLabel={canonicalStatusText(activeCanonical.status)}
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
})

export default ReportEditorPanel
