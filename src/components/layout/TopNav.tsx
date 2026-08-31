'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Home, Trophy, MessageSquare, CalendarDays,
  StickyNote, Users, BookOpen, Brain, NotebookPen, Settings,
  ChevronDown, LogOut, MoreHorizontal, LayoutGrid,
  GripVertical, Eye, EyeOff, X, Compass,
} from 'lucide-react'

const ALL_NAV = [
  { href: '/',            label: '홈',       key: '1', icon: Home },
  { href: '/project',     label: '프로젝트',  key: '2', icon: LayoutGrid },
  { href: '/annual-goals', label: '연간목표', key: '',  icon: Compass },
  { href: '/completed',   label: '완료',     key: '',  icon: Trophy },
  { href: '/meetings',    label: '회의록',   key: '4', icon: MessageSquare },
  { href: '/schedule',    label: '일정',     key: '5', icon: CalendarDays },
  { href: '/memos',       label: '메모',     key: '6', icon: StickyNote },
  { href: '/one-on-one',  label: '1on1',     key: '7', icon: Users },
  { href: '/learning',    label: '학습',     key: '8', icon: BookOpen },
  { href: '/decisions',   label: '의사결정', key: '9', icon: Brain },
  { href: '/journal',     label: '회고',     key: '',  icon: NotebookPen },
  { href: '/settings',    label: '설정',     key: '',  icon: Settings },
]

const NAV_CONFIG_KEY = 'topnav_config_v1'
const PRIMARY_COUNT = 6

interface NavConfig { order: string[]; hidden: string[] }

