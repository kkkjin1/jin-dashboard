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
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6 px-0" style={{ background: '#0F1319', minHeight: '100%' }}>
      {/* 헤더 */}
      <div className="flex-shrink-0 mb-3 px-4 md:px-6">
        <h1 className="text-lg font-bold" style={{ color: '#E2E8F0' }}>연간목표</h1>
      </div>

      {/* 범주 탭 — 본문 상단에 위치, 클릭 시 아래 컨텐츠가 바로 연동되어 필터링됨 */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 md:px-6 mb-4 overflow-x-auto scrollbar-hide" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
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
              color: 'rgba(226,232,240,0.45)',
              borderRadius: 8,
              padding: '5px 14px',
            }}
            onMouseEnter={e => { if (cat !== c) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.8)' }}
            onMouseLeave={e => { if (cat !== c) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.45)' }}>
            {c === '전체' ? c : (categoryLabels[c] ?? fallbackLabel(c))}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <AnnualRoadmap key={cat} category={cat} allCats={CATS} categoryLabels={categoryLabels} onRenameCategory={renameCategory} />
      </div>
    </div>
  )
}
