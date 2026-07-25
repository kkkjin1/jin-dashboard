'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_PALETTE, TEAM_COLOR, colorKeyFromName } from '@/lib/categoryColors'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react'
import MarkdownContent from '@/components/MarkdownContent'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

interface ObjGroup    { id: string; name: string; color: string; sort_order: number }
interface ObjObjective { id: string; group_id: string; title: string; quarter: string; sort_order: number }
interface ObjSubItem  { id: string; objective_id: string; title: string; sort_order: number }
interface ObjSubEntry { id: string; sub_item_id: string; entry_date: string; content: string }

const GROUP_COLORS = ['#4A7FC0','#5DBD97','#E8914A','#A855F7','#EF4444','#F59E0B','#EC4899','#06B6D4','#84CC16','#8B5CF6']

function teamDotColor(name: string): string {
  const key = TEAM_COLOR[name] ?? colorKeyFromName(name)
  return CATEGORY_PALETTE[key].solid
}
function teamHeaderBg(name: string): string {
  const hex = teamDotColor(name)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.09)`
}

// Alt+Tab 등 윈도우 포커스 이탈 시 편집창 닫힘 방지
function useWindowFocused() {
  const ref = useRef(true)
  useEffect(() => {
    const onBlur = () => { ref.current = false }
    const onFocus = () => { ref.current = true }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return ref
}

function currentQuarter(d = new Date()): string {
  return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`
}
function quarterLabel(q: string): string { const [y, qp] = q.split('-'); return `${y} ${qp}` }
function formatDate(d: string) { try { return format(parseISO(d), 'M/d(eee)', { locale: ko }) } catch { return d } }
function todayStr() { return format(new Date(), 'yyyy-MM-dd') }
function getThisWeekRange(): [string, string] {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return [format(monday, 'yyyy-MM-dd'), format(sunday, 'yyyy-MM-dd')]
}

// ── SubCell ────────────────────────────────────────────────
interface SubCellProps {
  entry: ObjSubEntry | undefined
  subItemId: string
  date: string
  onSave: (subItemId: string, date: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  large?: boolean
  isThisWeek?: boolean
}
function SubCell({ entry, subItemId, date, onSave, onDelete, large, isThisWeek }: SubCellProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(entry?.content ?? '')
  const cellH    = large ? 320 : 90
  const editMinH = large ? 320 : 120
  const winFocused = useWindowFocused()

  async function save() {
    const textOnly = val.replace(/<[^>]*>/g, '').trim()
    if (!textOnly && entry) { await onDelete(entry.id); setEditing(false); return }
    if (textOnly) await onSave(subItemId, date, val)
    setEditing(false)
  }

  if (editing) {
    return (
      <div
        style={{ minHeight: editMinH }}
        className="min-w-[220px] bg-[rgba(255,255,255,0.04)] border border-[#4C7FE0]/40 rounded-[13px] overflow-hidden"
        onBlur={e => { if (!winFocused.current) return; if (!e.currentTarget.contains(e.relatedTarget as Node)) save() }}
      >
        <TiptapEditor
          dark
          value={val}
          onChange={setVal}
          onSubmit={save}
          onEscape={() => { setVal(entry?.content ?? ''); setEditing(false) }}
          autoFocus
          minHeight={editMinH - 20}
        />
      </div>
    )
  }

  if (entry?.content) {
    const accentBorder = (!large && isThisWeek) ? { borderLeftWidth: 3, borderLeftColor: '#4C7FE0' } : {}
    return (
      <div
        onClick={() => { setVal(entry.content); setEditing(true) }}
        style={{ minHeight: cellH, ...accentBorder }}
        className={large
          ? "min-w-[200px] cursor-text bg-[rgba(255,255,255,0.03)] rounded-lg px-2.5 py-1.5 hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          : "min-w-[220px] cursor-text bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.06)] rounded-[13px] px-4 py-3.5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all"
        }
      >
        <MarkdownContent content={entry.content} dark />
      </div>
    )
  }

  return (
    <div
      onClick={() => { setVal(''); setEditing(true) }}
      style={{ minHeight: cellH }}
      className={large
        ? "min-w-[200px] rounded-lg border border-dashed border-transparent hover:border-[rgba(255,255,255,0.09)] cursor-pointer transition-colors flex items-center px-2.5"
        : "min-w-[220px] rounded-[13px] border border-dashed border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5"
      }
    >
      {large
        ? <span className="text-xs select-none" style={{ color: '#5C6478' }}>클릭해서 입력</span>
        : <>
            <Plus size={13} style={{ color: 'rgba(255,255,255,0.18)' }} />
            <span className="text-[11px] select-none text-center" style={{ color: 'rgba(226,232,240,0.22)' }}>이번주 계획 입력</span>
          </>
      }
    </div>
  )
}

