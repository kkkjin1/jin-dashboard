'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTestPracticeData } from '@/hooks/useTestPracticeData'
import type { AnnualGoalTask } from '@/types'
import PinnedAgendaBoard from './PinnedAgendaBoard'
import AgendaCard from './AgendaCard'
import AgendaDetailPanel from './AgendaDetailPanel'
import { priorityRank } from './priorityStyle'

const TOPIC_COLLAPSE_KEY = 'test_practice_topic_collapsed'

// annual-goals/page.tsx와 동일한 카테고리 색 — 표시용으로만 재사용
const CATEGORY_SECTION_COLOR: Record<string, { dot: string }> = {
  '1. 인재 확보':   { dot: '#3F5670' },
  '2. 검증과 정렬': { dot: '#4F7160' },
  '3. 유지와 보상': { dot: '#8B5A44' },
  '4. 지속가능성':  { dot: '#8A5468' },
  '5. 확장 기반':   { dot: '#6B665A' },
}
function fallbackLabel(c: string) { return c.replace(/^\d+\.\s*/, '') }

type SortMode = 'priority' | 'recent'

function compareDue(a?: string | null, b?: string | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b)
}

interface Props {
  category: string
  allCats: string[]
  categoryLabels: Record<string, string>
  onMutate?: () => void
}

