'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { useAutosave } from '@/hooks/useAutosave'
import { S, fmtPeriodLabel, WRITING_CONTENT_WIDTH } from './style'
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
  readOnly: boolean
  onEntrySaved: (entry: WorkReportEntry) => void
  onReportSaved: (report: WorkReport) => void
  // 순차 작성 이동 — 목차와 별개로, 지금 보는 주제에서 바로 이전/다음 주제로 넘어가기 위한
  // 것. 순서는 page.tsx가 outlineRows(sort_order 기준)로 이미 계산해 넘긴다.
  hasPrevTopic: boolean
  hasNextTopic: boolean
  onPrevTopic: () => void
  onNextTopic: () => void
  // topic이 0개일 때 CENTER의 empty state에서 "+ 첫 주제 추가"가 재사용하는 기존 handler.
  onAddTopic: (title: string) => void
}

// variant는 4개 필드를 "하나의 균일한 form"이 아니라 명확한 위계로 보이게 하기 위한
// 최소한의 시각적 구분이다 — 새 카드 박스를 늘리는 대신 label 무게와 테두리 강조 정도만 바꾼다.
//   primary : "이번 업데이트" — writing workspace의 main surface
//   callout : "경영진 전달 포인트" — 그대로 보고에 옮겨지는 decision/request 문구라 좌측 accent bar로 구분
//   default : 그 외(다음 액션, 내 작업 메모, 고정 섹션)
type TextBoxVariant = 'primary' | 'callout' | 'default'

