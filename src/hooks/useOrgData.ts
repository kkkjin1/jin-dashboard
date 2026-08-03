'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface OrgPart { id: string; name: string }
export interface OrgTeam { id: string; name: string; parts: OrgPart[] }
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
      : team.parts.map(p => ({ id: p.id, label: p.name, teamId: team.id, teamLabel: team.name }))
  )

  return { org, flatParts }
}
