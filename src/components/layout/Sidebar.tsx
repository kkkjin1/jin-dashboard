'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Home, ClipboardList, Trophy, MessageSquare, CalendarDays,
  StickyNote, Users, BookOpen, Settings, Brain, ChevronLeft, ChevronRight, NotebookPen, LayoutGrid,
  GripVertical, Eye, EyeOff, X,
} from 'lucide-react'

const ALL_NAV_ITEMS = [
  { href: '/',           label: '홈',       key: '1', icon: Home },
  { href: '/project',    label: '프로젝트',  key: '2', icon: LayoutGrid },
  { href: '/tasks',      label: '업무 목록', key: '3', icon: ClipboardList },
  { href: '/completed',  label: '완료 성과', key: '',  icon: Trophy },
  { href: '/meetings',   label: '회의록',    key: '4', icon: MessageSquare },
  { href: '/schedule',   label: '일정',      key: '5', icon: CalendarDays },
  { href: '/memos',      label: '메모',      key: '6', icon: StickyNote },
  { href: '/one-on-one', label: '1on1',      key: '7', icon: Users },
  { href: '/learning',   label: '학습자료',  key: '8', icon: BookOpen },
  { href: '/decisions',  label: '의사결정',  key: '9', icon: Brain },
  { href: '/journal',    label: '회고',      key: '',  icon: NotebookPen },
  { href: '/settings',   label: '설정',      key: '',  icon: Settings },
]

const KEY_ROUTES: Record<string, string> = {
  '1': '/', '2': '/project', '3': '/tasks',
  '4': '/meetings', '5': '/schedule', '6': '/memos',
  '7': '/one-on-one', '8': '/learning', '9': '/decisions',
}

const NAV_CONFIG_KEY = 'nav_config_v1'

interface NavConfig {
  order: string[]   // href 순서
  hidden: string[]  // 숨긴 href 목록
}

