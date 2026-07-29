'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member, Part } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/project', label: '프로젝트' },
  { href: '/tasks', label: '업무 목록' },
  { href: '/objectives', label: '목표관리' },
  { href: '/objectives-test', label: '목표관리(TEST)' },
  { href: '/completed', label: '완료 성과' },
  { href: '/completed-test', label: '완료성과(test)' },
  { href: '/meetings', label: '회의록' },
  { href: '/schedule', label: '일정' },
  { href: '/memos', label: '메모' },
  { href: '/one-on-one', label: '1on1' },
  { href: '/learning', label: '학습자료' },
  { href: '/decisions', label: '의사결정' },
  { href: '/journal', label: '회고' },
  { href: '/archive', label: '아카이브' },
]
const ALWAYS_VISIBLE = ['/', '/settings']

const PARTS: { value: Part; label: string }[] = [
  { value: '팀장', label: '팀장' },
  { value: '코어', label: '코어파트' },
  { value: '비즈', label: '비즈파트' },
]

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([])
  const [newName, setNewName] = useState('')
  const [newPart, setNewPart] = useState<Part>('코어')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPart, setEditPart] = useState<Part>('코어')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [teamNameInput, setTeamNameInput] = useState('인사기획팀')
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([])
  const [teamSaved, setTeamSaved] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('members').select('*').is('archived_at', null).order('part').order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
    supabase.from('members').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false })
      .then(({ data }) => setArchivedMembers((data ?? []) as Member[]))
    const storedTeam = localStorage.getItem('dashboard_team_name')
    if (storedTeam) setTeamNameInput(storedTeam)
    const storedHidden = localStorage.getItem('dashboard_hidden_menus')
    if (storedHidden) { try { setHiddenMenus(JSON.parse(storedHidden)) } catch {} }
  }, [])

  async function addMember() {
    if (!newName.trim()) return
    const { data } = await supabase.from('members').insert({ name: newName.trim(), part: newPart }).select().single()
    if (data) setMembers(prev => [...prev, data as Member])
    setNewName('')
  }

  async function updateMember(id: string) {
    await supabase.from('members').update({ name: editName, part: editPart }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, name: editName, part: editPart } : m))
    setEditingId(null)
  }

  async function moveMember(id: string, newPart: Part) {
    await supabase.from('members').update({ part: newPart }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, part: newPart } : m))
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

    const { count: oonCount } = await supabase
      .from('one_on_ones')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', id)

    const lines = [`'${name}'을(를) 영구 삭제하시겠습니까?`]
    if (oonCount && oonCount > 0) {
      lines.push(`\n⚠️ 1on1 기록 ${oonCount}건이 함께 삭제됩니다.`)
    }
    lines.push('\n※ 담당 업무는 삭제되지 않고 담당자만 해제됩니다.')

    if (!confirm(lines.join(''))) return
    await supabase.from('members').delete().eq('id', id)
    setArchivedMembers(prev => prev.filter(m => m.id !== id))
  }

  function saveTeamName() {
    localStorage.setItem('dashboard_team_name', teamNameInput.trim() || '인사기획팀')
    window.dispatchEvent(new Event('team-name-change'))
    setTeamSaved(true)
    setTimeout(() => setTeamSaved(false), 2000)
  }

  function toggleMenu(href: string) {
    const next = hiddenMenus.includes(href)
      ? hiddenMenus.filter(h => h !== href)
      : [...hiddenMenus, href]
    setHiddenMenus(next)
    localStorage.setItem('dashboard_hidden_menus', JSON.stringify(next))
    window.dispatchEvent(new Event('nav-visibility-change'))
  }

  const grouped = [
    { label: '팀장', part: '팀장', list: members.filter(m => m.part === '팀장') },
    { label: '코어파트', part: '코어', list: members.filter(m => m.part === '코어') },
    { label: '비즈파트', part: '비즈', list: members.filter(m => m.part === '비즈') },
  ]

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: '#0F1319', minHeight: '100%' }}>
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-bold mb-6" style={{ color: '#E2E8F0' }}>설정</h1>

      {/* 팀 설정 */}
      <div className="mb-6" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, overflow: 'hidden' }}>
        {/* 팀명 입력 */}
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold mb-0.5" style={{ color: 'rgba(226,232,240,0.6)' }}>팀 설정</h2>
          <p className="text-[10px] mb-4" style={{ color: 'rgba(226,232,240,0.3)' }}>저장 시 사이드바 상단에 즉시 반영</p>
          <div className="flex gap-2 items-center">
            <input value={teamNameInput} onChange={e => setTeamNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTeamName() }}
              placeholder="팀명"
              className="flex-1 text-sm rounded-lg px-3 py-2 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#E2E8F0' }}
            />
            <button onClick={saveTeamName}
              className="text-sm px-4 py-2 rounded-lg transition-all flex-shrink-0"
              style={{
                background: teamSaved ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)',
                border: teamSaved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.15)',
                color: teamSaved ? '#86efac' : '#E2E8F0',
              }}>
              {teamSaved ? '저장됨 ✓' : '저장'}
            </button>
          </div>
        </div>

        {/* 팀 구성 현황 */}
        <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] mb-2.5" style={{ color: 'rgba(226,232,240,0.3)' }}>팀 구성</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: '팀장', part: '팀장' as const, color: 'rgba(168,196,240,0.15)', textColor: '#A8C4F0', border: 'rgba(76,127,224,0.25)' },
              { label: '코어파트', part: '코어' as const, color: 'rgba(167,243,208,0.1)', textColor: '#86efac', border: 'rgba(34,197,94,0.2)' },
              { label: '비즈파트', part: '비즈' as const, color: 'rgba(251,191,36,0.1)', textColor: '#fde68a', border: 'rgba(251,191,36,0.2)' },
            ].map(({ label, part, color, textColor, border }) => {
              const count = members.filter(m => m.part === part).length
              return (
                <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: color, border: `1px solid ${border}` }}>
                  <span className="text-xs font-medium" style={{ color: textColor }}>{label}</span>
                  <span className="text-xs font-semibold" style={{ color: textColor }}>{count}명</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 사이드바 미리보기 */}
        <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] mb-2" style={{ color: 'rgba(226,232,240,0.3)' }}>사이드바 미리보기</p>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#161B24', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content', minWidth: 180 }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: '#1F2A44', color: 'white' }}>진</div>
            <div>
              <p className="text-[11px] font-semibold leading-tight" style={{ color: '#E7EAF0' }}>김진일</p>
              <p className="text-[9.5px] leading-tight mt-0.5" style={{ color: '#98A1B2' }}>{teamNameInput || '인사기획팀'} 팀장</p>
            </div>
          </div>
        </div>
      </div>

      {/* 팀원 추가 */}
      <div className="rounded-xl p-5 mb-6" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.07) inset', borderRadius: 20 }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'rgba(226,232,240,0.5)' }}>팀원 추가</h2>
        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addMember() }}
            placeholder="이름"
            className="flex-1 text-sm rounded-lg px-3 py-2 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#E2E8F0' }}
          />
          <select value={newPart} onChange={e => setNewPart(e.target.value as Part)}
            className="text-sm rounded-lg px-3 py-2 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#E2E8F0' }}>
            {PARTS.map(p => <option key={p.value} value={p.value} style={{ background: '#1e2130', color: '#E2E8F0' }}>{p.label}</option>)}
          </select>
          <button onClick={addMember}
            className="text-sm px-4 py-2 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#E2E8F0' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}>
            추가
          </button>
        </div>
      </div>

      {grouped.map(({ label, list }) => (
        <div key={label} className="mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.5)' }}>{label} ({list.length}명)</h2>
          <div className="overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.07) inset', borderRadius: 20 }}>
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
                        autoFocus
                        className="flex-1 text-sm rounded-lg px-2 py-1 focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#E2E8F0' }} />
                      <select value={editPart} onChange={e => setEditPart(e.target.value as Part)}
                        className="text-sm rounded-lg px-2 py-1 focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#E2E8F0' }}>
                        {PARTS.map(p => <option key={p.value} value={p.value} style={{ background: '#1e2130', color: '#E2E8F0' }}>{p.label}</option>)}
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
                        {PARTS.filter(p => p.value !== member.part).map(p => (
                          <button key={p.value} onClick={() => moveMember(member.id, p.value)}
                            className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                            style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.5)', background: 'transparent' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#E2E8F0'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(226,232,240,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}>
                            {p.label}
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

      {archivedMembers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.28)' }}>퇴사자 — 1on1·업무 보존 ({archivedMembers.length}명)</h2>
          <div className="overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 40px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.07) inset', borderRadius: 20 }}>
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
                  <button onClick={() => unarchiveMember(member.id)}
                    className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>복직</button>
                  <button onClick={() => hardDeleteMember(member.id)}
                    className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>완전삭제</button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-2 px-1" style={{ color: 'rgba(226,232,240,0.28)' }}>1on1 기록은 1on1 탭 퇴사자 아카이브에서 열람 가능합니다</p>
        </div>
      )}

      {/* 메뉴 설정 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.5)' }}>메뉴 표시</h2>
        <div className="overflow-hidden px-4 py-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20 }}>
          {NAV_ITEMS.map((item, idx) => {
            const alwaysOn = ALWAYS_VISIBLE.includes(item.href)
            const isOn = !hiddenMenus.includes(item.href)
            return (
              <div key={item.href} className="flex items-center justify-between py-2"
                style={idx !== 0 ? { borderTop: '1px solid rgba(255,255,255,0.04)' } : {}}>
                <span className="text-sm" style={{ color: alwaysOn ? 'rgba(226,232,240,0.28)' : '#E2E8F0' }}>{item.label}</span>
                <div
                  onClick={() => !alwaysOn && toggleMenu(item.href)}
                  style={{
                    width: 36, height: 20,
                    borderRadius: 10,
                    background: isOn ? (alwaysOn ? 'rgba(76,127,224,0.35)' : 'rgba(76,127,224,0.7)') : 'rgba(255,255,255,0.12)',
                    cursor: alwaysOn ? 'default' : 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background 0.2s',
                    opacity: alwaysOn ? 0.5 : 1,
                  }}>
                  <div style={{
                    position: 'absolute',
                    top: 2,
                    left: 2,
                    width: 16,
                    height: 16,
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
          <p className="text-[10px] mt-3 pt-2" style={{ color: 'rgba(226,232,240,0.28)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>홈·설정은 항상 표시됩니다</p>
        </div>
      </div>
    </div>
    </div>
  )
}
