'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Plus, Pencil, Trash2 } from 'lucide-react'

interface ObjGroup { id: string; name: string; color: string; sort_order: number }
interface ObjObjective { id: string; group_id: string; title: string; quarter: string; sort_order: number }
interface ObjEntry { id: string; objective_id: string; entry_date: string; content: string; created_at: string }

const GROUP_COLORS = ['#4A7FC0', '#5DBD97', '#E8914A', '#A855F7', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4', '#84CC16', '#8B5CF6']
const RECENT_SHOW = 3

function currentQuarter(d = new Date()): string {
  return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`
}

function generateQuarters(count: number): string[] {
  const now = new Date()
  let month = now.getMonth()
  let year = now.getFullYear()
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(`${year}-Q${Math.ceil((month + 1) / 3)}`)
    month -= 3
    if (month < 0) { month += 12; year -= 1 }
  }
  return out
}

function quarterLabel(q: string): string {
  const [year, qp] = q.split('-')
  return `${year} ${qp}`
}

function formatDate(d: string) {
  try { return format(parseISO(d), 'M/d(eee)', { locale: ko }) } catch { return d }
}

// ── EntryCard ──────────────────────────────────────────────
interface EntryCardProps {
  entry: ObjEntry
  onDelete: (id: string) => void
  onSave: (id: string, content: string) => Promise<void>
}
function EntryCard({ entry, onDelete, onSave }: EntryCardProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(entry.content)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(v: string) {
    setVal(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSave(entry.id, v), 700)
  }

  async function handleBlur() {
    if (timerRef.current) clearTimeout(timerRef.current)
    await onSave(entry.id, val)
    setEditing(false)
  }

  return (
    <div className="bg-gray-50/80 rounded-lg p-2.5 group/entry">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-gray-500 bg-white border border-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">
          {formatDate(entry.entry_date)}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/entry:opacity-100 transition-opacity">
          <button onClick={() => setEditing(e => !e)} className="text-gray-300 hover:text-gray-500 p-0.5 transition-colors">
            <Pencil size={9} />
          </button>
          <button onClick={() => onDelete(entry.id)} className="text-gray-300 hover:text-red-400 p-0.5 transition-colors">
            <Trash2 size={9} />
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={val}
          onChange={e => handleChange(e.target.value)}
          onBlur={handleBlur}
          className="w-full text-[11px] text-gray-700 leading-relaxed bg-white border border-gray-200 rounded p-1.5 focus:outline-none focus:border-[#1B3A6B]/30 resize-none"
          rows={3}
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap cursor-text"
        >
          {entry.content || <span className="text-gray-300 italic">내용 없음</span>}
        </p>
      )}
    </div>
  )
}

// ── AddEntryForm ───────────────────────────────────────────
interface AddEntryFormProps {
  date: string; content: string
  onDateChange: (d: string) => void
  onContentChange: (c: string) => void
  onSave: () => void; onCancel: () => void
}
function AddEntryForm({ date, content, onDateChange, onContentChange, onSave, onCancel }: AddEntryFormProps) {
  return (
    <div className="bg-blue-50/60 border border-[#1B3A6B]/15 rounded-lg p-2.5">
      <div className="mb-1.5">
        <input
          type="date"
          value={date}
          onChange={e => onDateChange(e.target.value)}
          className="text-[10px] text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none bg-white"
        />
      </div>
      <textarea
        autoFocus
        value={content}
        onChange={e => onContentChange(e.target.value)}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="이번 주 보고 내용…  (Ctrl+Enter 저장)"
        className="w-full text-[11px] text-gray-700 leading-relaxed bg-white border border-gray-200 rounded p-1.5 focus:outline-none focus:border-[#1B3A6B]/30 resize-none"
        rows={3}
      />
      <div className="flex gap-1.5 mt-1.5 justify-end">
        <button onClick={onCancel} className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 transition-colors">취소</button>
        <button onClick={onSave} disabled={!content.trim()}
          className="text-[10px] bg-[#1B3A6B] text-white px-2.5 py-1 rounded-lg hover:bg-[#22497E] disabled:opacity-40 transition-colors">
          저장
        </button>
      </div>
    </div>
  )
}

// ── ObjectiveCard ──────────────────────────────────────────
interface ObjectiveCardProps {
  obj: ObjObjective
  color: string
  entries: ObjEntry[]
  onDeleteObj: (id: string) => void
  onSaveObjTitle: (id: string, title: string) => Promise<void>
  onAddEntry: (objId: string, date: string, content: string) => Promise<void>
  onDeleteEntry: (id: string) => void
  onSaveEntry: (id: string, content: string) => Promise<void>
}
function ObjectiveCard({ obj, color, entries, onDeleteObj, onSaveObjTitle, onAddEntry, onDeleteEntry, onSaveEntry }: ObjectiveCardProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(obj.title)
  const [addingEntry, setAddingEntry] = useState(false)
  const [newDate, setNewDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [newContent, setNewContent] = useState('')
  const [showOlder, setShowOlder] = useState(false)

  const recent = entries.slice(0, RECENT_SHOW)
  const older = entries.slice(RECENT_SHOW)

  async function saveTitle() {
    const t = titleVal.trim()
    if (!t) { setEditingTitle(false); return }
    await onSaveObjTitle(obj.id, t)
    setEditingTitle(false)
  }

  async function submitEntry() {
    if (!newContent.trim()) return
    await onAddEntry(obj.id, newDate, newContent.trim())
    setNewContent('')
    setNewDate(format(new Date(), 'yyyy-MM-dd'))
    setAddingEntry(false)
  }

  return (
    <div className="flex-shrink-0 w-[268px] bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm"
      style={{ borderTop: `2.5px solid ${color}` }}>

      {/* Title */}
      <div className="flex items-start gap-1.5 px-3 pt-3 pb-2 group/card">
        {editingTitle ? (
          <input
            autoFocus
            value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle()
              if (e.key === 'Escape') setEditingTitle(false)
            }}
            onBlur={saveTitle}
            className="text-xs font-semibold text-gray-800 flex-1 border-b border-gray-200 focus:outline-none bg-transparent leading-relaxed min-w-0"
          />
        ) : (
          <p className="text-xs font-semibold text-gray-800 flex-1 leading-relaxed min-w-0">{obj.title}</p>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <button onClick={() => { setEditingTitle(true); setTitleVal(obj.title) }}
            className="text-gray-300 hover:text-gray-500 p-0.5 transition-colors"><Pencil size={10} /></button>
          <button onClick={() => onDeleteObj(obj.id)}
            className="text-gray-300 hover:text-red-400 p-0.5 transition-colors"><Trash2 size={10} /></button>
        </div>
      </div>

      {/* Entries */}
      <div className="px-3 pb-3 flex flex-col gap-2">
        {recent.map(e => (
          <EntryCard key={e.id} entry={e} onDelete={onDeleteEntry} onSave={onSaveEntry} />
        ))}

        {older.length > 0 && (
          <>
            <button
              onClick={() => setShowOlder(p => !p)}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
              <span style={{ display: 'inline-block', transition: 'transform .12s', transform: showOlder ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 8 }}>▶</span>
              이전 {older.length}주 기록
            </button>
            {showOlder && older.map(e => (
              <EntryCard key={e.id} entry={e} onDelete={onDeleteEntry} onSave={onSaveEntry} />
            ))}
          </>
        )}

        {entries.length === 0 && !addingEntry && (
          <p className="text-[10px] text-gray-300 italic py-1">기록이 없습니다</p>
        )}

        {addingEntry ? (
          <AddEntryForm
            date={newDate} content={newContent}
            onDateChange={setNewDate} onContentChange={setNewContent}
            onSave={submitEntry} onCancel={() => { setAddingEntry(false); setNewContent('') }}
          />
        ) : (
          <button
            onClick={() => setAddingEntry(true)}
            className="flex items-center gap-1 text-[10px] text-[#1B3A6B]/70 hover:text-[#1B3A6B] border border-dashed border-[#1B3A6B]/20 hover:border-[#1B3A6B]/40 px-2 py-1.5 rounded-lg transition-all">
            <Plus size={9} /> 이번 주 기록 추가
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function ObjectivesPage() {
  const supabase = createClient()
  const [quarters] = useState(() => generateQuarters(5))
  const [activeQ, setActiveQ] = useState(() => currentQuarter())
  const [groups, setGroups] = useState<ObjGroup[]>([])
  const [objectives, setObjectives] = useState<ObjObjective[]>([])
  const [entries, setEntries] = useState<ObjEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Group UI state
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Objective UI state (inline per group)
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

    let ents: ObjEntry[] = []
    if (objs.length > 0) {
      const { data: e } = await supabase
        .from('obj_entries').select('*')
        .in('objective_id', objs.map(x => x.id))
        .order('entry_date', { ascending: false })
      ents = (e ?? []) as ObjEntry[]
    }

    setGroups(grps)
    setObjectives(objs)
    setEntries(ents)
    setExpandedGroups(new Set(grps.map(x => x.id)))
    setLoading(false)
  }

  // ── Group CRUD ─────────────────────────────────────────
  async function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    const sort_order = (groups[groups.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('obj_groups').insert({ name, color, sort_order }).select().single()
    if (data) {
      const g = data as ObjGroup
      setGroups(prev => [...prev, g])
      setExpandedGroups(prev => new Set([...prev, g.id]))
    }
    setNewGroupName('')
    setAddingGroup(false)
  }

  async function saveGroupName(id: string, name: string) {
    if (!name.trim()) return
    await supabase.from('obj_groups').update({ name: name.trim() }).eq('id', id)
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name: name.trim() } : g))
  }

  async function deleteGroup(id: string) {
    if (!confirm('팀을 삭제하면 관련 목표와 기록이 모두 삭제됩니다. 계속할까요?')) return
    await supabase.from('obj_groups').delete().eq('id', id)
    setGroups(prev => prev.filter(g => g.id !== id))
    const removedObjs = objectives.filter(o => o.group_id === id).map(o => o.id)
    setObjectives(prev => prev.filter(o => o.group_id !== id))
    setEntries(prev => prev.filter(e => !removedObjs.includes(e.objective_id)))
  }

  // ── Objective CRUD ─────────────────────────────────────
  async function addObjective(groupId: string) {
    const title = newObjTitle.trim()
    if (!title) return
    const groupObjs = objectives.filter(o => o.group_id === groupId)
    const sort_order = (groupObjs[groupObjs.length - 1]?.sort_order ?? 0) + 1
    const { data } = await supabase.from('obj_objectives')
      .insert({ group_id: groupId, title, quarter: activeQ, sort_order })
      .select().single()
    if (data) setObjectives(prev => [...prev, data as ObjObjective])
    setNewObjTitle('')
    setAddingObjFor(null)
  }

  async function saveObjTitle(id: string, title: string) {
    await supabase.from('obj_objectives').update({ title }).eq('id', id)
    setObjectives(prev => prev.map(o => o.id === id ? { ...o, title } : o))
  }

  async function deleteObjective(id: string) {
    await supabase.from('obj_objectives').delete().eq('id', id)
    setObjectives(prev => prev.filter(o => o.id !== id))
    setEntries(prev => prev.filter(e => e.objective_id !== id))
  }

  // ── Entry CRUD ─────────────────────────────────────────
  async function addEntry(objId: string, date: string, content: string) {
    const { data } = await supabase.from('obj_entries')
      .insert({ objective_id: objId, entry_date: date, content })
      .select().single()
    if (data) {
      setEntries(prev => [data as ObjEntry, ...prev].sort((a, b) =>
        b.entry_date.localeCompare(a.entry_date)
      ))
    }
  }

  async function deleteEntry(id: string) {
    await supabase.from('obj_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function saveEntry(id: string, content: string) {
    await supabase.from('obj_entries').update({ content }).eq('id', id)
    setEntries(prev => prev.map(e => e.id === id ? { ...e, content } : e))
  }

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-5 px-4 md:px-6 flex-wrap">
        <h1 className="text-lg font-bold text-gray-900 flex-shrink-0">목표관리</h1>

        {/* Quarter tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {quarters.map(q => (
            <button key={q} onClick={() => setActiveQ(q)}
              className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all whitespace-nowrap ${
                activeQ === q
                  ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                  : 'bg-white/70 border-gray-200 text-gray-500 hover:bg-white hover:text-gray-700'
              }`}>
              {quarterLabel(q)}
            </button>
          ))}
        </div>

        {/* Add group */}
        <div className="ml-auto flex-shrink-0">
          {addingGroup ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup()
                  if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
                }}
                placeholder="팀 이름"
                className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1B3A6B]/40 w-28"
              />
              <button onClick={addGroup}
                className="text-xs px-2.5 py-1.5 bg-[#1B3A6B] text-white rounded-lg hover:bg-[#22497E] transition-colors">추가</button>
              <button onClick={() => { setAddingGroup(false); setNewGroupName('') }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">취소</button>
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
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">불러오는 중…</div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-sm text-gray-400">
            <p>팀을 추가하고 {quarterLabel(activeQ)} 목표를 관리하세요</p>
            <button onClick={() => setAddingGroup(true)}
              className="text-xs px-4 py-2 rounded-full bg-[#1B3A6B]/10 text-[#1B3A6B] hover:bg-[#1B3A6B]/15 transition-colors">
              + 첫 번째 팀 추가
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {groups.map(group => {
              const isOpen = expandedGroups.has(group.id)
              const groupObjs = objectives.filter(o => o.group_id === group.id)

              return (
                <div key={group.id}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="flex items-center gap-2 hover:opacity-75 transition-opacity select-none"
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                      <GroupNameEditor
                        name={group.name}
                        onSave={name => saveGroupName(group.id, name)}
                      />
                      <span className="text-[10px] text-gray-400 font-normal">{groupObjs.length}개</span>
                      <span style={{ fontSize: 9, color: '#94A3B8', display: 'inline-block', transition: 'transform .13s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    </button>

                    <button onClick={() => deleteGroup(group.id)}
                      className="text-gray-200 hover:text-red-400 transition-colors p-0.5">
                      <Trash2 size={11} />
                    </button>

                    {isOpen && (
                      addingObjFor === group.id ? (
                        <div className="flex items-center gap-1.5 ml-1">
                          <input
                            autoFocus
                            value={newObjTitle}
                            onChange={e => setNewObjTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) addObjective(group.id)
                              if (e.key === 'Escape') { setAddingObjFor(null); setNewObjTitle('') }
                            }}
                            placeholder="목표 입력"
                            className="text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1B3A6B]/40 w-40"
                          />
                          <button onClick={() => addObjective(group.id)}
                            className="text-xs px-2 py-1 bg-[#1B3A6B] text-white rounded-lg hover:bg-[#22497E] transition-colors">추가</button>
                          <button onClick={() => { setAddingObjFor(null); setNewObjTitle('') }}
                            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">취소</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingObjFor(group.id)}
                          className="ml-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 px-2 py-0.5 rounded-lg transition-all">
                          <Plus size={9} /> 목표 추가
                        </button>
                      )
                    )}
                  </div>

                  {/* Kanban row */}
                  {isOpen && (
                    <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                      {groupObjs.length === 0 ? (
                        <button
                          onClick={() => setAddingObjFor(group.id)}
                          className="flex-shrink-0 w-48 h-20 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-all flex items-center justify-center gap-1">
                          <Plus size={11} /> 목표 추가
                        </button>
                      ) : (
                        groupObjs.map(obj => (
                          <ObjectiveCard
                            key={obj.id}
                            obj={obj}
                            color={group.color}
                            entries={entries.filter(e => e.objective_id === obj.id)}
                            onDeleteObj={deleteObjective}
                            onSaveObjTitle={saveObjTitle}
                            onAddEntry={addEntry}
                            onDeleteEntry={deleteEntry}
                            onSaveEntry={saveEntry}
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

// ── GroupNameEditor (inline editable label) ────────────────
function GroupNameEditor({ name, onSave }: { name: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)

  function commit() {
    if (val.trim()) onSave(val.trim())
    else setVal(name)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
          if (e.key === 'Escape') { setVal(name); setEditing(false) }
        }}
        onBlur={commit}
        className="text-sm font-semibold text-gray-800 border-b border-gray-300 focus:outline-none bg-transparent w-32"
      />
    )
  }

  return (
    <span
      className="text-sm font-semibold text-gray-800 hover:text-[#1B3A6B] transition-colors"
      onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
    >
      {name}
    </span>
  )
}
