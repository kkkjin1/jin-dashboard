import Sidebar from '@/components/layout/Sidebar'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'
import GlobalSearch from '@/components/GlobalSearch'
import GlobalEscBlur from '@/components/GlobalEscBlur'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F8F7F4]">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <QuickMemoPanel />
      <GlobalSearch />
      <GlobalEscBlur />
    </div>
  )
}
