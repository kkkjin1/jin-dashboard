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

type FeedStatus = 'loading' | 'ok' | 'error'

interface FeedState {
  status: FeedStatus
  items?: RssItem[]
  source?: IntelSource
}

const COLUMNS: { category: IntelCategory }[] = [
  { category: 'policy' },
  { category: 'stats' },
  { category: 'paper' },
]

function isRelevant(title: string) {
  return !EXCLUDE_KEYWORDS.some(kw => title.includes(kw))
}

export default function IntelligencePage() {
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({})
  const [lastUpdated, setLastUpdated] = useState('')

  const fetchSource = useCallback(async (source: IntelSource) => {
    setFeeds(prev => ({ ...prev, [source.id]: { status: 'loading', source } }))
    try {
      const res = await fetch(
        `/api/intel/rss?url=${encodeURIComponent(source.url)}&label=${encodeURIComponent(source.label)}`
      )
      const data = await res.json()
      setFeeds(prev => ({
        ...prev,
        [source.id]: { status: 'ok', items: data.items ?? [], source },
      }))
    } catch {
      setFeeds(prev => ({ ...prev, [source.id]: { status: 'error', source } }))
    }
  }, [])

  const fetchAll = useCallback(() => {
    INTEL_SOURCES.forEach(s => fetchSource(s))
    const now = new Date()
    setLastUpdated(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
  }, [fetchSource])

  useEffect(() => { fetchAll() }, [fetchAll])

  const isLoading = INTEL_SOURCES.some(s => feeds[s.id]?.status === 'loading')

  return (
    <div className="h-screen flex flex-col p-4 md:p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">HR 인텔리전스</h1>
          {lastUpdated && <span className="text-xs text-gray-400">{lastUpdated} 업데이트</span>}
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

      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {COLUMNS.map(col => {
          const sources = INTEL_SOURCES.filter(s => s.category === col.category)
          const colors = CATEGORY_COLORS[col.category]
          return (
            <div key={col.category} className="flex flex-col gap-3 min-h-0">
              <div className="flex items-center gap-1.5 flex-shrink-0 px-1">
                <span className={`text-xs font-bold ${colors.header}`}>
                  {CATEGORY_LABELS[col.category]}
                </span>
              </div>
              {sources.map(source => (
                <SourcePanel key={source.id} source={source} state={feeds[source.id]} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SourcePanel({ source, state }: { source: IntelSource; state?: FeedState }) {
  const colors = CATEGORY_COLORS[source.category]
  const status = state?.status ?? 'loading'
  const items = (state?.items ?? []).filter(i => isRelevant(i.title))

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
        {source.category === 'paper'
          ? <BookOpen size={12} className={colors.icon} />
          : source.category === 'stats'
          ? <BarChart2 size={12} className={colors.icon} />
          : <FileText size={12} className={colors.icon} />
        }
        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{source.label}</span>
        {status === 'ok' && (
          <span className="text-[10px] text-gray-400">{items.length}건</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {status === 'loading' && <LoadingSkeleton />}
        {status === 'error' && <ErrorState />}
        {status === 'ok' && <ArticleList items={items} />}
      </div>
    </div>
  )
}

function ArticleList({ items }: { items: RssItem[] }) {
  if (items.length === 0) {
    return <p className="p-3 text-xs text-gray-300 text-center pt-6">항목 없음</p>
  }
  return (
    <div className="p-2 space-y-0.5">
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
            <ExternalLink size={10} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0 mt-0.5" />
          </div>
          {item.pubDate && (
            <p className="text-[10px] text-gray-300 mt-0.5">{formatDate(item.pubDate)}</p>
          )}
        </a>
      ))}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-2 space-y-1.5">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-gray-100 rounded-lg h-12 animate-pulse" />
      ))}
    </div>
  )
}

function ErrorState() {
  return <p className="p-3 text-xs text-red-400">불러오기 실패</p>
}

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  } catch { return raw }
}
