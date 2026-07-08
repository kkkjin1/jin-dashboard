'use client'

import { useEffect, useState, useRef, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaGroup, AgendaItem, AgendaUpdate } from '@/types'

// ── 상수 ────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = { do: '내 실행', fb: '피드백', rp: '보고수신', ag: '단순안건' }
const TYPE_CLS: Record<string, string> = {
  do: 'bg-blue-50 text-blue-600 border-blue-200',
  fb: 'bg-amber-50 text-amber-600 border-amber-200',
  rp: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  ag: 'bg-gray-50 text-gray-500 border-gray-200',
}
const STATUS_COLOR: Record<string, string> = { active: '#3B82F6', hold: '#9CA3AF', done: '#10B981' }
const GROUP_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#9CA3AF']

const W_ITEM = 228   // 안건 열 너비 (sticky)
const W_PAST = 224   // 직전 회의 열 너비
const W_NOW  = 592   // 이번 회의 열 너비
const W_ADD  = 62    // + 날짜 추가 열 너비

// ── 타입 ────────────────────────────────────────────────────────────
interface MeetingCol {
  id: string
  title: string
  meeting_date: string | null
}

interface ExpandedNote {
  date: string
  itemTitle: string
  note: string
  meetingId: string
}

function formatDate(d: string | null) {
  if (!d) return '날짜 미지정'
  const dt = new Date(d + 'T00:00:00')
  const days = ['일','월','화','수','목','금','토']
  return `${dt.getMonth()+1}/${dt.getDate()} (${days[dt.getDay()]})`
}

function nk(itemId: string, meetingId: string) { return `${itemId}_${meetingId}` }

