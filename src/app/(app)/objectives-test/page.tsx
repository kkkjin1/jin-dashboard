'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_PALETTE, TEAM_COLOR, colorKeyFromName } from '@/lib/categoryColors'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Plus, Trash2, ChevronLeft, ChevronRight, Users, Circle, Zap } from 'lucide-react'
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

function dotColor(name: string): string {
  try {
    const key = TEAM_COLOR[name] ?? colorKeyFromName(name)
    return CATEGORY_PALETTE[key].solid
  } catch { return '#4A7FC0' }
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

// ── StatItem ───────────────────────────────────────────────
function StatItem({ icon, label, accent }: { icon: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={accent ? 'text-[#4C7FE0]' : 'text-[rgba(226,232,240,0.3)]'}>{icon}</span>
      <span className={`text-[11px] ${accent ? 'text-[rgba(226,232,240,0.6)]' : 'text-[rgba(226,232,240,0.4)]'}`}>{label}</span>
    </div>
  )
}

// ── MatrixCell ─────────────────────────────────────────────
function MatrixCell({
  entry, objectiveId, weekStart, isThisWeek, isFuture, onSave, onDelete,
}: {
  entry: EntryV2 | undefined
  objectiveId: string
  weekStart: string
  isThisWeek: boolean
  isFuture: boolean
  onSave: (oid: string, ws: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(entry?.content ?? '')
  const wf = useWinFocused()

  async function save() {
    const txt = val.replace(/<[^>]*>/g, '').trim()
    if (!txt && entry) { await onDelete(entry.id); setEditing(false); return }
    if (txt) await onSave(objectiveId, weekStart, val)
    setEditing(false)
  }

  if (editing) return (
    <div
      className="min-h-[100px] bg-[rgba(255,255,255,0.04)] border border-[#4C7FE0]/40 rounded-[10px] overflow-hidden"
      onBlur={e => { if (!wf.current) return; if (!e.currentTarget.contains(e.relatedTarget as Node)) save() }}
    >
      <TiptapEditor dark value={val} onChange={setVal} onSubmit={save}
        onEscape={() => { setVal(entry?.content ?? ''); setEditing(false) }}
        autoFocus minHeight={80} />
    </div>
  )

  if (entry?.content) {
    const accentStyle = isThisWeek
      ? { borderLeftWidth: 3, borderLeftColor: 'rgba(76,127,224,0.6)' }
      : {}
    return (
      <div
        onClick={() => { setVal(entry.content); setEditing(true) }}
        style={accentStyle}
        className="min-h-[90px] cursor-text bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-[10px] px-3.5 py-3 hover:bg-[rgba(255,255,255,0.05)] transition-colors"
      >
        <MarkdownContent content={entry.content} dark />
      </div>
    )
  }

  return (
    <div
      onClick={() => { setVal(''); setEditing(true) }}
      className={`min-h-[90px] rounded-[10px] border border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
        isThisWeek || isFuture
          ? 'border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.02)]'
          : 'border-transparent hover:border-[rgba(255,255,255,0.05)]'
      }`}
    >
      {(isThisWeek || isFuture) && (
        <>
          <Plus size={12} className="text-[rgba(255,255,255,0.18)]" />
          <span className="text-[10px] text-[rgba(226,232,240,0.2)] text-center px-3 leading-tight">이번주 계획 입력</span>
        </>
      )}
    </div>
  )
}

// ── ObjectiveRow ───────────────────────────────────────────
function ObjectiveRow({
  obj, entries, weekCols, color,
  onSaveTitle, onSaveDesc, onDelete, onSaveEntry, onDeleteEntry,
}: {
  obj: ObjectiveV2
  entries: EntryV2[]
  weekCols: WeekCol[]
  color: string
  onSaveTitle: (id: string, t: string) => Promise<void>
  onSaveDesc: (id: string, d: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
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
    <div className="flex group/row" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Left sticky panel */}
      <div
        className="sticky left-0 z-[15] w-[220px] flex-shrink-0 flex items-start gap-2 px-4 py-3"
        style={{ background: '#161B24', borderRight: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          {editTitle ? (
            <input autoFocus value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle(); if (e.key === 'Escape') { setTitleVal(obj.title); setEditTitle(false) } }}
              onBlur={() => { if (!wf.current) return; saveTitle() }}
              className="text-[13px] font-semibold text-[#E5E7EB] bg-transparent border-b border-[rgba(255,255,255,0.2)] focus:outline-none w-full" />
          ) : (
            <span
              onClick={() => { setTitleVal(obj.title); setEditTitle(true) }}
              className="text-[13px] font-semibold text-[rgba(226,232,240,0.88)] cursor-text block leading-snug"
            >{obj.title}</span>
          )}
          {editDesc ? (
            <input autoFocus value={descVal}
              onChange={e => setDescVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveDesc(); if (e.key === 'Escape') { setDescVal(obj.description); setEditDesc(false) } }}
              onBlur={() => { if (!wf.current) return; saveDesc() }}
              className="text-[11px] text-[rgba(226,232,240,0.4)] bg-transparent border-b border-[rgba(255,255,255,0.12)] focus:outline-none w-full mt-1" />
          ) : (
            <span
              onClick={() => { setDescVal(obj.description); setEditDesc(true) }}
              className="text-[11px] text-[rgba(226,232,240,0.32)] cursor-text block mt-1 leading-snug"
            >{obj.description || <span className="italic opacity-40">설명 추가</span>}</span>
          )}
        </div>
        <button
          onClick={() => onDelete(obj.id)}
          className="opacity-0 group-hover/row:opacity-100 text-[rgba(226,232,240,0.2)] hover:text-red-400 p-0.5 transition-all flex-shrink-0 mt-0.5"
        >
          <Trash2 size={9} />
        </button>
      </div>

      {/* Week cells */}
      {weekCols.map(col => {
        const entry = entries.find(e => e.week_start === col.start)
        return (
          <div
            key={col.start}
            className="w-[220px] flex-shrink-0 p-2"
            style={{
              background: col.isThisWeek ? 'rgba(76,127,224,0.025)' : 'transparent',
              borderLeft: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <MatrixCell
              entry={entry}
              objectiveId={obj.id}
              weekStart={col.start}
              isThisWeek={col.isThisWeek}
              isFuture={col.isFuture}
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
  onDeleteGroup, onAddObjective, onDeleteObj, onSaveObjTitle, onSaveObjDesc,
  onSaveEntry, onDeleteEntry,
}: {
  group: GroupV2
  objectives: ObjectiveV2[]
  entries: EntryV2[]
  weekCols: WeekCol[]
  isOpen: boolean
  onToggle: () => void
  onDeleteGroup: (id: string) => Promise<void>
  onAddObjective: (groupId: string, title: string, desc: string) => Promise<void>
  onDeleteObj: (id: string) => Promise<void>
  onSaveObjTitle: (id: string, t: string) => Promise<void>
  onSaveObjDesc: (id: string, d: string) => Promise<void>
  onSaveEntry: (oid: string, ws: string, content: string) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
}) {
  const [addingObj, setAddingObj] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')

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

  const color = dotColor(group.name)
  const bgColor = headerBg(group.name)

  return (
    <div>
      {/* Group header row */}
      <div
        onClick={onToggle}
        style={{
          background: bgColor,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderBottom: isOpen ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
        className="flex cursor-pointer select-none group/grp"
      >
        {/* Left sticky part */}
        <div
          className="sticky left-0 z-[15] w-[220px] flex-shrink-0 flex items-center gap-2 px-4 py-3"
          style={{ background: bgColor, borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span style={{
            fontSize: 8, color: '#94A3B8', display: 'inline-block',
            transition: 'transform .13s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}>▶</span>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[13px] font-semibold text-[rgba(226,232,240,0.9)]">{group.name}</span>
          <span className="text-[11px] text-[rgba(226,232,240,0.35)] ml-0.5">{objectives.length} Goals</span>
          {thisWeekCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(76,127,224,0.15)', color: 'rgba(76,127,224,0.85)' }}>
              이번주 {thisWeekCount}건
            </span>
          )}
        </div>

        {/* Right stats columns */}
        <div className="flex flex-1">
          {weekCols.map(col => {
            const colCount = groupEntries.filter(e => e.week_start === col.start && e.content).length
            return (
              <div
                key={col.start}
                className="w-[220px] flex-shrink-0 flex items-center px-3 py-3"
                style={{
                  background: col.isThisWeek ? 'rgba(76,127,224,0.03)' : 'transparent',
                  borderLeft: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                {colCount > 0 && (
                  <span className="text-[11px] text-[rgba(226,232,240,0.28)]">업데이트 {colCount}건</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Add obj button + delete */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3" onClick={e => e.stopPropagation()}>
          {isOpen && !addingObj && (
            <button
              onClick={() => setAddingObj(true)}
              className="flex items-center gap-1 text-[11px] text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.6)] transition-colors"
            >
              <Plus size={10} />목표
            </button>
          )}
          <button
            onClick={() => onDeleteGroup(group.id)}
            className="opacity-0 group-hover/grp:opacity-100 text-[rgba(226,232,240,0.2)] hover:text-red-400 p-0.5 transition-all"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Objective rows */}
      {isOpen && (
        <>
          {objectives.map(obj => (
            <ObjectiveRow
              key={obj.id}
              obj={obj}
              entries={entries.filter(e => e.objective_id === obj.id)}
              weekCols={weekCols}
              color={color}
              onSaveTitle={onSaveObjTitle}
              onSaveDesc={onSaveObjDesc}
              onDelete={onDeleteObj}
              onSaveEntry={onSaveEntry}
              onDeleteEntry={onDeleteEntry}
            />
          ))}

          {/* Add objective input row */}
          {addingObj && (
            <div className="flex" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div
                className="sticky left-0 z-[15] w-[220px] flex-shrink-0 px-4 py-3 flex flex-col gap-1.5"
                style={{ background: '#161B24', borderRight: '1px solid rgba(255,255,255,0.05)' }}
              >
                <input autoFocus value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddObj()
                    if (e.key === 'Escape') { setAddingObj(false); setNewTitle(''); setNewDesc('') }
                  }}
                  placeholder="목표 입력"
                  className="text-[13px] font-semibold text-[#E5E7EB] placeholder:text-[#5B6270] border-b border-[rgba(255,255,255,0.2)] focus:outline-none bg-transparent w-full" />
                <input value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddObj()
                    if (e.key === 'Escape') { setAddingObj(false); setNewTitle(''); setNewDesc('') }
                  }}
                  placeholder="설명 (선택)"
                  className="text-[11px] text-[rgba(226,232,240,0.4)] placeholder:text-[#5B6270] border-b border-[rgba(255,255,255,0.12)] focus:outline-none bg-transparent w-full" />
                <div className="flex gap-2 mt-0.5">
                  <button onClick={handleAddObj} className="text-xs text-[#4C7FE0] font-medium hover:opacity-70 transition-opacity">추가</button>
                  <button onClick={() => { setAddingObj(false); setNewTitle(''); setNewDesc('') }}
                    className="text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.6)] transition-colors">취소</button>
                </div>
              </div>
              {weekCols.map(col => (
                <div key={col.start} className="w-[220px] flex-shrink-0 p-2 min-h-[80px]"
                  style={{
                    background: col.isThisWeek ? 'rgba(76,127,224,0.025)' : 'transparent',
                    borderLeft: '1px solid rgba(255,255,255,0.04)',
                  }} />
              ))}
            </div>
          )}

          {objectives.length === 0 && !addingObj && (
            <div className="flex" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div
                className="sticky left-0 z-[15] w-[220px] flex-shrink-0 px-4 py-5"
                style={{ background: '#161B24', borderRight: '1px solid rgba(255,255,255,0.05)' }}
              >
                <button onClick={() => setAddingObj(true)}
                  className="text-xs text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.6)] transition-colors flex items-center gap-1">
                  <Plus size={10} />목표를 추가하세요
                </button>
              </div>
              {weekCols.map(col => (
                <div key={col.start} className="w-[220px] flex-shrink-0 min-h-[60px]"
                  style={{
                    background: col.isThisWeek ? 'rgba(76,127,224,0.025)' : 'transparent',
                    borderLeft: '1px solid rgba(255,255,255,0.04)',
                  }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function ObjectivesTestPage() {
  const supabase = createClient()
  const now = new Date()
  const [selYear, setSelYear] = useState(() => now.getFullYear())
  const [selQ, setSelQ] = useState(() => Math.ceil((now.getMonth() + 1) / 3))
  const activeQ = `${selYear}-Q${selQ}`

  // Anchor = first week in the 4-column window (currentWeek - 2 weeks → current is 3rd col)
  const [anchor, setAnchor] = useState<Date>(() => shiftWeeks(getMondayOf(new Date()), -2))
  const weekCols = getWeekCols(anchor, 4)

  const lastSunday = new Date(anchor)
  lastSunday.setDate(anchor.getDate() + 4 * 7 - 1)
  const rangeLabel = `${fmtKo(anchor, 'yyyy.MM.dd')} ~ ${fmtKo(lastSunday, 'MM.dd')} (4주)`

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
    }
    setNewGroupName(''); setAddingGroup(false)
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

  // ── Stats ──────────────────────────────────────────────
  const thisWeekStart = weekCols.find(c => c.isThisWeek)?.start ?? ''
  const thisWeekEntries = entries.filter(e => e.week_start === thisWeekStart && e.content)

  const COL_W = 220
  const LEFT_W = 220
  const totalMinW = LEFT_W + COL_W * 4

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Fixed Header ──────────────────────────────────── */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Title + quarter picker */}
        <div className="flex items-center gap-3 px-6 pt-4 pb-3 flex-wrap">
          <h1 className="text-lg font-bold text-[#E2E8F0]">목표관리</h1>
          <div className="flex items-center gap-1 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full px-1 py-1">
            <button onClick={() => setSelYear(y => y - 1)}
              className="w-6 h-6 flex items-center justify-center rounded-full text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)] transition-colors">
              <ChevronLeft size={13} />
            </button>
            <span className="text-xs font-semibold text-[rgba(226,232,240,0.8)] px-1 min-w-[36px] text-center select-none">{selYear}</span>
            <button onClick={() => setSelYear(y => y + 1)}
              className="w-6 h-6 flex items-center justify-center rounded-full text-[rgba(226,232,240,0.4)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.8)] transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                  selQ === q
                    ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]'
                    : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]'
                }`}>Q{q}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {addingGroup ? (
              <div className="flex items-center gap-1.5">
                <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') } }}
                  placeholder="팀 이름"
                  className="text-xs px-2.5 py-1.5 border border-[rgba(255,255,255,0.09)] rounded-lg focus:outline-none focus:border-[rgba(255,255,255,0.2)] bg-[#1A1C1F] text-[#E5E7EB] placeholder:text-[#5B6270] w-28" />
                <button onClick={addGroup} className="text-xs px-2.5 py-1.5 bg-[#4C7FE0] text-white rounded-lg hover:bg-[#3A6CC8] transition-colors">추가</button>
                <button onClick={() => { setAddingGroup(false); setNewGroupName('') }}
                  className="text-xs text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors">취소</button>
              </div>
            ) : (
              <button onClick={() => setAddingGroup(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-dashed border-[rgba(255,255,255,0.2)] text-[rgba(226,232,240,0.5)] hover:border-[rgba(255,255,255,0.35)] hover:text-[rgba(226,232,240,0.8)] transition-all">
                <Plus size={11} />팀 추가
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-5 px-6 pb-3">
          <StatItem icon={<Users size={12} />} label={`팀 ${groups.length}개`} />
          <StatItem icon={<Circle size={12} />} label={`전체 목표 ${objectives.length}개`} />
          <StatItem icon={<Zap size={12} />} label={`이번주 업데이트 ${thisWeekEntries.length}건`} accent />
        </div>

        {/* Week navigation + column headers */}
        <div className="flex overflow-x-auto scrollbar-hide" style={{ minWidth: totalMinW }}>
          {/* Left sticky nav */}
          <div
            className="sticky left-0 z-[20] w-[220px] flex-shrink-0 flex items-center gap-1 px-3 py-2.5"
            style={{ background: '#161B24', borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)' }}
          >
            <button onClick={() => setAnchor(d => shiftWeeks(d, -1))}
              className="flex items-center gap-0.5 text-[11px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors">
              <ChevronLeft size={12} />이전주
            </button>
            <span className="text-[9px] text-[rgba(226,232,240,0.2)] flex-1 text-center leading-tight">{rangeLabel}</span>
            <button onClick={() => setAnchor(d => shiftWeeks(d, 1))}
              className="flex items-center gap-0.5 text-[11px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] transition-colors">
              다음주<ChevronRight size={12} />
            </button>
          </div>

          {/* Week column headers */}
          {weekCols.map(col => (
            <div
              key={col.start}
              className="w-[220px] flex-shrink-0 flex items-center gap-2 px-3 py-2.5"
              style={{
                background: col.isThisWeek ? 'rgba(76,127,224,0.05)' : '#161B24',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span className={`text-[11px] font-medium ${col.isThisWeek ? 'text-[rgba(226,232,240,0.7)]' : 'text-[rgba(226,232,240,0.3)]'}`}>
                {col.label}
              </span>
              {col.isThisWeek && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                  style={{ background: 'rgba(76,127,224,0.2)', color: 'rgba(76,127,224,0.9)' }}>
                  이번주
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable Content ─────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div style={{ minWidth: totalMinW }}>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[13px] text-[rgba(226,232,240,0.4)]">불러오는 중…</div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-[13px] text-[rgba(226,232,240,0.4)]">
              <p>팀을 추가하고 목표를 관리하세요</p>
              <button onClick={() => setAddingGroup(true)}
                className="text-xs px-4 py-2 rounded-full bg-[#4C7FE0]/10 text-[#4C7FE0] hover:bg-[#4C7FE0]/15 transition-colors">
                + 첫 번째 팀 추가
              </button>
            </div>
          ) : (
            groups.map(group => (
              <GroupSection
                key={group.id}
                group={group}
                objectives={objectives.filter(o => o.group_id === group.id)}
                entries={entries}
                weekCols={weekCols}
                isOpen={expandedGroups.has(group.id)}
                onToggle={() => setExpandedGroups(p => {
                  const s = new Set(p); s.has(group.id) ? s.delete(group.id) : s.add(group.id); return s
                })}
                onDeleteGroup={deleteGroup}
                onAddObjective={addObjective}
                onDeleteObj={deleteObjective}
                onSaveObjTitle={saveObjTitle}
                onSaveObjDesc={saveObjDesc}
                onSaveEntry={saveEntry}
                onDeleteEntry={deleteEntry}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
