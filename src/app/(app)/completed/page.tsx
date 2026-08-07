'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Calendar, ChevronLeft, ChevronRight, CheckSquare, Lightbulb, Settings, TrendingUp } from 'lucide-react'
import type { AgendaGroup, AgendaSubTask, ManualAchievement, AchievementType } from '@/types'

const ACH_TYPES: AchievementType[] = ['기획', '운영', '개선']
const ACH_COLOR: Record<AchievementType, string> = { '기획': '#6B8FB3', '운영': '#7BAE94', '개선': '#D9A484' }
type FilterType = '전체' | AchievementType
const FILTER_TYPES: FilterType[] = ['전체', '기획', '운영', '개선']

type QuickPeriod = '주간' | '당월' | '분기' | '상반기' | '하반기' | '포트폴리오'
const QUICK_PERIODS: QuickPeriod[] = ['주간', '당월', '분기', '상반기', '하반기', '포트폴리오']

interface AchievementRow {
  id: string
  groupId: string
  title: string
  achievementType: AchievementType | null
  source: 'auto' | 'manual'
  date: Date
  content?: string
}

interface SubTaskWithGroup extends AgendaSubTask {
  group_id: string
}

interface PeriodRange { start: Date; end: Date; label: string }

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return `rgba(156,163,175,${alpha})`
  return `rgba(${r},${g},${b},${alpha})`
}

function pad2(n: number) { return String(n).padStart(2, '0') }
function ym(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` }
function formatYM(d: Date) { return `${d.getFullYear()}년 ${d.getMonth() + 1}월` }

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekRange(ws: Date): string {
  const we = new Date(ws)
  we.setDate(we.getDate() + 6)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${ws.getFullYear()}년 ${fmt(ws)} ~ ${fmt(we)}`
}

function computeRange(period: QuickPeriod, anchor: Date, weekStart: Date): PeriodRange | null {
  if (period === '포트폴리오') return null
  if (period === '주간') {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 7)
    return { start: weekStart, end, label: formatWeekRange(weekStart) }
  }
  if (period === '당월') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
    return { start, end, label: formatYM(anchor) }
  }
  if (period === '분기') {
    const q = Math.floor(anchor.getMonth() / 3)
    const start = new Date(anchor.getFullYear(), q * 3, 1)
    const end = new Date(anchor.getFullYear(), q * 3 + 3, 1)
    return { start, end, label: `${anchor.getFullYear()}년 ${q + 1}분기` }
  }
  if (period === '상반기') {
    const start = new Date(anchor.getFullYear(), 0, 1)
    const end = new Date(anchor.getFullYear(), 6, 1)
    return { start, end, label: `${anchor.getFullYear()}년 상반기` }
  }
  // 하반기
  const start = new Date(anchor.getFullYear(), 6, 1)
  const end = new Date(anchor.getFullYear() + 1, 0, 1)
  return { start, end, label: `${anchor.getFullYear()}년 하반기` }
}

function shiftAnchor(period: QuickPeriod, anchor: Date, delta: number): Date {
  if (period === '분기') return new Date(anchor.getFullYear(), anchor.getMonth() + delta * 3, 1)
  if (period === '상반기' || period === '하반기') return new Date(anchor.getFullYear() + delta, anchor.getMonth(), 1)
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
}

function prevRange(range: PeriodRange): PeriodRange {
  const duration = range.end.getTime() - range.start.getTime()
  return { start: new Date(range.start.getTime() - duration), end: range.start, label: '' }
}

function inRange(date: Date, range: PeriodRange | null): boolean {
  if (!range) return true
  return date >= range.start && date < range.end
}

