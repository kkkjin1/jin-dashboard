'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import AgendaWorkspace from '@/components/test-practice/AgendaWorkspace'

// annual-goals/page.tsx와 동일한 5개 고정 영역 — annual_goal_items.category CHECK 제약과 일치해야 함
const CATS = ['1. 인재 확보', '2. 검증과 정렬', '3. 유지와 보상', '4. 지속가능성', '5. 확장 기반']
const DISPLAY_CATS = ['전체', ...CATS]
const SESSION_KEY = 'test-practice-tab'

const CAT_ACTIVE_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  '1. 인재 확보':   { bg: '#C7D5E3', text: '#3F5670', dot: '#3F5670' },
  '2. 검증과 정렬': { bg: '#DCEAE1', text: '#4F7160', dot: '#4F7160' },
  '3. 유지와 보상': { bg: '#F3DED4', text: '#8B5A44', dot: '#8B5A44' },
  '4. 지속가능성':  { bg: '#F1DCE4', text: '#8A5468', dot: '#8A5468' },
  '5. 확장 기반':   { bg: '#E8E4DC', text: '#6B665A', dot: '#6B665A' },
}

function fallbackLabel(c: string) { return c.replace(/^\d+\.\s*/, '') }

export default function TestPracticePage() {
  const [cat, setCat] = useState('전체')
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState<{ total: number; done: number } | null>(null)
  const supabase = createClient()

  // 전체 실행 현황 요약 — 탭 선택과 무관하게 test_practice_tasks 전체를 가볍게 카운트만 함
  const loadSummary = useCallback(async () => {
    const { data } = await supabase.from('test_practice_tasks').select('status')
    if (!data) return
    setSummary({ total: data.length, done: data.filter(r => r.status === 'done').length })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved && DISPLAY_CATS.includes(saved)) setCat(saved)
    supabase.from('annual_goal_category_labels').select('category_key, name')
      .then(({ data }) => { if (data) setCategoryLabels(Object.fromEntries(data.map(r => [r.category_key, r.name]))) })
    loadSummary()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectCat(c: string) {
    setCat(c)
    sessionStorage.setItem(SESSION_KEY, c)
  }

  const summaryPct = summary && summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0

  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6 px-0" style={{ background: '#0F1319', minHeight: '100%' }}>
      {/* ── 상단: 제목/설명 + 전체 실행 현황 요약 ── */}
      <div className="flex-shrink-0 mb-4 px-4 md:px-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#E2E8F0' }}>테스트실무</h1>
          <p className="text-xs mt-1" style={{ color: 'rgba(226,232,240,0.4)' }}>
            연간목표 1~3단계(전략/맥락)를 그대로 불러와 4단계 실행 TASK(실행)를 만들어보는 PoC 화면입니다.
          </p>
        </div>
        {summary && summary.total > 0 && (
          <div className="flex items-center gap-2.5 text-xs flex-shrink-0" style={{ color: 'rgba(226,232,240,0.5)' }}>
            <span>실행 TASK 총 <b style={{ color: '#E2E8F0' }}>{summary.total}</b>개</span>
            <span style={{ color: 'rgba(226,232,240,0.15)' }}>·</span>
            <span>완료 <b style={{ color: '#E2E8F0' }}>{summary.done}</b>개</span>
            <span style={{ color: 'rgba(226,232,240,0.15)' }}>·</span>
            <span className="px-2 py-1 rounded-lg font-bold" style={{ background: summaryPct === 100 ? 'rgba(16,185,129,0.14)' : 'rgba(76,127,224,0.12)', color: summaryPct === 100 ? '#34D399' : '#8FB1F0' }}>
              전체 실행률 {summaryPct}%
            </span>
          </div>
        )}
      </div>

      {/* ── 영역 탭 ── */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 md:px-6 mb-4 overflow-x-auto scrollbar-hide" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
        {DISPLAY_CATS.map(c => {
          const isActive = cat === c
          const colors = CAT_ACTIVE_COLOR[c]
          return (
            <button key={c} onClick={() => selectCat(c)}
              className="relative text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5"
              style={isActive ? {
                background: colors?.bg ?? '#fff',
                color: colors?.text ?? '#111827',
                borderRadius: 8,
                padding: '6px 14px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
              } : {
                background: 'transparent',
                color: 'rgba(226,232,240,0.45)',
                borderRadius: 8,
                padding: '6px 14px',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.8)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.45)' }}>
              {isActive && c !== '전체' && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colors?.dot }} />
              )}
              {c === '전체' ? c : (categoryLabels[c] ?? fallbackLabel(c))}
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 px-4 md:px-6 pb-4">
        <Suspense fallback={<div className="text-sm text-gray-400 animate-pulse py-10 text-center">불러오는 중…</div>}>
          <AgendaWorkspace key={cat} category={cat} allCats={CATS} categoryLabels={categoryLabels} onMutate={loadSummary} />
        </Suspense>
      </div>
    </div>
  )
}
