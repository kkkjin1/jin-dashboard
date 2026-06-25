'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, BookOpen, FileText, BarChart2 } from 'lucide-react'
import {
  INTEL_SOURCES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  EXCLUDE_KEYWORDS,
  type IntelCategory,
  type IntelSource,
} from '@/lib/intel-sources'
import type { RssItem } from '@/app/api/intel/rss/route'

type FeedState = { items: RssItem[]; loading: boolean; error?: string }

function isRelevant(title: string): boolean {
  return !EXCLUDE_KEYWORDS.some(kw => title.includes(kw))
}

// 3열 컬럼 구성
const COLUMNS: { label: string; category: IntelCategory }[] = [
  { label: '정책', category: 'policy' },
  { label: '통계', category: 'stats' },
  { label: '논문·연구', category: 'paper' },
]

export default function IntelligencePage() {
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({})
  const [lastUpdated, setLastUpdated] = useState('')

  const fetchSource = useCallback(async (id: string, url: string, label: string) => {
    setFeeds(prev => ({ ...prev, [id]: { items: [], loading: true } }))
    try {
      const res = await fetch(
        `/api/intel/rss?url=${encodeURIComponent(url)}&label=${encodeURIComponent(label)}`
      )
      const data = await res.json()
      setFeeds(prev => ({
        ...prev,
        [id]: { items: data.items ?? [], loading: false, error: data.error },
      }))
    } catch (e) {
      setFeeds(prev => ({ ...prev, [id]: { items: [], loading: false, error: String(e) } }))
    }
  }, [])

  const fetchAll = useCallback(() => {
    INTEL_SOURCES.forEach(s => fetchSource(s.id, s.url, s.label))
    const now = new Date()
    setLastUpdated(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
  }, [fetchSource])

  useEffect(() => { fetchAll() }, [fetchAll])

  const isLoading = INTEL_SOURCES.some(s => feeds[s.id]?.loading)

  return (
    <div className="h-screen flex flex-col p-4 md:p-5 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">HR 인텔리전스</h1>
          {lastUpdated && (
            <span className="text-xs text-gray-400">{lastUpdated} 업데이트</span>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-1.5 rounded-md text-gray-500 hover:border-gray-400 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 3열 그리드 */}
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {COLUMNS.map(col => {
          const sources = INTEL_SOURCES.filter(s => s.category === col.category)
          const colors = CATEGORY_COLORS[col.category]
          return (
            <div key={col.category} className="flex flex-col gap-3 min-h-0">
              {/* 열 헤더 */}
              <div className="flex items-center gap-1.5 flex-shrink-0 px-1">
                <span className={`text-xs font-bold ${colors.header}`}>{col.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                  {CATEGORY_LABELS[col.category]}
                </span>
              </div>

              {/* 소스 패널들 */}
              {sources.map(source => (
                <SourcePanel
                  key={source.id}
                  source={source}
                  state={feeds[source.id]}
                />
              ))}

              {/* 통계 열: KOSIS 플레이스홀더 */}
              {col.category === 'stats' && (
                <div className="flex-1 min-h-0 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart2 size={13} className="text-amber-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-amber-700">KOSIS 통계 지표</span>
                      <span className="text-[10px] text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        연동 예정
                      </span>
                    </div>
                    <p className="text-xs text-amber-600 leading-relaxed">
                      사업체노동력조사 · 임금근로시간조사 · 경제활동인구조사
                    </p>
                  </div>
                  <a
                    href="https://kosis.kr/openapi/agree.do"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 underline underline-offset-2 mt-3"
                  >
                    API키 발급 (무료) <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SourcePanel({ source, state }: { source: IntelSource; state?: FeedState }) {
  const loading = state?.loading ?? true
  const error = state?.error
  const allItems = state?.items ?? []
  const items = allItems.filter(item => isRelevant(item.title))
  const filtered = allItems.length - items.length
  const colors = CATEGORY_COLORS[source.category]

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden">
      {/* 패널 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
        {source.category === 'paper'
          ? <BookOpen size={12} className={colors.icon} />
          : <FileText size={12} className={colors.icon} />
        }
        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{source.label}</span>
        {!loading && items.length > 0 && (
          <span className="text-[10px] text-gray-400 flex-shrink-0">{items.length}건</span>
        )}
        {!loading && filtered > 0 && (
          <span className="text-[10px] text-gray-300 flex-shrink-0">({filtered} 필터됨)</span>
        )}
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-2 space-y-1.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-100 rounded-lg h-12 animate-pulse" />
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <div className="p-3 text-xs text-red-400">불러오기 실패</div>
        ) : items.length === 0 ? (
          <div className="p-3 text-xs text-gray-300 text-center pt-6">항목 없음</div>
        ) : (
          <div className="p-2 space-y-1">
            {items.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <p className="text-xs text-gray-700 leading-snug flex-1 group-hover:text-gray-900 line-clamp-2">
                    {item.title}
                  </p>
                  <ExternalLink size={10} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors" />
                </div>
                {item.pubDate && (
                  <p className="text-[10px] text-gray-300 mt-1">{formatDate(item.pubDate)}</p>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch {
    return raw
  }
}