// ── SubItemTitle ───────────────────────────────────────────
function SubItemTitle({ si, onSave, onDelete }: {
  si: ObjSubItem
  onSave: (id: string, title: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(si.title)
  const winFocused = useWindowFocused()
  async function save() {
    const t = val.trim()
    if (!t) { setVal(si.title); setEditing(false); return }
    await onSave(si.id, t)
    setEditing(false)
  }
  if (editing) return (
    <input autoFocus value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) save()
        if (e.key === 'Escape') { setVal(si.title); setEditing(false) }
      }}
      onBlur={() => { if (!winFocused.current) return; save() }}
      className="text-[14px] text-[#E5E7EB] border-b border-[rgba(255,255,255,0.2)] focus:outline-none bg-transparent w-full" />
  )
  return (
    <div className="flex items-start gap-1 group/sititle">
      <span className="text-[14px] text-[rgba(226,232,240,0.7)] leading-relaxed flex-1 cursor-text"
        onClick={() => { setVal(si.title); setEditing(true) }}>
        {si.title}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover/sititle:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <button onClick={() => { setVal(si.title); setEditing(true) }}
          className="text-[rgba(226,232,240,0.2)] hover:text-[rgba(226,232,240,0.5)] p-0.5 transition-colors"><Pencil size={8} /></button>
        <button onClick={() => onDelete(si.id)}
          className="text-[rgba(226,232,240,0.2)] hover:text-red-400 p-0.5 transition-colors"><Trash2 size={8} /></button>
      </div>
    </div>
  )
}