function loadConfig(): NavConfig {
  try {
    const raw = localStorage.getItem(NAV_CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as NavConfig
      const known = new Set(parsed.order)
      const extra = ALL_NAV.map(i => i.href).filter(h => !known.has(h))
      return { order: [...parsed.order, ...extra], hidden: parsed.hidden ?? [] }
    }
  } catch {}
  return { order: ALL_NAV.map(i => i.href), hidden: [] }
}

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const [navConfig, setNavConfig] = useState<NavConfig>({ order: ALL_NAV.map(i => i.href), hidden: [] })
  const [dragHref, setDragHref] = useState<string | null>(null)
  const [dragOverHref, setDragOverHref] = useState<string | null>(null)

  useEffect(() => { setNavConfig(loadConfig()) }, [])

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
  function handleDragOver(e: React.DragEvent, href: string) { e.preventDefault(); setDragOverHref(href) }
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

  const orderedItems = navConfig.order
    .map(href => ALL_NAV.find(i => i.href === href))
    .filter(Boolean) as typeof ALL_NAV

  const visibleItems = orderedItems.filter(i => !navConfig.hidden.includes(i.href))
  const primaryNav = visibleItems.slice(0, PRIMARY_COUNT)
  const secondaryNav = visibleItems.slice(PRIMARY_COUNT)


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

  const isSecondaryActive = secondaryNav.some(item =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  )

  return (
    <>
      {/* ── 메뉴 편집 모달 ── */}
      {editOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-24">
          <div className="absolute inset-0 bg-black/20" onClick={() => setEditOpen(false)} />
          <div className="relative bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl w-72 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">메뉴 편집</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">상위 {PRIMARY_COUNT}개가 바에 표시됩니다</span>
                <button onClick={() => setEditOpen(false)}
                  className="text-gray-400 hover:text-gray-700 transition-colors"><X size={14} /></button>
              </div>
            </div>
            <ul className="p-2 max-h-[60vh] overflow-y-auto">
              {orderedItems.map((item, idx) => {
                const isHidden = navConfig.hidden.includes(item.href)
                const inPrimary = !isHidden && visibleItems.indexOf(item) < PRIMARY_COUNT
                const isDragOver = dragOverHref === item.href
                return (
                  <li key={item.href}
                    draggable
                    onDragStart={() => handleDragStart(item.href)}
                    onDragOver={e => handleDragOver(e, item.href)}
                    onDrop={() => handleDrop(item.href)}
                    onDragEnd={() => { setDragHref(null); setDragOverHref(null) }}
                    className={`flex items-center gap-2.5 px-2 py-2.5 rounded-xl transition-colors cursor-grab active:cursor-grabbing select-none ${
                      isDragOver ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                    } ${isHidden ? 'opacity-40' : ''}`}>
                    <GripVertical size={13} className="text-gray-300 flex-shrink-0" />
                    <item.icon size={14} strokeWidth={1.5} className={`flex-shrink-0 ${isHidden ? 'text-gray-300' : 'text-gray-500'}`} />
                    <span className={`flex-1 text-sm ${isHidden ? 'text-gray-300 line-through' : 'text-gray-700'}`}>
                      {item.label}
                    </span>
                    {inPrimary && !isHidden && (
                      <span className="text-[9px] text-[#4C7FE0] bg-[rgba(76,127,224,0.1)] border border-[rgba(76,127,224,0.25)] px-1.5 py-0.5 rounded-full font-medium">바</span>
                    )}
                    <button onClick={() => toggleHidden(item.href)}
                      className="flex-shrink-0 text-gray-300 hover:text-gray-600 transition-colors p-0.5">
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="px-4 py-2.5 border-t border-gray-100 text-[10px] text-gray-400">
              드래그로 순서 변경 · Eye 아이콘으로 숨기기
            </div>
          </div>
        </div>
      )}

      {/* ── 데스크톱 상단 네비바 (사이드바로 대체됨) ── */}
      <header className="hidden h-14 flex-shrink-0 relative z-50">
        <div className="max-w-[1440px] mx-auto px-16 flex items-center h-full gap-4">

          {/* 로고 */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 bg-[#4C7FE0] rounded-lg flex items-center justify-center">
              <span className="text-xs font-bold text-white">인</span>
            </div>
            <span className="text-sm font-semibold text-gray-800 tracking-tight">인사기획 워크</span>
          </div>

          {/* 가운데 필 탭 */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-0.5 px-1.5 py-1.5 border bg-[rgba(255,255,255,0.75)] backdrop-blur-[20px] border-[rgba(255,255,255,0.45)] rounded-[20px] shadow-[0_2px_24px_rgba(0,0,0,0.06)]">
              {primaryNav.map(item => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-[#4C7FE0] text-white shadow-sm'
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
                      ? 'bg-[#4C7FE0] text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                  }`}>
                  <MoreHorizontal size={12} strokeWidth={1.5} />
                  <span>더보기</span>
                  <ChevronDown size={9} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreOpen && (
                  <div className="absolute top-full mt-2 right-0 bg-[rgba(255,255,255,0.88)] backdrop-blur-[20px] border border-[rgba(255,255,255,0.45)] rounded-[16px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden min-w-36 py-1.5 z-50">
                    {secondaryNav.map(item => {
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
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button onClick={() => { setMoreOpen(false); setEditOpen(true) }}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50/80 hover:text-gray-700 transition-colors w-full text-left">
                        <Settings size={14} strokeWidth={1.5} />
                        <span>메뉴 편집</span>
                      </button>
                    </div>
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

      {/* ── 모바일 상단 헤더 ── */}
      <header className="md:hidden flex items-center h-12 px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#4C7FE0] rounded-md flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">인</span>
          </div>
          <span className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>인사기획 워크</span>
        </div>
      </header>

      {/* ── 모바일 하단 네비 ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[60]"
        style={{ background: '#161B24', borderTop: '1px solid rgba(255,255,255,0.07)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex overflow-x-auto scrollbar-hide">
          {visibleItems.slice(0, 9).map(item => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className="flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-[3.5rem] flex-shrink-0 transition-colors"
                style={{ color: isActive ? '#9DBEF5' : '#7B8397' }}>
                <item.icon size={18} strokeWidth={1.5} />
                <span className="text-[9px] whitespace-nowrap">{item.label}</span>
              </Link>
            )
          })}
          <button onClick={handleLogout}
            className="flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-[3.5rem] flex-shrink-0 transition-colors"
            style={{ color: '#7B8397' }}>
            <LogOut size={18} strokeWidth={1.5} />
            <span className="text-[9px] whitespace-nowrap">로그아웃</span>
          </button>
        </div>
      </nav>
    </>
  )
}