function loadConfig(): NavConfig {
  try {
    const raw = localStorage.getItem(NAV_CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as NavConfig
      // 새 항목이 추가된 경우 order에 없는 항목을 끝에 추가
      const known = new Set(parsed.order)
      const extra = ALL_NAV_ITEMS.map(i => i.href).filter(h => !known.has(h))
      return { order: [...parsed.order, ...extra], hidden: parsed.hidden ?? [] }
    }
  } catch {}
  return { order: ALL_NAV_ITEMS.map(i => i.href), hidden: [] }
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

  const [navConfig, setNavConfig] = useState<NavConfig>({ order: ALL_NAV_ITEMS.map(i => i.href), hidden: [] })
  const [editMode, setEditMode] = useState(false)
  const [dragHref, setDragHref] = useState<string | null>(null)
  const [dragOverHref, setDragOverHref] = useState<string | null>(null)

  useEffect(() => {
    setNavConfig(loadConfig())
  }, [])

  function saveConfig(cfg: NavConfig) {
    setNavConfig(cfg)
    try { localStorage.setItem(NAV_CONFIG_KEY, JSON.stringify(cfg)) } catch {}
  }

  function toggleHidden(href: string) {
    const hidden = navConfig.hidden.includes(href)
      ? navConfig.hidden.filter(h => h !== href)
      : [...navConfig.hidden, href]
    saveConfig({ ...navConfig, hidden })
  }

  function handleDragStart(href: string) { setDragHref(href) }
  function handleDragOver(e: React.DragEvent, href: string) {
    e.preventDefault()
    setDragOverHref(href)
  }
  function handleDrop(targetHref: string) {
    if (!dragHref || dragHref === targetHref) { setDragHref(null); setDragOverHref(null); return }
    const order = [...navConfig.order]
    const fromIdx = order.indexOf(dragHref)
    const toIdx = order.indexOf(targetHref)
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, dragHref)
    saveConfig({ ...navConfig, order })
    setDragHref(null); setDragOverHref(null)
  }

  // 표시 순서대로 정렬된 항목
  const orderedItems = navConfig.order
    .map(href => ALL_NAV_ITEMS.find(i => i.href === href))
    .filter(Boolean) as typeof ALL_NAV_ITEMS

  const visibleItems = orderedItems.filter(i => !navConfig.hidden.includes(i.href))

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
      {/* ── 데스크톱 사이드바 ── */}
      <aside className={`hidden md:flex min-h-screen bg-[#18253A] flex-col overflow-hidden transition-[width] duration-200 ease-in-out flex-shrink-0 ${collapsed ? 'w-16' : 'w-64'}`}>

        {/* 헤더 */}
        {collapsed ? (
          <div className="flex flex-col items-center py-4 gap-2 border-b border-white/10">
            <div className="w-8 h-8 bg-[#BADEC8] rounded-md flex items-center justify-center font-bold text-xs text-[#1A3A2A]">인</div>
            <button onClick={onToggle} title="사이드바 열기"
              className="p-1 text-slate-500 hover:text-slate-200 hover:bg-white/8 rounded-md transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
        ) : (
          <div className="py-4 px-4 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-[#BADEC8] rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0 text-[#1A3A2A]">인</div>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate">인사기획 워크</p>
                <p className="text-xs text-slate-400 truncate">인사기획팀 · 업무 보드</p>
              </div>
            </div>
            <button onClick={onToggle} title="사이드바 닫기"
              className="flex-shrink-0 p-1 text-slate-500 hover:text-slate-200 hover:bg-white/8 rounded-md transition-colors">
              <ChevronLeft size={15} />
            </button>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 p-2.5 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {!collapsed && (
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-xs text-slate-500 font-medium">메뉴</p>
              {!editMode && (
                <button onClick={() => setEditMode(true)}
                  className="text-[10px] text-slate-600 hover:text-slate-300 transition-colors">
                  편집
                </button>
              )}
              {editMode && (
                <button onClick={() => setEditMode(false)}
                  className="text-[10px] text-[#BADEC8] hover:text-white transition-colors flex items-center gap-0.5">
                  <X size={10} /> 완료
                </button>
              )}
            </div>
          )}

          {/* 편집 모드 */}
          {editMode && !collapsed && (
            <ul className="space-y-0.5">
              {orderedItems.map(item => {
                const isHidden = navConfig.hidden.includes(item.href)
                const isDragOver = dragOverHref === item.href
                return (
                  <li key={item.href}
                    draggable
                    onDragStart={() => handleDragStart(item.href)}
                    onDragOver={e => handleDragOver(e, item.href)}
                    onDrop={() => handleDrop(item.href)}
                    onDragEnd={() => { setDragHref(null); setDragOverHref(null) }}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
                      isDragOver ? 'bg-white/15 ring-1 ring-[#BADEC8]/40' : 'hover:bg-white/5'
                    } ${isHidden ? 'opacity-40' : ''}`}>
                    <GripVertical size={12} className="text-slate-600 flex-shrink-0" />
                    <item.icon size={14} strokeWidth={1.75} className={`flex-shrink-0 ${isHidden ? 'text-slate-600' : 'text-slate-400'}`} />
                    <span className={`flex-1 text-xs truncate ${isHidden ? 'text-slate-600 line-through' : 'text-slate-300'}`}>
                      {item.label}
                    </span>
                    <button onClick={() => toggleHidden(item.href)}
                      className="flex-shrink-0 text-slate-500 hover:text-slate-200 transition-colors">
                      {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* 일반 모드 */}
          {!editMode && (
            <ul className="space-y-0.5">
              {visibleItems.map(item => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <li key={item.href} className="relative group/nav">
                    <Link href={item.href}
                      className={`flex items-center rounded-lg text-sm transition-colors ${
                        collapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'
                      } ${
                        isActive
                          ? 'bg-[#BADEC8]/20 text-[#BADEC8] font-medium'
                          : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'
                      }`}>
                      <item.icon size={16} strokeWidth={1.75} className="flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                    {collapsed && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-gray-900/95 text-white text-sm rounded-md whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity pointer-events-none z-[100] shadow-lg">
                        {item.label}
                        {item.key && <span className="ml-1.5 text-gray-400 text-xs">{item.key}</span>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        {/* 하단 로그아웃 */}
        <div className="p-2.5 border-t border-white/10">
          {collapsed ? (
            <button onClick={handleLogout} title="로그아웃"
              className="w-full flex justify-center py-3 rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors text-base">
              ↩
            </button>
          ) : (
            <button onClick={handleLogout}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors">
              로그아웃
            </button>
          )}
        </div>
      </aside>

      {/* ── 모바일 하단 네비게이션 ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-[#1C2B3A] border-t border-white/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex overflow-x-auto scrollbar-hide">
          {visibleItems.map(item => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
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
