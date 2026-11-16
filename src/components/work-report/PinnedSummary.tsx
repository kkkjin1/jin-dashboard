'use client'

import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FileText, Sparkles } from 'lucide-react'
import type { WorkReport } from '@/types'
import { useAutosave } from '@/hooks/useAutosave'
import { useCanonicalSync, canonicalStatusText } from '@/hooks/useCanonicalSync'
import { S, WRITING_CONTENT_WIDTH } from './style'
import { TextBox, PrevCell, useSharedPrevColW } from './ReportEditorPanel'
import { usePublishLiveDraft } from './liveDraft'
import { SectionTitle, GlassEdge, GLASS_SHADOW, SECTION_BAR_BG, SECTION_BORDER } from './SectionTitle'

// ── 상단 고정 핵심 요약(2026-11-16) ─────────────────────────────────────
// 왼쪽 열 = 직전 보고의 "다음 단계"(지난번에 하겠다고 한 것 → 이번 요약의 출발점).
// 2번 주요 내용 · 3번 운영/의사결정을 쓰는 동안에도 핵심 요약이 화면 위에 계속 보이도록
// 편집 화면 위에 붙박이로 둔다. page.tsx가 key={report.id}로만 띄우므로 목차를 옮겨도
// 다시 마운트되지 않는다(입력 중 커서·내용 유지).
// 저장은 summary 한 칸만 — ReportEditorPanel(이슈/다음 단계)은 summary를 빼고 저장하므로
// 두 화면이 같은 행의 서로 다른 칸만 update해 서로 덮어쓰지 않는다.

interface Props {
  supabase: SupabaseClient
  report: WorkReport
  prevReport: WorkReport | null
  readOnly: boolean
  onReportSaved: (report: WorkReport) => void
  // 아래 칸이 3-x 표일 때는 그 표 최대 폭(1200)에 오른쪽 끝을 맞춘다. 없으면 2번 대조 표 폭.
  maxWidth?: number
  // 이번 보고 칸만(직전 다음 단계 열 숨김) — 노트북에서 미리보기를 옆에 붙일 때 폭 확보
  hidePrev?: boolean
  // 미리보기가 닫혀 있을 때 — 제목행 오른쪽 끝에 '완성본 미리보기' 여는 버튼
  onOpenPreview?: () => void
  // 2번 주요 내용 화면 — 편집 칸 높이의 35%를 차지하고 칸이 그만큼 늘어난다(요약 35 : 안건 65, 2026-11-16)
  fillHeight?: boolean
}

// 상단 칸 최대 높이 — 넘치면 칸 안에서 스크롤(아래 편집 칸 + 한 화면 맞춤을 위해)
const SUMMARY_MAX_H = 130

export type PinnedSummaryHandle = {
  flushPending: () => Promise<void>
  focus: () => void
}

const WIDE_QUERY = '(min-width: 1024px)'
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

