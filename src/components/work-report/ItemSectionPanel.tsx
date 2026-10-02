'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { WorkReport, WorkReportItem, WorkReportItemSection } from '@/types'
import { useCanonicalSync } from '@/hooks/useCanonicalSync'
import { S, fmtPeriodLabel, hasContent, WRITING_CONTENT_WIDTH } from './style'
import { ITEM_SECTION_META, type ItemDraft } from './items'

// 3-1/3-2/3-3 한 섹션의 CENTER 편집 화면 — 엑셀식 3열 그리드(타이틀 · 세부내용 · 비고).
// 주요 내용은 2번 주제별 본문에 쓰고, 여기는 "잔가지"를 빠르게 쌓는 곳이라(2026-10-02 개편)
// 예전의 상태/담당 열·행 펼침 세부 편집기·신규/변경 배지를 걷어냈다. DB 컬럼은 그대로 두고
// 화면에서만 title=타이틀, detail=세부내용, summary=비고로 쓴다(status/owner는 기존 값 보존만).
//
// 키보드: Enter = 아래 행(마지막 행이면 새 행 추가), Shift/Alt+Enter = 셀 안 줄바꿈,
// ↑/↓ = 커서가 셀 맨 앞/맨 끝일 때 위/아래 행, 빈 행에서 Backspace = 행 삭제 후 위 행으로.
//
// 각 행은 자기 row를 useCanonicalSync로 직접 저장한다(ReportEditorPanel의 entry 저장과
// 같은 debounce/재시도 semantics). "보고 확정" 직전 pending debounce flush는
// ReportEditorPanel과 같은 handle 모양(flushPending)을 노출한다.

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
  onAdd: () => Promise<WorkReportItem | null>
  onDelete: (item: WorkReportItem, opts?: { skipConfirm?: boolean }) => Promise<boolean>
  onRestore: (prev: WorkReportItem) => void
}

const COLS = ['title', 'detail', 'summary'] as const
type Col = typeof COLS[number]
const COL_LABEL: Record<Col, string> = { title: '타이틀', detail: '세부내용', summary: '비고' }
const COL_PLACEHOLDER: Record<Col, string> = { title: '타이틀', detail: '세부내용', summary: '비고' }

const GRID = 'minmax(140px,1.1fr) minmax(220px,2.4fr) minmax(110px,1fr) 30px'

type CellNav = {
  register: (id: string, col: Col, el: HTMLTextAreaElement | null) => void
  onEnter: (id: string, col: Col, rowEmpty: boolean) => void
  onMove: (id: string, col: Col, dir: -1 | 1) => void
  onBackspaceEmpty: (id: string) => void
}

// 내용 높이에 맞춰 늘어나는 셀 — 한 줄로 시작해 줄바꿈하면 행이 같이 커진다.
function Cell({ value, onChange, col, readOnly, onKeyDown, cellRef }: {
  value: string
  onChange: (v: string) => void
  col: Col
  readOnly: boolean
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  cellRef: (el: HTMLTextAreaElement | null) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={el => { ref.current = el; cellRef(el) }}
      rows={1}
      value={value}
      readOnly={readOnly}
      placeholder={readOnly ? '' : COL_PLACEHOLDER[col]}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={readOnly ? '' : 'focus:bg-[rgba(76,127,224,0.08)] focus:shadow-[inset_0_0_0_1px_rgba(76,127,224,0.45)]'}
      style={{
        display: 'block', width: '100%', resize: 'none', overflow: 'hidden', background: 'transparent',
        color: S.t1, fontSize: 12.5, lineHeight: 1.55, padding: '7px 10px', outline: 'none', border: 'none',
        fontWeight: col === 'title' ? 600 : 400,
      }}
    />
  )
}

