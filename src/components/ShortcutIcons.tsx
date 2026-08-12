'use client'

import { useState } from 'react'
import { CalendarDays, Mail } from 'lucide-react'

const TEXT2 = '#98A1B2'

type TooltipSide = 'top' | 'bottom' | 'right'

function tooltipPosStyle(side: TooltipSide): React.CSSProperties {
  if (side === 'right') return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 8 }
  if (side === 'top') return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 7 }
  return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 7 }
}

function ShortcutButton({ href, label, color, tint, size = 30, tooltipSide = 'bottom', children }: {
  href: string; label: string; color: string; tint?: boolean; size?: number; tooltipSide?: TooltipSide; children: React.ReactNode
}) {
  const [h, setH] = useState(false)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: 'relative',
        width: size, height: size, borderRadius: size >= 30 ? 9 : 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
        background: tint ? (h ? 'rgba(91,126,196,0.18)' : 'rgba(91,126,196,0.10)') : (h ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)'),
        border: `1px solid ${tint ? (h ? 'rgba(91,126,196,0.5)' : 'rgba(91,126,196,0.35)') : (h ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)')}`,
        transform: h ? 'translateY(-1px)' : 'none',
        transition: 'all 150ms ease',
        textDecoration: 'none',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {children}
      {h && (
        <span style={{
          position: 'absolute',
          ...tooltipPosStyle(tooltipSide),
          fontSize: 10.5, fontWeight: 500, color: TEXT2, background: '#1C2129',
          border: '1px solid rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: 6,
          whiteSpace: 'nowrap', zIndex: 30, pointerEvents: 'none',
        }}>
          {label}
        </span>
      )}
    </a>
  )
}

function ShortcutGlyph({ letter, size = 15 }: { letter: string; size?: number }) {
  const small = letter.length > 1
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <text x="12" y={small ? 15.5 : 16} textAnchor="middle" fontSize={small ? 8.5 : 11} fontWeight={800} fill="currentColor" stroke="none" fontFamily="Georgia, serif">{letter}</text>
    </svg>
  )
}

export default function ShortcutIcons({ size = 30, tooltipSide = 'bottom' }: { size?: number; tooltipSide?: TooltipSide }) {
  const iconSize = Math.round(size * 0.5)
  return (
    <>
      <ShortcutButton href="https://hrm-ashy.vercel.app/" label="HRM 대시보드" color="#8DAEE6" tint size={size} tooltipSide={tooltipSide}>
        <img src="/icons/hrm-icon.png" alt="HRM" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: size >= 30 ? 8 : 7 }} />
      </ShortcutButton>
      <ShortcutButton href="https://mail.google.com/mail/u/0/" label="Gmail" color="#E0574A" size={size} tooltipSide={tooltipSide}>
        <Mail size={iconSize} strokeWidth={1.8} />
      </ShortcutButton>
      <ShortcutButton href="https://calendar.google.com/calendar/u/0/r" label="구글 캘린더" color="#4C8DF0" size={size} tooltipSide={tooltipSide}>
        <CalendarDays size={iconSize} strokeWidth={1.8} />
      </ShortcutButton>
      <ShortcutButton href="https://app.notion.com/p/egnis/1de08b93608a80d897c8fb9c68e94828" label="Notion" color="#ECECEA" size={size} tooltipSide={tooltipSide}>
        <ShortcutGlyph letter="N" size={iconSize} />
      </ShortcutButton>
      <ShortcutButton href="https://erp.egnis.kr" label="ERP10" color="#D9A054" size={size} tooltipSide={tooltipSide}>
        <ShortcutGlyph letter="10" size={iconSize} />
      </ShortcutButton>
      <ShortcutButton href="https://www.docswave.com/app" label="닥스웨이브" color="#9B8FE0" size={size} tooltipSide={tooltipSide}>
        <ShortcutGlyph letter="D" size={iconSize} />
      </ShortcutButton>
    </>
  )
}
