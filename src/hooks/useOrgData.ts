'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface OrgPart { id: string; name: string }
// active: 조직개편으로 맡지 않게 된 팀은 false(off). 값이 없으면 on으로 취급(기존 데이터 호환)
export interface OrgTeam { id: string; name: string; parts: OrgPart[]; active?: boolean }

export function isTeamActive(team: OrgTeam) { return team.active !== false }

// off 팀 소속 인원을 걸러낸다. members.part는 팀 id(파트 없는 팀) 또는 파트 id.
// 파트 id가 여러 팀에서 겹칠 수 있으므로, on 팀에도 속하는 id는 숨기지 않는다.
// 어느 팀에도 매핑되지 않은 미배정 인원은 그대로 둔다.
export function filterActiveMembers<M extends { part?: string | null }>(members: M[], org: OrgTeam[]): M[] {
  const idsOf = (t: OrgTeam) => [t.id, ...t.parts.map(p => p.id)]
  const activeIds = new Set(org.filter(isTeamActive).flatMap(idsOf))
  const offIds = new Set(org.filter(t => !isTeamActive(t)).flatMap(idsOf).filter(id => !activeIds.has(id)))
  return members.filter(m => !m.part || !offIds.has(m.part))
}
// 필터에서 선택 가능한 팀/파트 단위
export interface FlatPart { id: string; label: string; teamId: string; teamLabel: string }

export function useOrgData() {
  const [org, setOrg] = useState<OrgTeam[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('user_preferences')
      .select('value')
      .eq('key', 'org')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          setOrg(data.value as OrgTeam[])
        } else {
          const stored = localStorage.getItem('dashboard_org')
          if (stored) try { setOrg(JSON.parse(stored) as OrgTeam[]) } catch {}
        }
      })
  }, [])

  // 팀에 파트가 없으면 팀 자체를 선택 단위로, 있으면 각 파트를 단위로
  const flatParts: FlatPart[] = org.flatMap(team =>
    team.parts.length === 0
      ? [{ id: team.id, label: team.name, teamId: team.id, teamLabel: team.name }]
      : team.parts.map(p => ({ id: p.id, label: `${team.name}_${p.name}`, teamId: team.id, teamLabel: team.name }))
  )

  return { org, flatParts }
}
