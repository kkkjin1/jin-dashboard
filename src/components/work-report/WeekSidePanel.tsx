'use client'

// 수시보고 화면 오른쪽 — 홈 '금주 업무'를 세로로 쌓아 보여주는 패널 (2026-11-24).
// 급한 일을 보면서 수시보고를 쓰는 흐름용: 보기 + 완료 체크만. 요일 이동·추가·삭제는 홈에서.
// 분류 계산은 홈과 같은 buildWeekBoard를 써서 두 화면 내용이 어긋나지 않게 한다.
// 세로 순서: 직전주 미완료(접힘) → 오늘(항상 펼침) → 이후 요일(펼침) → 지난 요일(접힘) → 다음주로 연기(접힘)

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Repeat2, X } from 'lucide-react'
import type { QuickTodo } from '@/types'
import { useUserSetting } from '@/hooks/useUserSetting'
import { buildWeekBoard, shiftDateStr, weekItemDone, type MeetingSchedule, type SubTaskWithContext, type TodayTodo, type WeekItem } from '@/lib/weekBoard'
import { S, todayStr } from './style'

const OPEN_KEY = 'adhoc_week_panel_sections_v1'
const ST_SELECT = '*, agenda_items(id, title, agenda_groups(name, color, category))'
const DOW = '월화수목금'

type Section = { id: string; label: string; sub?: string; items: WeekItem[]; tone?: 'today' | 'warn' | 'muted'; showDate?: boolean; defaultOpen: boolean; fixedOpen?: boolean; groups?: { label: string; items: WeekItem[] }[] }

function shortDate(d: string) { const [, m, dd] = d.split('-').map(Number); return `${m}.${String(dd).padStart(2, '0')}` }

