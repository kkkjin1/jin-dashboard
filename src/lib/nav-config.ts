// ─── 전역 네비게이션 canonical source ─────────────────────────────────────────
// Desktop Sidebar, Mobile TopNav(BottomNav), Settings 메뉴 편집 UI가 모두 이 파일의
// NAV_ITEMS를 참조한다. 라우트/라벨/아이콘의 "정의"만 여기서 통합하고, 사용자별
// order/hidden 상태(dashboard_menu_order·dashboard_hidden_menus·topnav_config_v1)는
// 각 화면이 기존 그대로 별도로 보관한다 — 이 파일은 그 상태들이 참조할 "완전한 메뉴 목록"만
// 보장한다. 새 라우트는 여기 한 곳에만 추가하면 Desktop/Mobile 양쪽에 자동 반영된다.
import {
  Home, Trophy, MessageSquare, CalendarDays,
  StickyNote, Users, BookOpen, Settings, Brain, NotebookPen,
  LayoutGrid, Target, Compass, PenTool, FlaskConical, ClipboardList,
  type LucideIcon,
} from 'lucide-react'

export type NavSectionKey = 'main' | 'work' | 'etc'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  key: string // 데스크톱 사이드바 접힘 툴팁에 표시되는 단축키 라벨(장식용, 키 입력 바인딩은 위치 기반)
  section: NavSectionKey
  /** 사용자가 숨기거나 순서를 뺄 수 없는 필수 메뉴 (홈, 설정) */
  pinned?: boolean
}

export const NAV_SECTION_LABELS: Record<NavSectionKey, string> = {
  main: '주요 업무',
  work: '워크',
  etc: '기타',
}

// 순서 = 기존 Sidebar.tsx NAV_SECTIONS와 동일(섹션 내 순서 100% 보존) → Desktop 시각 회귀 없음
export const NAV_ITEMS: NavItem[] = [
  { href: '/',                 label: '홈',        key: '1', icon: Home,           section: 'main', pinned: true },
  { href: '/project',          label: '프로젝트',    key: '2', icon: LayoutGrid,     section: 'main' },
  { href: '/annual-goals',     label: '연간목표',    key: '',  icon: Compass,        section: 'main' },
  { href: '/test-practice',    label: '테스트실무',   key: '',  icon: FlaskConical,   section: 'main' },
  { href: '/work-report',      label: '업무보고',    key: '',  icon: ClipboardList,  section: 'main' },
  { href: '/objective-review', label: '목표리뷰',    key: '',  icon: Target,         section: 'main' },
  { href: '/completed',        label: '완료 성과',   key: '',  icon: Trophy,         section: 'main' },
  { href: '/perf-review',      label: '성과회고',    key: '',  icon: Trophy,         section: 'main' },
  { href: '/meetings',         label: '회의록',      key: '4', icon: MessageSquare,  section: 'work' },
  { href: '/schedule',         label: '일정',        key: '5', icon: CalendarDays,   section: 'work' },
  { href: '/memos',            label: '메모',        key: '6', icon: StickyNote,     section: 'work' },
  { href: '/one-on-one',       label: '1on1',        key: '7', icon: Users,          section: 'work' },
  { href: '/sketch',           label: '생각스케치',   key: '',  icon: PenTool,        section: 'work' },
  { href: '/learning',         label: '학습자료',    key: '8', icon: BookOpen,       section: 'etc' },
  { href: '/decisions',        label: '의사결정',    key: '9', icon: Brain,          section: 'etc' },
  { href: '/journal',          label: '회고',        key: '',  icon: NotebookPen,    section: 'etc' },
  { href: '/settings',         label: '설정',        key: '',  icon: Settings,       section: 'etc', pinned: true },
]

export const NAV_HREFS: string[] = NAV_ITEMS.map(i => i.href)

export function findNavItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find(i => i.href === href)
}

/** Desktop Sidebar가 그대로 렌더링하는 섹션 구조 — 기존 NAV_SECTIONS와 항목/순서 동일 */
export const NAV_SECTIONS: { label: string; key: NavSectionKey; items: NavItem[] }[] =
  (['main', 'work', 'etc'] as NavSectionKey[]).map(key => ({
    key,
    label: NAV_SECTION_LABELS[key],
    items: NAV_ITEMS.filter(i => i.section === key),
  }))
