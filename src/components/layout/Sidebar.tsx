'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/', label: '홈', icon: '🏠', key: '1' },
  { href: '/tasks', label: '업무 목록', icon: '≡', key: '2' },
  { href: '/completed', label: '완료 성과', icon: '🏆', key: '3' },
  { href: '/meetings', label: '회의록', icon: '💬', key: '4' },
  { href: '/schedule', label: '일정', icon: '📅', key: '5' },
  { href: '/memos', label: '메모', icon: '📝', key: '6' },
  { href: '/one-on-one', label: '1on1', icon: '👤', key: '7' },
  { href: '/learning', label: '학습자료', icon: '📚', key: '8' },
  { href: '/settings', label: '설정', icon: '⚙', key: '' },
]

const KEY_ROUTES: Record<string, string> = {
  '1': '/', '2': '/tasks', '3': '/completed',
  '4': '/meetings', '5': '/schedule', '6': '/memos',
  '7': '/one-on-one', '8': '/learning',
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (e.isComposing) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (target.getAttribute('contenteditable') === 'true') return
      const route = KEY_ROUTES[e.key]
      if (route) { e.preventDefault(); routerRef.current.push(route) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">인</div>
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
                <Link href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <span className="flex items-center gap-2.5">
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </span>
                  {item.key && (
                    <span className="text-xs text-gray-300 font-mono">{item.key}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-3 border-t border-gray-100">
        <p className="text-xs text-gray-300 px-3 mb-1">1-8 페이지이동</p>
        <button onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
          로그아웃
        </button>
      </div>
    </aside>
  )
}
