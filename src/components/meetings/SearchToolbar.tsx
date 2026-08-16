'use client'

import { useRef, useEffect, useState } from 'react'
import { Calendar, ChevronDown, ArrowUpDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import {
  format, addMonths, subMonths, getDaysInMonth, getDay, startOfMonth,
  startOfWeek, endOfWeek, endOfMonth, startOfYear, endOfYear,
} from 'date-fns'
import { ko } from 'date-fns/locale'

export type SortOrder = '최신순' | '오래된순' | '제목순'

export type DateSelection = {
  from: string
  to: string
  label: string
} | null

interface Props {
  dateSelection: DateSelection
  setDateSelection: (v: DateSelection) => void
  teamFilter: string
  setTeamFilter: (v: string) => void
  sortOrder: SortOrder
  setSortOrder: (v: SortOrder) => void
  catOrder: string[]
  setCatOrder: (order: string[]) => void
  total: number
}

const SORT_OPTIONS: SortOrder[] = ['최신순', '오래된순', '제목순']

function getPeriodSelection(label: string): DateSelection {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const yr = today.getFullYear()
  const mo = today.getMonth()

  switch (label) {
    case '오늘':
      return { from: todayStr, to: todayStr, label }
    case '이번주': {
      const from = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const to   = format(endOfWeek(today,   { weekStartsOn: 1 }), 'yyyy-MM-dd')
      return { from, to, label }
    }
    case '이번달': {
      const from = format(startOfMonth(today), 'yyyy-MM-dd')
      const to   = format(endOfMonth(today),   'yyyy-MM-dd')
      return { from, to, label }
    }
    case '이번분기': {
      const qStart = Math.floor(mo / 3) * 3
      const from = format(new Date(yr, qStart, 1), 'yyyy-MM-dd')
      const to   = format(endOfMonth(new Date(yr, qStart + 2, 1)), 'yyyy-MM-dd')
      return { from, to, label }
    }
    case '이번반기': {
      const hStart = mo < 6 ? 0 : 6
      const from = format(new Date(yr, hStart, 1), 'yyyy-MM-dd')
      const to   = format(endOfMonth(new Date(yr, hStart + 5, 1)), 'yyyy-MM-dd')
      return { from, to, label }
    }
    case '올해': {
      const from = format(startOfYear(today), 'yyyy-MM-dd')
      const to   = format(endOfYear(today),   'yyyy-MM-dd')
      return { from, to, label }
    }
    default:
      return null
  }
}

const PERIOD_OPTIONS = ['오늘', '이번주', '이번달', '이번분기', '이번반기', '올해']

export default function SearchToolbar({
  dateSelection, setDateSelection,
  teamFilter, setTeamFilter,
  sortOrder, setSortOrder,
  catOrder, setCatOrder,
  total,
}: Props) {
  const [calOpen, setCalOpen] = useState(false)
  const [calViewMonth, setCalViewMonth] = useState(() => new Date())
  const calRef = useRef<HTMLDivElement>(null)

  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  const [editingTeam, setEditingTeam] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingTeam, setAddingTeam] = useState(false)
  const [addValue, setAddValue] = useState('')
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null)

  // 시작일 클릭 후 종료일을 기다리는 상태 — 임의 구간을 직접 지정할 수 있게 함
  const [rangeStart, setRangeStart] = useState<string | null>(null)

  const dragIndexRef = useRef<number | null>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) { setCalOpen(false); setRangeStart(null) }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // 달력 계산
  const year = calViewMonth.getFullYear()
  const month = calViewMonth.getMonth()
  const daysInMonth = getDaysInMonth(calViewMonth)
  const firstDayOfWeek = getDay(startOfMonth(calViewMonth))

  const calCells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) calCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d)

  function calDayClick(day: number) {
    const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd')

    // 이미 시작일을 찍어둔 상태면 이번 클릭을 종료일로 확정 (구간 직접 지정)
    if (rangeStart) {
      const from = rangeStart <= dateStr ? rangeStart : dateStr
      const to   = rangeStart <= dateStr ? dateStr : rangeStart
      const label = from === to
        ? format(new Date(from + 'T00:00:00'), 'M월 d일', { locale: ko })
        : `${format(new Date(from + 'T00:00:00'), 'M/d')} - ${format(new Date(to + 'T00:00:00'), 'M/d')}`
      setDateSelection({ from, to, label })
      setRangeStart(null)
      setCalOpen(false)
      return
    }

    // 이미 선택된 단일 날짜를 다시 클릭하면 해제
    if (dateSelection?.from === dateStr && dateSelection?.to === dateStr) {
      setDateSelection(null)
      return
    }

    // 시작일 지정 — 종료일을 고를 때까지 창을 열어둔다
    setRangeStart(dateStr)
  }

  function selectPeriod(label: string) {
    setRangeStart(null)
    if (dateSelection?.label === label) {
      setDateSelection(null)
    } else {
      setDateSelection(getPeriodSelection(label))
    }
    setCalOpen(false)
  }

  // 드래그로 팀 순서 변경
  function onDragStart(index: number) {
    dragIndexRef.current = index
  }
  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    const next = [...catOrder]
    const [item] = next.splice(from, 1)
    next.splice(index, 0, item)
    dragIndexRef.current = index
    setCatOrder(next)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragIndexRef.current = null
  }

  // 팀 편집
  function startEdit(team: string) {
    setEditingTeam(team)
    setEditValue(team)
  }
  function commitEdit() {
    const newName = editValue.trim()
    if (!newName || newName === editingTeam) { setEditingTeam(null); return }
    setCatOrder(catOrder.map(t => t === editingTeam ? newName : t))
    if (teamFilter === editingTeam) setTeamFilter(newName)
    setEditingTeam(null)
  }
  function deleteTeam(team: string) {
    setCatOrder(catOrder.filter(t => t !== team))
    if (teamFilter === team) setTeamFilter('전체')
  }
  function commitAdd() {
    const name = addValue.trim()
    if (name && !catOrder.includes(name)) {
      const withoutEtc = catOrder.filter(t => t !== '기타')
      const hasEtc = catOrder.includes('기타')
      setCatOrder([...withoutEtc, name, ...(hasEtc ? ['기타'] : [])])
    }
    setAddingTeam(false)
    setAddValue('')
  }

  const dropdownBase: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 100,
    background: 'rgba(19,22,32,0.98)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    backdropFilter: 'blur(20px)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
    padding: '4px',
  }

  const calLabel = dateSelection ? dateSelection.label : '날짜 선택'
  const hasDate = !!dateSelection

  return (
    <div className="flex-shrink-0" style={{ position: 'sticky', top: 0, zIndex: 40, background: '#0F1319', paddingBottom: 12 }}>
      {/* 달력 + 정렬 */}
      <div className="flex items-center gap-2 mb-3">
        {/* 달력 피커 */}
        <div ref={calRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setCalOpen(v => !v); setRangeStart(null) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 transition-colors"
            style={{
              background: hasDate ? 'rgba(76,127,224,0.12)' : 'rgba(255,255,255,0.06)',
              border: hasDate ? '1px solid rgba(76,127,224,0.3)' : '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <Calendar size={13} style={{ color: hasDate ? '#7EB3FF' : 'rgba(226,232,240,0.4)' }} />
            <span className="text-[12px]" style={{ color: hasDate ? '#7EB3FF' : 'rgba(226,232,240,0.5)' }}>{calLabel}</span>
            {hasDate && (
              <span
                onClick={e => { e.stopPropagation(); setDateSelection(null) }}
                className="flex items-center ml-0.5 cursor-pointer"
              >
                <X size={10} style={{ color: 'rgba(226,232,240,0.5)' }} />
              </span>
            )}
          </button>

          {calOpen && (
            <div style={{ ...dropdownBase, right: 0, padding: 12, minWidth: 420 }}>
              <div className="flex gap-3">
                {/* 왼쪽: 기간 선택 */}
                <div className="flex flex-col gap-1" style={{ minWidth: 88 }}>
                  <p className="text-[10px] mb-1" style={{ color: 'rgba(226,232,240,0.3)' }}>기간 선택</p>
                  <button
                    onClick={() => { setDateSelection(null); setRangeStart(null); setCalOpen(false) }}
                    className="text-left text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      background: !dateSelection ? 'rgba(76,127,224,0.15)' : 'transparent',
                      color: !dateSelection ? '#7EB3FF' : 'rgba(226,232,240,0.55)',
                    }}
                    onMouseEnter={e => { if (dateSelection) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={e => { if (dateSelection) e.currentTarget.style.background = 'transparent' }}
                  >
                    전체
                  </button>
                  {PERIOD_OPTIONS.map(label => (
                    <button
                      key={label}
                      onClick={() => selectPeriod(label)}
                      className="text-left text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                      style={{
                        background: dateSelection?.label === label ? 'rgba(76,127,224,0.15)' : 'transparent',
                        color: dateSelection?.label === label ? '#7EB3FF' : 'rgba(226,232,240,0.55)',
                      }}
                      onMouseEnter={e => { if (dateSelection?.label !== label) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { if (dateSelection?.label !== label) e.currentTarget.style.background = 'transparent' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* 구분선 */}
                <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

                {/* 오른쪽: 달력 */}
                <div className="flex-1">
                  <p className="text-[10px] mb-2" style={{ color: rangeStart ? '#7EB3FF' : 'rgba(226,232,240,0.3)' }}>
                    {rangeStart
                      ? `시작일 ${format(new Date(rangeStart + 'T00:00:00'), 'M/d', { locale: ko })} 선택됨 — 종료일을 클릭하세요`
                      : '날짜 선택 (클릭 두 번으로 구간 지정 가능)'}
                  </p>
                  {/* 월 네비게이션 */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setCalViewMonth(subMonths(calViewMonth, 1))}
                      className="p-1 rounded-lg transition-colors"
                      style={{ color: 'rgba(226,232,240,0.6)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-[12px] font-medium" style={{ color: '#E2E8F0' }}>
                      {format(calViewMonth, 'yyyy년 M월', { locale: ko })}
                    </span>
                    <button
                      onClick={() => setCalViewMonth(addMonths(calViewMonth, 1))}
                      className="p-1 rounded-lg transition-colors"
                      style={{ color: 'rgba(226,232,240,0.6)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>

                  {/* 요일 헤더 */}
                  <div className="grid grid-cols-7 mb-1">
                    {['일','월','화','수','목','금','토'].map(d => (
                      <div key={d} className="text-center text-[10px] pb-1" style={{ color: 'rgba(226,232,240,0.3)' }}>{d}</div>
                    ))}
                  </div>

                  {/* 날짜 셀 */}
                  <div className="grid grid-cols-7 gap-y-0.5">
                    {calCells.map((day, i) => {
                      if (!day) return <div key={i} />
                      const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd')
                      const isRangeStart = rangeStart === dateStr
                      const isSingleSelected = !rangeStart && dateSelection?.from === dateStr && dateSelection?.to === dateStr
                      const isInRange = !rangeStart && !!dateSelection && dateSelection.from !== dateSelection.to && dateStr >= dateSelection.from && dateStr <= dateSelection.to
                      const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
                      const filled = isSingleSelected || isRangeStart
                      return (
                        <button
                          key={i}
                          onClick={() => calDayClick(day)}
                          className="flex items-center justify-center text-[11px] rounded-full transition-colors"
                          style={{
                            width: 28, height: 28,
                            background: filled ? '#4C7FE0' : isInRange ? 'rgba(76,127,224,0.22)' : isToday ? 'rgba(76,127,224,0.18)' : 'transparent',
                            color: filled ? '#fff' : isInRange ? '#7EB3FF' : isToday ? '#7EB3FF' : 'rgba(226,232,240,0.65)',
                            fontWeight: filled || isToday ? 500 : 400,
                            boxShadow: isRangeStart ? '0 0 0 2px rgba(76,127,224,0.5)' : 'none',
                          }}
                          onMouseEnter={e => { if (!filled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                          onMouseLeave={e => { if (!filled) e.currentTarget.style.background = isInRange ? 'rgba(76,127,224,0.22)' : isToday ? 'rgba(76,127,224,0.18)' : 'transparent' }}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 정렬 */}
        <div ref={sortRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setSortOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <ArrowUpDown size={13} style={{ color: 'rgba(226,232,240,0.4)' }} />
            <span className="text-[12px]" style={{ color: 'rgba(226,232,240,0.5)' }}>{sortOrder}</span>
            <ChevronDown size={11} style={{ color: 'rgba(226,232,240,0.35)' }} />
          </button>
          {sortOpen && (
            <div style={dropdownBase}>
              {SORT_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setSortOrder(s); setSortOpen(false) }}
                  className="w-full text-left text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: sortOrder === s ? '#E2E8F0' : 'rgba(226,232,240,0.5)', background: sortOrder === s ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                  onMouseEnter={e => { if (sortOrder !== s) (e.currentTarget.style.background = 'rgba(255,255,255,0.05)') }}
                  onMouseLeave={e => { if (sortOrder !== s) (e.currentTarget.style.background = 'transparent') }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 팀 필터 pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setTeamFilter('전체')}
          className="text-[12px] px-3 py-1.5 rounded-full transition-all flex-shrink-0"
          style={
            teamFilter === '전체'
              ? { background: '#4C7FE0', color: '#fff', fontWeight: 500 }
              : { background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
          }
        >
          전체
        </button>

        {catOrder.map((team, index) => (
          <div
            key={team}
            draggable={editingTeam !== team}
            onDragStart={() => onDragStart(index)}
            onDragOver={e => onDragOver(e, index)}
            onDrop={onDrop}
            className="relative flex-shrink-0"
            style={{ cursor: editingTeam === team ? 'default' : 'grab' }}
            onMouseEnter={() => setHoveredTeam(team)}
            onMouseLeave={() => setHoveredTeam(null)}
          >
            {editingTeam === team ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitEdit()
                  if (e.key === 'Escape') setEditingTeam(null)
                }}
                onBlur={commitEdit}
                className="text-[12px] px-3 py-1.5 rounded-full focus:outline-none"
                style={{
                  background: 'rgba(76,127,224,0.12)',
                  border: '1px solid rgba(76,127,224,0.4)',
                  color: '#E2E8F0',
                  width: `${Math.max(editValue.length * 13 + 28, 60)}px`,
                }}
              />
            ) : (
              <button
                onClick={() => setTeamFilter(teamFilter === team ? '전체' : team)}
                onDoubleClick={() => startEdit(team)}
                className="text-[12px] px-3 py-1.5 rounded-full transition-all"
                style={
                  teamFilter === team
                    ? { background: '#4C7FE0', color: '#fff', fontWeight: 500 }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(226,232,240,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
                }
              >
                {team}
              </button>
            )}
            {editingTeam !== team && hoveredTeam === team && (
              <button
                onClick={e => { e.stopPropagation(); deleteTeam(team) }}
                className="absolute -top-1 -right-1 flex items-center justify-center rounded-full"
                style={{ width: 14, height: 14, background: 'rgba(220,60,60,0.85)', color: '#fff' }}
              >
                <X size={8} />
              </button>
            )}
          </div>
        ))}

        {addingTeam ? (
          <input
            autoFocus
            value={addValue}
            onChange={e => setAddValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitAdd()
              if (e.key === 'Escape') { setAddingTeam(false); setAddValue('') }
            }}
            onBlur={commitAdd}
            placeholder="팀명"
            className="text-[12px] px-3 py-1.5 rounded-full focus:outline-none flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: '#E2E8F0', width: 72 }}
          />
        ) : (
          <button
            onClick={() => setAddingTeam(true)}
            className="flex items-center justify-center rounded-full flex-shrink-0 transition-colors"
            style={{ width: 24, height: 24, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(226,232,240,0.35)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
          >
            <Plus size={11} />
          </button>
        )}

        <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.35)' }}>총 {total}건</span>
      </div>
    </div>
  )
}
