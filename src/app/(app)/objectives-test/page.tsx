'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_PALETTE, TEAM_COLOR, colorKeyFromName } from '@/lib/categoryColors'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Plus, Trash2, ChevronLeft, ChevronRight, Users, Target, Zap, Info, MoreVertical, Download, CheckCheck, X, Maximize2 } from 'lucide-react'
import MarkdownContent from '@/components/MarkdownContent'

const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

// ── Types ──────────────────────────────────────────────────
interface GroupV2     { id: string; name: string; color: string; sort_order: number }
interface ObjectiveV2 { id: string; group_id: string; title: string; description: string; quarter: string; sort_order: number }
interface EntryV2     { id: string; objective_id: string; week_start: string; content: string }

interface WeekCol {
  start: string   // 'yyyy-MM-dd' Monday
  end: string     // 'yyyy-MM-dd' Sunday
  label: string   // '7/20(월) ~ 7/26(일)'
  isThisWeek: boolean
  isFuture: boolean
}

type FeedItem = {
  entry:     EntryV2
  objective: ObjectiveV2
  group:     GroupV2
}

// ── Utils ──────────────────────────────────────────────────
function getMondayOf(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  date.setHours(0, 0, 0, 0)
  return date
}

function shiftWeeks(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n * 7)
  return r
}

function fmtKo(d: Date, f: string): string {
  return format(d, f, { locale: ko })
}

function getWeekCols(anchor: Date, count = 4): WeekCol[] {
  const thisMonday = format(getMondayOf(new Date()), 'yyyy-MM-dd')
  return Array.from({ length: count }, (_, i) => {
    const mon = shiftWeeks(anchor, i)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const start = format(mon, 'yyyy-MM-dd')
    return {
      start,
      end: format(sun, 'yyyy-MM-dd'),
      label: `${fmtKo(mon, 'M/d(eee)')} ~ ${fmtKo(sun, 'M/d(eee)')}`,
      isThisWeek: start === thisMonday,
      isFuture: start > thisMonday,
    }
  })
}

// 3주전→2주전→지난주→이번주→다음주→2주후
const WEEK_DOT_COLORS = ['#3B82F6', '#F59E0B', '#22C55E']
const WEEK_REL_LABELS  = ['2주전',   '지난주',  '이번주']
const WEEK_OFFSETS     = [-2, -1, 0]

function getFixedWeekCols(): WeekCol[] {
  const thisMonday = getMondayOf(new Date())
  const thisStr    = format(thisMonday, 'yyyy-MM-dd')
  return WEEK_OFFSETS.map((offset, i) => {
    const mon = shiftWeeks(thisMonday, offset)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const start = format(mon, 'yyyy-MM-dd')
    return {
      start,
      end: format(sun, 'yyyy-MM-dd'),
      label: WEEK_REL_LABELS[i],
      isThisWeek: start === thisStr,
      isFuture: offset > 0,
    }
  })
}

const VIBRANT_KEYS = ['blue', 'purple', 'teal', 'pink', 'green', 'cyan', 'lilac']
function dotColor(name: string): string {
  const stripped = name.replace(/팀$|부$|본부$|파트$/, '')
  const key = TEAM_COLOR[name] ?? TEAM_COLOR[stripped]
  if (key) return CATEGORY_PALETTE[key].solid
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_PALETTE[VIBRANT_KEYS[h % VIBRANT_KEYS.length] as keyof typeof CATEGORY_PALETTE]?.solid ?? '#6B9BE0'
}

function hexAlpha(hex: string, alpha: number): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  } catch { return `rgba(76,127,224,${alpha})` }
}

