// data.go.kr API — 법제처 입법예고 + 고용노동부 보도자료
// 환경변수: DATAGO_API_KEY (https://www.data.go.kr → 마이페이지 → 인증키)
import type { NextRequest } from 'next/server'

export interface DatagoItem {
  title: string
  link: string
  description: string
  pubDate: string
  source: string
}

// 노동·고용 관련 키워드 (비관련 입법예고 필터)
const LABOR_KEYWORDS = ['근로', '노동', '임금', '고용', '산재', '직업', '퇴직', '취업', '실업']

function isLaborRelated(title: string): boolean {
  return LABOR_KEYWORDS.some(kw => title.includes(kw))
}

async function fetchLegislation(key: string): Promise<DatagoItem[]> {
  const url = `https://apis.data.go.kr/1170000/motLaLegPrInfoInqireService/getLaLegPrList` +
    `?serviceKey=${encodeURIComponent(key)}&numOfRows=30&pageNo=1&type=json`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'HR-Dashboard/1.0' },
    next: { revalidate: 3600 },
  })
  const data = await res.json()

  const raw: Record<string, string>[] = (() => {
    const items = data?.response?.body?.items?.item
    if (!items) return []
    return Array.isArray(items) ? items : [items]
  })()

  return raw
    .filter(item => isLaborRelated(item.lsNm ?? ''))
    .map(item => ({
      title: item.lsNm ?? '',
      link: `https://www.law.go.kr/lsEgStListR.do?menuId=6`,
      description: `입법예고 기간: ${item.egPbLnmDt ?? ''} ~ ${item.egPbLnmEndDt ?? ''}`,
      pubDate: item.egPbLnmDt ?? '',
      source: '법제처 입법예고',
    }))
    .slice(0, 20)
}

async function fetchMoelPress(key: string): Promise<DatagoItem[]> {
  // 고용노동부_보도자료 open API
  const url = `https://apis.data.go.kr/B552735/moelLaborNewsList/moelLaborNewsList` +
    `?serviceKey=${encodeURIComponent(key)}&numOfRows=20&pageNo=1&type=json`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'HR-Dashboard/1.0' },
    next: { revalidate: 3600 },
  })

  if (!res.ok) return []
  const data = await res.json()

  const raw: Record<string, string>[] = (() => {
    const items = data?.response?.body?.items?.item
    if (!items) return []
    return Array.isArray(items) ? items : [items]
  })()

  return raw.map(item => ({
    title: item.ttl ?? item.title ?? '',
    link: item.url ?? 'https://www.moel.go.kr/news/enews/report/enewsList.do',
    description: item.cn ?? item.description ?? '',
    pubDate: item.pblcDt ?? item.creatDt ?? '',
    source: '고용노동부',
  })).slice(0, 20)
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') ?? 'legislation'
  const key = process.env.DATAGO_API_KEY

  if (!key) {
    return Response.json({ status: 'key_required', keyName: 'DATAGO_API_KEY' })
  }

  try {
    const items = type === 'moel'
      ? await fetchMoelPress(key)
      : await fetchLegislation(key)

    return Response.json({ status: 'ok', items })
  } catch (e) {
    return Response.json({ status: 'error', error: String(e), items: [] })
  }
}
