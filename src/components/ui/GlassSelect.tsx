'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface GlassOption {
  value: string
  label: string
  color?: string  // 멤버별 고유 색상 dot
}

interface GlassSelectProps {
  value: string
  onChange: (value: string) => void
  options: GlassOption[]
  placeholder?: string
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
  const selectedColor = selected?.color

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

  useEffect(() => {
    if (!open) return
    function onScroll() { setOpen(false) }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  // inline variant: 담당자 선택 시 해당 멤버 색상으로 pill tint
  const inlineBg = selectedColor
    ? `${selectedColor}26`   // 15% opacity
    : 'rgba(255,255,255,0.06)'
  const inlineBorder = selectedColor
    ? `${selectedColor}55`   // 33% opacity
    : 'rgba(255,255,255,0.1)'

  const triggerClass =
    variant === 'pill'
      ? [
          'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap cursor-pointer select-none',
          isActive
            ? 'bg-[rgba(76,127,224,0.18)] border-[#4C7FE0] text-[rgba(226,232,240,0.9)]'
            : 'bg-[rgba(255,255,255,0.06)] backdrop-blur-xl border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]',
        ].join(' ')
      : 'w-full text-[10px] cursor-pointer select-none px-1 flex items-center justify-center gap-1 transition-colors'

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
      <div
        onClick={e => pick('', e)}
        className={[
          'mx-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors rounded-xl flex items-center gap-2',
          !value
            ? 'bg-[rgba(255,255,255,0.08)] text-[rgba(226,232,240,0.65)]'
            : 'text-[rgba(226,232,240,0.35)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(226,232,240,0.6)]',
        ].join(' ')}
      >
        <span className="w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)] flex-shrink-0" />
        {placeholder === '-' ? '없음' : placeholder}
      </div>
      {options.map(opt => (
        <div
          key={opt.value}
          onClick={e => pick(opt.value, e)}
          className={[
            'mx-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors rounded-xl flex items-center gap-2',
            value === opt.value
              ? 'text-[rgba(226,232,240,0.95)]'
              : 'text-[rgba(226,232,240,0.7)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[rgba(226,232,240,0.9)]',
          ].join(' ')}
          style={value === opt.value && opt.color
            ? { background: `${opt.color}22` }
            : undefined}
        >
          {opt.color && (
            <span style={{ background: opt.color }}
              className="w-2 h-2 rounded-full flex-shrink-0" />
          )}
          {opt.label}
        </div>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div className={`relative ${className}`} onClick={e => e.stopPropagation()}>
      {variant === 'inline' ? (
        <button
          ref={triggerRef}
          type="button"
          className={triggerClass}
          style={{ color: selectedColor ?? 'rgba(226,232,240,0.28)' }}
          onClick={toggle}
        >
          {selectedColor && (
            <span style={{ background: selectedColor }}
              className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
          )}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </button>
      ) : (
        <button ref={triggerRef} type="button" className={triggerClass} onClick={toggle}>
          {selected?.label ?? placeholder}
        </button>
      )}
      {dropdown}
    </div>
  )
}
