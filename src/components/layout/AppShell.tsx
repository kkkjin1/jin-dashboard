'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'
import MobileMemoSheet from '@/components/memo/MobileMemoSheet'
import GlobalSearch from '@/components/GlobalSearch'
import GlobalEscBlur from '@/components/GlobalEscBlur'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="w-full h-screen overflow-hidden flex relative" style={{ background: '#0F1319' }}>
      {/* Ambient Light — neutral white, 2.5%, top-left, 120vw ellipse.
          Users should not consciously notice this. They should only feel depth. */}
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 120vw 65vh at -8% -18%, rgba(255,255,255,0.025), transparent 70%)' }} />

      {/* ── 데스크톱 사이드바 ── */}
      <div className="hidden md:block flex-shrink-0 relative z-10">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      </div>

      {/* ── 메인 콘텐츠 ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative z-10">
        {/* 모바일 전용 TopNav */}
        <div className="md:hidden flex-shrink-0">
          <TopNav />
        </div>

        <main className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-6 pt-5 pb-3">
          {children}
        </main>
      </div>

      <QuickMemoPanel />
      <MobileMemoSheet />
      <GlobalSearch />
      <GlobalEscBlur />
    </div>
  )
}
