'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, X } from 'lucide-react'
import type { WorkReport, WorkReportEntry, WorkReportItem, WorkReportTopic } from '@/types'
import { S, fmtPeriodLabel } from './style'
import ReportDocument from './ReportDocument'
import { useLiveDrafts } from './liveDraft'
import { SECTION_BORDER } from './SectionTitle'

// ── 완성본 실시간 미리보기(2026-11-16) ─────────────────────────────────
// 작성 화면 오른쪽 여백에 이번 보고 전체(1~4번)를 최종 문서 형태로 보여준다. 내용은
// 저장된 state 위에 입력 중 값(liveDraft)을 덮어 그리므로 타이핑이 바로 반영된다(3-x 표는
// 저장 시점에 반영). 지금 쓰는 칸은 옅은 노랑으로 강조하고 그 위치로 스크롤한다.

const FIT_MIN = 0.6

interface Props {
  report: WorkReport
  rows: { entry: WorkReportEntry; topic: WorkReportTopic }[]
  items: WorkReportItem[]
  activeKey: string
  onClose: () => void
  // false면 한 화면 맞춤 축소를 끄고 원래 크기로 + 스크롤(노트북 좁은 칸에서 글자가 너무 작아지지 않게)
  fitToPage?: boolean
}

export default function ReportLivePreview({ report, rows, items, activeKey, onClose, fitToPage = true }: Props) {
  const live = useLiveDrafts()
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  // 한 화면 맞춤 — 종이 전체가 미리보기 높이에 들어오게 줄인다(최소 FIT_MIN, 그보다 길면 스크롤).
  // 내용·창 크기가 바뀔 때마다 다시 잰다. 실제 높이 = 원래 높이 × 배율이므로 원래 높이는 나눠서 구한다.
  const [fit, setFit] = useState(1)
  const fitRef = useRef(1)
  useEffect(() => {
    const box = scrollRef.current
    const card = cardRef.current
    if (!box || !card) return
    const measure = () => {
      const pad = parseFloat(getComputedStyle(box).paddingTop) + parseFloat(getComputedStyle(box).paddingBottom)
      const avail = box.clientHeight - pad
      const natural = card.getBoundingClientRect().height / fitRef.current
      if (!natural || avail <= 0) return
      const next = Math.max(FIT_MIN, Math.min(1, Math.floor((avail / natural) * 1000) / 1000))
      if (Math.abs(next - fitRef.current) < 0.004) return
      fitRef.current = next
      setFit(next)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(card)
    return () => ro.disconnect()
  }, [])

  const liveReport = useMemo(() => {
    const d = live.get(`report:${report.id}`)
    return d ? { ...report, ...d } as WorkReport : report
  }, [live, report])

  const liveRows = useMemo(() => rows.map(r => {
    const d = live.get(`entry:${r.entry.id}`)
    return d ? { ...r, entry: { ...r.entry, ...d } as WorkReportEntry } : r
  }), [live, rows])

  // 목차를 옮기면 그 칸이 보이게 스크롤(미리보기 상자 안에서만 — 페이지 전체는 움직이지 않음)
  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    const el = box.querySelector<HTMLElement>(`[data-sec="${CSS.escape(activeKey)}"]`)
    if (!el) return
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [activeKey])

  // 디자인: 목차·본문과 같은 옅은 회색 판. 머리는 왼쪽 "1 핵심 요약" 제목행과 같은 높이·같은
  // 밑줄형(배지 + 큰 제목 + 아래 굵은 선, SectionTitle compact와 같은 치수).
  return (
    <div className="h-full flex flex-col min-w-0" style={{ background: 'rgba(var(--ink-rgb),0.015)' }}>
      <div className="flex-shrink-0 px-5 pt-4">
        <div className="flex items-center gap-2.5 pb-1.5" style={{ borderBottom: `2px solid ${SECTION_BORDER}` }}>
          <span className="flex items-center px-1.5 py-[3px] rounded-md flex-shrink-0"
            style={{ background: S.accentDim, color: S.accentText, border: `1px solid ${S.accentBorder}` }}>
            <FileText size={13} />
          </span>
          <span className="text-[16px] font-bold flex-shrink-0" style={{ color: S.t1 }}>완성본 미리보기</span>
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[1px] rounded-full flex-shrink-0"
            style={{ background: 'rgba(52,168,83,0.12)', color: '#2F9E5B' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#34A853' }} /> 실시간
          </span>
          <span className="text-[11px] truncate min-w-0" style={{ color: S.t4 }}>노란 칸 = 지금 쓰는 곳</span>
          <button onClick={onClose} title="미리보기 닫기" className="ml-auto p-1 rounded hover:bg-[rgba(var(--ink-rgb),0.08)] flex-shrink-0">
            <X size={13} style={{ color: S.t3 }} />
          </button>
        </div>
      </div>
      {/* 목차·본문과 같은 회색 판 위에 문서를 바로 그린다(별도 흰 종이 없음) — 안쪽 내용만 한 화면 맞춤 배율 */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-none px-5 pt-4 pb-5"
      >
        <div ref={cardRef} style={{ zoom: fitToPage ? fit : 1 }}>
          {/* 문서 머리 — 보고 제목 + 기간·보고일 + 진한 구분선 */}
          <div className="mb-5 pb-3" style={{ borderBottom: `2px solid ${S.t1}` }}>
            <p className="text-[10.5px] font-semibold tracking-wider mb-1" style={{ color: S.accentText }}>인사기획팀 업무보고</p>
            <p className="text-[17px] font-bold leading-tight" style={{ color: S.t1 }}>{fmtPeriodLabel(report.period_start, report.period_end)}</p>
            {report.report_date && <p className="text-[11px] mt-1" style={{ color: S.t4 }}>{report.report_date} 보고</p>}
          </div>
          <div style={{ zoom: fitToPage ? 0.92 : 1 }}>
            <ReportDocument report={liveReport} rows={liveRows} items={items} activeKey={activeKey} />
          </div>
        </div>
      </div>
    </div>
  )
}
