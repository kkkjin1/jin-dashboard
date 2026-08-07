'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AnnualGoalItem, AnnualGoalTask, Member, AgreedPriority } from '@/types'
import { GlassSelect } from '@/components/ui/GlassSelect'
import { DateCellPicker } from '@/components/ui/MiniDatePicker'
import { MONTH_KO, periodToDateRange, monthToDateRange, getWeekColumnsBetween, overlapsRange, type PeriodKey } from '@/lib/dateGrid'
import { Compass, UserPlus, Users, ClipboardCheck, Coins, GraduationCap, Network, Scale, MessageCircle, Server, ArrowUpDown, ChevronsUpDown, type LucideIcon } from 'lucide-react'

// ── 상수 ────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = { active: '진행필요', hold: '진행중', done: '진행완료' }
const MEMBER_COLORS = ['#3B82F6','#10B981','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#EF4444','#84CC16','#F97316','#A78BFA']

// 카테고리 pill 배지 전용 파스텔 톤 (bg/text) — 안건/세부task 행 옆의 작은 배지에만 사용
const CATEGORY_BADGE: Record<string, { bg: string; text: string }> = {
  '1. 인재 확보':   { bg: '#C7D5E3', text: '#3F5670' },
  '2. 검증과 정렬': { bg: '#C7D9CE', text: '#46654F' },
  '3. 유지와 보상': { bg: '#DAC4B8', text: '#7A4C38' },
  '4. 지속가능성':  { bg: '#DAC2CB', text: '#7A4658' },
  '5. 확장 기반':   { bg: '#D3CEC2', text: '#5C5749' },
}
function categoryBadge(cat: string) { return CATEGORY_BADGE[cat] ?? { bg: '#D1D5DB', text: '#374151' } }

// 카테고리 "섹션 타이틀 행" 전용 — 개별 안건/세부task 행에는 쓰지 않음 (그 행들은 중립색으로 통일)
const CATEGORY_SECTION_COLOR: Record<string, { bg: string; text: string }> = {
  '1. 인재 확보':   { bg: '#C7D5E3', text: '#3F5670' },
  '2. 검증과 정렬': { bg: '#DCEAE1', text: '#4F7160' },
  '3. 유지와 보상': { bg: '#F3DED4', text: '#8B5A44' },
  '4. 지속가능성':  { bg: '#F1DCE4', text: '#8A5468' },
  '5. 확장 기반':   { bg: '#E8E4DC', text: '#6B665A' },
}
function categorySectionColor(cat: string) { return CATEGORY_SECTION_COLOR[cat] ?? { bg: '#E5E7EB', text: '#374151' } }
// 카테고리 표시용 라벨 — 저장/조회에 쓰는 원본 값('1. 인재 확보')에서 번호 prefix만 제거해 표시("인재 확보")
function catLabel(cat: string) { return cat.replace(/^\d+\.\s*/, '') }

// 안건/세부task 행 공통 중립 톤 (카테고리와 무관하게 통일)
const NEUTRAL_TEXT = '#E5E7EB'
const NEUTRAL_ACCENT = '#4C7FE0'

// 안건 행 우측 컬럼(분류/기한/진행률) 폭 — 카드의 컬럼 라벨 서브행과 실제 안건 행이 이 값을 공유해 항상 같이 정렬됨
const ITEM_ROW_COLS = { category: 88, deadline: 78, progress: 40 } as const

// 상태(중요도/시급도) 배지 파스텔 톤 (bg/text)
const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  상: { bg: '#E4C2C2', text: '#8B3B3B' },
  중: { bg: '#E6D3A8', text: '#83611F' },
  하: { bg: '#C7DBB9', text: '#446631' },
}

// HRM 기능 관점 (엑셀 1B.기능뷰 시트 기준 F1~F10) — 세부task의 hrm_function 값 그대로 사용
const HRM_FUNCTIONS = [
  'F1. 인사기획·HR전략', 'F2. 채용·확보', 'F3. 인력운영·유지', 'F4. 평가·성과관리', 'F5. 보상',
  'F6. 교육·육성', 'F7. 조직·직무설계', 'F8. 노무·ER', 'F9. 조직문화·커뮤니케이션', 'F10. HR운영·시스템',
]
const HRM_FUNCTION_SHORT: Record<string, string> = {
  'F1. 인사기획·HR전략': '인사기획', 'F2. 채용·확보': '채용', 'F3. 인력운영·유지': '인력운영', 'F4. 평가·성과관리': '평가',
  'F5. 보상': '보상', 'F6. 교육·육성': '교육', 'F7. 조직·직무설계': '조직설계', 'F8. 노무·ER': '노무',
  'F9. 조직문화·커뮤니케이션': '조직문화', 'F10. HR운영·시스템': '시스템',
}
function hrmFunctionShort(fn: string): string { return HRM_FUNCTION_SHORT[fn] ?? fn }
function hrmFunctionLabel(fn: string): string { return fn.replace(/^F\d+\.\s*/, '') }
// 기능뷰: 색 대신 성격을 나타내는 아이콘으로 구분 (Tabler outline 대체 — lucide-react 기존 의존성 재사용)
const HRM_FUNCTION_ICON: Record<string, LucideIcon> = {
  'F1. 인사기획·HR전략': Compass,
  'F2. 채용·확보': UserPlus,
  'F3. 인력운영·유지': Users,
  'F4. 평가·성과관리': ClipboardCheck,
  'F5. 보상': Coins,
  'F6. 교육·육성': GraduationCap,
  'F7. 조직·직무설계': Network,
  'F8. 노무·ER': Scale,
  'F9. 조직문화·커뮤니케이션': MessageCircle,
  'F10. HR운영·시스템': Server,
}
function hrmFunctionIcon(fn: string): LucideIcon { return HRM_FUNCTION_ICON[fn] ?? Server }

function taskProgress(itemTasks: AnnualGoalTask[]): { done: number; total: number; pct: number } {
  const total = itemTasks.length
  const done = itemTasks.filter(t => t.status === 'done').length
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}
function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
function ddayLabel(dateStr: string): string {
  const d = daysUntil(dateStr)
  if (d === 0) return 'D-Day'
  return d > 0 ? `D-${d}` : `D+${-d}`
}

const PRIORITY_OPTIONS: { value: AgreedPriority; label: string; color: string }[] = [
  { value: '1순위', label: '1순위', color: '#3B82F6' },
  { value: '2순위', label: '2순위', color: '#8B5CF6' },
  { value: '유예',   label: '유예',   color: '#6B7280' },
]

const PRIORITY_RANK: Record<string, number> = { '1순위': 0, '2순위': 1, '유예': 2 }
const IMPORTANCE_RANK: Record<string, number> = { '상': 0, '중': 1, '하': 2 }
const TRACK_RANK: Record<string, number> = { A: 0, B: 1, C: 2 }

// 트랙 dot 전용 포인트 컬러 — 카테고리색과 별개, 세부task 행 좌측에 트랙을 한눈에 구분하는 용도
const TRACK_DOT_COLOR: Record<string, string> = { A: '#378ADD', B: '#639922', C: '#9CA3AF' }

function rank(v: string | null | undefined, table: Record<string, number>): number {
  return v != null ? (table[v] ?? 99) : 99
}
function priorityComparator(a: AnnualGoalTask, b: AnnualGoalTask): number {
  return (
    rank(a.agreed_priority, PRIORITY_RANK)   - rank(b.agreed_priority, PRIORITY_RANK) ||
    rank(a.exec_importance, IMPORTANCE_RANK) - rank(b.exec_importance, IMPORTANCE_RANK) ||
    rank(a.track, TRACK_RANK)                - rank(b.track, TRACK_RANK) ||
    rank(a.hr_importance, IMPORTANCE_RANK)   - rank(b.hr_importance, IMPORTANCE_RANK) ||
    rank(a.hr_urgency, IMPORTANCE_RANK)      - rank(b.hr_urgency, IMPORTANCE_RANK) ||
    a.sort_order - b.sort_order
  )
}

const S = { bd: '1px solid rgba(255,255,255,0.08)', bdL: '1px solid rgba(255,255,255,0.14)', bg: '#13151C', t1: '#E2E8F0', t2: 'rgba(226,232,240,0.7)', t3: 'rgba(226,232,240,0.4)' }
const W_ITEM = 130  // 로드맵: 안건 열 너비
const W_TASK = 280  // 로드맵: 세부task 열 너비 (제목 잘림 완화를 위해 확장)
const W_LEFT = W_ITEM + W_TASK

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${alpha})`
}

// hexA를 비율 t만큼, hexB를 (1-t)만큼 섞은 완전 불투명 solid hex를 반환 — opacity 블렌딩(다크 배경과 섞여 탁해짐) 없이 옅은 톤을 만들 때 사용
function mixHex(hexA: string, hexB: string, t: number) {
  const a = [parseInt(hexA.slice(1,3),16), parseInt(hexA.slice(3,5),16), parseInt(hexA.slice(5,7),16)]
  const b = [parseInt(hexB.slice(1,3),16), parseInt(hexB.slice(3,5),16), parseInt(hexB.slice(5,7),16)]
  const mix = a.map((v, i) => Math.round(v * t + b[i] * (1 - t)))
  return `#${mix.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// 로드맵 바 전용 — 안건(상위) 레벨 트랙 색: 카테고리 계열 안에서 세부task 트랙(CATEGORY_SECTION_COLOR.bg)보다 진하고 쨍한 solid 톤
