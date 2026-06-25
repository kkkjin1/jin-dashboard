'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, BookOpen, FileText, BarChart2, Key, TrendingUp } from 'lucide-react'
import {
  INTEL_SOURCES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  EXCLUDE_KEYWORDS,
  type IntelCategory,
  type IntelSource,
} from '@/lib/intel-sources'
import type { RssItem } from '@/app/api/intel/rss/route'
import type { KosisIndicator } from '@/app/api/intel/kosis/route'

type FeedStatus = 'loading' | 'ok' | 'key_required' | 'error'

interface FeedState {
  status: FeedStatus
  items?: RssItem[]
  indicators?: KosisIndicator[]
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
      if (source.type === 'rss' && source.url) {
        const res = await fetch(
          `/api/intel/rss?url=${encodeURIComponent(source.url)}&label=${encodeURIComponent(source.label)}`
        )
        const data = await res.json()
        setFeeds(prev => ({
          ...prev,
          [source.id]: { status: 'ok', items: data.items ?? [], source },
        }))
      } else if (source.type === 'kosis' && source.apiPath) {
        const res = await fetch(source.apiPath)
        const data = await res.json()
        setFeeds(prev => ({
          ...prev,
          [source.id]: { status: data.status, indicators: data.indicators, source },
        }))
      } else if ((source.type === 'datago' || source.type === 'riss') && source.apiPath) {
        const res = await fetch(source.apiPath)
        const data = await res.json()
        setFeeds(prev => ({
          ...prev,
          [source.id]: { status: data.status, items: data.items ?? [], source },
        }))
      }
    } catch (e) {
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
        {status === 'ok' && source.type === 'rss' && (
          <span className="text-[10px] text-gray-400">
            {(state?.items ?? []).filter(i => isRelevant(i.title)).length}건
          </span>
        )}
        {status === 'ok' && source.type !== 'rss' && source.type !== 'kosis' && (
          <span className="text-[10px] text-gray-400">{state?.items?.length ?? 0}건</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {status === 'loading' && <LoadingSkeleton />}
        {status === 'key_required' && source.requiresKey && (
          <KeyRequiredState source={source} />
        )}
        {status === 'error' && <ErrorState />}
        {status === 'ok' && source.type === 'kosis' && (
          <KosisPanel indicators={state?.indicators ?? []} />
        )}
        {status === 'ok' && source.type !== 'kosis' && (
          <ArticleList items={(state?.items ?? []).filter(i => isRelevant(i.title))} />
        )}
      </div>
    </div>
  )
}

function KeyRequiredState({ source }: { source: IntelSource }) {
  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Key size={13} className="text-amber-500" />
        <span className="text-xs font-semibold text-amber-700">API키 필요</span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        Vercel 환경변수에 <code className="bg-gray-100 px-1 rounded text-[10px]">{source.requiresKey}</code>를 설정하면 공식 데이터를 불러옵니다.
      </p>
      {source.keySetupUrl && (
        <a
          href={source.keySetupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
        >
          {source.keySetupLabel ?? 'API키 발급'} <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

function KosisPanel({ indicators }: { indicators: KosisIndicator[] }) {
  if (indicators.length === 0) {
    return <p className="p-4 text-xs text-gray-400">데이터 없음</p>
  }
  return (
    <div className="p-3 space-y-2">
      {indicators.map((ind, i) => (
        <div key={i} className="bg-gray-50 rounded-lg px-3 py-3">
          <p className="text-[10px] text-gray-400 mb-1">{ind.name}</p>
          <div className="flex items-end gap-1.5">
            <span className="text-lg font-bold text-gray-900">{ind.value}</span>
            <span className="text-xs text-gray-400 mb-0.5">{ind.unit}</span>
          </div>
          <p className="text-[10px] text-gray-300 mt-1">{formatPeriod(ind.period)}</p>
        </div>
      ))}
      <a
        href="https://kosis.kr"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-gray-500 pt-1"
      >
        <TrendingUp size={10} /> KOSIS 상세 조회
      </a>
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
          {item.description && (
            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
          )}
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

function formatPeriod(raw: string): string {
  if (!raw) return ''
  if (raw.length === 6) return `${raw.slice(0, 4)}년 ${raw.slice(4)}월`
  if (raw.length === 4) return `${raw}년`
  return raw
}
