'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function todayStr() {
  const t = new Date()
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
}

interface Props {
  label: string
  value: string | null
  color: string
  onChange: (v: string | null) => void
}

export function DateCellPicker({ label, value, color, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [viewY, setViewY] = useState(() => value ? +value.slice(0, 4) : new Date().getFullYear())
  const [viewM, setViewM] = useState(() => value ? +value.slice(5, 7) - 1 : new Date().getMonth())
  const triggerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const openPicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
    if (value) { setViewY(+value.slice(0, 4)); setViewM(+value.slice(5, 7) - 1) }
    setOpen(true)
  }, [value])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const firstDow = new Date(viewY, viewM, 1).getDay()
  const today = todayStr()

  function prevMonth() { viewM === 0 ? (setViewY(y => y - 1), setViewM(11)) : setViewM(m => m - 1) }
  function nextMonth() { viewM === 11 ? (setViewY(y => y + 1), setViewM(0)) : setViewM(m => m + 1) }

  function pickDay(day: number, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(toDateStr(viewY, viewM, day))
    setOpen(false)
  }

  const popup = open ? createPortal(
    <div
      ref={popupRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
      className="bg-[rgba(14,17,24,0.98)] backdrop-blur-2xl border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl p-3 select-none"
      onClick={e => e.stopPropagation()}
    >
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <button onClick={e => { e.stopPropagation(); prevMonth() }}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-colors text-sm">
          ‹
        </button>
        <span className="text-xs font-semibold text-[rgba(226,232,240,0.8)] tracking-wide">
          {viewY}년 {viewM + 1}월
        </span>
        <button onClick={e => { e.stopPropagation(); nextMonth() }}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-colors text-sm">
          ›
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-[9px] font-medium py-0.5 ${i === 0 ? 'text-red-400/60' : i === 6 ? 'text-blue-400/60' : 'text-[rgba(226,232,240,0.25)]'}`}>{d}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: firstDow }, (_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const dateStr = toDateStr(viewY, viewM, day)
          const isSelected = dateStr === value
          const isToday = dateStr === today
          const dow = (firstDow + i) % 7
          return (
            <button key={day}
              onClick={e => pickDay(day, e)}
              className={[
                'w-7 h-7 rounded-xl text-[10px] font-medium transition-all flex items-center justify-center',
                isSelected
                  ? 'text-white'
                  : isToday
                  ? 'bg-[rgba(59,130,246,0.18)] text-blue-300 font-semibold'
                  : dow === 0
                  ? 'text-red-400/70 hover:bg-[rgba(255,255,255,0.06)]'
                  : dow === 6
                  ? 'text-blue-400/70 hover:bg-[rgba(255,255,255,0.06)]'
                  : 'text-[rgba(226,232,240,0.65)] hover:bg-[rgba(255,255,255,0.06)]',
              ].join(' ')}
              style={isSelected ? { background: color, opacity: 0.95 } : undefined}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* 오늘 / 초기화 */}
      <div className="mt-2.5 pt-2 border-t border-[rgba(255,255,255,0.06)] flex justify-between">
        <button onClick={e => { e.stopPropagation(); onChange(today); setOpen(false) }}
          className="text-[9px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] transition-colors px-1">
          오늘
        </button>
        {value && (
          <button onClick={e => { e.stopPropagation(); onChange(null); setOpen(false) }}
            className="text-[9px] text-[rgba(226,232,240,0.3)] hover:text-red-400 transition-colors px-1">
            초기화
          </button>
        )}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <div
        ref={triggerRef}
        className="flex items-center gap-1 cursor-pointer w-full group/datecell"
        onClick={openPicker}
      >
        <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(148,163,184,0.7)', flexShrink: 0, width: 10 }}>
          {label}
        </span>
        <span style={{ fontSize: 9, fontWeight: 500, color: value ? color : 'rgba(226,232,240,0.18)', flex: 1 }}>
          {value ? value.slice(5).replace('-', '/') : '—'}
        </span>
        {value && (
          <span
            className="hidden group-hover/datecell:inline text-[8px] text-[rgba(226,232,240,0.25)] hover:text-red-400 cursor-pointer"
            onClick={e => { e.stopPropagation(); onChange(null) }}>
            ×
          </span>
        )}
      </div>
      {popup}
    </>
  )
}
