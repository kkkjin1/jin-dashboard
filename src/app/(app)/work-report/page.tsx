'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WorkReport, WorkReportEntry, WorkReportTopic } from '@/types'
import TopicOutline, { isFixedKey, type OutlineTopicRow } from '@/components/work-report/TopicOutline'
import ReportEditorPanel, { type ReportEditorPanelHandle } from '@/components/work-report/ReportEditorPanel'
import ContextPanel from '@/components/work-report/ContextPanel'
import PeriodMatrixView from '@/components/work-report/PeriodMatrixView'
import TopicHistoryView from '@/components/work-report/TopicHistoryView'
import ReportFullViewModal from '@/components/work-report/ReportFullViewModal'
import { S, selectClass, selectStyle, fmtPeriodLabel, addDaysToDateStr, todayStr, hasContent, isEntryWritten, type TopicChangeBadge } from '@/components/work-report/style'

type Mode = 'write' | 'period' | 'topic-history'

function computeBadge(entry: WorkReportEntry, prev: WorkReportEntry | undefined): TopicChangeBadge {
  if (!prev) return 'new'
  if ((prev.report_text ?? '').trim() !== (entry.report_text ?? '').trim()) return 'updated'
  return 'unchanged'
}

export default function WorkReportPage() {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [topics, setTopics] = useState<WorkReportTopic[]>([])
  const [reports, setReports] = useState<WorkReport[]>([])
  const [entriesByReport, setEntriesByReport] = useState<Map<string, WorkReportEntry[]>>(new Map())
  // entriesByReport(state)의 동기 미러 — await 뒤에서 setState 반영을 기다리지 않고도
  // "방금 로드/수정한 최신 목록"을 그 자리에서 바로 읽어야 하는 경우(예: handleNewReport가
  // 직전 report의 entries를 이어받아 새 report에 carry-forward 하는 로직)에 쓴다.
  const entriesCacheRef = useRef<Map<string, WorkReportEntry[]>>(new Map())
  const loadedReportIds = useRef<Set<string>>(new Set())
  // 지금 마운트된 ReportEditorPanel의 pending canonical debounce를 "보고 확정"
  // 직전에 즉시 flush하기 위한 핸들 — topic/보고 전환은 그 컴포넌트가 key remount될
  // 때 자체 unmount flush로 커버되지만, 확정은 remount 없이 같은 인스턴스에서
  // readOnly만 바뀌므로 명시적으로 호출해야 한다(ReportEditorPanelHandle 참고).
  const editorRef = useRef<ReportEditorPanelHandle>(null)

  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  const [selection, setSelection] = useState<string>('summary')
  const [mode, setMode] = useState<Mode>('write')
  const [compareReportId, setCompareReportId] = useState<string>('')
  const [fullViewOpen, setFullViewOpen] = useState(false)
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false)
  const [topicDrawerOpen, setTopicDrawerOpen] = useState(false)
  const [topicHistoryEntries, setTopicHistoryEntries] = useState<WorkReportEntry[]>([])

  const ensureEntries = useCallback(async (reportId: string): Promise<WorkReportEntry[]> => {
    if (!reportId) return []
    if (loadedReportIds.current.has(reportId)) return entriesCacheRef.current.get(reportId) ?? []
    loadedReportIds.current.add(reportId)
    const { data } = await supabase.from('work_report_entries').select('*').eq('report_id', reportId).order('sort_order')
    const list = (data as WorkReportEntry[]) ?? []
    entriesCacheRef.current.set(reportId, list)
    setEntriesByReport(prev => new Map(prev).set(reportId, list))
    return list
  }, [supabase])

  // ── 초기 로드 ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [topicsRes, reportsRes] = await Promise.all([
        supabase.from('work_report_topics').select('*').order('created_at'),
        supabase.from('work_reports').select('*').order('period_start'),
      ])
      const topicsList = (topicsRes.data as WorkReportTopic[]) ?? []
      const reportsList = (reportsRes.data as WorkReport[]) ?? []
      setTopics(topicsList)
      setReports(reportsList)
      if (reportsList.length > 0) {
        const latest = reportsList[reportsList.length - 1]
        setCurrentReportId(latest.id)
        loadedReportIds.current.add(latest.id)
        const { data: entriesData } = await supabase
          .from('work_report_entries').select('*').eq('report_id', latest.id).order('sort_order')
        const list = (entriesData as WorkReportEntry[]) ?? []
        entriesCacheRef.current.set(latest.id, list)
        setEntriesByReport(new Map([[latest.id, list]]))
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const topicsById = useMemo(() => new Map(topics.map(t => [t.id, t])), [topics])
  const reportsAsc = useMemo(() => [...reports].sort((a, b) => a.period_start.localeCompare(b.period_start)), [reports])
  const reportsDesc = useMemo(() => [...reportsAsc].reverse(), [reportsAsc])
  const currentReport = useMemo(() => reports.find(r => r.id === currentReportId) ?? null, [reports, currentReportId])
  const prevReport = useMemo(() => {
    if (!currentReport) return null
    const idx = reportsAsc.findIndex(r => r.id === currentReport.id)
    return idx > 0 ? reportsAsc[idx - 1] : null
  }, [reportsAsc, currentReport])
  const pastReportsDesc = useMemo(() => {
    if (!currentReport) return []
    return reportsAsc.filter(r => r.period_start < currentReport.period_start).slice().reverse()
  }, [reportsAsc, currentReport])

  const readOnly = currentReport?.status === 'final'
  const entries = useMemo(() => currentReportId ? (entriesByReport.get(currentReportId) ?? []) : [], [entriesByReport, currentReportId])
  const prevEntries = useMemo(() => prevReport ? (entriesByReport.get(prevReport.id) ?? []) : [], [entriesByReport, prevReport])
  const prevEntryByTopic = useMemo(() => new Map(prevEntries.map(e => [e.topic_id, e])), [prevEntries])
  const compareEntries = useMemo(() => compareReportId ? (entriesByReport.get(compareReportId) ?? []) : [], [entriesByReport, compareReportId])

  useEffect(() => { if (currentReportId) void ensureEntries(currentReportId) }, [currentReportId, ensureEntries])
  useEffect(() => { if (prevReport) void ensureEntries(prevReport.id) }, [prevReport, ensureEntries])
  useEffect(() => { if (compareReportId) void ensureEntries(compareReportId) }, [compareReportId, ensureEntries])

  // selection/currentReportId가 바뀌면 비교 기준을 직전 report로 리셋 — 이후 사용자가
  // ContextPanel 드롭다운에서 직접 다른 비교 대상으로 바꿀 수 있다.
  useEffect(() => { setCompareReportId(prevReport?.id ?? '') }, [selection, currentReportId, prevReport])

  useEffect(() => {
    if (isFixedKey(selection)) return
    let cancelled = false
    supabase.from('work_report_entries').select('*').eq('topic_id', selection).then(({ data }) => {
      if (!cancelled) setTopicHistoryEntries((data as WorkReportEntry[]) ?? [])
    })
    return () => { cancelled = true }
  }, [selection, supabase])

  const outlineRows: OutlineTopicRow[] = useMemo(() => {
    return [...entries]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(entry => {
        const topic = topicsById.get(entry.topic_id)
        if (!topic) return null
        const prev = prevEntryByTopic.get(entry.topic_id)
        return { entry, topic, badge: computeBadge(entry, prev) }
      })
      .filter((r): r is OutlineTopicRow => !!r)
  }, [entries, topicsById, prevEntryByTopic])

  const allActiveTopics = useMemo(() => topics.filter(t => t.status === 'active'), [topics])

  // 헤더 진행률 — "작성됨" 기준은 ReportEditorPanel의 진행 상태 표시(canonicalStatus)와
  // 무관하게, isEntryWritten(제목 필드가 아니라 실제 보고 내용) 하나로 outline dot과
  // 동시에 공유한다. 주제가 0개면 진행률 자체를 숨긴다(0/0 = NaN% 방지).
  const writtenCount = useMemo(() => outlineRows.filter(r => isEntryWritten(r.entry)).length, [outlineRows])
  const totalTopicCount = outlineRows.length
  const progressPct = totalTopicCount > 0 ? Math.round((writtenCount / totalTopicCount) * 100) : 0

  const summaryWritten = hasContent(currentReport?.summary)
  const issuesWritten = hasContent(currentReport?.issues)
  const nextStepsWritten = hasContent(currentReport?.next_steps)

  const selectedTopic = !isFixedKey(selection) ? topicsById.get(selection) ?? null : null
  const selectedEntry = selectedTopic ? entries.find(e => e.topic_id === selectedTopic.id) ?? null : null
  const selectedPrevEntry = selectedTopic ? prevEntryByTopic.get(selectedTopic.id) ?? null : null
  const selectedBadge = selectedEntry ? computeBadge(selectedEntry, selectedPrevEntry ?? undefined) : null
  const compareEntry = selectedTopic ? compareEntries.find(e => e.topic_id === selectedTopic.id) ?? null : null
  const compareReportObj = reports.find(r => r.id === compareReportId) ?? null

  // 순차 이동(이전/다음 주제) — outlineRows는 이미 sort_order로 정렬돼 있으므로 그 순서를 그대로 쓴다.
  const selectedTopicIndex = selectedTopic ? outlineRows.findIndex(r => r.topic.id === selectedTopic.id) : -1
  const hasPrevTopic = selectedTopicIndex > 0
  const hasNextTopic = selectedTopicIndex >= 0 && selectedTopicIndex < outlineRows.length - 1
  function goPrevTopic() { if (selectedTopicIndex > 0) setSelection(outlineRows[selectedTopicIndex - 1].topic.id) }
  function goNextTopic() { if (selectedTopicIndex >= 0 && selectedTopicIndex < outlineRows.length - 1) setSelection(outlineRows[selectedTopicIndex + 1].topic.id) }

  const topicHistory = useMemo(() => {
    return topicHistoryEntries
      .map(e => ({ entry: e, report: reports.find(r => r.id === e.report_id) }))
      .filter((x): x is { entry: WorkReportEntry; report: WorkReport } => !!x.report)
      .sort((a, b) => b.report.period_start.localeCompare(a.report.period_start))
  }, [topicHistoryEntries, reports])

  // ── mutations ───────────────────────────────────────────────────────
  function patchEntry(reportId: string, updater: (list: WorkReportEntry[]) => WorkReportEntry[]) {
    const next = updater(entriesCacheRef.current.get(reportId) ?? [])
    entriesCacheRef.current.set(reportId, next)
    setEntriesByReport(prev => new Map(prev).set(reportId, next))
  }

  // final report는 절대 바뀌면 안 되므로, UI에서 버튼/드래그를 숨기는 것과 별개로
  // mutation 함수 자체에서도 readOnly를 확인한다(방어적 이중 체크 — 코드 검토 STEP 2).
  async function handleAddTopic(title: string) {
    if (!currentReport || readOnly) return
    let topic = topics.find(t => t.status === 'active' && t.title === title)
    if (!topic) {
      const { data, error } = await supabase.from('work_report_topics').insert({ title }).select().single()
      if (error || !data) return
      topic = data as WorkReportTopic
      setTopics(prev => [...prev, topic!])
    }
    if (entries.some(e => e.topic_id === topic!.id)) { setSelection(topic.id); return }
    const nextSortOrder = entries.length ? Math.max(...entries.map(e => e.sort_order)) + 1 : 0
    const { data: entryData, error: entryErr } = await supabase
      .from('work_report_entries')
      .insert({ report_id: currentReport.id, topic_id: topic.id, sort_order: nextSortOrder, topic_title_snapshot: topic.title })
      .select().single()
    if (entryErr || !entryData) return
    patchEntry(currentReport.id, list => [...list, entryData as WorkReportEntry])
    setSelection(topic.id)
  }

  async function handleRenameTopic(topicId: string, title: string) {
    const { data } = await supabase.from('work_report_topics').update({ title }).eq('id', topicId).select().single()
    if (!data) return
    setTopics(prev => prev.map(t => t.id === topicId ? data as WorkReportTopic : t))

    // 아직 확정되지 않은(draft) report의 entry snapshot은 최신 제목을 따라가도 된다 —
    // 그 report는 아직 "당시 보고 내용"이 확정된 게 아니기 때문. final report의 entry는
    // 여기서 절대 건드리지 않는다(과거 보고 snapshot 불변 원칙, 코드 검토 STEP 1/2).
    const draftReportIds = reports.filter(r => r.status === 'draft').map(r => r.id)
    if (draftReportIds.length === 0) return
    const { data: updatedEntries } = await supabase
      .from('work_report_entries')
      .update({ topic_title_snapshot: title })
      .eq('topic_id', topicId)
      .in('report_id', draftReportIds)
      .select()
    for (const e of (updatedEntries as WorkReportEntry[]) ?? []) {
      patchEntry(e.report_id, list => list.map(x => x.id === e.id ? e : x))
    }
  }

  async function handleReorder(orderedEntryIds: string[]) {
    if (!currentReport || readOnly) return
    const byId = new Map(entries.map(e => [e.id, e]))
    const next = orderedEntryIds.map((id, i) => ({ ...byId.get(id)!, sort_order: i })).filter(Boolean)
    patchEntry(currentReport.id, () => next)
    await Promise.all(orderedEntryIds.map((id, i) => supabase.from('work_report_entries').update({ sort_order: i }).eq('id', id)))
  }

  async function handleRemoveFromReport(topicId: string) {
    if (!currentReport || readOnly) return
    const entry = entries.find(e => e.topic_id === topicId)
    if (!entry) return
    await supabase.from('work_report_entries').delete().eq('id', entry.id)
    patchEntry(currentReport.id, list => list.filter(e => e.id !== entry.id))
    if (selection === topicId) setSelection('summary')
  }

  async function handleArchiveTopic(topicId: string) {
    const { data } = await supabase
      .from('work_report_topics')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', topicId).select().single()
    if (data) setTopics(prev => prev.map(t => t.id === topicId ? data as WorkReportTopic : t))
  }

  function handleEntrySaved(entry: WorkReportEntry) {
    patchEntry(entry.report_id, list => list.map(e => e.id === entry.id ? entry : e))
  }

  function handleReportSaved(updated: WorkReport) {
    setReports(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  async function handlePeriodChange(field: 'period_start' | 'period_end', value: string) {
    if (!currentReport || !value || readOnly) return
    const { data } = await supabase.from('work_reports').update({ [field]: value }).eq('id', currentReport.id).select().single()
    if (data) handleReportSaved(data as WorkReport)
  }

  async function handleNewReport() {
    const latest = reportsDesc[0] ?? null
    const periodStart = latest ? addDaysToDateStr(latest.period_end, 1) : todayStr()
    const periodEnd = addDaysToDateStr(periodStart, 13)
    const { data: reportData, error } = await supabase.from('work_reports').insert({ period_start: periodStart, period_end: periodEnd }).select().single()
    if (error || !reportData) return
    const newReport = reportData as WorkReport

    let carried: WorkReportEntry[] = []
    if (latest) {
      const latestEntries = await ensureEntries(latest.id)
      const carryTargets = latestEntries
        .filter(e => topicsById.get(e.topic_id)?.status === 'active')
        .sort((a, b) => a.sort_order - b.sort_order)
      if (carryTargets.length > 0) {
        // 새 report의 entry이므로 지금 이 순간의 topic 최신 제목을 새로 스냅샷한다
        // (예전 report의 stale snapshot을 그대로 복사하지 않는다).
        const inserts = carryTargets.map((e, i) => ({
          report_id: newReport.id,
          topic_id: e.topic_id,
          sort_order: i,
          topic_title_snapshot: topicsById.get(e.topic_id)?.title ?? e.topic_title_snapshot,
        }))
        const { data: insertedEntries } = await supabase.from('work_report_entries').insert(inserts).select()
        carried = (insertedEntries as WorkReportEntry[]) ?? []
      }
    }

    setReports(prev => [...prev, newReport])
    loadedReportIds.current.add(newReport.id)
    entriesCacheRef.current.set(newReport.id, carried)
    setEntriesByReport(prev => new Map(prev).set(newReport.id, carried))
    setCurrentReportId(newReport.id)
    setSelection('summary')
    setMode('write')
  }

  async function handleToggleFinalize() {
    if (!currentReport) return
    if (currentReport.status === 'draft') {
      if (!confirm('이 보고를 확정할까요? 확정 후에는 읽기 전용으로 전환됩니다.')) return
      // 확정 직전, 지금 화면에 남아있는 pending canonical debounce를 먼저
      // 커밋한다 — 안 그러면 "입력 직후 즉시 확정" 시 마지막 입력이 final
      // 스냅샷에서 빠질 수 있다(2026-09-14 재검증에서 확인된 결함 수정).
      await editorRef.current?.flushPending()
      const { data } = await supabase
        .from('work_reports').update({ status: 'final', finalized_at: new Date().toISOString() })
        .eq('id', currentReport.id).select().single()
      if (data) handleReportSaved(data as WorkReport)
    } else {
      if (!confirm('편집을 재개할까요? 확정된 과거 보고 내용이 바뀔 수 있습니다.')) return
      const { data } = await supabase
        .from('work_reports').update({ status: 'draft', finalized_at: null })
        .eq('id', currentReport.id).select().single()
      if (data) handleReportSaved(data as WorkReport)
    }
  }

  const fullViewRows = useMemo(() => {
    if (!currentReport) return []
    const list = entriesByReport.get(currentReport.id) ?? []
    return [...list]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(entry => ({ entry, topic: topicsById.get(entry.topic_id) }))
      .filter((r): r is { entry: WorkReportEntry; topic: WorkReportTopic } => !!r.topic)
  }, [currentReport, entriesByReport, topicsById])

  if (loading) {
    return <div className="h-full flex items-center justify-center" style={{ color: S.t4, fontSize: 12.5 }}>불러오는 중…</div>
  }

  return (
    <div className="h-full flex flex-col" style={{ background: S.bg }}>
      {/* ── 상단 바 ──
          1행: 지금 어느 보고기간/상태인지(identity) — 항상 가장 눈에 먼저 들어와야 하는 정보.
          2행: mode 전환(좌, primary navigation)과 secondary action(우)을 분리 —
          이전에는 identity/mode/action 3그룹이 한 줄에서 flex-wrap으로 뒤섞여
          좁은 폭에서 순서 없이 줄바꿈되던 것을, 의미 단위로 고정된 2행 구조로 바꾼다. */}
      <div className="flex flex-col gap-2.5 px-6 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[15px] font-semibold" style={{ color: S.t1 }}>업무보고</p>

          {mode === 'write' && currentReport && (
            <>
              <div className="flex items-center gap-1.5">
                <input type="date" value={currentReport.period_start} disabled={readOnly}
                  onChange={e => handlePeriodChange('period_start', e.target.value)}
                  className="text-[12px] px-2 py-1 rounded-lg disabled:opacity-50"
                  style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}`, color: S.t2 }} />
                <span style={{ color: S.t4 }}>~</span>
                <input type="date" value={currentReport.period_end} disabled={readOnly}
                  onChange={e => handlePeriodChange('period_end', e.target.value)}
                  className="text-[12px] px-2 py-1 rounded-lg disabled:opacity-50"
                  style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}`, color: S.t2 }} />
              </div>

              {/* draft/final 상태 — 기존에는 select option 텍스트/버튼 라벨에만 묻혀있던 것을
                  identity 영역에 pill로 노출해 "지금 작성중인지 확정인지"를 즉시 알 수 있게 한다. */}
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                style={currentReport.status === 'final'
                  ? { color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }
                  : { color: S.t3, background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}` }}
              >
                {currentReport.status === 'final' ? '확정' : '작성중'}
              </span>

              {reportsDesc.length > 1 && (
                <select
                  value={currentReportId ?? ''}
                  onChange={e => { setCurrentReportId(e.target.value); setSelection('summary') }}
                  className={selectClass}
                  style={selectStyle}
                >
                  {reportsDesc.map(r => (
                    <option key={r.id} value={r.id}>
                      {fmtPeriodLabel(r.period_start, r.period_end)} · {r.status === 'final' ? '확정' : '작성중'}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        {/* 작성 진행률 — DB 컬럼 없이 outlineRows(현재 report의 entry)만으로 매 렌더 계산한다.
            주제가 0개면 0/0을 보여주는 대신 행 자체를 숨긴다. */}
        {mode === 'write' && currentReport && totalTopicCount > 0 && (
          <div className="flex items-center gap-3">
            <p className="text-[11.5px]" style={{ color: S.t3 }}>
              {totalTopicCount}개 주제 · {writtenCount}개 작성 · {totalTopicCount - writtenCount}개 미작성
            </p>
            <div className="flex items-center gap-2" style={{ maxWidth: 220, flex: 1 }}>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(var(--ink-rgb),0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: S.accent }} />
              </div>
              <span className="text-[10.5px] flex-shrink-0" style={{ color: S.t4 }}>{progressPct}%</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(var(--ink-rgb),0.04)' }}>
            {([['write', '보고서 작성'], ['period', '기간별 전체 보기'], ['topic-history', '주제별 히스토리']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                style={{ color: mode === k ? S.t1 : S.t3, background: mode === k ? S.accentDim : 'transparent' }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {mode === 'write' && currentReport && (
              <>
                <button onClick={() => setFullViewOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                  style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.04)' }}
                >
                  문서로 보기
                </button>
                <button onClick={handleNewReport}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                  style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.04)' }}
                >
                  + 새 보고
                </button>
                <button onClick={handleToggleFinalize}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                  style={currentReport.status === 'draft'
                    ? { color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }
                    : { color: S.t3, background: 'rgba(var(--ink-rgb),0.04)' }}
                >
                  {currentReport.status === 'draft' ? '보고 확정' : '편집 재개'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {mode === 'write' && (
          currentReport ? (
            <>
              {/* 1360px 미만: Outline(216px)+Context(288px) 고정폭을 다 확보하면 Writing
                  Workspace(main surface)가 지나치게 좁아지는 지점 — 이 아래에서는 기존과
                  동일하게 "버튼 → 드로어" 패턴으로 접는다(모바일 구조 그대로 재사용). */}
              <div className="hidden min-[1360px]:block h-full" style={{ borderRight: `1px solid ${S.border}` }}>
                <TopicOutline
                  rows={outlineRows}
                  allActiveTopics={allActiveTopics}
                  selection={selection}
                  onSelect={setSelection}
                  readOnly={readOnly}
                  onAddTopic={handleAddTopic}
                  onRenameTopic={handleRenameTopic}
                  onReorder={handleReorder}
                  onRemoveFromReport={handleRemoveFromReport}
                  onArchiveTopic={handleArchiveTopic}
                  summaryWritten={summaryWritten}
                  issuesWritten={issuesWritten}
                  nextStepsWritten={nextStepsWritten}
                />
              </div>

              <button
                onClick={() => setTopicDrawerOpen(true)}
                className="min-[1360px]:hidden flex-shrink-0 self-start mt-3 ml-2 px-2.5 py-1.5 rounded-lg text-[11px]"
                style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}
              >
                목차
              </button>

              <div className="flex-1 min-w-0 h-full overflow-hidden">
                <ReportEditorPanel
                  key={`${currentReport.id}:${selection}`}
                  ref={editorRef}
                  supabase={supabase}
                  selection={selection}
                  report={currentReport}
                  topic={selectedTopic}
                  entry={selectedEntry}
                  prevEntry={selectedPrevEntry}
                  prevReport={prevReport}
                  badge={selectedBadge}
                  readOnly={readOnly}
                  onEntrySaved={handleEntrySaved}
                  onReportSaved={handleReportSaved}
                  hasPrevTopic={hasPrevTopic}
                  hasNextTopic={hasNextTopic}
                  onPrevTopic={goPrevTopic}
                  onNextTopic={goNextTopic}
                  onAddTopic={handleAddTopic}
                />
              </div>

              <button
                onClick={() => setContextDrawerOpen(true)}
                className="min-[1360px]:hidden flex-shrink-0 self-start mt-3 mr-2 px-2.5 py-1.5 rounded-lg text-[11px]"
                style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}
              >
                컨텍스트
              </button>

              <div className="hidden min-[1360px]:block h-full" style={{ borderLeft: `1px solid ${S.border}` }}>
                <ContextPanel
                  selection={selection}
                  topic={selectedTopic}
                  report={currentReport}
                  pastReports={pastReportsDesc}
                  compareReportId={compareReportId}
                  onChangeCompareReportId={setCompareReportId}
                  compareEntry={compareEntry}
                  compareReportObj={compareReportObj}
                  entry={selectedEntry}
                  topicHistory={topicHistory}
                  onOpenFullHistory={() => setMode('topic-history')}
                />
              </div>

              {topicDrawerOpen && (
                <div className="fixed inset-0 z-40 min-[1360px]:hidden" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setTopicDrawerOpen(false)}>
                  <div className="absolute inset-y-0 left-0 h-full" style={{ background: S.panel }} onClick={e => e.stopPropagation()}>
                    <TopicOutline
                      rows={outlineRows}
                      allActiveTopics={allActiveTopics}
                      selection={selection}
                      onSelect={id => { setSelection(id); setTopicDrawerOpen(false) }}
                      readOnly={readOnly}
                      onAddTopic={handleAddTopic}
                      onRenameTopic={handleRenameTopic}
                      onReorder={handleReorder}
                      onRemoveFromReport={handleRemoveFromReport}
                      onArchiveTopic={handleArchiveTopic}
                      summaryWritten={summaryWritten}
                      issuesWritten={issuesWritten}
                      nextStepsWritten={nextStepsWritten}
                    />
                  </div>
                </div>
              )}

              {contextDrawerOpen && (
                <div className="fixed inset-0 z-40 min-[1360px]:hidden" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setContextDrawerOpen(false)}>
                  <div className="absolute inset-y-0 right-0 h-full" style={{ background: S.panel }} onClick={e => e.stopPropagation()}>
                    <ContextPanel
                      selection={selection}
                      topic={selectedTopic}
                      report={currentReport}
                      pastReports={pastReportsDesc}
                      compareReportId={compareReportId}
                      onChangeCompareReportId={setCompareReportId}
                      compareEntry={compareEntry}
                      compareReportObj={compareReportObj}
                      entry={selectedEntry}
                      topicHistory={topicHistory}
                      onOpenFullHistory={() => { setMode('topic-history'); setContextDrawerOpen(false) }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <p className="text-[13px]" style={{ color: S.t4 }}>아직 작성된 업무보고가 없습니다.</p>
              <button onClick={handleNewReport}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}
              >
                + 첫 보고 시작하기
              </button>
            </div>
          )
        )}

        {mode === 'period' && <PeriodMatrixView supabase={supabase} topics={topics} reports={reportsAsc} />}
        {mode === 'topic-history' && <TopicHistoryView supabase={supabase} topics={topics} reports={reportsAsc} />}
      </div>

      {fullViewOpen && currentReport && (
        <ReportFullViewModal report={currentReport} rows={fullViewRows} onClose={() => setFullViewOpen(false)} />
      )}
    </div>
  )
}
