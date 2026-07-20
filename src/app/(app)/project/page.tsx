'use client'

import { useState, useEffect } from 'react'
import AgendaMatrix from '@/components/meetings/AgendaMatrix'

const DISPLAY_CATS = ['전체', '코어회의록', '비즈회의록', '개인']
const CAT_VALUE: Record<string, string> = {
  '전체': '전체',
  '코어회의록': '코어',
  '비즈회의록': '비즈',
  '개인': '개인',
}
const ALL_CATS_VALUES = ['코어', '비즈', '개인']
const SESSION_KEY = 'project-tab'

export default function ProjectPage() {
  const [cat, setCat] = useState('전체')

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved && DISPLAY_CATS.includes(saved)) setCat(saved)
  }, [])

  function selectCat(c: string) {
    setCat(c)
    sessionStorage.setItem(SESSION_KEY, c)
  }

  const catValue = CAT_VALUE[cat]

  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6 px-0" style={{ background: '#13151C', minHeight: '100%' }}>
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-5 px-4 md:px-6 overflow-x-auto scrollbar-hide">
        <h1 className="text-lg font-bold whitespace-nowrap flex-shrink-0" style={{ color: '#E2E8F0' }}>프로젝트</h1>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {DISPLAY_CATS.map(c => (
            <button key={c} onClick={() => selectCat(c)}
              className="text-xs px-3.5 py-1.5 rounded-full font-semibold transition-all whitespace-nowrap"
              style={cat === c ? {
                background: '#1B3A6B',
                color: '#E2E8F0',
                border: '1px solid #1B3A6B',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              } : {
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: 'rgba(226,232,240,0.5)',
              }}
              onMouseEnter={e => {
                if (cat !== c) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#E2E8F0'
                }
              }}
              onMouseLeave={e => {
                if (cat !== c) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.5)'
                }
              }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 매트릭스 — px 없이 전체 너비 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AgendaMatrix key={catValue} category={catValue} allCats={ALL_CATS_VALUES} />
      </div>
    </div>
  )
}
