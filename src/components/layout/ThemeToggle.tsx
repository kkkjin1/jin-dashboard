'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/theme'

interface ThemeToggleProps {
  size?: number
  iconSize?: number
}

export default function ThemeToggle({ size = 26, iconSize = 14 }: ThemeToggleProps) {
  const [theme, setTheme] = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? '라이트 모드' : '다크 모드'}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      style={{ width: size, height: size, color: 'var(--text-muted)' }}
      className="theme-transition flex items-center justify-center rounded-lg hover:text-[var(--text-hover)] hover:bg-[var(--surface-hover)] flex-shrink-0"
    >
      {isDark ? <Sun size={iconSize} strokeWidth={1.75} /> : <Moon size={iconSize} strokeWidth={1.75} />}
    </button>
  )
}
