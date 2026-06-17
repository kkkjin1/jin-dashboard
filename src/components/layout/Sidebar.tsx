'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Home, ClipboardList, Trophy, MessageSquare, CalendarDays, StickyNote, Users, BookOpen, Settings } from 'lucide-react'

const navItems = [
  { href: '/', label: '홈', key: '1', icon: Home },
  { href: '/tasks', label: '업무 목록', key: '2', icon: ClipboardList },
  { href: '/completed', label: '완료 성과', key: '3', icon: Trophy },
  { href: '/meetings', label: '회의록', key: '4', icon: MessageSquare },
  { href: '/schedule', label: '일정', key: '5', icon: CalendarDays },
  { href: '/memos', label: '메모', key: '6', icon: StickyNote },
  { href: '/one-on-one', label: '1on1', key: '7', icon: Users },
  { href: '/learning', label: '학습자료', key: '8', icon: BookOpen },
  { href: '/settings', label: '설정', key: '', icon: Settings },
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
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex w-52 min-h-screen bg-[#18253A] flex-col">
        <div className="py-5 px-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-500 rounded-md flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">인</div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-xs truncate">인사기획 워크</p>
              <p className="text-[10px] text-slate-400 truncate">인사기획팀 · 업무 보드</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2">
          <p className="text-[10px] text-slate-500 font-medium px-1.5 mb-1.5">메뉴</p>
          <ul className="space-y-0.5">
            {navItems.map(item => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link href={item.href}
                    className={`flex items-center gap-2 px-2 py-2.5 rounded-lg text-xs transition-colors ${
                      isActive
                        ? 'bg-emerald-400/[0.18] text-emerald-300 font-medium'
                        : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'
                    }`}>
                    <item.icon size={13} strokeWidth={1.75} className="flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="p-2 border-t border-white/10">
          <button onClick={handleLogout}
            className="w-full text-left px-2 py-2.5 rounded-lg text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors">
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일 하단 네비게이션 */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-[#1C2B3A] border-t border-white/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex overflow-x-auto scrollbar-hide">
          {navItems.map(item => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-[3.5rem] flex-shrink-0 transition-colors ${
                  isActive ? 'text-[#10B981]' : 'text-slate-400'
                }`}>
                <item.icon size={18} strokeWidth={1.75} />
                <span className="text-[9px] whitespace-nowrap">{item.label}</span>
              </Link>
            )
          })}
          <button onClick={handleLogout}
            className="flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-[3.5rem] flex-shrink-0 text-slate-400 hover:text-slate-200 transition-colors">
            <span className="text-base leading-[18px]">↩</span>
            <span className="text-[9px] whitespace-nowrap">로그아웃</span>
          </button>
        </div>
      </nav>
    </>
  )
}