const CATEGORY_TRACK_UPPER: Record<string, string> = {
  '1. 인재 확보':   '#6B8FB3',
  '2. 검증과 정렬': '#7BAE94',
  '3. 유지와 보상': '#D9A484',
  '4. 지속가능성':  '#CE87A0',
  '5. 확장 기반':   '#B0A890',
}
function categoryTrackUpper(cat: string) { return CATEGORY_TRACK_UPPER[cat] ?? '#9CA3AF' }

// ── 원형 진행률 링 ────────────────────────────────────────────────
function ProgressRing({ pct, color, size = 22 }: { pct: number; color: string; size?: number }) {
  const stroke = 2.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} title={`${pct}%`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .2s' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.32, fontWeight: 700, color: S.t2 }}>
        {pct}
      </span>
    </div>
  )
}
function formatSchedule(task: AnnualGoalTask, unit: 'week' | 'month'): string {
  if (task.roadmap_start_date && task.roadmap_end_date) {
    if (unit === 'month') {
      const sm = Number(task.roadmap_start_date.slice(5, 7))
      const em = Number(task.roadmap_end_date.slice(5, 7))
      return sm === em ? `${sm}월` : `${sm}월~${em}월`
    }
    const sd = task.roadmap_start_date.slice(5).replace('-', '/')
    const ed = task.roadmap_end_date.slice(5).replace('-', '/')
    return sd === ed ? sd : `${sd}~${ed}`
  }
  return task.suggested_period ?? ''
}

// ── 드래그 소스 추적 (모듈 레벨 — React state/dataTransfer 우회, AgendaMatrix와 동일 패턴) ──
let _dragItemId: string | null = null
let _dragTaskId: string | null = null

type ZoomState =
  | { level: 'year' }
  | { level: 'week'; rangeStart: string; rangeEnd: string; headerLabel: string; month?: number }

