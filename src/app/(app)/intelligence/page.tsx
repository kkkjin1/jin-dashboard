'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, BookOpen, FileText, BarChart2 } from 'lucide-react'
import {
  INTEL_SOURCES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type IntelCategory,
} from '@/lib/intel-sources'
import type { RssItem } from '@/app/api/intel/rss/route'

type FeedState = { items: RssItem[]; loading: boolean; error?: string }
type CategoryFilter = 'all' | IntelCategory

export default function IntelligencePage() {
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({})
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [lastUpdated, setLastUpdated] = useState<string>('')

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
    setLastUpdated(
      now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    )
  }, [fetchSource])

  useEffect(() => { fetchAll() }, [fetchAll])

  const isLoading = INTEL_SOURCES.some(s => feeds[s.id]?.loading)
  const totalItems = INTEL_SOURCES.reduce((acc, s) => acc + (feeds[s.id]?.items.length ?? 0), 0)

  const visibleSources =
    filter === 'all' ? INTEL_SOURCES : INTEL_SOURCES.filter(s => s.category === filter)

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">HR 인텔리전스</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">업데이트: {lastUpdated}</p>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-2 rounded-md text-gray-500 hover:border-gray-400 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
            filter === 'all'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'border-gray-200 text-gray-500 hover:border-gray-400'
          }`}
        >
          전체{totalItems > 0 ? ` (${totalItems})` : ''}
        </button>
        {(['policy', 'stats', 'paper'] as IntelCategory[]).map(cat => {
          const count = INTEL_SOURCES
            .filter(s => s.category === cat)
            .reduce((acc, s) => acc + (feeds[s.id]?.items.length ?? 0), 0)
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                filter === cat
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {CATEGORY_LABELS[cat]}{count > 0 ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>

      {/* KOSIS 플레이스홀더 */}
      {(filter === 'all' || filter === 'stats') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <BarChart2 size={14} className="text-amber-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-amber-700">KOSIS 통계 지표</span>
            <span className="text-[10px] text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full">
              연동 예정
            </span>
          </div>
          <p className="text-xs text-amber-600 leading-relaxed">
            사업체노동력조사 · 임금근로시간조사 · 경제활동인구조사 — API키 등록 후 직종별 임금, 고용률 등을 대시보드에서 바로 조회할 수 있습니다.
          </p>
          <a
            href="https://kosis.kr/openapi/agree.do"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 mt-2 underline underline-offset-2"
          >
            KOSIS API키 발급 (무료) <ExternalLink size={10} />
          </a>
        </div>
      )}

      {/* 피드 섹션 */}
      <div className="space-y-8">
        {visibleSources.map(source => {
          const state = feeds[source.id]
          const items = state?.items ?? []
          const loading = state?.loading ?? true
          const error = state?.error
          const colors = CATEGORY_COLORS[source.category]

          return (
            <section key={source.id}>
              <div className="flex items-center gap-2 mb-3">
                {source.category === 'paper' ? (
                  <BookOpen size={13} className={colors.icon} />
                ) : (
                  <FileText size={13} className={colors.icon} />
                )}
                <h2 className="text-sm font-semibold text-gray-700">{source.label}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors.badge}`}>
                  {CATEGORY_LABELS[source.category]}
                </span>
                <span className="text-xs text-gray-400 flex-1">{source.description}</span>
                {!loading && items.length > 0 && (
                  <span className="text-xs text-gray-300 flex-shrink-0">{items.length}건</span>
                )}
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-gray-100 rounded-lg h-14 animate-pulse" />
                  ))}
                </div>
              ) : error && items.length === 0 ? (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  <p className="text-xs text-red-400">데이터를 불러오지 못했습니다 (소스 점검 필요)</p>
                </div>
              ) : items.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-6 border border-dashed border-gray-100 rounded-lg">
                  항목 없음
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <a
                      key={i}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-white border border-gray-100 rounded-lg px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-gray-800 font-medium leading-snug flex-1">
                          {item.title}
                        </p>
                        <ExternalLink
                          size={12}
                          className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 mt-0.5 transition-colors"
                        />
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      {item.pubDate && (
                        <p className="text-[10px] text-gray-300 mt-1.5">
                          {formatDate(item.pubDate)}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return raw
  }
}