export default function CompletedPage() {
  const supabase = createClient()

  const [groups, setGroups] = useState<AgendaGroup[]>([])
  const [subTasks, setSubTasks] = useState<SubTaskWithGroup[]>([])
  const [manualItems, setManualItems] = useState<ManualAchievement[]>([])
  const [loading, setLoading] = useState(true)

  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('당월')
  const [anchor, setAnchor] = useState<Date>(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [filterType, setFilterType] = useState<FilterType>('전체')
  const [addModalGroup, setAddModalGroup] = useState<AgendaGroup | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: gData }, { data: iData }, { data: stData }, { data: maData }] = await Promise.all([
        supabase.from('agenda_groups').select('*').order('sort_order'),
        supabase.from('agenda_items').select('id, group_id'),
        supabase.from('agenda_sub_tasks').select('id, agenda_item_id, title, status, sort_order, achievement_type, created_at, updated_at').eq('status', 'done'),
        supabase.from('manual_achievements').select('*').order('created_at', { ascending: false }),
      ])
      setGroups((gData ?? []) as AgendaGroup[])
      const itemGroupMap: Record<string, string> = Object.fromEntries(((iData ?? []) as { id: string; group_id: string }[]).map(i => [i.id, i.group_id]))
      setSubTasks(
        ((stData ?? []) as AgendaSubTask[])
          .map(st => ({ ...st, group_id: itemGroupMap[st.agenda_item_id] }))
          .filter((st): st is SubTaskWithGroup => !!st.group_id)
      )
      setManualItems((maData ?? []) as ManualAchievement[])
      setLoading(false)
    }
    load()
  }, [])

  const range = useMemo(() => computeRange(quickPeriod, anchor, weekStart), [quickPeriod, anchor, weekStart])

  const allRows: AchievementRow[] = useMemo(() => [
    ...subTasks.map((st): AchievementRow => ({
      id: st.id, groupId: st.group_id, title: st.title, achievementType: st.achievement_type ?? null,
      source: 'auto', date: new Date(st.updated_at),
    })),
    ...manualItems.map((m): AchievementRow => ({
      id: m.id, groupId: m.group_id, title: m.title, achievementType: m.achievement_type ?? null,
      source: 'manual', date: new Date(`${m.month}-01T00:00:00`), content: m.content,
    })),
  ], [subTasks, manualItems])

  const currentRows = useMemo(() => allRows.filter(r => inRange(r.date, range)), [allRows, range])
  const prevRows = useMemo(() => range ? allRows.filter(r => inRange(r.date, prevRange(range))) : [], [allRows, range])
  const typeFilteredRows = useMemo(
    () => filterType === '전체' ? currentRows : currentRows.filter(r => r.achievementType === filterType),
    [currentRows, filterType]
  )

  const total = currentRows.length
  const delta = total - prevRows.length
  const countOf = (t: AchievementType) => currentRows.filter(r => r.achievementType === t).length
  const pctOf = (t: AchievementType) => total > 0 ? Math.round(countOf(t) / total * 100) : 0

  function shift(delta: number) {
    if (quickPeriod === '주간') { setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + delta * 7); return d }); return }
    setAnchor(prev => shiftAnchor(quickPeriod, prev, delta))
  }

  async function addManualAchievement(input: { groupId: string; title: string; achievementType: AchievementType | null; month: string; content: string }) {
    const { data, error } = await supabase.from('manual_achievements')
      .insert({ group_id: input.groupId, title: input.title.trim(), achievement_type: input.achievementType, month: input.month, content: input.content.trim() })
      .select().single()
    if (error || !data) return
    setManualItems(prev => [data as ManualAchievement, ...prev])
    setAddModalGroup(null)
  }

  async function deleteManualAchievement(id: string) {
    if (!confirm('직접 추가한 성과를 삭제하시겠습니까?')) return
    await supabase.from('manual_achievements').delete().eq('id', id)
    setManualItems(prev => prev.filter(m => m.id !== id))
  }

  async function updateRowType(row: AchievementRow, newType: AchievementType | null) {
    if (row.source === 'auto') {
      await supabase.from('agenda_sub_tasks').update({ achievement_type: newType }).eq('id', row.id)
      setSubTasks(prev => prev.map(st => st.id === row.id ? { ...st, achievement_type: newType } : st))
    } else {
      await supabase.from('manual_achievements').update({ achievement_type: newType }).eq('id', row.id)
      setManualItems(prev => prev.map(m => m.id === row.id ? { ...m, achievement_type: newType } : m))
    }
  }

  const defaultAddMonth = range ? ym(range.start) : ym(new Date())

  const overviewCards = [
    {
      key: 'total', label: '전체 완료', icon: CheckSquare, iconColor: 'rgba(226,232,240,0.6)',
      value: total,
      sub: range ? (delta === 0 ? '지난 기간과 동일' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}건`) : '전체 누적',
      subColor: !range ? '#7d838d' : delta > 0 ? '#7BAE94' : delta < 0 ? '#D98B8B' : '#7d838d',
    },
    { key: '기획', label: '기획', icon: Lightbulb, iconColor: ACH_COLOR['기획'], value: countOf('기획'), sub: `${pctOf('기획')}%`, subColor: '#7d838d' },
    { key: '운영', label: '운영', icon: Settings, iconColor: ACH_COLOR['운영'], value: countOf('운영'), sub: `${pctOf('운영')}%`, subColor: '#7d838d' },
    { key: '개선', label: '개선', icon: TrendingUp, iconColor: ACH_COLOR['개선'], value: countOf('개선'), sub: `${pctOf('개선')}%`, subColor: '#7d838d' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {addModalGroup && (
        <AddAchievementModal
          group={addModalGroup}
          defaultMonth={defaultAddMonth}
          onSave={addManualAchievement}
          onClose={() => setAddModalGroup(null)}
        />
      )}

      <div className="flex-shrink-0 pt-6 pb-4">
        <h1 className="text-xl font-bold text-[#E2E8F0]">완료 성과</h1>
      </div>

      {/* 기간 선택 + 날짜 네비게이션 */}
      <div className="flex-shrink-0 flex items-center gap-3 flex-wrap mb-5">
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, display: 'flex', gap: 2 }}>
          {QUICK_PERIODS.map(p => (
            <button key={p} onClick={() => setQuickPeriod(p)}
              className="transition-all"
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: quickPeriod === p ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: quickPeriod === p ? '#E2E8F0' : 'rgba(226,232,240,0.45)',
              }}>
              {p}
            </button>
          ))}
        </div>

        {range && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => shift(-1)} className="flex items-center transition-colors" style={{ color: 'rgba(226,232,240,0.5)' }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#E2E8F0', whiteSpace: 'nowrap' }}>
              <Calendar size={13} style={{ opacity: 0.5 }} />
              {range.label}
            </span>
            <button onClick={() => shift(1)} className="flex items-center transition-colors" style={{ color: 'rgba(226,232,240,0.5)' }}>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {/* 오버뷰 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 mb-6"
          style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 20, overflow: 'hidden' }}>
          {overviewCards.map((card, i) => {
            const Icon = card.icon
            return (
              <div key={card.key} style={{ padding: '20px 24px', borderRight: i < overviewCards.length - 1 ? '0.5px solid rgba(255,255,255,0.08)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(226,232,240,0.5)', marginBottom: 10 }}>
                  <Icon size={13} style={{ color: card.iconColor, flexShrink: 0 }} />
                  {card.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 500, color: '#E2E8F0', lineHeight: 1 }}>
                  {card.value}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 3, opacity: 0.5 }}>건</span>
                </div>
                <div style={{ fontSize: 11, color: card.subColor, marginTop: 8 }}>{card.sub}</div>
              </div>
            )
          })}
        </div>

        {/* 기획/운영/개선 필터 탭 */}
        <div className="flex items-center gap-1.5 mb-5">
          {FILTER_TYPES.map(f => (
            <button key={f} onClick={() => setFilterType(f)}
              className="transition-all"
              style={{
                padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                background: filterType === f ? '#378ADD' : 'transparent',
                color: filterType === f ? '#fff' : 'rgba(226,232,240,0.45)',
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* 그룹별 카드 목록 */}
        {loading ? (
          <p className="text-sm text-[rgba(226,232,240,0.3)] text-center py-12">불러오는 중...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-[rgba(226,232,240,0.3)] text-center py-12">프로젝트 탭에 그룹이 없습니다</p>
        ) : (
          <div className="pb-6">
            {groups.map((g, idx) => {
              const groupRows = typeFilteredRows.filter(r => r.groupId === g.id)
              const groupColor = g.color || '#9CA3AF'
              return (
                <div key={g.id}
                  style={{ marginTop: idx === 0 ? 0 : 14, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: '14px 24px', overflow: 'hidden' }}>
                  {/* 헤더 배너 — 프로젝트 탭 그룹 색상 반영 */}
                  <div className="flex items-center justify-between" style={{ margin: '-14px -24px 0 -24px', padding: '19px', background: hexToRgba(groupColor, 0.16), borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
                    <div className="flex items-center">
                      <span style={{ width: 32, flexShrink: 0, fontSize: 13, opacity: 0.6, color: groupColor, userSelect: 'none', cursor: 'grab' }}>⠿</span>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: groupColor, flexShrink: 0, marginRight: 8 }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#E2E8F0' }}>{g.name}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: hexToRgba(groupColor, 0.85) }}>{groupRows.length}건 완료</span>
                    </div>
                    <button onClick={() => setAddModalGroup(g)}
                      className="transition-colors"
                      style={{ fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 999, background: hexToRgba(groupColor, 0.22), color: '#E2E8F0', border: `1px solid ${hexToRgba(groupColor, 0.45)}` }}>
                      + 성과 추가
                    </button>
                  </div>

                  {/* 본문 행 */}
                  {groupRows.length === 0 ? (
                    <div style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12, color: 'rgba(226,232,240,0.3)' }}>
                      이 기간에 완료된 항목이 없습니다
                    </div>
                  ) : (
                    groupRows.map(row => (
                      <div key={row.id} className="group/row flex items-center gap-2.5 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                        style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: `2.5px solid ${hexToRgba(groupColor, 0.35)}` }}>
                        {row.source === 'auto' ? (
                          <Link href={`/subtasks/${row.id}`}
                            style={{ flex: 1, fontSize: 13, color: '#E2E8F0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            className="hover:underline">
                            {row.title}
                          </Link>
                        ) : (
                          <span style={{ flex: 1, fontSize: 13, color: '#E2E8F0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
                        )}
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, flexShrink: 0,
                          background: row.source === 'auto' ? 'rgba(255,255,255,0.06)' : 'rgba(76,127,224,0.15)',
                          color: row.source === 'auto' ? 'rgba(226,232,240,0.4)' : '#A8C4F0',
                        }}>
                          {row.source === 'auto' ? '자동' : '수기'}
                        </span>
                        <select value={row.achievementType ?? ''} onChange={e => updateRowType(row, (e.target.value || null) as AchievementType | null)}
                          className="flex-shrink-0"
                          style={{
                            fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', outline: 'none',
                            background: row.achievementType ? `${ACH_COLOR[row.achievementType]}2A` : 'rgba(255,255,255,0.06)',
                            color: row.achievementType ? ACH_COLOR[row.achievementType] : 'rgba(226,232,240,0.35)',
                          }}>
                          <option value="" style={{ background: '#1e2130', color: '#E2E8F0' }}>미분류</option>
                          {ACH_TYPES.map(t => <option key={t} value={t} style={{ background: '#1e2130', color: '#E2E8F0' }}>{t}</option>)}
                        </select>
                        {row.source === 'manual' && (
                          <button onClick={() => deleteManualAchievement(row.id)}
                            className="flex-shrink-0 opacity-0 group-hover/row:opacity-100 transition-all"
                            style={{ fontSize: 12, color: 'rgba(226,232,240,0.3)' }}>
                            ×
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AddAchievementModal({
  group, defaultMonth, onSave, onClose,
}: {
  group: AgendaGroup
  defaultMonth: string
  onSave: (input: { groupId: string; title: string; achievementType: AchievementType | null; month: string; content: string }) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [achievementType, setAchievementType] = useState<AchievementType | null>(null)
  const [month, setMonth] = useState(defaultMonth)
  const [content, setContent] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    if (!title.trim()) { titleRef.current?.focus(); return }
    onSave({ groupId: group.id, title, achievementType, month, content })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div
        className="backdrop-blur-xl rounded-3xl p-6 w-full max-w-md flex flex-col gap-4"
        style={{ background: 'rgba(30,33,42,0.95)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.07) inset' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[rgba(226,232,240,0.9)]">성과 직접 추가</h2>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'rgba(226,232,240,0.5)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: group.color || '#9CA3AF', flexShrink: 0 }} />
              {group.name}
            </p>
          </div>
          <button onClick={onClose} className="text-[rgba(226,232,240,0.4)] hover:text-[rgba(226,232,240,0.8)] text-lg leading-none transition-colors">×</button>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {([null, ...ACH_TYPES] as (AchievementType | null)[]).map(t => {
            const on = achievementType === t
            const color = t ? ACH_COLOR[t] : '#9CA3AF'
            return (
              <button key={t ?? '미분류'} onClick={() => setAchievementType(t)}
                className="text-xs px-3 py-1.5 rounded-full border font-medium transition-all"
                style={on
                  ? { background: color, color: '#101317', borderColor: color }
                  : { background: `${color}1F`, color, borderColor: `${color}55`, opacity: 0.7 }}>
                {t ?? '미분류'}
              </button>
            )
          })}
        </div>

        <input ref={titleRef} autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave() }}
          placeholder="제목 (필수)"
          className="w-full text-sm font-semibold text-[#E2E8F0] focus:outline-none pb-2 bg-transparent placeholder:text-white/30"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }} />

        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder="설명 (선택)" rows={3}
          className="w-full text-sm text-[#E2E8F0] bg-transparent focus:outline-none resize-none placeholder:text-white/25 p-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />

        <div className="flex items-center justify-between">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="text-xs text-[rgba(226,232,240,0.7)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.09)] rounded-full px-3 py-1.5 focus:outline-none"
            style={{ colorScheme: 'dark' }} />
          <div className="flex gap-2">
            <button onClick={onClose}
              className="text-xs px-4 py-2 rounded-full border bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.09)] text-[rgba(226,232,240,0.5)] hover:bg-[rgba(255,255,255,0.1)] transition-all">
              취소
            </button>
            <button onClick={handleSave} disabled={!title.trim()}
              className="text-xs px-4 py-2 rounded-full border bg-[#4C7FE0] border-[#4C7FE0] text-white shadow-sm disabled:opacity-40 transition-all">
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
