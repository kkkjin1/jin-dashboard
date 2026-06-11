'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/tasks', label: '업무 목록', icon: '≡' },
  { href: '/schedule', label: '일정', icon: '📅' },
  { href: '/settings', label: '설정', icon: '⚙' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-52 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">인</div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">인사기획 워크</p>
            <p className="text-xs text-gray-400">인사기획팀 · 업무 보드</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3">
        <p className="text-xs text-gray-400 font-medium px-2 mb-2">메뉴</p>
        <ul className="space-y-0.5">
          {navItems.map(item => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-orange-50 text-orange-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
