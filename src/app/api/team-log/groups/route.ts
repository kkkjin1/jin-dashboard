import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isTeamLogRequestAuthorized } from '@/lib/team-log-auth'

export async function POST(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 40) : ''
  const color = typeof body?.color === 'string' ? body.color : '#4C7FE0'
  if (!name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { count } = await supabase.from('team_log_groups').select('id', { count: 'exact', head: true })
  const { data, error } = await supabase
    .from('team_log_groups')
    .insert({ name, color, sort_order: count ?? 0 })
    .select('id, name, color, sort_order')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, group: { ...data, items: [] } })
}
