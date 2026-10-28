'use client'

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import { useAutosave } from '@/hooks/useAutosave'
import { useCanonicalSync, canonicalStatusText } from '@/hooks/useCanonicalSync'
import TiptapEditor from '@/components/TiptapEditor'
import { S, WRITING_CONTENT_WIDTH, POINT_LABEL, entryPointText, hasContent } from './style'
import RichText from './RichText'
import { isFixedKey, type FixedSectionKey } from './TopicOutline'
import { useHistoryPick, type HistoryItem } from './ContextPanel'

// canonical(work_reports/work_report_entries) 저장은 useCanonicalSync(src/hooks/
// useCanonicalSync.ts)로 뺐다 — (구) Topic Table View(테이블 작성, 2026-09-28 제거)도 동일한 entry를 편집했으므로
// 같은 debounce/dirty-check/재시도 semantics를 두 화면이 공유해야 "한쪽에서 저장한 값이
// 다른 쪽에 즉시 동일하게 보이는" 요구가 깨지지 않는다. flush()를 ref로 외부에 노출해
// page.tsx가 "보고 확정" 직전에 명시적으로 호출하는 구조(useImperativeHandle, 아래)는
// 그대로 유지한다 — topic/보고 전환은 key remount로 자체 unmount flush가 커버하지만,
// 확정은 remount 없이 같은 인스턴스에서 readOnly만 바뀌기 때문이다.

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
  // 이 주제의 히스토리(최신 → 과거) — 데스크톱에서 오른쪽 대조 열로 그린다(아래 showHistory).
  historyItems?: HistoryItem[]
  onOpenFullHistory?: () => void
}

// ── 직전 보고 대조 표(2026-10-19, 목업 "해석 2 수정") ──────────────────────
// 칸(이번 업데이트 / 전달 포인트 · 다음 액션 / 작업 메모)마다 작은 표를 따로 두고, 표 안은
// [고른 회차(기본 = 직전) | 이번 보고] 2열. 열 위치는 표 밖 회차 머리글 줄과 모든 표가 같은
// 너비 값을 공유해 맞춘다. 직전|이번 사이 선을 끌면 너비가 바뀌고 이 브라우저에 기억된다
// (3-x 표 열 너비와 같은 방식, 더블클릭 = 기본).
const PREV_COL_KEY = 'work-report-entry-prev-col-width'
const PREV_COL_DEFAULT = 230
const PREV_COL_MIN = 140
const PREV_COL_MAX = 560
const PREV_CLAMP_LINES = 6
const CUR_BG = 'rgba(76,127,224,0.035)'
const WIDE_QUERY = '(min-width: 1024px)' // page.tsx RIGHT 패널의 lg 기준과 같게

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

// 입력칸 높이(칸 우하단 끌기) — 새로고침하면 기본 높이로 돌아가던 문제(2026-10-21)로
// 칸 종류별로 이 브라우저에 기억한다. 고정 섹션은 summary/issues/next_steps, 주제는 update/point/memo.
const BOX_H_KEY_PREFIX = 'work-report-box-height:'

function loadBoxHeight(key: string | undefined): number | undefined {
  if (!key) return undefined
  try {
    const n = Number(window.localStorage.getItem(BOX_H_KEY_PREFIX + key))
    if (n >= 60 && n <= 4000) return n
  } catch { /* 저장소 접근 불가 — 기본값 */ }
  return undefined
}

function loadPrevColWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(PREV_COL_KEY))
    if (n >= PREV_COL_MIN && n <= PREV_COL_MAX) return n
  } catch { /* 저장소 접근 불가 — 기본값 */ }
  return PREV_COL_DEFAULT
}

// 직전 칸 — 6줄까지만 보이고 넘치면 "…더보기"로 펼친다(줄 높이가 과거 내용 때문에 터지지 않게).
function PrevCell({ value }: { value: string | undefined }) {
  const has = hasContent(value)
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || open) return
    const next = el.scrollHeight > el.clientHeight + 1
    setOverflow(prev => (prev === next ? prev : next))
  }, [value, open])
  return (
    <div className="min-w-0 px-3 py-3" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
      <RichText
        ref={textRef}
        value={value === undefined ? '' : has ? value! : '—'}
        maxLines={open ? undefined : PREV_CLAMP_LINES}
        style={{ fontSize: 12.5, lineHeight: 1.65, color: has ? S.t2 : S.t4 }}
      />
      {(overflow || open) && (
        <button onClick={() => setOpen(o => !o)} className="text-[11px] font-medium mt-1" style={{ color: S.accentText }}>
          {open ? '접기' : '…더보기'}
        </button>
      )}
    </div>
  )
}

