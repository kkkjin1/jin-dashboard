'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import AnnualRoadmap from '@/components/annual-goals/AnnualRoadmap'

const CATS = ['1. 인재 확보', '2. 검증과 정렬', '3. 유지와 보상', '4. 지속가능성', '5. 확장 기반']
const DISPLAY_CATS = ['전체', ...CATS]
const SESSION_KEY = 'annual-goals-tab'

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
  const supabase = createClient()

  async function loadCategoryLabels() {
    const { data } = await supabase.from('annual_goal_category_labels').select('category_key, name')
    if (data) setCategoryLabels(Object.fromEntries(data.map(r => [r.category_key, r.name])))
  }

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved && DISPLAY_CATS.includes(saved)) setCat(saved)
    loadCategoryLabels()
  }, [])

  async function renameCategory(key: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setCategoryLabels(prev => ({ ...prev, [key]: trimmed }))
    await supabase.from('annual_goal_category_labels').upsert({ category_key: key, name: trimmed })
  }

  function selectCat(c: string) {
    setCat(c)
    sessionStorage.setItem(SESSION_KEY, c)
  }

  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6 px-0" style={{ background: 'var(--bg-page)', minHeight: '100%' }}>
      {/* 헤더 — 제목(좌) · 영역 세그먼트(중앙, macOS 세그먼트 컨트롤 스타일). 3열 그리드라 제목 길이와 무관하게 세그먼트가 정중앙 */}
      <div className="flex-shrink-0 px-4 md:px-6 mb-5 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3">
        <h1 className="text-lg font-bold" style={{ color: 'rgba(var(--text-rgb),1)', letterSpacing: '-0.01em' }}>연간목표</h1>

        {/* 데스크톱: 높이 0 칸에 세그먼트를 세로 가운데로 띄워, 줄 높이는 항상 제목(h1) 기준 — 화면 너비가 바뀌어도 프로젝트 탭과 아래 위치가 같음 */}
        <div className="min-w-0 overflow-x-auto scrollbar-hide md:overflow-visible md:h-0 md:flex md:items-center md:justify-self-center">
          <div className="inline-flex items-center rounded-[12px]" role="tablist"
            style={{ padding: 4, gap: 2, background: 'rgba(var(--ink-rgb),0.06)', boxShadow: 'inset 0 0 0 0.5px rgba(var(--ink-rgb),0.06)' }}>
            {DISPLAY_CATS.map(c => {
              const active = cat === c
              const dot = CAT_ACTIVE_COLOR[c]
              return (
                <button key={c} role="tab" aria-selected={active} onClick={() => selectCat(c)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] text-[13px] transition-all duration-150 ${active ? '' : 'hover:text-[rgba(var(--text-rgb),0.85)]'}`}
                  style={{
                    padding: '8px 16px',
                    fontWeight: active ? 600 : 500,
                    color: active ? 'rgba(var(--text-rgb),1)' : 'rgba(var(--text-rgb),0.5)',
                    background: active ? 'var(--surface-elevated)' : 'transparent',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(var(--ink-rgb),0.08)' : 'none',
                  }}>
                  {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot.text, opacity: active ? 1 : 0.55 }} />}
                  {c === '전체' ? c : (categoryLabels[c] ?? fallbackLabel(c))}
                </button>
              )
            })}
          </div>
        </div>

        <div className="hidden md:block" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <AnnualRoadmap key={cat} category={cat} allCats={CATS} categoryLabels={categoryLabels} onRenameCategory={renameCategory} />
      </div>
    </div>
  )
}
