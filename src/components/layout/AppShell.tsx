'use client'

import TopNav from './TopNav'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'
import MobileMemoSheet from '@/components/memo/MobileMemoSheet'
import GlobalSearch from '@/components/GlobalSearch'
import GlobalEscBlur from '@/components/GlobalEscBlur'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#F4F3EF] md:bg-gradient-to-br md:from-[#FAF9F5] md:via-[#FFFBF0] md:to-[#F3EAD8]">
      <TopNav />
      <main className="flex-1 min-h-0 overflow-hidden pb-28 md:pb-0">
        <div className="max-w-[1440px] mx-auto px-4 md:px-16 h-full overflow-hidden">
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
