'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PlanItem {
  id: string
  text: string
}

interface Props {
  journalContent?: string
}

export default function TomorrowPlanWidget({ journalContent }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState(false)
  const [newText, setNewText] = useState('')
  const [error, setError] = useState('')
  const [recentItems, setRecentItems] = useState<PlanItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const hasContent = !!journalContent?.trim()

  // 최근 추가된 항목 로드 (quick_memos 업무관련 최근 5개)
  useEffect(() => {
    supabase.from('quick_memos')
      .select('id, title')
      .eq('tag', '업무관련')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setRecentItems((data ?? []).map(d => ({ id: d.id, title: d.title })) as unknown as PlanItem[])
      })
  }, [added])

  async function extract() {
    if (!journalContent?.trim()) return
    setExtracting(true)
    setError('')
    setSuggestions([])
    try {
      const res = await fetch('/api/extract-todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalContent }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '오류'); return }
      setSuggestions(json.items ?? [])
    } catch {
      setError('네트워크 오류')
    } finally {
      setExtracting(false)
    }
  }

  async function addItem(text: string) {
    if (!text.trim()) return
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

  const pendingSuggestions = suggestions.filter(s => !added.has(s))

  return (
    <div className="h-full flex flex-col p-4 font-sans">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#A8C0E0] flex-shrink-0" />
        <h3 className="text-sm font-semibold text-gray-800">내일 계획</h3>
        <span className="text-[10px] text-gray-400 mr-auto">회고 기반</span>
        <button
          onClick={extract}
          disabled={!hasContent || extracting}
          title={hasContent ? '회고에서 내일 할일 추출' : '먼저 회고를 저장하세요'}
          className="flex items-center gap-1 text-[10px] font-medium text-[#0F1E36] bg-[#EFF6FF] hover:bg-[#C7D8F0]/50 border border-[#C7D8F0] px-2 py-0.5 rounded-full disabled:opacity-35 disabled:cursor-not-allowed transition-all">
          {extracting ? (
            <><span className="w-2 h-2 border border-[#0F1E36]/30 border-t-[#0F1E36] rounded-full animate-spin" />추출 중</>
          ) : (
            <>✦ AI 추출</>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1.5">

        {error && (
          <p className="text-[10px] text-red-400 px-1">{error}</p>
        )}

        {/* AI 제안 목록 */}
        {pendingSuggestions.length > 0 && (
          <div className="mb-2">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1.5">AI 제안</p>
            <div className="space-y-1">
              {pendingSuggestions.map((s, i) => (
                <div key={i} className="group flex items-start gap-1.5 px-2 py-1.5 rounded-xl bg-[#EFF6FF]/60 border border-[#C7D8F0]/40 hover:bg-[#EFF6FF] transition-colors">
                  <span className="w-1 h-1 rounded-full bg-[#A8C0E0] flex-shrink-0 mt-1.5" />
                  <span className="flex-1 text-xs text-gray-700 leading-relaxed">{s}</span>
                  <button
                    onClick={() => addItem(s)}
                    className="flex-shrink-0 text-[9px] font-semibold text-[#0F1E36] bg-[#C7D8F0]/50 hover:bg-[#C7D8F0] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                    추가 +
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 추가 완료 */}
        {added.size > 0 && (
          <div className="mb-1">
            <p className="text-[9px] font-semibold text-gray-300 uppercase tracking-wider px-1 mb-1">할일 등록됨</p>
            {[...added].map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg">
                <span className="text-[10px] text-gray-300">✓</span>
                <span className="text-xs text-gray-300 line-through leading-relaxed">{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* 빈 상태 */}
        {pendingSuggestions.length === 0 && added.size === 0 && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <p className="text-[10px] text-gray-300 text-center leading-relaxed">
              {hasContent
                ? 'AI 추출 버튼을 눌러\n내일 할일을 뽑아보세요'
                : '회고를 저장하면\nAI가 내일 할일을 제안해줍니다'}
            </p>
          </div>
        )}
      </div>

      {/* 수동 추가 입력 */}
      <div className="flex-shrink-0 flex gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleManualAdd() }}
          placeholder="직접 입력 후 Enter"
          className="flex-1 text-xs border border-white/60 bg-white/50 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-300 focus:bg-white/70 transition-all"
        />
        <button onClick={handleManualAdd} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-white/50 transition-colors">+</button>
      </div>
    </div>
  )
}
