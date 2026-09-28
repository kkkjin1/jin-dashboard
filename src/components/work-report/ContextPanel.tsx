'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { S } from './style'

// RIGHT는 "이 주제/섹션의 히스토리" 단일 역할이다(전후비교 탭 제거) — topic이든 고정
// 섹션이든 page.tsx가 동일한 모양(HistoryItem[])으로 미리 계산해 넘기므로, 이 컴포넌트는
// 어떤 데이터인지 몰라도 된다.
//
// 표시 방식(2026-09-28): 예전에는 전 회차를 세로로 늘어놓고 64자 미리보기만 보여줘서
// 과거 내용을 읽으려면 회차마다 "보기"를 눌러야 했다. 지금은 상단 네비게이션(◀ ▶ + 보고일
// 칩)으로 한 번에 한 회차를 골라 전체 내용을 읽는다. 기본 선택은 "현재 회차의 직전 회차" —
// 현재 회차는 CENTER에서 이미 편집 중이므로 참고 대상은 바로 이전 보고다. 보고/섹션 전환
// 시 초기 선택 리셋은 page.tsx의 key remount로 처리한다.
export interface HistoryItem {
  id: string
  label: string        // "2026.09.14 ~ 09.27"
  dateLabel: string    // 보고일 "2026.09.28"
  value: string
  isCurrent: boolean
}

interface Props {
  title: string
  items: HistoryItem[]  // 최신 → 과거 순
  showFullHistoryLink: boolean
  onOpenFullHistory: () => void
}

export default function ContextPanel({ title, items, showFullHistoryLink, onOpenFullHistory }: Props) {
  // 네비게이션은 좌→우 = 과거→최신으로 읽히게 뒤집어 쓴다(상단 보고 이력 타임라인과 같은 방향).
  const asc = useMemo(() => [...items].reverse(), [items])
  const defaultIndex = useMemo(() => {
    const cur = asc.findIndex(i => i.isCurrent)
    if (cur > 0) return cur - 1
    if (cur === 0) return 0
    return asc.length - 1
  }, [asc])

  // items는 비동기로(topic 히스토리 fetch) 늦게 채워질 수 있으므로, 사용자가 직접 고르기
  // 전까지는 선택 id를 비워두고 defaultIndex를 따라간다.
  const [pickedId, setPickedId] = useState<string | null>(null)
  const pickedIndex = pickedId ? asc.findIndex(i => i.id === pickedId) : -1
  const index = pickedIndex >= 0 ? pickedIndex : defaultIndex
  const item = asc[index]

  const chipsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [index])

  function go(delta: number) {
    const next = asc[index + delta]
    if (next) setPickedId(next.id)
  }

  const hasValue = !!(item?.value ?? '').trim()

  return (
    // LEFT(TopicOutline)와 같은 폭 전략 — 1366/1440에서는 좁게, 1920+에서 조금 더 넓혀
    // "붙어 있는 작은 부록"처럼 보이지 않게 한다.
    <div className="h-full flex flex-col w-[230px] xl:w-[260px] 2xl:w-[290px]" style={{ flexShrink: 0 }}>
      <div className="px-4 pt-3.5 pb-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: S.t4 }}>{title}</p>
      </div>

      {asc.length === 0 || !item ? (
        <p className="px-4 text-[12px]" style={{ color: S.t4 }}>히스토리가 없습니다.</p>
      ) : (
        <>
          {/* 상단 네비게이션 — ◀ 이전 회차 / 보고일 / 다음 회차 ▶ + 전 회차 보고일 칩 */}
          <div className="px-3 pb-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={() => go(-1)}
                disabled={index <= 0}
                className="p-1 rounded-lg disabled:opacity-25 hover:bg-[rgba(var(--ink-rgb),0.06)]"
                title="이전 보고"
              >
                <ChevronLeft size={14} style={{ color: S.t2 }} />
              </button>
              <div className="min-w-0 text-center">
                <p className="text-[12.5px] font-semibold truncate" style={{ color: item.isCurrent ? S.accentText : S.t1 }}>
                  {item.dateLabel} 보고{item.isCurrent && ' · 현재'}
                </p>
                <p className="text-[10.5px] truncate" style={{ color: S.t4 }}>
                  {item.label} · {index + 1}/{asc.length}
                </p>
              </div>
              <button
                onClick={() => go(1)}
                disabled={index >= asc.length - 1}
                className="p-1 rounded-lg disabled:opacity-25 hover:bg-[rgba(var(--ink-rgb),0.06)]"
                title="다음 보고"
              >
                <ChevronRight size={14} style={{ color: S.t2 }} />
              </button>
            </div>

            <div ref={chipsRef} className="flex items-center gap-1 overflow-x-auto mt-2 pb-0.5" style={{ scrollbarWidth: 'thin' }}>
              {asc.map((it, i) => {
                const active = i === index
                return (
                  <button
                    key={it.id}
                    data-idx={i}
                    onClick={() => setPickedId(it.id)}
                    title={it.label}
                    className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10.5px] transition-colors"
                    style={active
                      ? { color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}`, fontWeight: 600 }
                      : { color: it.isCurrent ? S.accentText : S.t3, background: 'rgba(var(--ink-rgb),0.04)', border: `1px solid ${S.border}` }}
                  >
                    {it.dateLabel.slice(5)}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p
              className="text-[12.5px] leading-[1.7] whitespace-pre-wrap break-words"
              style={{ color: hasValue ? S.t2 : S.t4 }}
            >
              {hasValue ? item.value : '(내용 없음)'}
            </p>

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
        </>
      )}
    </div>
  )
}
