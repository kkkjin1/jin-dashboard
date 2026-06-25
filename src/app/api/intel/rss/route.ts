import type { NextRequest } from 'next/server'

export interface RssItem {
  title: string
  link: string
  description: string
  pubDate: string
  source: string
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c).trim()
}

function extractTag(block: string, tag: string): string {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i')
  const cdata = block.match(cdataRe)
  if (cdata) return cdata[1].trim()

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = block.match(re)
  if (m) return m[1].replace(/<[^>]+>/g, '').trim()

  return ''
}

function parseRSS(xml: string, sourceLabel: string): RssItem[] {
  const items: RssItem[] = []

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1]

    const title = stripCdata(extractTag(block, 'title'))
    let link = stripCdata(extractTag(block, 'link'))
    if (!link) link = stripCdata(extractTag(block, 'guid'))

    if (!title || !link) continue

    const rawDesc = stripCdata(extractTag(block, 'description'))
    const description = rawDesc.replace(/\s+/g, ' ').trim().slice(0, 200)
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date')

    items.push({ title, link, description, pubDate, source: sourceLabel })
  }

  return items.slice(0, 20)
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  const label = request.nextUrl.searchParams.get('label') ?? ''

  if (!url) {
    return Response.json({ error: 'url required' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HR-Dashboard/1.0; +https://egnis.kr)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return Response.json({ error: `upstream ${res.status}`, items: [] })
    }

    const xml = await res.text()
    const items = parseRSS(xml, label)
    return Response.json({ items })
  } catch (e) {
    return Response.json({ error: String(e), items: [] })
  }
}
