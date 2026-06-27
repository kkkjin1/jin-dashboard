export type IntelCategory = 'policy' | 'stats' | 'paper'
export type SourceType = 'rss'

export interface IntelSource {
  id: string
  label: string
  category: IntelCategory
  type: SourceType
  description: string
  url: string
}

export const INTEL_SOURCES: IntelSource[] = [
  // 정책 — 고용노동부 보도자료
  {
    id: 'moel-press',
    label: '고용노동부 보도자료',
    category: 'policy',
    type: 'rss',
    url: 'https://www.moel.go.kr/rss/pressrls.rss',
    description: '고용노동부 공식 보도자료',
  },
  // 정책 — 입법예고
  {
    id: 'legislation',
    label: '입법예고 (노동·고용)',
    category: 'policy',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=%EC%9E%85%EB%B2%95%EC%98%88%EA%B3%A0+%EB%85%B8%EB%8F%99+%EA%B3%A0%EC%9A%A9&hl=ko&gl=KR&ceid=KR:ko',
    description: '노동·고용 관련 입법예고',
  },
  // 통계 — 임금·고용 뉴스
  {
    id: 'wage-stats',
    label: '임금·고용 통계 동향',
    category: 'stats',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=%EC%9E%84%EA%B8%88+%EA%B3%A0%EC%9A%A9+%ED%86%B5%EA%B3%84&hl=ko&gl=KR&ceid=KR:ko',
    description: '임금·고용 통계 관련 뉴스',
  },
  // 통계 — 노동시장 동향
  {
    id: 'labor-market',
    label: '노동시장 동향',
    category: 'stats',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=%EB%85%B8%EB%8F%99%EC%8B%9C%EC%9E%A5+%EC%B7%A8%EC%97%85%EB%A5%A0+%EA%B3%A0%EC%9A%A9%EB%8F%99%ED%96%A5&hl=ko&gl=KR&ceid=KR:ko',
    description: '취업률·고용동향 뉴스',
  },
  // 논문 — HR 연구
  {
    id: 'hr-research',
    label: 'HR 연구 동향',
    category: 'paper',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=%EC%9D%B8%EC%82%AC%EA%B4%80%EB%A6%AC+%EC%84%B1%EA%B3%BC%ED%8F%89%EA%B0%80+%EC%97%B0%EA%B5%AC&hl=ko&gl=KR&ceid=KR:ko',
    description: '성과평가·인사관리 연구',
  },
  // 논문 — 보상·조직문화
  {
    id: 'compensation-research',
    label: '보상·조직문화 연구',
    category: 'paper',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=%EB%B3%B4%EC%83%81%EC%84%A4%EA%B3%84+%EC%A1%B0%EC%A7%81%EB%AC%B8%ED%99%94+%EC%97%B0%EA%B5%AC&hl=ko&gl=KR&ceid=KR:ko',
    description: '보상설계·조직문화 연구 동향',
  },
]

export const CATEGORY_LABELS: Record<IntelCategory, string> = {
  policy: '정책',
  stats: '통계',
  paper: '논문',
}

export const CATEGORY_COLORS: Record<IntelCategory, { badge: string; icon: string; header: string }> = {
  policy: { badge: 'bg-blue-50 text-blue-700',   icon: 'text-blue-500',   header: 'text-blue-600' },
  stats:  { badge: 'bg-amber-50 text-amber-700', icon: 'text-amber-500', header: 'text-amber-600' },
  paper:  { badge: 'bg-purple-50 text-purple-700', icon: 'text-purple-500', header: 'text-purple-600' },
}

export const EXCLUDE_KEYWORDS = [
  '온열질환', '폭염', '냉방비', '혹서',
  '화재', '산재사고',
  'SK에코', '쿠팡이츠', '배달파트너',
  '봉사활동', '사회공헌', '기부',
]