// ── 컴포넌트 ────────────────────────────────────────────────────────
export default function AgendaMatrix({ category }: { category: string }) {
  const supabase = createClient()
  const router   = useRouter()

  const [groups,   setGroups]   = useState<AgendaGroup[]>([])
  const [items,    setItems]    = useState<AgendaItem[]>([])
  const [cols,     setCols]     = useState<MeetingCol[]>([])   // ascending by date
  const [notes,    setNotes]    = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(true)

  const [openGroups,    setOpenGroups]    = useState<Set<string>>(new Set())
  const [hiddenItems,   setHiddenItems]   = useState<Set<string>>(new Set())
  const [hiddenCols,    setHiddenCols]    = useState<Set<string>>(new Set())
  const [expandedNote,  setExpandedNote]  = useState<ExpandedNote | null>(null)

  const [addingGroup,  setAddingGroup]  = useState(false)
  const [newGName,     setNewGName]     = useState('')
  const [newGColor,    setNewGColor]    = useState(GROUP_COLORS[0])
  const [addingItem,   setAddingItem]   = useState<string | null>(null)
  const [newITitle,    setNewITitle]    = useState('')

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── 데이터 로드 ──────────────────────────────────────────────────
  useEffect(() => { load() }, [category])

  async function load() {
    setLoading(true)

    const [{ data: gData }, { data: mData }] = await Promise.all([
      supabase.from('agenda_groups').select('*').eq('category', category).order('sort_order'),
      supabase.from('meetings').select('id, title, meeting_date').eq('category', category)
        .order('meeting_date', { ascending: true }),
    ])

    const fetchedGroups = (gData ?? []) as AgendaGroup[]
    setGroups(fetchedGroups)
    setOpenGroups(new Set(fetchedGroups.filter(g => g.is_open).map(g => g.id)))

    const fetchedCols = (mData ?? []) as MeetingCol[]
    setCols(fetchedCols)

    // 기본 표시: 마지막(현재) + 직전 2개 → 나머지 숨김
    const hidden = new Set<string>()
    fetchedCols.forEach((m, i) => {
      if (i < fetchedCols.length - 3) hidden.add(m.id)
    })
    setHiddenCols(hidden)

    if (fetchedGroups.length > 0) {
      const { data: iData } = await supabase.from('agenda_items')
        .select('*').in('group_id', fetchedGroups.map(g => g.id)).order('sort_order')
      setItems((iData ?? []) as AgendaItem[])
    }

    if (fetchedCols.length > 0) {
      const { data: uData } = await supabase.from('agenda_updates')
        .select('*').in('meeting_id', fetchedCols.map(m => m.id))
      const map: Record<string, string> = {}
      ;(uData ?? []).forEach((u: AgendaUpdate) => { map[nk(u.agenda_item_id, u.meeting_id)] = u.note })
      setNotes(map)
    }

    setLoading(false)
  }

  // ── 노트 저장 (debounce + upsert) ────────────────────────────────
  function handleNote(itemId: string, meetingId: string, value: string) {
    const key = nk(itemId, meetingId)
    setNotes(prev => ({ ...prev, [key]: value }))
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      await supabase.from('agenda_updates').upsert(
        { agenda_item_id: itemId, meeting_id: meetingId, note: value },
        { onConflict: 'agenda_item_id,meeting_id' }
      )
    }, 600)
  }

  // ── 그룹 토글 ────────────────────────────────────────────────────
  async function toggleGroup(id: string) {
    const isOpen = openGroups.has(id)
    setOpenGroups(prev => { const s = new Set(prev); isOpen ? s.delete(id) : s.add(id); return s })
    await supabase.from('agenda_groups').update({ is_open: !isOpen }).eq('id', id)
  }

  // ── 그룹 추가 ────────────────────────────────────────────────────
  async function addGroup() {
    const name = newGName.trim(); if (!name) { setAddingGroup(false); return }
    const { data } = await supabase.from('agenda_groups')
      .insert({ category, name, color: newGColor, sort_order: groups.length, is_open: true })
      .select().single()
    if (data) { setGroups(p => [...p, data as AgendaGroup]); setOpenGroups(p => new Set([...p, (data as AgendaGroup).id])) }
    setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(false)
  }

  // ── 안건 추가 ────────────────────────────────────────────────────
  async function addItem(groupId: string) {
    const title = newITitle.trim(); if (!title) { setAddingItem(null); return }
    const sort_order = items.filter(i => i.group_id === groupId).length
    const { data } = await supabase.from('agenda_items')
      .insert({ group_id: groupId, title, item_type: 'do', status: 'active', sort_order })
      .select().single()
    if (data) setItems(p => [...p, data as AgendaItem])
    setNewITitle(''); setAddingItem(null)
  }

  // ── 날짜 추가 → meetings 테이블에 생성 ───────────────────────────
  async function addMeeting() {
    const dateStr = prompt('회의 날짜 입력 (YYYY-MM-DD)')
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
    const { data } = await supabase.from('meetings')
      .insert({ title: `${category} ${dateStr}`, meeting_date: dateStr, category, notes: [] })
      .select('id, title, meeting_date').single()
    if (!data) return
    const newCol = data as MeetingCol
    setCols(prev => [...prev, newCol].sort((a, b) => (a.meeting_date ?? '').localeCompare(b.meeting_date ?? '')))
    // 새 열은 기본 표시
    setHiddenCols(prev => { const s = new Set(prev); s.delete(newCol.id); return s })
  }

  // ── 계산값 ───────────────────────────────────────────────────────
  const visCols   = useMemo(() => cols.filter(m => !hiddenCols.has(m.id)), [cols, hiddenCols])
  const nowCol    = visCols[visCols.length - 1] ?? null
  const pastCols  = visCols.slice(0, -1)

  function prevNote(itemId: string): string {
    if (!nowCol) return ''
    const nowIdx = cols.findIndex(m => m.id === nowCol.id)
    if (nowIdx <= 0) return ''
    return notes[nk(itemId, cols[nowIdx - 1].id)] ?? ''
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-sm text-gray-400 animate-pulse">불러오는 중…</div>
  )

  const totalCols = visCols.length + 2 // past + now + add

  // ── 렌더 ─────────────────────────────────────────────────────────
  return (
    <>
      {/* 테이블 */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ paddingRight: 48 }}>
        <table style={{ borderCollapse: 'collapse' }}>

          {/* 헤더 행 */}
          <thead>
            <tr>
              {/* 안건 헤더 */}
              <th style={{ position:'sticky', left:0, top:0, zIndex:5, background:'#fff', borderBottom:'2px solid #BDD0EA', borderRight:'2px solid #BDD0EA', width:W_ITEM, minWidth:W_ITEM }}>
                <div style={{ padding:'9px 14px', fontSize:11, fontWeight:700, color:'#8FA0B5', letterSpacing:'.05em', textTransform:'uppercase' }}>안건</div>
              </th>

              {/* 직전 회의 헤더들 */}
              {pastCols.map(m => (
                <th key={m.id} style={{ position:'sticky', top:0, zIndex:3, background:'#fff', borderBottom:'2px solid #BDD0EA', borderLeft:'1px solid #DEE8F4', width:W_PAST, minWidth:W_PAST }}>
                  <div
                    title="클릭하여 회의록 보기"
                    onClick={() => router.push(`/meetings/${m.id}`)}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'7px 6px', gap:2, cursor:'pointer' }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <span style={{ fontSize:13, fontWeight:700, color:'#0D1B2E' }}>{formatDate(m.meeting_date)}</span>
                    <span style={{ fontSize:9, background:'#F2F6FB', color:'#8FA0B5', border:'1px solid #DEE8F4', padding:'1px 7px', borderRadius:99, fontWeight:700 }}>완료</span>
                  </div>
                </th>
              ))}

              {/* 이번 회의 헤더 */}
              {nowCol ? (
                <th style={{ position:'sticky', top:0, zIndex:3, background:'#F4F0FF', borderBottom:'2px solid #C4B5FD', borderLeft:'1px solid #C4B5FD', width:W_NOW, minWidth:W_NOW }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'7px 8px', gap:2 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#0D1B2E' }}>{formatDate(nowCol.meeting_date)}</span>
                    <span style={{ fontSize:9, background:'#EDE9FE', color:'#6D28D9', padding:'1px 7px', borderRadius:99, fontWeight:700 }}>이번 회의</span>
                  </div>
                </th>
              ) : (
                <th style={{ position:'sticky', top:0, zIndex:3, background:'#fff', borderBottom:'2px solid #BDD0EA', borderLeft:'1px solid #DEE8F4', width:W_NOW, minWidth:W_NOW }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'14px 8px', fontSize:12, color:'#8FA0B5' }}>
                    날짜를 추가해 회의를 시작하세요
                  </div>
                </th>
              )}

              {/* + 날짜 추가 */}
              <th style={{ position:'sticky', top:0, zIndex:3, background:'#fff', borderBottom:'2px solid #BDD0EA', borderLeft:'1px solid #DEE8F4', width:W_ADD, minWidth:W_ADD }}>
                <button
                  onClick={addMeeting}
                  className="hover:bg-gray-50 transition-colors"
                  style={{ width:'100%', height:'100%', padding:'8px 4px', background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, fontSize:18, color:'#8FA0B5' }}
                >
                  ＋
                  <span style={{ fontSize:9, color:'#8FA0B5', lineHeight:1.3, textAlign:'center' }}>날짜<br/>추가</span>
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {groups.map(group => {
              const groupItems = items.filter(i => i.group_id === group.id && !hiddenItems.has(i.id))
              const isOpen = openGroups.has(group.id)

              return (
                <Fragment key={group.id}>
                  {/* 범주 행 */}
                  <tr>
                    <td colSpan={totalCols} style={{ position:'sticky', left:0, zIndex:2, background:'#F2F6FB', borderBottom:'1px solid #BDD0EA', padding:0 }}>
                      <div
                        onClick={() => toggleGroup(group.id)}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', cursor:'pointer', userSelect:'none' }}
                        className="hover:bg-gray-100/60 transition-colors"
                      >
                        <span style={{ width:3, height:14, borderRadius:2, background:group.color, flexShrink:0 }} />
                        <span style={{ fontSize:9, color:'#8FA0B5', display:'inline-block', transition:'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                        <span style={{ fontSize:12, fontWeight:700, color:'#0D1B2E' }}>{group.name}</span>
                        <span style={{ fontSize:10, color:'#8FA0B5', background:'#DEE8F4', padding:'1px 7px', borderRadius:99 }}>{groupItems.length}개</span>
                      </div>
                    </td>
                  </tr>

                  {/* 안건 행들 */}
                  {isOpen && groupItems.map(item => {
                    const pNote = prevNote(item.id)
                    return (
                      <tr key={item.id} style={{ borderBottom:'1px solid #DEE8F4' }} className="hover:bg-blue-50/20">

                        {/* 안건 셀 */}
                        <td style={{ position:'sticky', left:0, zIndex:2, background:'#fff', borderRight:'2px solid #BDD0EA', width:W_ITEM, minWidth:W_ITEM, verticalAlign:'top' }}>
                          <div style={{ padding:'9px 14px', display:'flex', alignItems:'flex-start', gap:8 }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, marginTop:5, background:STATUS_COLOR[item.status] ?? '#9CA3AF' }} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:12.5, fontWeight:600, color:'#0D1B2E', lineHeight:1.35, marginBottom:4, textDecoration: item.status==='done' ? 'line-through' : 'none' }}>
                                {item.title}
                              </div>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${TYPE_CLS[item.item_type]}`}>
                                {TYPE_LABEL[item.item_type]}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 직전 회의 노트 셀들 */}
                        {pastCols.map(m => {
                          const note = notes[nk(item.id, m.id)] ?? ''
                          return (
                            <td key={m.id}
                              style={{ borderLeft:'1px solid #DEE8F4', width:W_PAST, minWidth:W_PAST, verticalAlign:'top', cursor: note ? 'pointer' : 'default' }}
                              onClick={() => note && setExpandedNote({ date: formatDate(m.meeting_date), itemTitle: item.title, note, meetingId: m.id })}
                              className={note ? 'hover:bg-blue-50/40' : ''}
                            >
                              <div style={{ padding:'7px 9px', minHeight:60 }}>
                                {note
                                  ? <div style={{ fontSize:11.5, color:'#4A5A72', lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:5, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{note}</div>
                                  : <div style={{ fontSize:11, color:'#BDD0EA', fontStyle:'italic' }}>—</div>
                                }
                              </div>
                            </td>
                          )
                        })}

                        {/* 이번 회의 노트 셀 */}
                        {nowCol ? (
                          <td style={{ borderLeft:'1px solid #C4B5FD', background:'#F4F0FF', width:W_NOW, minWidth:W_NOW, verticalAlign:'top' }}>
                            <div style={{ padding:'7px 9px' }}>
                              {pNote && (
                                <div style={{ marginBottom:5, padding:'4px 7px', borderLeft:'2px solid #C4B5FD', borderRadius:'0 4px 4px 0', background:'rgba(109,40,217,.05)' }}>
                                  <div style={{ fontSize:9, fontWeight:700, color:'#6D28D9', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:1 }}>직전</div>
                                  <div style={{ fontSize:10, color:'#8FA0B5', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{pNote}</div>
                                </div>
                              )}
                              <textarea
                                value={notes[nk(item.id, nowCol.id)] ?? ''}
                                onChange={e => handleNote(item.id, nowCol.id, e.target.value)}
                                placeholder="오늘 논의 내용 입력…"
                                rows={3}
                                style={{ width:'100%', border:'none', background:'transparent', resize:'none', fontSize:11.5, color:'#0D1B2E', lineHeight:1.65, fontFamily:'inherit', outline:'none', minHeight:48 }}
                              />
                            </div>
                          </td>
                        ) : (
                          <td style={{ borderLeft:'1px solid #DEE8F4', width:W_NOW, minWidth:W_NOW }} />
                        )}

                        {/* 빈 셀 */}
                        <td style={{ borderLeft:'1px solid #DEE8F4', width:W_ADD, minWidth:W_ADD }} />
                      </tr>
                    )
                  })}

                  {/* 안건 추가 행 */}
                  {isOpen && (
                    <tr key={`add-i-${group.id}`}>
                      <td colSpan={totalCols} style={{ padding:0, borderBottom:'1px solid #DEE8F4' }}>
                        {addingItem === group.id ? (
                          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px' }}>
                            <input
                              autoFocus
                              value={newITitle}
                              onChange={e => setNewITitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(group.id)
                                if (e.key === 'Escape') { setAddingItem(null); setNewITitle('') }
                              }}
                              placeholder="안건명 입력 후 Enter"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"
                            />
                            <button onClick={() => addItem(group.id)} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">추가</button>
                            <button onClick={() => { setAddingItem(null); setNewITitle('') }} className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-200">취소</button>
                          </div>
                        ) : (
                          <div
                            onClick={() => { setAddingItem(group.id); setNewITitle('') }}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            ＋ {group.name}에 안건 추가
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            {/* 범주 추가 행 */}
            <tr>
              <td colSpan={totalCols} style={{ background:'#F2F6FB', padding:0 }}>
                {addingGroup ? (
                  <div style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', flexWrap:'wrap' }}>
                    <input
                      autoFocus
                      value={newGName}
                      onChange={e => setNewGName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup()
                        if (e.key === 'Escape') { setAddingGroup(false); setNewGName('') }
                      }}
                      placeholder="범주명 입력 후 Enter"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400 w-40"
                    />
                    <div className="flex gap-1.5">
                      {GROUP_COLORS.map(c => (
                        <div key={c} onClick={() => setNewGColor(c)}
                          style={{ width:15, height:15, borderRadius:'50%', background:c, cursor:'pointer', border: newGColor === c ? '2px solid #0D1B2E' : '2px solid transparent', flexShrink:0 }} />
                      ))}
                    </div>
                    <button onClick={addGroup} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">추가</button>
                    <button onClick={() => { setAddingGroup(false); setNewGName('') }} className="text-xs bg-white text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">취소</button>
                  </div>
                ) : (
                  <div
                    onClick={() => setAddingGroup(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100/60 cursor-pointer transition-colors"
                  >
                    ＋ 범주 추가
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 노트 상세 팝업 */}
      {expandedNote && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background:'rgba(0,0,0,.22)' }}
          onClick={() => setExpandedNote(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 max-w-md w-[90%] relative"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setExpandedNote(null)} className="absolute top-3 right-4 text-gray-300 hover:text-gray-600 text-xl leading-none">×</button>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{expandedNote.date}</div>
            <div className="text-sm font-bold text-gray-900 mb-3">{expandedNote.itemTitle}</div>
            <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{expandedNote.note}</div>
            <button
              onClick={() => { router.push(`/meetings/${expandedNote.meetingId}`); setExpandedNote(null) }}
              className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-xs text-violet-600 font-semibold hover:underline w-full text-left"
            >
              회의록 탭에서 전체 보기 →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
