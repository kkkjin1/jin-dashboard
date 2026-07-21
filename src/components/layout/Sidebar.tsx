'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Home, ClipboardList, Trophy, MessageSquare, CalendarDays,
  StickyNote, Users, BookOpen, Settings, Brain, ChevronLeft, ChevronRight,
  NotebookPen, LayoutGrid, Target, Archive, LogOut, ChevronDown,
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
  const [userMenuOpen, setUserMenuOpen] = useState(false)
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

  const sidebarW = collapsed ? 'w-[60px]' : 'w-[220px]'

  return (
    <aside
      className={`h-screen flex flex-col overflow-hidden transition-[width] duration-200 ease-out flex-shrink-0 ${sidebarW}`}
      style={{ background: '#1A1B1E', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* ── 헤더 ── */}
      {collapsed ? (
        <div className="flex flex-col items-center py-4 gap-2.5 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
          <div className="w-7 h-7 bg-[#1B3A6B] rounded-lg flex items-center justify-center text-[11px] font-bold text-white">
            인
          </div>
          <button onClick={onToggle}
            className="p-1.5 text-[#5B6270] hover:text-[#E5E7EB] hover:bg-[rgba(255,255,255,0.06)] rounded-md transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <div className="py-4 px-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-[#1B3A6B] rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              인
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#E5E7EB] truncate tracking-tight">인사기획 워크</p>
              <p className="text-[11px] text-[#7B8290] truncate">이그니스 피플본부</p>
            </div>
          </div>
          <button onClick={onToggle}
            className="flex-shrink-0 p-1.5 text-[#5B6270] hover:text-[#E5E7EB] hover:bg-[rgba(255,255,255,0.06)] rounded-md transition-colors">
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* ── 네비게이션 ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label} className={si > 0 ? 'mt-4' : ''}>
            {/* 섹션 라벨 */}
            {!collapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold text-[#5B6270] uppercase tracking-wider">
                {section.label}
              </p>
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
                      className={`flex items-center rounded-xl text-[13px] transition-all duration-200 ease-out ${
                        collapsed ? 'justify-center py-2.5' : 'gap-2.5 px-3 py-2'
                      } ${
                        isActive
                          ? 'surface-nav-active text-[#E5E7EB] font-medium'
                          : 'text-[#7B8290] hover:text-[#E5E7EB]'
                      }`}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <item.icon size={15} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="truncate flex-1">{item.label}</span>
                          {item.key && (
                            <span className={`text-[10px] font-mono ${isActive ? 'text-[rgba(255,255,255,0.25)]' : 'text-[rgba(226,232,240,0.2)]'}`}>
                              {item.key}
                            </span>
                          )}
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

      {/* ── 하단 사용자 프로필 ── */}
      <div className="flex-shrink-0 border-t border-[rgba(255,255,255,0.06)]">
        {collapsed ? (
          <div className="p-2 flex justify-center">
            <button onClick={handleLogout} title="로그아웃"
              className="p-2.5 rounded-lg text-[#5B6270] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#E5E7EB] transition-colors">
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <div className="p-3 relative">
            <button
              onClick={() => setUserMenuOpen(p => !p)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-[#1B3A6B] flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-white">진</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[#E5E7EB] truncate">김진일</p>
                <p className="text-[10px] text-[#7B8290] truncate">인사기획팀 팀장</p>
              </div>
              <ChevronDown
                size={13}
                className={`text-[#7B8290] flex-shrink-0 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* 드롭업 메뉴 */}
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl overflow-hidden z-50"
                  style={{ background: '#26282E', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.06), 0 18px 60px rgba(0,0,0,0.35)' }}>
                  <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
                    <p className="text-[12px] font-semibold text-[#E5E7EB]">김진일</p>
                    <p className="text-[11px] text-[#7B8290]">ji.kim@egnis.kr</p>
                  </div>
                  <div className="py-1">
                    <Link href="/settings" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[rgba(226,232,240,0.7)] hover:bg-[rgba(255,255,255,0.06)] transition-colors">
                      <Settings size={14} strokeWidth={1.75} className="text-[#7B8290]" />
                      설정
                    </Link>
                    <button onClick={() => { setUserMenuOpen(false); handleLogout() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#FC8181] hover:bg-[rgba(252,129,129,0.08)] transition-colors">
                      <LogOut size={14} strokeWidth={1.75} />
                      로그아웃
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
