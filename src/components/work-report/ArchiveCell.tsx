'use client'

import { S, hasContent } from './style'

// 전체 비교(다수 topic row × 다수 report col)와 주제 히스토리(단일 topic row × 다수 report
// col) 두 grid가 공유하는 cell 렌더러. 필드 1개(고정 섹션: 요약/이슈/다음단계)와 최대 3개
// (topic entry: 이번 업데이트/경영진 전달 포인트/다음 액션) 양쪽 모두를 같은 모양으로
// 그린다 — dense(전체 비교, 여러 row가 한 화면에 있어 훑어보는 용도)는 필드당 짧게 clamp,
// 그렇지 않으면(주제 히스토리, 한 topic만 깊게 보는 용도) 더 길게 보여준다.
export interface CellField {
  label?: string
  value: string
}

interface Props {
  fields: CellField[]
  dense: boolean
  onClick?: () => void
}

export default function ArchiveCell({ fields, dense, onClick }: Props) {
  const visible = fields.filter(f => hasContent(f.value))
  const clickable = !!onClick && visible.length > 0

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className="px-3 py-2.5 align-top h-full"
      style={{ cursor: clickable ? 'pointer' : 'default' }}
    >
      {visible.length === 0 ? (
        <span className="text-[12px]" style={{ color: S.t4 }}>—</span>
      ) : (
        <div className="space-y-1.5">
          {visible.map((f, i) => (
            <div key={f.label ?? i}>
              {f.label && (
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: S.t4 }}>{f.label}</p>
              )}
              <p
                className="text-[12px] leading-[1.55] whitespace-pre-wrap"
                style={{
                  color: S.t2,
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: dense ? 2 : 6,
                  overflow: 'hidden',
                }}
              >
                {f.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
