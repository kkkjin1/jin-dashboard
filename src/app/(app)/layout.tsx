import Sidebar from '@/components/layout/Sidebar'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'
import MobileMemoSheet from '@/components/memo/MobileMemoSheet'
import GlobalSearch from '@/components/GlobalSearch'
import GlobalEscBlur from '@/components/GlobalEscBlur'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col pb-16 md:pb-0">{children}</main>
      <QuickMemoPanel />
      <MobileMemoSheet />
      <GlobalSearch />
      <GlobalEscBlur />
    </div>
  )
}
