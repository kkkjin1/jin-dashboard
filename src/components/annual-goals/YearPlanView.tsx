'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaItem, AnnualGoalItem, AnnualGoalYearPlan, YearPlanPriority } from '@/types'
import { GlassSelect } from '@/components/ui/GlassSelect'
import { YEAR_PLAN_OPTIONS, YEAR_PLAN_PRIORITIES, YEAR_PLAN_LABEL, YEAR_PLAN_COLOR, canCreateProject, catLabel, yearPlanSourceLabel } from '@/lib/yearPlan'
import CreateGoalProjectModal from './CreateGoalProjectModal'

// 연간목표 PLAN 화면 — "이 연도에 어떤 HR 목표에 집중할 것인가?"
// 영역(고정 taxonomy) > 목표(HR Master)만 보여주고, 우선순위는 annual_goal_year_plans(year x 목표)에 저장한다.
// 연도를 바꾸면 Master는 그대로, 우선순위만 그 연도 값으로 바뀐다.
// annual_goal_tasks(legacy 안건)는 여기서 다루지 않는다 — "기존 안건" 토글(AnnualRoadmap)에서만.

// AnnualRoadmap의 CATEGORY_SECTION_COLOR와 동일한 섹션 타이틀 파스텔 톤
const CATEGORY_SECTION_COLOR: Record<string, { bg: string; text: string }> = {
  '1. 인재 확보':   { bg: '#C7D5E3', text: '#3F5670' },
  '2. 검증과 정렬': { bg: '#DCEAE1', text: '#4F7160' },
  '3. 유지와 보상': { bg: '#F3DED4', text: '#8B5A44' },
  '4. 지속가능성':  { bg: '#F1DCE4', text: '#8A5468' },
  '5. 확장 기반':   { bg: '#E8E4DC', text: '#6B665A' },
}
// agenda_items.status 라벨 — 프로젝트 목록(AgendaMatrix)과 동일
const PROJECT_STATUS_LABEL: Record<string, string> = { active: '진행필요', hold: '진행중', done: '진행완료' }

type LinkedProject = Pick<AgendaItem, 'id' | 'title' | 'status' | 'annual_goal_year_plan_id'> & { done: number; total: number }

const S = {
  t1: 'rgba(var(--text-rgb),1)', t2: 'rgba(var(--text-rgb),0.7)', t3: 'rgba(var(--text-rgb),0.4)', t4: 'rgba(var(--text-rgb),0.28)',
  bd: '1px solid rgba(var(--ink-rgb),0.07)',
}
const COL = { priority: 104, action: 104 } as const

interface Props {
  category: string
  allCats: string[]
  year: number
  categoryLabels: Record<string, string>
  onRenameCategory: (key: string, name: string) => void
}