export default function AnnualRoadmap({ category, allCats, categoryLabels, onRenameCategory }: { category: string; allCats: string[]; categoryLabels: Record<string, string>; onRenameCategory: (key: string, name: string) => void }) {
  const supabase = createClient()
  const router = useRouter()

  // 카테고리 표시 이름 — DB에 저장된 편집 가능한 이름이 있으면 그걸, 없으면 번호 prefix만 제거한 원본 값을 사용
  function displayCat(cat: string) { return categoryLabels[cat] ?? catLabel(cat) }

  const [items, setItems] = useState<AnnualGoalItem[]>([])
  const [tasks, setTasks] = useState<AnnualGoalTask[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const [editingCatKey, setEditingCatKey] = useState<string | null>(null)
  const [editCatVal, setEditCatVal] = useState('')
  function startEditCat(cat: string) { setEditingCatKey(cat); setEditCatVal(displayCat(cat)) }
  function commitEditCat() {
    if (editingCatKey) onRenameCategory(editingCatKey, editCatVal)
    setEditingCatKey(null)
  }

  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [showDoneItems, setShowDoneItems] = useState<Set<string>>(new Set())
  function toggleShowDone(itemId: string) {
    setShowDoneItems(prev => { const s = new Set(prev); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return s })
  }

  const [addingItem, setAddingItem] = useState(false)
  const [newIName, setNewIName] = useState('')
  const [newICat, setNewICat] = useState<string>(category === '전체' ? allCats[0] : category)

  const [addingTask, setAddingTask] = useState<string | null>(null)
  const [newTTitle, setNewTTitle] = useState('')

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editIName, setEditIName] = useState('')
  const [deletingItem, setDeletingItem] = useState<string | null>(null)

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTTitle, setEditTTitle] = useState('')
  const [deletingTask, setDeletingTask] = useState<string | null>(null)

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [dndErr, setDndErr] = useState('')

  const [viewMode, setViewMode] = useState<'list' | 'roadmap' | 'function'>('list')
  const [yearNav, setYearNav] = useState(() => new Date().getFullYear())
  const [zoom, setZoom] = useState<ZoomState>({ level: 'year' })
  const [prioritySort, setPrioritySort] = useState(false)
  const [scheduleUnit, setScheduleUnit] = useState<'week' | 'month'>('month')
  const [pickerTaskId, setPickerTaskId] = useState<string | null>(null)
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null)

  const isAll = category === '전체'

  const memberColors = useMemo(() =>
    Object.fromEntries(members.map((m, i) => [m.id, MEMBER_COLORS[i % MEMBER_COLORS.length]])),
  [members])

  // ── 데이터 로드 ──────────────────────────────────────────────────
  useEffect(() => { load() }, [category])

  async function load() {
    setLoading(true)
    const iQuery = supabase.from('annual_goal_items').select('*').order('sort_order')
    const { data: iData } = isAll ? await iQuery : await iQuery.eq('category', category)
    const fetchedItems = (iData ?? []) as AnnualGoalItem[]
    setItems(fetchedItems)
    setOpenItems(new Set())

    if (fetchedItems.length > 0) {
      const { data: tData } = await supabase.from('annual_goal_tasks').select('*').in('item_id', fetchedItems.map(i => i.id)).order('sort_order')
      setTasks((tData ?? []) as AnnualGoalTask[])
    } else { setTasks([]) }

    const { data: memberListData } = await supabase.from('members').select('id, name').is('archived_at', null).order('name')
    setMembers((memberListData ?? []) as Member[])

    setLoading(false)
  }

  // ── 열림상태 토글 (안건 id 또는 기능뷰의 기능 키 — 기능 키는 DB에 저장하지 않음) ──
  function toggleOpenKey(key: string, persist: boolean) {
    const isOpen = openItems.has(key)
    setOpenItems(prev => { const s = new Set(prev); isOpen ? s.delete(key) : s.add(key); return s })
    if (persist) supabase.from('annual_goal_items').update({ is_open: !isOpen }).eq('id', key)
  }
  // ── 안건(중분류) 토글/CRUD ───────────────────────────────────────
  async function toggleItem(id: string) {
    toggleOpenKey(id, true)
  }
  function openAddItem() { setNewICat(isAll ? allCats[0] : category); setNewIName(''); setAddingItem(true) }
  async function addItem() {
    const title = newIName.trim(); if (!title) { setAddingItem(false); return }
    const { data, error } = await supabase.from('annual_goal_items').insert({ category: newICat, title, sort_order: items.length, is_open: true }).select().single()
    if (!error && data) { setItems(p => [...p, data as AnnualGoalItem]); setOpenItems(p => new Set([...p, (data as AnnualGoalItem).id])) }
    setNewIName(''); setAddingItem(false)
  }
  async function deleteItem(itemId: string) {
    await supabase.from('annual_goal_items').delete().eq('id', itemId)
    setItems(p => p.filter(i => i.id !== itemId)); setTasks(p => p.filter(t => t.item_id !== itemId)); setDeletingItem(null)
  }
  async function updateItem(itemId: string) {
    const title = editIName.trim(); if (!title) { setEditingItemId(null); return }
    await supabase.from('annual_goal_items').update({ title }).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, title } : i)); setEditingItemId(null)
  }
  async function updateItemDeadline(itemId: string, date: string | null) {
    await supabase.from('annual_goal_items').update({ target_deadline: date }).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, target_deadline: date } : i))
  }
  // ── 세부task(소분류) CRUD ────────────────────────────────────────
  function toggleExpandTaskAdd(itemId: string) { setAddingTask(prev => prev === itemId ? null : itemId); setNewTTitle('') }
  async function addTask(itemId: string) {
    const title = newTTitle.trim(); if (!title) { setAddingTask(null); return }
    const { data, error } = await supabase.from('annual_goal_tasks').insert({ item_id: itemId, title, status: 'active', sort_order: tasks.filter(t => t.item_id === itemId).length }).select().single()
    if (!error && data) setTasks(p => [...p, data as AnnualGoalTask])
    setNewTTitle(''); setAddingTask(null)
  }
  async function deleteTask(taskId: string) {
    await supabase.from('annual_goal_tasks').delete().eq('id', taskId)
    setTasks(p => p.filter(t => t.id !== taskId)); setDeletingTask(null)
  }
  async function updateTask(taskId: string) {
    const title = editTTitle.trim(); if (!title) { setEditingTaskId(null); return }
    await supabase.from('annual_goal_tasks').update({ title }).eq('id', taskId)
    setTasks(p => p.map(t => t.id === taskId ? { ...t, title } : t)); setEditingTaskId(null)
  }
  async function cycleTaskStatus(task: AnnualGoalTask) {
    const order: AnnualGoalTask['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(task.status) + 1) % order.length]
    await supabase.from('annual_goal_tasks').update({ status: next }).eq('id', task.id)
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: next } : t))
  }
  async function updateTaskAssignee(taskId: string, assigneeId: string | null) {
    await supabase.from('annual_goal_tasks').update({ assignee_id: assigneeId }).eq('id', taskId)
    setTasks(p => p.map(t => t.id === taskId ? { ...t, assignee_id: assigneeId } : t))
  }
  async function updateAgreedPriority(taskId: string, v: AgreedPriority | null) {
    await supabase.from('annual_goal_tasks').update({ agreed_priority: v }).eq('id', taskId)
    setTasks(p => p.map(t => t.id === taskId ? { ...t, agreed_priority: v } : t))
  }
  async function updateTaskRoadmapRange(taskId: string, start: string | null, end: string | null) {
    await supabase.from('annual_goal_tasks').update({ roadmap_start_date: start, roadmap_end_date: end }).eq('id', taskId)
    setTasks(p => p.map(t => t.id === taskId ? { ...t, roadmap_start_date: start, roadmap_end_date: end } : t))
  }
  // ── 드래그 재정렬 ────────────────────────────────────────────────
  async function reorderItem(dragId: string, targetId: string) {
    const draggedItem = items.find(i => i.id === dragId)
    if (!draggedItem) return
    const catItems = items.filter(i => i.category === draggedItem.category).sort((a,b) => a.sort_order - b.sort_order)
    const dragIdx = catItems.findIndex(i => i.id === dragId)
    const targetIdx = catItems.findIndex(i => i.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...catItems]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setItems(p => p.map(item => { const idx = newOrder.findIndex(i => i.id === item.id); return idx >= 0 ? { ...item, sort_order: idx } : item }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('annual_goal_items').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`안건 순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }
  async function reorderTask(dragId: string, targetId: string) {
    const draggedTask = tasks.find(t => t.id === dragId)
    if (!draggedTask) return
    const itemTasks = tasks.filter(t => t.item_id === draggedTask.item_id).sort((a,b) => a.sort_order - b.sort_order)
    const dragIdx = itemTasks.findIndex(t => t.id === dragId)
    const targetIdx = itemTasks.findIndex(t => t.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...itemTasks]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setTasks(p => p.map(t => { const idx = newOrder.findIndex(x => x.id === t.id); return idx >= 0 ? { ...t, sort_order: idx } : t }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('annual_goal_tasks').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`세부task 순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }

  if (loading) return <div className="flex items-center justify-center h-32 text-sm text-gray-400 animate-pulse">불러오는 중…</div>

  // 로드맵의 "주" 버튼 — 이번 달 주 단위 화면으로 바로 진입 (연간 헤더의 월 클릭과 동일한 동작)
  function zoomToThisMonth() {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth() + 1
    if (y !== yearNav) setYearNav(y)
    const r = monthToDateRange(y, m)
    setZoom({ level: 'week', rangeStart: r.start, rangeEnd: r.end, headerLabel: `${y}년 ${MONTH_KO[m - 1]}`, month: m })
  }
  // 주 단위 화면에서 직전월/다음월로 이동 (월 단위로 줌한 경우에만 사용 가능)
  function shiftZoomMonth(delta: number) {
    if (zoom.level !== 'week' || zoom.month == null) return
    let m = zoom.month + delta
    let y = yearNav
    if (m < 1) { m = 12; y -= 1 } else if (m > 12) { m = 1; y += 1 }
    if (y !== yearNav) setYearNav(y)
    const r = monthToDateRange(y, m)
    setZoom({ level: 'week', rangeStart: r.start, rangeEnd: r.end, headerLabel: `${y}년 ${MONTH_KO[m - 1]}`, month: m })
  }

  // ── 세그먼트 컨트롤 공용 스타일 (트랙 + 활성 pill, 테두리 없음) ──────
  function segmentTrack(children: React.ReactNode) {
    return <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.04)' }}>{children}</div>
  }
  function segmentBtn(active: boolean, onClick: () => void, label: React.ReactNode) {
    return (
      <button onClick={onClick}
        className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${active ? 'text-[#E2E8F0]' : 'text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]'}`}
        style={{ background: active ? 'rgba(255,255,255,0.1)' : 'transparent' }}>
        {label}
      </button>
    )
  }

  // ── 뷰 토글 헤더 ─────────────────────────────────────────────────
  const viewToggle = (
    <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 pb-3 flex-wrap">
      {/* 왼쪽: 뷰 전환 + 로드맵 기간 네비게이션 */}
      <div className="flex items-center gap-3 flex-wrap">
        {segmentTrack(<>
          {segmentBtn(viewMode === 'list', () => setViewMode('list'), '목록')}
          {segmentBtn(viewMode === 'roadmap', () => { setViewMode('roadmap'); setZoom({ level: 'year' }) }, '로드맵')}
          {segmentBtn(viewMode === 'function', () => setViewMode('function'), '기능')}
        </>)}
        {viewMode === 'roadmap' && zoom.level === 'year' && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setYearNav(p => p - 1)} className="text-[rgba(226,232,240,0.4)] hover:text-[#E2E8F0] text-base px-1 leading-none">‹</button>
            <span className="text-sm font-semibold text-[rgba(226,232,240,0.7)] w-16 text-center">{yearNav}년</span>
            <button onClick={() => setYearNav(p => p + 1)} className="text-[rgba(226,232,240,0.4)] hover:text-[#E2E8F0] text-base px-1 leading-none">›</button>
          </div>
        )}
        {viewMode === 'roadmap' && zoom.level === 'week' && (
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom({ level: 'year' })}
              className="text-xs px-3 py-1 rounded-full font-medium text-[#93C5FD]" style={{ background: 'rgba(255,255,255,0.06)' }}>
              ◀ 연간으로 · {zoom.headerLabel}
            </button>
            {zoom.month != null && (
              <>
                <button onClick={() => shiftZoomMonth(-1)} title="직전월" className="text-[rgba(226,232,240,0.4)] hover:text-[#E2E8F0] text-base px-1.5 leading-none">‹</button>
                <button onClick={() => shiftZoomMonth(1)} title="다음월" className="text-[rgba(226,232,240,0.4)] hover:text-[#E2E8F0] text-base px-1.5 leading-none">›</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 오른쪽: 정렬 + 보기단위 + 펼치기 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setPrioritySort(p => !p)}
          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium transition-all ${prioritySort ? 'text-[#E2E8F0]' : 'text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]'}`}
          style={{ background: prioritySort ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)' }}>
          <ArrowUpDown size={12} />
          우선순위순 정렬
        </button>
        {(viewMode === 'list' || viewMode === 'function') && segmentTrack(<>
          {segmentBtn(scheduleUnit === 'month', () => setScheduleUnit('month'), '월')}
          {segmentBtn(scheduleUnit === 'week', () => setScheduleUnit('week'), '주')}
        </>)}
        {viewMode === 'roadmap' && segmentTrack(<>
          {segmentBtn(zoom.level === 'year', () => setZoom({ level: 'year' }), '월')}
          {segmentBtn(zoom.level === 'week', zoomToThisMonth, '주')}
        </>)}
        {(() => {
          const sectionKeys = viewMode === 'function'
            ? HRM_FUNCTIONS.filter(fn => tasks.some(t => t.hrm_function === fn))
            : items.map(i => i.id)
          if (sectionKeys.length === 0) return null
          const allOpen = sectionKeys.every(k => openItems.has(k))
          return (
            <button onClick={() => setOpenItems(allOpen ? new Set() : new Set(sectionKeys))}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium transition-all text-[rgba(226,232,240,0.5)] hover:text-[rgba(226,232,240,0.8)]"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <ChevronsUpDown size={12} />
              {allOpen ? '세부task 모두 접기' : '세부task 모두 펼치기'}
            </button>
          )
        })()}
      </div>

      {prioritySort && (
        <span className="w-full" style={{ fontSize: 10, color: S.t3 }}>정렬 기준: 합의우선순위 → 경영진중요도 → 트랙 → HR중요도 → HR시급도</span>
      )}
      {dndErr && <span className="w-full" style={{ fontSize: 11, color: '#FCA5A5' }}>{dndErr}</span>}
    </div>
  )

  // ── 일정 셀 클릭 → 기간 단축 설정 팝오버 ──────────────────────────
  function openSchedulePicker(e: React.MouseEvent, taskId: string) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPickerPos({ x: r.left, y: r.bottom + 4 })
    setPickerTaskId(taskId)
  }
  const schedulePickerTask = tasks.find(t => t.id === pickerTaskId)
  const schedulePicker = schedulePickerTask && pickerPos ? (
    <div onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', top: pickerPos.y, left: pickerPos.x, zIndex: 9999, background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', width: 210 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 8 }}>{yearNav}년 기간 단축 설정</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
        {(['H1','H2','Q1','Q2','Q3','Q4'] as PeriodKey[]).map(k => (
          <button key={k} onClick={() => { const r = periodToDateRange(yearNav, k); updateTaskRoadmapRange(schedulePickerTask.id, r.start, r.end); setPickerTaskId(null) }}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 0', borderRadius: 5, cursor: 'pointer', color: '#4C7FE0', background: 'rgba(76,127,224,0.08)', border: '1px solid rgba(76,127,224,0.3)' }}>{k}</button>
        ))}
      </div>
      <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="date" defaultValue={schedulePickerTask.roadmap_start_date ?? ''} onChange={e => updateTaskRoadmapRange(schedulePickerTask.id, e.target.value || null, schedulePickerTask.roadmap_end_date ?? null)} style={{ fontSize: 10, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px', flex: 1 }} />
        <span style={{ fontSize: 10, color: '#9CA3AF' }}>~</span>
        <input type="date" defaultValue={schedulePickerTask.roadmap_end_date ?? ''} onChange={e => updateTaskRoadmapRange(schedulePickerTask.id, schedulePickerTask.roadmap_start_date ?? null, e.target.value || null)} style={{ fontSize: 10, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px', flex: 1 }} />
      </div>
      <button onClick={() => { updateTaskRoadmapRange(schedulePickerTask.id, null, null); setPickerTaskId(null) }}
        style={{ width: '100%', fontSize: 10, color: '#9CA3AF', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, padding: '3px 0', cursor: 'pointer', marginTop: 6 }}>없음</button>
    </div>
  ) : null

  // ── 세부task 한 행 렌더 (목록/기능 모드 공용) ──────────────────────
  function renderTaskRow(task: AnnualGoalTask, itemColor: string, contextBadge?: string, showFunctionCol = true) {
    return (
      <div key={task.id}
        className="group/trow flex hover:bg-[rgba(59,130,246,0.04)] transition-colors"
        style={{ opacity: draggingTaskId === task.id ? 0.35 : 1, borderTop: dragOverTaskId === task.id ? '2px solid #3B82F6' : '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
        draggable={!prioritySort}
        onDragStart={e => { e.stopPropagation(); _dragTaskId = task.id; e.dataTransfer.effectAllowed = 'move'; setDraggingTaskId(task.id) }}
        onDragEnd={e => { e.stopPropagation(); _dragTaskId = null; setDraggingTaskId(null); setDragOverTaskId(null) }}
        onDragOver={e => { if (!_dragTaskId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTaskId(task.id) }}
        onDrop={e => { e.preventDefault(); const dragId = _dragTaskId; _dragTaskId = null; if (dragId && dragId !== task.id) reorderTask(dragId, task.id); setDraggingTaskId(null); setDragOverTaskId(null) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTaskId(null) }}
        onClick={() => router.push(`/annual-goals/tasks/${task.id}`)}
        onMouseEnter={() => router.prefetch(`/annual-goals/tasks/${task.id}`)}
      >
        <div style={{ flex: 1, minWidth: 200, padding: '12px 16px 12px 20px', display: 'flex', alignItems: 'center' }}>
          <div className="flex items-center gap-2 min-w-0">
            {task.track && <span style={{ width: 6, height: 6, borderRadius: '50%', background: TRACK_DOT_COLOR[task.track] ?? '#9CA3AF', flexShrink: 0 }} />}
            {!prioritySort && (
              <span draggable
                onDragStart={e => { e.stopPropagation(); _dragTaskId = task.id; e.dataTransfer.effectAllowed = 'move'; setDraggingTaskId(task.id) }}
                onDragEnd={e => { e.stopPropagation(); _dragTaskId = null; setDraggingTaskId(null); setDragOverTaskId(null) }}
                onClick={e => e.stopPropagation()}
                style={{ cursor: 'grab', color: S.t3, fontSize: 12, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}>⠿</span>
            )}
            <button onClick={e => { e.stopPropagation(); cycleTaskStatus(task) }}
              title={STATUS_LABEL[task.status]}
              style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${task.status === 'done' ? '#10B981' : task.status === 'hold' ? '#6366F1' : itemColor}`, background: task.status === 'done' ? '#10B981' : task.status === 'hold' ? 'rgba(99,102,241,0.2)' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              {task.status === 'done' && <span style={{ color: 'white', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>✓</span>}
              {task.status === 'hold' && <span style={{ color: '#6366F1', fontSize: 7, lineHeight: 1 }}>▶</span>}
            </button>
            {contextBadge && <span style={{ fontSize: 9, color: S.t3, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>{contextBadge}</span>}
            {editingTaskId === task.id ? (
              <input autoFocus value={editTTitle} onChange={e => setEditTTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateTask(task.id); if (e.key === 'Escape') setEditingTaskId(null) }}
                onClick={e => e.stopPropagation()}
                className="border border-[rgba(255,255,255,0.15)] rounded px-2 py-0.5 text-xs focus:outline-none flex-1 min-w-0 bg-transparent"
                style={{ color: S.t2 }} />
            ) : (
              <span style={{ fontSize: 13, color: task.status === 'done' ? S.t3 : S.t1, textDecoration: task.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.title}
              </span>
            )}
          </div>
        </div>
        <div style={{ width: 40, borderLeft: S.bdL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {task.track && <span style={{ fontSize: 9, fontWeight: 700, color: '#c9cdd3', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 999 }}>{task.track}</span>}
        </div>
        <div style={{ width: 92, padding: '7px 8px', borderLeft: S.bdL, display: 'flex', alignItems: 'center' }}>
          <GlassSelect
            value={task.assignee_id ?? ''}
            onChange={v => updateTaskAssignee(task.id, v || null)}
            options={members.map(m => ({ value: m.id, label: m.name, color: memberColors[m.id] }))}
            placeholder="-"
            variant="inline"
            avatarSize={18}
          />
        </div>
        <div style={{ width: 100, padding: '7px 8px', borderLeft: S.bdL, display: 'flex', alignItems: 'center' }} onClick={e => openSchedulePicker(e, task.id)}>
          {formatSchedule(task, scheduleUnit) ? (
            <span style={{ fontSize: 11, color: task.roadmap_start_date ? '#9aa1ab' : S.t3, cursor: 'pointer' }}>{formatSchedule(task, scheduleUnit)}</span>
          ) : (
            <span style={{ fontSize: 10, color: 'rgba(226,232,240,0.2)', cursor: 'pointer' }}>+ 설정</span>
          )}
        </div>
        {showFunctionCol && (
          <div style={{ width: 68, padding: '7px 4px', borderLeft: S.bdL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {task.hrm_function && <span style={{ fontSize: 9, fontWeight: 600, color: '#c9cdd3', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 999 }}>{hrmFunctionShort(task.hrm_function)}</span>}
          </div>
        )}
        <div style={{ width: 46, padding: '7px 4px', borderLeft: S.bdL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {task.hr_importance && <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_BADGE[task.hr_importance].text, background: STATUS_BADGE[task.hr_importance].bg, padding: '1px 7px', borderRadius: 999 }}>{task.hr_importance}</span>}
        </div>
        <div style={{ width: 46, padding: '7px 4px', borderLeft: S.bdL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {task.hr_urgency && <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_BADGE[task.hr_urgency].text, background: STATUS_BADGE[task.hr_urgency].bg, padding: '1px 7px', borderRadius: 999 }}>{task.hr_urgency}</span>}
        </div>
        <div style={{ width: 90, padding: '7px 6px', borderLeft: S.bdL, display: 'flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <GlassSelect value={task.agreed_priority ?? ''} onChange={v => updateAgreedPriority(task.id, (v || null) as AgreedPriority | null)} options={PRIORITY_OPTIONS} placeholder="-" variant="inline" />
        </div>
        <div style={{ width: 56, padding: '7px 6px', borderLeft: S.bdL, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <div className="opacity-0 group-hover/trow:opacity-100 transition-all flex items-center gap-1.5">
            {editingTaskId !== task.id && (
              <button onClick={() => { setEditingTaskId(task.id); setEditTTitle(task.title) }} className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)]">수정</button>
            )}
            {deletingTask === task.id ? (
              <>
                <button onClick={() => deleteTask(task.id)} className="text-[10px] text-red-400 font-semibold">삭제</button>
                <button onClick={() => setDeletingTask(null)} className="text-[10px] text-[rgba(226,232,240,0.4)]">취소</button>
              </>
            ) : (
              <button onClick={() => setDeletingTask(task.id)} className="text-[10px] text-[rgba(226,232,240,0.25)] hover:text-red-400">삭제</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── 세부task 테이블 컬럼 헤더 (목록/기능 모드 공용) ─────────────────
  function renderColumnHeader(showFunctionCol = true) {
    const hd: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase', padding: '6px 8px', borderLeft: S.bdL }
    return (
      <div className="flex" style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ flex: 1, minWidth: 200, ...hd, borderLeft: 'none', paddingLeft: 20 }}>세부task</div>
        <div style={{ width: 40, ...hd }}>트랙</div>
        <div style={{ width: 92, ...hd }}>담당자</div>
        <div style={{ width: 100, ...hd }}>일정({scheduleUnit === 'month' ? '월' : '주'})</div>
        {showFunctionCol && <div style={{ width: 68, ...hd }}>기능</div>}
        <div style={{ width: 46, ...hd }}>중요도</div>
        <div style={{ width: 46, ...hd }}>시급도</div>
        <div style={{ width: 90, ...hd }}>경영진 싱크</div>
        <div style={{ width: 56, ...hd }} />
      </div>
    )
  }

  // ── 안건 행 렌더 (카테고리 색은 배지 하나로만 표시 — 행 자체는 중립색으로 통일) ─
  function renderItemCard(item: AnnualGoalItem) {
    const itemTasksAll = tasks.filter(t => t.item_id === item.id).sort((a, b) => a.sort_order - b.sort_order)
    const doneItemTasks = itemTasksAll.filter(t => t.status === 'done')
    const visibleTasks = showDoneItems.has(item.id) ? itemTasksAll : itemTasksAll.filter(t => t.status !== 'done')
    const orderedTasks = prioritySort ? [...visibleTasks].sort(priorityComparator) : visibleTasks
    const isOpen = openItems.has(item.id)
    const itemBg = draggingItemId === item.id ? 'rgba(0,0,0,0.08)' : dragOverItemId === item.id ? 'rgba(255,255,255,0.07)' : 'transparent'
    const progress = taskProgress(itemTasksAll)

    return (
      <div key={item.id}
        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)', opacity: draggingItemId === item.id ? 0.4 : 1 }}
        onDragOver={e => { if (!_dragItemId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverItemId(item.id) }}
        onDrop={e => { e.preventDefault(); const dragId = _dragItemId; _dragItemId = null; if (dragId && dragId !== item.id) reorderItem(dragId, item.id); setDraggingItemId(null); setDragOverItemId(null) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverItemId(null) }}
      >
        {/* ── 안건 헤더: 얇은 한 줄 행, 지표는 오른쪽으로 정렬 ── */}
        <div className="group/irow2 flex items-center gap-2 cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          style={{ padding: 16, background: itemBg, borderLeft: `3px solid ${dragOverItemId === item.id ? NEUTRAL_ACCENT : 'transparent'}` }}
          onClick={() => toggleItem(item.id)}>
          <span draggable
            onDragStart={e => { e.stopPropagation(); _dragItemId = item.id; e.dataTransfer.effectAllowed = 'move'; setDraggingItemId(item.id) }}
            onDragEnd={e => { e.stopPropagation(); _dragItemId = null; setDraggingItemId(null); setDragOverItemId(null) }}
            onClick={e => e.stopPropagation()}
            style={{ cursor: 'grab', color: S.t3, fontSize: 13, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}>⠿</span>
          <span style={{ fontSize: 8, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', color: S.t3, flexShrink: 0 }}>▶</span>
          {editingItemId === item.id ? (
            <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
              <input autoFocus value={editIName} onChange={e => setEditIName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateItem(item.id); if (e.key === 'Escape') setEditingItemId(null) }}
                className="border border-[rgba(255,255,255,0.15)] rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-[rgba(255,255,255,0.3)] font-semibold w-40 bg-transparent"
                style={{ color: S.t1 }} />
              <button onClick={() => updateItem(item.id)} className="text-xs text-[#93C5FD]">저장</button>
            </div>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: NEUTRAL_TEXT, whiteSpace: 'nowrap' }}>{item.title}</span>
          )}
          <span style={{ fontSize: 10, color: S.t3, background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>{visibleTasks.length}</span>

          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            {/* 분류 컬럼 — 라벨 서브행의 '분류'와 폭(ITEM_ROW_COLS.category) 공유 */}
            <div style={{ width: ITEM_ROW_COLS.category, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {isAll && (() => {
                const b = categoryBadge(item.category)
                return <span style={{ fontSize: 9, fontWeight: 600, color: b.text, background: b.bg, padding: '2px 8px', borderRadius: 999 }}>{displayCat(item.category)}</span>
              })()}
            </div>

            {/* 기한 컬럼 — 라벨 서브행의 '기한'과 폭(ITEM_ROW_COLS.deadline) 공유 */}
            <div style={{ width: ITEM_ROW_COLS.deadline, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
              {item.target_deadline && (
                <span style={{ fontSize: 10, fontWeight: 700, color: daysUntil(item.target_deadline) < 0 ? '#EF4444' : daysUntil(item.target_deadline) <= 7 ? '#F59E0B' : S.t2 }}>
                  {ddayLabel(item.target_deadline)}
                </span>
              )}
              <DateCellPicker
                label="기한"
                value={item.target_deadline ?? null}
                color={item.target_deadline && daysUntil(item.target_deadline) < 0 ? '#EF4444' : NEUTRAL_ACCENT}
                onChange={v => updateItemDeadline(item.id, v)}
              />
            </div>

            {/* 진행률 컬럼 — 라벨 서브행의 '진행률'과 폭(ITEM_ROW_COLS.progress) 공유 */}
            <div style={{ width: ITEM_ROW_COLS.progress, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {progress.total > 0 && <ProgressRing pct={progress.pct} color={NEUTRAL_ACCENT} />}
            </div>

            {/* 수정/삭제 액션 — 라벨 없는 hover 전용 버튼. 컬럼 정렬에 영향 없도록 맨 뒤로 배치 */}
            <div className="flex items-center gap-1.5 opacity-0 group-hover/irow2:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              {editingItemId !== item.id && (
                <button onClick={() => { setEditingItemId(item.id); setEditIName(item.title) }} className="text-[10px] text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.7)] px-1">수정</button>
              )}
              {deletingItem === item.id ? (
                <>
                  <span className="text-[10px] text-[rgba(226,232,240,0.5)]">삭제?</span>
                  <button onClick={() => deleteItem(item.id)} className="text-[10px] text-red-400 font-semibold px-1.5 py-0.5 rounded">삭제</button>
                  <button onClick={() => setDeletingItem(null)} className="text-[10px] text-[rgba(226,232,240,0.4)] px-1.5 py-0.5 rounded">취소</button>
                </>
              ) : (
                <button onClick={() => setDeletingItem(item.id)} className="text-[10px] text-[rgba(226,232,240,0.3)] hover:text-red-400 px-1">삭제</button>
              )}
            </div>
          </div>
        </div>

        {isOpen && (
          <>
            {/* 세부task 표만 고정폭 컬럼을 쓰므로, 좁은 화면에서는 이 부분만 로컬 가로스크롤 — 카드 전체를 밀어내지 않음 */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 760 }}>
                {renderColumnHeader()}
                {orderedTasks.map(task => renderTaskRow(task, NEUTRAL_ACCENT))}
              </div>
            </div>

            {doneItemTasks.length > 0 && (
              <button onClick={() => toggleShowDone(item.id)}
                className="w-full flex items-center gap-1.5 px-5 py-2 text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.55)] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                <span style={{ fontSize: 8, transform: showDoneItems.has(item.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                완료 {doneItemTasks.length}건
              </button>
            )}

            {addingTask === item.id ? (
              <div className="flex items-center gap-2 px-5 py-2.5">
                <input autoFocus value={newTTitle} onChange={e => setNewTTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addTask(item.id); if (e.key === 'Escape') { setAddingTask(null); setNewTTitle('') } }}
                  placeholder="세부task 입력 후 Enter"
                  className="flex-1 border border-[rgba(255,255,255,0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-transparent text-[#E2E8F0]" />
                <button onClick={() => addTask(item.id)} className="text-xs bg-[rgba(27,58,107,0.3)] text-[#93C5FD] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                <button onClick={() => { setAddingTask(null); setNewTTitle('') }} className="text-xs text-[rgba(226,232,240,0.4)] px-2 py-1">취소</button>
              </div>
            ) : (
              <div onClick={() => toggleExpandTaskAdd(item.id)}
                className="flex items-center gap-1 px-5 py-3 text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.6)] hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors">
                ＋ 세부task 추가
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── 목록 모드 ────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <>
        {viewToggle}
        <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6" onClick={() => setPickerTaskId(null)}>
          <div className="pb-4" style={{ width: '100%' }}>
            {isAll ? (
              allCats.map((cat, ci) => {
                const catItems = items.filter(i => i.category === cat).sort((a, b) => a.sort_order - b.sort_order)
                if (catItems.length === 0) return null
                const sectionColor = categorySectionColor(cat)
                return (
                  <div key={cat} style={{ marginTop: ci === 0 ? 0 : 14, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: '14px 24px', overflow: 'hidden' }}>
                    {/* ── 범주(대분류) 헤더 — 카드 좌우 끝까지 꽉 채운 파스텔 배너, 상단 모서리만 카드 radius(20px)에 맞춤. padding 19px 균일(/project 실측 기준, 약 62px) ── */}
                    <div className="flex items-center" style={{
                      margin: '-14px -24px 0 -24px',
                      padding: '19px',
                      background: sectionColor.bg,
                      borderTopLeftRadius: 20,
                      borderTopRightRadius: 20,
                    }}>
                      {/* 본문 행의 드래그핸들 아이콘과 같은 자리/opacity — 파스텔 배너 배경에서도 보이도록 sectionColor.text(카테고리 진한 톤)로 대비 확보. 나머지 폭은 펼치기 화살표 자리(빈 공간)로 남겨 타이틀 시작선을 본문과 맞춤 (본문 행 padding 16px 기준 재계산) */}
                      <span style={{ width: 60, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 16, fontSize: 13, color: sectionColor.text, opacity: 0.6, lineHeight: 1, userSelect: 'none' }}>⠿</span>
                      <div className="flex items-center gap-2.5">
                        {editingCatKey === cat ? (
                          <input autoFocus value={editCatVal} onChange={e => setEditCatVal(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitEditCat(); if (e.key === 'Escape') setEditingCatKey(null) }}
                            onBlur={commitEditCat}
                            className="border-b bg-transparent focus:outline-none"
                            style={{ fontSize: 13, fontWeight: 800, color: sectionColor.text, borderColor: sectionColor.text, width: 140 }} />
                        ) : (
                          <span onDoubleClick={() => startEditCat(cat)} title="더블클릭하여 이름 수정"
                            style={{ fontSize: 13, fontWeight: 800, color: sectionColor.text, flexShrink: 0, whiteSpace: 'nowrap', cursor: 'text' }}>{displayCat(cat)}</span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 600, color: sectionColor.text, opacity: 0.75, flexShrink: 0, whiteSpace: 'nowrap' }}>{catItems.length}개 안건</span>
                      </div>
                    </div>

                    {/* ── 컬럼 라벨 서브행 — 안건 행과 동일한 컬럼 폭(ITEM_ROW_COLS)을 공유해 좌/우 정렬선이 항상 일치. 좌우 패딩도 본문 행(16px)과 동일하게 맞춰 rem 스케일링에 따른 오차를 없앰 ── */}
                    <div className="flex items-center" style={{ padding: '8px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ flex: 1, marginLeft: 39, fontSize: 11, color: '#7d838d', fontWeight: 600 }}>안건</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span style={{ width: ITEM_ROW_COLS.category, flexShrink: 0, fontSize: 11, color: '#7d838d', fontWeight: 600 }}>분류</span>
                        <span style={{ width: ITEM_ROW_COLS.deadline, flexShrink: 0, fontSize: 11, color: '#7d838d', fontWeight: 600 }}>기한</span>
                        <span style={{ width: ITEM_ROW_COLS.progress, flexShrink: 0, fontSize: 11, color: '#7d838d', fontWeight: 600 }}>진행률</span>
                      </div>
                    </div>

                    {catItems.map(item => renderItemCard(item))}
                  </div>
                )
              })
            ) : (
              <div>{[...items].sort((a, b) => a.sort_order - b.sort_order).map(item => renderItemCard(item))}</div>
            )}

            <div className="mt-4 rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] overflow-hidden">
              {addingItem ? (
                <div className="flex items-center gap-2 px-5 py-3 flex-wrap">
                  <input autoFocus value={newIName} onChange={e => setNewIName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(); if (e.key === 'Escape') { setAddingItem(false); setNewIName('') } }}
                    placeholder="안건명(중분류) 입력 후 Enter"
                    className="border border-[rgba(255,255,255,0.15)] rounded-lg px-3 py-1.5 text-sm focus:outline-none w-48 bg-transparent text-[#E2E8F0]" />
                  {isAll && (
                    <div className="flex gap-1 flex-wrap">
                      {allCats.map(c => (
                        <button key={c} type="button" onClick={() => setNewICat(c)}
                          className="text-xs px-2.5 py-1 rounded-full border font-semibold transition-all"
                          style={newICat === c ? { background: 'rgba(76,127,224,0.18)', borderColor: '#4C7FE0', color: '#E2E8F0' } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(226,232,240,0.4)' }}>{c}</button>
                      ))}
                    </div>
                  )}
                  <button onClick={addItem} className="text-xs bg-[rgba(27,58,107,0.3)] text-[#93C5FD] border border-[rgba(27,58,107,0.5)] px-3 py-1.5 rounded-lg">추가</button>
                  <button onClick={() => { setAddingItem(false); setNewIName('') }} className="text-xs text-[rgba(226,232,240,0.4)] px-2 py-1">취소</button>
                </div>
              ) : (
                <div onClick={openAddItem}
                  className="flex items-center gap-1 px-5 py-3 text-xs text-[rgba(226,232,240,0.3)] hover:text-[rgba(226,232,240,0.6)] hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors">
                  ＋ 안건(중분류) 추가
                </div>
              )}
            </div>
          </div>
        </div>
        {schedulePicker}
      </>
    )
  }

  // ── 기능 모드 (엑셀 1B.기능뷰 관점 — HRM 기능 F1~F10 기준 재정렬) ──
  if (viewMode === 'function') {
    const itemsById = Object.fromEntries(items.map(i => [i.id, i]))
    return (
      <>
        {viewToggle}
        <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6" onClick={() => setPickerTaskId(null)}>
          <div className="pb-4" style={{ width: '100%' }}>
            {HRM_FUNCTIONS.filter(fn => tasks.some(t => t.hrm_function === fn)).map((fn, fi) => {
              const fnTasksAll = tasks.filter(t => t.hrm_function === fn).sort((a, b) => a.sort_order - b.sort_order)
              const Icon = hrmFunctionIcon(fn)
              const isOpen = openItems.has(fn)
              const doneFnTasks = fnTasksAll.filter(t => t.status === 'done')
              const visibleFnTasks = showDoneItems.has(fn) ? fnTasksAll : fnTasksAll.filter(t => t.status !== 'done')
              const orderedFnTasks = prioritySort ? [...visibleFnTasks].sort(priorityComparator) : visibleFnTasks
              const progress = taskProgress(fnTasksAll)
              return (
                <div key={fn} style={{ marginTop: fi === 0 ? 0 : 14, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: isOpen ? '14px 24px' : 0, overflow: 'hidden' }}>
                  {/* ── 헤더 배너 — 카테고리색 없이 중립 배경, 기존 아이콘+텍스트+카운트+진행률 유지. 접혀있을 땐 카드 padding을 0으로 줄이고 배너 하단도 둥글게 처리해 카드 하단에 빈 음영이 남지 않도록 함 ── */}
                  <div className="flex items-center gap-2.5 cursor-pointer" style={{
                    margin: isOpen ? '-14px -24px 0 -24px' : 0,
                    padding: '19px',
                    background: 'rgba(255,255,255,0.03)',
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    borderBottomLeftRadius: isOpen ? 0 : 20,
                    borderBottomRightRadius: isOpen ? 0 : 20,
                  }} onClick={() => toggleOpenKey(fn, false)}>
                    <span style={{ fontSize: 8, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', color: '#7d838d', flexShrink: 0 }}>▶</span>
                    <Icon size={16} color="#9aa1ab" strokeWidth={1.75} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}>{hrmFunctionLabel(fn)}</span>
                    <span style={{ fontSize: 10, color: '#7d838d', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 99 }}>{visibleFnTasks.length}</span>
                    {progress.total > 0 && (
                      <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                        <ProgressRing pct={progress.pct} color={NEUTRAL_ACCENT} />
                      </div>
                    )}
                  </div>
                  {isOpen && (
                    <>
                      {/* ── 서브라벨행 ── */}
                      <div className="flex items-center" style={{ margin: '0 -24px', padding: '8px 24px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ flex: 1, fontSize: 11, color: '#7d838d', fontWeight: 600 }}>세부task</span>
                        <span style={{ fontSize: 11, color: '#7d838d', fontWeight: 600 }}>진행률</span>
                      </div>

                      <div style={{ overflowX: 'auto', margin: '0 -24px' }}>
                        <div style={{ minWidth: 760, padding: '0 24px' }}>
                          {renderColumnHeader(false)}
                          {orderedFnTasks.map(task => {
                            const parentItem = itemsById[task.item_id]
                            return renderTaskRow(task, NEUTRAL_ACCENT, parentItem ? `${displayCat(parentItem.category)} · ${parentItem.title}` : undefined, false)
                          })}
                        </div>
                      </div>
                      {doneFnTasks.length > 0 && (
                        <button onClick={() => toggleShowDone(fn)}
                          className="w-full flex items-center gap-1.5 px-5 py-2 text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.55)] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                          <span style={{ fontSize: 8, transform: showDoneItems.has(fn) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                          완료 {doneFnTasks.length}건
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        {schedulePicker}
      </>
    )
  }

  // ── 로드맵 모드 ──────────────────────────────────────────────────
  return (
    <>
      {viewToggle}
      <AnnualRoadmapView
        items={items} tasks={tasks} isAll={isAll} allCats={allCats}
        yearNav={yearNav} zoom={zoom} setZoom={setZoom}
        openItems={openItems} toggleItem={toggleItem}
        showDoneItems={showDoneItems} toggleShowDone={toggleShowDone}
        prioritySort={prioritySort}
        updateTaskRoadmapRange={updateTaskRoadmapRange}
        router={router}
        reorderTask={reorderTask}
        displayCat={displayCat}
      />
    </>
  )
}

// ── 로드맵 뷰 (연간 3단 헤더 + 주 단위 줌) ──────────────────────────
function AnnualRoadmapView({
  items, tasks, isAll, allCats, yearNav, zoom, setZoom,
  openItems, toggleItem, showDoneItems, toggleShowDone, prioritySort,
  updateTaskRoadmapRange, router, reorderTask, displayCat,
}: {
  items: AnnualGoalItem[]
  tasks: AnnualGoalTask[]
  isAll: boolean
  allCats: string[]
  yearNav: number
  zoom: ZoomState
  setZoom: (z: ZoomState) => void
  openItems: Set<string>
  toggleItem: (id: string) => void
  showDoneItems: Set<string>
  toggleShowDone: (id: string) => void
  prioritySort: boolean
  updateTaskRoadmapRange: (taskId: string, start: string | null, end: string | null) => void
  router: ReturnType<typeof useRouter>
  reorderTask: (dragId: string, targetId: string) => void
  displayCat: (cat: string) => string
}) {
  const [pickerTaskId, setPickerTaskId] = useState<string | null>(null)
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null)
  const [rdDraggingId, setRdDraggingId] = useState<string | null>(null)
  const [rdDragOverId, setRdDragOverId] = useState<string | null>(null)

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const cols = useMemo((): { start: string; end: string; label: string; month?: number }[] => {
    if (zoom.level === 'week') return getWeekColumnsBetween(zoom.rangeStart, zoom.rangeEnd).map(w => ({ start: w.start, end: w.end, label: w.label }))
    return Array.from({ length: 12 }, (_, i) => ({ ...monthToDateRange(yearNav, i + 1), label: MONTH_KO[i], month: i }))
  }, [zoom, yearNav])

  const W_COL = zoom.level === 'week' ? 58 : 68

  function openMonth(month1to12: number) {
    const r = monthToDateRange(yearNav, month1to12)
    setZoom({ level: 'week', rangeStart: r.start, rangeEnd: r.end, headerLabel: `${yearNav}년 ${MONTH_KO[month1to12 - 1]}`, month: month1to12 })
  }
  function openPicker(e: React.MouseEvent, taskId: string) {
    e.stopPropagation()
    const r = (e.target as HTMLElement).getBoundingClientRect()
    setPickerPos({ x: r.left, y: r.bottom + 4 })
    setPickerTaskId(taskId)
  }

  const pickerTask = tasks.find(t => t.id === pickerTaskId)
  const picker = pickerTask && pickerPos ? (
    <div onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', top: pickerPos.y, left: pickerPos.x, zIndex: 9999, background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', width: 210 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 8 }}>{yearNav}년 기간 단축 설정</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
        {(['H1','H2','Q1','Q2','Q3','Q4'] as PeriodKey[]).map(k => (
          <button key={k} onClick={() => { const r = periodToDateRange(yearNav, k); updateTaskRoadmapRange(pickerTask.id, r.start, r.end); setPickerTaskId(null) }}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 0', borderRadius: 5, cursor: 'pointer', color: '#4C7FE0', background: 'rgba(76,127,224,0.08)', border: '1px solid rgba(76,127,224,0.3)' }}>{k}</button>
        ))}
      </div>
      <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="date" defaultValue={pickerTask.roadmap_start_date ?? ''} onChange={e => updateTaskRoadmapRange(pickerTask.id, e.target.value || null, pickerTask.roadmap_end_date ?? null)} style={{ fontSize: 10, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px', flex: 1 }} />
        <span style={{ fontSize: 10, color: '#9CA3AF' }}>~</span>
        <input type="date" defaultValue={pickerTask.roadmap_end_date ?? ''} onChange={e => updateTaskRoadmapRange(pickerTask.id, pickerTask.roadmap_start_date ?? null, e.target.value || null)} style={{ fontSize: 10, border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px', flex: 1 }} />
      </div>
      <button onClick={() => { updateTaskRoadmapRange(pickerTask.id, null, null); setPickerTaskId(null) }}
        style={{ width: '100%', fontSize: 10, color: '#9CA3AF', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, padding: '3px 0', cursor: 'pointer', marginTop: 6 }}>없음</button>
    </div>
  ) : null

  const orderedItems = [...items].sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order)

  // ── 범주(대분류) 카드 — 목록 뷰와 동일한 카드 언어: 헤더 배너(카테고리 파스텔) + 서브라벨행(안건 | 월별 헤더) + 로컬 테이블(타임라인 바는 renderItemRows 그대로 재사용) ──
  function renderCategoryCard(cat: string, catItems: AnnualGoalItem[], ci: number) {
    const sc = categorySectionColor(cat)
    return (
      <div key={cat} style={{ marginTop: ci === 0 ? 0 : 14, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: '14px 24px', overflow: 'hidden' }}>
        {/* 헤더 배너 */}
        <div className="flex items-center gap-2.5" style={{
          margin: '-14px -24px 0 -24px',
          padding: '19px',
          background: sc.bg,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}>
          <span style={{ fontSize: 13, color: sc.text, opacity: 0.6, lineHeight: 1, userSelect: 'none' }}>⠿</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: sc.text, flexShrink: 0, whiteSpace: 'nowrap' }}>{displayCat(cat)}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: sc.text, opacity: 0.75, flexShrink: 0, whiteSpace: 'nowrap' }}>{catItems.length}개 안건</span>
        </div>

        {/* 서브라벨행(안건 | 월별 헤더) + 로컬 테이블 — 타임라인 바 렌더링(renderItemRows)은 그대로 재사용 */}
        <div style={{ overflowX: 'auto', margin: '0 -24px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: W_LEFT + cols.length * W_COL, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: W_ITEM }} />
              <col style={{ width: W_TASK }} />
              {cols.map(col => <col key={col.start} />)}
            </colgroup>
            <thead>
              <tr>
                <th colSpan={2} style={{ textAlign: 'left', padding: '8px 24px', fontSize: 11, color: '#7d838d', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>안건</th>
                {cols.map((col, ci2) => {
                  const isCur = col.start <= todayStr && todayStr <= col.end
                  return (
                    <th key={col.start}
                      onClick={zoom.level === 'year' && col.month != null ? () => openMonth(col.month! + 1) : undefined}
                      className={zoom.level === 'year' ? 'hover:bg-[rgba(255,255,255,0.06)] transition-all' : undefined}
                      title={zoom.level === 'year' ? '클릭하여 주 단위로 보기' : undefined}
                      style={{ cursor: zoom.level === 'year' ? 'pointer' : 'default', textAlign: 'center', padding: '8px 2px', fontSize: 11, color: '#7d838d', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.08)', borderLeft: zoom.level === 'year' ? (ci2 % 3 === 0 ? S.bdL : S.bd) : S.bd, background: isCur ? 'rgba(255,255,255,0.05)' : undefined }}>
                      {col.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {catItems.map(item => renderItemRows(item))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── 안건 + 세부task 행 (들여쓰기로 계층 구분, 카테고리색 없이 중립톤) ──
  function renderItemRows(item: AnnualGoalItem) {
    const itemTasksAll = tasks.filter(t => t.item_id === item.id).sort((a,b) => a.sort_order - b.sort_order)
    const doneTasks = itemTasksAll.filter(t => t.status === 'done')
    const visibleTasks = showDoneItems.has(item.id) ? itemTasksAll : itemTasksAll.filter(t => t.status !== 'done')
    const orderedTasks = prioritySort ? [...visibleTasks].sort(priorityComparator) : visibleTasks
    const isOpen = openItems.has(item.id)

    const itemStart = item.roadmap_start_date ?? itemTasksAll.map(t => t.roadmap_start_date).filter(Boolean).sort()[0] ?? null
    const itemEndCands = itemTasksAll.map(t => t.roadmap_end_date).filter(Boolean).sort()
    const itemEnd = item.roadmap_end_date ?? (itemEndCands.length ? itemEndCands[itemEndCands.length - 1] : null)
    const progress = taskProgress(itemTasksAll)
    // 타임라인 바 색 — 목록 뷰 카테고리 헤더와 동일한 톤을 재사용 (범주별로 항상 같은 색)
    const sectionColorForBar = categorySectionColor(item.category)
    const catColor = sectionColorForBar.text
    // 트랙/채움 모두 opacity 블렌딩 없이 완전 불투명 solid hex로 구성 — 다크 페이지 배경과 섞여 탁해지는 문제를 원천적으로 없앰
    const barTrackUpper = categoryTrackUpper(item.category)  // 안건(상위) 트랙 — 진하고 쨍한 신규 톤
    const barTrack = hexToRgba(sectionColorForBar.bg, 1)      // 세부task(하위) 트랙 — 기존 옅은 헤더 pastel 톤 그대로 유지
    const barFill = catColor                                  // 안건(상위) 채움 — catColor(text 톤) 그대로 solid
    const barFillSub = mixHex(catColor, '#FFFFFF', 0.55)      // 세부task(하위) 채움 — catColor를 흰색과 섞은 옅은 solid 톤 (opacity 아님)

    return (
      <Fragment key={item.id}>
        <tr style={{ background: 'rgba(255,255,255,0.025)', cursor: 'pointer' }} onClick={() => toggleItem(item.id)}>
          <td colSpan={2} style={{ position: 'sticky', left: 0, zIndex: 2, background: '#171A21', borderBottom: S.bd, borderRight: S.bdL, padding: '9px 10px 9px 20px' }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 8, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', color: S.t3, flexShrink: 0 }}>▶</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: NEUTRAL_TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>{item.title}</span>
              <span style={{ fontSize: 10, color: S.t3, background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>{visibleTasks.length}</span>
              {item.target_deadline && (
                <span style={{ fontSize: 9, fontWeight: 700, color: daysUntil(item.target_deadline) < 0 ? '#EF4444' : daysUntil(item.target_deadline) <= 7 ? '#F59E0B' : S.t3, flexShrink: 0 }}>
                  {ddayLabel(item.target_deadline)}
                </span>
              )}
            </div>
          </td>
          {(() => {
            const inRangeArr = cols.map(col => overlapsRange(itemStart, itemEnd, col.start, col.end))
            const firstIdx = inRangeArr.indexOf(true)
            const lastIdx = inRangeArr.lastIndexOf(true)
            const span = lastIdx - firstIdx + 1
            const filledCount = firstIdx >= 0 ? Math.round(span * progress.pct / 100) : 0
            return cols.map((col, ci) => {
              const inRange = inRangeArr[ci]
              const isCur = col.start <= todayStr && todayStr <= col.end
              const isFirst = ci === firstIdx, isLast = ci === lastIdx
              const isFilled = inRange && ci < firstIdx + filledCount
              // 바가 완전 불투명해지면서 월 경계가 안 보이므로, 이어지는 구간(ci > firstIdx)마다 바 내부에 세로 구분선을 그려줌
              // 트랙(밝은 배경) 위는 어두운 반투명선, 채움(진한 배경) 위는 밝은 반투명선 — 어느 색 위에서도 보이게
              const showMonthDivider = inRange && ci > firstIdx
              return (
                <td key={col.start} style={{ borderLeft: S.bd, borderBottom: S.bd, padding: '0 1px', background: isCur ? 'rgba(255,255,255,0.05)' : undefined }}>
                  {inRange && (
                    <div style={{
                      height: 12,
                      background: isFilled ? barFill : barTrackUpper,
                      borderRadius: isFirst && isLast ? 4 : isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : 0,
                      borderLeft: showMonthDivider ? `1px solid ${isFilled ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'}` : undefined,
                    }} />
                  )}
                </td>
              )
            })
          })()}
        </tr>
        {isOpen && orderedTasks.map(task => {
          const inRangeArr = cols.map(col => overlapsRange(task.roadmap_start_date, task.roadmap_end_date, col.start, col.end))
          const firstIdx = inRangeArr.indexOf(true)
          const lastIdx = inRangeArr.lastIndexOf(true)
          const isRdOver = rdDragOverId === task.id
          const isRdDragging = rdDraggingId === task.id
          return (
            <tr key={task.id}
              draggable={!prioritySort}
              onDragStart={e => { e.stopPropagation(); _dragTaskId = task.id; e.dataTransfer.effectAllowed = 'move'; setRdDraggingId(task.id) }}
              onDragEnd={() => { _dragTaskId = null; setRdDraggingId(null); setRdDragOverId(null) }}
              onDragOver={e => { if (!_dragTaskId || _dragTaskId === task.id) return; e.preventDefault(); e.stopPropagation(); setRdDragOverId(task.id) }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); if (_dragTaskId && _dragTaskId !== task.id) reorderTask(_dragTaskId, task.id); _dragTaskId = null; setRdDraggingId(null); setRdDragOverId(null) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRdDragOverId(null) }}
              style={{ borderBottom: isRdOver ? `2px solid ${NEUTRAL_ACCENT}` : S.bd, opacity: task.status === 'done' ? 0.4 : isRdDragging ? 0.5 : 1 }}
              className="group/rdtask hover:bg-[rgba(255,255,255,0.04)]"
            >
              <td style={{ position: 'sticky', left: 0, zIndex: 1, background: S.bg, borderRight: S.bd }} />
              <td style={{ position: 'sticky', left: W_ITEM, zIndex: 1, background: S.bg, borderRight: S.bdL, padding: '7px 10px 7px 26px' }}>
                <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                  {!prioritySort && <span className="opacity-0 group-hover/rdtask:opacity-100 cursor-grab text-gray-300 text-xs select-none" style={{ fontSize: 12 }}>⠿</span>}
                  <button onClick={e => openPicker(e, task.id)}
                    style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, cursor: 'pointer', minWidth: 20, textAlign: 'center', flexShrink: 0,
                      color: task.roadmap_start_date ? S.t2 : '#9CA3AF',
                      background: task.roadmap_start_date ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: task.roadmap_start_date ? '1px solid rgba(255,255,255,0.16)' : '1px dashed rgba(255,255,255,0.2)' }}>
                    {task.roadmap_start_date ? '기간' : (task.suggested_period || '+')}
                  </button>
                  <span onClick={() => router.push(`/annual-goals/tasks/${task.id}`)} style={{ fontSize: 12, fontWeight: 500, color: task.status === 'done' ? S.t3 : S.t1, textDecoration: task.status === 'done' ? 'line-through' : 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{task.title}</span>
                </div>
              </td>
              {cols.map((col, ci) => {
                const inRange = inRangeArr[ci]
                const isCur = col.start <= todayStr && todayStr <= col.end
                const isFirst = ci === firstIdx, isLast = ci === lastIdx
                return (
                  <td key={col.start} style={{ borderLeft: S.bd, padding: '8px 1px', verticalAlign: 'middle', background: isCur ? 'rgba(255,255,255,0.05)' : undefined }}>
                    {inRange && (
                      <div style={{
                        // 세부task(하위) 바 — 안건 바(barTrackUpper, 12px)보다 얇고(8px) 옅은 solid 톤(barTrack/barFillSub)을 써서, 두께+색 둘 다로 상/하위가 구분됨
                        height: 8, borderRadius: isFirst && isLast ? 4 : isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : 0,
                        background: task.status === 'done' ? barFillSub : barTrack,
                      }} />
                    )}
                  </td>
                )
              })}
            </tr>
          )
        })}
        {isOpen && doneTasks.length > 0 && (
          <tr><td colSpan={cols.length + 2} style={{ padding: 0 }}>
            <button onClick={() => toggleShowDone(item.id)} className="w-full flex items-center gap-1.5 px-4 py-1.5 text-xs text-[rgba(226,232,240,0.35)] hover:text-[rgba(226,232,240,0.55)]">
              <span style={{ fontSize: 8, transform: showDoneItems.has(item.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
              완료 {doneTasks.length}건
            </button>
          </td></tr>
        )}
      </Fragment>
    )
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6" onClick={() => setPickerTaskId(null)}>
        <div className="pb-4" style={{ width: '100%' }}>
          {isAll ? (
            allCats.map((cat, ci) => {
              const catItems = orderedItems.filter(i => i.category === cat)
              if (catItems.length === 0) return null
              return renderCategoryCard(cat, catItems, ci)
            })
          ) : (
            orderedItems.length > 0 && renderCategoryCard(orderedItems[0].category, orderedItems, 0)
          )}
        </div>
      </div>
      {picker}
    </>
  )
}
