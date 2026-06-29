'use client'

import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'
import MobileMemoSheet from '@/components/memo/MobileMemoSheet'
import GlobalSearch from '@/components/GlobalSearch'
import GlobalEscBlur from '@/components/GlobalEscBlur'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('sidebar_collapsed') === 'true')
    } catch { /* ignore */ }
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar_collapsed', String(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 min-w-0">
        <div className="flex flex-col h-full max-w-[1440px] w-full mx-auto min-w-0">
          {children}
        </div>
      </main>
      <QuickMemoPanel />
      <MobileMemoSheet />
      <GlobalSearch />
      <GlobalEscBlur />
    </div>
  )
}
