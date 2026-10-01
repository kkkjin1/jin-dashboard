'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { X } from 'lucide-react'
import type { AgendaGroup, AgendaItem } from '@/types'

// 연간목표(YEAR PLAN) → 프로젝트(EXECUTION) 생성 — 자동 생성하지 않고 사용자가 이름을 직접 쓴다.
// 프로젝트 = agenda_items 1행. agenda_items.group_id NOT NULL이라 팀 탭 + 범주(agenda_groups)를 고른다.
// 같은 연도계획에서 여러 번 만들 수 있다(YEAR PLAN 1 : N PROJECT).
interface Props {
  supabase: SupabaseClient
  yearPlanId: string
  sourceLabel: string
  onClose: () => void
  onCreated: (project: AgendaItem) => void
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// agenda_items.description은 Tiptap HTML — 줄바꿈을 문단으로 바꿔 저장
function plainToHtml(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim())
  if (lines.every(l => !l)) return null
  return lines.map(l => (l ? `<p>${escapeHtml(l)}</p>` : '<p></p>')).join('')
}

const SESSION_KEY = 'goal-project-last-group'

export default function CreateGoalProjectModal({ supabase, yearPlanId, sourceLabel, onClose, onCreated }: Props) {
  const [groups, setGroups] = useState<AgendaGroup[]>([])
  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('agenda_groups').select('*').order('sort_order').then(({ data }) => {
      const list = (data ?? []) as AgendaGroup[]
      setGroups(list)
      let last: string | null = null
      try { last = sessionStorage.getItem(SESSION_KEY) } catch {}
      const initial = list.find(g => g.id === last) ?? list[0]
      if (initial) { setCategory(initial.category); setGroupId(initial.id) }
    })
  }, [supabase])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const categories = useMemo(() => [...new Set(groups.map(g => g.category))], [groups])
  const categoryGroups = useMemo(() => groups.filter(g => g.category === category), [groups, category])

  function selectCategory(c: string) {
    setCategory(c)
    setGroupId(groups.find(g => g.category === c)?.id ?? '')
  }

  async function create() {
    const t = title.trim()
    if (!t || !groupId || saving) return
    setSaving(true); setError('')
    const { count } = await supabase.from('agenda_items').select('id', { count: 'exact', head: true }).eq('group_id', groupId)
    const { data, error: err } = await supabase.from('agenda_items').insert({
      group_id: groupId, title: t, description: plainToHtml(description),
      item_type: 'do', status: 'active', sort_order: count ?? 0,
      annual_goal_year_plan_id: yearPlanId,
    }).select().single()
    setSaving(false)
    if (err || !data) { setError(`프로젝트 생성 실패: ${err?.message ?? '알 수 없는 오류'}`); return }
    try { sessionStorage.setItem(SESSION_KEY, groupId) } catch {}
    onCreated(data as AgendaItem)
  }

  const label = 'text-[11px] font-semibold mb-1.5'
  const labelColor = { color: 'rgba(var(--text-rgb),0.5)' }
  const field = 'w-full text-[13px] rounded-lg px-3 py-2 outline-none'
  const fieldStyle = { background: 'rgba(var(--ink-rgb),0.04)', border: '1px solid rgba(var(--ink-rgb),0.1)', color: 'rgba(var(--text-rgb),1)' }
  const pill = (active: boolean) => ({
    background: active ? 'rgba(var(--ink-rgb),0.1)' : 'transparent',
    color: active ? 'rgba(var(--text-rgb),1)' : 'rgba(var(--text-rgb),0.45)',
  })

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface-elevated)', border: '1px solid rgba(var(--ink-rgb),0.14)', maxHeight: '85vh', boxShadow: 'var(--shadow-modal)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.08)' }}>
          <h2 className="text-[14px] font-bold" style={{ color: 'rgba(var(--text-rgb),1)' }}>프로젝트 만들기</h2>
          <button onClick={onClose} style={{ color: 'rgba(var(--text-rgb),0.4)' }}><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          <div>
            <p className={label} style={labelColor}>연결 목표</p>
            <p className="text-[12.5px]" style={{ color: 'rgba(var(--text-rgb),0.75)' }}>{sourceLabel}</p>
          </div>

          <div>
            <p className={label} style={labelColor}>프로젝트 위치 (팀 · 범주)</p>
            {groups.length === 0 ? (
              <p className="text-[12px]" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>프로젝트 화면에 범주가 없습니다. 먼저 범주를 만들어주세요.</p>
            ) : (
              <>
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {categories.map(c => (
                    <button key={c} onClick={() => selectCategory(c)} className="text-[12px] px-2.5 py-1 rounded-md font-medium" style={pill(c === category)}>{c}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {categoryGroups.map(g => (
                    <button key={g.id} onClick={() => setGroupId(g.id)} className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md" style={pill(g.id === groupId)}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />{g.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <p className={label} style={labelColor}>프로젝트명</p>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) create() }}
              placeholder="예: 2027 인력계획 수립" className={field} style={fieldStyle} />
          </div>

          <div>
            <p className={label} style={labelColor}>설명 (선택)</p>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={`${field} resize-none`} style={fieldStyle} />
          </div>

          {error && <p className="text-[12px]" style={{ color: 'var(--error-badge-text)' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(var(--ink-rgb),0.08)' }}>
          <button onClick={onClose} className="text-[12px] px-3 py-1.5 rounded-lg" style={{ color: 'rgba(var(--text-rgb),0.5)' }}>취소</button>
          <button onClick={create} disabled={!title.trim() || !groupId || saving}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ background: 'rgba(76,127,224,0.15)', border: '1px solid rgba(76,127,224,0.28)', color: 'var(--accent-text)' }}>
            {saving ? '생성 중…' : '생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
