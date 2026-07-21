'use client'

import React, { useState } from 'react'

const COLOR_CLASSES: Record<string, string> = {
  red: 'text-red-500', blue: 'text-blue-500', green: 'text-green-600',
  orange: 'text-orange-500', purple: 'text-purple-500', gray: 'text-gray-400',
}

function parseInline(text: string, keyPrefix: string = ''): React.ReactNode {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|!!.+?!!|==.+?==|~~.+?~~|{(?:red|blue|green|orange|purple|gray)}[^{]+{\/(?:red|blue|green|orange|purple|gray)})/)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={`${keyPrefix}b${i}`}>{part.slice(2, -2)}</strong>
        if (part.startsWith('__') && part.endsWith('__') && part.length > 4)
          return <u key={`${keyPrefix}u${i}`}>{part.slice(2, -2)}</u>
        if (part.startsWith('!!') && part.endsWith('!!') && part.length > 4)
          return <span key={`${keyPrefix}r${i}`} style={{ color: '#F87171' }}>{part.slice(2, -2)}</span>
        if (part.startsWith('==') && part.endsWith('==') && part.length > 4)
          return <mark key={`${keyPrefix}h${i}`} style={{ background: 'rgba(250,204,21,0.35)', color: 'inherit', borderRadius: '2px', padding: '0 2px' }}>{part.slice(2, -2)}</mark>
        if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4)
          return <del key={`${keyPrefix}s${i}`}>{part.slice(2, -2)}</del>
        const colorMatch = part.match(/^\{(red|blue|green|orange|purple|gray)\}(.+)\{\/\1\}$/)
        if (colorMatch)
          return <span key={`${keyPrefix}c${i}`} className={COLOR_CLASSES[colorMatch[1]]}>{colorMatch[2]}</span>
        return part || null
      })}
    </>
  )
}

const INDENT_SIZE = 5

// HTML 콘텐츠에서 ■ □ 등으로 시작하는 <p>에 hanging-indent 적용
const BULLET_CHARS = '■□●▪▫○•◆◇'
function preprocessBulletHtml(html: string): string {
  const re = new RegExp(
    `<p([^>]*)>([${BULLET_CHARS}])\\s?((?:(?!</p>)[\\s\\S])*)</p>`,
    'g'
  )
  return html.replace(re, (_, attrs, bullet, body) =>
    `<p${attrs} class="note-bullet-p"><span class="note-bullet-sym">${bullet}</span><span class="note-bullet-body">${body}</span></p>`
  )
}

function isListLine(line: string): boolean {
  return !!(
    line.match(/^( *)\d+\. /) ||
    line.match(/^( *)[가나다라마바사아자차카타파하]\. /) ||
    line.match(/^( *)\d+\) /) ||
    line.match(/^( *)[▪●■] /) ||
    line.match(/^( *)[▫○□] /)
  )
}

const LIGHT = {
  h1: 'text-xl font-bold text-gray-900 mt-3 mb-1',
  h2: 'text-lg font-semibold text-gray-800 mt-2 mb-1',
  h3: 'text-base font-semibold text-gray-700 mt-1.5 mb-0.5',
  body: 'text-sm text-gray-700 leading-relaxed',
  sub: 'text-sm text-gray-600 leading-relaxed',
  marker: 'text-gray-400',
  markerBullet: 'text-gray-700',
  markerSub: 'text-gray-500',
}
const DARK = {
  h1: 'text-xl font-bold text-[rgba(226,232,240,0.95)] mt-3 mb-1',
  h2: 'text-lg font-semibold text-[rgba(226,232,240,0.9)] mt-2 mb-1',
  h3: 'text-base font-semibold text-[rgba(226,232,240,0.85)] mt-1.5 mb-0.5',
  body: 'text-sm text-[rgba(226,232,240,0.8)] leading-relaxed',
  sub: 'text-sm text-[rgba(226,232,240,0.65)] leading-relaxed',
  marker: 'text-[rgba(226,232,240,0.4)]',
  markerBullet: 'text-[rgba(226,232,240,0.7)]',
  markerSub: 'text-[rgba(226,232,240,0.45)]',
}

