'use client'
import { useState, useRef, useEffect } from 'react'

export interface GlassOption {
  value: string
  label: string
}

interface GlassSelectProps {
  value: string
  onChange: (value: string) => void
  options: GlassOption[]
  placeholder?: string
  /** 'pill' = 스케줄 필터바용 pill 버튼, 'inline' = AgendaMatrix 셀 인라인용 */
  variant?: 'pill' | 'inline'
  /** pill variant에서 값이 선택된 경우 파란 하이라이트 */
  activeWhenFilled?: boolean
  className?: string
  onClickCapture?: (e: React.MouseEvent) => void
}

export function GlassSelect({
  value,
  onChange,
  options,
  placeholder = '선택',
  variant = 'inline',
  activeWhenFilled = false,
  className = '',
  onClickCapture,
}: GlassSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)
  const isActive = activeWhenFilled && !!value

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    onClickCapture?.(e)
    setOpen(o => !o)
  }

  function pick(v: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(v)
    setOpen(false)
  }

  const triggerClass =
    variant === 'pill'
      ? `text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap cursor-pointer select-none
         ${isActive
           ? 'bg-[rgba(76,127,224,0.18)] border-[#4C7FE0] text-[rgba(226,232,240,0.9)]'
           : 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]'
         }`
      : `w-full text-xs rounded-full border transition-all truncate cursor-pointer select-none px-2.5 py-0.5 text-left
         ${value
           ? 'bg-[rgba(76,127,224,0.15)] border-[rgba(76,127,224,0.3)] text-[rgba(226,232,240,0.85)]'
           : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)] text-[rgba(226,232,240,0.4)] hover:border-[rgba(255,255,255,0.2)]'
         }`

  return (
    <div ref={ref} className={`relative ${className}`} onClick={e => e.stopPropagation()}>
      <button type="button" className={triggerClass} onClick={toggle}>
        {selected?.label ?? placeholder}
      </button>

      {open && (
        <div
          className="absolute z-[9999] mt-1.5 left-0 min-w-[7rem] bg-[rgba(18,21,28,0.97)] backdrop-blur-2xl border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl overflow-hidden py-1.5"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}
        >
          <div
            onClick={e => pick('', e)}
            className={`px-3.5 py-1.5 text-xs cursor-pointer transition-colors rounded-lg mx-1 ${
              !value
                ? 'bg-[rgba(255,255,255,0.08)] text-[rgba(226,232,240,0.7)]'
                : 'text-[rgba(226,232,240,0.35)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.6)]'
            }`}
          >
            {placeholder}
          </div>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={e => pick(opt.value, e)}
              className={`px-3.5 py-1.5 text-xs cursor-pointer transition-colors rounded-lg mx-1 ${
                value === opt.value
                  ? 'bg-[rgba(76,127,224,0.25)] text-[rgba(226,232,240,0.95)]'
                  : 'text-[rgba(226,232,240,0.7)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[rgba(226,232,240,0.9)]'
              }`}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
