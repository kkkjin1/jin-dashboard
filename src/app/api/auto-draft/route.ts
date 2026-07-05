import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { rawLog, date, completedTodos = [], meetings = [] } = await req.json()

  if (!rawLog?.trim()) {
    return NextResponse.json({ error: '오늘일상 내용이 없습니다.' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // API 키 없으면 원문 그대로 반환 (간단 포맷)
    const fallback = [
      rawLog.trim(),
      completedTodos.length ? `\n완료: ${completedTodos.join(', ')}` : '',
      meetings.length ? `\n회의: ${meetings.join(', ')}` : '',
    ].filter(Boolean).join('')
    return NextResponse.json({ draft: fallback, fallback: true })
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const contextLines: string[] = []
    if (completedTodos.length) contextLines.push(`완료한 할일: ${completedTodos.join(', ')}`)
    if (meetings.length) contextLines.push(`진행한 회의: ${meetings.join(', ')}`)
    const context = contextLines.length ? `\n\n[추가 컨텍스트]\n${contextLines.join('\n')}` : ''

    const prompt = `당신은 HR기획 담당자의 업무 회고 작성을 도와주는 assistant입니다.
아래 오늘 하루 일상 메모를 바탕으로 간결한 업무 회고를 작성해주세요.${context}

[오늘 일상 메모]
${rawLog.trim()}

다음 형식으로 작성하되, 빈 항목은 생략하세요. 총 250자 내외, 한국어로:

오늘 한 일
- (bullet)

잘된 점
(한 줄)

힘들었던 점 / 배운 것
(한 줄)

내일 focus
(한 줄 또는 bullet)`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const draft = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ draft })
  } catch (err) {
    console.error('auto-draft error:', err)
    return NextResponse.json({ error: '초안 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
