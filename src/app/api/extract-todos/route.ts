import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { journalContent } = await req.json()

  if (!journalContent?.trim()) {
    return NextResponse.json({ error: '회고 내용이 없습니다.' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // 키 없으면 "내일 focus" 섹션만 간단히 파싱
    const lines: string[] = journalContent.split('\n')
    const focusIdx = lines.findIndex((l: string) => l.includes('내일') || l.includes('focus') || l.includes('Focus'))
    const raw = focusIdx >= 0 ? lines.slice(focusIdx + 1).filter((l: string) => l.trim()) : []
    const items = raw.map((l: string) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 5)
    return NextResponse.json({ items: items.length ? items : ['회고에서 내일 계획을 찾지 못했습니다.'], fallback: true })
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `아래 업무 회고에서 내일 해야 할 구체적인 액션 아이템만 추출하세요.
각 항목은 "- 동사 + 목적어" 형태의 한 줄로, 최대 5개, JSON 배열로만 응답:

${journalContent.trim()}

응답 형식 (다른 설명 없이 JSON만):
["항목1", "항목2", ...]`,
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    const items: string[] = match ? JSON.parse(match[0]) : []
    return NextResponse.json({ items: items.slice(0, 5) })
  } catch (err) {
    console.error('extract-todos error:', err)
    return NextResponse.json({ error: '추출 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
