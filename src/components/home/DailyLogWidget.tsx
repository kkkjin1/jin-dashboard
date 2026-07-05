'use client'

import { useEffect, useRef, useState } from 'react'

function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `daily-log-${y}-${m}-${day}`
}

interface Props {
  onDraftReady: (draft: string) => void
  completedTodos?: string[]
  meetings?: string[]
}

export default function DailyLogWidget({ onDraftReady, completedTodos = [], meetings = [] }: Props) {
  const [text, setText] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const key = todayKey()

  useEffect(() => {
    const saved = localStorage.getItem(key)
    if (saved) setText(saved)
  }, [key])

  function handleChange(v: string) {
    setText(v)
    localStorage.setItem(key, v)
    setSent(false)
  }

  async function handleAutoDraft() {
    if (!text.trim()) return
    setDrafting(true)
    setError('')
    setSent(false)
    try {
      const res = await fetch('/api/auto-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawLog: text, date: key.slice(10), completedTodos, meetings }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '오류 발생'); return }
      onDraftReady(json.draft)
      setSent(true)
    } catch {
      setError('네트워크 오류')
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-4 font-sans">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-300 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-gray-800">오늘 일상</h3>
        <span className="text-[10px] text-gray-400 mr-auto">자유롭게 메모</span>
        {text.trim() && (
          <span className="text-[9px] text-gray-300">
            {text.length}자
          </span>
        )}
      </div>

      {/* 텍스트 영역 */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={'회의가 너무 많았다…\n리포트 초안 완성, 방향 변경됨\n팀장님이 A 방식 선호하는 것 확인\n내일 B 건 먼저 처리해야 할 듯'}
        className="flex-1 min-h-0 text-xs text-gray-700 placeholder:text-gray-300 resize-none focus:outline-none leading-relaxed bg-transparent"
      />

      {/* 하단 액션 */}
      <div className="flex-shrink-0 flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100">
        <div className="flex items-center gap-2">
          {error && <span className="text-[10px] text-red-400">{error}</span>}
          {sent && !error && <span className="text-[10px] text-gray-400">회고에 전달됨 ✓</span>}
        </div>
        <button
          onClick={handleAutoDraft}
          disabled={!text.trim() || drafting}
          className="flex items-center gap-1.5 text-[11px] font-medium bg-[#0F1E36] text-white px-3 py-1.5 rounded-full hover:bg-[#162844] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {drafting ? (
            <>
              <span className="w-2.5 h-2.5 border border-white/40 border-t-white rounded-full animate-spin" />
              생성 중…
            </>
          ) : (
            <>회고 초안 생성 →</>
          )}
        </button>
      </div>
    </div>
  )
}
