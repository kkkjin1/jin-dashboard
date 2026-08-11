import { NextResponse } from 'next/server'

// 새 패키지 의존성 없이 fetch만으로 구현 (googleapis 등 무거운 SDK 불필요)

interface TokenCache { accessToken: string; expiresAt: number }
let cache: TokenCache | null = null

async function getAccessToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 30_000) return cache.accessToken

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('missing_credentials')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`token_refresh_failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  cache = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

function todayInSeoul(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

export interface GoogleCalendarEvent {
  id: string
  title: string
  start_hour: number
  duration_hours: number
  allDay: boolean
  htmlLink?: string
}

const H_START = 9, H_END = 21

export async function GET() {
  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    // 아직 연동 전이면 조용히 빈 목록 반환 (홈 화면이 깨지지 않도록)
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ events: [], connected: false, error: msg })
  }

  const dateStr = todayInSeoul()
  const timeMin = `${dateStr}T00:00:00+09:00`
  const timeMax = `${dateStr}T23:59:59+09:00`
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!res.ok) {
    return NextResponse.json({ events: [], connected: true, error: await res.text() }, { status: 502 })
  }
  const data = await res.json() as { items?: Array<{
    id: string
    summary?: string
    htmlLink?: string
    start?: { dateTime?: string; date?: string }
    end?: { dateTime?: string; date?: string }
  }> }

  const events: GoogleCalendarEvent[] = (data.items ?? [])
    .filter(item => item.summary && item.start)
    .map(item => {
      const allDay = !item.start?.dateTime
      if (allDay) {
        return { id: item.id, title: item.summary!, start_hour: H_START, duration_hours: 0.5, allDay: true, htmlLink: item.htmlLink }
      }
      const startHour = hourOf(item.start!.dateTime!)
      const endHour = item.end?.dateTime ? hourOf(item.end.dateTime) : startHour + 1
      const clampedStart = Math.max(H_START, Math.min(H_END - 0.25, startHour))
      const duration = Math.max(0.25, Math.min(H_END - clampedStart, endHour - startHour))
      return { id: item.id, title: item.summary!, start_hour: clampedStart, duration_hours: duration, allDay: false, htmlLink: item.htmlLink }
    })

  return NextResponse.json({ events, connected: true })
}

// "2026-08-11T14:30:00+09:00" 형태 문자열에서 서버 타임존과 무관하게 시:분만 추출
function hourOf(dateTime: string): number {
  const match = dateTime.match(/T(\d{2}):(\d{2}):\d{2}/)
  if (!match) return H_START
  return Number(match[1]) + Number(match[2]) / 60
}
