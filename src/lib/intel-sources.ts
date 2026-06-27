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
  // 정책 — 법제처 공식 입법예고
  {
    id: 'legislation',
    label: '입법예고',
    category: 'policy',
    type: 'rss',
    url: 'https://www.law.go.kr/rss/lsEgSt.rss',
    description: '법제처 공식 입법예고',
  },
  // 정책 — 고용노동부 보도자료
  {
    id: 'moel-press',
    label: '고용노동부 보도자료',
    category: 'policy',
    type: 'rss',
    url: 'https://www.moel.go.kr/rss/pressrls.rss',
    description: '고용노동부 공식 보도자료',
  },
  // 통계 — 한국노동연구원
  {
    id: 'kli',
    label: '한국노동연구원',
    category: 'stats',
    type: 'rss',
    url: 'https://www.kli.re.kr/kli/rssList.do',
    description: '노동시장 분석·정책 리포트',
  },
  // 통계 — HBR 조직·인사 인사이트
  {
    id: 'hbr',
    label: 'HBR 인사이트',
    category: 'stats',
    type: 'rss',
    url: 'https://feeds.hbr.org/harvardbusiness',
    description: 'Harvard Business Review 최신 아티클',
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
