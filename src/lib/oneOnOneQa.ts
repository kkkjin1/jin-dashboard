// 1on1 기록 HTML → 질문/답변 텍스트 (LLM 붙여넣기용)
// 질문 = data-qa="q"가 붙은 줄. 표시 없는 줄은 바로 위 질문의 답변(첫 질문 전 줄은 머리말).

export type QaCopyMode = 'q' | 'qa' | 'a'

interface QaLine { text: string; depth: number; isQ: boolean }
interface QaGroup { q: QaLine | null; answers: QaLine[] }

function htmlToLines(content: string): QaLine[] {
  if (!content.trimStart().startsWith('<')) {
    // 구 마크다운/평문 기록 — 질문 표시가 없으므로 전부 답변 줄
    return content.split('\n').map(t => t.trim()).filter(Boolean).map(text => ({ text, depth: 0, isQ: false }))
  }
  const doc = new DOMParser().parseFromString(content, 'text/html')
  const lines: QaLine[] = []
  doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, summary').forEach(el => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return
    let depth = 0
    for (let a = el.parentElement; a && a !== doc.body; a = a.parentElement) {
      if (a.tagName === 'LI' || a.tagName === 'DETAILS') depth++
    }
    lines.push({ text, depth, isQ: el.getAttribute('data-qa') === 'q' })
  })
  return lines
}

function group(lines: QaLine[]): QaGroup[] {
  const groups: QaGroup[] = [{ q: null, answers: [] }]
  for (const l of lines) {
    if (l.isQ) groups.push({ q: l, answers: [] })
    else groups[groups.length - 1].answers.push(l)
  }
  return groups.filter(g => g.q || g.answers.length > 0)
}

// 질문 앞에 직접 붙여 쓴 번호(1) 1. 가. Q1.)는 떼고 복사 시 새 번호로 매긴다 — "1. 1) …" 중복 방지
function stripNumbering(text: string): string {
  return text.replace(/^(?:Q\s*\d*\s*[.:)]?|\d+\s*[.)]|[가-하]\s*[.)])\s*/i, '').trim() || text
}

function answerLines(answers: QaLine[]): string[] {
  if (answers.length === 0) return []
  const base = Math.min(...answers.map(a => a.depth))
  return answers.map(a => `${'  '.repeat(a.depth - base)}- ${a.text}`)
}

export function countQuestions(content: string): number {
  return htmlToLines(content).filter(l => l.isQ).length
}

export function buildQaText(content: string, mode: QaCopyMode, header?: string): string {
  const groups = group(htmlToLines(content))
  const out: string[] = []
  if (header) out.push(header, '')
  let n = 0
  for (const g of groups) {
    if (g.q) n++
    if (mode === 'q') {
      if (g.q) out.push(`${n}. ${stripNumbering(g.q.text)}`)
      continue
    }
    if (mode === 'qa') {
      if (g.q) out.push(`Q${n}. ${stripNumbering(g.q.text)}`)
      if (g.answers.length) out.push(...(g.q ? [`A${n}.`] : []), ...answerLines(g.answers))
      out.push('')
      continue
    }
    // mode === 'a'
    if (g.answers.length === 0) continue
    if (g.q) out.push(`A${n}.`)
    out.push(...answerLines(g.answers), '')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