export default function WeekSidePanel({ supabase, onClose }: { supabase: SupabaseClient; onClose?: () => void }) {
  const [taskTodos, setTaskTodos] = useState<TodayTodo[]>([])
  const [quickTodos, setQuickTodos] = useState<QuickTodo[]>([])
  const [subTasks, setSubTasks] = useState<SubTaskWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [today, setToday] = useState(todayStr)
  const [weekOffset, setWeekOffset] = useState(0)   // 0 = 이번 주, -1 = 전주, 1 = 다음 주
  const { value: fixedSchedules } = useUserSetting<MeetingSchedule[]>('meeting_schedules', [])
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean> } catch { return {} }
  })

  // 홈과 같은 조회 범위 — 미완료 전체 + 최근 60일 완료분(취소선으로 남김)
  const load = useCallback(async () => {
    const t = todayStr()
    const since = shiftDateStr(t, -60)
    const [td, qt, stA, stD] = await Promise.all([
      supabase.from('task_todos').select('*, tasks(id, title, short_name, part)').or(`done.eq.false,target_date.gte.${since}`).order('sort_order').limit(200),
      supabase.from('quick_todos').select('*').or(`done.eq.false,target_date.gte.${since}`).order('sort_order'),
      supabase.from('agenda_sub_tasks').select(ST_SELECT).eq('status', 'active').neq('kind', 'record').order('sort_order').limit(100),
      supabase.from('agenda_sub_tasks').select(ST_SELECT).eq('status', 'done').neq('kind', 'record').gte('target_date', since).order('sort_order').limit(100),
    ])
    setToday(t)   // 자정을 넘겨 다시 불러오면 '오늘'도 갱신
    const err = td.error ?? qt.error ?? stA.error ?? stD.error
    if (err) { setError(err.message); setLoading(false); return }
    setError(null)
    setTaskTodos((td.data ?? []) as TodayTodo[])
    setQuickTodos((qt.data ?? []) as QuickTodo[])
    setSubTasks([...(stA.data ?? []), ...(stD.data ?? [])] as SubTaskWithContext[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void Promise.resolve().then(load)   // 첫 조회 (effect 본문에서 setState 연쇄 경고 회피)
    // 홈 탭에서 바꾼 내용을 돌아왔을 때 반영
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [load])

  const board = useMemo(
    () => buildWeekBoard({ today, weekOffset, fixedSchedules, taskTodos, quickTodos, subTasks }),
    [today, weekOffset, fixedSchedules, taskTodos, quickTodos, subTasks],
  )

  const sections: Section[] = useMemo(() => {
    const { cols, weekDays, olderItems } = board
    const isWeekend = !weekDays.includes(today)
    const out: Section[] = []
    out.push({ id: 'prev', label: '직전주 미완료', items: [...cols[0], ...olderItems].sort((a, b) => a.date.localeCompare(b.date)), tone: 'warn', showDate: true, defaultOpen: false })
    const pastGroups: { label: string; items: WeekItem[] }[] = []
    weekDays.forEach((d, i) => {
      const label = `${DOW[i]} ${shortDate(d)}`
      if (d === today) out.push({ id: 'today', label: '오늘', sub: label, items: cols[i + 1], tone: 'today', defaultOpen: true, fixedOpen: true })
      else if (d > today) out.push({ id: `d${i}`, label, items: cols[i + 1], defaultOpen: true })
      else pastGroups.push({ label, items: cols[i + 1] })
    })
    // 전주를 볼 때는 요일 전체가 지난 날이라 펼쳐서 요일별로 (펼침 기억도 이번 주와 따로)
    if (pastGroups.length) out.push(weekOffset < 0
      ? { id: 'pastweek', label: '요일별', items: pastGroups.flatMap(g => g.items), groups: pastGroups, defaultOpen: true }
      : { id: 'past', label: '지난 요일', items: pastGroups.flatMap(g => g.items), groups: pastGroups, tone: 'muted', defaultOpen: isWeekend })
    out.push({ id: 'defer', label: '다음주로 연기', items: cols[6], showDate: true, defaultOpen: false })
    return out
  }, [board, today, weekOffset])

  function toggleSection(id: string, cur: boolean) {
    setOpenMap(m => {
      const next = { ...m, [id]: !cur }
      try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* 무시 */ }
      return next
    })
  }

  // 완료 체크 — 홈과 같은 규칙(완료해도 취소선으로 남고, 다시 누르면 취소). 실패하면 되돌림
  async function toggleDone(it: WeekItem) {
    if (it.kind === 'todo' && it.todo) {
      const cur = it.todo, done = !cur.done, done_at = done ? new Date().toISOString() : null
      setTaskTodos(p => p.map(t => t.id === cur.id ? { ...t, done, done_at } : t))
      const { error: e } = await supabase.from('task_todos').update({ done, done_at }).eq('id', cur.id)
      if (e) { console.error('할 일 완료 처리 실패:', e.message); setTaskTodos(p => p.map(t => t.id === cur.id ? { ...t, done: cur.done, done_at: cur.done_at } : t)) }
    } else if (it.kind === 'quick' && it.quick) {
      const cur = it.quick, done = !cur.done
      setQuickTodos(p => p.map(t => t.id === cur.id ? { ...t, done } : t))
      const { error: e } = await supabase.from('quick_todos').update({ done }).eq('id', cur.id)
      if (e) { console.error('즉석 할일 완료 처리 실패:', e.message); setQuickTodos(p => p.map(t => t.id === cur.id ? { ...t, done: cur.done } : t)) }
    } else if (it.kind === 'agenda' && it.st) {
      const cur = it.st, status = cur.status === 'done' ? 'active' : 'done'
      setSubTasks(p => p.map(s => s.id === cur.id ? { ...s, status } as SubTaskWithContext : s))
      const { error: e } = await supabase.from('agenda_sub_tasks').update({ status }).eq('id', cur.id)
      if (e) { console.error('세부task 완료 처리 실패:', e.message); setSubTasks(p => p.map(s => s.id === cur.id ? cur : s)) }
    }
  }

  function renderItem(it: WeekItem, showDate?: boolean) {
    const done = weekItemDone(it)
    const meta = [it.kind === 'fixed' ? '' : it.meta, showDate ? shortDate(it.date) : ''].filter(Boolean).join(' · ')
    return (
      <div key={it.key} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[rgba(var(--ink-rgb),0.04)]">
        {it.kind === 'fixed' ? (
          <Repeat2 size={12} strokeWidth={2} className="flex-shrink-0 mt-[3px]" style={{ color: S.t3 }} />
        ) : (
          <button type="button" onClick={() => void toggleDone(it)} aria-label={done ? '완료 취소' : '완료'}
            className="flex-shrink-0 mt-[2px] flex items-center justify-center rounded"
            style={{ width: 14, height: 14, border: `1.5px solid ${done ? '#38BE98' : 'rgba(var(--ink-rgb),0.22)'}`, background: done ? '#38BE98' : 'transparent', transition: 'all 150ms ease-out' }}>
            {done && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p title={it.title} className="text-[12.5px] leading-[18px]"
            style={{ color: done ? S.t3 : S.t1, textDecoration: done ? 'line-through' : 'none', wordBreak: 'keep-all', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {it.kind === 'fixed' && <span className="mr-1.5 tabular-nums" style={{ color: S.t3 }}>{it.meta}</span>}
            {it.title}
          </p>
          {meta && <p className="text-[10.5px] leading-[15px] truncate" style={{ color: S.t4 }}>{meta}</p>}
        </div>
      </div>
    )
  }

  const toneColor = (s: Section) => s.tone === 'today' ? 'var(--accent-tint-text)' : s.tone === 'warn' && s.items.some(i => !weekItemDone(i)) ? '#C08A2E' : s.tone === 'muted' ? S.t3 : S.t2

  return (
    <div className="h-full flex flex-col" style={{ background: S.bg }}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 flex-shrink-0">
        <CalendarCheck size={14} strokeWidth={2.2} style={{ color: '#5E8FBF' }} />
        <p className="text-[12.5px] font-semibold" style={{ color: S.t2 }}>금주 업무</p>
        <div className="flex-1" />
        <button type="button" onClick={() => void load()} title="새로고침"
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(var(--ink-rgb),0.06)]" style={{ color: S.t3 }}>
          <RefreshCw size={13} />
        </button>
        {onClose && (
          <button type="button" onClick={onClose} title="닫기"
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(var(--ink-rgb),0.06)]" style={{ color: S.t3 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* 주 이동 — 전주 · 이번 주 · 다음 주 */}
      <div className="flex items-center gap-1 px-3 pb-2 flex-shrink-0">
        <button type="button" onClick={() => setWeekOffset(w => w - 1)} aria-label="이전 주" title="이전 주"
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(var(--ink-rgb),0.06)]" style={{ color: S.t2 }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-[12px] font-semibold min-w-[44px] text-center" style={{ color: weekOffset === 0 ? 'var(--accent-tint-text)' : S.t1 }}>
          {weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '전주' : weekOffset === 1 ? '다음 주' : `${weekOffset > 0 ? '+' : ''}${weekOffset}주`}
        </span>
        <button type="button" onClick={() => setWeekOffset(w => w + 1)} aria-label="다음 주" title="다음 주"
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(var(--ink-rgb),0.06)]" style={{ color: S.t2 }}>
          <ChevronRight size={14} />
        </button>
        <span className="text-[11px] tabular-nums ml-1" style={{ color: S.t4 }}>{shortDate(board.weekDays[0])} – {shortDate(board.weekDays[4])}</span>
        <div className="flex-1" />
        {weekOffset !== 0 && (
          <button type="button" onClick={() => setWeekOffset(0)}
            className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: S.t3, border: `1px solid ${S.borderStrong}` }}>
            이번 주로
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
        {loading && <p className="px-2 py-3 text-[12px]" style={{ color: S.t4 }}>불러오는 중…</p>}
        {error && <p className="px-2 py-3 text-[12px]" style={{ color: S.danger }}>불러오지 못했습니다: {error}</p>}
        {!loading && !error && sections.map(s => {
          const open = s.fixedOpen || (openMap[s.id] ?? s.defaultOpen)
          const openCount = s.items.filter(i => i.kind !== 'fixed' && !weekItemDone(i)).length
          const isToday = s.tone === 'today'
          return (
            <section key={s.id} className="mb-1.5"
              style={isToday ? { background: 'rgba(var(--accent-tint-rgb),0.06)', border: '1px solid rgba(var(--accent-tint-rgb),0.30)', borderRadius: 10, padding: '2px 0 4px' } : undefined}>
              <button type="button" disabled={s.fixedOpen} onClick={() => toggleSection(s.id, open)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left enabled:hover:bg-[rgba(var(--ink-rgb),0.04)]">
                {!s.fixedOpen && (open ? <ChevronDown size={13} style={{ color: S.t4 }} /> : <ChevronRight size={13} style={{ color: S.t4 }} />)}
                <span className="text-[12.5px] font-semibold" style={{ color: toneColor(s) }}>{s.label}</span>
                {s.sub && <span className="text-[11px] tabular-nums" style={{ color: S.t3 }}>{s.sub}</span>}
                {openCount > 0 && <span className="text-[11px] tabular-nums" style={{ color: S.t3 }}>{openCount}</span>}
              </button>
              {open && (
                s.items.length === 0
                  ? <p className="px-2 pl-[26px] pb-1.5 text-[11.5px]" style={{ color: S.t4 }}>없음</p>
                  : s.groups
                    ? s.groups.map(g => (
                        <div key={g.label} style={{ opacity: 0.75 }}>
                          <p className="px-2 pt-1 text-[11px] font-medium" style={{ color: S.t3 }}>{g.label}</p>
                          {g.items.length ? g.items.map(it => renderItem(it)) : <p className="px-2 pb-1 text-[11px]" style={{ color: S.t4 }}>없음</p>}
                        </div>
                      ))
                    : s.items.map(it => renderItem(it, s.showDate))
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
