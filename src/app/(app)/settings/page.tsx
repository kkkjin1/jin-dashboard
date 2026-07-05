'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member, Part } from '@/types'

const PARTS: { value: Part; label: string }[] = [
  { value: '팀장', label: '팀장' },
  { value: '코어', label: '코어파트' },
  { value: '비즈', label: '비즈파트' },
]

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [newName, setNewName] = useState('')
  const [newPart, setNewPart] = useState<Part>('코어')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPart, setEditPart] = useState<Part>('코어')
  const supabase = createClient()

  useEffect(() => {
    supabase.from('members').select('*').order('part').order('name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
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

  async function deleteMember(id: string) {
    if (!confirm('팀원을 삭제하시겠습니까?')) return
    await supabase.from('members').delete().eq('id', id)
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  const grouped: { label: string; part: Part; list: Member[] }[] = [
    { label: '팀장', part: '팀장', list: members.filter(m => m.part === '팀장') },
    { label: '코어파트', part: '코어', list: members.filter(m => m.part === '코어') },
    { label: '비즈파트', part: '비즈', list: members.filter(m => m.part === '비즈') },
  ]

  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-6">설정</h1>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">팀원 추가</h2>
        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addMember() }}
            placeholder="이름"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
          <select value={newPart} onChange={e => setNewPart(e.target.value as Part)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white">
            {PARTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={addMember}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            추가
          </button>
        </div>
      </div>

      {grouped.map(({ label, list }) => (
        <div key={label} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">{label} ({list.length}명)</h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {list.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-4">없음</p>
            ) : (
              list.map((member, idx) => (
                <div key={member.id} className={`flex items-center gap-3 px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''} group`}>
                  {editingId === member.id ? (
                    <>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') updateMember(member.id); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none" />
                      <select value={editPart} onChange={e => setEditPart(e.target.value as Part)}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white">
                        {PARTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <button onClick={() => updateMember(member.id)} className="text-xs text-blue-500 hover:text-blue-700">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">취소</button>
                    </>
                  ) : (
                    <>
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium">
                        {member.name[0]}
                      </div>
                      <span className="flex-1 text-sm text-gray-700">{member.name}</span>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingId(member.id); setEditName(member.name); setEditPart(member.part) }}
                          className="text-xs text-gray-400 hover:text-gray-600">수정</button>
                        <button onClick={() => deleteMember(member.id)} className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
    </div>
  )
}
