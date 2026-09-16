'use client'

import { useState } from 'react'
import { S, truncate } from './style'

// RIGHT는 "이 주제/섹션의 히스토리" 단일 역할이다(전후비교 탭 제거) — CENTER에서 이미
// 작성 중인 내용을 다시 작은 좌우 박스로 보여주던 중복을 없앤다. topic이든 고정 섹션이든
// page.tsx가 동일한 모양(HistoryItem[])으로 미리 계산해 넘기므로, 이 컴포넌트는 어떤
// 데이터인지 몰라도 된다.
export interface HistoryItem {
  id: string
  label: string        // "2026.09.14 ~ 09.27"
  value: string
  isCurrent: boolean
}

interface Props {
  title: string
  items: HistoryItem[]
  showFullHistoryLink: boolean
  onOpenFullHistory: () => void
}

export default function ContextPanel({ title, items, showFullHistoryLink, onOpenFullHistory }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const PREVIEW_LEN = 64

  return (
    // LEFT(TopicOutline)와 같은 폭 전략 — 1366/1440에서는 좁게, 1920+에서 조금 더 넓혀
    // "붙어 있는 작은 부록"처럼 보이지 않게 한다.
    <div className="h-full flex flex-col w-[230px] xl:w-[260px] 2xl:w-[290px]" style={{ flexShrink: 0 }}>
      <div className="px-4 pt-3.5 pb-2.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: S.t4 }}>{title}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {items.length === 0 ? (
          <p className="text-[12px]" style={{ color: S.t4 }}>히스토리가 없습니다.</p>
        ) : (
          <div>
            {items.map((item, i) => {
              const isOpen = expandedId === item.id
              const hasValue = !!(item.value ?? '').trim()
              return (
                <div key={item.id} className="py-3" style={{ borderTop: i === 0 ? undefined : `1px solid ${S.border}` }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: item.isCurrent ? S.accentText : S.t3 }}>
                    {item.label}{item.isCurrent && ' · 현재'}
                  </p>
                  <p
                    className="text-[12px] leading-[1.6] whitespace-pre-wrap"
                    style={{ color: hasValue ? S.t2 : S.t4 }}
                  >
                    {hasValue ? (isOpen ? item.value : truncate(item.value, PREVIEW_LEN)) : '(내용 없음)'}
                  </p>
                  {hasValue && item.value.length > PREVIEW_LEN && (
                    <button
                      onClick={() => setExpandedId(isOpen ? null : item.id)}
                      className="text-[10.5px] font-medium underline mt-0.5"
                      style={{ color: S.t4 }}
                    >
                      {isOpen ? '접기' : '보기'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {showFullHistoryLink && (
          <button
            onClick={onOpenFullHistory}
            className="w-full text-left mt-4 pt-3 text-[11px] font-medium underline underline-offset-2"
            style={{ borderTop: `1px solid ${S.border}`, color: S.t3 }}
          >
            전체 히스토리 보기 →
          </button>
        )}
      </div>
    </div>
  )
}
