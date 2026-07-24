'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Home, ClipboardList, Trophy, MessageSquare, CalendarDays,
  StickyNote, Users, BookOpen, Settings, Brain, ChevronLeft, ChevronRight,
  NotebookPen, LayoutGrid, Target, Archive, LogOut,
} from 'lucide-react'

// ─── 고정 섹션 그룹 ──────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: '주요 업무',
    items: [
      { href: '/',           label: '홈',       key: '1', icon: Home },
      { href: '/project',    label: '프로젝트',  key: '2', icon: LayoutGrid },
      { href: '/tasks',      label: '업무 목록', key: '3', icon: ClipboardList },
      { href: '/objectives', label: '목표관리',  key: '',  icon: Target },
      { href: '/completed',  label: '완료 성과', key: '',  icon: Trophy },
    ],
  },
  {
    label: '워크',
    items: [
      { href: '/meetings',   label: '회의록',   key: '4', icon: MessageSquare },
      { href: '/schedule',   label: '일정',     key: '5', icon: CalendarDays },
      { href: '/memos',      label: '메모',     key: '6', icon: StickyNote },
      { href: '/one-on-one', label: '1on1',     key: '7', icon: Users },
    ],
  },
  {
    label: '기타',
    items: [
      { href: '/learning',  label: '학습자료',  key: '8', icon: BookOpen },
      { href: '/decisions', label: '의사결정',  key: '9', icon: Brain },
      { href: '/journal',   label: '회고',      key: '',  icon: NotebookPen },
      { href: '/archive',   label: '아카이브',  key: '',  icon: Archive },
      { href: '/settings',  label: '설정',      key: '',  icon: Settings },
    ],
  },
]

const KEY_ROUTES: Record<string, string> = {
  '1': '/', '2': '/project', '3': '/tasks',
  '4': '/meetings', '5': '/schedule', '6': '/memos',
  '7': '/one-on-one', '8': '/learning', '9': '/decisions',
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return
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

  const sidebarW = collapsed ? 'w-[56px]' : 'w-[240px]'

  return (
    <aside
      className={`h-screen flex flex-col overflow-hidden transition-[width] duration-200 ease-out flex-shrink-0 ${sidebarW}`}
      style={{ background: '#0B0C0F', borderRight: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* ── 헤더 ── */}
      {collapsed ? (
        <div className="flex flex-col items-center py-3 gap-2 border-b border-[rgba(255,255,255,0.07)] flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-[#1C2845] flex items-center justify-center">
            <span className="text-[11px] font-bold text-white">진</span>
          </div>
          <button onClick={onToggle}
            className="p-1 text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.7)] rounded-md transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <div className="py-3 px-4 border-b border-[rgba(255,255,255,0.07)] flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-[#1C2845] flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-white">진</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-[rgba(255,255,255,0.88)] truncate">김진일</p>
            <p className="text-[10.5px] text-[rgba(255,255,255,0.38)] truncate">인사기획팀 팀장</p>
          </div>
          <button onClick={onToggle}
            className="flex-shrink-0 p-1 text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.7)] rounded-md transition-colors">
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* ── 네비게이션 ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label} className={si > 0 ? 'mt-3' : ''}>
            {/* 기타 섹션만 레이블 표시, 나머지는 구분선만 */}
            {!collapsed && si === 2 && (
              <p className="px-3 mb-1 text-[9.5px] font-semibold text-[rgba(255,255,255,0.22)] uppercase tracking-widest">
                기타
              </p>
            )}
            {!collapsed && si === 1 && (
              <div className="mx-3 mb-2 border-t border-[rgba(255,255,255,0.06)]" />
            )}
            {collapsed && si > 0 && (
              <div className="mx-3 mb-2 border-t border-[rgba(255,255,255,0.05)]" />
            )}

            <ul className="space-y-0.5 px-2">
              {section.items.map(item => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <li key={item.href} className="relative group/nav">
                    <Link
                      href={item.href}
                      className={`flex items-center rounded-xl text-[14px] transition-all duration-150 ease-out ${
                        collapsed ? 'justify-center py-2.5 px-2' : 'gap-3 px-3 py-2'
                      } ${isActive ? 'text-[#8DAEE6] font-medium' : 'text-[rgba(255,255,255,0.45)]'}`}
                      style={{ background: isActive ? 'rgba(82,112,210,0.16)' : 'transparent' }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <item.icon size={17} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="truncate flex-1">{item.label}</span>
                        </>
                      )}
                    </Link>
                    {/* 접힌 상태 툴팁 */}
                    {collapsed && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-gray-900/95 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity pointer-events-none z-[100] shadow-lg">
                        {item.label}
                        {item.key && <span className="ml-2 text-gray-400 font-mono">{item.key}</span>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── 하단 ── */}
      <div className="flex-shrink-0 border-t border-[rgba(255,255,255,0.07)] p-2">
        {collapsed ? (
          <button onClick={handleLogout} title="로그아웃"
            className="w-full flex justify-center p-2 rounded-lg text-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.6)] transition-colors">
            <LogOut size={14} strokeWidth={1.75} />
          </button>
        ) : (
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left">
            <LogOut size={14} strokeWidth={1.75} className="text-[rgba(255,255,255,0.3)] flex-shrink-0" />
            <span className="text-[12.5px] text-[rgba(255,255,255,0.42)]">로그아웃</span>
          </button>
        )}
      </div>
    </aside>
  )
}
