'use client'

import { useState } from 'react'
import AgendaMatrix from '@/components/meetings/AgendaMatrix'

const CATS = ['전체', '코어', '비즈', '개인']

export default function ProjectPage() {
  const [cat, setCat] = useState('전체')

  return (
    <div className="flex flex-col h-full min-h-0 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-5">
        <h1 className="text-lg font-bold text-gray-900">프로젝트</h1>
        <div className="flex items-center gap-1.5">
          {CATS.map(c => (
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

      {/* 매트릭스 */}
      <div className="flex-1 min-h-0">
        <AgendaMatrix key={cat} category={cat} allCats={CATS.slice(1)} />
      </div>
    </div>
  )
}
