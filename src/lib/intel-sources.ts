export type IntelCategory = 'policy' | 'stats' | 'paper'

export interface IntelSource {
  id: string
  label: string
  category: IntelCategory
  url: string
  description: string
}

export const INTEL_SOURCES: IntelSource[] = [
  {
    id: 'moel-press',
    label: '고용노동부 보도자료',
    category: 'policy',
    url: 'https://www.moel.go.kr/rss/rssList.do?type=press',
    description: '최신 노동정책·법령 발표',
  },
  {
    id: 'kostat-press',
    label: '통계청 보도자료',
    category: 'stats',
    url: 'https://kostat.go.kr/board/rss.es?mid=a10301000000',
    description: '임금·고용 통계 정기 발표',
  },
  {
    id: 'riss-performance',
    label: 'RISS: 성과평가',
    category: 'paper',
    url: 'https://www.riss.kr/search/Search.do?format=rss&query=%EC%84%B1%EA%B3%BC%ED%8F%89%EA%B0%80+%EC%9D%B8%EC%82%AC&icate=re_a_kor',
    description: '성과평가 관련 최신 국내 학술논문',
  },
  {
    id: 'riss-compensation',
    label: 'RISS: 보상·임금체계',
    category: 'paper',
    url: 'https://www.riss.kr/search/Search.do?format=rss&query=%EC%9E%84%EA%B8%88%EC%B2%B4%EA%B3%84+%EB%B3%B4%EC%83%81%EC%84%A4%EA%B3%84&icate=re_a_kor',
    description: '임금체계·보상설계 최신 국내 학술논문',
  },
]

export const CATEGORY_LABELS: Record<IntelCategory, string> = {
  policy: '정책',
  stats: '통계',
  paper: '논문',
}

export const CATEGORY_COLORS: Record<IntelCategory, { badge: string; icon: string }> = {
  policy: { badge: 'bg-blue-50 text-blue-700', icon: 'text-blue-500' },
  stats:  { badge: 'bg-amber-50 text-amber-700', icon: 'text-amber-500' },
  paper:  { badge: 'bg-purple-50 text-purple-700', icon: 'text-purple-500' },
}
