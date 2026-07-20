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
    <div className="w-full h-screen overflow-hidden flex" style={{ background: '#13151C' }}>

      {/* ── 데스크톱 사이드바 ── */}
      <div className="hidden md:block flex-shrink-0">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
      </div>

      {/* ── 메인 콘텐츠 ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* 모바일 전용 TopNav */}
        <div className="md:hidden flex-shrink-0">
          <TopNav />
        </div>

        <main className="flex-1 min-h-0 overflow-y-auto scrollbar-hide md:px-8">
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
