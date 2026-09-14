'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'dashboard_theme'
const THEME_EVENT = 'theme-change'

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {}
  return 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme) } catch {}
  applyTheme(theme)
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }))

  // user_preferences 배경 동기화 — 실패해도 테마 전환 자체는 이미 끝난 뒤이므로 영향 없음
  try {
    const supabase = createClient()
    supabase.from('user_preferences').upsert({ key: 'theme', value: theme }).then(
      () => {},
      () => {}
    )
  } catch {}
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  // 항상 'dark'로 시작 — RootLayout의 부트스트랩 스크립트가 하이드레이션 전에
  // <html data-theme>를 이미 올바른 값으로 바꿔놓았더라도, 이 state의 첫 렌더는
  // 서버 렌더와 반드시 일치해야 hydration mismatch가 나지 않는다. 실제 값은
  // 마운트 직후 effect에서만 반영한다(= Sidebar 등 기존 localStorage 동기화 패턴과 동일).
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    setThemeState(getStoredTheme())

    function onThemeEvent(e: Event) {
      const detail = (e as CustomEvent<Theme>).detail
      if (detail === 'light' || detail === 'dark') setThemeState(detail)
    }
    function onStorage(e: StorageEvent) {
      if (e.key === THEME_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue)
      }
    }

    window.addEventListener(THEME_EVENT, onThemeEvent)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeEvent)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return [theme, setTheme]
}
