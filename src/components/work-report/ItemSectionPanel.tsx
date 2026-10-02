'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { WorkReport, WorkReportItem, WorkReportItemSection } from '@/types'
import { useCanonicalSync } from '@/hooks/useCanonicalSync'
import { parseSpreadsheetClipboard } from '@/lib/spreadsheetClipboard'
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
// 엑셀식 조작(생각스케치 표와 같은 붙여넣기 분배 — parseSpreadsheetClipboard 공용):
// - 셀을 드래그하거나 Shift+클릭으로 범위 선택 → Delete/Backspace 지우기, Ctrl+C/X 복사·잘라내기,
//   Ctrl+V는 범위 왼쪽 위부터 붙여넣기. Excel/Sheets 범위를 셀에 붙여넣으면 행·열로 나눠
//   채우고, 모자라는 행은 새로 만든다.
// - 왼쪽 행 번호: 클릭(Shift+클릭) = 행 선택 → Delete로 행 삭제, 드래그 = 행 순서 이동
//   (선택된 여러 행을 잡으면 묶음으로 이동).
//
// 각 행은 자기 row를 useCanonicalSync로 직접 저장한다(ReportEditorPanel의 entry 저장과
// 같은 debounce/재시도 semantics). 여러 행을 한 번에 바꾸는 범위 조작은 행마다 등록한
// set/get(rowApis)으로 각 행의 로컬 state를 바꿔, 저장도 각 행의 debounce를 그대로 탄다.
// "보고 확정" 직전 pending debounce flush는 ReportEditorPanel과 같은 handle 모양(flushPending).

export type ItemSectionPanelHandle = { flushPending: () => Promise<void> }

type CellValues = Pick<WorkReportItem, 'title' | 'detail' | 'summary'>

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
  onAddWithValues: (rows: CellValues[]) => Promise<WorkReportItem[]>
  onDelete: (item: WorkReportItem, opts?: { skipConfirm?: boolean }) => Promise<boolean>
  onDeleteMany: (items: WorkReportItem[]) => Promise<boolean>
  onReorder: (orderedIds: string[]) => void
  onRestore: (prev: WorkReportItem) => void
}

const COLS = ['title', 'detail', 'summary'] as const
type Col = typeof COLS[number]
const COL_LABEL: Record<Col, string> = { title: '타이틀', detail: '세부내용', summary: '비고' }

// 데이터 열 3개의 너비(px) — 머리글 경계를 드래그해 바꾸고, 이 브라우저에만 기억한다(뷰어별 편의 설정).
const DEFAULT_COL_WIDTHS = [190, 420, 210]
const MIN_COL_WIDTH = 70
const COL_WIDTH_KEY = 'work-report-item-col-widths'
function loadColWidths(): number[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(COL_WIDTH_KEY) : null
    const arr = raw ? JSON.parse(raw) : null
    if (Array.isArray(arr) && arr.length === 3 && arr.every(n => typeof n === 'number' && n >= MIN_COL_WIDTH)) return arr
  } catch { /* 저장소 접근 불가 — 기본값 */ }
  return DEFAULT_COL_WIDTHS
}
const SEL_BG = 'rgba(76,127,224,0.14)'
const DROP_LINE = 'rgba(76,127,224,0.9)'

type Pos = { r: number; c: number }
type Sel = { a: Pos; b: Pos; rows: boolean }
type RowApi = { get: () => CellValues; set: (patch: Partial<CellValues>) => void }

