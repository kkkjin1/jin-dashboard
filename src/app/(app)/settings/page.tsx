'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member, Part } from '@/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

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
  const supabase = createClient()

  useEffect(() => {
    supabase.from('members').select('*').is('archived_at', null).order('part').order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
    supabase.from('members').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false })
      .then(({ data }) => setArchivedMembers((data ?? []) as Member[]))
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

  const grouped = [
    { label: '팀장', part: '팀장', list: members.filter(m => m.part === '팀장') },
    { label: '코어파트', part: '코어', list: members.filter(m => m.part === '코어') },
    { label: '비즈파트', part: '비즈', list: members.filter(m => m.part === '비즈') },
  ]

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: '#13151C', minHeight: '100%' }}>
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-bold mb-6" style={{ color: '#E2E8F0' }}>설정</h1>

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
                          className="text-xs" style={{ color: 'rgba(226,232,240,0.28)' }}>퇴사 처리</button>
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
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(226,232,240,0.28)' }}>퇴사자 ({archivedMembers.length}명)</h2>
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
    </div>
    </div>
  )
}
