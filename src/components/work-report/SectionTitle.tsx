'use client'

import type { ReactNode } from 'react'
import { CATEGORY_PALETTE } from '@/lib/categoryColors'
import { S } from './style'

// ── 업무보고 제목행·칸 머리 공통 서식(2026-11-16, 프로젝트 탭 범주 머리 참고) ──────────
// 제목행: 번호 배지(1 · 2.2 · 3-1 · 4) + 큰 제목 + 아래 굵은 선 — 상단 고정 핵심 요약과
// 아래 편집 칸 제목이 같은 층위로 읽히게 한다.
// 칸 머리(이번 업데이트 등): 프로젝트 탭 범주 머리처럼 블루그레이 바탕 바.

export const SECTION_BAR_BG = CATEGORY_PALETTE.blue.bg

// 운영 · 이슈 · 의사결정 · 다음 단계 이름표(2026-11-16) — 3-1/3-2/3-3/4 번호 대신 성격을 색 칩으로.
// 목차·제목행·미리보기가 같은 칩을 쓴다. 마크다운 복사(PPT용)·아카이브는 기존 번호 그대로.
export type KindKey = 'operation' | 'issue' | 'decision' | 'next'
export const KIND_CHIP: Record<KindKey, { label: string; bg: string; color: string; border: string }> = {
  operation: { label: '운영', bg: 'rgba(100,116,139,0.14)', color: '#5B6B82', border: 'rgba(100,116,139,0.30)' },
  issue:     { label: '이슈', bg: 'rgba(224,165,107,0.18)', color: '#B7742A', border: 'rgba(224,165,107,0.40)' },
  decision:  { label: '결정', bg: 'rgba(95,191,163,0.18)',  color: '#2F8F74', border: 'rgba(95,191,163,0.40)' },
  next:      { label: '다음', bg: 'rgba(var(--ink-rgb),0.07)', color: 'rgba(var(--text-rgb),0.6)', border: 'rgba(var(--ink-rgb),0.14)' },
}

export function KindChip({ kind, size = 'md' }: { kind: KindKey; size?: 'sm' | 'md' }) {
  const c = KIND_CHIP[kind]
  return (
    <span
      className={`inline-flex items-center justify-center font-bold rounded-md flex-shrink-0 ${size === 'sm' ? 'text-[10px] px-1.5 min-h-[17px]' : 'text-[12px] px-2 min-h-[22px]'}`}
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      {c.label}
    </span>
  )
}
export const SECTION_BORDER = 'rgba(var(--ink-rgb),0.10)'

// ── 유리 칸(2026-11-16, 홈 탭 '오늘' 열 유리 테두리와 같은 결) ─────────────────
// 칸(section)에 relative + GLASS_SHADOW를 주고, 마지막 자식으로 <GlassEdge />를 넣는다.
// 테두리는 GlassEdge(얇은 그라데이션 선, 마스크)가 그리므로 칸 자체 border는 뺀다. 클릭은 통과.
export const GLASS_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(var(--ink-rgb),0.06), 0 10px 24px -14px rgba(var(--accent-tint-rgb),0.38)'

export function GlassEdge() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit', padding: 1, pointerEvents: 'none', zIndex: 3,
        background: 'linear-gradient(165deg, rgba(var(--accent-tint-rgb),0.45) 0%, rgba(var(--accent-tint-rgb),0.5) 30%, rgba(var(--accent-tint-rgb),0.18) 70%, rgba(255,255,255,0.55) 100%)',
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        WebkitMaskComposite: 'xor',
        mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
      }}
    />
  )
}

export function SectionTitle({ no, badge, title, sub, right, compact }: {
  no?: ReactNode
  // 지정하면 기본 번호 배지 대신 이것을 그린다(운영·이슈·결정 칩)
  badge?: ReactNode
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2.5 ${compact ? 'mb-2 pb-1.5' : 'mb-3.5 pb-2'}`}
      style={{ borderBottom: `2px solid ${SECTION_BORDER}` }}
    >
      {badge ?? (
        <span
          className="flex items-center text-[12px] font-bold px-2 py-[1px] min-h-[22px] rounded-md flex-shrink-0 tabular-nums"
          style={{ background: S.accentDim, color: S.accentText, border: `1px solid ${S.accentBorder}` }}
        >
          {no}
        </span>
      )}
      <span className="text-[16px] font-bold truncate min-w-0" style={{ color: S.t1 }}>{title}</span>
      {sub && <span className="text-[11px] flex-shrink-0" style={{ color: S.t4 }}>{sub}</span>}
      {right && <div className="ml-auto flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  )
}

// 칸 머리 바 — 제목(굵게) + 설명(옅게) + 오른쪽 부가 정보
// noBorder: 바 아래에 본문이 없을 때(접힌 작업 메모) 아래 선을 뺀다.
export function SectionBar({ title, helper, right, noBorder }: { title: ReactNode; helper?: ReactNode; right?: ReactNode; noBorder?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: SECTION_BAR_BG, borderBottom: noBorder ? undefined : `1px solid ${SECTION_BORDER}` }}>
      <span className="text-[13px] font-bold" style={{ color: S.t1 }}>{title}</span>
      {helper && <span className="text-[11px]" style={{ color: S.t3 }}>{helper}</span>}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  )
}
