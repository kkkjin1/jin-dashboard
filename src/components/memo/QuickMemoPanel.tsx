'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type BtnPos = { right: number; bottom: number }

let _popupCount = 0

function openQuickMemo() {
  _popupCount++
  const cascade = ((_popupCount - 1) % 10) * 30
  const left = window.screenX + window.outerWidth - 480 - cascade
  const top = window.screenY + 80 + cascade
  window.open(
    '/memo/quick',
    `quick-memo-popup-${_popupCount}`,
    `width=440,height=520,left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`,
  )
}

export default function QuickMemoPanel() {
  const [btnPos, setBtnPos] = useState<BtnPos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{
    startX: number; startY: number
    startRight: number; startBottom: number
    moved: boolean
  } | null>(null)
  const latestPos = useRef<BtnPos>({ right: 16, bottom: 24 })
  const wasMovedRef = useRef(false)
  const router = useRouter()

  useEffect(() => {
    try {
      const saved = localStorage.getItem('quick_memo_btn_pos')
      if (saved) {
        const p = JSON.parse(saved) as BtnPos
        setBtnPos(p); latestPos.current = p; return
      }
    } catch {}
    setBtnPos({ right: 16, bottom: 24 })
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        if (e.repeat) return
        e.preventDefault()
        openQuickMemo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        router.push('/project')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    btnRef.current?.setPointerCapture(e.pointerId)
    wasMovedRef.current = false
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startRight: latestPos.current.right, startBottom: latestPos.current.bottom,
      moved: false,
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    dragRef.current.moved = true; wasMovedRef.current = true
    const newPos = {
      right: Math.max(8, Math.min(window.innerWidth - 56, dragRef.current.startRight - dx)),
      bottom: Math.max(8, Math.min(window.innerHeight - 56, dragRef.current.startBottom - dy)),
    }
    latestPos.current = newPos; setBtnPos(newPos)
  }

  function handlePointerUp() {
    if (!dragRef.current) return
    if (dragRef.current.moved) localStorage.setItem('quick_memo_btn_pos', JSON.stringify(latestPos.current))
    dragRef.current = null
  }

  function handleBtnClick() {
    if (wasMovedRef.current) return
    openQuickMemo()
  }

  if (!btnPos) return null

  return (
    <button
      type="button"
      ref={btnRef}
      style={{
        right: btnPos.right,
        bottom: btnPos.bottom,
        background: '#1c2a3c',
        color: 'rgba(230,231,234,0.85)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.32)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleBtnClick}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1f3045' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#1c2a3c' }}
      className="fixed z-[64] w-12 h-12 rounded-full flex items-center justify-center text-xl font-light touch-none select-none cursor-grab active:cursor-grabbing transition-all duration-200 ease-out"
      title="빠른 메모 (Ctrl+3) — 드래그로 위치 이동"
    >
      +
    </button>
  )
}
