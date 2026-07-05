'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  journalContent?: string
}

export default function TomorrowPlanWidget({ journalContent }: Props) {
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [newText, setNewText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // 회고 내용에서 참고용 줄 파싱 (불릿 포함 모든 비어있지 않은 줄)
  const refLines = (journalContent ?? '')
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 2 && !/^(오늘|잘된|힘들|내일|focus|Focus)/.test(l))

  async function addItem(text: string) {
    if (!text.trim() || added.has(text)) return
    await supabase.from('quick_memos').insert({ title: text.trim(), content: '', tag: '업무관련' })
    setAdded(prev => new Set([...prev, text]))
    window.dispatchEvent(new Event('quick-memo-saved'))
  }

  async function handleManualAdd() {
    if (!newText.trim()) return
    await addItem(newText.trim())
    setNewText('')
    inputRef.current?.focus()
  }

  const hasJournal = refLines.length > 0

  return (
    <div className="h-full flex flex-col p-4 font-sans">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#A8C0E0] flex-shrink-0" />
        <h3 className="text-sm font-semibold text-gray-800">내일 계획</h3>
        <span className="text-[10px] text-gray-400">회고 저장 후 연동</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {!hasJournal ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-gray-300 text-center leading-relaxed">
              회고를 작성 · 저장하면<br />내용이 여기 표시됩니다
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              회고 참조 — + 클릭해 할일로 추가
            </p>
            {refLines.map((line, i) => {
              const isDone = added.has(line)
              return (
                <div
                  key={i}
                  className={`group flex items-start gap-2 px-2 py-1.5 rounded-xl transition-colors ${
                    isDone ? 'opacity-40' : 'hover:bg-white/60 cursor-pointer'
                  }`}
                  onClick={() => !isDone && addItem(line)}>
                  <span className={`w-1 h-1 rounded-full flex-shrink-0 mt-1.5 ${isDone ? 'bg-gray-300' : 'bg-[#C7D8F0]'}`} />
                  <span className={`flex-1 text-xs leading-relaxed ${isDone ? 'text-gray-300 line-through' : 'text-gray-600'}`}>
                    {line}
                  </span>
                  {!isDone && (
                    <span className="flex-shrink-0 text-[10px] text-[#0F1E36]/40 group-hover:text-[#0F1E36] transition-colors font-semibold opacity-0 group-hover:opacity-100">
                      +
                    </span>
                  )}
                </div>
              )
            })}

            {added.size > 0 && (
              <p className="text-[9px] text-gray-300 px-2 pt-2">
                {added.size}개 할일로 추가됨 (오늘 할일에 반영)
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleManualAdd() }}
          placeholder="직접 추가 후 Enter"
          className="flex-1 text-xs border border-white/60 bg-white/50 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-300 focus:bg-white/70 transition-all"
        />
        <button
          onClick={handleManualAdd}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-white/50 transition-colors">
          +
        </button>
      </div>
    </div>
  )
}
