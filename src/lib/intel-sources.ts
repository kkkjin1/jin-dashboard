export type IntelCategory = 'policy' | 'stats' | 'paper'

export interface IntelSource {
  id: string
  label: string
  category: IntelCategory
  url: string
  description: string
}

// Google News RSS — Vercel(해외IP)에서 안정적으로 동작하는 유일한 방식
// 한국 정부 사이트(moel.go.kr, kostat.go.kr)와 RISS는 해외 IP 차단
const GN = (q: string) =>
  `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`

export const INTEL_SOURCES: IntelSource[] = [
  {
    id: 'moel-press',
    label: '고용노동부 보도자료',
    category: 'policy',
    url: GN('%EA%B3%A0%EC%9A%A9%EB%85%B8%EB%8F%99%EB%B6%80+%EB%B3%B4%EB%8F%84%EC%9E%90%EB%A3%8C'),
    description: '노동정책·법령 최신 발표',
  },
  {
    id: 'labor-law',
    label: '노동법·최저임금 동향',
    category: 'policy',
    url: GN('%EB%85%B8%EB%8F%99%EB%B2%95+%EC%B5%9C%EC%A0%80%EC%9E%84%EA%B8%88+%EC%A0%95%EC%B1%85'),
    description: '근로기준법·최저임금 관련 입법 동향',
  },
  {
    id: 'kostat-stats',
    label: '통계청 고용·임금 통계',
    category: 'stats',
    url: GN('%ED%86%B5%EA%B3%84%EC%B2%AD+%EA%B3%A0%EC%9A%A9%ED%86%B5%EA%B3%84+%EC%9E%84%EA%B8%88'),
    description: '임금·고용률 통계 발표',
  },
  {
    id: 'hr-research',
    label: '성과평가 연구 동향',
    category: 'paper',
    url: GN('%EC%84%B1%EA%B3%BC%ED%8F%89%EA%B0%80+%EC%9D%B8%EC%82%AC%EA%B4%80%EB%A6%AC+%EC%97%B0%EA%B5%AC'),
    description: '성과평가·HR 학술 연구 동향',
  },
  {
    id: 'compensation-research',
    label: '보상·임금체계 동향',
    category: 'paper',
    url: GN('%EC%9E%84%EA%B8%88%EC%B2%B4%EA%B3%84+%EC%A7%81%EB%AC%B4%EA%B8%89+%EB%B3%B4%EC%83%81%EC%84%A4%EA%B3%84'),
    description: '직무급·임금체계 개편 동향',
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
