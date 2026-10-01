'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { YearPlanPriority } from '@/types'
import { GlassSelect } from '@/components/ui/GlassSelect'
import { YEAR_PLAN_COLOR, yearPlanSourceLabel } from '@/lib/yearPlan'

// 프로젝트 상세 — 출처(v59 agenda_items.annual_goal_year_plan_id) 표시/변경.
// 값 있음 = 목표 연계 실무, 없음 = 일반 실무. 후보는 "제외"가 아닌 연도계획(최근 연도 우선).
// 제목보다 약하게 보이도록 inline GlassSelect로만 노출한다.
const GENERAL = '__general__'

type PlanRow = { id: string; year: number; priority: YearPlanPriority; item: { category: string; title: string } | null }

interface Props {
  projectId: string
  yearPlanId: string | null
  onChanged: (yearPlanId: string | null) => void
  onError: (msg: string) => void
}

export default function ProjectSourceSelect({ projectId, yearPlanId, onChanged, onError }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('annual_goal_year_plans').select('id, year, priority, annual_goal_items(category, title, sort_order)').order('year', { ascending: false }),
      supabase.from('annual_goal_category_labels').select('category_key, name'),
    ]).then(([{ data: pData }, { data: lData }]) => {
      if (cancelled) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: (PlanRow & { sort: string })[] = (pData ?? []).map((r: any) => {
        const it = Array.isArray(r.annual_goal_items) ? r.annual_goal_items[0] : r.annual_goal_items
        return { id: r.id, year: r.year, priority: r.priority, item: it ? { category: it.category, title: it.title } : null, sort: `${it?.category ?? ''}|${String(it?.sort_order ?? 0).padStart(5, '0')}` }
      })
      rows.sort((a, b) => b.year - a.year || a.sort.localeCompare(b.sort))
      setPlans(rows)
      setLabels(Object.fromEntries((lData ?? []).map((r: { category_key: string; name: string }) => [r.category_key, r.name])))
    })
    return () => { cancelled = true }
  }, [supabase])

  const options = useMemo(() => [
    { value: GENERAL, label: '일반 실무' },
    ...plans
      .filter(p => p.priority !== 'excluded' || p.id === yearPlanId)
      .map(p => ({ value: p.id, label: yearPlanSourceLabel(p, p.item, labels), color: YEAR_PLAN_COLOR[p.priority] })),
  ], [plans, labels, yearPlanId])

  async function change(v: string) {
    const next = v === GENERAL ? null : v
    if (next === yearPlanId) return
    const { error } = await supabase.from('agenda_items').update({ annual_goal_year_plan_id: next }).eq('id', projectId)
    if (error) { onError(`출처 변경 실패: ${error.message}`); return }
    onChanged(next)
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0 text-[11.5px]" style={{ color: 'rgba(var(--text-rgb),0.4)' }}>
      <span className="flex-shrink-0">출처</span>
      <div className="min-w-0" style={{ maxWidth: 360 }}>
        <GlassSelect value={yearPlanId ?? GENERAL} onChange={change} options={options} placeholder="일반 실무" variant="inline" />
      </div>
    </div>
  )
}
