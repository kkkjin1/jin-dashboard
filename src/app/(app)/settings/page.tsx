'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// 기본 파트 (DB에 이미 저장된 값 기준)
const DEFAULT_PARTS = ['팀장', '코어', '비즈']
const DEFAULT_PART_LABELS: Record<string, string> = { '팀장': '팀장', '코어': '코어파트', '비즈': '비즈파트' }

const ALL_NAV_ITEMS = [
  { href: '/',                   label: '홈' },
  { href: '/project',            label: '프로젝트' },
  { href: '/tasks',              label: '업무 목록' },
  { href: '/objectives',         label: '목표관리' },
  { href: '/objectives-test',    label: '목표관리(TEST)' },
  { href: '/completed',          label: '완료 성과' },
  { href: '/completed-test',     label: '완료성과(test)' },
  { href: '/meetings',           label: '회의록' },
  { href: '/schedule',           label: '일정' },
  { href: '/memos',              label: '메모' },
  { href: '/one-on-one',         label: '1on1' },
  { href: '/learning',           label: '학습자료' },
  { href: '/decisions',          label: '의사결정' },
  { href: '/journal',            label: '회고' },
  { href: '/archive',            label: '아카이브' },
]
const ALWAYS_VISIBLE = ['/', '/settings']

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([])
  const [newName, setNewName] = useState('')
  const [newPart, setNewPart] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPart, setEditPart] = useState('')
  const [movingId, setMovingId] = useState<string | null>(null)

  // 팀 설정
  const [teamNameInput, setTeamNameInput] = useState('인사기획팀')
  const [teamSaved, setTeamSaved] = useState(false)

  // 파트 관리
  const [parts, setParts] = useState<string[]>(DEFAULT_PARTS)
  const [partLabels, setPartLabels] = useState<Record<string, string>>(DEFAULT_PART_LABELS)
  const [newPartKey, setNewPartKey] = useState('')
  const [newPartLabel, setNewPartLabel] = useState('')

  // 메뉴 설정
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([])
  const [menuOrder, setMenuOrder] = useState<string[]>(ALL_NAV_ITEMS.map(i => i.href))
  const [draggingMenu, setDraggingMenu] = useState<string | null>(null)
  const [dragOverMenu, setDragOverMenu] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.from('members').select('*').is('archived_at', null).order('part').order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
    supabase.from('members').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false })
      .then(({ data }) => setArchivedMembers((data ?? []) as Member[]))

    const storedTeam = localStorage.getItem('dashboard_team_name')
    if (storedTeam) setTeamNameInput(storedTeam)

    const storedParts = localStorage.getItem('dashboard_parts')
    if (storedParts) { try { setParts(JSON.parse(storedParts)) } catch {} }

    const storedPartLabels = localStorage.getItem('dashboard_part_labels')
    if (storedPartLabels) { try { setPartLabels(JSON.parse(storedPartLabels)) } catch {} }

    const storedHidden = localStorage.getItem('dashboard_hidden_menus')
    if (storedHidden) { try { setHiddenMenus(JSON.parse(storedHidden)) } catch {} }

    const storedOrder = localStorage.getItem('dashboard_menu_order')
    if (storedOrder) {
      try {
        const order = JSON.parse(storedOrder) as string[]
        // 새로 추가된 항목도 포함
        const full = [...order, ...ALL_NAV_ITEMS.map(i => i.href).filter(h => !order.includes(h))]
        setMenuOrder(full)
      } catch {}
    }

    const storedNewPart = localStorage.getItem('dashboard_new_part_default')
    if (storedNewPart) setNewPart(storedNewPart)
  }, [])

  // 파트 첫 번째를 newPart 기본값으로
  useEffect(() => {
    if (!newPart && parts.length > 0) setNewPart(parts[0])
  }, [parts])

  // ── 팀 설정 ───────────────────────────────────────────────
  function saveTeamName() {
    const val = teamNameInput.trim() || '인사기획팀'
    localStorage.setItem('dashboard_team_name', val)
    window.dispatchEvent(new Event('team-name-change'))
    setTeamSaved(true)
    setTimeout(() => setTeamSaved(false), 2000)
  }

  // ── 파트 관리 ──────────────────────────────────────────────
  function addPart() {
    const key = newPartKey.trim()
    const label = newPartLabel.trim() || key
    if (!key || parts.includes(key)) return
    const updatedParts = [...parts, key]
    const updatedLabels = { ...partLabels, [key]: label }
    setParts(updatedParts)
    setPartLabels(updatedLabels)
    localStorage.setItem('dashboard_parts', JSON.stringify(updatedParts))
    localStorage.setItem('dashboard_part_labels', JSON.stringify(updatedLabels))
    setNewPartKey('')
    setNewPartLabel('')
  }

  function deletePart(key: string) {
    const count = members.filter(m => m.part === key).length
    if (count > 0) { alert(`'${partLabels[key] ?? key}'에 ${count}명의 팀원이 있어 삭제할 수 없습니다.`); return }
    const updatedParts = parts.filter(p => p !== key)
    const updatedLabels = { ...partLabels }
    delete updatedLabels[key]
    setParts(updatedParts)
    setPartLabels(updatedLabels)
    localStorage.setItem('dashboard_parts', JSON.stringify(updatedParts))
    localStorage.setItem('dashboard_part_labels', JSON.stringify(updatedLabels))
  }

  // ── 팀원 관리 ──────────────────────────────────────────────
  async function addMember() {
    if (!newName.trim() || !newPart) return
    const { data } = await supabase.from('members').insert({ name: newName.trim(), part: newPart }).select().single()
    if (data) setMembers(prev => [...prev, data as Member])
    setNewName('')
  }

  async function updateMember(id: string) {
    await supabase.from('members').update({ name: editName, part: editPart }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, name: editName, part: editPart } : m))
    setEditingId(null)
  }

  async function moveMember(id: string, toPart: string) {
    await supabase.from('members').update({ part: toPart }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, part: toPart } : m))
    setMovingId(null)
  }

  async function archiveMember(id: string) {
    const member = members.find(m => m.id === id)
    if (!confirm(`'${member?.name}'을(를) 퇴사 처리하시겠습니까?\n\n1on1 기록은 퇴사자 아카이브에 보존됩니다.`)) return
    const now = new Date().toISOString()
    await supabase.from('members').update({ archived_at: now }).eq('id', id)
    const archived = members.find(m => m.id === id)
    if (archived) {
      setMembers(prev => prev.filter(m => m.id !== id))
      setArchivedMembers(prev => [{ ...archived, archived_at: now }, ...prev])
    }
  }

  async function unarchiveMember(id: string) {
    const member = archivedMembers.find(m => m.id === id)
    if (!confirm(`'${member?.name}'을(를) 복직 처리하시겠습니까?`)) return
    await supabase.from('members').update({ archived_at: null }).eq('id', id)
    const restored = archivedMembers.find(m => m.id === id)
    if (restored) {
      setArchivedMembers(prev => prev.filter(m => m.id !== id))
      setMembers(prev => [...prev, { ...restored, archived_at: null }])
    }
  }

  async function hardDeleteMember(id: string) {
    const member = archivedMembers.find(m => m.id === id)
    const name = member?.name ?? '팀원'
    const { count: oonCount } = await supabase.from('one_on_ones').select('*', { count: 'exact', head: true }).eq('member_id', id)
    const lines = [`'${name}'을(를) 영구 삭제하시겠습니까?`]
    if (oonCount && oonCount > 0) lines.push(`\n⚠️ 1on1 기록 ${oonCount}건이 함께 삭제됩니다.`)
    lines.push('\n※ 담당 업무는 삭제되지 않고 담당자만 해제됩니다.')
    if (!confirm(lines.join(''))) return
    await supabase.from('members').delete().eq('id', id)
    setArchivedMembers(prev => prev.filter(m => m.id !== id))
  }

  // ── 메뉴 설정 ──────────────────────────────────────────────
  function toggleMenu(href: string) {
    const next = hiddenMenus.includes(href) ? hiddenMenus.filter(h => h !== href) : [...hiddenMenus, href]
    setHiddenMenus(next)
    localStorage.setItem('dashboard_hidden_menus', JSON.stringify(next))
    window.dispatchEvent(new Event('nav-visibility-change'))
  }

  function handleMenuDragStart(href: string) { setDraggingMenu(href) }
  function handleMenuDragOver(e: React.DragEvent, href: string) { e.preventDefault(); setDragOverMenu(href) }
  function handleMenuDrop(href: string) {
    if (!draggingMenu || draggingMenu === href) { setDraggingMenu(null); setDragOverMenu(null); return }
    const order = [...menuOrder]
    const fromIdx = order.indexOf(draggingMenu)
    const toIdx = order.indexOf(href)
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, draggingMenu)
    setMenuOrder(order)
    localStorage.setItem('dashboard_menu_order', JSON.stringify(order))
    window.dispatchEvent(new Event('nav-order-change'))
    setDraggingMenu(null)
    setDragOverMenu(null)
  }
  function handleMenuDragEnd() { setDraggingMenu(null); setDragOverMenu(null) }

  // ── 그루핑 (동적 파트 기반) ──────────────────────────────────
  const grouped = parts.map(part => ({
    key: part,
    label: partLabels[part] ?? part,
    list: members.filter(m => m.part === part),
  }))
  // 알 수 없는 파트(DB에만 있는) 처리
  const knownParts = new Set(parts)
  const unknownParts = [...new Set(members.filter(m => !knownParts.has(m.part)).map(m => m.part))]
  unknownParts.forEach(p => {
    grouped.push({ key: p, label: p, list: members.filter(m => m.part === p) })
  })

  const card = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20 }
  const inputCls = 'text-sm rounded-lg px-3 py-2 focus:outline-none'
  const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#E2E8F0' }
  const btnStyle = { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#E2E8F0', borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }

  // 메뉴 순서대로 정렬된 항목
  const orderedNavItems = menuOrder
    .map(href => ALL_NAV_ITEMS.find(i => i.href === href))
    .filter(Boolean) as typeof ALL_NAV_ITEMS

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: '#0F1319', minHeight: '100%' }}>
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-bold mb-6" style={{ color: '#E2E8F0' }}>설정</h1>

      {/* ── 팀 설정 ── */}
      <div className="mb-6" style={{ ...card, overflow: 'hidden' }}>
        {/* 팀명 */}
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold mb-0.5" style={{ color: 'rgba(226,232,240,0.6)' }}>팀 설정</h2>
          <p className="text-[10px] mb-4" style={{ color: 'rgba(226,232,240,0.3)' }}>저장 시 사이드바에 즉시 반영</p>
          <div className="flex gap-2 items-center">
            <input value={teamNameInput} onChange={e => setTeamNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTeamName() }}
              placeholder="팀명"
              className={inputCls + ' flex-1'} style={inputStyle} />
            <button onClick={saveTeamName} style={{
              ...btnStyle,
              background: teamSaved ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)',
              border: teamSaved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.15)',
              color: teamSaved ? '#86efac' : '#E2E8F0',
            }}>
              {teamSaved ? '저장됨 ✓' : '저장'}
            </button>
          </div>
          {/* 사이드바 미리보기 */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mt-3" style={{ background: '#161B24', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: '#1F2A44', color: 'white' }}>진</div>
            <div>
              <p className="text-[11px] font-semibold leading-tight" style={{ color: '#E7EAF0' }}>김진일</p>
              <p className="text-[9.5px] leading-tight mt-0.5" style={{ color: '#98A1B2' }}>{teamNameInput || '인사기획팀'} 팀장</p>
            </div>
          </div>
        </div>

        {/* 파트 목록 */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold" style={{ color: 'rgba(226,232,240,0.5)' }}>파트 구성</p>
            <p className="text-[10px]" style={{ color: 'rgba(226,232,240,0.28)' }}>총 {members.length}명</p>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {parts.map(key => {
              const label = partLabels[key] ?? key
              const count = members.filter(m => m.part === key).length
              const canDelete = count === 0
              return (
                <div key={key} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  <span className="text-xs" style={{ color: '#E2E8F0' }}>{label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(76,127,224,0.15)', color: '#A8C4F0' }}>{count}명</span>
                  {canDelete && (
                    <button onClick={() => deletePart(key)}
                      className="text-[10px] transition-colors hover:text-red-400 ml-0.5"
                      style={{ color: 'rgba(226,232,240,0.25)' }}>×</button>
                  )}
                </div>
              )
            })}
          </div>
          {/* 파트 추가 */}
          <div className="flex gap-2">
            <input value={newPartKey} onChange={e => setNewPartKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addPart() }}
              placeholder="파트 키 (예: 인사)"
              className={inputCls} style={{ ...inputStyle, flex: 1 }} />
            <input value={newPartLabel} onChange={e => setNewPartLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addPart() }}
              placeholder="표시명 (예: 인사팀)"
              className={inputCls} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={addPart} style={btnStyle}>추가</button>
          </div>
          <p className="text-[10px] mt-2" style={{ color: 'rgba(226,232,240,0.25)' }}>팀원이 있는 파트는 삭제 불가</p>
        </div>
      </div>

      {/* ── 팀원 추가 ── */}
      <div className="mb-6" style={{ ...card, overflow: 'hidden' }}>
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'rgba(226,232,240,0.5)' }}>팀원 추가</h2>
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMember() }}
              placeholder="이름"
              className={inputCls + ' flex-1'} style={inputStyle} />
            <select value={newPart} onChange={e => setNewPart(e.target.value)}
              className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }}>
              {parts.map(key => (
                <option key={key} value={key} style={{ background: '#1e2130', color: '#E2E8F0' }}>
                  {partLabels[key] ?? key}
                </option>
              ))}
            </select>
            <button onClick={addMember} style={btnStyle}>추가</button>
          </div>
        </div>
      </div>

      {/* ── 팀원 목록 (파트별) ── */}
      {grouped.map(({ key, label, list }) => (
        <div key={key} className="mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.5)' }}>{label} ({list.length}명)</h2>
          <div style={{ ...card, overflow: 'hidden' }}>
            {list.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'rgba(226,232,240,0.28)' }}>없음</p>
            ) : (
              list.map((member, idx) => (
                <div key={member.id}
                  className="flex items-center gap-3 px-4 py-3 group"
                  style={idx !== 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : {}}>
                  {editingId === member.id ? (
                    <>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') updateMember(member.id); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus className={inputCls + ' flex-1'} style={inputStyle} />
                      <select value={editPart} onChange={e => setEditPart(e.target.value)}
                        className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }}>
                        {parts.map(p => (
                          <option key={p} value={p} style={{ background: '#1e2130', color: '#E2E8F0' }}>
                            {partLabels[p] ?? p}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => updateMember(member.id)} className="text-xs" style={{ color: '#93c5fd' }}>저장</button>
                      <button onClick={() => setEditingId(null)} className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>취소</button>
                    </>
                  ) : movingId === member.id ? (
                    <>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}>
                        {member.name[0]}
                      </div>
                      <span className="text-sm flex-shrink-0" style={{ color: 'rgba(226,232,240,0.5)' }}>{member.name}</span>
                      <span className="text-xs flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>→</span>
                      <div className="flex gap-1.5 flex-1 flex-wrap">
                        {parts.filter(p => p !== member.part).map(p => (
                          <button key={p} onClick={() => moveMember(member.id, p)}
                            className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                            style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.5)', background: 'transparent' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#E2E8F0' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(226,232,240,0.5)' }}>
                            {partLabels[p] ?? p}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setMovingId(null)} className="text-xs flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>취소</button>
                    </>
                  ) : (
                    <>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}>
                        {member.name[0]}
                      </div>
                      <span className="flex-1 text-sm" style={{ color: '#E2E8F0' }}>{member.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {partLabels[member.part] ?? member.part}
                      </span>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingId(member.id); setEditName(member.name); setEditPart(member.part) }}
                          className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>수정</button>
                        <button onClick={() => setMovingId(member.id)}
                          className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>이동</button>
                        <button onClick={() => archiveMember(member.id)}
                          className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>삭제(보존)</button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ))}

      {/* ── 퇴사자 ── */}
      {archivedMembers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.28)' }}>퇴사자 — 1on1·업무 보존 ({archivedMembers.length}명)</h2>
          <div style={{ ...card, overflow: 'hidden' }}>
            {archivedMembers.map((member, idx) => (
              <div key={member.id}
                className="flex items-center gap-3 px-4 py-3 group"
                style={idx !== 0 ? { borderTop: '1px solid rgba(255,255,255,0.06)' } : {}}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(226,232,240,0.28)' }}>
                  {member.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm" style={{ color: 'rgba(226,232,240,0.5)' }}>{member.name}</span>
                  {member.archived_at && (
                    <span className="text-[10px] ml-2" style={{ color: 'rgba(226,232,240,0.28)' }}>
                      {format(parseISO(member.archived_at), 'yyyy.MM.dd', { locale: ko })} 퇴사
                    </span>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => unarchiveMember(member.id)} className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>복직</button>
                  <button onClick={() => hardDeleteMember(member.id)} className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>완전삭제</button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-2 px-1" style={{ color: 'rgba(226,232,240,0.28)' }}>1on1 기록은 1on1 탭 퇴사자 아카이브에서 열람 가능합니다</p>
        </div>
      )}

      {/* ── 메뉴 설정 (순서 변경 + on/off) ── */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'rgba(226,232,240,0.5)' }}>메뉴 표시 / 순서</h2>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(226,232,240,0.28)' }}>드래그로 순서 변경 · 토글로 숨김 처리</p>
        <div style={{ ...card, overflow: 'hidden', padding: '4px 0' }}>
          {orderedNavItems.map((item) => {
            const alwaysOn = ALWAYS_VISIBLE.includes(item.href)
            const isOn = !hiddenMenus.includes(item.href)
            const isDragging = draggingMenu === item.href
            const isDragOver = dragOverMenu === item.href
            return (
              <div key={item.href}
                draggable
                onDragStart={() => handleMenuDragStart(item.href)}
                onDragOver={e => handleMenuDragOver(e, item.href)}
                onDrop={() => handleMenuDrop(item.href)}
                onDragEnd={handleMenuDragEnd}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{
                  opacity: isDragging ? 0.4 : 1,
                  background: isDragOver ? 'rgba(76,127,224,0.08)' : 'transparent',
                  borderTop: isDragOver ? '1px solid rgba(76,127,224,0.3)' : '1px solid transparent',
                  cursor: 'grab',
                }}>
                {/* 드래그 핸들 */}
                <span style={{ color: 'rgba(226,232,240,0.2)', fontSize: 14, userSelect: 'none', flexShrink: 0 }}>⠿</span>
                <span className="flex-1 text-sm" style={{ color: alwaysOn ? 'rgba(226,232,240,0.35)' : '#E2E8F0' }}>
                  {item.label}
                </span>
                {alwaysOn && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.25)' }}>고정</span>}
                {/* 토글 */}
                <div
                  onClick={() => !alwaysOn && toggleMenu(item.href)}
                  style={{
                    width: 36, height: 20,
                    borderRadius: 10,
                    background: isOn ? (alwaysOn ? 'rgba(76,127,224,0.3)' : 'rgba(76,127,224,0.7)') : 'rgba(255,255,255,0.12)',
                    cursor: alwaysOn ? 'default' : 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background 0.2s',
                    opacity: alwaysOn ? 0.5 : 1,
                  }}>
                  <div style={{
                    position: 'absolute',
                    top: 2, left: 2,
                    width: 16, height: 16,
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'transform 0.2s ease',
                    transform: isOn ? 'translateX(16px)' : 'translateX(0px)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }} />
                </div>
              </div>
            )
          })}
          <p className="text-[10px] px-4 py-2" style={{ color: 'rgba(226,232,240,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>홈·설정은 항상 표시됩니다</p>
        </div>
      </div>
    </div>
    </div>
  )
}
