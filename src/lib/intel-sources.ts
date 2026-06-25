export type IntelCategory = 'policy' | 'stats' | 'paper'
export type SourceType = 'rss' | 'datago' | 'kosis' | 'riss'

export interface IntelSource {
  id: string
  label: string
  category: IntelCategory
  type: SourceType
  description: string
  // RSS 전용
  url?: string
  // API 전용
  apiPath?: string
  requiresKey?: 'DATAGO_API_KEY' | 'KOSIS_API_KEY'
  keySetupUrl?: string
  keySetupLabel?: string
}

export const INTEL_SOURCES: IntelSource[] = [
  // 정책 — 고용노동부 보도자료 (공식)
  {
    id: 'moel-press',
    label: '고용노동부 보도자료',
    category: 'policy',
    type: 'datago',
    apiPath: '/api/intel/datago?type=moel',
    description: '공식 보도자료 (data.go.kr)',
    requiresKey: 'DATAGO_API_KEY',
    keySetupUrl: 'https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do',
    keySetupLabel: 'data.go.kr API키 발급 (무료)',
  },
  // 정책 — 입법예고
  {
    id: 'legislation',
    label: '입법예고 (노동·고용)',
    category: 'policy',
    type: 'datago',
    apiPath: '/api/intel/datago?type=legislation',
    description: '법제처 입법예고 — 노동·고용 관련 필터',
    requiresKey: 'DATAGO_API_KEY',
    keySetupUrl: 'https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do',
    keySetupLabel: 'data.go.kr API키 발급 (무료)',
  },
  // 통계 — KOSIS 실수치
  {
    id: 'kosis-stats',
    label: 'KOSIS 임금·고용 지표',
    category: 'stats',
    type: 'kosis',
    apiPath: '/api/intel/kosis',
    description: '월평균 임금·근로시간·취업자 수 실수치',
    requiresKey: 'KOSIS_API_KEY',
    keySetupUrl: 'https://kosis.kr/openapi/agree.do',
    keySetupLabel: 'KOSIS API키 발급 (무료)',
  },
  // 논문 — RISS (data.go.kr 오픈API)
  {
    id: 'riss-papers',
    label: 'RISS 학술논문',
    category: 'paper',
    type: 'riss',
    apiPath: '/api/intel/riss',  // 추후 구현
    description: '성과평가·보상설계 국내 학술논문',
    requiresKey: 'DATAGO_API_KEY',
    keySetupUrl: 'https://www.data.go.kr',
    keySetupLabel: 'data.go.kr API키 발급 (무료, 입법예고와 동일 키)',
  },
  // 논문 — 임시 RSS (API키 없을 때 대안)
  {
    id: 'hr-research-tmp',
    label: 'HR 연구 동향 (임시)',
    category: 'paper',
    type: 'rss',
    url: 'https://news.google.com/rss/search?q=%EC%9D%B8%EC%82%AC%EA%B4%80%EB%A6%AC+%EC%84%B1%EA%B3%BC%ED%8F%89%EA%B0%80+%EC%97%B0%EA%B5%AC&hl=ko&gl=KR&ceid=KR:ko',
    description: '언론사 혼합 — RISS API키 설정 시 대체됨',
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
