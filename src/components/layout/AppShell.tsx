'use client'

import TopNav from './TopNav'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'
import MobileMemoSheet from '@/components/memo/MobileMemoSheet'
import GlobalSearch from '@/components/GlobalSearch'
import GlobalEscBlur from '@/components/GlobalEscBlur'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col"
      style={{ background: 'linear-gradient(145deg, #F3EDE4 0%, #EAE3D6 45%, #E2D9CA 100%)' }}>
      <TopNav />
      <main className="flex-1 min-h-0 overflow-hidden pb-16 md:pb-0">
        <div className="max-w-[1440px] mx-auto md:px-16 h-full overflow-hidden">
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
