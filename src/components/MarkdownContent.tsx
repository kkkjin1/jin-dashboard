'use client'

import React from 'react'

const COLOR_CLASSES: Record<string, string> = {
  red: 'text-red-500', blue: 'text-blue-500', green: 'text-green-600',
  orange: 'text-orange-500', purple: 'text-purple-500', gray: 'text-gray-400',
}

function parseInline(text: string, keyPrefix: string = ''): React.ReactNode {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|{(?:red|blue|green|orange|purple|gray)}[^{]+{\/(?:red|blue|green|orange|purple|gray)})/)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={`${keyPrefix}b${i}`}>{part.slice(2, -2)}</strong>
        if (part.startsWith('__') && part.endsWith('__') && part.length > 4)
          return <u key={`${keyPrefix}u${i}`}>{part.slice(2, -2)}</u>
        const colorMatch = part.match(/^\{(red|blue|green|orange|purple|gray)\}(.+)\{\/\1\}$/)
        if (colorMatch)
          return <span key={`${keyPrefix}c${i}`} className={COLOR_CLASSES[colorMatch[1]]}>{colorMatch[2]}</span>
        return part || null
      })}
    </>
  )
}

const INDENT_SIZE = 5

export default function MarkdownContent({ content, className }: { content: string; className?: string }) {
  const lines = content.split('\n')
  return (
    <div className={className}>
      {lines.map((line, i) => {
        // Headings
        if (line.startsWith('# ')) return <p key={i} className="text-xl font-bold text-gray-900 mt-3 mb-1">{parseInline(line.slice(2), `${i}`)}</p>
        if (line.startsWith('## ')) return <p key={i} className="text-lg font-semibold text-gray-800 mt-2 mb-1">{parseInline(line.slice(3), `${i}`)}</p>
        if (line.startsWith('### ')) return <p key={i} className="text-base font-semibold text-gray-700 mt-1.5 mb-0.5">{parseInline(line.slice(4), `${i}`)}</p>

        // List: 1. 2. 3.
        const numMatch = line.match(/^( *)(\d+)\. (.*)$/)
        if (numMatch) {
          const lvl = Math.floor(numMatch[1].length / INDENT_SIZE)
          return (
            <div key={i} className="flex gap-1.5 text-sm text-gray-700 leading-relaxed" style={{ paddingLeft: `${lvl * 20}px` }}>
              <span className="text-gray-400 flex-shrink-0 min-w-[1.25rem] text-right">{numMatch[2]}.</span>
              <span>{parseInline(numMatch[3], `${i}`)}</span>
            </div>
          )
        }

        // List: 가. 나. 다.
        const korMatch = line.match(/^( *)([가나다라마바사아자차카타파하])\. (.*)$/)
        if (korMatch) {
          const lvl = Math.floor(korMatch[1].length / INDENT_SIZE)
          return (
            <div key={i} className="flex gap-1.5 text-sm text-gray-700 leading-relaxed" style={{ paddingLeft: `${lvl * 20}px` }}>
              <span className="text-gray-400 flex-shrink-0">{korMatch[2]}.</span>
              <span>{parseInline(korMatch[3], `${i}`)}</span>
            </div>
          )
        }

        // List: 1) 2) 3)
        const parenMatch = line.match(/^( *)(\d+)\) (.*)$/)
        if (parenMatch) {
          const lvl = Math.floor(parenMatch[1].length / INDENT_SIZE)
          return (
            <div key={i} className="flex gap-1.5 text-sm text-gray-700 leading-relaxed" style={{ paddingLeft: `${lvl * 20}px` }}>
              <span className="text-gray-400 flex-shrink-0">{parenMatch[2]})</span>
              <span>{parseInline(parenMatch[3], `${i}`)}</span>
            </div>
          )
        }

        // List: ●
        const bulletMatch = line.match(/^( *)● (.*)$/)
        if (bulletMatch) {
          const lvl = Math.floor(bulletMatch[1].length / INDENT_SIZE)
          return (
            <div key={i} className="flex gap-1.5 text-sm text-gray-700 leading-relaxed" style={{ paddingLeft: `${lvl * 20}px` }}>
              <span className="text-gray-800 flex-shrink-0 text-[10px] pt-[3px]">●</span>
              <span>{parseInline(bulletMatch[2], `${i}`)}</span>
            </div>
          )
        }

        if (line === '') return <div key={i} className="h-2" />
        return <p key={i} className="text-sm text-gray-700 leading-relaxed">{parseInline(line, `${i}`)}</p>
      })}
    </div>
  )
}
