'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import AnnualRoadmap from '@/components/annual-goals/AnnualRoadmap'
import YearPlanView from '@/components/annual-goals/YearPlanView'

const CATS = ['1. 인재 확보', '2. 검증과 정렬', '3. 유지와 보상', '4. 지속가능성', '5. 확장 기반']
const DISPLAY_CATS = ['전체', ...CATS]
const SESSION_KEY = 'annual-goals-tab'
const YEAR_KEY = 'annual-goals-year'
const MODE_KEY = 'annual-goals-mode'
type Mode = 'plan' | 'legacy'

// AnnualRoadmap.tsx의 CATEGORY_SECTION_COLOR와 동일 — 활성 탭 배경/텍스트 색
const CAT_ACTIVE_COLOR: Record<string, { bg: string; text: string }> = {
  '1. 인재 확보':   { bg: '#C7D5E3', text: '#3F5670' },
  '2. 검증과 정렬': { bg: '#DCEAE1', text: '#4F7160' },
  '3. 유지와 보상': { bg: '#F3DED4', text: '#8B5A44' },
  '4. 지속가능성':  { bg: '#F1DCE4', text: '#8A5468' },
  '5. 확장 기반':   { bg: '#E8E4DC', text: '#6B665A' },
}

function fallbackLabel(c: string) { return c.replace(/^\d+\.\s*/, '') }

export default function AnnualGoalsPage() {
  const [cat, setCat] = useState('전체')
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({})
  // 연도계획 기준 연도 — 기본값은 현재 연도(앱 전반의 new Date().getFullYear() 관례). 하드코딩하지 않는다.
  const [year, setYear] = useState(() => new Date().getFullYear())
  // plan = 연도계획(기본, 영역 > 목표 × 연도 우선순위) / legacy = 기존 안건(annual_goal_tasks) 화면
  const [mode, setMode] = useState<Mode>('plan')
  const supabase = createClient()

  async function loadCategoryLabels() {
    const { data } = await supabase.from('annual_goal_category_labels').select('category_key, name')
    if (data) setCategoryLabels(Object.fromEntries(data.map(r => [r.category_key, r.name])))
  }

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved && DISPLAY_CATS.includes(saved)) setCat(saved)
    try {
      const y = Number(sessionStorage.getItem(YEAR_KEY))
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) setYear(y)
      if (sessionStorage.getItem(MODE_KEY) === 'legacy') setMode('legacy')
    } catch {}
    loadCategoryLabels()
  }, [])

  async function renameCategory(key: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setCategoryLabels(prev => ({ ...prev, [key]: trimmed }))
    await supabase.from('annual_goal_category_labels').upsert({ category_key: key, name: trimmed })
  }

  function changeYear(delta: number) {
    setYear(y => {
      const next = y + delta
      try { sessionStorage.setItem(YEAR_KEY, String(next)) } catch {}
      return next
    })
  }
  function selectMode(m: Mode) {
    setMode(m)
    try { sessionStorage.setItem(MODE_KEY, m) } catch {}
  }

  function selectCat(c: string) {
    setCat(c)
    sessionStorage.setItem(SESSION_KEY, c)
  }

  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6 px-0" style={{ background: 'var(--bg-page)', minHeight: '100%' }}>
      {/* 헤더 */}
      <div className="flex-shrink-0 mb-3 px-4 md:px-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold" style={{ color: 'rgba(var(--text-rgb),1)' }}>연간목표</h1>
          {mode === 'plan' && (
            <div className="flex items-center gap-1">
              <button onClick={() => changeYear(-1)} aria-label="이전 연도" className="text-base px-1.5 leading-none text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),1)]">‹</button>
              <span className="text-[15px] font-bold w-12 text-center" style={{ color: 'rgba(var(--text-rgb),0.9)' }}>{year}</span>
              <button onClick={() => changeYear(1)} aria-label="다음 연도" className="text-base px-1.5 leading-none text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),1)]">›</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(var(--ink-rgb),0.04)' }}>
          {([['plan', '연도 계획'], ['legacy', '기존 안건']] as const).map(([k, label]) => (
            <button key={k} onClick={() => selectMode(k)}
              className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${mode === k ? 'text-[rgba(var(--text-rgb),1)]' : 'text-[rgba(var(--text-rgb),0.4)] hover:text-[rgba(var(--text-rgb),0.7)]'}`}
              style={{ background: mode === k ? 'rgba(var(--ink-rgb),0.1)' : 'transparent' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 영역 탭 — 본문 상단에 위치, 클릭 시 아래 컨텐츠가 바로 연동되어 필터링됨 */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 md:px-6 mb-4 overflow-x-auto scrollbar-hide" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.08)', paddingBottom: 10 }}>
        {DISPLAY_CATS.map(c => (
          <button key={c} onClick={() => selectCat(c)}
            className="text-sm font-semibold whitespace-nowrap transition-colors"
            style={cat === c ? {
              background: CAT_ACTIVE_COLOR[c]?.bg ?? '#fff',
              color: CAT_ACTIVE_COLOR[c]?.text ?? '#111827',
              borderRadius: 8,
              padding: '5px 14px',
            } : {
              background: 'transparent',
              color: 'rgba(var(--text-rgb),0.45)',
              borderRadius: 8,
              padding: '5px 14px',
            }}
            onMouseEnter={e => { if (cat !== c) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(var(--text-rgb),0.8)' }}
            onMouseLeave={e => { if (cat !== c) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(var(--text-rgb),0.45)' }}>
            {c === '전체' ? c : (categoryLabels[c] ?? fallbackLabel(c))}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {mode === 'plan'
          ? <YearPlanView key={`${cat}:${year}`} category={cat} allCats={CATS} year={year} categoryLabels={categoryLabels} onRenameCategory={renameCategory} />
          : <AnnualRoadmap key={cat} category={cat} allCats={CATS} categoryLabels={categoryLabels} onRenameCategory={renameCategory} />}
      </div>
    </div>
  )
}
