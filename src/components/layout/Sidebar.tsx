'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Home, ClipboardList, Trophy, MessageSquare, CalendarDays,
  StickyNote, Users, BookOpen, Settings, Brain, ChevronLeft, ChevronRight,
  NotebookPen, LayoutGrid, Target, Archive, LogOut, Compass, PenTool,
} from 'lucide-react'

// ─── 고정 섹션 그룹 ──────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: '주요 업무',
    items: [
      { href: '/',           label: '홈',       key: '1', icon: Home },
      { href: '/project',    label: '프로젝트',  key: '2', icon: LayoutGrid },
      { href: '/annual-goals', label: '연간목표', key: '', icon: Compass },
      { href: '/tasks',      label: '업무 목록', key: '3', icon: ClipboardList },
      { href: '/objectives', label: '목표관리',  key: '',  icon: Target },
      { href: '/objective-review', label: '목표리뷰', key: '', icon: Target },
      { href: '/completed',       label: '완료 성과',       key: '',  icon: Trophy },
      { href: '/perf-review', label: '성과회고',   key: '',  icon: Trophy },
    ],
  },
  {
    label: '워크',
    items: [
      { href: '/meetings',   label: '회의록',   key: '4', icon: MessageSquare },
      { href: '/schedule',   label: '일정',     key: '5', icon: CalendarDays },
      { href: '/memos',      label: '메모',     key: '6', icon: StickyNote },
      { href: '/one-on-one', label: '1on1',     key: '7', icon: Users },
      { href: '/sketch',     label: '생각스케치', key: '',  icon: PenTool },
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

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  const [hiddenMenus, setHiddenMenus] = useState<string[]>([])
  const [menuOrder, setMenuOrder] = useState<string[]>([])
  const [teamName, setTeamName] = useState('인사기획팀')

  useEffect(() => {
    const allHrefs = NAV_SECTIONS.flatMap(s => s.items.map(i => i.href))

    function loadFromLocal() {
      const hidden = localStorage.getItem('dashboard_hidden_menus')
      if (hidden) { try { setHiddenMenus(JSON.parse(hidden)) } catch {} }
      const name = localStorage.getItem('dashboard_team_name')
      if (name) setTeamName(name)
      const order = localStorage.getItem('dashboard_menu_order')
      if (order) { try { setMenuOrder(JSON.parse(order)) } catch {} }
    }

    async function syncFromDB() {
      const supabase = createClient()
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('key, value')
        .in('key', ['menu_order', 'hidden_menus'])
      for (const pref of prefs ?? []) {
        if (pref.key === 'hidden_menus' && Array.isArray(pref.value)) {
          setHiddenMenus(pref.value as string[])
          localStorage.setItem('dashboard_hidden_menus', JSON.stringify(pref.value))
        }
        if (pref.key === 'menu_order' && Array.isArray(pref.value)) {
          const full = [...pref.value as string[], ...allHrefs.filter(h => !(pref.value as string[]).includes(h))]
          setMenuOrder(full)
          localStorage.setItem('dashboard_menu_order', JSON.stringify(full))
        }
      }
    }

    loadFromLocal()
    syncFromDB()

    window.addEventListener('nav-visibility-change', loadFromLocal)
    window.addEventListener('team-name-change', loadFromLocal)
    window.addEventListener('nav-order-change', loadFromLocal)
    return () => {
      window.removeEventListener('nav-visibility-change', loadFromLocal)
      window.removeEventListener('team-name-change', loadFromLocal)
      window.removeEventListener('nav-order-change', loadFromLocal)
    }
  }, [])

  // 모든 아이템 flat 목록 (NAV_SECTIONS 유지)
  const allItems = NAV_SECTIONS.flatMap(s => s.items)

  // 커스텀 순서 있으면 적용, 없으면 원래 섹션 구조 유지
  const visibleSections = menuOrder.length > 0
    ? (() => {
        const ordered = menuOrder
          .map(href => allItems.find(i => i.href === href))
          .filter(Boolean) as typeof allItems
        // 순서에 없는 아이템도 포함
        const seen = new Set(menuOrder)
        allItems.forEach(i => { if (!seen.has(i.href)) ordered.push(i) })
        const visible = ordered.filter(i => !hiddenMenus.includes(i.href))
        return visible.length > 0 ? [{ label: '', items: visible }] : []
      })()
    : NAV_SECTIONS.map(section => ({
        ...section,
        items: section.items.filter(item => !hiddenMenus.includes(item.href)),
      })).filter(section => section.items.length > 0)

  const visibleItemsRef = useRef(visibleSections.flatMap(s => s.items))
  useEffect(() => { visibleItemsRef.current = visibleSections.flatMap(s => s.items) }, [visibleSections])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (target.getAttribute('contenteditable') === 'true') return
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx <= 8) {
        const item = visibleItemsRef.current[idx]
        if (item) { e.preventDefault(); routerRef.current.push(item.href) }
      }
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
      style={{ background: '#161B24', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* ── 헤더 ── */}
      {collapsed ? (
        <div className="flex flex-col items-center py-3 gap-2 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-[#1F2A44] flex items-center justify-center">
            <span className="text-[11px] font-bold text-white">진</span>
          </div>
          <button onClick={onToggle}
            className="p-1 text-[#7B8397] hover:text-[rgba(255,255,255,0.7)] rounded-md transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <div className="py-3 px-4 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-[#1F2A44] flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-white">진</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-[#E7EAF0] truncate">김진일</p>
            <p className="text-[10.5px] text-[#98A1B2] truncate">{teamName} 팀장</p>
          </div>
          <button onClick={onToggle}
            className="flex-shrink-0 p-1 text-[#7B8397] hover:text-[rgba(255,255,255,0.7)] rounded-md transition-colors">
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* ── 네비게이션 ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3">
        {visibleSections.map((section, si) => (
          <div key={section.label || `section-${si}`} className={si > 0 ? 'mt-3' : ''}>
            {/* 기타 섹션만 레이블 표시, 나머지는 구분선만 */}
            {!collapsed && section.label === '기타' && (
              <p className="px-3 mb-1 text-[9.5px] font-semibold text-[#7B8397] uppercase tracking-widest">
                기타
              </p>
            )}
            {!collapsed && section.label === '워크' && (
              <div className="mx-3 mb-2 border-t border-[rgba(255,255,255,0.06)]" />
            )}
            {collapsed && si > 0 && (
              <div className="mx-3 mb-2 border-t border-[rgba(255,255,255,0.06)]" />
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
                      } ${isActive ? 'text-[#9DBEF5] font-medium' : 'text-[#98A1B2]'}`}
                      style={{ background: isActive ? 'rgba(76,127,224,0.16)' : 'transparent' }}
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
            className="w-full flex justify-center p-2 rounded-lg text-[#7B8397] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.6)] transition-colors">
            <LogOut size={14} strokeWidth={1.75} />
          </button>
        ) : (
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left">
            <LogOut size={14} strokeWidth={1.75} className="text-[#7B8397] flex-shrink-0" />
            <span className="text-[12.5px] text-[#98A1B2]">로그아웃</span>
          </button>
        )}
      </div>
    </aside>
  )
}
