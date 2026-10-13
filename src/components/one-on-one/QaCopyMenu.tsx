'use client'

import { useEffect, useRef, useState } from 'react'
import { buildQaText, countQuestions, type QaCopyMode } from '@/lib/oneOnOneQa'

const MODES: { mode: QaCopyMode; label: string }[] = [
  { mode: 'q',  label: '질문만' },
  { mode: 'qa', label: '질문 + 답변' },
  { mode: 'a',  label: '답변만' },
]

// 1on1 기록 복사 메뉴 — 질문만 / 질문+답변 / 답변만을 LLM에 붙여넣기 좋은 텍스트로 복사
export default function QaCopyMenu({ getContent, header, compact }: {
  getContent: () => string
  header?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [qCount, setQCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open) setQCount(countQuestions(getContent()))
    setOpen(v => !v)
  }

  async function copy(mode: QaCopyMode, label: string) {
    const text = buildQaText(getContent(), mode, header)
    try {
      await navigator.clipboard.writeText(text)
      setDone(`${label} 복사됨`)
    } catch {
      setDone('복사 실패')
    }
    setOpen(false)
    setTimeout(() => setDone(null), 1500)
  }

  const T2 = 'rgba(var(--text-rgb),0.55)'
  const T3 = 'rgba(var(--text-rgb),0.35)'
  const BORDER = 'rgba(var(--ink-rgb),0.08)'

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button onClick={toggleOpen}
        style={{ fontSize: 11, color: done ? 'var(--accent-badge-text)' : T3, border: compact ? 'none' : `1px solid ${BORDER}`, borderRadius: 8, padding: compact ? '0' : '4px 12px', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {done ?? '복사 ▾'}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 40, minWidth: 168, background: 'var(--bg-page)', border: `1px solid rgba(var(--ink-rgb),0.14)`, borderRadius: 10, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {MODES.map(({ mode, label }) => {
            const disabled = qCount === 0 && mode !== 'qa'
            return (
              <button key={mode} disabled={disabled} onClick={() => copy(mode, label)}
                style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '6px 10px', borderRadius: 6, background: 'transparent', border: 'none', color: disabled ? T3 : T2, cursor: disabled ? 'default' : 'pointer' }}
                onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.06)' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {mode === 'qa' && qCount === 0 ? '전체 내용' : label}
              </button>
            )
          })}
          <p style={{ fontSize: 10, color: T3, padding: '4px 10px 2px', borderTop: `1px solid ${BORDER}`, marginTop: 2 }}>
            {qCount > 0 ? `질문 ${qCount}개 인식` : '질문 표시 없음 — 에디터에서 Ctrl+Alt+Q'}
          </p>
        </div>
      )}
    </div>
  )
}
