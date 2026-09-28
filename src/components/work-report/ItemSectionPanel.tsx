'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronRight, Plus, RotateCcw, X } from 'lucide-react'
import type { WorkReport, WorkReportItem, WorkReportItemSection } from '@/types'
import { useCanonicalSync, canonicalStatusText } from '@/hooks/useCanonicalSync'
import { S, fmtPeriodLabel, hasContent, WRITING_CONTENT_WIDTH } from './style'
import {
  ITEM_SECTION_META, ITEM_STATUS_OPTIONS, ITEM_BADGE_LABEL, computeItemBadge, itemStatusLabel,
  type ItemBadge, type ItemDraft,
} from './items'

// 3-1/3-2/3-3 한 섹션의 CENTER 편집 화면 — "표(항목 행) + 행 펼침 세부내용".
// 각 행은 자기 row를 useCanonicalSync로 직접 저장한다(ReportEditorPanel의 entry 저장과
// 같은 debounce/재시도 semantics). 이 패널은 autosave_drafts/content_versions(useAutosave)는
// 쓰지 않는다 — 두 테이블의 entity_type CHECK에 work_report_item이 없어서(schema_v54),
// 이번 범위에서는 제약을 건드리지 않기로 했다(2026-09-28 STEP 4 결정).
//
// "보고 확정" 직전 pending debounce flush는 ReportEditorPanel과 같은 handle 모양
// (flushPending)을 노출하고, 각 행이 자기 flush를 registry에 등록한다.

export type ItemSectionPanelHandle = { flushPending: () => Promise<void> }

interface Props {
  supabase: SupabaseClient
  section: WorkReportItemSection
  prevReport: WorkReport | null
  items: WorkReportItem[]       // 현재 회차·이 섹션, 정렬됨
  prevItems: WorkReportItem[]   // 직전 회차·이 섹션, 정렬됨
  readOnly: boolean
  // 3-2에서만 — 이 회차에 예전 형식(work_reports.issues)으로 쓴 텍스트가 있으면 읽기 전용 표시.
  legacyText?: string
  onItemSaved: (item: WorkReportItem) => void
  onAdd: () => void
  onDelete: (item: WorkReportItem) => void
  onRestore: (prev: WorkReportItem) => void
}

const GRID = 'minmax(150px,1.3fr) 96px 92px minmax(180px,2fr) 52px 56px'

const BADGE_STYLE: Record<ItemBadge, React.CSSProperties> = {
  new: { color: '#0F1319', background: '#4ADE80' },
  changed: { color: '#0F1319', background: '#F5C247' },
  kept: { color: 'var(--text-tertiary, rgba(226,232,240,0.6))', background: 'rgba(var(--ink-rgb),0.07)' },
}

const cellInput: React.CSSProperties = {
  width: '100%', background: 'transparent', color: S.t1, fontSize: 12.5, outline: 'none',
  padding: '6px 8px', borderRadius: 6, border: '1px solid transparent',
}