function renderLine(line: string, keyVal: string | number, dark?: boolean): React.ReactNode {
  const k = keyVal
  const c = dark ? DARK : LIGHT

  if (line.startsWith('# ')) return <p key={k} className={c.h1}>{parseInline(line.slice(2), `${k}`)}</p>
  if (line.startsWith('## ')) return <p key={k} className={c.h2}>{parseInline(line.slice(3), `${k}`)}</p>
  if (line.startsWith('### ')) return <p key={k} className={c.h3}>{parseInline(line.slice(4), `${k}`)}</p>

  // \s* → 마커 뒤 공백 0개 이상 허용 ("1.항목", "1. 항목" 모두 인식)
  const numMatch = line.match(/^( *)(\d+)\.\s*(.*)$/)
  if (numMatch) {
    const lvl = Math.floor(numMatch[1].length / INDENT_SIZE)
    return (
      <div key={k} className={`flex gap-1.5 ${c.body}`} style={{ paddingLeft: `${lvl * 20}px` }}>
        <span className={`${c.marker} flex-shrink-0 min-w-[1.25rem] text-right`}>{numMatch[2]}.</span>
        <span className="flex-1 min-w-0">{parseInline(numMatch[3] ?? '', `${k}`)}</span>
      </div>
    )
  }

  const korMatch = line.match(/^( *)([가나다라마바사아자차카타파하])\.\s*(.*)$/)
  if (korMatch) {
    const lvl = Math.floor(korMatch[1].length / INDENT_SIZE)
    return (
      <div key={k} className={`flex gap-1.5 ${c.body}`} style={{ paddingLeft: `${lvl * 20}px` }}>
        <span className={`${c.marker} flex-shrink-0`}>{korMatch[2]}.</span>
        <span className="flex-1 min-w-0">{parseInline(korMatch[3] ?? '', `${k}`)}</span>
      </div>
    )
  }

  const parenMatch = line.match(/^( *)(\d+)\)\s*(.*)$/)
  if (parenMatch) {
    const lvl = Math.floor(parenMatch[1].length / INDENT_SIZE)
    return (
      <div key={k} className={`flex gap-1.5 ${c.body}`} style={{ paddingLeft: `${lvl * 20}px` }}>
        <span className={`${c.marker} flex-shrink-0`}>{parenMatch[2]})</span>
        <span className="flex-1 min-w-0">{parseInline(parenMatch[3] ?? '', `${k}`)}</span>
      </div>
    )
  }

  const bulletMatch = line.match(/^( *)[▪●■] (.*)$/)
  if (bulletMatch) {
    const lvl = Math.floor(bulletMatch[1].length / INDENT_SIZE)
    const sym = bulletMatch[0].trim()[0]
    return (
      <div key={k} className={`flex gap-1.5 ${c.body}`} style={{ paddingLeft: `${lvl * 20}px` }}>
        <span className={`${c.markerBullet} flex-shrink-0 leading-relaxed`}>{sym}</span>
        <span className="flex-1 min-w-0">{parseInline(bulletMatch[2], `${k}`)}</span>
      </div>
    )
  }

  const subBulletMatch = line.match(/^( *)[▫○□] (.*)$/)
  if (subBulletMatch) {
    const lvl = Math.floor(subBulletMatch[1].length / INDENT_SIZE)
    const sym = subBulletMatch[0].trim()[0]
    return (
      <div key={k} className={`flex gap-1.5 ${c.sub}`} style={{ paddingLeft: `${(lvl + 1) * 20}px` }}>
        <span className={`${c.markerSub} flex-shrink-0 leading-relaxed`}>{sym}</span>
        <span className="flex-1 min-w-0">{parseInline(subBulletMatch[2], `${k}`)}</span>
      </div>
    )
  }

  return <p key={k} className={c.body}>{parseInline(line, `${k}`)}</p>
}

function ToggleBlock({ title, lines, blockKey, dark }: { title: string; lines: string[]; blockKey: string; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const toggleText = dark ? 'text-[rgba(226,232,240,0.6)] hover:text-[rgba(226,232,240,0.9)]' : 'text-gray-600 hover:text-gray-900'
  const arrowColor = dark ? 'text-[rgba(226,232,240,0.35)]' : 'text-gray-400'
  const borderColor = dark ? 'border-[rgba(255,255,255,0.08)]' : 'border-gray-100'
  return (
    <div className="my-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-sm ${toggleText} transition-colors w-full text-left select-none`}
      >
        <span
          className={`text-[10px] ${arrowColor} transition-transform duration-150 inline-block`}
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >▶</span>
        <span className="font-medium">{parseInline(title, blockKey)}</span>
      </button>
      {open && (
        <div className={`pl-4 mt-1 border-l-2 ${borderColor}`}>
          {lines.map((line, i) => renderLine(line, `${blockKey}-${i}`, dark))}
        </div>
      )}
    </div>
  )
}

export default function MarkdownContent({ content, className, dark }: { content: string; className?: string; dark?: boolean }) {
  // Tiptap HTML: bullet 문자로 시작하는 <p>에 hanging indent 전처리 후 렌더링
  if (content.trimStart().startsWith('<')) {
    const processed = preprocessBulletHtml(content)
    return <div className={`note-html ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: processed }} />
  }
  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Toggle block: "> 제목" 으로 시작, 다음 빈 줄까지 콘텐츠 수집
    if (line.startsWith('> ')) {
      const title = line.slice(2)
      const contentLines: string[] = []
      i++
      while (i < lines.length && lines[i] !== '') {
        contentLines.push(lines[i])
        i++
      }
      nodes.push(
        <ToggleBlock key={`toggle-${i}`} title={title} lines={contentLines} blockKey={`toggle-${i}`} dark={dark} />
      )
      continue
    }

    // 빈 줄: 리스트 인접 시 문단 구분 간격, 아니면 기본 간격
    if (line === '') {
      const prevLine = i > 0 ? lines[i - 1] : ''
      const nextLine = i < lines.length - 1 ? lines[i + 1] : ''
      const listAdjacent = isListLine(prevLine) || isListLine(nextLine)
      nodes.push(<div key={i} className={listAdjacent ? 'h-4' : 'h-2'} />)
      i++
      continue
    }

    nodes.push(renderLine(line, i, dark))
    i++
  }

  return <div className={className}>{nodes}</div>
}
