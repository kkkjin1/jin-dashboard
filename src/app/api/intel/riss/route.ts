// RISS 학술논문 검색 API (data.go.kr)
// 환경변수: RISS_API_KEY
// 발급: data.go.kr → "RISS 학술논문" 검색 → 활용신청
import type { NextRequest } from 'next/server'
import type { RssItem } from '@/app/api/intel/rss/route'

interface RissRawItem {
  article_title?: string
  author?: string
  publisher?: string
  year?: string
  cnt_download?: string
  cnt_citation?: string
  url?: string
  abstract?: string
}

export async function GET(request: NextRequest) {
  const key = process.env.RISS_API_KEY

  if (!key) {
    return Response.json({ status: 'key_required', keyName: 'RISS_API_KEY' })
  }

  const q = request.nextUrl.searchParams.get('q') ?? '성과평가'

  try {
    const url = new URL('https://apis.data.go.kr/B551582/srchTotalPageKer/getSrchTotalPageKerList')
    url.searchParams.set('serviceKey', key)
    url.searchParams.set('query', q)
    url.searchParams.set('display', '15')
    url.searchParams.set('start', '1')
    url.searchParams.set('sort', 'DOWNLOAD_CNT')  // 다운로드 수 기준 정렬
    url.searchParams.set('type', 'json')

    const res = await fetch(url.toString(), { next: { revalidate: 86400 } }) // 24시간 캐시
    if (!res.ok) return Response.json({ status: 'error', items: [] })

    const data = await res.json()
    const raw: RissRawItem[] = data?.response?.body?.items?.item ?? []
    const list = Array.isArray(raw) ? raw : [raw]

    const items: RssItem[] = list
      .filter(r => r.article_title)
      .map(r => ({
        title: r.article_title ?? '',
        link: r.url ?? 'https://www.riss.kr',
        description: [
          r.author,
          r.publisher,
          r.year,
          r.cnt_download ? `다운로드 ${Number(r.cnt_download).toLocaleString()}회` : '',
          r.cnt_citation ? `인용 ${r.cnt_citation}회` : '',
        ].filter(Boolean).join(' · '),
        pubDate: r.year ?? '',
        source: 'RISS',
      }))

    return Response.json({ status: 'ok', items })
  } catch (e) {
    return Response.json({ status: 'error', error: String(e), items: [] })
  }
}