function ItemRow({
  supabase, section, item, prev, readOnly, onSaved, onDelete, registerFlush,
}: {
  supabase: SupabaseClient
  section: WorkReportItemSection
  item: WorkReportItem
  prev: WorkReportItem | undefined
  readOnly: boolean
  onSaved: (item: WorkReportItem) => void
  onDelete: () => void
  registerFlush: (id: string, fn: (() => Promise<void>) | null) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [status, setStatus] = useState(item.status)
  const [owner, setOwner] = useState(item.owner)
  const [summary, setSummary] = useState(item.summary)
  const [detail, setDetail] = useState(item.detail)
  // 새로 추가한 빈 행은 바로 세부까지 쓰기 쉽도록 펼친 채 시작한다.
  const [open, setOpen] = useState(!hasContent(item.title) && !readOnly)

  const draft: ItemDraft = useMemo(() => ({ title, status, owner, summary, detail }), [title, status, owner, summary, detail])
  const canonical = useCanonicalSync<ItemDraft>({
    supabase, table: 'work_report_items', id: item.id, draft, readOnly,
    onSaved: row => onSaved(row as WorkReportItem),
  })

  const { flush } = canonical
  useEffect(() => {
    registerFlush(item.id, flush)
    return () => registerFlush(item.id, null)
  }, [item.id, flush, registerFlush])

  const badge = computeItemBadge(draft, prev)
  const statusText = canonicalStatusText(canonical.status)
  const focusBorder = readOnly ? undefined : 'focus:border-[rgba(76,127,224,0.45)] hover:border-[rgba(var(--ink-rgb),0.12)]'

  return (
    <div style={{ display: 'contents' }}>
      <div className="flex items-center gap-0.5 min-w-0" style={{ borderTop: `1px solid ${S.border}` }}>
        <button onClick={() => setOpen(o => !o)} className="p-1 flex-shrink-0" title={open ? '세부 접기' : '세부 보기'}>
          {open ? <ChevronDown size={12} style={{ color: S.t3 }} /> : <ChevronRight size={12} style={{ color: S.t3 }} />}
        </button>
        <input value={title} onChange={e => setTitle(e.target.value)} readOnly={readOnly} placeholder="항목명"
          className={focusBorder} style={{ ...cellInput, fontWeight: 600 }} />
      </div>
      <div className="flex items-center" style={{ borderTop: `1px solid ${S.border}` }}>
        <select value={status} onChange={e => setStatus(e.target.value)} disabled={readOnly}
          className="disabled:opacity-100" style={{ ...cellInput, cursor: readOnly ? 'default' : 'pointer' }}>
          <option value="">미지정</option>
          {ITEM_STATUS_OPTIONS[section].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex items-center" style={{ borderTop: `1px solid ${S.border}` }}>
        <input value={owner} onChange={e => setOwner(e.target.value)} readOnly={readOnly} placeholder="담당"
          className={focusBorder} style={cellInput} />
      </div>
      <div className="flex items-center" style={{ borderTop: `1px solid ${S.border}` }}>
        <input value={summary} onChange={e => setSummary(e.target.value)} readOnly={readOnly} placeholder="한줄 요약"
          className={focusBorder} style={cellInput} />
      </div>
      <div className="flex items-center justify-center" style={{ borderTop: `1px solid ${S.border}` }}>
        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={BADGE_STYLE[badge]}
          title={badge === 'kept' ? '직전 보고와 동일' : badge === 'changed' ? '직전 보고에서 변경됨' : '이번 보고에서 새로 추가'}>
          {ITEM_BADGE_LABEL[badge]}
        </span>
      </div>
      <div className="flex items-center justify-end gap-0.5 pr-1.5" style={{ borderTop: `1px solid ${S.border}` }}>
        {statusText && <span className="text-[9.5px] whitespace-nowrap" style={{ color: canonical.status === 'failed' ? '#F87171' : S.t4 }}>{statusText}</span>}
        {!readOnly && (
          <button onClick={onDelete} className="p-1 rounded hover:bg-[rgba(239,68,68,0.15)]" title="이번 보고에서 삭제">
            <X size={12} style={{ color: S.t3 }} />
          </button>
        )}
      </div>

      {open && (
        <div className="px-8 pb-3 pt-1" style={{ gridColumn: '1 / -1', background: 'rgba(var(--ink-rgb),0.02)' }}>
          <p className="text-[11px] font-semibold mb-1" style={{ color: S.t3 }}>세부내용</p>
          <textarea
            value={detail}
            onChange={e => setDetail(e.target.value)}
            readOnly={readOnly}
            placeholder="배경, 진행 경과, 수치, 요청사항 등을 자유롭게 작성합니다."
            style={{
              width: '100%', minHeight: 110, resize: 'vertical', background: 'rgba(var(--ink-rgb),0.03)',
              border: `1px solid ${S.border}`, borderRadius: S.r, padding: '10px 12px', color: S.t1,
              fontSize: 13, lineHeight: 1.7, outline: 'none',
            }}
          />
          {prev && (
            <div className="mt-2 rounded-lg px-3 py-2" style={{ border: `1px solid ${S.border}` }}>
              <p className="text-[10.5px] font-semibold mb-0.5" style={{ color: S.t4 }}>
                직전 보고 · {prev.title || '(제목 없음)'}
                {itemStatusLabel(section, prev.status) && ` [${itemStatusLabel(section, prev.status)}]`}
                {prev.owner && ` (${prev.owner})`}
              </p>
              {prev.summary && <p className="text-[12px]" style={{ color: S.t2 }}>{prev.summary}</p>}
              <p className="text-[12px] whitespace-pre-wrap mt-0.5" style={{ color: hasContent(prev.detail) ? S.t2 : S.t4 }}>
                {hasContent(prev.detail) ? prev.detail : '(세부내용 없음)'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ItemSectionPanel = forwardRef<ItemSectionPanelHandle, Props>(function ItemSectionPanel({
  supabase, section, prevReport, items, prevItems, readOnly, legacyText,
  onItemSaved, onAdd, onDelete, onRestore,
}, ref) {
  const meta = ITEM_SECTION_META[section]
  const flushers = useRef<Map<string, () => Promise<void>>>(new Map())
  const [restoreOpen, setRestoreOpen] = useState(false)

  const registerFlush = useCallback((id: string, fn: (() => Promise<void>) | null) => {
    if (fn) flushers.current.set(id, fn)
    else flushers.current.delete(id)
  }, [])

  useImperativeHandle(ref, () => ({
    flushPending: async () => { await Promise.all([...flushers.current.values()].map(f => f())) },
  }), [])

  const prevByLineage = useMemo(() => new Map(prevItems.map(p => [p.lineage_id, p])), [prevItems])
  // "직전 항목 불러오기" 후보 — 직전 회차에는 있었는데 이번 회차에서 삭제된(또는 이월 안 된) 항목.
  const restorable = useMemo(() => {
    const present = new Set(items.map(i => i.lineage_id))
    return prevItems.filter(p => !present.has(p.lineage_id))
  }, [items, prevItems])

  return (
    <div className="h-full overflow-y-auto px-8 py-5">
      <div style={{ maxWidth: WRITING_CONTENT_WIDTH }}>
        <p className="text-[16px] font-semibold mb-1" style={{ color: S.t1 }}>{meta.no}. {meta.title}</p>
        <p className="text-[12px] mb-4" style={{ color: S.t4 }}>
          {meta.helper}{' '}
          {prevReport ? '직전 보고 항목이 자동으로 이어지며, 필요 없는 항목은 삭제합니다.' : ''}
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${S.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID }}>
            {['항목', '상태', '담당', '한줄 요약', '비교', ''].map((h, i) => (
              <div key={i} className="px-2.5 py-2 text-[11px] font-semibold" style={{ color: S.t3, background: S.panel, paddingLeft: i === 0 ? 28 : undefined }}>
                {h}
              </div>
            ))}
            {items.length === 0 && (
              <div className="px-4 py-5 text-[12.5px]" style={{ gridColumn: '1 / -1', color: S.t4, borderTop: `1px solid ${S.border}` }}>
                {readOnly ? '등록된 항목이 없습니다.' : '아직 항목이 없습니다. 아래 "+ 항목 추가"로 시작하세요.'}
              </div>
            )}
            {items.map(item => (
              <ItemRow
                key={item.id}
                supabase={supabase}
                section={section}
                item={item}
                prev={prevByLineage.get(item.lineage_id)}
                readOnly={readOnly}
                onSaved={onItemSaved}
                onDelete={() => onDelete(item)}
                registerFlush={registerFlush}
              />
            ))}
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 mt-3">
            <button onClick={onAdd}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}>
              <Plus size={12} /> 항목 추가
            </button>
            {restorable.length > 0 && (
              <button onClick={() => setRestoreOpen(o => !o)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}>
                <RotateCcw size={11} /> 직전 항목 불러오기 ({restorable.length})
              </button>
            )}
          </div>
        )}

        {!readOnly && restoreOpen && restorable.length > 0 && prevReport && (
          <div className="mt-2 rounded-lg py-1" style={{ border: `1px solid ${S.border}` }}>
            <p className="px-3 py-1 text-[10.5px]" style={{ color: S.t4 }}>
              직전 보고({fmtPeriodLabel(prevReport.period_start, prevReport.period_end)})에 있었던 항목
            </p>
            {restorable.map(p => (
              <button key={p.id} onClick={() => onRestore(p)}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[rgba(var(--ink-rgb),0.05)]"
                style={{ color: S.t2 }}>
                + {p.title || '(제목 없음)'}
                {itemStatusLabel(section, p.status) && <span style={{ color: S.t4 }}> [{itemStatusLabel(section, p.status)}]</span>}
                {p.summary && <span style={{ color: S.t4 }}> — {p.summary}</span>}
              </button>
            ))}
          </div>
        )}

        {legacyText && hasContent(legacyText) && (
          <div className="mt-6 rounded-lg px-3.5 py-3" style={{ background: 'rgba(var(--ink-rgb),0.025)', border: `1px solid ${S.border}` }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: S.t3 }}>이전 형식으로 작성된 &quot;주요 이슈 / 의사결정&quot; (읽기 전용)</p>
            <p className="text-[12.5px] whitespace-pre-wrap leading-[1.65]" style={{ color: S.t2 }}>{legacyText}</p>
          </div>
        )}
      </div>
    </div>
  )
})

export default ItemSectionPanel