function ItemRow({ supabase, item, readOnly, onSaved, onDelete, registerFlush, nav }: {
  supabase: SupabaseClient
  item: WorkReportItem
  readOnly: boolean
  onSaved: (item: WorkReportItem) => void
  onDelete: () => void
  registerFlush: (id: string, fn: (() => Promise<void>) | null) => void
  nav: CellNav
}) {
  const [values, setValues] = useState<Record<Col, string>>({ title: item.title, detail: item.detail, summary: item.summary })

  // status/owner는 화면에서 빠졌지만 기존 값을 지우지 않도록 그대로 실어 보낸다.
  const draft: ItemDraft = useMemo(
    () => ({ title: values.title, status: item.status, owner: item.owner, summary: values.summary, detail: values.detail }),
    [values, item.status, item.owner],
  )
  const canonical = useCanonicalSync<ItemDraft>({
    supabase, table: 'work_report_items', id: item.id, draft, readOnly,
    onSaved: row => onSaved(row as WorkReportItem),
  })

  const { flush } = canonical
  useEffect(() => {
    registerFlush(item.id, flush)
    return () => registerFlush(item.id, null)
  }, [item.id, flush, registerFlush])

  const failed = canonical.status === 'failed'

  function handleKeyDown(col: Col, e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 IME 조합 중 Enter는 글자 확정용이므로 건드리지 않는다(안 그러면 행이 두 번 추가된다).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    const el = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      nav.onEnter(item.id, col, !values.title && !values.detail && !values.summary)
    } else if (e.key === 'Enter' && e.altKey) {
      // 엑셀처럼 Alt+Enter도 셀 안 줄바꿈 — textarea 기본 동작이 아니라 직접 넣는다.
      e.preventDefault()
      const { selectionStart: s, selectionEnd: t } = el
      const next = el.value.slice(0, s) + '\n' + el.value.slice(t)
      setValues(v => ({ ...v, [col]: next }))
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 1 })
    } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault()
      nav.onMove(item.id, col, -1)
    } else if (e.key === 'ArrowDown' && el.selectionStart === el.value.length) {
      e.preventDefault()
      nav.onMove(item.id, col, 1)
    } else if (e.key === 'Backspace' && !readOnly && col === 'title'
      && !values.title && !values.detail && !values.summary) {
      e.preventDefault()
      nav.onBackspaceEmpty(item.id)
    }
  }

  const cellBorder: React.CSSProperties = { borderTop: `1px solid ${S.border}`, background: failed ? 'rgba(239,68,68,0.06)' : undefined }

  return (
    <div className="group" style={{ display: 'contents' }}>
      {COLS.map((col, i) => (
        <div key={col} style={{ ...cellBorder, borderLeft: i > 0 ? `1px solid ${S.border}` : undefined }}>
          <Cell
            col={col}
            value={values[col]}
            readOnly={readOnly}
            onChange={v => setValues(prev => ({ ...prev, [col]: v }))}
            onKeyDown={e => handleKeyDown(col, e)}
            cellRef={el => nav.register(item.id, col, el)}
          />
        </div>
      ))}
      <div className="flex items-start justify-center pt-1.5" style={cellBorder}>
        {failed ? (
          <span className="text-[10px] font-semibold" style={{ color: '#F87171' }} title="저장 실패 — 잠시 후 자동 재시도합니다">!</span>
        ) : !readOnly && (
          <button onClick={onDelete} tabIndex={-1}
            className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-[rgba(239,68,68,0.15)] transition-opacity"
            title="이번 보고에서 삭제">
            <X size={12} style={{ color: S.t3 }} />
          </button>
        )}
      </div>
    </div>
  )
}