function TextBox({
  label, secondaryLabel, helper, value, onChange, minHeight, placeholder, readOnly, statusLabel, variant = 'default',
}: {
  label: string
  secondaryLabel?: string
  helper?: string
  value: string
  onChange: (v: string) => void
  minHeight: number
  placeholder?: string
  readOnly: boolean
  statusLabel?: string
  variant?: TextBoxVariant
}) {
  return (
    <div>
      {(label || statusLabel) && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className={variant === 'primary' ? 'text-[12.5px] font-bold' : 'text-[11px] font-semibold'}
              style={{ color: variant === 'primary' ? S.t1 : S.t3 }}
            >
              {label}
            </span>
            {secondaryLabel && <span className="text-[10.5px]" style={{ color: S.t4 }}>{secondaryLabel}</span>}
          </div>
          {statusLabel && <span className="text-[10px]" style={{ color: S.t4 }}>{statusLabel}</span>}
        </div>
      )}
      {helper && <p className="text-[11px] mb-1.5" style={{ color: S.t4 }}>{helper}</p>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight,
          resize: 'vertical',
          // callout은 예전에 accentDim(0.15) 배경 전체를 채워 "파란 박스"처럼 튀었다 —
          // 왼쪽 accent bar 하나로도 이번 업데이트/다음 액션과는 다른 성격(결정/요청)임이
          // 충분히 구분되므로 배경은 아주 옅은 tint로만 남긴다.
          background: variant === 'callout' ? 'rgba(76,127,224,0.05)' : 'rgba(var(--ink-rgb),0.03)',
          border: variant === 'primary' ? `1px solid ${S.borderStrong}` : `1px solid ${S.border}`,
          borderLeft: variant === 'callout' ? `3px solid ${S.accent}` : undefined,
          borderRadius: S.r,
          padding: variant === 'callout' ? '12px 14px 12px 12px' : '12px 14px',
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
  supabase, selection, report, topic, entry, prevEntry, prevReport, readOnly, onEntrySaved, onReportSaved,
  hasPrevTopic, hasNextTopic, onPrevTopic, onNextTopic, onAddTopic,
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
  // 지난 보고 reference — 기본은 접힌 상태로 두되, 헤더에 truncate된 미리보기를
  // 같이 보여줘서 펼치지 않아도 "지난번에 뭘 썼는지"가 바로 보이게 한다(기억 의존 최소화).
  // report/topic 전환은 이 컴포넌트가 key remount되므로 매번 접힌 기본값으로 리셋된다.
  const [prevOpen, setPrevOpen] = useState(false)
  // topic 0개 empty state의 "+ 첫 주제 추가" 인라인 입력 — TopicOutline의 add 흐름과
  // 별개 로컬 상태지만 제출은 동일한 onAddTopic(page.tsx의 handleAddTopic)을 그대로 쓴다.
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicTitle, setNewTopicTitle] = useState('')

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
        {/* topic 4-field 구조를 억지로 적용하지 않되, "제목 → 설명 → 편집기"라는 동일한
            Writing Workspace 골격은 topic 섹션과 맞춘다(4-field는 그대로 topic 전용).
            CENTER pane(flex-1) 자체는 넓게 두되, 실제 읽고 쓰는 content column은
            WRITING_CONTENT_WIDTH에서 멈추고 margin-inline auto로 가운데 자리잡는다 —
            pane ≠ textarea 폭(style.ts 주석 참고). 1366/1440처럼 pane 자체가 이 값보다
            좁으면 그냥 꽉 채워지므로 no-op이다. */}
        <div style={{ maxWidth: WRITING_CONTENT_WIDTH, marginInline: 'auto' }}>
          <p className="text-[16px] font-semibold mb-1" style={{ color: S.t1 }}>{meta.no}. {meta.title}</p>
          <p className="text-[12px] mb-4" style={{ color: S.t4 }}>{meta.placeholder}</p>
          {recoveredBanner}
          <TextBox
            label=""
            value={value}
            onChange={setValue}
            minHeight={360}
            readOnly={readOnly}
            statusLabel={canonicalStatusText(activeCanonical.status)}
          />
        </div>
      </div>
    )
  }

  // ── 주제 렌더 ──────────────────────────────────────────────────────────
  // topic이 아직 없거나(보고에 주제 0개) selection이 가리키는 entry가 없는 경우
  // (예: 로드 경합, 방금 제외된 주제) — 예전에는 이 자리에서 아무것도 렌더하지 않아
  // 화면이 통째로 비어 보였다. 대신 다음 행동(주제 추가)을 안내한다.
  if (!topic || !entry) {
    if (readOnly) {
      return (
        <div className="h-full flex items-center justify-center px-6 py-5">
          <div className="text-center max-w-xs">
            <p className="text-[13px] font-medium mb-1.5" style={{ color: S.t2 }}>이 보고는 확정되었습니다.</p>
            <p className="text-[12.5px]" style={{ color: S.t4 }}>등록된 보고 주제가 없습니다.</p>
          </div>
        </div>
      )
    }
    return (
      <div className="h-full flex items-center justify-center px-6 py-5">
        <div className="text-center max-w-xs">
          <p className="text-[13px] font-medium mb-1.5" style={{ color: S.t2 }}>이번 보고에 아직 주제가 없습니다.</p>
          <p className="text-[12.5px] mb-4" style={{ color: S.t4 }}>
            보고할 첫 주제를 추가하면 이전 보고와 연결하여 계속 관리할 수 있습니다.
          </p>
          {addingTopic ? (
            <input
              autoFocus
              value={newTopicTitle}
              onChange={e => setNewTopicTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newTopicTitle.trim()) { onAddTopic(newTopicTitle.trim()); setNewTopicTitle(''); setAddingTopic(false) }
                if (e.key === 'Escape') { setAddingTopic(false); setNewTopicTitle('') }
              }}
              onBlur={() => { if (!newTopicTitle.trim()) setAddingTopic(false) }}
              placeholder="주제 이름"
              className="w-full text-[13px] px-3 py-2 rounded-lg outline-none text-center"
              style={{ background: 'rgba(var(--ink-rgb),0.06)', color: S.t1, border: `1px solid ${S.accentBorder}` }}
            />
          ) : (
            <button
              onClick={() => setAddingTopic(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold"
              style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}
            >
              <Plus size={14} /> 첫 주제 추가
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
    <div style={{ maxWidth: WRITING_CONTENT_WIDTH, marginInline: 'auto' }}>
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* NEW/업데이트됨 배지는 LEFT Outline에서만 보여준다 — 같은 정보를 여기서
            다시 강조하지 않는다(중복 제거). */}
        <p className="text-[16px] font-semibold truncate min-w-0" style={{ color: S.t1 }}>{entry.topic_title_snapshot}</p>

        {/* 순차 이동 — Outline을 열지 않고도 다음/이전 주제로 바로 넘어간다(기존 topic 순서 사용). */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onPrevTopic}
            disabled={!hasPrevTopic}
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium disabled:opacity-30 transition-colors"
            style={{ color: S.t3 }}
          >
            <ChevronLeft size={12} /> 이전 주제
          </button>
          <button
            onClick={onNextTopic}
            disabled={!hasNextTopic}
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium disabled:opacity-30 transition-colors"
            style={{ color: S.t3 }}
          >
            다음 주제 <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {recoveredBanner}

      {/* 직전 보고 — 작성의 직접적인 context이므로 CENTER 최상단, 클릭 없이도 바로
          몇 줄이 보이는 preview로 둔다("지난번 어디까지 썼는지"를 기억에 의존하지 않게).
          RIGHT의 "이 주제의 히스토리"와 역할이 다르다: 여기는 항상 바로 직전 회차 하나,
          RIGHT는 과거 전체 회차를 훑는 탐색용. 클릭해도 report_text에는 복사되지 않는다. */}
      {prevEntry && prevReport ? (
        <div className="mb-5 rounded-lg px-3.5 py-3" style={{ background: 'rgba(var(--ink-rgb),0.025)', border: `1px solid ${S.border}` }}>
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: S.t3 }}>
            직전 보고 · {fmtPeriodLabel(prevReport.period_start, prevReport.period_end)}
          </p>
          <p
            className="text-[13px] leading-[1.65] whitespace-pre-wrap"
            style={{
              color: S.t2,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: prevOpen ? undefined : 3,
              overflow: prevOpen ? 'visible' : 'hidden',
            }}
          >
            {prevEntry.report_text || '(작성된 내용 없음)'}
          </p>
          {prevEntry.report_text && (
            <button
              onClick={() => setPrevOpen(o => !o)}
              className="block ml-auto text-[11px] font-medium underline mt-1"
              style={{ color: S.t3 }}
            >
              {prevOpen ? '접기' : '펼쳐보기'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11.5px] mb-5" style={{ color: S.t4 }}>이번 보고에서 새로 추가된 주제입니다.</p>
      )}

      {/* main writing surface(이번 업데이트) → decision/request 콜아웃 → follow-up →
          (구분선 아래) 개인 메모, 순서로 명확한 위계를 준다. 4개를 같은 무게의 textarea
          더미로 늘어놓지 않는다. */}
      <div className="space-y-5">
        <TextBox
          label="이번 업데이트"
          helper="이번 기간에 새롭게 업데이트된 내용, 변화된 수치, 진행 상황을 작성합니다."
          value={reportText}
          onChange={setReportText}
          minHeight={170}
          placeholder="자유롭게 줄글로 작성합니다."
          readOnly={readOnly}
          statusLabel={canonicalStatusText(activeCanonical.status)}
          variant="primary"
        />
        <TextBox
          label="경영진 전달 포인트"
          secondaryLabel="의사결정 필요사항"
          helper="경영진에게 반드시 전달하거나 판단받아야 하는 내용을 작성합니다."
          value={execText}
          onChange={setExecText}
          minHeight={110}
          readOnly={readOnly}
          variant="callout"
        />
        {/* 향후 Feedback Loop 자리 — 경영진 전달 포인트 바로 아래가 "이 요청/결정에 대해
            지난번 경영진이 뭐라고 했는지"를 붙이기 가장 자연스러운 지점이다. 지금은 표시
            하지 않는다(work_report_feedback 테이블 없음, 이번 Phase 범위 밖). */}
        <TextBox
          label="다음 액션"
          helper="이번 보고 이후 진행할 후속 액션을 작성합니다."
          value={nextActionText}
          onChange={setNextActionText}
          minHeight={90}
          readOnly={readOnly}
        />

        <div className="pt-4" style={{ borderTop: `1px solid ${S.border}` }}>
          <button
            onClick={() => setMemoOpen(o => !o)}
            className="flex items-center gap-1 text-[11px] font-semibold mb-1.5"
            style={{ color: S.t4 }}
          >
            {memoOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            내 작업 메모 (PT 문안에는 포함되지 않음)
          </button>
          {memoOpen && (
            <TextBox
              label=""
              helper="개인용 메모입니다. 보고서에는 포함되지 않습니다."
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
    </div>
  )
})

export default ReportEditorPanel
