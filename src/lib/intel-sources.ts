export type IntelCategory = 'policy' | 'stats' | 'paper'
export type SourceType = 'rss' | 'riss'

export interface IntelSource {
  id: string
  label: string
  category: IntelCategory
  type: SourceType
  description: string
  // RSS 전용
  url?: string
  // RISS API 전용
  apiPath?: string
  requiresKey?: 'RISS_API_KEY'
  keySetupUrl?: string
  keySetupLabel?: string
}

export const INTEL_SOURCES: IntelSource[] = [
  // 정책 — 고용노동부 (구글 뉴스)
  {
    id: 'moel-press',
    label: '고용노동부 보도자료',
    category: 'policy',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=고용노동부+보도자료&hl=ko&gl=KR&ceid=KR:ko',
    description: '고용노동부 보도자료',
  },
  // 정책 — 입법예고 (구글 뉴스)
  {
    id: 'legislation',
    label: '노동·고용 입법예고',
    category: 'policy',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=입법예고+노동+고용+근로&hl=ko&gl=KR&ceid=KR:ko',
    description: '노동·고용 관련 입법예고',
  },
  // 통계 — 한국노동연구원 (구글 뉴스)
  {
    id: 'kli',
    label: '한국노동연구원 동향',
    category: 'stats',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=한국노동연구원+노동시장+임금&hl=ko&gl=KR&ceid=KR:ko',
    description: '한국노동연구원 연구·발표',
  },
  // 통계 — McKinsey 조직·인사 인사이트
  {
    id: 'mckinsey',
    label: 'McKinsey 인사이트',
    category: 'stats',
    type: 'rss',
    url: 'https://www.mckinsey.com/rss/insights/rss',
    description: 'McKinsey & Company 최신 인사이트',
  },
  // 논문 — RISS 성과평가·보상
  {
    id: 'riss-performance',
    label: 'RISS 성과평가·보상 논문',
    category: 'paper',
    type: 'riss',
    apiPath: '/api/intel/riss?q=성과평가+보상설계',
    description: '성과평가·보상설계 인기 학술논문',
    requiresKey: 'RISS_API_KEY',
    keySetupUrl: 'https://www.data.go.kr',
    keySetupLabel: 'data.go.kr에서 RISS API 활용신청',
  },
  // 논문 — RISS 인사관리·조직문화
  {
    id: 'riss-hr',
    label: 'RISS 인사관리·조직 논문',
    category: 'paper',
    type: 'riss',
    apiPath: '/api/intel/riss?q=인사관리+조직문화',
    description: '인사관리·조직문화 인기 학술논문',
    requiresKey: 'RISS_API_KEY',
    keySetupUrl: 'https://www.data.go.kr',
    keySetupLabel: 'data.go.kr에서 RISS API 활용신청',
  },
]

export const CATEGORY_LABELS: Record<IntelCategory, string> = {
  policy: '정책',
  stats: '통계·인사이트',
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
