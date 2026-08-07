import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isTeamLogRequestAuthorized } from '@/lib/team-log-auth'

const STATUSES = ['active', 'hold', 'done'] as const

export async function POST(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const groupId = typeof body?.group_id === 'string' ? body.group_id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!groupId || !title) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('team_log_items')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
  const { data, error } = await supabase
    .from('team_log_items')
    .insert({ group_id: groupId, title, sort_order: count ?? 0 })
    .select('id, group_id, title, status, sort_order')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: { ...data, subtasks: [] } })
}

export async function PATCH(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const status = body?.status
  if (!id || !STATUSES.includes(status)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_items')
    .update({ status })
    .eq('id', id)
    .select('id, group_id, title, status, sort_order')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}
