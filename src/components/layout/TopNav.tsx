'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Home, ClipboardList, Trophy, MessageSquare, CalendarDays,
  StickyNote, Users, BookOpen, Brain, NotebookPen, Settings,
  ChevronDown, LogOut, MoreHorizontal,
} from 'lucide-react'

const ALL_NAV = [
  { href: '/',           label: '홈',       key: '1', icon: Home },
  { href: '/tasks',      label: '업무',     key: '2', icon: ClipboardList },
  { href: '/completed',  label: '완료',     key: '3', icon: Trophy },
  { href: '/meetings',   label: '회의록',   key: '4', icon: MessageSquare },
  { href: '/schedule',   label: '일정',     key: '5', icon: CalendarDays },
  { href: '/memos',      label: '메모',     key: '6', icon: StickyNote },
  { href: '/one-on-one', label: '1on1',     key: '7', icon: Users },
  { href: '/learning',   label: '학습',     key: '8', icon: BookOpen },
  { href: '/decisions',  label: '의사결정', key: '9', icon: Brain },
  { href: '/journal',    label: '회고',     key: '',  icon: NotebookPen },
  { href: '/settings',   label: '설정',     key: '',  icon: Settings },
]

const PRIMARY_NAV = ALL_NAV.slice(0, 6)
const SECONDARY_NAV = ALL_NAV.slice(6)

const KEY_ROUTES: Record<string, string> = {
  '1': '/', '2': '/tasks', '3': '/completed',
  '4': '/meetings', '5': '/schedule', '6': '/memos',
  '7': '/one-on-one', '8': '/learning', '9': '/decisions',
}

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const routerRef = useRef(router)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isSecondaryActive = SECONDARY_NAV.some(item =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  )

  return (
    <>
      {/* ── 데스크톱 상단 네비바 ── */}
      <header className="hidden md:block h-14 flex-shrink-0 relative z-50">
        <div className="max-w-[1440px] mx-auto px-16 flex items-center h-full gap-4">

          {/* 로고 */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 bg-[#0F1E36] rounded-lg flex items-center justify-center">
              <span className="text-xs font-bold text-white">인</span>
            </div>
            <span className="text-sm font-semibold text-gray-800 tracking-tight">인사기획 워크</span>
          </div>

          {/* 가운데 필 탭 */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-0.5 bg-white/50 backdrop-blur-md rounded-full px-1.5 py-1.5 border border-white/70 shadow-sm">
              {PRIMARY_NAV.map(item => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                    }`}>
                    <item.icon size={12} strokeWidth={1.5} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}

              {/* 더보기 드롭다운 */}
              <div ref={moreRef} className="relative">
                <button
                  onClick={() => setMoreOpen(p => !p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isSecondaryActive
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                  }`}>
                  <MoreHorizontal size={12} strokeWidth={1.5} />
                  <span>더보기</span>
                  <ChevronDown size={9} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreOpen && (
                  <div className="absolute top-full mt-2 right-0 bg-white/90 backdrop-blur-xl border border-white/80 rounded-2xl shadow-xl overflow-hidden min-w-36 py-1.5 z-50">
                    {SECONDARY_NAV.map(item => {
                      const isActive = pathname.startsWith(item.href)
                      return (
                        <Link key={item.href} href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                            isActive
                              ? 'text-gray-900 font-semibold bg-gray-50/80'
                              : 'text-gray-600 hover:bg-gray-50/80 hover:text-gray-900'
                          }`}>
                          <item.icon size={14} strokeWidth={1.5} />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 로그아웃 */}
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-white/50 border border-transparent hover:border-white/60 transition-all flex-shrink-0">
            <LogOut size={12} strokeWidth={1.5} />
            <span>로그아웃</span>
          </button>
        </div>
      </header>

      {/* ── 모바일 상단 헤더 (솔리드 라이트) ── */}
      <header className="md:hidden flex items-center h-12 px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#0F1E36] rounded-md flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">인</span>
          </div>
          <span className="text-sm font-semibold text-stone-800">인사기획 워크</span>
        </div>
      </header>

      {/* ── 모바일 하단 네비 (솔리드 화이트 · 미니멀) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-white border-t border-stone-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex overflow-x-auto scrollbar-hide">
          {ALL_NAV.slice(0, 9).map(item => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-[3.5rem] flex-shrink-0 transition-colors ${
                  isActive ? 'text-stone-900' : 'text-stone-400'
                }`}>
                <item.icon size={18} strokeWidth={1.5} />
                <span className="text-[9px] whitespace-nowrap">{item.label}</span>
              </Link>
            )
          })}
          <button onClick={handleLogout}
            className="flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-[3.5rem] flex-shrink-0 text-stone-400 transition-colors">
            <LogOut size={18} strokeWidth={1.5} />
            <span className="text-[9px] whitespace-nowrap">로그아웃</span>
          </button>
        </div>
      </nav>
    </>
  )
}
