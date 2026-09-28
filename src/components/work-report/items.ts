import type { WorkReportItem, WorkReportItemSection } from '@/types'
import { hasContent } from './style'

// 3. 주요 이슈 / 의사결정 → 3-1 운영사항 / 3-2 이슈사항 / 3-3 의사결정사항 (2026-09-28).
// 예전에는 work_reports.issues 텍스트 한 칸이었는데, 회차마다 같은 운영·이슈·결정 항목을
// 다시 쓰게 되어 "표(항목 행) + 행별 세부내용"으로 나누고, 새 보고 생성 시 직전 항목을
// 자동 이월(같은 lineage_id)한 뒤 필요 없는 것만 삭제하는 방식으로 바꿨다. 기존 issues
// 텍스트는 지우지 않고 "(이전 형식)"으로 읽기 전용 표시만 한다.

export const ITEM_SECTIONS: readonly WorkReportItemSection[] = ['operation', 'issue', 'decision']

const SELECTION_PREFIX = 'items:'

export function itemSelectionKey(section: WorkReportItemSection): string {
  return `${SELECTION_PREFIX}${section}`
}

export function parseItemSelection(selection: string): WorkReportItemSection | null {
  if (!selection.startsWith(SELECTION_PREFIX)) return null
  const s = selection.slice(SELECTION_PREFIX.length) as WorkReportItemSection
  return ITEM_SECTIONS.includes(s) ? s : null
}

export const ITEM_SECTION_META: Record<WorkReportItemSection, { no: string; title: string; helper: string }> = {
  operation: { no: '3-1', title: '운영사항', helper: '정기적으로 챙기는 운영 현황을 항목별로 관리합니다.' },
  issue:     { no: '3-2', title: '이슈사항', helper: '진행 중인 이슈와 대응 현황을 항목별로 관리합니다.' },
  decision:  { no: '3-3', title: '의사결정사항', helper: '경영진 판단이 필요한 안건과 결정 결과를 관리합니다.' },
}

// 값은 DB CHECK(schema_v58)와 반드시 일치해야 한다.
export const ITEM_STATUS_OPTIONS: Record<WorkReportItemSection, { value: string; label: string }[]> = {
  operation: [{ value: 'normal', label: '정상' }, { value: 'caution', label: '주의' }],
  issue:     [{ value: 'open', label: '진행' }, { value: 'resolved', label: '해결' }, { value: 'on_hold', label: '보류' }],
  decision:  [{ value: 'requested', label: '요청' }, { value: 'approved', label: '승인' }, { value: 'rejected', label: '반려' }, { value: 'on_hold', label: '보류' }],
}

export function itemStatusLabel(section: WorkReportItemSection, status: string): string {
  return ITEM_STATUS_OPTIONS[section].find(o => o.value === status)?.label ?? ''
}

export type ItemBadge = 'new' | 'changed' | 'kept'

export const ITEM_BADGE_LABEL: Record<ItemBadge, string> = { new: '신규', changed: '변경', kept: '유지' }

export const ITEM_EDITABLE_FIELDS = ['title', 'status', 'owner', 'summary', 'detail'] as const
export type ItemDraft = Pick<WorkReportItem, typeof ITEM_EDITABLE_FIELDS[number]>

export function computeItemBadge(item: ItemDraft, prev: ItemDraft | undefined): ItemBadge {
  if (!prev) return 'new'
  const same = ITEM_EDITABLE_FIELDS.every(f => (item[f] ?? '').trim() === (prev[f] ?? '').trim())
  return same ? 'kept' : 'changed'
}

export function sortItems(items: WorkReportItem[]): WorkReportItem[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

export function isItemWritten(item: WorkReportItem): boolean {
  return hasContent(item.title) || hasContent(item.summary) || hasContent(item.detail)
}

// 히스토리/아카이브/문서용 한 덩어리 텍스트 — "• 항목 [상태] (담당) — 요약" 한 줄씩.
export function itemsToText(items: WorkReportItem[], section: WorkReportItemSection, legacy?: string): string {
  const lines = sortItems(items).map(it => {
    const status = itemStatusLabel(section, it.status)
    let line = `• ${it.title || '(제목 없음)'}`
    if (status) line += ` [${status}]`
    if (it.owner.trim()) line += ` (${it.owner.trim()})`
    if (it.summary.trim()) line += ` — ${it.summary.trim()}`
    return line
  })
  if (legacy && hasContent(legacy)) {
    if (lines.length) lines.push('')
    lines.push('(이전 형식)', legacy.trim())
  }
  return lines.join('\n')
}
