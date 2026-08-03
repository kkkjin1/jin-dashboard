'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface GlassOption {
  value: string
  label: string
}

interface GlassSelectProps {
  value: string
  onChange: (value: string) => void
  options: GlassOption[]
  placeholder?: string
  /** 'pill' = 스케줄 필터바용, 'inline' = AgendaMatrix 셀 인라인용 */
  variant?: 'pill' | 'inline'
  activeWhenFilled?: boolean
  className?: string
}

export function GlassSelect({
  value,
  onChange,
  options,
  placeholder = '-',
  variant = 'inline',
  activeWhenFilled = false,
  className = '',
}: GlassSelectProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)
  const isActive = activeWhenFilled && !!value

  // 드롭다운 위치 계산
  function calcPos() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 120) })
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open) calcPos()
    setOpen(o => !o)
  }

  function pick(v: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(v)
    setOpen(false)
  }

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 스크롤 시 닫기
  useEffect(() => {
    if (!open) return
    function onScroll() { setOpen(false) }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  const triggerClass =
    variant === 'pill'
      ? [
          'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap cursor-pointer select-none',
          isActive
            ? 'bg-[rgba(76,127,224,0.18)] border-[#4C7FE0] text-[rgba(226,232,240,0.9)]'
            : 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]',
        ].join(' ')
      : [
          'w-full text-xs rounded-full border transition-all cursor-pointer select-none px-2.5 py-0.5 text-center',
          value
            ? 'bg-[rgba(76,127,224,0.15)] border-[rgba(76,127,224,0.3)] text-[rgba(226,232,240,0.85)]'
            : 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)] text-[rgba(226,232,240,0.4)] hover:border-[rgba(255,255,255,0.2)]',
        ].join(' ')

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: pos.width,
        zIndex: 99999,
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
      }}
      className="bg-[rgba(18,21,28,0.97)] backdrop-blur-2xl border border-[rgba(255,255,255,0.12)] rounded-2xl py-1.5"
      onClick={e => e.stopPropagation()}
    >
      {/* 초기화 옵션 */}
      <div
        onClick={e => pick('', e)}
        className={[
          'mx-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors rounded-xl',
          !value
            ? 'bg-[rgba(255,255,255,0.08)] text-[rgba(226,232,240,0.65)]'
            : 'text-[rgba(226,232,240,0.35)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.6)]',
        ].join(' ')}
      >
        {placeholder === '-' ? '—' : placeholder}
      </div>
      {options.map(opt => (
        <div
          key={opt.value}
          onClick={e => pick(opt.value, e)}
          className={[
            'mx-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors rounded-xl',
            value === opt.value
              ? 'bg-[rgba(76,127,224,0.25)] text-[rgba(226,232,240,0.95)]'
              : 'text-[rgba(226,232,240,0.7)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[rgba(226,232,240,0.9)]',
          ].join(' ')}
        >
          {opt.label}
        </div>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div className={`relative ${className}`} onClick={e => e.stopPropagation()}>
      <button ref={triggerRef} type="button" className={triggerClass} onClick={toggle}>
        {selected?.label ?? placeholder}
      </button>
      {dropdown}
    </div>
  )
}
