'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── 조직 구조 타입 ────────────────────────────────────────────────
interface OrgPart { id: string; name: string }
interface OrgTeam { id: string; name: string; parts: OrgPart[] }

// ── 메뉴 ──────────────────────────────────────────────────────────
const ALL_NAV = [
  { href: '/',                label: '홈' },
  { href: '/project',         label: '프로젝트' },
  { href: '/tasks',           label: '업무 목록' },
  { href: '/objectives',      label: '목표관리' },
  { href: '/objectives-test', label: '목표관리(TEST)' },
  { href: '/completed',       label: '완료 성과' },
  { href: '/completed-test',  label: '완료성과(test)' },
  { href: '/meetings',        label: '회의록' },
  { href: '/schedule',        label: '일정' },
  { href: '/memos',           label: '메모' },
  { href: '/one-on-one',      label: '1on1' },
  { href: '/learning',        label: '학습자료' },
  { href: '/decisions',       label: '의사결정' },
  { href: '/journal',         label: '회고' },
  { href: '/archive',         label: '아카이브' },
]
const PINNED = ['/', '/settings']

// ── 스타일 상수 ───────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 20,
  overflow: 'hidden',
}
const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.09)',
  color: '#E2E8F0',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  outline: 'none',
}

export default function SettingsPage() {
  const supabase = createClient()

  // 팀원
  const [members, setMembers] = useState<Member[]>([])
  const [archived, setArchived] = useState<Member[]>([])

  // 조직 구조
  const [org, setOrg] = useState<OrgTeam[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [newPartInputs, setNewPartInputs] = useState<Record<string, string>>({})

  // 팀원 추가
  const [newName, setNewName] = useState('')
  const [newTeamId, setNewTeamId] = useState('')
  const [newPartId, setNewPartId] = useState('')

  // 팀원 편집
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTeamId, setEditTeamId] = useState('')
  const [editPartId, setEditPartId] = useState('')

  // 메뉴 설정
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([])
  const [menuOrder, setMenuOrder] = useState<string[]>(ALL_NAV.map(i => i.href))
  const [draggingHref, setDraggingHref] = useState<string | null>(null)
  const [dragOverHref, setDragOverHref] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('members').select('*').is('archived_at', null).order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
    supabase.from('members').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false })
      .then(({ data }) => setArchived((data ?? []) as Member[]))

    const storedOrg = localStorage.getItem('dashboard_org')
    if (storedOrg) { try { setOrg(JSON.parse(storedOrg)) } catch {} }

    const storedHidden = localStorage.getItem('dashboard_hidden_menus')
    if (storedHidden) { try { setHiddenMenus(JSON.parse(storedHidden)) } catch {} }

    const storedOrder = localStorage.getItem('dashboard_menu_order')
    if (storedOrder) {
      try {
        const o = JSON.parse(storedOrder) as string[]
        const full = [...o, ...ALL_NAV.map(i => i.href).filter(h => !o.includes(h))]
        setMenuOrder(full)
      } catch {}
    }
  }, [])

  // ── 조직 저장 ──────────────────────────────────────────────────
  function saveOrg(next: OrgTeam[]) {
    setOrg(next)
    localStorage.setItem('dashboard_org', JSON.stringify(next))
  }

  function addTeam() {
    const name = newTeamName.trim()
    if (!name || org.some(t => t.id === name)) return
    saveOrg([...org, { id: name, name, parts: [] }])
    setNewTeamName('')
  }

  function deleteTeam(teamId: string) {
    const team = org.find(t => t.id === teamId)!
    const count = team.parts.length === 0
      ? members.filter(m => m.part === teamId).length
      : members.filter(m => team.parts.some(p => p.id === m.part)).length
    if (count > 0) { alert(`팀원 ${count}명이 소속되어 있어 삭제할 수 없습니다.`); return }
    saveOrg(org.filter(t => t.id !== teamId))
  }

  function addPart(teamId: string) {
    const name = (newPartInputs[teamId] ?? '').trim()
    if (!name) return
    const team = org.find(t => t.id === teamId)!
    if (team.parts.some(p => p.id === name)) return
    saveOrg(org.map(t => t.id === teamId
      ? { ...t, parts: [...t.parts, { id: name, name }] }
      : t
    ))
    setNewPartInputs(prev => ({ ...prev, [teamId]: '' }))
  }

  function deletePart(teamId: string, partId: string) {
    const count = members.filter(m => m.part === partId).length
    if (count > 0) { alert(`팀원 ${count}명이 소속되어 있어 삭제할 수 없습니다.`); return }
    saveOrg(org.map(t => t.id === teamId
      ? { ...t, parts: t.parts.filter(p => p.id !== partId) }
      : t
    ))
  }

  // ── 팀원 추가 ──────────────────────────────────────────────────
  const selectedTeam = org.find(t => t.id === newTeamId)
  const selectedEditTeam = org.find(t => t.id === editTeamId)

  // 저장할 part 값: 파트 없는 팀이면 teamId, 파트 있으면 partId
  function resolvePartValue(teamId: string, partId: string): string {
    const team = org.find(t => t.id === teamId)
    if (!team) return teamId
    return team.parts.length === 0 ? teamId : (partId || teamId)
  }

  async function addMember() {
    if (!newName.trim() || !newTeamId) return
    const partValue = resolvePartValue(newTeamId, newPartId)
    const { data } = await supabase.from('members').insert({ name: newName.trim(), part: partValue }).select().single()
    if (data) setMembers(prev => [...prev, data as Member])
    setNewName('')
    setNewPartId('')
  }

  async function updateMember(id: string) {
    if (!editTeamId) { alert('팀을 선택해주세요'); return }
    const partValue = resolvePartValue(editTeamId, editPartId)
    const { error } = await supabase.from('members').update({ name: editName, part: partValue }).eq('id', id)
    if (error) { alert(`저장 실패: ${error.message}`); return }
    setMembers(prev => prev.map(m => m.id === id ? { ...m, name: editName, part: partValue } : m))
    setEditId(null)
  }

  async function archiveMember(id: string) {
    const m = members.find(m => m.id === id)
    if (!confirm(`'${m?.name}'을(를) 퇴사 처리하시겠습니까?\n\n1on1 기록은 보존됩니다.`)) return
    const now = new Date().toISOString()
    await supabase.from('members').update({ archived_at: now }).eq('id', id)
    setArchived(prev => [{ ...m!, archived_at: now }, ...prev])
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  async function unarchiveMember(id: string) {
    const m = archived.find(m => m.id === id)
    if (!confirm(`'${m?.name}'을(를) 복직 처리하시겠습니까?`)) return
    await supabase.from('members').update({ archived_at: null }).eq('id', id)
    setMembers(prev => [...prev, { ...m!, archived_at: null }])
    setArchived(prev => prev.filter(m => m.id !== id))
  }

  async function hardDelete(id: string) {
    const m = archived.find(m => m.id === id)
    const { count } = await supabase.from('one_on_ones').select('*', { count: 'exact', head: true }).eq('member_id', id)
    if (!confirm(`'${m?.name}' 영구 삭제${count ? `\n⚠️ 1on1 기록 ${count}건도 삭제됩니다` : ''}\n※ 담당 업무는 담당자만 해제됩니다`)) return
    await supabase.from('members').delete().eq('id', id)
    setArchived(prev => prev.filter(m => m.id !== id))
  }

  // ── 그루핑 ────────────────────────────────────────────────────
  function getMemberDisplayPart(part: string): { teamName: string; partName?: string } {
    for (const team of org) {
      if (team.parts.length === 0 && team.id === part) return { teamName: team.name }
      const p = team.parts.find(p => p.id === part)
      if (p) return { teamName: team.name, partName: p.name }
    }
    return { teamName: part }
  }

  // 팀별 그룹
  const grouped = org.map(team => {
    if (team.parts.length === 0) {
      return { team, subgroups: [{ part: null as OrgPart | null, list: members.filter(m => m.part === team.id) }] }
    }
    return {
      team,
      subgroups: team.parts.map(part => ({ part, list: members.filter(m => m.part === part.id) })),
    }
  })

  // 조직 미매핑 팀원
  const allMappedIds = new Set(members.filter(m => {
    for (const team of org) {
      if (team.id === m.part) return true
      if (team.parts.some(p => p.id === m.part)) return true
    }
    return false
  }).map(m => m.id))
  const unassigned = members.filter(m => !allMappedIds.has(m.id))

  // ── 메뉴 on/off ───────────────────────────────────────────────
  function toggleMenu(href: string) {
    const next = hiddenMenus.includes(href) ? hiddenMenus.filter(h => h !== href) : [...hiddenMenus, href]
    setHiddenMenus(next)
    localStorage.setItem('dashboard_hidden_menus', JSON.stringify(next))
    window.dispatchEvent(new Event('nav-visibility-change'))
  }

  function onMenuDragStart(href: string) { setDraggingHref(href) }
  function onMenuDragOver(e: React.DragEvent, href: string) { e.preventDefault(); setDragOverHref(href) }
  function onMenuDrop(href: string) {
    if (!draggingHref || draggingHref === href) { setDraggingHref(null); setDragOverHref(null); return }
    const o = [...menuOrder]
    const from = o.indexOf(draggingHref); const to = o.indexOf(href)
    o.splice(from, 1); o.splice(to, 0, draggingHref)
    setMenuOrder(o)
    localStorage.setItem('dashboard_menu_order', JSON.stringify(o))
    window.dispatchEvent(new Event('nav-order-change'))
    setDraggingHref(null); setDragOverHref(null)
  }

  const orderedNav = menuOrder.map(href => ALL_NAV.find(i => i.href === href)).filter(Boolean) as typeof ALL_NAV

  // ── 편집 시작 ────────────────────────────────────────────────
  function startEdit(m: Member) {
    setEditId(m.id); setEditName(m.name)
    // 팀/파트 역추적
    for (const team of org) {
      if (team.parts.length === 0 && team.id === m.part) { setEditTeamId(team.id); setEditPartId(''); return }
      const p = team.parts.find(p => p.id === m.part)
      if (p) { setEditTeamId(team.id); setEditPartId(p.id); return }
    }
    setEditTeamId(''); setEditPartId('')
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: '#0F1319' }}>
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-bold mb-6" style={{ color: '#E2E8F0' }}>설정</h1>

      {/* ══ 조직 구조 ══════════════════════════════════════════ */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.5)' }}>조직 구조</h2>

        {/* 팀 추가 */}
        <div className="flex gap-2 mb-4">
          <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTeam() }}
            placeholder="팀 이름"
            style={{ ...inp, flex: 1 }} />
          <button onClick={addTeam}
            className="text-sm px-4 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(76,127,224,0.2)', border: '1px solid rgba(76,127,224,0.35)', color: '#A8C4F0' }}>
            팀 추가
          </button>
        </div>

        {org.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: 'rgba(226,232,240,0.25)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12 }}>
            팀을 추가해 조직 구조를 만들어 보세요
          </p>
        )}

        {/* 팀 목록 */}
        <div className="space-y-3">
          {org.map(team => {
            const teamMemberCount = team.parts.length === 0
              ? members.filter(m => m.part === team.id).length
              : members.filter(m => team.parts.some(p => p.id === m.part)).length
            return (
              <div key={team.id} style={card}>
                {/* 팀 헤더 */}
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-sm font-semibold flex-1" style={{ color: '#E2E8F0' }}>{team.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(76,127,224,0.12)', color: '#A8C4F0', border: '1px solid rgba(76,127,224,0.2)' }}>
                    {teamMemberCount}명
                  </span>
                  <button onClick={() => deleteTeam(team.id)}
                    className="text-xs transition-colors hover:text-red-400"
                    style={{ color: 'rgba(226,232,240,0.25)' }}>삭제</button>
                </div>

                {/* 파트 목록 */}
                <div className="px-4 py-2">
                  {team.parts.length === 0 ? (
                    <p className="text-[10px] py-1" style={{ color: 'rgba(226,232,240,0.25)' }}>파트 없음 — 팀원이 팀에 직접 소속</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 py-1">
                      {team.parts.map(part => {
                        const cnt = members.filter(m => m.part === part.id).length
                        return (
                          <div key={part.id} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <span className="text-xs" style={{ color: '#E2E8F0' }}>{part.name}</span>
                            <span className="text-[9px] px-1 rounded-full" style={{ color: '#A8C4F0', background: 'rgba(76,127,224,0.12)' }}>{cnt}</span>
                            <button onClick={() => deletePart(team.id, part.id)}
                              className="text-[10px] ml-0.5 hover:text-red-400 transition-colors"
                              style={{ color: 'rgba(226,232,240,0.2)' }}>×</button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* 파트 추가 */}
                  <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                      value={newPartInputs[team.id] ?? ''}
                      onChange={e => setNewPartInputs(prev => ({ ...prev, [team.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addPart(team.id) }}
                      placeholder="파트 이름"
                      style={{ ...inp, flex: 1, fontSize: 12, padding: '5px 10px' }} />
                    <button onClick={() => addPart(team.id)}
                      className="text-[11px] px-3 py-1 rounded-lg transition-colors"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.6)' }}>
                      + 파트
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ══ 팀원 추가 ═══════════════════════════════════════════ */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.5)' }}>팀원 추가</h2>
        <div style={card}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMember() }}
              placeholder="이름"
              style={{ ...inp, width: '100%' }} />
            <div className="flex gap-2">
              <select value={newTeamId} onChange={e => { setNewTeamId(e.target.value); setNewPartId('') }}
                style={{ ...inp, flex: 1, cursor: 'pointer' }}>
                <option value="" style={{ background: '#1e2130' }}>팀 선택</option>
                {org.map(t => <option key={t.id} value={t.id} style={{ background: '#1e2130' }}>{t.name}</option>)}
              </select>
              {selectedTeam && selectedTeam.parts.length > 0 && (
                <select value={newPartId} onChange={e => setNewPartId(e.target.value)}
                  style={{ ...inp, flex: 1, cursor: 'pointer' }}>
                  <option value="" style={{ background: '#1e2130' }}>파트 선택</option>
                  {selectedTeam.parts.map(p => <option key={p.id} value={p.id} style={{ background: '#1e2130' }}>{p.name}</option>)}
                </select>
              )}
            </div>
            <button onClick={addMember} disabled={!newName.trim() || !newTeamId}
              className="text-sm py-2 rounded-lg transition-colors"
              style={{
                background: newName.trim() && newTeamId ? 'rgba(76,127,224,0.25)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(76,127,224,0.3)',
                color: newName.trim() && newTeamId ? '#A8C4F0' : 'rgba(226,232,240,0.25)',
                cursor: newName.trim() && newTeamId ? 'pointer' : 'default',
              }}>
              추가
            </button>
          </div>
        </div>
      </section>

      {/* ══ 팀원 목록 ════════════════════════════════════════════ */}
      {org.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.5)' }}>팀원 목록</h2>

          {grouped.map(({ team, subgroups }) => {
            const totalMembers = subgroups.reduce((sum, sg) => sum + sg.list.length, 0)
            if (totalMembers === 0) return null
            return (
            <div key={team.id} className="mb-4">
              {/* 팀 레이블 */}
              <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(226,232,240,0.4)' }}>{team.name}</p>

              {subgroups.map(({ part, list }) => (
                <div key={part?.id ?? 'direct'} className="mb-2">
                  {part && list.length > 0 && (
                    <p className="text-[10px] mb-1.5 px-1" style={{ color: 'rgba(226,232,240,0.3)' }}>{part.name}</p>
                  )}
                  {list.length === 0 ? null : (
                    <div style={card}>
                      {list.map((m, idx) => (
                        <div key={m.id} className="flex items-center gap-3 px-4 py-3 group"
                          style={idx !== 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : {}}>
                          {editId === m.id ? (
                            <>
                              <input value={editName} onChange={e => setEditName(e.target.value)}
                                autoFocus onKeyDown={e => { if (e.key === 'Enter') updateMember(m.id); if (e.key === 'Escape') setEditId(null) }}
                                style={{ ...inp, flex: 1, padding: '4px 8px', fontSize: 12 }} />
                              <select value={editTeamId} onChange={e => { setEditTeamId(e.target.value); setEditPartId('') }}
                                style={{ ...inp, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                                <option value="" style={{ background: '#1e2130' }}>팀</option>
                                {org.map(t => <option key={t.id} value={t.id} style={{ background: '#1e2130' }}>{t.name}</option>)}
                              </select>
                              {selectedEditTeam && selectedEditTeam.parts.length > 0 && (
                                <select value={editPartId} onChange={e => setEditPartId(e.target.value)}
                                  style={{ ...inp, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                                  <option value="" style={{ background: '#1e2130' }}>파트</option>
                                  {selectedEditTeam.parts.map(p => <option key={p.id} value={p.id} style={{ background: '#1e2130' }}>{p.name}</option>)}
                                </select>
                              )}
                              <button onClick={() => updateMember(m.id)} disabled={!editTeamId} className="text-xs" style={{ color: editTeamId ? '#93c5fd' : 'rgba(226,232,240,0.2)', cursor: editTeamId ? 'pointer' : 'default' }}>저장</button>
                              <button onClick={() => setEditId(null)} className="text-xs" style={{ color: 'rgba(226,232,240,0.4)' }}>취소</button>
                            </>
                          ) : (
                            <>
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}>
                                {m.name[0]}
                              </div>
                              <span className="flex-1 text-sm" style={{ color: '#E2E8F0' }}>{m.name}</span>
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEdit(m)} className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>수정</button>
                                <button onClick={() => archiveMember(m.id)} className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>삭제(보존)</button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            )
          })}

          {/* 미배정 팀원 */}
          {unassigned.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(226,232,240,0.28)' }}>미배정 ({unassigned.length}명)</p>
              <div style={card}>
                {unassigned.map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 group"
                    style={idx !== 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : {}}>
                    {editId === m.id ? (
                      <>
                        <input value={editName} onChange={e => setEditName(e.target.value)}
                          autoFocus onKeyDown={e => { if (e.key === 'Enter') updateMember(m.id); if (e.key === 'Escape') setEditId(null) }}
                          style={{ ...inp, flex: 1, padding: '4px 8px', fontSize: 12 }} />
                        <select value={editTeamId} onChange={e => { setEditTeamId(e.target.value); setEditPartId('') }}
                          style={{ ...inp, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                          <option value="" style={{ background: '#1e2130' }}>팀</option>
                          {org.map(t => <option key={t.id} value={t.id} style={{ background: '#1e2130' }}>{t.name}</option>)}
                        </select>
                        {selectedEditTeam && selectedEditTeam.parts.length > 0 && (
                          <select value={editPartId} onChange={e => setEditPartId(e.target.value)}
                            style={{ ...inp, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                            <option value="" style={{ background: '#1e2130' }}>파트</option>
                            {selectedEditTeam.parts.map(p => <option key={p.id} value={p.id} style={{ background: '#1e2130' }}>{p.name}</option>)}
                          </select>
                        )}
                        <button onClick={() => updateMember(m.id)} className="text-xs" style={{ color: '#93c5fd' }}>저장</button>
                        <button onClick={() => setEditId(null)} className="text-xs" style={{ color: 'rgba(226,232,240,0.4)' }}>취소</button>
                      </>
                    ) : (
                      <>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.28)' }}>{m.name[0]}</div>
                        <span className="flex-1 text-sm" style={{ color: 'rgba(226,232,240,0.5)' }}>{m.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(226,232,240,0.25)' }}>
                          {m.part}
                        </span>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(m)} className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>배정</button>
                          <button onClick={() => archiveMember(m.id)} className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>삭제(보존)</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══ 퇴사자 ══════════════════════════════════════════════ */}
      {archived.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.28)' }}>퇴사자 — 1on1·업무 보존 ({archived.length}명)</h2>
          <div style={card}>
            {archived.map((m, idx) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 group"
                style={idx !== 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : {}}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.28)' }}>{m.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm" style={{ color: 'rgba(226,232,240,0.5)' }}>{m.name}</span>
                  {m.archived_at && (
                    <span className="text-[10px] ml-2" style={{ color: 'rgba(226,232,240,0.28)' }}>
                      {format(parseISO(m.archived_at), 'yyyy.MM.dd', { locale: ko })} 퇴사
                    </span>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => unarchiveMember(m.id)} className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>복직</button>
                  <button onClick={() => hardDelete(m.id)} className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>완전삭제</button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-1.5 px-1" style={{ color: 'rgba(226,232,240,0.25)' }}>1on1 기록은 1on1 탭 퇴사자 아카이브에서 열람 가능합니다</p>
        </section>
      )}

      {/* ══ 메뉴 설정 ════════════════════════════════════════════ */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'rgba(226,232,240,0.5)' }}>메뉴 표시 / 순서</h2>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(226,232,240,0.28)' }}>드래그로 순서 변경 · 토글로 숨김</p>
        <div style={card}>
          {orderedNav.map(item => {
            const pinned = PINNED.includes(item.href)
            const isOn = !hiddenMenus.includes(item.href)
            const dragging = draggingHref === item.href
            const over = dragOverHref === item.href
            return (
              <div key={item.href}
                draggable
                onDragStart={() => onMenuDragStart(item.href)}
                onDragOver={e => onMenuDragOver(e, item.href)}
                onDrop={() => onMenuDrop(item.href)}
                onDragEnd={() => { setDraggingHref(null); setDragOverHref(null) }}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{
                  opacity: dragging ? 0.4 : 1,
                  background: over ? 'rgba(76,127,224,0.08)' : 'transparent',
                  borderTop: over ? '1px solid rgba(76,127,224,0.3)' : '1px solid transparent',
                  cursor: 'grab',
                }}>
                <span style={{ color: 'rgba(226,232,240,0.2)', userSelect: 'none', flexShrink: 0 }}>⠿</span>
                <span className="flex-1 text-sm" style={{ color: pinned ? 'rgba(226,232,240,0.35)' : '#E2E8F0' }}>{item.label}</span>
                {pinned && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.25)' }}>고정</span>}
                <div onClick={() => !pinned && toggleMenu(item.href)} style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: isOn ? (pinned ? 'rgba(76,127,224,0.3)' : 'rgba(76,127,224,0.7)') : 'rgba(255,255,255,0.12)',
                  cursor: pinned ? 'default' : 'pointer',
                  position: 'relative', flexShrink: 0,
                  transition: 'background 0.2s', opacity: pinned ? 0.5 : 1,
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: 'white', transition: 'transform 0.2s ease',
                    transform: isOn ? 'translateX(16px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }} />
                </div>
              </div>
            )
          })}
          <p className="text-[10px] px-4 py-2" style={{ color: 'rgba(226,232,240,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>홈·설정은 항상 표시됩니다</p>
        </div>
      </section>
    </div>
    </div>
  )
}
