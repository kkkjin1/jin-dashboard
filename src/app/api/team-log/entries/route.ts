import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { TEAM_LOG_COOKIE, isValidTeamLogToken } from '@/lib/team-log-auth'

const ENTRY_TYPES = ['업무기록', '보고일정'] as const

async function checkAuth() {
  const cookieStore = await cookies()
  return isValidTeamLogToken(cookieStore.get(TEAM_LOG_COOKIE)?.value)
}

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_entries')
    .select('id, author, entry_type, entry_date, title, content, created_at')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entries: data })
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const author = typeof body?.author === 'string' ? body.author.trim().slice(0, 40) : ''
  const entryType = body?.entry_type
  const entryDate = typeof body?.entry_date === 'string' ? body.entry_date : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  if (!author || !ENTRY_TYPES.includes(entryType) || !entryDate || !title) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_entries')
    .insert({ author, entry_type: entryType, entry_date: entryDate, title, content })
    .select('id, author, entry_type, entry_date, title, content, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data })
}