// ── SubItemCard ────────────────────────────────────────────
interface SubItemCardProps {
  si: ObjSubItem
  siEntries: ObjSubEntry[]
  largeCells?: boolean
  onSaveTitle: (id: string, title: string) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
  onSaveEntry: (subItemId: string, date: string, content: string) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
}
function SubItemCard({ si, siEntries, largeCells, onSaveTitle, onDeleteItem, onSaveEntry, onDeleteEntry }: SubItemCardProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [addingToday, setAddingToday] = useState(false)
  const [weekStart, weekEnd] = getThisWeekRange()

  const latest = siEntries[0] as ObjSubEntry | undefined
  const older = siEntries.slice(1)
  const todayEntry = siEntries.find(e => e.entry_date === todayStr())

  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.06)] rounded-[13px] px-4 py-3.5 w-full">
      <SubItemTitle si={si} onSave={onSaveTitle} onDelete={onDeleteItem} />

      {addingToday ? (
        <div className="mt-3 w-full">
          <SubCell
            entry={todayEntry}
            subItemId={si.id}
            date={todayStr()}
            onSave={async (sid, date, content) => { await onSaveEntry(sid, date, content); setAddingToday(false) }}
            onDelete={async (id) => { await onDeleteEntry(id); setAddingToday(false) }}
            large={largeCells}
            isThisWeek={!largeCells}
          />
        </div>
      ) : latest ? (
        <>
          <div className="mt-3 w-full">
            <SubCell
              entry={latest}
              subItemId={si.id}
              date={latest.entry_date}
              onSave={onSaveEntry}
              onDelete={onDeleteEntry}
              large={largeCells}
              isThisWeek={!largeCells && latest.entry_date >= weekStart && latest.entry_date <= weekEnd}
            />
          </div>
          {latest.entry_date !== todayStr() && (
            <button onClick={() => setAddingToday(true)}
              className="mt-2 flex items-center gap-1 text-[11px] text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.6)] transition-colors">
              <Plus size={9} />오늘 업데이트 추가
            </button>
          )}
        </>
      ) : (
        <button onClick={() => setAddingToday(true)}
          className="mt-3 flex items-center gap-1.5 justify-center text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.6)] border border-dashed border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.16)] px-3 py-2 rounded-lg w-full transition-all">
          <Plus size={10} />업데이트 추가
        </button>
      )}

      {older.length > 0 && (
        <div className="mt-2.5">
          <button onClick={() => setShowHistory(v => !v)}
            className="text-[11px] text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.55)] transition-colors flex items-center gap-1">
            <span style={{ fontSize: 7 }}>{showHistory ? '▲' : '▼'}</span>이전 기록 {older.length}건
          </button>
          {showHistory && (
            <div className="mt-2 flex flex-col">
              <span className="text-[11px] text-[#7B8397] mb-1">이전 기록 {older.length}건</span>
              {older.map((e, i) => (
                <div key={e.id}>
                  {i > 0 && <div className="border-t border-[rgba(255,255,255,0.06)] my-2" />}
                  <div className="text-[11px] text-[#7B8397] mb-1">{formatDate(e.entry_date)}</div>
                  <MarkdownContent content={e.content} dark />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ObjectiveBlock ─────────────────────────────────────────
interface ObjectiveBlockProps {
  obj: ObjObjective
  color: string
  subItems: ObjSubItem[]
  subEntries: ObjSubEntry[]
  onDeleteObj: (id: string) => Promise<void>
  onSaveObjTitle: (id: string, title: string) => Promise<void>
  onAddSubItem: (objId: string, title: string) => Promise<void>
  onSaveSubItemTitle: (id: string, title: string) => Promise<void>
  onDeleteSubItem: (id: string) => Promise<void>
  onSaveSubEntry: (subItemId: string, date: string, content: string) => Promise<void>
  onDeleteSubEntry: (id: string) => Promise<void>
  onRenameDate?: (oldDate: string, newDate: string) => Promise<void>
  onDeleteDate?: (date: string) => Promise<void>
  largeCells?: boolean
}
function ObjectiveBlock({
  obj, color, subItems, subEntries,
  onDeleteObj, onSaveObjTitle,
  onAddSubItem, onSaveSubItemTitle, onDeleteSubItem,
  onSaveSubEntry, onDeleteSubEntry,
  largeCells,
}: ObjectiveBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(obj.title)
  const [addingItem, setAddingItem] = useState(false)
  const winFocused = useWindowFocused()
  const [newItemTitle, setNewItemTitle] = useState('')

  async function saveTitle() {
    const t = titleVal.trim()
    if (!t) { setTitleVal(obj.title); setEditingTitle(false); return }
    await onSaveObjTitle(obj.id, t)
    setEditingTitle(false)
  }

  async function submitItem() {
    const t = newItemTitle.trim()
    if (!t) return
    await onAddSubItem(obj.id, t)
    setNewItemTitle('')
    setAddingItem(false)
  }

  return (
    <div className="border-t border-[rgba(255,255,255,0.07)] first:border-t-0 pt-7 pb-7 last:pb-4 mx-4">
      {/* Objective title row */}
      <div onClick={() => setIsExpanded(v => !v)}
        className="flex items-center gap-2.5 px-0 py-2 group/obj cursor-pointer hover:opacity-90 transition-opacity select-none">
        <span style={{ fontSize: 8, color: '#94A3B8', display: 'inline-block', transition: 'transform .13s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>&#9654;</span>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {editingTitle ? (
          <input
            autoFocus value={titleVal}
            onClick={e => e.stopPropagation()}
            onChange={e => setTitleVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle()
              if (e.key === 'Escape') { setTitleVal(obj.title); setEditingTitle(false) }
            }}
            onBlur={() => { if (!winFocused.current) return; saveTitle() }}
            className="text-[15px] font-semibold text-[#E5E7EB] border-b border-[rgba(255,255,255,0.2)] focus:outline-none bg-transparent flex-1 max-w-xs"
          />
        ) : (
          <span className="text-[15px] font-semibold text-[rgba(226,232,240,0.9)]">{obj.title}</span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/obj:opacity-100 transition-opacity ml-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => { setEditingTitle(true); setTitleVal(obj.title) }}
            className="text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.5)] p-0.5 transition-colors"><Pencil size={9} /></button>
          <button onClick={() => onDeleteObj(obj.id)}
            className="text-[rgba(226,232,240,0.3)] hover:text-red-400 p-0.5 transition-colors"><Trash2 size={9} /></button>
        </div>
      </div>

      {/* 안건 카드 리스트 */}
      {isExpanded && (
        <div className="flex flex-col gap-3 mt-4 pb-2">
          {subItems.map(si => (
            <SubItemCard
              key={si.id}
              si={si}
              siEntries={subEntries.filter(e => e.sub_item_id === si.id)}
              largeCells={largeCells}
              onSaveTitle={onSaveSubItemTitle}
              onDeleteItem={onDeleteSubItem}
              onSaveEntry={onSaveSubEntry}
              onDeleteEntry={onDeleteSubEntry}
            />
          ))}

          {/* 안건 추가 */}
          {addingItem ? (
            <div className="flex items-center gap-1.5 px-1">
              <input
                autoFocus value={newItemTitle}
                onChange={e => setNewItemTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitItem()
                  if (e.key === 'Escape') { setAddingItem(false); setNewItemTitle('') }
                }}
                placeholder="안건 입력"
                className="text-[13px] text-[#E5E7EB] placeholder:text-[#5B6270] border-b border-[rgba(255,255,255,0.2)] focus:outline-none bg-transparent w-36"
              />
              <button onClick={submitItem}
                className="text-xs text-[#4C7FE0] font-medium hover:opacity-70 transition-opacity">확인</button>
              <button onClick={() => { setAddingItem(false); setNewItemTitle('') }}
                className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors">취소</button>
            </div>
          ) : (
            <button onClick={() => setAddingItem(true)}
              className="flex items-center gap-1 text-xs text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.6)] border border-dashed border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.04)] px-2.5 py-1.5 rounded-lg transition-all w-fit">
              <Plus size={9} />안건 추가
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── GroupNameEditor ────────────────────────────────────────
function GroupNameEditor({ name, onSave }: { name: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  function commit() { if (val.trim()) onSave(val.trim()); else setVal(name); setEditing(false) }
  if (editing) return (
    <input autoFocus value={val} onChange={e => setVal(e.target.value)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(); if (e.key === 'Escape') { setVal(name); setEditing(false) } }}
      onBlur={commit}
      className="text-[13px] font-semibold text-[rgba(226,232,240,0.9)] border-b border-gray-300 focus:outline-none bg-transparent w-32" />
  )
  return (
    <span className="text-[13px] font-semibold text-[rgba(226,232,240,0.9)] hover:text-[#4C7FE0] transition-colors"
      onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}>{name}</span>
  )
}

// ── GroupEditOverlay ───────────────────────────────────────
interface GroupEditOverlayProps {
  group: ObjGroup
  groupObjs: ObjObjective[]
  subItems: ObjSubItem[]
  subEntries: ObjSubEntry[]
  onClose: () => void
  onSaveGroupName: (name: string) => void
  onAddObjective: (title: string) => Promise<void>
  onDeleteObj: (id: string) => Promise<void>
  onSaveObjTitle: (id: string, title: string) => Promise<void>
  onAddSubItem: (objId: string, title: string) => Promise<void>
  onSaveSubItemTitle: (id: string, title: string) => Promise<void>
  onDeleteSubItem: (id: string) => Promise<void>
  onSaveSubEntry: (subItemId: string, date: string, content: string) => Promise<void>
  onDeleteSubEntry: (id: string) => Promise<void>
  onRenameDate: (oldDate: string, newDate: string) => Promise<void>
  onDeleteDate: (date: string) => Promise<void>
}
function GroupEditOverlay({
  group, groupObjs, subItems, subEntries,
  onClose, onSaveGroupName, onAddObjective,
  onDeleteObj, onSaveObjTitle, onAddSubItem, onSaveSubItemTitle, onDeleteSubItem,
  onSaveSubEntry, onDeleteSubEntry, onRenameDate, onDeleteDate,
}: GroupEditOverlayProps) {
  const [addingObj, setAddingObj] = useState(false)
  const [newObjTitle, setNewObjTitle] = useState('')

  async function handleAddObj() {
    const t = newObjTitle.trim()
    if (!t) return
    await onAddObjective(t)
    setNewObjTitle(''); setAddingObj(false)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: '#0F1319' }}>
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-[rgba(226,232,240,0.45)] hover:text-[#E5E7EB] transition-colors">
          <ChevronLeft size={15} />목표관리
        </button>
        <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: teamDotColor(group.name) }} />
        <GroupNameEditor name={group.name} onSave={onSaveGroupName} />
        <div className="ml-auto flex items-center gap-2">
          {addingObj ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={newObjTitle}
                onChange={e => setNewObjTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddObj()
                  if (e.key === 'Escape') { setAddingObj(false); setNewObjTitle('') }
                }}
                placeholder="목표 입력"
                className="text-xs px-2.5 py-1.5 border border-[rgba(255,255,255,0.09)] rounded-lg focus:outline-none focus:border-[rgba(255,255,255,0.2)] bg-[#1A1C1F] text-[#E5E7EB] placeholder:text-[#5B6270] w-44" />
              <button onClick={handleAddObj}
                className="text-xs px-2.5 py-1.5 bg-[#4C7FE0] text-white rounded-lg hover:bg-[#3A6CC8] transition-colors">추가</button>
              <button onClick={() => { setAddingObj(false); setNewObjTitle('') }}
                className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors">취소</button>
            </div>
          ) : (
            <button onClick={() => setAddingObj(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-dashed border-[rgba(255,255,255,0.15)] text-[rgba(226,232,240,0.5)] hover:border-[rgba(255,255,255,0.3)] hover:text-[rgba(226,232,240,0.8)] transition-all">
              <Plus size={11} />목표 추가
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {groupObjs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-[13px] text-[rgba(226,232,240,0.4)]">
            <p>목표를 추가하세요</p>
            <button onClick={() => setAddingObj(true)}
              className="text-xs px-4 py-2 rounded-full bg-[#4C7FE0]/10 text-[rgba(161,167,179,0.9)] hover:bg-[#4C7FE0]/20 transition-colors">
              + 목표 추가
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groupObjs.map(obj => (
              <div key={obj.id} className="surface-card rounded-2xl overflow-hidden">
                <ObjectiveBlock
                  obj={obj}
                  color={teamDotColor(group.name)}
                  subItems={subItems.filter(si => si.objective_id === obj.id)}
                  subEntries={subEntries.filter(se =>
                    subItems.filter(si => si.objective_id === obj.id).some(si => si.id === se.sub_item_id))}
                  onDeleteObj={onDeleteObj}
                  onSaveObjTitle={onSaveObjTitle}
                  onAddSubItem={onAddSubItem}
                  onSaveSubItemTitle={onSaveSubItemTitle}
                  onDeleteSubItem={onDeleteSubItem}
                  onSaveSubEntry={onSaveSubEntry}
                  onDeleteSubEntry={onDeleteSubEntry}
                  onRenameDate={onRenameDate}
                  onDeleteDate={onDeleteDate}
                  largeCells
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function ObjectivesPage() {
  const supabase = createClient()
  const nowInit = new Date()
  const [selectedYear, setSelectedYear] = useState(() => nowInit.getFullYear())
  const [selectedQ, setSelectedQ] = useState(() => Math.ceil((nowInit.getMonth() + 1) / 3))
  const activeQ = `${selectedYear}-Q${selectedQ}`
  const [groups, setGroups] = useState<ObjGroup[]>([])
  const [objectives, setObjectives] = useState<ObjObjective[]>([])
  const [subItems, setSubItems] = useState<ObjSubItem[]>([])
  const [subEntries, setSubEntries] = useState<ObjSubEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [addingObjFor, setAddingObjFor] = useState<string | null>(null)
  const [newObjTitle, setNewObjTitle] = useState('')
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [selectedYear, selectedQ])

  async function loadAll() {
    setLoading(true)
    const [{ data: g }, { data: o }] = await Promise.all([
      supabase.from('obj_groups').select('*').order('sort_order'),
      supabase.from('obj_objectives').select('*').eq('quarter', activeQ).order('sort_order'),
    ])
    const grps = (g ?? []) as ObjGroup[]
    const objs = (o ?? []) as ObjObjective[]

    let sis: ObjSubItem[] = []
    let ses: ObjSubEntry[] = []
    if (objs.length > 0) {
      const { data: siData } = await supabase.from('obj_sub_items').select('*')
        .in('objective_id', objs.map(x => x.id)).order('sort_order')
      sis = (siData ?? []) as ObjSubItem[]
      if (sis.length > 0) {
        const { data: seData } = await supabase.from('obj_sub_entries').select('*')
          .in('sub_item_id', sis.map(x => x.id)).order('entry_date', { ascending: false })
        ses = (seData ?? []) as ObjSubEntry[]
      }
    }

    setGroups(grps)
    setObjectives(objs)
    setSubItems(sis)
    setSubEntries(ses)
    setExpandedGroups(new Set())
    setLoading(false)
  }

  // ── Group CRUD ─────────────────────────────────────────
  async function addGroup() {
    const name = newGroupName.trim(); if (!name) return
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    const sort_order = (groups[groups.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('obj_groups').insert({ name, color, sort_order }).select().single()
    if (data) { const g = data as ObjGroup; setGroups(p => [...p, g]); setExpandedGroups(p => new Set([...p, g.id])) }
    setNewGroupName(''); setAddingGroup(false)
  }
  async function saveGroupName(id: string, name: string) {
    if (!name.trim()) return
    await supabase.from('obj_groups').update({ name: name.trim() }).eq('id', id)
    setGroups(p => p.map(g => g.id === id ? { ...g, name: name.trim() } : g))
  }
  async function deleteGroup(id: string) {
    if (!confirm('팀을 삭제하면 관련 목표와 기록이 모두 삭제됩니다. 계속할까요?')) return
    await supabase.from('obj_groups').delete().eq('id', id)
    setGroups(p => p.filter(g => g.id !== id))
    const removedObjs = objectives.filter(o => o.group_id === id).map(o => o.id)
    const removedSIs = subItems.filter(si => removedObjs.includes(si.objective_id)).map(si => si.id)
    setObjectives(p => p.filter(o => o.group_id !== id))
    setSubItems(p => p.filter(si => !removedObjs.includes(si.objective_id)))
    setSubEntries(p => p.filter(e => !removedSIs.includes(e.sub_item_id)))
  }
  function toggleGroup(id: string) {
    setExpandedGroups(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // ── Objective CRUD ─────────────────────────────────────
  async function addObjectiveForGroup(groupId: string, title: string) {
    const groupObjs = objectives.filter(o => o.group_id === groupId)
    const sort_order = (groupObjs[groupObjs.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('obj_objectives')
      .insert({ group_id: groupId, title, quarter: activeQ, sort_order }).select().single()
    if (data) setObjectives(p => [...p, data as ObjObjective])
  }
  async function addObjective(groupId: string) {
    const title = newObjTitle.trim(); if (!title) return
    const groupObjs = objectives.filter(o => o.group_id === groupId)
    const sort_order = (groupObjs[groupObjs.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('obj_objectives')
      .insert({ group_id: groupId, title, quarter: activeQ, sort_order }).select().single()
    if (data) setObjectives(p => [...p, data as ObjObjective])
    setNewObjTitle(''); setAddingObjFor(null)
  }
  async function saveObjTitle(id: string, title: string) {
    await supabase.from('obj_objectives').update({ title }).eq('id', id)
    setObjectives(p => p.map(o => o.id === id ? { ...o, title } : o))
  }
  async function deleteObjective(id: string) {
    await supabase.from('obj_objectives').delete().eq('id', id)
    const removedSIs = subItems.filter(si => si.objective_id === id).map(si => si.id)
    setObjectives(p => p.filter(o => o.id !== id))
    setSubItems(p => p.filter(si => si.objective_id !== id))
    setSubEntries(p => p.filter(e => !removedSIs.includes(e.sub_item_id)))
  }

  // ── SubItem CRUD ───────────────────────────────────────
  async function saveSubItemTitle(id: string, title: string) {
    await supabase.from('obj_sub_items').update({ title }).eq('id', id)
    setSubItems(p => p.map(si => si.id === id ? { ...si, title } : si))
  }
  async function addSubItem(objId: string, title: string) {
    const objSIs = subItems.filter(si => si.objective_id === objId)
    const sort_order = (objSIs[objSIs.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('obj_sub_items')
      .insert({ objective_id: objId, title, sort_order }).select().single()
    if (data) setSubItems(p => [...p, data as ObjSubItem])
  }
  async function deleteSubItem(id: string) {
    await supabase.from('obj_sub_items').delete().eq('id', id)
    setSubItems(p => p.filter(si => si.id !== id))
    setSubEntries(p => p.filter(e => e.sub_item_id !== id))
  }

  // ── Date CRUD ──────────────────────────────────────────
  async function renameDate(oldDate: string, newDate: string) {
    if (oldDate === newDate) return
    const toRename = subEntries.filter(e => e.entry_date === oldDate)
    for (const e of toRename) {
      await supabase.from('obj_sub_entries')
        .upsert({ sub_item_id: e.sub_item_id, entry_date: newDate, content: e.content }, { onConflict: 'sub_item_id,entry_date' })
    }
    if (toRename.length > 0) {
      await supabase.from('obj_sub_entries').delete().eq('entry_date', oldDate)
        .in('sub_item_id', toRename.map(e => e.sub_item_id))
    }
    setSubEntries(p => p.map(e => e.entry_date === oldDate ? { ...e, entry_date: newDate } : e))
  }
  async function deleteDate(date: string) {
    const toDelete = subEntries.filter(e => e.entry_date === date)
    if (toDelete.length > 0) {
      await supabase.from('obj_sub_entries').delete().eq('entry_date', date)
        .in('sub_item_id', toDelete.map(e => e.sub_item_id))
      setSubEntries(p => p.filter(e => e.entry_date !== date))
    }
  }

  // ── SubEntry CRUD ──────────────────────────────────────
  async function saveSubEntry(subItemId: string, date: string, content: string) {
    const { data } = await supabase.from('obj_sub_entries')
      .upsert({ sub_item_id: subItemId, entry_date: date, content }, { onConflict: 'sub_item_id,entry_date' })
      .select().single()
    if (data) {
      setSubEntries(p => {
        const filtered = p.filter(e => !(e.sub_item_id === subItemId && e.entry_date === date))
        return [...filtered, data as ObjSubEntry]
      })
    }
  }
  async function deleteSubEntry(id: string) {
    await supabase.from('obj_sub_entries').delete().eq('id', id)
    setSubEntries(p => p.filter(e => e.id !== id))
  }

  // ── Render ─────────────────────────────────────────────
  const expandedGroup = expandedGroupId ? groups.find(g => g.id === expandedGroupId) : null

  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6">
      {expandedGroup && (
        <GroupEditOverlay
          group={expandedGroup}
          groupObjs={objectives.filter(o => o.group_id === expandedGroupId)}
          subItems={subItems}
          subEntries={subEntries}
          onClose={() => setExpandedGroupId(null)}
          onSaveGroupName={(name) => saveGroupName(expandedGroupId!, name)}
          onAddObjective={(title) => addObjectiveForGroup(expandedGroupId!, title)}
          onDeleteObj={deleteObjective}
          onSaveObjTitle={saveObjTitle}
          onAddSubItem={addSubItem}
          onSaveSubItemTitle={saveSubItemTitle}
          onDeleteSubItem={deleteSubItem}
          onSaveSubEntry={saveSubEntry}
          onDeleteSubEntry={deleteSubEntry}
          onRenameDate={renameDate}
          onDeleteDate={deleteDate}
        />
      )}
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-5 px-4 md:px-6 flex-wrap">
        <h1 className="text-lg font-bold text-[#E2E8F0] flex-shrink-0">목표관리</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full px-1 py-1">
            <button onClick={() => setSelectedYear(y => y - 1)}
              className="w-6 h-6 flex items-center justify-center rounded-full text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)] transition-colors">
              <ChevronLeft size={13} />
            </button>
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.8)] px-1 min-w-[36px] text-center select-none">{selectedYear}</span>
            <button onClick={() => setSelectedYear(y => y + 1)}
              className="w-6 h-6 flex items-center justify-center rounded-full text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)] transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {[1,2,3,4].map(q => (
              <button key={q} onClick={() => setSelectedQ(q)}
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                  selectedQ === q ? 'bg-[#4C7FE0] text-white border-[#4C7FE0] shadow-sm' : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)]'
                }`}>Q{q}</button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex-shrink-0">
          {addingGroup ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') } }}
                placeholder="팀 이름" className="text-xs px-2.5 py-1.5 border border-[rgba(255,255,255,0.09)] rounded-lg focus:outline-none focus:border-[rgba(255,255,255,0.2)] bg-[#1A1C1F] text-[#E5E7EB] placeholder:text-[#5B6270] w-28" />
              <button onClick={addGroup} className="text-xs px-2.5 py-1.5 bg-[#4C7FE0] text-white rounded-lg hover:bg-[#3A6CC8] transition-colors">추가</button>
              <button onClick={() => { setAddingGroup(false); setNewGroupName('') }} className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors">취소</button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-[rgba(226,232,240,0.5)] hover:border-gray-400 hover:text-[rgba(226,232,240,0.8)] transition-all">
              <Plus size={12} />팀 추가
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[13px] text-[rgba(226,232,240,0.4)]">불러오는 중…</div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-[13px] text-[rgba(226,232,240,0.4)]">
            <p>팀을 추가하고 {quarterLabel(activeQ)} 목표를 관리하세요</p>
            <button onClick={() => setAddingGroup(true)}
              className="text-xs px-4 py-2 rounded-full bg-[#4C7FE0]/10 text-[#4C7FE0] hover:bg-[#4C7FE0]/15 transition-colors">+ 첫 번째 팀 추가</button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(group => {
              const isOpen = expandedGroups.has(group.id)
              const groupObjs = objectives.filter(o => o.group_id === group.id)
              const [weekStart, weekEnd] = getThisWeekRange()
              const groupSIIds = new Set(subItems.filter(si => groupObjs.some(o => o.id === si.objective_id)).map(si => si.id))
              const groupEntries = subEntries.filter(se => groupSIIds.has(se.sub_item_id))
              const thisWeekCount = groupEntries.filter(se => se.entry_date >= weekStart && se.entry_date <= weekEnd).length
              return (
                <div key={group.id} className="rounded-xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>

                  {/* Group header */}
                  <div
                    onClick={() => toggleGroup(group.id)}
                    className="flex items-center gap-2.5 cursor-pointer select-none px-4 py-3.5"
                    style={{ background: teamHeaderBg(group.name), borderBottom: isOpen ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: teamDotColor(group.name) }} />
                    <span onClick={e => e.stopPropagation()}>
                      <GroupNameEditor name={group.name} onSave={name => saveGroupName(group.id, name)} />
                    </span>
                    <div className="flex items-center gap-2 ml-1" onClick={e => e.stopPropagation()}>
                      <span className="text-[11px] text-[rgba(226,232,240,0.5)] font-medium">Goal {groupObjs.length}</span>
                      {thisWeekCount > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium"
                          style={{ background: 'rgba(74,127,224,0.15)', color: 'rgba(74,127,224,0.9)' }}>
                          이번주 {thisWeekCount}건
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: '#94A3B8', display: 'inline-block', transition: 'transform .13s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                    <div className="ml-auto flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {isOpen && (addingObjFor === group.id ? (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus value={newObjTitle} onChange={e => setNewObjTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addObjective(group.id); if (e.key === 'Escape') { setAddingObjFor(null); setNewObjTitle('') } }}
                            placeholder="목표 입력" className="text-xs px-2 py-1 border border-[rgba(255,255,255,0.09)] rounded-lg focus:outline-none focus:border-[rgba(255,255,255,0.2)] bg-[#1A1C1F] text-[#E5E7EB] placeholder:text-[#5B6270] w-40" />
                          <button onClick={() => addObjective(group.id)} className="text-xs px-2 py-1 bg-[#4C7FE0] text-white rounded-lg hover:bg-[#3A6CC8] transition-colors">추가</button>
                          <button onClick={() => { setAddingObjFor(null); setNewObjTitle('') }} className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors">취소</button>
                        </div>
                      ) : (
                        <button onClick={() => setAddingObjFor(group.id)}
                          className="flex items-center gap-1 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] border border-dashed border-[rgba(255,255,255,0.09)] hover:border-[rgba(255,255,255,0.25)] px-2 py-0.5 rounded-lg transition-all">
                          <Plus size={9} /> 목표 추가
                        </button>
                      ))}
                      <button onClick={() => setExpandedGroupId(group.id)} title="크게 편집"
                        className="text-[rgba(226,232,240,0.2)] hover:text-[#A1A7B3] transition-colors p-0.5"><Maximize2 size={11} /></button>
                      <button onClick={() => deleteGroup(group.id)}
                        className="text-[rgba(226,232,240,0.2)] hover:text-red-400 transition-colors p-0.5"><Trash2 size={11} /></button>
                    </div>
                  </div>

                  {/* Objectives */}
                  {isOpen && (
                    groupObjs.length === 0 ? (
                      <button onClick={() => setAddingObjFor(group.id)}
                        className="w-full py-5 text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.03)] transition-all flex items-center justify-center gap-1">
                        <Plus size={11} /> 목표를 추가하세요
                      </button>
                    ) : (
                      <div className="py-2">
                        {groupObjs.map(obj => (
                          <ObjectiveBlock
                            key={obj.id}
                            obj={obj}
                            color={teamDotColor(group.name)}
                            subItems={subItems.filter(si => si.objective_id === obj.id)}
                            subEntries={subEntries.filter(se =>
                              subItems.filter(si => si.objective_id === obj.id).some(si => si.id === se.sub_item_id))}
                            onDeleteObj={deleteObjective}
                            onSaveObjTitle={saveObjTitle}
                            onAddSubItem={addSubItem}
                            onSaveSubItemTitle={saveSubItemTitle}
                            onDeleteSubItem={deleteSubItem}
                            onSaveSubEntry={saveSubEntry}
                            onDeleteSubEntry={deleteSubEntry}
                            onRenameDate={renameDate}
                            onDeleteDate={deleteDate}
                          />
                        ))}
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}