const PinnedSummary = forwardRef<PinnedSummaryHandle, Props>(function PinnedSummary({
  supabase, report, prevReport, readOnly, onReportSaved, maxWidth, hidePrev = false, onOpenPreview, fillHeight = false,
}, ref) {
  const [summaryText, setSummaryText] = useState(report.summary)
  const [recoverSeq, setRecoverSeq] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => true)

  const prevColW = useSharedPrevColW()
  const draft = useMemo(() => ({ summary: summaryText }), [summaryText])

  usePublishLiveDraft(readOnly ? null : `report:${report.id}`, draft)

  const canonical = useCanonicalSync<{ summary: string }>({
    supabase,
    table: 'work_reports',
    id: report.id,
    draft,
    readOnly,
    onSaved: row => onReportSaved(row as WorkReport),
  })

  const autosave = useAutosave({
    supabase,
    enabled: !readOnly,
    entityType: 'work_report',
    entityId: report.id,
    fieldKey: 'summary',
    value: draft,
  })

  useImperativeHandle(ref, () => ({
    flushPending: () => canonical.flush(),
    focus: () => {
      const pm = boxRef.current?.querySelector<HTMLElement>('.ProseMirror')
      boxRef.current?.scrollIntoView({ block: 'nearest' })
      pm?.focus()
    },
  }), [canonical])

  function applyRecovered() {
    const v = autosave.recovered?.value as { summary?: string } | undefined
    if (!v) return
    setSummaryText(v.summary ?? '')
    setRecoverSeq(n => n + 1)
    autosave.discardRecovered()
  }

  const showPrev = wide && !!prevReport && !hidePrev
  const cols = showPrev ? `${prevColW}px minmax(0, 1fr)` : 'minmax(0, 1fr)'

  return (
    <div
      className={`px-8 pt-4 pb-3 ${fillHeight ? 'flex flex-col min-h-0' : 'flex-shrink-0'}`}
      style={{ borderBottom: `1px solid ${S.border}`, ...(fillHeight ? { flex: '0 0 35%' } : null) }}
      ref={boxRef}
    >
    {/* 아래 2번 주제 대조 표와 같은 폭·같은 왼쪽 열 너비 — 두 표의 세로선이 맞게 */}
    <div className={fillHeight ? 'flex flex-col flex-1 min-h-0' : undefined} style={{ maxWidth: `var(--wr-max, ${maxWidth ?? WRITING_CONTENT_WIDTH + (showPrev ? prevColW : 0)}px)` }}>
      <SectionTitle
        compact
        no={<Sparkles size={13} />}
        title="핵심 요약"
        sub="상단 고정"
        right={onOpenPreview && (
          <button
            onClick={onOpenPreview}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold transition-opacity hover:opacity-80"
            style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}
          >
            <FileText size={12} /> 완성본 미리보기
          </button>
        )}
      />

      {autosave.recovered && !readOnly && (
        <div
          className="flex items-center justify-between px-3 py-1.5 rounded-lg mb-2 text-[12px]"
          style={{ background: 'rgba(245,194,71,0.1)', border: '1px solid rgba(245,194,71,0.28)', color: '#F5C247' }}
        >
          <span>저장되지 않은 핵심 요약 임시본이 있습니다.</span>
          <div className="flex items-center gap-2">
            <button onClick={applyRecovered} className="underline">적용</button>
            <button onClick={() => autosave.discardRecovered()} className="underline opacity-70">무시</button>
          </div>
        </div>
      )}

      <section className={`relative rounded-xl overflow-hidden ${fillHeight ? 'flex flex-col flex-1 min-h-0' : ''}`} style={{ boxShadow: GLASS_SHADOW }}>
        {/* 머리 바 — 아래 안건 '이번 업데이트' 바와 같은 모양: [직전 보고 · 다음 단계 | 이번 요약 · 날짜 · 저장 상태] */}
        <div className="grid" style={{ gridTemplateColumns: cols, background: SECTION_BAR_BG, borderBottom: `1px solid ${SECTION_BORDER}` }}>
          {showPrev && (
            <div className="flex items-center gap-1.5 px-3 py-2.5 min-w-0">
              <span className="text-[12px] font-bold truncate" style={{ color: S.t2 }}>{prevReport!.report_date?.slice(5).replace('-', '.') ?? ''} 보고</span>
              <span className="text-[10.5px] flex-shrink-0" style={{ color: S.t3 }}>다음 단계</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2.5 min-w-0" style={{ borderLeft: showPrev ? `1px solid ${SECTION_BORDER}` : undefined }}>
            <span className="text-[13px] font-bold flex-shrink-0" style={{ color: S.t1 }}>이번 요약</span>
            <span className="text-[11px] font-bold px-2 py-[2px] rounded-full flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.55)', color: S.accentText, border: `1px solid ${S.accentBorder}` }}>
              {report.report_date ? `${report.report_date.slice(5).replace('-', '.')} 이번 보고` : '이번 보고'}
            </span>
            <span className="text-[11px] truncate min-w-0" style={{ color: S.t3 }}>핵심 3~5줄</span>
            <span className="ml-auto text-[10.5px] flex-shrink-0" style={{ color: S.t3 }}>{canonicalStatusText(canonical.status)}</span>
          </div>
        </div>
        <div className={`grid ${fillHeight ? 'flex-1 min-h-0' : ''}`} style={{ gridTemplateColumns: cols, ...(fillHeight ? { gridTemplateRows: 'minmax(0, 1fr)' } : null) }}>
          {showPrev && (
            <div className="min-w-0 scrollbar-none" style={{ maxHeight: fillHeight ? undefined : SUMMARY_MAX_H, overflowY: 'auto' }}>
              <PrevCell value={prevReport!.next_steps} />
            </div>
          )}
          <div className="min-w-0" style={{ ...(fillHeight ? { height: '100%' } : null), background: 'rgba(76,127,224,0.035)', borderLeft: showPrev ? `1px solid ${S.border}` : undefined }}>
            <TextBox
              key={`pinned-summary:${recoverSeq}`}
              label=""
              value={summaryText}
              onChange={setSummaryText}
              minHeight={60}
              maxHeight={fillHeight ? undefined : SUMMARY_MAX_H}
              // 비율 모드에선 끌어서 정한 높이를 쓰지 않는다(35% 고정)
              heightKey={fillHeight ? undefined : 'pinned-summary'}
              fill={fillHeight}
              placeholder="이번 보고의 핵심을 3~5줄로 요약합니다."
              readOnly={readOnly}
              variant="cell"
            />
          </div>
        </div>
        <GlassEdge />
      </section>
    </div>
    </div>
  )
})

export default PinnedSummary
