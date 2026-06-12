import Sidebar from '@/components/layout/Sidebar'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'
import GlobalSearch from '@/components/GlobalSearch'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <QuickMemoPanel />
      <GlobalSearch />
    </div>
  )
}
