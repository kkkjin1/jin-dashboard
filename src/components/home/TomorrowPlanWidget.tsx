'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  journalContent?: string
}

export default function TomorrowPlanWidget({ selectedDate, journalContent }: Props) {
  const isToday = selectedDate === todayStr()

  const [addedFromRef, setAddedFromRef] = useState<Set<string>>(new Set())
  const [manualItems, setManualItems] = useState<string[]>([])
  const [newText, setNewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const refLines = (journalContent ?? '')
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 2 && !/^(오늘|잘된|힘들|내일|focus|Focus)/.test(l))

  async function saveToMemo(text: string): Promise<boolean> {
    const trimmed = text.trim()
    if (!trimmed) return false
    setSaving(true)
    setErrorMsg('')
    const supabase = createClient()
    const { error } = await supabase
      .from('quick_memos')
      .insert({ title: trimmed, content: '', tag: '업무관련' })
    setSaving(false)
    if (error) {
      console.error('TomorrowPlanWidget insert error:', error)
      setErrorMsg(`저장 실패: ${error.message}`)
      return false
    }
    window.dispatchEvent(new Event('quick-memo-saved'))
    return true
  }

  async function addFromRef(line: string) {
    if (addedFromRef.has(line) || saving) return
    const ok = await saveToMemo(line)
    if (ok) setAddedFromRef(prev => new Set([...prev, line]))
  }

  async function handleManualAdd() {
    const trimmed = newText.trim()
    if (!trimmed || saving) return
    const ok = await saveToMemo(trimmed)
    if (ok) {
      setManualItems(prev => [trimmed, ...prev])
      setNewText('')
      inputRef.current?.focus()
    }
  }

  const hasJournal = refLines.length > 0
  const totalAdded = addedFromRef.size + manualItems.length

  return (
    <div className="h-full flex flex-col p-4 font-sans">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#A8C0E0] flex-shrink-0" />
        <h3 className="text-xs font-semibold text-gray-800">내일 계획</h3>
        <span className="text-[11px] text-gray-400 mr-auto">
          {isToday ? '회고 저장 후 연동' : '회고 기반 계획 참조'}
        </span>
        {saving && <span className="text-[9px] text-gray-400">저장 중…</span>}
        {isToday && totalAdded > 0 && !saving && (
          <span className="text-[9px] text-[#1B3A6B]/50">{totalAdded}개 추가됨</span>
        )}
      </div>

      {errorMsg && (
        <div className="flex-shrink-0 mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-500">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1">
        {/* 수동 추가된 항목 (오늘만) */}
        {isToday && manualItems.map((item, i) => (
          <div key={`manual-${i}`} className="flex items-start gap-2 px-2 py-1.5">
            <span className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5 bg-[#A8C0E0]" />
            <span className="flex-1 text-xs leading-relaxed text-gray-600">{item}</span>
            <span className="flex-shrink-0 text-[9px] text-[#1B3A6B]/40">✓</span>
          </div>
        ))}

        {/* 회고 참조 줄 */}
        {!hasJournal && (isToday ? manualItems.length === 0 : true) ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-gray-300 text-center leading-relaxed">
              {isToday
                ? '회고를 작성 · 저장하면\n내용이 여기 표시됩니다'
                : '이 날 회고가 없습니다'
              }
            </p>
          </div>
        ) : hasJournal ? (
          <>
            {isToday && manualItems.length > 0 && (
              <div className="border-t border-gray-100 pt-2 mt-1">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
                  회고 참조
                </p>
              </div>
            )}
            {refLines.map((line, i) => {
              if (!isToday) {
                return (
                  <div key={i} className="flex items-start gap-2 px-2 py-1.5">
                    <span className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5 bg-[#C7D8F0]" />
                    <span className="flex-1 text-xs leading-relaxed text-gray-500">{line}</span>
                  </div>
                )
              }
              const isDone = addedFromRef.has(line)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isDone || saving}
                  onClick={() => addFromRef(line)}
                  className={`group w-full flex items-start gap-2 px-2 py-1.5 rounded-xl text-left transition-colors ${
                    isDone ? 'opacity-40 cursor-default' : 'hover:bg-white/60 cursor-pointer'
                  }`}>
                  <span className={`w-1 h-1 rounded-full flex-shrink-0 mt-1.5 ${isDone ? 'bg-gray-300' : 'bg-[#C7D8F0]'}`} />
                  <span className={`flex-1 text-xs leading-relaxed ${isDone ? 'text-gray-300 line-through' : 'text-gray-600'}`}>
                    {line}
                  </span>
                  {!isDone && (
                    <span className="flex-shrink-0 text-[11px] text-[#1B3A6B]/30 group-hover:text-[#1B3A6B] transition-colors font-semibold opacity-0 group-hover:opacity-100">
                      +
                    </span>
                  )}
                </button>
              )
            })}
          </>
        ) : null}
      </div>

      {isToday && (
        <div className="flex-shrink-0 flex gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
          <input
            ref={inputRef}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleManualAdd() }}
            placeholder="직접 추가 후 Enter"
            disabled={saving}
            className="flex-1 text-xs border border-white/60 bg-white/50 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-300 focus:bg-white/70 transition-all disabled:opacity-50"
          />
          <button
            onClick={handleManualAdd}
            disabled={saving || !newText.trim()}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-white/50 transition-colors disabled:opacity-40">
            +
          </button>
        </div>
      )}
    </div>
  )
}