const ItemSectionPanel = forwardRef<ItemSectionPanelHandle, Props>(function ItemSectionPanel({
  supabase, section, prevReport, items, prevItems, readOnly, legacyText,
  onItemSaved, onAdd, onDelete, onRestore,
}, ref) {
  const meta = ITEM_SECTION_META[section]
  const flushers = useRef<Map<string, () => Promise<void>>>(new Map())
  const cells = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const pendingFocus = useRef<{ id: string; col: Col; atEnd?: boolean } | null>(null)
  const adding = useRef(false)
  const [restoreOpen, setRestoreOpen] = useState(false)

  const registerFlush = useCallback((id: string, fn: (() => Promise<void>) | null) => {
    if (fn) flushers.current.set(id, fn)
    else flushers.current.delete(id)
  }, [])

  useImperativeHandle(ref, () => ({
    flushPending: async () => { await Promise.all([...flushers.current.values()].map(f => f())) },
  }), [])

  const focusCell = useCallback((id: string, col: Col, atEnd = false) => {
    const el = cells.current.get(`${id}:${col}`)
    if (!el) return false
    el.focus()
    const pos = atEnd ? el.value.length : 0
    el.setSelectionRange(pos, pos)
    return true
  }, [])

  // 새 행은 부모 state 반영 후 렌더되므로, 렌더가 끝난 뒤 예약된 포커스를 건다.
  useEffect(() => {
    const p = pendingFocus.current
    if (p && focusCell(p.id, p.col, p.atEnd)) pendingFocus.current = null
  }, [items, focusCell])

  const addRow = useCallback(async () => {
    if (readOnly || adding.current) return
    adding.current = true
    try {
      const created = await onAdd()
      if (created) pendingFocus.current = { id: created.id, col: 'title' }
    } finally {
      adding.current = false
    }
  }, [readOnly, onAdd])

  const nav: CellNav = useMemo(() => ({
    register: (id, col, el) => {
      const key = `${id}:${col}`
      if (el) cells.current.set(key, el)
      else cells.current.delete(key)
    },
    onEnter: (id, col, rowEmpty) => {
      const idx = items.findIndex(i => i.id === id)
      const next = items[idx + 1]
      if (next) focusCell(next.id, col, true)
      // 마지막 행이 비어 있으면 빈 행을 계속 만들지 않는다.
      else if (!rowEmpty) void addRow()
    },
    onMove: (id, col, dir) => {
      const idx = items.findIndex(i => i.id === id)
      const target = items[idx + dir]
      if (target) focusCell(target.id, col, dir === -1)
    },
    onBackspaceEmpty: id => {
      const idx = items.findIndex(i => i.id === id)
      const target = items[idx - 1] ?? items[idx + 1]
      void onDelete(items[idx], { skipConfirm: true }).then(ok => {
        if (ok && target) {
          pendingFocus.current = { id: target.id, col: target === items[idx - 1] ? 'summary' : 'title', atEnd: true }
        }
      })
    },
  }), [items, focusCell, addRow, onDelete])

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
            {[...COLS.map(c => COL_LABEL[c]), ''].map((h, i) => (
              <div key={i} className="px-2.5 py-2 text-[11px] font-semibold"
                style={{ color: S.t3, background: S.panel, borderLeft: i > 0 && i < COLS.length ? `1px solid ${S.border}` : undefined }}>
                {h}
              </div>
            ))}
            {items.map(item => (
              <ItemRow
                key={item.id}
                supabase={supabase}
                item={item}
                readOnly={readOnly}
                onSaved={onItemSaved}
                onDelete={() => { void onDelete(item) }}
                registerFlush={registerFlush}
                nav={nav}
              />
            ))}
            {items.length === 0 && readOnly && (
              <div className="px-4 py-4 text-[12.5px]" style={{ gridColumn: '1 / -1', color: S.t4, borderTop: `1px solid ${S.border}` }}>
                등록된 항목이 없습니다.
              </div>
            )}
            {!readOnly && (
              <button
                onClick={() => void addRow()}
                className="flex items-center gap-1.5 px-2.5 py-2 text-[12px] text-left transition-colors hover:bg-[rgba(var(--ink-rgb),0.04)]"
                style={{ gridColumn: '1 / -1', color: S.t4, borderTop: `1px solid ${S.border}` }}
              >
                <Plus size={12} /> {items.length === 0 ? '클릭해서 첫 행 추가' : '행 추가'}
              </button>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            <p className="text-[11px]" style={{ color: S.t4 }}>
              Enter 아래 행·새 행 · Shift+Enter 줄바꿈 · ↑↓ 행 이동 · 빈 행에서 Backspace 삭제
            </p>
            {restorable.length > 0 && (
              <button onClick={() => setRestoreOpen(o => !o)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-medium ml-auto"
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
                {p.detail.trim() && <span style={{ color: S.t4 }}> — {p.detail.trim().split('\n')[0]}</span>}
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
