'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MemoTag } from '@/types'

const TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어']
const TAG_COLORS: Record<MemoTag, string> = {
  '공지': 'bg-gray-100 text-gray-500',
  '업무관련': 'bg-emerald-50 text-emerald-700',
  '회의관련': 'bg-blue-50 text-blue-700',
  '아이디어': 'bg-teal-50 text-teal-600',
  '완료': 'bg-gray-100 text-gray-400',
}

export default function MobileMemoSheet() {
  const [visible, setVisible] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    // 모바일(768px 미만)에서만 표시
    if (window.innerWidth < 768) {
      setVisible(true)
      setTimeout(() => titleRef.current?.focus(), 300)
    }
  }, [])

  async function handleSave() {
    if (!title.trim()) { titleRef.current?.focus(); return }
    setSaving(true)
    await supabase
      .from('quick_memos')
      .insert({ title: title.trim(), content: content.trim(), tag })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setVisible(false), 800)
  }

  function handleClose() {
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      {/* 배경 딤 */}
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={handleClose} />

      {/* 바텀시트 */}
      <div className="fixed bottom-0 left-0 right-0 z-[80] bg-white rounded-t-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* 핸들 + 닫기 버튼 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
          <span className="text-sm font-semibold text-gray-700">빠른 메모</span>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg font-light hover:bg-gray-200 transition-colors">
            ×
          </button>
        </div>

        <div className="px-5 pb-6 space-y-3">
          {/* 태그 선택 */}
          <div className="flex gap-2">
            {TAGS.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                  tag === t
                    ? TAG_COLORS[t] + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {/* 제목 */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="메모 제목"
            className="w-full text-base font-medium text-gray-800 placeholder-gray-300 focus:outline-none border-b border-gray-100 pb-2 bg-transparent"
          />

          {/* 내용 (선택) */}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용 (선택)"
            rows={3}
            className="w-full text-sm text-gray-600 placeholder-gray-300 focus:outline-none resize-none bg-transparent"
          />

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={saving || saved || !title.trim()}
            className={`w-full py-3.5 text-white text-sm font-semibold rounded-2xl transition-all active:scale-[0.98] ${
              saved ? 'bg-[#10B981]' : 'bg-[#1C2B3A] disabled:opacity-40'
            }`}>
            {saved ? '✓ 저장됐어요' : saving ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </div>
    </>
  )
}
