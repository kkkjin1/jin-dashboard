import Sidebar from '@/components/layout/Sidebar'
import QuickMemoPanel from '@/components/memo/QuickMemoPanel'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <QuickMemoPanel />
    </div>
  )
}
