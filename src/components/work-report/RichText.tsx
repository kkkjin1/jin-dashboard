'use client'

import type { CSSProperties, Ref } from 'react'
import MarkdownContent from '@/components/MarkdownContent'
import { legacyToHtml } from '@/lib/tiptapExtensions'

// 업무보고 서술 칸 읽기 표시 — 2026-10-22부터 편집기 HTML로 저장되고, 그 전 값은 순수 텍스트다.
// 순수 텍스트도 편집기가 여는 것과 같은 변환(legacyToHtml)을 거쳐 HTML로 그려, 같은 글이
// 작성 화면과 읽기 화면에서 다르게 보이지 않게 한다. 글자 크기·색은 style로 칸마다 정한다(globals.css .wr-rich).
// maxLines를 주면 그 줄 수 높이까지만 보인다(블록 요소라 -webkit-line-clamp가 안 먹어 높이로 자른다).
export default function RichText({ value, maxLines, style, className, ref }: {
  value: string
  maxLines?: number
  style?: CSSProperties
  className?: string
  ref?: Ref<HTMLDivElement>
}) {
  const fontSize = typeof style?.fontSize === 'number' ? style.fontSize : 13
  const lineHeight = typeof style?.lineHeight === 'number' ? style.lineHeight : 1.65
  return (
    <div
      ref={ref}
      className={`wr-rich break-words ${className ?? ''}`}
      style={{
        fontSize, lineHeight, ...style,
        ...(maxLines ? { maxHeight: Math.round(maxLines * fontSize * lineHeight), overflow: 'hidden' } : null),
      }}
    >
      <MarkdownContent content={legacyToHtml(value)} dark />
    </div>
  )
}
