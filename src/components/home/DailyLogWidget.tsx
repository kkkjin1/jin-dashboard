'use client'

import { useEffect, useRef, useState } from 'react'

function localDateStr(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function todayStr() {
  return localDateStr(new Date())
}

interface Props {
  selectedDate: string
  onDraftReady: (draft: string) => void
}

export default function DailyLogWidget({ selectedDate, onDraftReady }: Props) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const storageKey = `daily-log-${selectedDate}`
  const isToday = selectedDate === todayStr()

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    setText(saved ?? '')
    setSent(false)
  }, [storageKey])

  function handleChange(v: string) {
    if (!isToday) return
    setText(v)
    localStorage.setItem(storageKey, v)
    setSent(false)
  }

  function handleSend() {
    if (!text.trim()) return
    onDraftReady(text.trim())
    setSent(true)
  }

  return (
    <div className="h-full flex flex-col p-4 font-sans">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-300 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-gray-800">오늘 일상</h3>
        <span className="text-[10px] text-gray-400 mr-auto">자유롭게 메모</span>
        {text.trim() && <span className="text-[9px] text-gray-300">{text.length}자</span>}
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => handleChange(e.target.value)}
        readOnly={!isToday}
        placeholder={isToday
          ? '회의가 너무 많았다…\n리포트 초안 완성했음\n팀장님이 A 방식 선호\n내일 B 건 먼저 처리해야 할 듯'
          : '이 날 기록 없음'
        }
        className={`flex-1 min-h-0 text-xs placeholder:text-gray-300 resize-none focus:outline-none leading-relaxed bg-transparent ${
          isToday ? 'text-gray-700' : 'text-gray-500 cursor-default'
        }`}
      />

      {isToday && (
        <div className="flex-shrink-0 flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100">
          <span className="text-[10px] text-gray-300">
            {sent ? '회고로 전달됨 ✓' : '작성 후 회고로 보내기'}
          </span>
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="text-[11px] font-medium bg-[#1B3A6B] text-white px-3 py-1.5 rounded-full hover:bg-[#1F4070] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            → 회고로 전달
          </button>
        </div>
      )}
    </div>
  )
}