export default function AgendaWorkspace({ category, allCats, categoryLabels, onMutate }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('agenda')

  const { items, agendas, execsByAgenda, priorityByAgenda, loading, saveError, addExecTask, cycleExecStatus, completeExec, updateExecDueDate, updateExecTitle, deleteExec, updatePriority } =
    useTestPracticeData(category, onMutate)

  const [sortMode, setSortMode] = useState<SortMode>('priority')
  const [collapsedTopics, setCollapsedTopics] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOPIC_COLLAPSE_KEY)
      if (raw) setCollapsedTopics(JSON.parse(raw))
    } catch {}
  }, [])

  function toggleTopic(cat: string) {
    setCollapsedTopics(prev => {
      const next = { ...prev, [cat]: !prev[cat] }
      try { localStorage.setItem(TOPIC_COLLAPSE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function selectAgenda(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('agenda', id)
    router.push(`/test-practice?${params.toString()}`, { scroll: false })
  }
  function closeDetail() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('agenda')
    router.push(`/test-practice${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  function sortAgendas(list: AnnualGoalTask[]): AnnualGoalTask[] {
    if (sortMode === 'recent') return [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return [...list].sort((a, b) =>
      priorityRank(priorityByAgenda[a.id] ?? 'P3') - priorityRank(priorityByAgenda[b.id] ?? 'P3') ||
      compareDue(a.due_date, b.due_date) ||
      a.created_at.localeCompare(b.created_at)
    )
  }

  if (loading) return <div className="text-sm text-gray-400 animate-pulse py-10 text-center">불러오는 중…</div>

  if (items.length === 0) {
    return (
      <div className="text-sm py-10 text-center" style={{ color: 'rgba(226,232,240,0.35)' }}>
        이 영역에는 목표가 없습니다. 먼저 연간목표에서 목표/과제를 만들어주세요.
      </div>
    )
  }

  const itemsById = Object.fromEntries(items.map(i => [i.id, i]))

  function breadcrumbFor(agenda: AnnualGoalTask): string {
    const item = itemsById[agenda.item_id]
    if (!item) return ''
    return `${categoryLabels[item.category] ?? fallbackLabel(item.category)} · ${item.title}`
  }

  const pinned = agendas
    .filter(a => priorityByAgenda[a.id] === 'P1')
    .sort((a, b) => compareDue(a.due_date, b.due_date) || a.created_at.localeCompare(b.created_at))
    .map(a => ({ agenda: a, breadcrumb: breadcrumbFor(a), execs: execsByAgenda[a.id] ?? [] }))

  const groupedCats = category === '전체' ? allCats : [category]
  const selectedAgenda = selectedId ? agendas.find(a => a.id === selectedId) ?? null : null
  const selectedItem = selectedAgenda ? itemsById[selectedAgenda.item_id] : null

  const detailPanel = selectedAgenda ? (
    <AgendaDetailPanel
      agenda={selectedAgenda}
      categoryLabel={selectedItem ? (categoryLabels[selectedItem.category] ?? fallbackLabel(selectedItem.category)) : ''}
      itemTitle={selectedItem?.title ?? ''}
      itemColor={selectedItem?.color}
      execs={execsByAgenda[selectedAgenda.id] ?? []}
      priority={priorityByAgenda[selectedAgenda.id] ?? 'P3'}
      onClose={closeDetail}
      onChangePriority={p => updatePriority(selectedAgenda.id, p)}
      onAddExec={title => addExecTask(selectedAgenda.id, title)}
      onCycleExecStatus={cycleExecStatus}
      onCompleteExec={completeExec}
      onChangeExecDueDate={updateExecDueDate}
      onUpdateExecTitle={updateExecTitle}
      onDeleteExec={deleteExec}
      saveError={saveError}
    />
  ) : (
    <div className="h-full flex items-center justify-center text-center px-6">
      <span className="text-[12.5px]" style={{ color: 'rgba(226,232,240,0.3)' }}>
        과제를 선택하면<br />실행 TASK와 상세 정보를 확인할 수 있습니다.
      </span>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide flex flex-col gap-7 pb-4">
        <PinnedAgendaBoard items={pinned} selectedId={selectedId} onSelect={selectAgenda} />

        <div className="flex items-center justify-end gap-1.5 text-[11px] flex-shrink-0">
          <span style={{ color: 'rgba(226,232,240,0.35)' }}>정렬</span>
          {(['priority', 'recent'] as SortMode[]).map(m => (
            <button key={m} onClick={() => setSortMode(m)}
              className="px-2 py-1 rounded-md font-semibold transition-colors"
              style={sortMode === m ? { background: 'rgba(76,127,224,0.14)', color: '#8FB1F0' } : { color: 'rgba(226,232,240,0.4)' }}>
              {m === 'priority' ? '우선순위' : '최근'}
            </button>
          ))}
        </div>

        {groupedCats.map(cat => {
          const catItems = items.filter(i => i.category === cat)
          if (catItems.length === 0) return null
          const catAgendas = agendas.filter(a => catItems.some(i => i.id === a.item_id))
          const p1Count = catAgendas.filter(a => priorityByAgenda[a.id] === 'P1').length
          const collapsed = !!collapsedTopics[cat]
          const dot = CATEGORY_SECTION_COLOR[cat]?.dot ?? '#94A3B8'

          return (
            <div key={cat} className="flex flex-col">
              <button onClick={() => toggleTopic(cat)}
                className="flex items-center justify-between w-full pb-3 mb-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="flex items-center gap-2.5 text-[16px] font-extrabold" style={{ color: '#E2E8F0' }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                  {categoryLabels[cat] ?? fallbackLabel(cat)}
                  <span className="font-medium text-[11px]" style={{ color: 'rgba(226,232,240,0.38)' }}>
                    과제 {catAgendas.length}{p1Count > 0 && ` · P1 ${p1Count}`}
                  </span>
                </span>
                <span className="text-[11px]" style={{ color: 'rgba(226,232,240,0.35)' }}>{collapsed ? '▼' : '▲'}</span>
              </button>

              {!collapsed && (
                <div className="flex flex-col gap-6">
                  {catItems.map(item => {
                    // P1은 Pinned 영역에서만 보여준다 — 대주제 영역에서는 제거
                    const itemAgendas = sortAgendas(agendas.filter(a => a.item_id === item.id && priorityByAgenda[a.id] !== 'P1'))
                    if (itemAgendas.length === 0) return null
                    return (
                      <div key={item.id} className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2 pl-1">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                          <span className="text-[14px] font-bold truncate" style={{ color: 'rgba(226,232,240,0.96)' }}>{item.title}</span>
                          <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.3)' }}>· {itemAgendas.length}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {itemAgendas.map(agenda => (
                            <AgendaCard
                              key={agenda.id}
                              agenda={agenda}
                              priority={priorityByAgenda[agenda.id] ?? 'P3'}
                              breadcrumb={breadcrumbFor(agenda)}
                              execs={execsByAgenda[agenda.id] ?? []}
                              selected={selectedId === agenda.id}
                              onClick={() => selectAgenda(agenda.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 1280px 이상: 고정 상세 패널 */}
      <div className="hidden xl:block flex-shrink-0" style={{ width: 484 }}>
        <div className="h-full rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {detailPanel}
        </div>
      </div>

      {/* 1280px 미만: overlay drawer */}
      {selectedAgenda && (
        <div className="xl:hidden fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={closeDetail} />
          <div className="relative w-full max-w-[506px] h-full" style={{ background: '#0F1319', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
            {detailPanel}
          </div>
        </div>
      )}
    </div>
  )
}
