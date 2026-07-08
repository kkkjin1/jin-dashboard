'use client'

import { useState } from 'react'
import AgendaMatrix from '@/components/meetings/AgendaMatrix'

const DISPLAY_CATS = ['전체', '코어회의록', '비즈회의록', '개인']
const CAT_VALUE: Record<string, string> = {
  '전체': '전체',
  '코어회의록': '코어',
  '비즈회의록': '비즈',
  '개인': '개인',
}
const ALL_CATS_VALUES = ['코어', '비즈', '개인']

export default function ProjectPage() {
  const [cat, setCat] = useState('전체')
  const catValue = CAT_VALUE[cat]

  return (
    <div className="flex flex-col h-full min-h-0 pt-4 md:pt-6 px-0">
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-5 px-4 md:px-6">
        <h1 className="text-lg font-bold text-gray-900">프로젝트</h1>
        <div className="flex items-center gap-1.5">
          {DISPLAY_CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`text-xs px-3.5 py-1.5 rounded-full border font-semibold transition-all ${
                cat === c
                  ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                  : 'bg-white/70 border-gray-200 text-gray-500 hover:bg-white hover:text-gray-700'
              }`}>
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
