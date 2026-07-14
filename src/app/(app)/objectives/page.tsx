'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Plus, Pencil, Trash2 } from 'lucide-react'

interface ObjGroup    { id: string; name: string; color: string; sort_order: number }
interface ObjObjective { id: string; group_id: string; title: string; quarter: string; sort_order: number }
interface ObjSubItem  { id: string; objective_id: string; title: string; sort_order: number }
interface ObjSubEntry { id: string; sub_item_id: string; entry_date: string; content: string }

const GROUP_COLORS = ['#4A7FC0','#5DBD97','#E8914A','#A855F7','#EF4444','#F59E0B','#EC4899','#06B6D4','#84CC16','#8B5CF6']

function currentQuarter(d = new Date()): string {
  return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`
}
function generateQuarters(count: number): string[] {
  const now = new Date(); let month = now.getMonth(); let year = now.getFullYear(); const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(`${year}-Q${Math.ceil((month + 1) / 3)}`); month -= 3
    if (month < 0) { month += 12; year -= 1 }
  }
  return out
}
function quarterLabel(q: string): string { const [y, qp] = q.split('-'); return `${y} ${qp}` }
function formatDate(d: string) { try { return format(parseISO(d), 'M/d(eee)', { locale: ko }) } catch { return d } }
function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

// ── SubCell ────────────────────────────────────────────────
interface SubCellProps {
  entry: ObjSubEntry | undefined
  subItemId: string
  date: string
  onSave: (subItemId: string, date: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}
function SubCell({ entry, subItemId, date, onSave, onDelete }: SubCellProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(entry?.content ?? '')

  async function save() {
    const trimmed = val.trim()
    if (!trimmed && entry) { await onDelete(entry.id); setEditing(false); return }
    if (trimmed) await onSave(subItemId, date, trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save()
          if (e.key === 'Escape') { setVal(entry?.content ?? ''); setEditing(false) }
        }}
        className="w-full min-w-[200px] text-[13px] text-gray-700 leading-relaxed bg-white border border-[#1B3A6B]/25 rounded-lg p-2 focus:outline-none resize-none"
        rows={3}
      />
    )
  }

  if (entry?.content) {
    return (
      <div
        onClick={() => { setVal(entry.content); setEditing(true) }}
        className="min-w-[200px] text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap cursor-text bg-gray-50/80 rounded-lg px-2.5 py-2 hover:bg-gray-100/60 transition-colors"
      >
        {entry.content}
      </div>
    )
  }

  return (
    <div
      onClick={() => { setVal(''); setEditing(true) }}
      className="min-w-[200px] h-11 rounded-lg border border-dashed border-transparent hover:border-gray-200 cursor-pointer transition-colors flex items-center justify-center"
    >
      <span className="text-xs text-gray-200 select-none">—</span>
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
  onDeleteSubItem: (id: string) => Promise<void>
  onSaveSubEntry: (subItemId: string, date: string, content: string) => Promise<void>
  onDeleteSubEntry: (id: string) => Promise<void>
}
function ObjectiveBlock({
  obj, color, subItems, subEntries,
  onDeleteObj, onSaveObjTitle,
  onAddSubItem, onDeleteSubItem,
  onSaveSubEntry, onDeleteSubEntry,
}: ObjectiveBlockProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(obj.title)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [addingDate, setAddingDate] = useState(false)
  const [newDate, setNewDate] = useState(todayStr)
  const [localDates, setLocalDates] = useState<string[]>([])

  // Dates = union of entry dates + locally added dates, newest first
  const entryDates = subEntries.map(e => e.entry_date)
  const allDates = [...new Set([...entryDates, ...localDates])].sort()

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

  function confirmDate() {
    if (!newDate) return
    setLocalDates(prev => [...new Set([...prev, newDate])])
    setAddingDate(false)
    setNewDate(todayStr())
  }

  return (
    <div className="border-b border-gray-50 last:border-0">
      {/* Objective title row */}
      <div className="flex items-center gap-2 px-4 py-2.5 group/obj">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {editingTitle ? (
          <input
            autoFocus value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle()
              if (e.key === 'Escape') { setTitleVal(obj.title); setEditingTitle(false) }
            }}
            onBlur={saveTitle}
            className="text-[13px] font-medium text-gray-800 border-b border-gray-200 focus:outline-none bg-transparent flex-1 max-w-xs"
          />
        ) : (
          <span className="text-[13px] font-medium text-gray-700">{obj.title}</span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/obj:opacity-100 transition-opacity ml-1">
          <button onClick={() => { setEditingTitle(true); setTitleVal(obj.title) }}
            className="text-gray-300 hover:text-gray-500 p-0.5 transition-colors"><Pencil size={9} /></button>
          <button onClick={() => onDeleteObj(obj.id)}
            className="text-gray-300 hover:text-red-400 p-0.5 transition-colors"><Trash2 size={9} /></button>
        </div>
      </div>

      {/* Sub-item table */}
      <div className="overflow-x-auto pb-3 px-4" style={{ scrollbarWidth: 'thin' }}>
        <table className="border-collapse text-[13px]" style={{ minWidth: '100%' }}>
          {/* Header */}
          <thead>
            <tr>
              <th className="text-left text-xs text-gray-400 font-normal pb-2.5 pr-4 w-48 min-w-[192px]"
                style={{ position: 'sticky', left: 0, background: 'white', zIndex: 2 }}>
                안건
              </th>
              {allDates.map(d => (
                <th key={d} className="text-xs text-gray-400 font-normal pb-2.5 px-2 whitespace-nowrap min-w-[200px] text-center">
                  {formatDate(d)}
                </th>
              ))}
              <th className="pb-2.5 pl-2 min-w-[80px]">
                {addingDate ? (
                  <div className="flex items-center gap-1">
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmDate(); if (e.key === 'Escape') setAddingDate(false) }}
                      className="text-xs text-gray-600 border border-gray-200 rounded px-1 py-0.5 focus:outline-none bg-white w-24" />
                    <button onClick={confirmDate} className="text-[#1B3A6B] text-xs font-medium hover:opacity-70 transition-opacity">확인</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingDate(true)}
                    className="flex items-center gap-0.5 text-xs text-gray-300 hover:text-gray-500 transition-colors whitespace-nowrap">
                    <Plus size={9} />날짜
                  </button>
                )}
              </th>
            </tr>
          </thead>

          {/* Rows */}
          <tbody>
            {subItems.map(si => (
              <tr key={si.id} className="group/si">
                {/* Sub-item title — sticky */}
                <td className="pr-4 py-2.5 align-top w-48 min-w-[192px]"
                  style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                  <div className="flex items-start gap-1 group/sititle">
                    <span className="text-[13px] text-gray-600 leading-relaxed flex-1">{si.title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/sititle:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                      <button onClick={() => onDeleteSubItem(si.id)}
                        className="text-gray-200 hover:text-red-400 p-0.5 transition-colors"><Trash2 size={8} /></button>
                    </div>
                  </div>
                </td>

                {/* Entry cells */}
                {allDates.map(d => (
                  <td key={d} className="px-2 py-2.5 align-top min-w-[200px]">
                    <SubCell
                      entry={subEntries.find(e => e.sub_item_id === si.id && e.entry_date === d)}
                      subItemId={si.id}
                      date={d}
                      onSave={onSaveSubEntry}
                      onDelete={onDeleteSubEntry}
                    />
                  </td>
                ))}
                <td />
              </tr>
            ))}

            {/* Add sub-item row */}
            <tr>
              <td className="pt-3 pb-2" style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                {addingItem ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus value={newItemTitle}
                      onChange={e => setNewItemTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitItem()
                        if (e.key === 'Escape') { setAddingItem(false); setNewItemTitle('') }
                      }}
                      placeholder="안건 입력"
                      className="text-[13px] text-gray-700 border-b border-gray-200 focus:outline-none bg-transparent w-28"
                    />
                    <button onClick={submitItem}
                      className="text-xs text-[#1B3A6B] font-medium hover:opacity-70 transition-opacity">확인</button>
                    <button onClick={() => { setAddingItem(false); setNewItemTitle('') }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors">취소</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingItem(true)}
                    className="flex items-center gap-1 text-xs text-gray-300 hover:text-gray-500 transition-colors">
                    <Plus size={9} />안건 추가
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
      className="text-[13px] font-semibold text-gray-800 border-b border-gray-300 focus:outline-none bg-transparent w-32" />
  )
  return (
    <span className="text-[13px] font-semibold text-gray-800 hover:text-[#1B3A6B] transition-colors"
      onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}>{name}</span>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function ObjectivesPage() {
  const supabase = createClient()
  const [quarters] = useState(() => generateQuarters(5))
  const [activeQ, setActiveQ] = useState(() => currentQuarter())
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

  useEffect(() => { loadAll() }, [activeQ])

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
    setExpandedGroups(new Set(grps.map(x => x.id)))
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
  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-5 px-4 md:px-6 flex-wrap">
        <h1 className="text-lg font-bold text-gray-900 flex-shrink-0">목표관리</h1>
        <div className="flex items-center gap-1 flex-wrap">
          {quarters.map(q => (
            <button key={q} onClick={() => setActiveQ(q)}
              className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all whitespace-nowrap ${
                activeQ === q ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm' : 'bg-white/70 border-gray-200 text-gray-500 hover:bg-white hover:text-gray-700'
              }`}>{quarterLabel(q)}</button>
          ))}
        </div>
        <div className="ml-auto flex-shrink-0">
          {addingGroup ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') } }}
                placeholder="팀 이름" className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1B3A6B]/40 w-28" />
              <button onClick={addGroup} className="text-xs px-2.5 py-1.5 bg-[#1B3A6B] text-white rounded-lg hover:bg-[#22497E] transition-colors">추가</button>
              <button onClick={() => { setAddingGroup(false); setNewGroupName('') }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">취소</button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-all">
              <Plus size={12} />팀 추가
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[13px] text-gray-400">불러오는 중…</div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-[13px] text-gray-400">
            <p>팀을 추가하고 {quarterLabel(activeQ)} 목표를 관리하세요</p>
            <button onClick={() => setAddingGroup(true)}
              className="text-xs px-4 py-2 rounded-full bg-[#1B3A6B]/10 text-[#1B3A6B] hover:bg-[#1B3A6B]/15 transition-colors">+ 첫 번째 팀 추가</button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(group => {
              const isOpen = expandedGroups.has(group.id)
              const groupObjs = objectives.filter(o => o.group_id === group.id)
              return (
                <div key={group.id}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => toggleGroup(group.id)}
                      className="flex items-center gap-2 hover:opacity-75 transition-opacity select-none">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                      <GroupNameEditor name={group.name} onSave={name => saveGroupName(group.id, name)} />
                      <span className="text-xs text-gray-400 font-normal">{groupObjs.length}개</span>
                      <span style={{ fontSize: 9, color: '#94A3B8', display: 'inline-block', transition: 'transform .13s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                    </button>
                    <button onClick={() => deleteGroup(group.id)} className="text-gray-200 hover:text-red-400 transition-colors p-0.5"><Trash2 size={11} /></button>
                    {isOpen && (addingObjFor === group.id ? (
                      <div className="flex items-center gap-1.5 ml-1">
                        <input autoFocus value={newObjTitle} onChange={e => setNewObjTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addObjective(group.id); if (e.key === 'Escape') { setAddingObjFor(null); setNewObjTitle('') } }}
                          placeholder="목표 입력" className="text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1B3A6B]/40 w-40" />
                        <button onClick={() => addObjective(group.id)} className="text-xs px-2 py-1 bg-[#1B3A6B] text-white rounded-lg hover:bg-[#22497E] transition-colors">추가</button>
                        <button onClick={() => { setAddingObjFor(null); setNewObjTitle('') }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">취소</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingObjFor(group.id)}
                        className="ml-1 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 px-2 py-0.5 rounded-lg transition-all">
                        <Plus size={9} /> 목표 추가
                      </button>
                    ))}
                  </div>

                  {/* Objective blocks */}
                  {isOpen && (
                    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                      {groupObjs.length === 0 ? (
                        <button onClick={() => setAddingObjFor(group.id)}
                          className="w-full py-6 text-xs text-gray-400 hover:text-gray-500 hover:bg-gray-50/50 transition-all flex items-center justify-center gap-1">
                          <Plus size={11} /> 목표를 추가하세요
                        </button>
                      ) : (
                        groupObjs.map(obj => (
                          <ObjectiveBlock
                            key={obj.id}
                            obj={obj}
                            color={group.color}
                            subItems={subItems.filter(si => si.objective_id === obj.id)}
                            subEntries={subEntries.filter(se => subItems.filter(si => si.objective_id === obj.id).some(si => si.id === se.sub_item_id))}
                            onDeleteObj={deleteObjective}
                            onSaveObjTitle={saveObjTitle}
                            onAddSubItem={addSubItem}
                            onDeleteSubItem={deleteSubItem}
                            onSaveSubEntry={saveSubEntry}
                            onDeleteSubEntry={deleteSubEntry}
                          />
                        ))
                      )}
                    </div>
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