function selRect(sel: Sel) {
  return {
    r0: Math.min(sel.a.r, sel.b.r), r1: Math.max(sel.a.r, sel.b.r),
    c0: sel.rows ? 0 : Math.min(sel.a.c, sel.b.c), c1: sel.rows ? COLS.length - 1 : Math.max(sel.a.c, sel.b.c),
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

// 셀 안 줄바꿈이 있으면 TSV 규칙대로 큰따옴표로 감싼다(Excel이 그대로 읽는 형식).
function tsvCell(s: string) {
  return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// 셀 이벤트 묶음 — 행 컴포넌트가 패널의 선택/붙여넣기/키보드 이동 로직을 부른다.
type CellNav = {
  register: (id: string, col: Col, el: HTMLTextAreaElement | null) => void
  onEnter: (id: string, col: Col, rowEmpty: boolean) => void
  onMove: (id: string, col: Col, dir: -1 | 1) => void
  onBackspaceEmpty: (id: string) => void
  onPaste: (r: number, c: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onCellMouseDown: (r: number, c: number, e: React.MouseEvent) => void
  onCellMouseEnter: (r: number, c: number) => void
  onCellFocus: (r: number, c: number) => void
  onRowHeaderClick: (r: number, e: React.MouseEvent) => void
  onDragStart: (r: number, e: React.DragEvent) => void
  onDragOver: (r: number, e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

// 내용 높이에 맞춰 늘어나는 셀 — 한 줄로 시작해 줄바꿈하면 행이 같이 커진다.
function Cell({ value, onChange, col, readOnly, onKeyDown, onPaste, onFocus, cellRef }: {
  value: string
  onChange: (v: string) => void
  col: Col
  readOnly: boolean
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onFocus: () => void
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
      placeholder={readOnly ? '' : COL_LABEL[col]}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
      className={readOnly ? '' : 'focus:bg-[rgba(76,127,224,0.08)] focus:shadow-[inset_0_0_0_1px_rgba(76,127,224,0.45)]'}
      style={{
        display: 'block', width: '100%', resize: 'none', overflow: 'hidden', background: 'transparent',
        color: S.t1, fontSize: 12.5, lineHeight: 1.55, padding: '7px 10px', outline: 'none', border: 'none',
        fontWeight: col === 'title' ? 600 : 400,
      }}
    />
  )
}

function ItemRow({
  supabase, item, index, readOnly, onSaved, onDelete, registerFlush, registerRow, nav,
  selectedCols, rowSelected, dropEdge, dragging,
}: {
  supabase: SupabaseClient
  item: WorkReportItem
  index: number
  readOnly: boolean
  onSaved: (item: WorkReportItem) => void
  onDelete: () => void
  registerFlush: (id: string, fn: (() => Promise<void>) | null) => void
  registerRow: (id: string, api: RowApi | null) => void
  nav: CellNav
  selectedCols: boolean[]
  rowSelected: boolean
  dropEdge: 'top' | 'bottom' | null
  dragging: boolean
}) {
  const [values, setValues] = useState<CellValues>({ title: item.title, detail: item.detail, summary: item.summary })
  const valuesRef = useRef(values)
  useEffect(() => { valuesRef.current = values }, [values])

  useEffect(() => {
    registerRow(item.id, {
      get: () => valuesRef.current,
      set: patch => setValues(v => ({ ...v, ...patch })),
    })
    return () => registerRow(item.id, null)
  }, [item.id, registerRow])

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
  const rowEmpty = !values.title && !values.detail && !values.summary

  function handleKeyDown(col: Col, e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 IME 조합 중 Enter는 글자 확정용이므로 건드리지 않는다(안 그러면 행이 두 번 추가된다).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    const el = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      nav.onEnter(item.id, col, rowEmpty)
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
    } else if (e.key === 'Backspace' && !readOnly && col === 'title' && rowEmpty) {
      e.preventDefault()
      nav.onBackspaceEmpty(item.id)
    }
  }

  const edgeShadow = dropEdge === 'top' ? `inset 0 2px 0 ${DROP_LINE}` : dropEdge === 'bottom' ? `inset 0 -2px 0 ${DROP_LINE}` : undefined
  const cellBase: React.CSSProperties = {
    borderTop: `1px solid ${S.border}`, boxShadow: edgeShadow, opacity: dragging ? 0.45 : 1,
    background: failed ? 'rgba(239,68,68,0.06)' : undefined,
  }
  const dragProps = {
    onDragOver: (e: React.DragEvent) => nav.onDragOver(index, e),
    onDrop: (e: React.DragEvent) => nav.onDrop(e),
  }

  return (
    <div className="group" style={{ display: 'contents' }}>
      <div
        draggable={!readOnly}
        onDragStart={e => nav.onDragStart(index, e)}
        onDragEnd={nav.onDragEnd}
        onClick={e => nav.onRowHeaderClick(index, e)}
        {...dragProps}
        title={readOnly ? undefined : '클릭: 행 선택(Delete로 삭제) · 드래그: 순서 이동'}
        className="flex items-start justify-center pt-2 text-[10.5px] select-none"
        style={{
          ...cellBase, color: rowSelected ? S.accentText : S.t4, cursor: readOnly ? 'default' : 'grab',
          background: rowSelected ? SEL_BG : cellBase.background ?? S.panel,
        }}
      >
        {index + 1}
      </div>
      {COLS.map((col, ci) => (
        <div
          key={col}
          onMouseDown={e => nav.onCellMouseDown(index, ci, e)}
          onMouseEnter={() => nav.onCellMouseEnter(index, ci)}
          {...dragProps}
          style={{ ...cellBase, borderLeft: `1px solid ${S.border}`, background: selectedCols[ci] ? SEL_BG : cellBase.background }}
        >
          <Cell
            col={col}
            value={values[col]}
            readOnly={readOnly}
            onChange={v => setValues(prev => ({ ...prev, [col]: v }))}
            onKeyDown={e => handleKeyDown(col, e)}
            onPaste={e => nav.onPaste(index, ci, e)}
            onFocus={() => nav.onCellFocus(index, ci)}
            cellRef={el => nav.register(item.id, col, el)}
          />
        </div>
      ))}
      <div className="flex items-start justify-center pt-1.5" style={cellBase} {...dragProps}>
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
  onItemSaved, onAdd, onAddWithValues, onDelete, onDeleteMany, onReorder, onRestore,
}, ref) {
  const meta = ITEM_SECTION_META[section]
  const flushers = useRef<Map<string, () => Promise<void>>>(new Map())
  const rowApis = useRef<Map<string, RowApi>>(new Map())
  const cells = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const pendingFocus = useRef<{ id: string; col: Col; atEnd?: boolean } | null>(null)
  const adding = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [colWidths, setColWidths] = useState<number[]>(loadColWidths)
  const colWidthsRef = useRef(colWidths)
  useEffect(() => { colWidthsRef.current = colWidths }, [colWidths])

  // 생각스케치 표(startColResize)와 같은 방식 — 경계에서 pointerdown 후 window에서 이동/해제를 받는다.
  function startColResize(e: React.PointerEvent, ci: number) {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX
    const startWidths = colWidthsRef.current
    let latest = startWidths
    function onMove(ev: PointerEvent) {
      latest = startWidths.map((w, i) => (i === ci ? Math.max(MIN_COL_WIDTH, startWidths[ci] + ev.clientX - sx) : w))
      setColWidths(latest)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try { window.localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(latest)) } catch { /* 무시 */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 범위 선택 — anchor는 마지막으로 포커스/클릭한 칸(Shift+클릭의 기준점).
  const [sel, setSel] = useState<Sel | null>(null)
  const anchor = useRef<Pos | null>(null)
  const dragFrom = useRef<Pos | null>(null)
  // 행 드래그 정렬
  const [dragRows, setDragRows] = useState<{ r0: number; r1: number } | null>(null)
  const [drop, setDrop] = useState<{ r: number; edge: 'top' | 'bottom' } | null>(null)

  const registerFlush = useCallback((id: string, fn: (() => Promise<void>) | null) => {
    if (fn) flushers.current.set(id, fn)
    else flushers.current.delete(id)
  }, [])
  const registerRow = useCallback((id: string, api: RowApi | null) => {
    if (api) rowApis.current.set(id, api)
    else rowApis.current.delete(id)
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

  // 드래그 범위 선택은 표 밖에서 마우스를 놓아도 끝나야 하고, 표 밖을 누르면 선택을 푼다.
  useEffect(() => {
    function onUp() { dragFrom.current = null }
    function onDown(e: MouseEvent) {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) setSel(null)
    }
    window.addEventListener('mouseup', onUp)
    document.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('mouseup', onUp); document.removeEventListener('mousedown', onDown) }
  }, [])

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

  // (r0, c0)부터 matrix를 채운다 — 열은 3칸을 넘으면 버리고, 행이 모자라면 새로 만든다.
  const pasteMatrix = useCallback(async (r0: number, c0: number, matrix: string[][]) => {
    if (readOnly) return
    const extra: CellValues[] = []
    matrix.forEach((mRow, mi) => {
      const patch: Partial<CellValues> = {}
      mRow.forEach((val, ci) => { const col = COLS[c0 + ci]; if (col) patch[col] = val })
      const target = items[r0 + mi]
      if (target) rowApis.current.get(target.id)?.set(patch)
      else extra.push({ title: '', detail: '', summary: '', ...patch })
    })
    if (extra.length) await onAddWithValues(extra)
    setSel({ a: { r: r0, c: c0 }, b: { r: r0 + matrix.length - 1, c: Math.min(COLS.length - 1, c0 + Math.max(...matrix.map(m => m.length)) - 1) }, rows: false })
    gridRef.current?.focus({ preventScroll: true })
  }, [readOnly, items, onAddWithValues])

  const rangeMatrix = useCallback((s: Sel) => {
    const { r0, r1, c0, c1 } = selRect(s)
    const out: string[][] = []
    for (let r = r0; r <= r1; r++) {
      const v = items[r] ? rowApis.current.get(items[r].id)?.get() : undefined
      const row: string[] = []
      for (let c = c0; c <= c1; c++) row.push(v ? v[COLS[c]] : '')
      out.push(row)
    }
    return out
  }, [items])

  const copySel = useCallback(async (s: Sel) => {
    const m = rangeMatrix(s)
    const text = m.map(r => r.map(tsvCell).join('\t')).join('\n')
    const html = `<table>${m.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</table>`
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })])
    } catch {
      try { await navigator.clipboard.writeText(text) } catch { /* 클립보드 권한 없음 — 조용히 무시 */ }
    }
  }, [rangeMatrix])

  const clearSel = useCallback((s: Sel) => {
    const { r0, r1, c0, c1 } = selRect(s)
    for (let r = r0; r <= r1; r++) {
      if (!items[r]) continue
      const patch: Partial<CellValues> = {}
      for (let c = c0; c <= c1; c++) patch[COLS[c]] = ''
      rowApis.current.get(items[r].id)?.set(patch)
    }
  }, [items])

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!sel || e.target !== gridRef.current) return
    const mod = e.ctrlKey || e.metaKey
    const { r0, r1, c0 } = selRect(sel)
    if (e.key === 'Escape') {
      setSel(null)
    } else if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault(); void copySel(sel)
    } else if (readOnly) {
      return
    } else if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault(); void copySel(sel).then(() => clearSel(sel))
    } else if (mod && e.key.toLowerCase() === 'v') {
      // 붙여넣기는 범위 왼쪽 위 칸으로 포커스를 옮겨, 그 칸의 onPaste(행·열 분배)가 받게 한다.
      const target = items[r0]
      if (target) focusCell(target.id, COLS[c0])
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (sel.rows) {
        const targets = items.slice(r0, r1 + 1)
        void onDeleteMany(targets).then(ok => { if (ok) setSel(null) })
      } else {
        clearSel(sel)
      }
    }
  }

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
    onPaste: (r, c, e) => {
      if (readOnly || !e.clipboardData) return
      const matrix = parseSpreadsheetClipboard(e.clipboardData)
      // 한 칸짜리는 브라우저 기본 붙여넣기(그 셀에 텍스트 삽입)에 맡긴다.
      if (!matrix || (matrix.length === 1 && matrix[0].length === 1)) return
      e.preventDefault()
      void pasteMatrix(r, c, matrix)
    },
    onCellMouseDown: (r, c, e) => {
      if (e.button !== 0) return
      if (e.shiftKey && anchor.current) {
        e.preventDefault()
        setSel({ a: anchor.current, b: { r, c }, rows: false })
        gridRef.current?.focus({ preventScroll: true })
        return
      }
      setSel(null)
      anchor.current = { r, c }
      dragFrom.current = { r, c }
    },
    onCellMouseEnter: (r, c) => {
      const from = dragFrom.current
      if (!from || (from.r === r && from.c === c)) return
      setSel({ a: from, b: { r, c }, rows: false })
      // 여러 칸으로 넘어가는 순간부터는 셀 텍스트 선택이 아니라 범위 선택 모드.
      window.getSelection()?.removeAllRanges()
      gridRef.current?.focus({ preventScroll: true })
    },
    onCellFocus: (r, c) => {
      anchor.current = { r, c }
      if (!dragFrom.current) setSel(null)
    },
    onRowHeaderClick: (r, e) => {
      const base = e.shiftKey && sel?.rows ? sel.a : e.shiftKey && anchor.current ? anchor.current : { r, c: 0 }
      setSel({ a: { r: base.r, c: 0 }, b: { r, c: COLS.length - 1 }, rows: true })
      if (!e.shiftKey) anchor.current = { r, c: 0 }
      gridRef.current?.focus({ preventScroll: true })
    },
    onDragStart: (r, e) => {
      if (readOnly) { e.preventDefault(); return }
      // 선택된 여러 행 중 하나를 잡으면 그 묶음을 함께 옮긴다.
      const rect = sel?.rows ? selRect(sel) : null
      const block = rect && r >= rect.r0 && r <= rect.r1 ? { r0: rect.r0, r1: rect.r1 } : { r0: r, r1: r }
      setDragRows(block)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', '')
    },
    onDragOver: (r, e) => {
      if (!dragRows) return
      e.preventDefault()
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const edge = e.clientY < box.top + box.height / 2 ? 'top' : 'bottom'
      setDrop(d => (d?.r === r && d.edge === edge ? d : { r, edge }))
    },
    onDrop: e => {
      e.preventDefault()
      if (!dragRows || !drop) { setDragRows(null); setDrop(null); return }
      const insertBefore = drop.edge === 'top' ? drop.r : drop.r + 1
      const { r0, r1 } = dragRows
      setDragRows(null); setDrop(null)
      if (insertBefore >= r0 && insertBefore <= r1 + 1) return // 제자리
      const moving = items.slice(r0, r1 + 1)
      const rest = [...items.slice(0, r0), ...items.slice(r1 + 1)]
      const at = insertBefore > r1 ? insertBefore - moving.length : insertBefore
      const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)]
      onReorder(next.map(i => i.id))
      if (sel?.rows) setSel({ a: { r: at, c: 0 }, b: { r: at + moving.length - 1, c: COLS.length - 1 }, rows: true })
    },
    onDragEnd: () => { setDragRows(null); setDrop(null) },
  }), [items, focusCell, addRow, onDelete, readOnly, pasteMatrix, sel, dragRows, drop, onReorder])

  // "직전 항목 불러오기" 후보 — 직전 회차에는 있었는데 이번 회차에서 삭제된(또는 이월 안 된) 항목.
  const restorable = useMemo(() => {
    const present = new Set(items.map(i => i.lineage_id))
    return prevItems.filter(p => !present.has(p.lineage_id))
  }, [items, prevItems])

  const rect = sel ? selRect(sel) : null

  return (
    <div className="h-full overflow-y-auto px-8 py-5">
      <div style={{ maxWidth: WRITING_CONTENT_WIDTH }}>
        <p className="text-[16px] font-semibold mb-1" style={{ color: S.t1 }}>{meta.no}. {meta.title}</p>
        <p className="text-[12px] mb-4" style={{ color: S.t4 }}>
          {meta.helper}{' '}
          {prevReport ? '직전 보고 항목이 자동으로 이어지며, 필요 없는 항목은 삭제합니다.' : ''}
        </p>

        <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${S.border}` }}>
          <div
            ref={gridRef}
            tabIndex={-1}
            onKeyDown={handleGridKeyDown}
            className={`outline-none ${sel && sel.a.r !== sel.b.r ? 'select-none' : ''}`}
            style={{ display: 'grid', gridTemplateColumns: `30px ${colWidths.map(w => `${w}px`).join(' ')} 30px`, width: 'max-content', minWidth: '100%' }}
          >
            {['', ...COLS.map(c => COL_LABEL[c]), ''].map((h, i) => (
              <div key={i} className="relative px-2.5 py-2 text-[11px] font-semibold select-none"
                style={{ color: S.t3, background: S.panel, borderLeft: i > 0 && i <= COLS.length ? `1px solid ${S.border}` : undefined }}>
                {h}
                {i >= 1 && i <= COLS.length && (
                  <div
                    onPointerDown={e => startColResize(e, i - 1)}
                    onDoubleClick={() => {
                      setColWidths(prev => {
                        const next = prev.map((w, k) => (k === i - 1 ? DEFAULT_COL_WIDTHS[k] : w))
                        try { window.localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(next)) } catch { /* 무시 */ }
                        return next
                      })
                    }}
                    title="드래그: 열 너비 조절 · 더블클릭: 기본 너비"
                    className="absolute top-0 bottom-0 hover:bg-[rgba(76,127,224,0.45)]"
                    style={{ right: -3, width: 6, cursor: 'col-resize', zIndex: 2 }}
                  />
                )}
              </div>
            ))}
            {items.map((item, r) => {
              const inRows = !!rect && r >= rect.r0 && r <= rect.r1
              return (
                <ItemRow
                  key={item.id}
                  supabase={supabase}
                  item={item}
                  index={r}
                  readOnly={readOnly}
                  onSaved={onItemSaved}
                  onDelete={() => { void onDelete(item) }}
                  registerFlush={registerFlush}
                  registerRow={registerRow}
                  nav={nav}
                  selectedCols={COLS.map((_, c) => inRows && !!rect && c >= rect.c0 && c <= rect.c1 && !!sel && (sel.rows || sel.a.r !== sel.b.r || sel.a.c !== sel.b.c))}
                  rowSelected={inRows && !!sel?.rows}
                  dropEdge={drop?.r === r ? drop.edge : null}
                  dragging={!!dragRows && r >= dragRows.r0 && r <= dragRows.r1}
                />
              )
            })}
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
                <Plus size={12} /> {items.length === 0 ? '클릭해서 첫 행 추가 (엑셀 범위 붙여넣기도 가능)' : '행 추가'}
              </button>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-start gap-3 mt-2.5 flex-wrap">
            <p className="text-[11px] leading-[1.6]" style={{ color: S.t4 }}>
              Enter 아래 행·새 행 · Shift+Enter 줄바꿈 · ↑↓ 행 이동 · 빈 행에서 Backspace 삭제<br />
              셀 드래그/Shift+클릭 범위 선택 → Delete 지우기 · Ctrl+C/X/V · 행 번호 클릭 → Delete 행 삭제 · 행 번호 드래그로 순서 이동 · 머리글 경계 드래그로 열 너비
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