// variant는 4개 필드를 "하나의 균일한 form"이 아니라 명확한 위계로 보이게 하기 위한
// 최소한의 시각적 구분이다 — 새 카드 박스를 늘리는 대신 label 무게와 테두리 강조 정도만 바꾼다.
//   primary : "이번 업데이트" — writing workspace의 main surface
//   callout : "전달 포인트 · 다음 액션" — 그대로 보고에 옮겨지는 decision/request 문구라 좌측 accent bar로 구분
//   default : 그 외(내 작업 메모, 고정 섹션)
//   cell    : 2번 주제 대조 표의 이번 칸 — 표 칸이 테두리·배경을 맡으므로 textarea는 맨몸으로 칸을 채운다
type TextBoxVariant = 'primary' | 'callout' | 'default' | 'cell'

export function TextBox({
  label, secondaryLabel, helper, value, onChange, minHeight, placeholder, readOnly, statusLabel, variant = 'default', fill = false, heightKey, enableVoice = false,
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
  // 부모(grid row) 높이를 채운다 — 대조 열과 높이를 맞출 때.
  fill?: boolean
  // 지정하면 사용자가 끌어서 바꾼 높이를 이 키로 기억해 다음에도 그 높이로 연다
  heightKey?: string
  // 경영진 의견 줄 표시(Alt+3/4) — 수시보고에서만 켠다(의사결정 탭이 모으는 출처)
  enableVoice?: boolean
}) {
  const [savedHeight] = useState(() => loadBoxHeight(heightKey))
  // 내용이나 옆 칸 때문에 바뀐 높이는 저장하지 않도록, 사용자가 누르고 뗀 사이에 바뀐 경우만 저장한다
  function trackResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!heightKey) return
    const el = e.currentTarget
    const before = el.offsetHeight
    window.addEventListener('pointerup', () => {
      const after = el.offsetHeight
      if (after === before) return
      try { window.localStorage.setItem(BOX_H_KEY_PREFIX + heightKey, String(after)) } catch { /* 무시 */ }
    }, { once: true })
  }
  // 글 아래 빈 여백을 눌러도 입력이 시작되게 — 편집기 높이는 내용만큼이라, 칸을 끌어 늘린
  // 아래쪽은 편집기 밖이다. 마지막 줄 끝으로 커서를 놓는다(우하단 끌기 손잡이 동작은 막지 않음).
  function focusEnd(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const pm = e.currentTarget.querySelector<HTMLElement>('.ProseMirror')
    if (!pm) return
    setTimeout(() => {
      pm.focus()
      const range = document.createRange()
      range.selectNodeContents(pm)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }, 0)
  }
  const boxStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: savedHeight ?? (fill ? '100%' : undefined),
    minHeight,
    // callout은 예전에 accentDim(0.15) 배경 전체를 채워 "파란 박스"처럼 튀었다 —
    // 왼쪽 accent bar 하나로도 이번 업데이트/다음 액션과는 다른 성격(결정/요청)임이
    // 충분히 구분되므로 배경은 아주 옅은 tint로만 남긴다.
    background: variant === 'cell' ? 'transparent' : variant === 'callout' ? 'rgba(76,127,224,0.05)' : 'rgba(var(--ink-rgb),0.03)',
    border: variant === 'cell' ? 'none' : variant === 'primary' ? `1px solid ${S.borderStrong}` : `1px solid ${S.border}`,
    borderLeft: variant === 'callout' ? `3px solid ${S.accent}` : undefined,
    borderRadius: variant === 'cell' ? 0 : S.r,
    // 편집기 자체가 위아래 8px 여백을 가지므로 칸 여백은 그만큼 줄인다(예전 textarea 12px과 같은 글 위치)
    padding: variant === 'callout' ? '4px 14px 4px 12px' : '4px 14px',
    color: S.t1,
    fontSize: 13.5,
    lineHeight: 1.7,
  }
  return (
    <div style={fill ? { height: '100%' } : undefined}>
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
      {/* 서식 편집기(2026-10-22) — 다른 화면과 같은 마크다운 입력(- · 1. · # · ** · "> " 토글)·
          Alt+1 빨강/Alt+2 형광. 툴바는 숨긴다(2번 대조 표 칸이 좁아 칸마다 붙으면 지저분함).
          확정 보고(readOnly)는 편집기 대신 읽기 표시. 바깥에서 값을 바꾸려면 key로 다시 띄운다
          (편집기는 처음 값만 읽음 — 임시본 적용 참고). */}
      {readOnly ? (
        <div className="wr-rich" style={{ ...boxStyle, height: undefined, padding: variant === 'callout' ? '12px 14px 12px 12px' : '12px 14px' }}>
          <RichText value={value} style={{ fontSize: 13.5, lineHeight: 1.7, color: S.t1 }} />
        </div>
      ) : (
        <div
          className="wr-rich"
          onPointerDown={trackResize}
          onMouseDown={focusEnd}
          style={{ ...boxStyle, resize: 'vertical', overflow: 'auto', cursor: 'text' }}
        >
          {placeholder && !hasContent(value) && (
            <span className="absolute pointer-events-none select-none" style={{ top: 12, left: variant === 'callout' ? 12 : 14, color: S.t4 }}>
              {placeholder}
            </span>
          )}
          <TiptapEditor value={value} onChange={onChange} dark hideToolbar enableToggle enableVoice={enableVoice} minHeight={Math.max(40, minHeight - 24)} />
        </div>
      )}
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
  hasPrevTopic, hasNextTopic, onPrevTopic, onNextTopic, onAddTopic, historyItems, onOpenFullHistory,
}, ref) {
  const historyPick = useHistoryPick(historyItems ?? [])
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => true)
  const [prevColW, setPrevColW] = useState(loadPrevColWidth)
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
  // 전달 포인트 · 다음 액션은 한 칸(executive_point) — 합치기 전 next_action은 이어 붙여 시작하고,
  // 저장할 때 next_action을 비운다(style.ts entryPointText). 입력 전에는 저장하지 않는다(dirty-check).
  const [execText, setExecText] = useState(entry ? entryPointText(entry) : '')
  const [memoText, setMemoText] = useState(entry?.working_memo ?? '')
  const [memoOpen, setMemoOpen] = useState(false)
  const prev = !!(prevEntry && prevReport)
  // topic 0개 empty state의 "+ 첫 주제 추가" 인라인 입력 — TopicOutline의 add 흐름과
  // 별개 로컬 상태지만 제출은 동일한 onAddTopic(page.tsx의 handleAddTopic)을 그대로 쓴다.
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicTitle, setNewTopicTitle] = useState('')

  const entryDraft: EntryDraft | null = useMemo(() => entry ? {
    report_text: reportText, executive_point: execText, next_action: '', working_memo: memoText,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  } : null, [entry?.id, reportText, execText, memoText])

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

  // 임시본 적용 시 편집기를 다시 띄우는 번호 — 편집기는 처음 값만 읽으므로 state만 바꾸면 화면이 그대로다
  const [recoverSeq, setRecoverSeq] = useState(0)

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
      setExecText(entryPointText({ executive_point: v.executive_point ?? '', next_action: v.next_action ?? '' }))
      setMemoText(v.working_memo ?? '')
    }
    setRecoverSeq(n => n + 1)
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
      <div className="h-full overflow-y-auto px-8 py-5">
        {/* topic 4-field 구조를 억지로 적용하지 않되, "제목 → 설명 → 편집기"라는 동일한
            Writing Workspace 골격은 topic 섹션과 맞춘다(4-field는 그대로 topic 전용).
            CENTER pane(flex-1) 자체는 넓게 두되, 실제 읽고 쓰는 content column은
            WRITING_CONTENT_WIDTH에서 멈춘다 — pane ≠ textarea 폭(style.ts 주석 참고).
            LEFT 바로 다음(이 컨테이너의 px-8=32px)에서 시작하는 좌측 정렬이다 — auto
            margin으로 가운데 띄우지 않는다. 남는 가변폭은 content 오른쪽, RIGHT 이전의
            여백으로만 쌓인다. 1366/1440처럼 pane 자체가 이 값보다 좁으면 그냥 꽉
            채워지므로 no-op이다. */}
        <div style={{ maxWidth: WRITING_CONTENT_WIDTH }}>
          <p className="text-[16px] font-semibold mb-1" style={{ color: S.t1 }}>{meta.no}. {meta.title}</p>
          <p className="text-[12px] mb-4" style={{ color: S.t4 }}>{meta.placeholder}</p>
          {recoveredBanner}
          <TextBox
            key={`${selection}:${recoverSeq}`}
            heightKey={selection}
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

  // ── 직전 보고 대조 표 ─────────────────────────────────────────────────
  // 데스크톱(lg 이상)이고 이 주제의 히스토리가 있을 때만 왼쪽 비교 열을 그린다. 좁은 화면은
  // 이번 열만(기존 "컨텍스트" 서랍으로 히스토리 확인).
  const hItem = historyPick.item
  const showPrev = wide && !!hItem
  const hValue = (i: number) => hItem?.fields?.[i]?.value
  const isJustBefore = !!historyPick.asc[historyPick.index + 1]?.isCurrent
  const curDateLabel = historyItems?.find(i => i.isCurrent)?.dateLabel
  const cols = showPrev ? `${prevColW}px minmax(0, 1fr)` : 'minmax(0, 1fr)'

  function startPrevColResize(e: React.PointerEvent) {
    e.preventDefault()
    const sx = e.clientX
    const start = prevColW
    let latest = start
    function onMove(ev: PointerEvent) {
      latest = Math.max(PREV_COL_MIN, Math.min(PREV_COL_MAX, Math.round(start + ev.clientX - sx)))
      setPrevColW(latest)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try { window.localStorage.setItem(PREV_COL_KEY, String(latest)) } catch { /* 무시 */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  function resetPrevColW() {
    setPrevColW(PREV_COL_DEFAULT)
    try { window.localStorage.setItem(PREV_COL_KEY, String(PREV_COL_DEFAULT)) } catch { /* 무시 */ }
  }

  // 칸 하나 = 표 하나: 라벨 줄 + [비교 회차 | 이번] 본문. 사이 선은 평범한 1px — 마우스를 올리면
  // col-resize 커서와 옅은 강조만 보인다(3-x 표 머리글 경계와 같은 모양).
  const fieldTable = (
    key: string, title: React.ReactNode, helper: string, prevValue: string | undefined, current: React.ReactNode,
  ) => (
    <section key={key} className="rounded-[10px] overflow-hidden" style={{ border: `1px solid ${S.border}` }}>
      <div className="flex items-baseline gap-2 px-3.5 py-[7px]" style={{ background: S.panel, borderBottom: `1px solid ${S.border}` }}>
        {title}
        <span className="text-[10.5px]" style={{ color: S.t4 }}>{helper}</span>
      </div>
      <div className="grid relative" style={{ gridTemplateColumns: cols }}>
        {showPrev && <PrevCell value={prevValue} />}
        <div className="min-w-0" style={{ background: CUR_BG, borderLeft: showPrev ? `1px solid ${S.border}` : undefined }}>
          {current}
        </div>
        {showPrev && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="비교 열 너비 조절"
            title="드래그: 너비 조절 · 더블클릭: 기본 너비"
            onPointerDown={startPrevColResize}
            onDoubleClick={resetPrevColW}
            className="absolute top-0 bottom-0 hover:bg-[rgba(76,127,224,0.45)]"
            style={{ left: prevColW - 3, width: 7, cursor: 'col-resize', zIndex: 2 }}
          />
        )}
      </div>
    </section>
  )

  return (
    <div className="h-full overflow-y-auto px-8 py-5">
    <div style={{ maxWidth: WRITING_CONTENT_WIDTH + (showPrev ? prevColW : 0) }}>
      <div className="flex items-center justify-between gap-2 mb-3">
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

      {/* 회차 머리글 — 표 밖 한 줄, 아래 표들과 같은 열 너비. */}
      <div className="grid mb-2.5" style={{ gridTemplateColumns: cols }}>
        {showPrev && hItem && (
          <div className="flex items-center gap-1 px-2 min-w-0">
            <button
              onClick={() => historyPick.go(-1)}
              disabled={historyPick.index <= 0}
              title="이전 회차"
              className="p-0.5 rounded disabled:opacity-25 hover:bg-[rgba(var(--ink-rgb),0.06)]"
            >
              <ChevronLeft size={13} style={{ color: S.t2 }} />
            </button>
            <span className="text-[11.5px] font-semibold truncate" style={{ color: hItem.isCurrent ? S.accentText : S.t2 }} title={hItem.label}>
              {hItem.dateLabel.slice(5)} 보고
            </span>
            {isJustBefore && <span className="text-[10.5px] flex-shrink-0" style={{ color: S.t4 }}>직전</span>}
            {hItem.isCurrent && <span className="text-[10.5px] flex-shrink-0" style={{ color: S.t4 }}>현재</span>}
            <button
              onClick={() => historyPick.go(1)}
              disabled={historyPick.index >= historyPick.asc.length - 1}
              title="다음 회차"
              className="p-0.5 rounded disabled:opacity-25 hover:bg-[rgba(var(--ink-rgb),0.06)]"
            >
              <ChevronRight size={13} style={{ color: S.t2 }} />
            </button>
            {onOpenFullHistory && (
              <button onClick={onOpenFullHistory} className="ml-auto text-[10.5px] underline underline-offset-2 flex-shrink-0" style={{ color: S.t4 }}>
                전체
              </button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-3.5">
          <span className="text-[11.5px] font-bold" style={{ color: S.accentText }}>
            {curDateLabel ? `${curDateLabel.slice(5)} 이번 보고` : '이번 보고'}
          </span>
          <span className="text-[10.5px]" style={{ color: S.t4 }}>{canonicalStatusText(activeCanonical.status)}</span>
        </div>
      </div>

      {!prev && !showPrev && (
        <p className="text-[11.5px] mb-2.5" style={{ color: S.t4 }}>이번 보고에서 새로 추가된 주제입니다.</p>
      )}

      <div className="space-y-3.5">
        {fieldTable(
          'update',
          <span className="text-[12px] font-bold" style={{ color: S.t1 }}>이번 업데이트</span>,
          '진행 상황 · 변화된 수치',
          hValue(0),
          <TextBox label="" value={reportText} onChange={setReportText} minHeight={360} heightKey="update" key={`update:${recoverSeq}`}
            placeholder="자유롭게 줄글로 작성합니다." readOnly={readOnly} variant="cell" fill />,
        )}
        {fieldTable(
          'point',
          <span className="text-[12px] font-bold" style={{ color: S.t1 }}>{POINT_LABEL}</span>,
          '경영진 판단 요청 · 다음 보고까지 할 일',
          hValue(1),
          <TextBox label="" value={execText} onChange={setExecText} minHeight={240} heightKey="point" key={`point:${recoverSeq}`}
            placeholder="경영진 전달·판단 요청, 다음 액션을 적습니다." readOnly={readOnly} variant="cell" fill />,
        )}

        {memoOpen ? fieldTable(
          'memo',
          <button onClick={() => setMemoOpen(false)} className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: S.t2 }}>
            <ChevronDown size={12} /> 작업 메모
          </button>,
          '보고서에 포함되지 않음',
          hValue(2),
          <TextBox label="" value={memoText} onChange={setMemoText} minHeight={240} heightKey="memo" key={`memo:${recoverSeq}`}
            placeholder="CFO 미팅, 지급률 재계산 등 기억용 raw note" readOnly={readOnly} variant="cell" fill />,
        ) : (
          <section className="rounded-[10px] overflow-hidden" style={{ border: `1px solid ${S.border}` }}>
            <button
              onClick={() => setMemoOpen(true)}
              className="w-full flex items-baseline gap-2 px-3.5 py-[7px] text-left"
              style={{ background: S.panel }}
            >
              <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: S.t2 }}>
                <ChevronRight size={12} /> 작업 메모
              </span>
              <span className="text-[10.5px]" style={{ color: S.t4 }}>보고서에 포함되지 않음 · 접힘</span>
            </button>
          </section>
        )}
      </div>
    </div>
    </div>
  )
})

export default ReportEditorPanel
