// 학습자료 분야(범주)별 색. 사용자가 고른 색(user setting 'learning_tag_colors')이 있으면 그 색,
// 없으면 아직 안 쓴 팔레트 색을 순서대로 배정해 분야끼리 겹치지 않게 한다. 보라 계열 제외.
export const TAG_PALETTE = [
  '#2563EB', // 파랑
  '#16A34A', // 초록
  '#EA580C', // 주황
  '#DB2777', // 분홍
  '#0D9488', // 청록
  '#CA8A04', // 겨자
  '#DC2626', // 빨강
  '#0284C7', // 하늘
  '#92400E', // 갈색
  '#334155', // 먹색
]
export const NO_TAG_COLOR = '#94A3B8'

export function resolveTagColors(tags: string[], stored: Record<string, string>): Record<string, string> {
  const used = new Set(tags.map(t => stored[t]).filter(Boolean))
  const free = TAG_PALETTE.filter(c => !used.has(c))
  const out: Record<string, string> = {}
  let k = 0
  tags.forEach((t, i) => {
    out[t] = stored[t] ?? free[k++] ?? TAG_PALETTE[i % TAG_PALETTE.length]
  })
  return out
}