function headerBg(name: string): string {
  const hex = dotColor(name)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.08)`
}

function useWinFocused() {
  const ref = useRef(true)
  useEffect(() => {
    const blur = () => { ref.current = false }
    const focus = () => { ref.current = true }
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('focus', focus) }
  }, [])
  return ref
}

const LEFT_W  = 280
const COL_W   = 220
const TODAY_W = 400

// ── StatItem ───────────────────────────────────────────────
function StatItem({ icon, label, accent }: { icon: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={accent ? 'text-[#4C7FE0]' : 'text-[rgba(226,232,240,0.3)]'}>{icon}</span>
      <span className={`text-[11px] ${accent ? 'text-[rgba(226,232,240,0.6)]' : 'text-[rgba(226,232,240,0.4)]'}`}>{label}</span>
    </div>
  )
}

// ── EntryModal ─────────────────────────────────────────────
function EntryModal({
  entry, objTitle, weekLabel, onClose, onSave, onDelete, defaultEditing = false,
}: {
  entry: EntryV2
  objTitle: string
  weekLabel: string
  onClose: () => void
  onSave: (content: string) => Promise<void>
  onDelete: () => Promise<void>
  defaultEditing?: boolean
}) {
  const [editing, setEditing] = useState(defaultEditing)
  const [val, setVal] = useState(entry.content)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editing) { setVal(entry.content); setEditing(false) }
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, entry.content, onClose])

  async function handleSave() {
    setSaving(true)
    await onSave(val)
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirm('이 메모를 삭제할까요?')) return
    await onDelete()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-3xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: '#1A2030', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <p className="text-[11px] font-medium text-[rgba(226,232,240,0.4)] uppercase tracking-wide mb-0.5">{weekLabel}</p>
            <h3 className="text-[16px] font-semibold text-[rgba(226,232,240,0.9)]">{objTitle}</h3>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                style={{ background: 'rgba(76,127,224,0.15)', color: '#7EB3FF', border: '1px solid rgba(76,127,224,0.25)' }}
              >
                편집
              </button>
            )}
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: 'rgba(239,68,68,0.08)', color: 'rgba(252,129,129,0.75)', border: '1px solid rgba(239,68,68,0.18)' }}
            >
              삭제
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.8)] hover:bg-[rgba(255,255,255,0.07)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 min-h-0 overflow-auto scrollbar-none px-6 py-5">
          {editing ? (
            <TiptapEditor
              dark value={val} onChange={setVal}
              onSubmit={handleSave}
              onEscape={() => { setVal(entry.content); setEditing(false) }}
              autoFocus minHeight={460}
            />
          ) : (
            <div className="text-[15px] leading-[1.8] text-[rgba(226,232,240,0.85)]">
              <MarkdownContent content={entry.content} dark />
            </div>
          )}
        </div>

        {/* 편집 푸터 */}
        {editing && (
          <div className="flex items-center justify-end gap-2 px-6 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => { setVal(entry.content); setEditing(false) }}
              className="px-4 py-1.5 rounded-lg text-[12px] text-[rgba(226,232,240,0.45)] hover:text-[rgba(226,232,240,0.7)] transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
              style={{ background: 'rgba(76,127,224,0.2)', color: '#7EB3FF', border: '1px solid rgba(76,127,224,0.3)' }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MatrixCell ─────────────────────────────────────────────
function MatrixCell({
  entry, objectiveId, weekStart, weekIndex, isThisWeek, isFuture, objTitle, onSave, onDelete,
}: {
  entry: EntryV2 | undefined
  objectiveId: string
  weekStart: string
  weekIndex: number
  isThisWeek: boolean
  isFuture: boolean
  objTitle: string
  onSave: (oid: string, ws: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(entry?.content ?? '')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalEditMode, setModalEditMode] = useState(false)
  const wf = useWinFocused()

  async function save() {
    const txt = val.replace(/<[^>]*>/g, '').trim()
    if (!txt && entry) { await onDelete(entry.id); setEditing(false); return }
    if (txt) await onSave(objectiveId, weekStart, val)
    setEditing(false)
  }

  // ── 편집 모드 ───────────────────────────────────────────
  if (editing) return (
    <div
      ref={el => { el?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }}
      className="rounded-[12px] overflow-hidden border"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(76,127,224,0.3)', position: 'relative', zIndex: 20 }}
      onBlur={e => { if (!wf.current) return; if (!e.currentTarget.contains(e.relatedTarget as Node)) save() }}
    >
      <TiptapEditor dark value={val} onChange={setVal} onSubmit={save}
        onEscape={() => { setVal(entry?.content ?? ''); setEditing(false) }}
        autoFocus minHeight={100} />
    </div>
  )

  // ── 내용 있음 ────────────────────────────────────────────
  if (entry?.content) {
    const [, mm, dd] = weekStart.split('-')
    return (
      <div
        className="relative group/cell rounded-[12px] border cursor-text hover:bg-[rgba(255,255,255,0.04)] transition-colors"
        style={{
          background: 'rgba(255,255,255,0.025)',
          borderColor: 'rgba(255,255,255,0.06)',
          padding: 16,
        }}
        onClick={() => { setModalEditMode(true); setModalOpen(true) }}
      >
        {/* 주차 헤더 */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: WEEK_DOT_COLORS[weekIndex] }} />
          <span className="text-[11px] font-semibold text-[rgba(226,232,240,0.65)]">{WEEK_REL_LABELS[weekIndex]}</span>
          <span className="text-[10px] text-[rgba(226,232,240,0.3)]">({parseInt(mm)}/{parseInt(dd)})</span>
        </div>

        {/* 구분선 */}
        <div className="border-t border-[rgba(255,255,255,0.05)] mb-3" />

        {/* 업데이트 라벨 */}
        <span className="block text-[11px] font-medium text-[rgba(226,232,240,0.45)] mb-2 tracking-wide uppercase">
          업데이트
        </span>

        {/* 크게보기 버튼 — 읽기 모드로 열기 */}
        <button
          onClick={e => { e.stopPropagation(); setModalEditMode(false); setModalOpen(true) }}
          className="absolute top-3 right-9 opacity-0 group-hover/cell:opacity-100 text-[rgba(226,232,240,0.25)] hover:text-[rgba(226,232,240,0.7)] transition-all p-0.5"
          title="크게 보기 (읽기)"
        >
          <Maximize2 size={10} />
        </button>

        {/* 삭제 버튼 */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
          className="absolute top-3 right-3 opacity-0 group-hover/cell:opacity-100 text-[rgba(226,232,240,0.25)] hover:text-red-400 transition-all p-0.5"
        >
          <Trash2 size={10} />
        </button>

        {/* 본문 */}
        <div
          className="overflow-auto scrollbar-none text-[14px] leading-[1.75] text-[rgba(226,232,240,0.82)]"
          style={{ maxHeight: 160 }}
        >
          <MarkdownContent content={entry.content} dark />
        </div>

        {/* 크게보기 모달 */}
        {modalOpen && (
          <EntryModal
            entry={entry}
            objTitle={objTitle}
            weekLabel={`${WEEK_REL_LABELS[weekIndex]} (${parseInt(mm)}/${parseInt(dd)})`}
            defaultEditing={modalEditMode}
            onClose={() => { setModalOpen(false); setModalEditMode(false) }}
            onSave={async (content) => { await onSave(objectiveId, weekStart, content) }}
            onDelete={async () => { await onDelete(entry.id) }}
          />
        )}
      </div>
    )
  }

  // ── 빈 상태 ─────────────────────────────────────────────
  return (
    <div
      onClick={() => { setVal(''); setEditing(true) }}
      className="group/empty rounded-[12px] border cursor-pointer flex flex-col items-center justify-center gap-2 transition-all"
      style={{
        background: 'rgba(255,255,255,0.015)',
        borderColor: 'rgba(255,255,255,0.05)',
        minHeight: 80,
        padding: 12,
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.04)'; el.style.borderColor = 'rgba(255,255,255,0.1)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.015)'; el.style.borderColor = 'rgba(255,255,255,0.05)' }}
    >
      <Plus size={16} className="text-[rgba(255,255,255,0.2)] group-hover/empty:text-[rgba(255,255,255,0.38)] transition-colors" />
      <span className="text-[12px] text-[rgba(226,232,240,0.22)] text-center leading-tight block group-hover/empty:hidden">
        메모 작성
      </span>
      <span className="text-[11px] text-[rgba(226,232,240,0.5)] text-center leading-tight hidden group-hover/empty:block">
        클릭하여 메모 작성
      </span>
    </div>
  )
}

// ── ObjectiveRow ───────────────────────────────────────────
function ObjectiveRow({
  obj, index, entries, weekCols,
  onSaveTitle, onSaveDesc, onDelete, onArchive, onSaveEntry, onDeleteEntry,
}: {
  obj: ObjectiveV2
  index: number
  entries: EntryV2[]
  weekCols: WeekCol[]
  onSaveTitle: (id: string, t: string) => Promise<void>
  onSaveDesc: (id: string, d: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onSaveEntry: (oid: string, ws: string, content: string) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
}) {
  const [editTitle, setEditTitle] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [titleVal, setTitleVal] = useState(obj.title)
  const [descVal, setDescVal] = useState(obj.description)
  const wf = useWinFocused()

  async function saveTitle() {
    const t = titleVal.trim()
    if (!t) { setTitleVal(obj.title); setEditTitle(false); return }
    await onSaveTitle(obj.id, t)
    setEditTitle(false)
  }
  async function saveDesc() {
    await onSaveDesc(obj.id, descVal.trim())
    setEditDesc(false)
  }

  return (
    <div
      className="flex group/row"
      style={{
        marginTop: 18,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(255,255,255,0.02)',
        overflow: 'clip',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.03)'; el.style.borderColor = 'rgba(255,255,255,0.09)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.02)'; el.style.borderColor = 'rgba(255,255,255,0.05)' }}
    >
      {/* Left sticky panel */}
      <div
        className="sticky left-0 z-[15] w-[280px] flex-shrink-0 flex items-start gap-2 px-4 py-2"
        style={{ background: '#1E2535', borderRight: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex-1 min-w-0">
          {/* Goal badge */}
          <span
            className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mb-1.5 border"
            style={{
              color: 'rgba(226,232,240,0.4)',
              borderColor: 'rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            Goal {index + 1}
          </span>

          {/* Title */}
          {editTitle ? (
            <input autoFocus value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') { setTitleVal(obj.title); setEditTitle(false) } }}
              onBlur={() => { if (!wf.current) return; saveTitle() }}
              className="text-[17px] font-semibold text-[#E5E7EB] bg-transparent border-b border-[rgba(255,255,255,0.2)] focus:outline-none w-full block" />
          ) : (
            <span
              onClick={() => { setTitleVal(obj.title); setEditTitle(true) }}
              className="text-[17px] font-semibold text-[rgba(226,232,240,0.92)] cursor-text block leading-snug"
            >
              {obj.title}
            </span>
          )}

          {/* Description */}
          {editDesc ? (
            <input autoFocus value={descVal}
              onChange={e => setDescVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveDesc(); if (e.key === 'Escape') { setDescVal(obj.description); setEditDesc(false) } }}
              onBlur={() => { if (!wf.current) return; saveDesc() }}
              className="text-[12px] text-[rgba(226,232,240,0.55)] bg-transparent border-b border-[rgba(255,255,255,0.12)] focus:outline-none w-full mt-1.5" />
          ) : obj.description ? (
            <span
              onClick={() => { setDescVal(obj.description); setEditDesc(true) }}
              className="text-[12px] text-[rgba(226,232,240,0.58)] cursor-text block mt-1.5 leading-snug"
            >
              {obj.description}
            </span>
          ) : (
            <span
              onClick={() => { setDescVal(''); setEditDesc(true) }}
              className="text-[11px] text-transparent hover:text-[rgba(226,232,240,0.2)] cursor-text block mt-1.5 transition-colors select-none"
            >
              설명 추가
            </span>
          )}

          {/* Progress — bar + 0% 인라인 */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[10px] font-medium text-[rgba(226,232,240,0.32)] tracking-wide uppercase flex-shrink-0">진행률</span>
            <div className="flex-1 h-[2px] rounded-full bg-[rgba(255,255,255,0.07)]" />
            <span className="text-[10px] font-semibold text-[rgba(226,232,240,0.38)] flex-shrink-0">0%</span>
          </div>

          {/* Assignee + Due Date — 한 줄 */}
          <div className="flex items-center gap-1.5 mt-2">
            <div className="w-4 h-4 rounded-full flex-shrink-0 border border-[rgba(255,255,255,0.1)]" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-[11px] text-[rgba(226,232,240,0.35)]">미지정</span>
            <span className="text-[10px] text-[rgba(226,232,240,0.2)] mx-0.5">·</span>
            <span className="text-[10px] font-medium text-[rgba(226,232,240,0.28)]">마감일</span>
            <span className="text-[10px] text-[rgba(226,232,240,0.22)]">미설정</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0 mt-1">
          <button
            onClick={() => onArchive(obj.id)}
            title="완료 처리"
            className="opacity-0 group-hover/row:opacity-100 text-[rgba(226,232,240,0.2)] hover:text-green-400 p-0.5 transition-all"
          >
            <CheckCheck size={9} />
          </button>
          <button
            onClick={() => onDelete(obj.id)}
            title="삭제"
            className="opacity-0 group-hover/row:opacity-100 text-[rgba(226,232,240,0.2)] hover:text-red-400 p-0.5 transition-all"
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>

      {/* Week cells */}
      {weekCols.map((col) => {
        const entry = entries.find(e => e.week_start === col.start)
        const displayIdx = WEEK_REL_LABELS.indexOf(col.label)
        return (
          <div
            key={col.start}
            className="flex-shrink-0 p-2"
            style={{
              width: col.isThisWeek ? TODAY_W : COL_W,
              background: col.isThisWeek ? 'rgba(76,127,224,0.05)' : 'transparent',
              borderLeft: col.isThisWeek ? '1px solid rgba(76,127,224,0.15)' : '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <MatrixCell
              entry={entry}
              objectiveId={obj.id}
              weekStart={col.start}
              weekIndex={displayIdx >= 0 ? displayIdx : 2}
              isThisWeek={col.isThisWeek}
              isFuture={col.isFuture}
              objTitle={obj.title}
              onSave={onSaveEntry}
              onDelete={onDeleteEntry}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── GroupSection ───────────────────────────────────────────
function GroupSection({
  group, objectives, entries, weekCols, isOpen, onToggle,
  onDeleteGroup, onSaveGroupName, onAddObjective, onDeleteObj, onArchiveObj,
  onSaveObjTitle, onSaveObjDesc, onSaveEntry, onDeleteEntry,
}: {
  group: GroupV2
  objectives: ObjectiveV2[]
  entries: EntryV2[]
  weekCols: WeekCol[]
  isOpen: boolean
  onToggle: () => void
  onDeleteGroup: (id: string) => Promise<void>
  onSaveGroupName: (id: string, name: string) => Promise<void>
  onAddObjective: (groupId: string, title: string, desc: string) => Promise<void>
  onDeleteObj: (id: string) => Promise<void>
  onArchiveObj: (id: string) => Promise<void>
  onSaveObjTitle: (id: string, t: string) => Promise<void>
  onSaveObjDesc: (id: string, d: string) => Promise<void>
  onSaveEntry: (oid: string, ws: string, content: string) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
}) {
  const [addingObj, setAddingObj] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(group.name)
  const wfGrp = useWinFocused()

  const thisWeekStart = weekCols.find(c => c.isThisWeek)?.start ?? ''
  const groupObjIds = new Set(objectives.map(o => o.id))
  const groupEntries = entries.filter(e => groupObjIds.has(e.objective_id))
  const thisWeekCount = groupEntries.filter(e => e.week_start === thisWeekStart && e.content).length

  async function handleAddObj() {
    const t = newTitle.trim()
    if (!t) return
    await onAddObjective(group.id, t, newDesc.trim())
    setNewTitle(''); setNewDesc(''); setAddingObj(false)
  }

  const color   = dotColor(group.name)
  const bgColor = hexAlpha(color, 0.09)
  const hoverBg = hexAlpha(color, 0.15)

  return (
    <div style={{
      borderRadius: 12,
      overflow: 'clip',
      marginBottom: 8,
      border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(255,255,255,0.03)',
    }}>
      {/* Group header row */}
      <div
        onClick={editingName ? undefined : onToggle}
        className="flex items-center cursor-pointer select-none group/grp"
        style={{
          background: bgColor,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: 57,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = bgColor }}
      >
        {/* Sticky left — 팀 이름 (z-14, ObjectiveRow sticky z-15 아래) */}
        <div
          className="sticky left-0 z-[14] flex items-center flex-shrink-0"
          style={{ width: LEFT_W, background: bgColor, minHeight: 57, padding: '12px 20px', borderRight: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Expand icon */}
          <ChevronRight
            size={15}
            className="flex-shrink-0 mr-3 text-[rgba(226,232,240,0.38)] transition-transform duration-[130ms]"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />

          {/* Color dot */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0 mr-3"
            style={{ backgroundColor: color }}
          />

          {/* Team info */}
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input
                autoFocus
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    if (nameVal.trim()) onSaveGroupName(group.id, nameVal.trim())
                    setEditingName(false)
                  }
                  if (e.key === 'Escape') { setNameVal(group.name); setEditingName(false) }
                }}
                onBlur={() => { if (!wfGrp.current) return; if (nameVal.trim()) onSaveGroupName(group.id, nameVal.trim()); setEditingName(false) }}
                onClick={e => e.stopPropagation()}
                className="text-[16px] font-bold text-[rgba(226,232,240,0.92)] bg-transparent border-b border-[rgba(255,255,255,0.25)] focus:outline-none w-full max-w-[200px]"
              />
            ) : (
              <span
                className="text-[16px] font-bold text-[rgba(226,232,240,0.92)] block leading-snug cursor-text truncate"
                onClick={e => { e.stopPropagation(); setNameVal(group.name); setEditingName(true) }}
              >
                {group.name}
              </span>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-[rgba(226,232,240,0.38)]">목표 {objectives.length}개</span>
              <span className="text-[10px] text-[rgba(226,232,240,0.2)]">·</span>
              <span className="text-[11px] text-[rgba(226,232,240,0.38)]">이번주 업데이트 {thisWeekCount}건</span>
            </div>
          </div>
        </div>

        {/* Right — 스크롤과 함께 이동, 우측 정렬 액션 */}
        <div
          className="flex-1 flex items-center justify-end pr-5"
          onClick={e => e.stopPropagation()}
        >
          {/* Status Badge — placeholder: 보고 완료 */}
          <div
            className="flex items-center gap-1.5 px-2.5 h-6 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] flex-shrink-0" />
            <span className="text-[11px] font-medium" style={{ color: 'rgba(34,197,94,0.85)' }}>보고 완료</span>
          </div>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[rgba(226,232,240,0.3)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.65)] transition-colors ml-2"
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {/* Objective rows */}
      {isOpen && (
        <>
          {objectives.map((obj, idx) => (
            <ObjectiveRow
              key={obj.id}
              obj={obj}
              index={idx}
              entries={entries.filter(e => e.objective_id === obj.id)}
              weekCols={weekCols}
              onSaveTitle={onSaveObjTitle}
              onSaveDesc={onSaveObjDesc}
              onDelete={onDeleteObj}
              onArchive={onArchiveObj}
              onSaveEntry={onSaveEntry}
              onDeleteEntry={onDeleteEntry}
            />
          ))}

          {/* 목표 추가 영역 — 목록 하단 */}
          <div className="px-3 pt-2 pb-3">
            {addingObj ? (
              <div
                className="rounded-[12px] border px-5 py-4 flex flex-col gap-2"
                style={{ borderColor: 'rgba(76,127,224,0.25)', background: 'rgba(255,255,255,0.02)' }}
              >
                <input
                  autoFocus value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddObj()
                    if (e.key === 'Escape') { setAddingObj(false); setNewTitle(''); setNewDesc('') }
                  }}
                  placeholder="목표 입력"
                  className="text-[14px] font-semibold text-[#E5E7EB] placeholder:text-[#5B6270] border-b border-[rgba(255,255,255,0.2)] focus:outline-none bg-transparent w-full pb-1"
                />
                <input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddObj()
                    if (e.key === 'Escape') { setAddingObj(false); setNewTitle(''); setNewDesc('') }
                  }}
                  placeholder="설명 (선택)"
                  className="text-[12px] text-[rgba(226,232,240,0.4)] placeholder:text-[#5B6270] border-b border-[rgba(255,255,255,0.12)] focus:outline-none bg-transparent w-full pb-1"
                />
                <div className="flex gap-2 mt-1">
                  <button onClick={handleAddObj} className="text-xs text-[#4C7FE0] font-medium hover:opacity-70 transition-opacity">추가</button>
                  <button onClick={() => { setAddingObj(false); setNewTitle(''); setNewDesc('') }}
                    className="text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.6)] transition-colors">취소</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingObj(true)}
                className="w-full h-[52px] rounded-[12px] border border-dashed border-[rgba(255,255,255,0.08)] flex items-center justify-center gap-2 text-[13px] font-medium text-[rgba(226,232,240,0.55)] hover:bg-[rgba(255,255,255,0.025)] hover:border-[rgba(255,255,255,0.16)] hover:text-[rgba(226,232,240,0.8)] transition-all"
                style={{ background: 'transparent' }}
              >
                <Plus size={13} />
                {objectives.length === 0 ? '첫 번째 목표 추가' : '목표 추가'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── FeedPanel ──────────────────────────────────────────────
function FeedPanel({
  groups, objectives, entries, weekCols, onSaveEntry, onDeleteEntry,
}: {
  groups: GroupV2[]
  objectives: ObjectiveV2[]
  entries: EntryV2[]
  weekCols: WeekCol[]
  onSaveEntry: (oid: string, ws: string, content: string) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
}) {
  const [filterGid, setFilterGid] = useState<string | null>(null)
  const [modalItem, setModalItem] = useState<FeedItem | null>(null)

  const thisWeekStart = weekCols.find(c => c.isThisWeek)?.start ?? ''

  const allItems = useMemo(() => {
    return entries
      .filter(e => e.content?.replace(/<[^>]*>/g, '').trim())
      .map(e => {
        const objective = objectives.find(o => o.id === e.objective_id)
        if (!objective) return null
        const group = groups.find(g => g.id === objective.group_id)
        if (!group) return null
        return { entry: e, objective, group } as FeedItem
      })
      .filter((x): x is FeedItem => x !== null)
      .sort((a, b) => b.entry.week_start.localeCompare(a.entry.week_start))
  }, [entries, objectives, groups])

  const filtered = filterGid ? allItems.filter(i => i.group.id === filterGid) : allItems

  // week_start 기준 그룹화
  const grouped = useMemo(() => {
    const map = new Map<string, FeedItem[]>()
    for (const item of filtered) {
      const k = item.entry.week_start
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(item)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  function groupLabel(weekStart: string): string {
    const col = weekCols.find(c => c.start === weekStart)
    if (col) return col.label   // '이번주' | '지난주' | '2주전'
    const [, mm, dd] = weekStart.split('-')
    return `${parseInt(mm)}/${parseInt(dd)}`
  }

  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  return (
    <>
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ width: 272, borderLeft: '1px solid rgba(255,255,255,0.07)', background: '#161B24' }}
      >
        {/* 헤더 */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-[11px] font-bold text-[rgba(226,232,240,0.38)] uppercase tracking-[.06em]">
            이번 분기 활동
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(76,127,224,0.12)', color: 'rgba(76,127,224,0.85)', border: '1px solid rgba(76,127,224,0.18)' }}
          >
            {allItems.length}
          </span>
        </div>

        {/* 팀 필터 칩 */}
        {groups.length > 1 && (
          <div
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none flex-wrap"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <button
              onClick={() => setFilterGid(null)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition-all"
              style={{
                background: !filterGid ? 'rgba(76,127,224,0.15)' : 'rgba(255,255,255,0.04)',
                color: !filterGid ? 'rgba(76,127,224,0.9)' : 'rgba(226,232,240,0.4)',
                border: `1px solid ${!filterGid ? 'rgba(76,127,224,0.25)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              전체
            </button>
            {groups.map(g => {
              const active = filterGid === g.id
              const c = dotColor(g.name)
              return (
                <button
                  key={g.id}
                  onClick={() => setFilterGid(active ? null : g.id)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition-all"
                  style={{
                    background: active ? hexAlpha(c, 0.15) : 'rgba(255,255,255,0.04)',
                    color: active ? c : 'rgba(226,232,240,0.4)',
                    border: `1px solid ${active ? hexAlpha(c, 0.35) : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  {g.name}
                </button>
              )
            })}
          </div>
        )}

        {/* 피드 본문 */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none py-1.5">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-[12px] text-[rgba(226,232,240,0.28)]">
              업데이트 없음
            </div>
          ) : grouped.map(([weekStart, items]) => {
            const label = groupLabel(weekStart)
            const isThis = weekStart === thisWeekStart
            const [, mm, dd] = weekStart.split('-')
            const dateDisplay = `${parseInt(mm)}/${parseInt(dd)}`
            return (
              <div key={weekStart} className="mb-1">
                {/* 날짜 그룹 헤더 */}
                <div
                  className="flex items-center gap-2 px-4 py-1.5 sticky top-0"
                  style={{ background: '#161B24' }}
                >
                  <span className="text-[10px] font-bold text-[rgba(226,232,240,0.28)] uppercase tracking-[.05em] flex-shrink-0">
                    {label}
                  </span>
                  {isThis && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: 'rgba(34,197,94,0.12)', color: 'rgba(34,197,94,0.85)', border: '1px solid rgba(34,197,94,0.2)' }}
                    >
                      Live
                    </span>
                  )}
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <span className="text-[10px] text-[rgba(226,232,240,0.22)] flex-shrink-0">{dateDisplay}</span>
                </div>

                {/* 항목들 */}
                {items.map(item => {
                  const c = dotColor(item.group.name)
                  const preview = stripHtml(item.entry.content)
                  return (
                    <div key={item.entry.id} className="px-2 pb-0.5">
                      <div
                        onClick={() => setModalItem(item)}
                        className="rounded-[10px] px-3 py-2 cursor-pointer transition-colors"
                        style={{ borderLeft: `2.5px solid ${c}` }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <div className="flex items-center gap-1.5 mb-1 min-w-0">
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
                          <span className="text-[11px] font-bold text-[rgba(226,232,240,0.85)] flex-shrink-0">{item.group.name}</span>
                          <span className="text-[10px] text-[rgba(226,232,240,0.25)] flex-shrink-0">·</span>
                          <span className="text-[11px] text-[rgba(226,232,240,0.48)] truncate">{item.objective.title}</span>
                        </div>
                        <p className="text-[11.5px] leading-[1.55] text-[rgba(226,232,240,0.48)] line-clamp-2">
                          {preview}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* 피드에서 열린 모달 */}
      {modalItem && (
        <EntryModal
          entry={modalItem.entry}
          objTitle={modalItem.objective.title}
          weekLabel={`${groupLabel(modalItem.entry.week_start)} (${modalItem.entry.week_start.split('-').slice(1).map(Number).join('/')})`}
          onClose={() => setModalItem(null)}
          onSave={async content => { await onSaveEntry(modalItem.entry.objective_id, modalItem.entry.week_start, content) }}
          onDelete={async () => { await onDeleteEntry(modalItem.entry.id); setModalItem(null) }}
        />
      )}
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function ObjectivesTestPage() {
  const supabase = createClient()
  const now = new Date()
  const [selYear, setSelYear] = useState(() => now.getFullYear())
  const [selQ, setSelQ] = useState(() => Math.ceil((now.getMonth() + 1) / 3))
  const activeQ = `${selYear}-Q${selQ}`

  const weekCols = getFixedWeekCols()
  const [showPrevWeeks, setShowPrevWeeks] = useState(false)
  const visibleCols = showPrevWeeks ? weekCols : weekCols.filter(c => c.isThisWeek)

  const [groups, setGroups] = useState<GroupV2[]>([])
  const [objectives, setObjectives] = useState<ObjectiveV2[]>([])
  const [entries, setEntries] = useState<EntryV2[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  useEffect(() => { loadAll() }, [selYear, selQ])

  async function loadAll() {
    setLoading(true)
    const [{ data: g }, { data: o }] = await Promise.all([
      supabase.from('objective_groups_v2').select('*').order('sort_order'),
      supabase.from('objectives_v2').select('*').eq('quarter', activeQ).order('sort_order'),
    ])
    const grps = (g ?? []) as GroupV2[]
    const objs = (o ?? []) as ObjectiveV2[]
    let ens: EntryV2[] = []
    if (objs.length > 0) {
      const { data: eData } = await supabase.from('objective_entries_v2')
        .select('*').in('objective_id', objs.map(x => x.id))
      ens = (eData ?? []) as EntryV2[]
    }
    setGroups(grps)
    setObjectives(objs)
    setEntries(ens)
    setExpandedGroups(new Set(grps.map(g => g.id)))
    setLoading(false)
  }

  // ── Group CRUD ─────────────────────────────────────────
  async function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    const COLORS = ['#4A7FC0','#5DBD97','#E8914A','#A855F7','#EF4444','#F59E0B','#EC4899','#06B6D4']
    const color = COLORS[groups.length % COLORS.length]
    const sort_order = (groups[groups.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('objective_groups_v2').insert({ name, color, sort_order }).select().single()
    if (data) {
      const grp = data as GroupV2
      setGroups(p => [...p, grp])
      setExpandedGroups(p => new Set([...p, grp.id]))
      // 팀 생성 시 정기보고 목표 자동 추가
      const { data: objData } = await supabase.from('objectives_v2')
        .insert({ group_id: grp.id, title: `${name}팀 정기보고`, description: '', quarter: activeQ, sort_order: 1 })
        .select().single()
      if (objData) setObjectives(p => [...p, objData as ObjectiveV2])
    }
    setNewGroupName(''); setAddingGroup(false)
  }

  async function saveGroupName(id: string, name: string) {
    await supabase.from('objective_groups_v2').update({ name }).eq('id', id)
    setGroups(p => p.map(g => g.id === id ? { ...g, name } : g))
  }

  async function deleteGroup(id: string) {
    if (!confirm('팀을 삭제하면 관련 목표와 기록이 모두 삭제됩니다.')) return
    await supabase.from('objective_groups_v2').delete().eq('id', id)
    const removedIds = objectives.filter(o => o.group_id === id).map(o => o.id)
    setGroups(p => p.filter(g => g.id !== id))
    setObjectives(p => p.filter(o => o.group_id !== id))
    setEntries(p => p.filter(e => !removedIds.includes(e.objective_id)))
  }

  // ── Objective CRUD ─────────────────────────────────────
  async function addObjective(groupId: string, title: string, description: string) {
    const gObjs = objectives.filter(o => o.group_id === groupId)
    const sort_order = (gObjs[gObjs.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('objectives_v2')
      .insert({ group_id: groupId, title, description, quarter: activeQ, sort_order }).select().single()
    if (data) setObjectives(p => [...p, data as ObjectiveV2])
  }

  async function deleteObjective(id: string) {
    await supabase.from('objectives_v2').delete().eq('id', id)
    setObjectives(p => p.filter(o => o.id !== id))
    setEntries(p => p.filter(e => e.objective_id !== id))
  }

  async function saveObjTitle(id: string, title: string) {
    await supabase.from('objectives_v2').update({ title }).eq('id', id)
    setObjectives(p => p.map(o => o.id === id ? { ...o, title } : o))
  }

  async function saveObjDesc(id: string, description: string) {
    await supabase.from('objectives_v2').update({ description }).eq('id', id)
    setObjectives(p => p.map(o => o.id === id ? { ...o, description } : o))
  }

  // ── Entry CRUD ─────────────────────────────────────────
  async function saveEntry(objectiveId: string, weekStart: string, content: string) {
    const { data } = await supabase.from('objective_entries_v2')
      .upsert({ objective_id: objectiveId, week_start: weekStart, content }, { onConflict: 'objective_id,week_start' })
      .select().single()
    if (data) {
      setEntries(p => {
        const filtered = p.filter(e => !(e.objective_id === objectiveId && e.week_start === weekStart))
        return [...filtered, data as EntryV2]
      })
    }
  }

  async function deleteEntry(id: string) {
    await supabase.from('objective_entries_v2').delete().eq('id', id)
    setEntries(p => p.filter(e => e.id !== id))
  }

  // ── Archive Objective ──────────────────────────────────
  async function archiveObjective(id: string) {
    const archivedQ = `${activeQ}_done`
    await supabase.from('objectives_v2').update({ quarter: archivedQ }).eq('id', id)
    setObjectives(p => p.filter(o => o.id !== id))
    setEntries(p => p.filter(e => e.objective_id !== id))
  }

  // ── MD Export ─────────────────────────────────────────
  function exportMarkdown() {
    let md = `# 목표 리뷰 — ${selYear} Q${selQ}\n\n`
    for (const group of groups) {
      const gObjs = objectives.filter(o => o.group_id === group.id)
      md += `## ${group.name}\n\n`
      for (const obj of gObjs) {
        md += `### ${obj.title}\n`
        if (obj.description) md += `> ${obj.description}\n`
        md += '\n'
        const objEntries = entries.filter(e => e.objective_id === obj.id)
        const sortedEntries = [...objEntries].sort((a, b) => a.week_start.localeCompare(b.week_start))
        for (const en of sortedEntries) {
          const col = weekCols.find(c => c.start === en.week_start)
          const label = col?.label ?? en.week_start
          const text = en.content.replace(/<[^>]*>/g, '').trim()
          if (text) md += `**${label}**: ${text}\n\n`
        }
      }
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `목표리뷰_${selYear}Q${selQ}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Stats ──────────────────────────────────────────────
  const thisWeekStart = weekCols.find(c => c.isThisWeek)?.start ?? ''
  const thisWeekEntries = entries.filter(e => e.week_start === thisWeekStart && e.content)

  const totalMinW = LEFT_W + visibleCols.filter(c => !c.isThisWeek).length * COL_W + TODAY_W

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── PageHeader ────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-bold text-[#E2E8F0] leading-none">목표 리뷰</h1>
            <Info size={13} className="text-[rgba(226,232,240,0.28)] flex-shrink-0" />
            <span className="text-[11px] text-[rgba(226,232,240,0.45)] ml-0.5">
              주간 목표 진행상황을 리뷰합니다.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* + 팀 추가 */}
            <button
              onClick={() => setAddingGroup(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all"
              style={{ background: 'rgba(76,127,224,0.1)', color: 'rgba(76,127,224,0.85)', borderColor: 'rgba(76,127,224,0.22)' }}
            >
              <Plus size={12} />
              팀 추가
            </button>
            {/* 이전주 토글 */}
            <button
              onClick={() => setShowPrevWeeks(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all"
              style={{
                background: showPrevWeeks ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                color: showPrevWeeks ? 'rgba(226,232,240,0.65)' : 'rgba(226,232,240,0.38)',
                borderColor: showPrevWeeks ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
              }}
            >
              {showPrevWeeks ? '이전주 접기' : '이전주 보기'}
            </button>
            {/* MD 다운로드 */}
            <button
              onClick={exportMarkdown}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border border-[rgba(255,255,255,0.08)] text-[rgba(226,232,240,0.45)] hover:text-[rgba(226,232,240,0.75)] hover:bg-[rgba(255,255,255,0.06)] transition-all"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              <Download size={12} />
              MD 저장
            </button>
            {/* Q Pill */}
            <div
              className="px-3 py-1 rounded-full text-[11.5px] font-semibold"
              style={{
                background: 'rgba(76,127,224,0.12)',
                color: 'rgba(76,127,224,0.85)',
                border: '1px solid rgba(76,127,224,0.22)',
              }}
            >
              {selYear} · Q{selQ}
            </div>
          </div>
        </div>
      </div>

      {/* ── QuarterNav ────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-4">
          {/* Year navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelYear(y => y - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.07)] hover:text-[rgba(226,232,240,0.8)] transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[13px] font-semibold text-[rgba(226,232,240,0.82)] min-w-[38px] text-center select-none">
              {selYear}
            </span>
            <button
              onClick={() => setSelYear(y => y + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.07)] hover:text-[rgba(226,232,240,0.8)] transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Quarter pills */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map(q => (
              <button
                key={q}
                onClick={() => setSelQ(q)}
                className={`px-4 h-[32px] rounded-full text-[12px] font-semibold border transition-all ${
                  selQ === q
                    ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]'
                    : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[rgba(226,232,240,0.45)] hover:text-[rgba(226,232,240,0.78)] hover:bg-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.13)]'
                }`}
              >
                Q{q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── StatsRow ──────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2">
          {/* Card 1: 현재 분기 */}
          <div
            className="flex flex-col justify-center px-4 rounded-[12px] border cursor-default hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            style={{ height: 64, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={11} className="text-[rgba(226,232,240,0.3)]" />
              <span className="text-[11px] text-[rgba(226,232,240,0.38)]">현재 분기</span>
            </div>
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[22px] font-bold text-[rgba(226,232,240,0.88)]">Q{selQ}</span>
              <span className="text-[13px] font-medium text-[rgba(226,232,240,0.45)]">{selYear}</span>
            </div>
          </div>

          {/* Card 2: 리뷰 상태 */}
          <div
            className="flex flex-col justify-center px-4 rounded-[12px] border cursor-default hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            style={{ height: 64, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Users size={11} className="text-[rgba(226,232,240,0.3)]" />
              <span className="text-[11px] text-[rgba(226,232,240,0.38)]">리뷰 상태</span>
            </div>
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[22px] font-bold text-[rgba(226,232,240,0.88)]">{groups.length}</span>
              <span className="text-[11px] font-medium" style={{ color: 'rgba(34,197,94,0.75)' }}>보고 완료</span>
            </div>
          </div>

          {/* Card 3: 이번주 업데이트 */}
          <div
            className="flex flex-col justify-center px-4 rounded-[12px] border cursor-default hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            style={{ height: 64, background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={11} className="text-[rgba(76,127,224,0.5)]" />
              <span className="text-[11px] text-[rgba(226,232,240,0.38)]">이번주 업데이트</span>
            </div>
            <span className="text-[22px] font-bold leading-none" style={{ color: 'rgba(76,127,224,0.88)' }}>
              {thisWeekEntries.length}
            </span>
          </div>
        </div>
      </div>

      {/* ── MainLayout ───────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── MainContent ──────────────────────────────── */}
        <div className="flex-1 min-h-0 min-w-0 overflow-auto scrollbar-none" id="matrix-scroll">

          {/* Team List */}
          <div style={{ minWidth: totalMinW }}>
            {loading ? (
              <div className="flex items-center justify-center h-40 text-[13px] text-[rgba(226,232,240,0.4)]">불러오는 중…</div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  <Users size={24} className="text-[rgba(226,232,240,0.28)]" />
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-[rgba(226,232,240,0.62)] mb-1">아직 생성된 팀이 없습니다</p>
                  <p className="text-[12px] text-[rgba(226,232,240,0.35)]">팀을 만들고 분기 목표를 관리하세요</p>
                </div>
                <button
                  onClick={() => setAddingGroup(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-[13px] font-semibold hover:opacity-85 transition-opacity"
                  style={{ background: '#4C7FE0' }}
                >
                  <Plus size={13} />
                  첫 번째 팀 만들기
                </button>
              </div>
            ) : (
              <>
                {groups.map(group => (
                  <GroupSection
                    key={group.id}
                    group={group}
                    objectives={objectives.filter(o => o.group_id === group.id)}
                    entries={entries}
                    weekCols={visibleCols}
                    isOpen={expandedGroups.has(group.id)}
                    onToggle={() => setExpandedGroups(p => {
                      const s = new Set(p); s.has(group.id) ? s.delete(group.id) : s.add(group.id); return s
                    })}
                    onDeleteGroup={deleteGroup}
                    onSaveGroupName={saveGroupName}
                    onAddObjective={addObjective}
                    onDeleteObj={deleteObjective}
                    onArchiveObj={archiveObjective}
                    onSaveObjTitle={saveObjTitle}
                    onSaveObjDesc={saveObjDesc}
                    onSaveEntry={saveEntry}
                    onDeleteEntry={deleteEntry}
                  />
                ))}
                {addingGroup && (
                  <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <input
                      autoFocus
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addGroup() }
                        if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
                      }}
                      placeholder="팀 이름 입력 후 Enter"
                      className="flex-1 text-[13px] bg-transparent focus:outline-none"
                      style={{ color: 'rgba(226,232,240,0.85)', borderBottom: '1px solid rgba(255,255,255,0.18)' }}
                    />
                    <button onClick={addGroup}
                      className="text-[11px] px-3 py-1 rounded-full font-semibold transition-all"
                      style={{ background: 'rgba(76,127,224,0.15)', color: 'rgba(76,127,224,0.9)', border: '1px solid rgba(76,127,224,0.25)' }}>
                      추가
                    </button>
                    <button onClick={() => { setAddingGroup(false); setNewGroupName('') }}
                      className="text-[11px] px-2 py-1 rounded-full transition-all"
                      style={{ color: 'rgba(226,232,240,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      취소
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        {/* ── FeedPanel ────────────────────────────────── */}
        <FeedPanel
          groups={groups}
          objectives={objectives}
          entries={entries}
          weekCols={visibleCols}
          onSaveEntry={saveEntry}
          onDeleteEntry={deleteEntry}
        />

      </div>
    </div>
  )
}
