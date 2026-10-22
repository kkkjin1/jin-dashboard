import { getSchema } from '@tiptap/core'
import { DOMParser as PMDOMParser, type Schema } from '@tiptap/pm/model'
import Image from '@tiptap/extension-image'
import { BASE_TIPTAP_EXTENSIONS } from '@/lib/tiptapExtensions'

// ── Clipboard: ProseMirror document → Markdown (GFM) ─────────────────────────

// cont: 줄 안 줄바꿈(Shift+Enter, hardBreak) 다음 줄 앞에 붙일 들여쓰기 — 목록 항목 안이면 그 항목
// 글자 위치에 맞춰야 다음 줄이 목록 밖으로 새지 않는다. 예전에는 hardBreak를 건너뛰어 두 줄이 붙었다.
function inlineToMd(node: any, cont = ''): string {
  let out = ''
  node.forEach((leaf: any) => {
    if (leaf.type.name === 'hardBreak') { out += '\n' + cont; return }
    if (leaf.type.name !== 'text') return
    let t: string = leaf.text ?? ''
    const has = (n: string) => leaf.marks.some((m: any) => m.type.name === n)
    if (has('code')) { out += `\`${t}\``; return }
    if (has('bold')) t = `**${t}**`
    if (has('italic')) t = `_${t}_`
    if (has('strike')) t = `~~${t}~~`
    out += t
  })
  return out
}

function collectMarkdown(node: any, lines: string[], depth: number): void {
  const t: string = node.type.name
  if (t === 'paragraph') {
    lines.push(inlineToMd(node))
  } else if (t === 'heading') {
    lines.push('#'.repeat(node.attrs.level as number) + ' ' + inlineToMd(node))
  } else if (t === 'orderedList') {
    let n: number = (node.attrs.start as number) ?? 1
    node.forEach((item: any) => {
      const indent = '   '.repeat(depth)
      item.forEach((child: any) => {
        if (child.type.name === 'paragraph') {
          lines.push(`${indent}${n}. ${inlineToMd(child, indent + ' '.repeat(`${n}. `.length))}`)
        } else {
          collectMarkdown(child, lines, depth + 1)
        }
      })
      n++
    })
  } else if (t === 'bulletList') {
    node.forEach((item: any) => {
      const indent = '   '.repeat(depth)
      item.forEach((child: any) => {
        if (child.type.name === 'paragraph') {
          lines.push(`${indent}- ${inlineToMd(child, indent + '  ')}`)
        } else {
          collectMarkdown(child, lines, depth + 1)
        }
      })
    })
  } else if (t === 'listItem') {
    // top-level listItem (edge case: partial selection starting inside list)
    node.forEach((child: any) => {
      if (child.type.name === 'paragraph') {
        lines.push('   '.repeat(depth) + '- ' + inlineToMd(child, '   '.repeat(depth) + '  '))
      } else {
        collectMarkdown(child, lines, depth + 1)
      }
    })
  } else if (t === 'blockquote') {
    const inner: string[] = []
    node.forEach((child: any) => collectMarkdown(child, inner, 0))
    inner.forEach(l => l.split('\n').forEach(part => lines.push(`> ${part}`)))
  } else if (t === 'details') {
    // 토글 → 제목은 "- 제목", 내용은 한 단계 들여쓴 하위 항목으로
    node.forEach((child: any) => {
      if (child.type.name === 'detailsSummary') {
        lines.push('   '.repeat(depth) + '- ' + inlineToMd(child, '   '.repeat(depth) + '  '))
      } else {
        child.forEach((c: any) => {
          if (c.type.name === 'paragraph') lines.push('   '.repeat(depth + 1) + inlineToMd(c, '   '.repeat(depth + 1)))
          else collectMarkdown(c, lines, depth + 1)
        })
      }
    })
  } else if (t === 'codeBlock') {
    const lang: string = (node.attrs.language as string) ?? ''
    lines.push('```' + lang)
    node.forEach((c: any) => { if (c.type.name === 'text') lines.push(c.text ?? '') })
    lines.push('```')
  }
}

export function pmDocToMarkdown(doc: any): string {
  const lines: string[] = []
  doc.forEach((node: any) => collectMarkdown(node, lines, 0))
  return lines.join('\n').trim()
}

// ── 저장된 HTML 문자열 → Markdown ────────────────────────────────────────────
// 에디터 밖(업무보고 "마크다운 복사" 등)에서 저장된 값을 마크다운으로 내보낼 때 — 복사 시
// text/plain과 같은 변환기를 쓰도록 HTML을 같은 스키마의 ProseMirror 문서로 읽어 넘긴다.
// 순수 텍스트(구버전 값)는 그대로 돌려준다. 브라우저 DOMParser가 필요해 클라이언트에서만 호출.
let schemaCache: Schema | null = null

export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return ''
  if (!html.trimStart().startsWith('<')) return html.trim()
  schemaCache ??= getSchema([...BASE_TIPTAP_EXTENSIONS, Image])
  const dom = new window.DOMParser().parseFromString(html, 'text/html')
  return pmDocToMarkdown(PMDOMParser.fromSchema(schemaCache).parse(dom.body))
}