export default function YearPlanView({ category, allCats, year, categoryLabels, onRenameCategory }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const isAll = category === '전체'

  const [items, setItems] = useState<AnnualGoalItem[]>([])
  const [plans, setPlans] = useState<AnnualGoalYearPlan[]>([])
  const [projects, setProjects] = useState<LinkedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  const [editingCatKey, setEditingCatKey] = useState<string | null>(null)
  const [editCatVal, setEditCatVal] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editIName, setEditIName] = useState('')
  const [addingCat, setAddingCat] = useState<string | null>(null)
  const [newIName, setNewIName] = useState('')
  const [createFor, setCreateFor] = useState<{ plan: AnnualGoalYearPlan; item: AnnualGoalItem } | null>(null)

  // ── 로드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setLoadError('')
      const iQuery = supabase.from('annual_goal_items').select('*').order('sort_order')
      const { data: iData } = isAll ? await iQuery : await iQuery.eq('category', category)
      const fetchedItems = (iData ?? []) as AnnualGoalItem[]
      let fetchedPlans: AnnualGoalYearPlan[] = []
      let fetchedProjects: LinkedProject[] = []
      if (fetchedItems.length > 0) {
        const { data: pData, error: pErr } = await supabase.from('annual_goal_year_plans')
          .select('*').eq('year', year).in('annual_goal_item_id', fetchedItems.map(i => i.id))
        if (pErr) { if (!cancelled) setLoadError(`연도계획을 불러오지 못했습니다(schema v59 적용 필요?): ${pErr.message}`) }
        fetchedPlans = (pData ?? []) as AnnualGoalYearPlan[]
        if (fetchedPlans.length > 0) {
          const { data: prData } = await supabase.from('agenda_items')
            .select('id, title, status, annual_goal_year_plan_id').in('annual_goal_year_plan_id', fetchedPlans.map(p => p.id)).order('created_at')
          const prList = (prData ?? []) as Pick<AgendaItem, 'id' | 'title' | 'status' | 'annual_goal_year_plan_id'>[]
          const { data: stData } = prList.length > 0
            ? await supabase.from('agenda_sub_tasks').select('agenda_item_id, status').in('agenda_item_id', prList.map(p => p.id))
            : { data: [] }
          const st = (stData ?? []) as { agenda_item_id: string; status: string }[]
          fetchedProjects = prList.map(p => {
            const mine = st.filter(s => s.agenda_item_id === p.id)
            return { ...p, total: mine.length, done: mine.filter(s => s.status === 'done').length }
          })
        }
      }
      if (cancelled) return
      setItems(fetchedItems); setPlans(fetchedPlans); setProjects(fetchedProjects)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, category, isAll, year])

  const planByItem = useMemo(() => new Map(plans.map(p => [p.annual_goal_item_id, p])), [plans])
  const projectsByPlan = useMemo(() => {
    const m = new Map<string, LinkedProject[]>()
    projects.forEach(p => { if (p.annual_goal_year_plan_id) m.set(p.annual_goal_year_plan_id, [...(m.get(p.annual_goal_year_plan_id) ?? []), p]) })
    return m
  }, [projects])

  function flashError(msg: string) { setSaveError(msg); setTimeout(() => setSaveError(''), 5000) }

  // ── 우선순위 (year x 목표 upsert — 다른 연도 행은 건드리지 않는다) ─────────
  async function setPriority(item: AnnualGoalItem, priority: YearPlanPriority) {
    const { data, error } = await supabase.from('annual_goal_year_plans')
      .upsert({ year, annual_goal_item_id: item.id, priority }, { onConflict: 'year,annual_goal_item_id' })
      .select().single()
    if (error || !data) { flashError(`우선순위 저장 실패: ${error?.message ?? ''}`); return }
    const saved = data as AnnualGoalYearPlan
    setPlans(prev => [...prev.filter(p => p.annual_goal_item_id !== item.id), saved])
  }

  // ── 목표(HR Master) 추가/이름변경/삭제 ─────────────────────────────
  async function addItem(cat: string) {
    const title = newIName.trim()
    if (!title) { setAddingCat(null); return }
    const sortOrder = items.filter(i => i.category === cat).length
    const { data, error } = await supabase.from('annual_goal_items').insert({ category: cat, title, sort_order: sortOrder, is_open: true }).select().single()
    if (error || !data) { flashError(`목표 추가 실패: ${error?.message ?? ''}`); return }
    setItems(p => [...p, data as AnnualGoalItem])
    setNewIName(''); setAddingCat(null)
  }
  async function renameItem(itemId: string) {
    const title = editIName.trim()
    setEditingItemId(null)
    if (!title) return
    const { error } = await supabase.from('annual_goal_items').update({ title }).eq('id', itemId)
    if (error) { flashError(`이름 변경 실패: ${error.message}`); return }
    setItems(p => p.map(i => i.id === itemId ? { ...i, title } : i))
  }
  async function deleteItem(item: AnnualGoalItem) {
    if (!confirm(`'${item.title}' 목표를 삭제할까요?\n모든 연도의 우선순위와 기존 안건(legacy)도 함께 삭제되며, 연결된 프로젝트는 일반 실무로 전환됩니다.`)) return
    const { error } = await supabase.from('annual_goal_items').delete().eq('id', item.id)
    if (error) { flashError(`목표 삭제 실패: ${error.message}`); return }
    setItems(p => p.filter(i => i.id !== item.id))
    setPlans(p => p.filter(pl => pl.annual_goal_item_id !== item.id))
  }

  function commitEditCat() {
    if (editingCatKey) onRenameCategory(editingCatKey, editCatVal)
    setEditingCatKey(null)
  }

  if (loading) return <div className="flex items-center justify-center h-32 text-sm animate-pulse" style={{ color: S.t3 }}>불러오는 중…</div>

  const cats = isAll ? allCats : [category]
  const summary = YEAR_PLAN_PRIORITIES.map(p => ({ p, n: plans.filter(pl => pl.priority === p).length }))
  const unsetCount = items.length - plans.length

  function renderRow(item: AnnualGoalItem) {
    const plan = planByItem.get(item.id)
    const linked = plan ? projectsByPlan.get(plan.id) ?? [] : []
    const muted = plan?.priority === 'excluded'
    return (
      <div key={item.id} className="group/yp" style={{ borderTop: S.bd }}>
        <div className="flex items-center gap-3 px-4 py-2" style={{ minHeight: 40 }}>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {editingItemId === item.id ? (
              <input autoFocus value={editIName} onChange={e => setEditIName(e.target.value)}
                onBlur={() => renameItem(item.id)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) renameItem(item.id); if (e.key === 'Escape') setEditingItemId(null) }}
                className="flex-1 text-[13px] bg-transparent outline-none px-1 rounded" style={{ color: S.t1, border: '1px solid rgba(var(--ink-rgb),0.15)' }} />
            ) : (
              <span onDoubleClick={() => { setEditingItemId(item.id); setEditIName(item.title) }}
                className="text-[13px] font-medium truncate" style={{ color: muted ? S.t3 : S.t1 }} title="더블클릭해서 이름 변경">
                {item.title}
              </span>
            )}
            {linked.length > 0 && <span className="text-[10.5px] flex-shrink-0" style={{ color: S.t4 }}>프로젝트 {linked.length}</span>}
          </div>
          <div style={{ width: COL.priority }} className="flex-shrink-0">
            <GlassSelect value={plan?.priority ?? ''} onChange={v => { if (v) setPriority(item, v as YearPlanPriority) }}
              options={YEAR_PLAN_OPTIONS} placeholder="미설정" variant="inline" />
          </div>
          <div style={{ width: COL.action }} className="flex-shrink-0 flex items-center justify-end gap-1.5">
            {plan && canCreateProject(plan.priority) && (
              <button onClick={() => setCreateFor({ plan, item })}
                className="text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap transition-colors"
                style={{ color: S.t2, background: 'rgba(var(--ink-rgb),0.05)' }}>
                ＋ 프로젝트
              </button>
            )}
            <button onClick={() => deleteItem(item)} title="목표 삭제"
              className="opacity-0 group-hover/yp:opacity-100 text-[11px] px-1 transition-opacity" style={{ color: S.t3 }}>✕</button>
          </div>
        </div>
        {linked.length > 0 && (
          <div className="flex flex-col gap-0.5 pb-2" style={{ paddingLeft: 28, paddingRight: 16 }}>
            {linked.map(pr => (
              <button key={pr.id} onClick={() => router.push(`/project/items/${pr.id}`)}
                className="flex items-center gap-2 text-left text-[11.5px] py-0.5 rounded hover:underline" style={{ color: S.t2 }}>
                <span style={{ color: S.t4 }}>└</span>
                <span className="truncate">{pr.title}</span>
                <span className="flex-shrink-0 text-[10.5px]" style={{ color: S.t3 }}>
                  {PROJECT_STATUS_LABEL[pr.status] ?? pr.status}{pr.total > 0 && ` · ${pr.done}/${pr.total}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-10">
      {/* 연도 요약 — 이 연도에 목표별로 매긴 우선순위 분포 */}
      <div className="flex items-center gap-3 flex-wrap mb-3 text-[11.5px]" style={{ color: S.t3 }}>
        {summary.map(({ p, n }) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: YEAR_PLAN_COLOR[p] }} />
            {YEAR_PLAN_LABEL[p]} <b style={{ color: S.t2, fontWeight: 600 }}>{n}</b>
          </span>
        ))}
        <span>미설정 <b style={{ color: S.t2, fontWeight: 600 }}>{unsetCount}</b></span>
      </div>

      {loadError && <p className="text-[12px] mb-3" style={{ color: 'var(--error-badge-text)' }}>{loadError}</p>}
      {saveError && <p className="text-[12px] mb-3" style={{ color: 'var(--error-badge-text)' }}>{saveError}</p>}

      <div className="flex flex-col gap-4">
        {cats.map(cat => {
          const catItems = items.filter(i => i.category === cat).sort((a, b) => a.sort_order - b.sort_order)
          const sc = CATEGORY_SECTION_COLOR[cat] ?? { bg: '#E5E7EB', text: '#374151' }
          return (
            <div key={cat} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(var(--ink-rgb),0.03)', border: '0.5px solid rgba(var(--ink-rgb),0.09)' }}>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {editingCatKey === cat ? (
                    <input autoFocus value={editCatVal} onChange={e => setEditCatVal(e.target.value)} onBlur={commitEditCat}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitEditCat(); if (e.key === 'Escape') setEditingCatKey(null) }}
                      className="text-[12.5px] font-bold outline-none rounded-md px-2 py-0.5" style={{ background: sc.bg, color: sc.text }} />
                  ) : (
                    <span onDoubleClick={() => { setEditingCatKey(cat); setEditCatVal(catLabel(cat, categoryLabels)) }}
                      className="text-[12.5px] font-bold rounded-md px-2 py-0.5" style={{ background: sc.bg, color: sc.text }} title="더블클릭해서 영역 이름 변경">
                      {catLabel(cat, categoryLabels)}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: S.t4 }}>목표 {catItems.length}</span>
                </div>
                <span style={{ width: COL.priority }} className="flex-shrink-0 text-[10.5px] font-semibold" >
                  <span style={{ color: S.t3 }}>{year} 우선순위</span>
                </span>
                <span style={{ width: COL.action }} className="flex-shrink-0" />
              </div>

              {catItems.map(renderRow)}

              <div style={{ borderTop: S.bd }} className="px-4 py-2">
                {addingCat === cat ? (
                  <input autoFocus value={newIName} onChange={e => setNewIName(e.target.value)}
                    onBlur={() => addItem(cat)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(cat); if (e.key === 'Escape') { setAddingCat(null); setNewIName('') } }}
                    placeholder="목표 이름 (Enter)" className="w-full text-[12.5px] bg-transparent outline-none" style={{ color: S.t1 }} />
                ) : (
                  <button onClick={() => { setAddingCat(cat); setNewIName('') }} className="text-[12px]" style={{ color: S.t3 }}>＋ 목표 추가</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {createFor && (
        <CreateGoalProjectModal
          supabase={supabase}
          yearPlanId={createFor.plan.id}
          sourceLabel={yearPlanSourceLabel(createFor.plan, createFor.item, categoryLabels)}
          onClose={() => setCreateFor(null)}
          onCreated={pr => {
            setProjects(p => [...p, { id: pr.id, title: pr.title, status: pr.status, annual_goal_year_plan_id: pr.annual_goal_year_plan_id ?? createFor.plan.id, done: 0, total: 0 }])
            setCreateFor(null)
          }}
        />
      )}
    </div>
  )
}
