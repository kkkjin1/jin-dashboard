'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WorkReport, WorkReportEntry, WorkReportItem, WorkReportItemSection, WorkReportTopic } from '@/types'
import TopicOutline, { isFixedKey, type OutlineTopicRow, type FixedSectionKey } from '@/components/work-report/TopicOutline'
import ReportEditorPanel, { type ReportEditorPanelHandle } from '@/components/work-report/ReportEditorPanel'
import ContextPanel, { type HistoryItem } from '@/components/work-report/ContextPanel'
import RestoreTopicModal from '@/components/work-report/RestoreTopicModal'
import ArchiveView from '@/components/work-report/ArchiveView'
import ReportFullViewModal from '@/components/work-report/ReportFullViewModal'
import ItemSectionPanel, { type ItemSectionPanelHandle } from '@/components/work-report/ItemSectionPanel'
import { ITEM_SECTIONS, ITEM_SECTION_META, parseItemSelection, sortItems, isItemWritten, itemsToText } from '@/components/work-report/items'
import { S, fmtPeriodLabel, fmtDateFull, addDaysToDateStr, todayStr, hasContent, isEntryWritten, type TopicChangeBadge } from '@/components/work-report/style'

// TOP LEVEL — "보고서 작성"(한 주제에 집중해서 깊게 작성) / "보고 아카이브"(과거 참고) 2-way.
// 예전의 "테이블 작성"(이번 회차 전체 topic을 표로 편집)은 아카이브 "전체 비교"와 역할이
// 겹쳐 제거했다(2026-09-28). 그 화면에만 있던 "기존 주제 불러오기"는 LEFT 목차로 옮겼다.
type Mode = 'write' | 'archive'

const FIXED_HISTORY_TITLE: Record<FixedSectionKey, string> = {
  summary: '핵심 요약 히스토리', issues: '주요 이슈 히스토리', next_steps: '다음 단계 히스토리',
}

function computeBadge(entry: WorkReportEntry, prev: WorkReportEntry | undefined): TopicChangeBadge {
  if (!prev) return 'new'
  if ((prev.report_text ?? '').trim() !== (entry.report_text ?? '').trim()) return 'updated'
  return 'unchanged'
}

// 날짜 입력(보고일/기간) — 키 입력마다 저장하면 저장 응답 전 re-render가 브라우저 date 세그먼트
// 입력("2","9" → 29)을 끊어 09로 저장되는 문제가 있어(2026-09-28 검증에서 확인), 입력
// 중에는 로컬 값만 바꾸고 멈춘 뒤(800ms) 또는 blur 시 한 번만 커밋한다. 회차 전환 시
// 초기값 리셋은 key={report.id} remount로 처리한다.
function DateField({ value, disabled, onCommit, emphasis = false }: { value: string; disabled: boolean; onCommit: (v: string) => void; emphasis?: boolean }) {
  const [local, setLocal] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committedRef = useRef(value)

  function commit(v: string) {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (!v || v === committedRef.current) return
    committedRef.current = v
    onCommit(v)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <input type="date" value={local} disabled={disabled}
      onChange={e => {
        const v = e.target.value
        setLocal(v)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => commit(v), 800)
      }}
      onBlur={() => commit(local)}
      className="text-[12px] px-2 py-1 rounded-lg disabled:opacity-50"
      style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${emphasis ? S.accentBorder : S.border}`, color: emphasis ? S.t1 : S.t2 }} />
  )
}

export default function WorkReportPage() {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [topics, setTopics] = useState<WorkReportTopic[]>([])
  // 3-1/3-2/3-3 항목 — 전 회차분을 한 번에 들고 있는다(회차당 수십 행 규모). 히스토리·
  // 직전 비교·이월·아카이브가 모두 같은 목록에서 계산되므로 회차별 lazy load를 두지 않는다.
  const [allItems, setAllItems] = useState<WorkReportItem[]>([])
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
  const itemPanelRef = useRef<ItemSectionPanelHandle>(null)

  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  const [selection, setSelection] = useState<string>('summary')
  const [mode, setMode] = useState<Mode>('write')
  const [fullViewOpen, setFullViewOpen] = useState(false)
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false)
  const [topicDrawerOpen, setTopicDrawerOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [topicHistoryEntries, setTopicHistoryEntries] = useState<WorkReportEntry[]>([])
  // RIGHT의 "전체 히스토리 보기 →"로 Archive에 넘어갈 때만 채워지는 1회성 진입점 — Archive는
  // write↔archive 전환마다 항상 새로 mount되므로(조건부 렌더) ArchiveView의 initialTab/
  // initialTopicId로만 쓰이고, 그 이후 Archive 내부 tab/주제 전환과는 무관하다.
  const [archiveJumpTopicId, setArchiveJumpTopicId] = useState<string | null>(null)

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
      const [topicsRes, reportsRes, itemsRes] = await Promise.all([
        supabase.from('work_report_topics').select('*').order('created_at'),
        supabase.from('work_reports').select('*').order('period_start'),
        supabase.from('work_report_items').select('*').order('sort_order'),
      ])
      setAllItems((itemsRes.data as WorkReportItem[]) ?? [])
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
  // 상단 보고일 타임라인 — 보고일 순(좌→우 과거→최근). prevReport 등 회차 순서 로직은
  // 기존대로 period_start 기준 reportsAsc를 그대로 쓴다(여기는 표시 전용).
  const reportsByDate = useMemo(
    () => [...reports].sort((a, b) => (a.report_date ?? a.period_end).localeCompare(b.report_date ?? b.period_end)),
    [reports],
  )
  // 상단 바(B안): 회차 선택 드롭다운 / ⋯ 메뉴 / 기간 편집 토글. 바깥 클릭 시 드롭다운·메뉴를 닫는다.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [editingDates, setEditingDates] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const currentReport = useMemo(() => reports.find(r => r.id === currentReportId) ?? null, [reports, currentReportId])
  const prevReport = useMemo(() => {
    if (!currentReport) return null
    const idx = reportsAsc.findIndex(r => r.id === currentReport.id)
    return idx > 0 ? reportsAsc[idx - 1] : null
  }, [reportsAsc, currentReport])

  const readOnly = currentReport?.status === 'final'
  const entries = useMemo(() => currentReportId ? (entriesByReport.get(currentReportId) ?? []) : [], [entriesByReport, currentReportId])
  const prevEntries = useMemo(() => prevReport ? (entriesByReport.get(prevReport.id) ?? []) : [], [entriesByReport, prevReport])
  const prevEntryByTopic = useMemo(() => new Map(prevEntries.map(e => [e.topic_id, e])), [prevEntries])

  useEffect(() => { if (currentReportId) void ensureEntries(currentReportId) }, [currentReportId, ensureEntries])
  useEffect(() => { if (prevReport) void ensureEntries(prevReport.id) }, [prevReport, ensureEntries])

  const itemSection = parseItemSelection(selection)

  useEffect(() => {
    if (isFixedKey(selection) || parseItemSelection(selection)) return
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
  // "기존 주제 불러오기" 후보 — active이면서 이번 report에 아직 entry가 없는 topic.
  const restoreCandidates = useMemo(() => {
    const inReport = new Set(entries.map(e => e.topic_id))
    return allActiveTopics.filter(t => !inReport.has(t.id))
  }, [entries, allActiveTopics])

  // 헤더 진행률 — "작성됨" 기준은 ReportEditorPanel의 진행 상태 표시(canonicalStatus)와
  // 무관하게, isEntryWritten(제목 필드가 아니라 실제 보고 내용) 하나로 outline dot과
  // 동시에 공유한다. 주제가 0개면 진행률 자체를 숨긴다(0/0 = NaN% 방지).
  const writtenCount = useMemo(() => outlineRows.filter(r => isEntryWritten(r.entry)).length, [outlineRows])
  const totalTopicCount = outlineRows.length
  const progressPct = totalTopicCount > 0 ? Math.round((writtenCount / totalTopicCount) * 100) : 0

  const summaryWritten = hasContent(currentReport?.summary)
  const itemsOf = useCallback((reportId: string | undefined, section: WorkReportItemSection) =>
    sortItems(allItems.filter(i => i.report_id === reportId && i.section === section)), [allItems])
  const itemWritten = useMemo(() => {
    const m = {} as Record<WorkReportItemSection, boolean>
    for (const sec of ITEM_SECTIONS) m[sec] = allItems.some(i => i.report_id === currentReport?.id && i.section === sec && isItemWritten(i))
    return m
  }, [allItems, currentReport])
  const nextStepsWritten = hasContent(currentReport?.next_steps)

  const selectedTopic = !isFixedKey(selection) && !itemSection ? topicsById.get(selection) ?? null : null
  const selectedEntry = selectedTopic ? entries.find(e => e.topic_id === selectedTopic.id) ?? null : null
  const selectedPrevEntry = selectedTopic ? prevEntryByTopic.get(selectedTopic.id) ?? null : null

  // 순차 이동(이전/다음 주제) — outlineRows는 이미 sort_order로 정렬돼 있으므로 그 순서를 그대로 쓴다.
  const selectedTopicIndex = selectedTopic ? outlineRows.findIndex(r => r.topic.id === selectedTopic.id) : -1
  const hasPrevTopic = selectedTopicIndex > 0
  const hasNextTopic = selectedTopicIndex >= 0 && selectedTopicIndex < outlineRows.length - 1
  function goPrevTopic() { if (selectedTopicIndex > 0) setSelection(outlineRows[selectedTopicIndex - 1].topic.id) }
  function goNextTopic() { if (selectedTopicIndex >= 0 && selectedTopicIndex < outlineRows.length - 1) setSelection(outlineRows[selectedTopicIndex + 1].topic.id) }

  // RIGHT는 이제 "이 주제/섹션의 히스토리" 단일 역할이다 — topic이면 topic_id 기준 entry
  // 이력, 고정 섹션이면 report 필드(요약/이슈/다음단계) 자체가 이미 모든 report에 실려
  // 있으므로 별도 fetch 없이 reportsDesc에서 바로 뽑는다(새 데이터 모델 없음).
  const topicHistory = useMemo(() => {
    return topicHistoryEntries
      .map(e => ({ entry: e, report: reports.find(r => r.id === e.report_id) }))
      .filter((x): x is { entry: WorkReportEntry; report: WorkReport } => !!x.report)
      .sort((a, b) => (b.report.report_date ?? b.report.period_end).localeCompare(a.report.report_date ?? a.report.period_end))
  }, [topicHistoryEntries, reports])

  const historyItems: HistoryItem[] = useMemo(() => {
    if (itemSection) {
      return [...reportsByDate].reverse().map(r => ({
        id: r.id,
        label: fmtPeriodLabel(r.period_start, r.period_end),
        dateLabel: fmtDateFull(r.report_date ?? r.period_end),
        value: itemsToText(itemsOf(r.id, itemSection), itemSection, itemSection === 'issue' ? r.issues : undefined),
        isCurrent: r.id === currentReport?.id,
      }))
    }
    if (isFixedKey(selection)) {
      const key = selection as FixedSectionKey
      // 상단 보고 이력 타임라인과 같은 보고일 순서를 쓴다(RIGHT 네비게이션 방향 일치).
      return [...reportsByDate].reverse().map(r => ({
        id: r.id,
        label: fmtPeriodLabel(r.period_start, r.period_end),
      dateLabel: fmtDateFull(r.report_date ?? r.period_end),
        value: r[key],
        isCurrent: r.id === currentReport?.id,
      }))
    }
    return topicHistory.map(({ report: r, entry: e }) => ({
      id: r.id,
      label: fmtPeriodLabel(r.period_start, r.period_end),
      dateLabel: fmtDateFull(r.report_date ?? r.period_end),
      value: e.report_text,
      isCurrent: r.id === currentReport?.id,
    }))
  }, [selection, itemSection, itemsOf, reportsByDate, topicHistory, currentReport])

  const historyTitle = itemSection
    ? `${ITEM_SECTION_META[itemSection].no} ${ITEM_SECTION_META[itemSection].title} 히스토리`
    : isFixedKey(selection) ? FIXED_HISTORY_TITLE[selection as FixedSectionKey] : '이 주제의 히스토리'
  // "전체 히스토리 보기"(주제별 히스토리 화면)는 topic 선택 드롭다운만 있어 고정 섹션에는
  // 대응되는 화면이 없다 — 없는 기능으로 연결하지 않는다.
  const showFullHistoryLink = !isFixedKey(selection) && !itemSection

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

  // "이번 보고에서 제외" — 현재 draft report의 membership(entry)만 지운다. topic master,
  // 과거 entries, topic history는 손대지 않는다(스펙 §5). TopicOutline의 X 버튼과 테이블
  // 작성의 "···" 메뉴가 이 하나의 handler를 공유하므로, 확인 문구도 두 화면에서 항상 동일하다.
  async function handleRemoveFromReport(topicId: string) {
    if (!currentReport || readOnly) return
    const entry = entries.find(e => e.topic_id === topicId)
    if (!entry) return
    const message = isEntryWritten(entry)
      ? '이 주제에는 작성된 내용이 있습니다.\n이번 보고에서 제외하면 현재 회차에 작성한 내용이 제거됩니다.\n과거 보고 이력과 주제 자체는 유지됩니다.'
      : '이 주제를 이번 보고에서 제외할까요?\n과거 보고 이력과 주제 자체는 유지됩니다.'
    if (!confirm(message)) return
    await supabase.from('work_report_entries').delete().eq('id', entry.id)
    patchEntry(currentReport.id, list => list.filter(e => e.id !== entry.id))
    if (selection === topicId) setSelection('summary')
  }

  // "주제 종료" — topic lifecycle 자체를 끝낸다("이번 보고에서 제외"와 다른 기능, 스펙 §8).
  // 과거 report/history는 그대로 유지되고, 새 report carry-forward 및 "기존 주제 불러오기"
  // 후보에서만 제외된다. 이 화면에는 되돌리는 UI가 없으므로(마스터 상태 전환) 확인을 거친다.
  async function handleArchiveTopic(topicId: string) {
    const topic = topicsById.get(topicId)
    if (!confirm(`'${topic?.title ?? '이 주제'}'를 종료할까요?\n과거 보고 이력은 유지되며, 새 보고에는 더 이상 자동으로 포함되지 않습니다.`)) return
    const { data } = await supabase
      .from('work_report_topics')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', topicId).select().single()
    if (data) setTopics(prev => prev.map(t => t.id === topicId ? data as WorkReportTopic : t))
  }

  // "기존 주제 불러오기" — topic master에는 있지만 이번 report에는 entry가 없는 active
  // topic을 골라, 기존 topic_id 그대로 새 work_report_entry만 만든다(스펙 §6). handleAddTopic과
  // 달리 topic을 새로 만들지 않는다 — 이미 확정된 topicId들이 입력으로 들어오기 때문.
  async function handleAddExistingTopics(topicIds: string[]) {
    if (!currentReport || readOnly || topicIds.length === 0) return
    const already = new Set(entries.map(e => e.topic_id))
    const targets = topicIds.filter(id => !already.has(id))
    if (targets.length === 0) return
    let nextSortOrder = entries.length ? Math.max(...entries.map(e => e.sort_order)) + 1 : 0
    const inserts = targets.map(topicId => ({
      report_id: currentReport.id,
      topic_id: topicId,
      sort_order: nextSortOrder++,
      topic_title_snapshot: topicsById.get(topicId)?.title ?? '',
    }))
    const { data: insertedEntries, error } = await supabase.from('work_report_entries').insert(inserts).select()
    if (error || !insertedEntries) return
    patchEntry(currentReport.id, list => [...list, ...(insertedEntries as WorkReportEntry[])])
  }

  function handleEntrySaved(entry: WorkReportEntry) {
    patchEntry(entry.report_id, list => list.map(e => e.id === entry.id ? entry : e))
  }

  function handleReportSaved(updated: WorkReport) {
    setReports(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  async function handlePeriodChange(field: 'period_start' | 'period_end' | 'report_date', value: string) {
    if (!currentReport || !value || readOnly) return
    const { data } = await supabase.from('work_reports').update({ [field]: value }).eq('id', currentReport.id).select().single()
    if (data) handleReportSaved(data as WorkReport)
  }

  // ── 3-1/3-2/3-3 항목 ────────────────────────────────────────────────
  // final 회차는 DB 트리거(schema_v58)가 INSERT/UPDATE/DELETE를 막지만, 다른 mutation과
  // 동일하게 클라이언트에서도 readOnly를 한 번 더 확인한다.
  function nextItemSortOrder(section: WorkReportItemSection) {
    const list = itemsOf(currentReport?.id, section)
    return list.length ? Math.max(...list.map(i => i.sort_order)) + 1 : 0
  }

  async function handleAddItem(section: WorkReportItemSection): Promise<WorkReportItem | null> {
    if (!currentReport || readOnly) return null
    const { data, error } = await supabase.from('work_report_items')
      .insert({ report_id: currentReport.id, section, sort_order: nextItemSortOrder(section) })
      .select().single()
    if (error || !data) return null
    setAllItems(prev => [...prev, data as WorkReportItem])
    return data as WorkReportItem
  }

  // "직전 항목 불러오기" — 직전 회차에서 이번 회차로 이월되지 않았거나 삭제한 항목을 같은
  // lineage_id로 다시 가져온다(내용은 직전 회차 값 그대로 복사).
  async function handleRestoreItem(prevItem: WorkReportItem) {
    if (!currentReport || readOnly) return
    const { data, error } = await supabase.from('work_report_items').insert({
      report_id: currentReport.id, section: prevItem.section, lineage_id: prevItem.lineage_id,
      title: prevItem.title, status: prevItem.status, owner: prevItem.owner,
      summary: prevItem.summary, detail: prevItem.detail, sort_order: nextItemSortOrder(prevItem.section),
    }).select().single()
    if (error || !data) return
    setAllItems(prev => [...prev, data as WorkReportItem])
  }

  // skipConfirm — 3-x 그리드에서 빈 행을 Backspace로 지울 때는 확인 없이 바로 지운다.
  async function handleDeleteItem(item: WorkReportItem, opts?: { skipConfirm?: boolean }): Promise<boolean> {
    if (!currentReport || readOnly) return false
    if (!opts?.skipConfirm) {
      const message = isItemWritten(item)
        ? `'${item.title || '제목 없음'}' 항목을 이번 보고에서 삭제할까요?\n과거 보고의 같은 항목은 유지됩니다.`
        : '이 항목을 삭제할까요?'
      if (!confirm(message)) return false
    }
    const { error } = await supabase.from('work_report_items').delete().eq('id', item.id)
    if (error) return false
    setAllItems(prev => prev.filter(i => i.id !== item.id))
    return true
  }

  function handleItemSaved(item: WorkReportItem) {
    setAllItems(prev => prev.map(i => i.id === item.id ? item : i))
  }

  async function handleNewReport() {
    const latest = reportsDesc[0] ?? null
    const periodStart = latest ? addDaysToDateStr(latest.period_end, 1) : todayStr()
    const periodEnd = addDaysToDateStr(periodStart, 13)
    // 보고일 기본값 — 직전 보고일 + 14일(격주). 직전 보고일이 없으면 이번 기간 종료일.
    const reportDate = latest?.report_date ? addDaysToDateStr(latest.report_date, 14) : periodEnd
    const { data: reportData, error } = await supabase.from('work_reports').insert({ period_start: periodStart, period_end: periodEnd, report_date: reportDate }).select().single()
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

    // 3-1/3-2/3-3 자동 이월 — 직전 회차 항목을 같은 lineage_id로 전부 복사한다. 필요 없는
    // 항목은 새 회차에서 삭제한다(주제 carry-forward와 같은 방향, STEP 4 결정).
    let carriedItems: WorkReportItem[] = []
    if (latest) {
      const latestItems = allItems.filter(i => i.report_id === latest.id)
      if (latestItems.length > 0) {
        const { data: insertedItems } = await supabase.from('work_report_items').insert(
          latestItems.map(i => ({
            report_id: newReport.id, section: i.section, lineage_id: i.lineage_id,
            title: i.title, status: i.status, owner: i.owner, summary: i.summary, detail: i.detail,
            sort_order: i.sort_order,
          })),
        ).select()
        carriedItems = (insertedItems as WorkReportItem[]) ?? []
      }
    }
    if (carriedItems.length) setAllItems(prev => [...prev, ...carriedItems])

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
      await itemPanelRef.current?.flushPending()
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

  // 회차 삭제 — work_report_entries/work_report_items는 FK ON DELETE CASCADE로 함께 지워지고,
  // 주제(work_report_topics)와 다른 회차는 그대로 둔다. 회차 선택 드롭다운에서 아무 회차나
  // 지울 수 있다 — 지금 보고 있는 회차를 지웠을 때만 남은 최신 회차로 이동한다.
  async function handleDeleteReport(target: WorkReport) {
    const isCurrent = target.id === currentReportId
    const label = fmtDateFull(target.report_date ?? target.period_end)
    const wasFinal = target.status === 'final'
    const finalNote = wasFinal ? '\n(확정된 보고입니다 — 확정을 해제한 뒤 삭제합니다.)' : ''
    if (!confirm(`${label} 보고를 삭제할까요?\n이 회차의 주제별 내용과 3-1/3-2/3-3 항목이 모두 삭제되며 되돌릴 수 없습니다.${finalNote}`)) return
    // 지금 열려 있는 회차를 지울 때는 pending debounce를 먼저 커밋해 두어, 이후 unmount
    // flush가 이미 지워진 회차에 저장을 시도하지 않게 한다.
    if (isCurrent) {
      await editorRef.current?.flushPending()
      await itemPanelRef.current?.flushPending()
    }
    const deletedId = target.id
    // final 회차는 DB 트리거(protect_final_work_report, v56/v57)가 DELETE를 막고, 자식
    // entries/items의 CASCADE 삭제도 부모가 final이면 막힌다. 트리거가 유일하게 허용하는
    // "편집 재개"(final→draft, 다른 필드 불변) 전환을 먼저 한 뒤 삭제한다 — 트리거의
    // "확정 내용은 수정 불가" 보호는 그대로 두고, 의도적인 삭제만 2단계로 통과시킨다.
    if (wasFinal) {
      const { error: unfinalizeError } = await supabase
        .from('work_reports').update({ status: 'draft', finalized_at: null }).eq('id', deletedId)
      if (unfinalizeError) { alert(`보고 삭제에 실패했습니다(확정 해제 단계): ${unfinalizeError.message}`); return }
    }
    const { error } = await supabase.from('work_reports').delete().eq('id', deletedId)
    if (error) {
      // 삭제가 실패하면 확정 상태를 원래대로 되돌린다(draft→final은 트리거 제약 없음).
      if (wasFinal) {
        await supabase.from('work_reports')
          .update({ status: 'final', finalized_at: target.finalized_at ?? new Date().toISOString() })
          .eq('id', deletedId)
      }
      alert(`보고 삭제에 실패했습니다: ${error.message}`)
      return
    }
    const remaining = reportsAsc.filter(r => r.id !== deletedId)
    setReports(prev => prev.filter(r => r.id !== deletedId))
    setAllItems(prev => prev.filter(i => i.report_id !== deletedId))
    entriesCacheRef.current.delete(deletedId)
    loadedReportIds.current.delete(deletedId)
    setEntriesByReport(prev => { const next = new Map(prev); next.delete(deletedId); return next })
    if (isCurrent) {
      setCurrentReportId(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
      setSelection('summary')
    }
  }

  function goToReport(reportId: string) {
    setCurrentReportId(reportId)
    setSelection('summary')
    setPickerOpen(false)
  }

  // Archive의 "전체 보고" 카드에서 "이 보고 열기 →"를 누르면 그 회차를 작성 화면에서
  // 그대로 이어서 본다(draft면 편집 가능, final이면 기존과 동일하게 read-only) — 새로운
  // "열람 전용" 모드를 따로 만들지 않는다.
  function handleOpenReport(reportId: string) {
    setCurrentReportId(reportId)
    setSelection('summary')
    setMode('write')
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
      {/* ── 상단 바 (B안, 2026-10-02) ──
          예전 3행(보고일/기간 입력 · 보고 이력 칩 · 진행률+탭+버튼)을 한 줄로 합쳤다.
          좌: 제목 + mode 탭 / 중: ◀ 회차 선택 ▶ + 기간(✎로 편집) + 진행률 / 우: 새 보고·확정 + ⋯.
          과거 회차 목록·삭제는 회차 선택 드롭다운에, 덜 쓰는 "문서로 보기"·"삭제"는 ⋯ 메뉴에 둔다. */}
      {(() => {
        const idx = currentReport ? reportsByDate.findIndex(r => r.id === currentReport.id) : -1
        const olderReport = idx > 0 ? reportsByDate[idx - 1] : null
        const newerReport = idx >= 0 && idx < reportsByDate.length - 1 ? reportsByDate[idx + 1] : null
        const navBtn = (target: WorkReport | null, label: string, title: string) => (
          <button
            onClick={() => { if (target) { setEditingDates(false); goToReport(target.id) } }}
            disabled={!target}
            title={title}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[12px] transition-colors disabled:opacity-30"
            style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.04)' }}
          >
            {label}
          </button>
        )
        const statusPill = (r: WorkReport) => (
          <span
            className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={r.status === 'final'
              ? { color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }
              : { color: S.t3, background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}` }}
          >
            {r.status === 'final' ? '확정' : '작성중'}
          </span>
        )
        return (
          <div className="flex items-center gap-x-4 gap-y-2 px-6 py-3 flex-shrink-0 flex-wrap" style={{ borderBottom: `1px solid ${S.border}` }}>
            <div className="flex items-center gap-3">
              <p className="text-[15px] font-semibold" style={{ color: S.t1 }}>업무보고</p>
              <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(var(--ink-rgb),0.04)' }}>
                {([['write', '작성'], ['archive', '아카이브']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => {
                      // 헤더 pill을 직접 눌러 들어갈 때는 항상 Archive 기본값(전체 보고)에서
                      // 시작한다 — RIGHT의 "전체 히스토리 보기"를 통한 진입(주제별 보기로 점프)과
                      // 구분한다.
                      if (k === 'archive') setArchiveJumpTopicId(null)
                      setMode(k)
                    }}
                    className="px-3 py-1 rounded-lg text-[12px] font-medium transition-colors"
                    style={{ color: mode === k ? S.t1 : S.t3, background: mode === k ? S.accentDim : 'transparent' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'write' && currentReport && (
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                {/* 회차 선택: ◀ 이전 회차 · [보고일 · 상태 ▾] · 다음 회차 ▶ */}
                <div className="flex items-center gap-1">
                  {navBtn(olderReport, '◀', '이전 보고')}
                  <div ref={pickerRef} className="relative">
                    <button
                      onClick={() => setPickerOpen(o => !o)}
                      className="flex items-center gap-2 px-3 py-1 rounded-lg text-[13px] font-semibold transition-colors"
                      style={{ color: S.t1, background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${pickerOpen ? S.accentBorder : S.border}` }}
                    >
                      {fmtDateFull(currentReport.report_date ?? currentReport.period_end)} 보고
                      {statusPill(currentReport)}
                      <span className="text-[10px]" style={{ color: S.t4 }}>▾</span>
                    </button>
                    {pickerOpen && (
                      <div
                        className="absolute left-0 top-full mt-1 z-50 rounded-xl py-1 overflow-y-auto"
                        style={{ width: 340, maxHeight: 420, background: 'var(--surface-elevated)', border: `1px solid ${S.borderStrong}`, boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}
                      >
                        <p className="px-3 pt-1.5 pb-1 text-[10.5px] font-semibold" style={{ color: S.t4 }}>보고 목록 · {reportsByDate.length}건</p>
                        {[...reportsByDate].reverse().map(r => {
                          const active = r.id === currentReportId
                          return (
                            <div
                              key={r.id}
                              className="group flex items-center gap-2 px-2 mx-1 rounded-lg"
                              style={{ background: active ? S.accentDim : 'transparent' }}
                            >
                              <button
                                onClick={() => { setEditingDates(false); goToReport(r.id) }}
                                className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left"
                              >
                                <span className="text-[12.5px] font-medium flex-shrink-0" style={{ color: active ? S.accentText : S.t1 }}>
                                  {fmtDateFull(r.report_date ?? r.period_end)}
                                </span>
                                <span className="text-[11px] truncate" style={{ color: S.t4 }}>
                                  {fmtPeriodLabel(r.period_start, r.period_end)}
                                </span>
                                <span className="ml-auto">{statusPill(r)}</span>
                              </button>
                              <button
                                onClick={() => { setPickerOpen(false); void handleDeleteReport(r) }}
                                title="이 보고 삭제"
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-1.5 py-1 rounded text-[11px] transition-opacity"
                                style={{ color: '#F87171' }}
                              >
                                삭제
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {navBtn(newerReport, '▶', '다음 보고')}
                </div>

                {/* 보고일/기간 — 평소에는 텍스트, ✎을 누르면 그 자리에서 날짜 입력으로 바뀐다(확정 회차는 편집 불가). */}
                {editingDates && !readOnly ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold" style={{ color: S.t3 }}>보고일</span>
                    <DateField
                      key={`${currentReport.id}:report_date`}
                      value={currentReport.report_date ?? ''}
                      disabled={readOnly}
                      emphasis
                      onCommit={v => handlePeriodChange('report_date', v)}
                    />
                    <span className="text-[11px]" style={{ color: S.t4 }}>기간</span>
                    <DateField
                      key={`${currentReport.id}:period_start`}
                      value={currentReport.period_start}
                      disabled={readOnly}
                      onCommit={v => handlePeriodChange('period_start', v)}
                    />
                    <span style={{ color: S.t4 }}>~</span>
                    <DateField
                      key={`${currentReport.id}:period_end`}
                      value={currentReport.period_end}
                      disabled={readOnly}
                      onCommit={v => handlePeriodChange('period_end', v)}
                    />
                    <button
                      onClick={() => setEditingDates(false)}
                      className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium"
                      style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}
                    >
                      완료
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]" style={{ color: S.t4 }}>기간</span>
                    <span className="text-[12px]" style={{ color: S.t2 }}>{fmtPeriodLabel(currentReport.period_start, currentReport.period_end)}</span>
                    {!readOnly && (
                      <button
                        onClick={() => setEditingDates(true)}
                        title="보고일·기간 수정"
                        className="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                        style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.04)' }}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                )}

                {/* 작성 진행률 — 주제가 0개면 숨긴다. 상세 문구는 hover title로. */}
                {totalTopicCount > 0 && (
                  <div
                    className="flex items-center gap-1.5"
                    title={`${totalTopicCount}개 주제 · ${writtenCount}개 작성 · ${totalTopicCount - writtenCount}개 미작성`}
                  >
                    <span className="text-[11.5px]" style={{ color: S.t3 }}>{writtenCount}/{totalTopicCount}</span>
                    <div className="rounded-full overflow-hidden" style={{ width: 64, height: 4, background: 'rgba(var(--ink-rgb),0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: S.accent }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {mode === 'write' && currentReport && (
                <>
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
                  <div ref={moreRef} className="relative">
                    <button
                      onClick={() => setMoreOpen(o => !o)}
                      title="더보기"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[14px] transition-colors"
                      style={{ color: S.t3, background: moreOpen ? S.accentDim : 'rgba(var(--ink-rgb),0.04)' }}
                    >
                      ⋯
                    </button>
                    {moreOpen && (
                      <div
                        className="absolute right-0 top-full mt-1 z-50 rounded-xl py-1"
                        style={{ width: 160, background: 'var(--surface-elevated)', border: `1px solid ${S.borderStrong}`, boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}
                      >
                        <button
                          onClick={() => { setMoreOpen(false); setFullViewOpen(true) }}
                          className="w-full text-left px-3 py-2 text-[12.5px] transition-colors hover:bg-[rgba(var(--ink-rgb),0.06)]"
                          style={{ color: S.t1 }}
                        >
                          문서로 보기
                        </button>
                        <button
                          onClick={() => { setMoreOpen(false); void handleDeleteReport(currentReport) }}
                          className="w-full text-left px-3 py-2 text-[12.5px] transition-colors hover:bg-[rgba(var(--ink-rgb),0.06)]"
                          style={{ color: '#F87171' }}
                        >
                          이 보고 삭제
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── 본문 ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {mode === 'write' && (
          currentReport ? (
            <>
              {/* Desktop 3-pane breakpoint — AppShell 자체가 mobile/desktop을 나누는 지점(md,
                  Sidebar 표시 여부)과 동일한 이분법을 따르되, 그보다 한 단계 위 표준 Tailwind
                  breakpoint(lg=1024px)를 쓴다. md(768px)를 그대로 재사용하면 Sidebar(240px,
                  펼침 기준)+본문 padding(48px)만으로 거의 다 소진되어 그 경계에서 Writing이
                  사실상 0에 가까워진다 — 그래서 AppShell과 다른 임의의 숫자를 새로 만드는 대신,
                  Tailwind가 이미 갖고 있는 다음 표준 단계를 쓴다. lg 이상에서는 Outline(190px)
                  +Context(230px)를 빼도 Writing이 항상 실사용 가능한 폭을 갖는다.
                  lg 미만(태블릿/모바일 포함)에서는 기존 "버튼 → 드로어" 패턴을 그대로 쓴다.
                  선을 긋는 border 대신 아주 옅은 배경 틴트로 구분해 3분할 grid처럼 보이는
                  느낌을 완화한다 — CENTER는 톤 변화 없이 페이지 배경 그대로 두어 가장
                  "밝고 넓은 캔버스"로 읽히게 한다. */}
              <div className="hidden lg:block h-full" style={{ background: 'rgba(var(--ink-rgb),0.015)' }}>
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
                  onOpenRestore={() => setRestoreOpen(true)}
                  summaryWritten={summaryWritten}
                  itemWritten={itemWritten}
                  nextStepsWritten={nextStepsWritten}
                />
              </div>

              <button
                onClick={() => setTopicDrawerOpen(true)}
                className="lg:hidden flex-shrink-0 self-start mt-3 ml-2 px-2.5 py-1.5 rounded-lg text-[11px]"
                style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}
              >
                목차
              </button>

              <div className="flex-1 min-w-0 h-full overflow-hidden">
                {itemSection ? (
                  <ItemSectionPanel
                    key={`${currentReport.id}:${selection}`}
                    ref={itemPanelRef}
                    supabase={supabase}
                    section={itemSection}
                    prevReport={prevReport}
                    items={itemsOf(currentReport.id, itemSection)}
                    prevItems={itemsOf(prevReport?.id, itemSection)}
                    readOnly={readOnly}
                    legacyText={itemSection === 'issue' ? currentReport.issues : undefined}
                    onItemSaved={handleItemSaved}
                    onAdd={() => handleAddItem(itemSection)}
                    onDelete={handleDeleteItem}
                    onRestore={handleRestoreItem}
                  />
                ) : (
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
                    readOnly={readOnly}
                    onEntrySaved={handleEntrySaved}
                    onReportSaved={handleReportSaved}
                    hasPrevTopic={hasPrevTopic}
                    hasNextTopic={hasNextTopic}
                    onPrevTopic={goPrevTopic}
                    onNextTopic={goNextTopic}
                    onAddTopic={handleAddTopic}
                  />
                )}
              </div>

              <button
                onClick={() => setContextDrawerOpen(true)}
                className="lg:hidden flex-shrink-0 self-start mt-3 mr-2 px-2.5 py-1.5 rounded-lg text-[11px]"
                style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}
              >
                컨텍스트
              </button>

              <div className="hidden lg:block h-full" style={{ background: 'rgba(var(--ink-rgb),0.015)' }}>
                <ContextPanel
                  key={`${currentReport.id}:${selection}`}
                  title={historyTitle}
                  items={historyItems}
                  showFullHistoryLink={showFullHistoryLink}
                  onOpenFullHistory={() => { setArchiveJumpTopicId(selectedTopic?.id ?? null); setMode('archive') }}
                />
              </div>

              {topicDrawerOpen && (
                <div className="fixed inset-0 z-40 lg:hidden" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setTopicDrawerOpen(false)}>
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
                      onOpenRestore={() => { setRestoreOpen(true); setTopicDrawerOpen(false) }}
                      summaryWritten={summaryWritten}
                      itemWritten={itemWritten}
                      nextStepsWritten={nextStepsWritten}
                    />
                  </div>
                </div>
              )}

              {contextDrawerOpen && (
                <div className="fixed inset-0 z-40 lg:hidden" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setContextDrawerOpen(false)}>
                  <div className="absolute inset-y-0 right-0 h-full" style={{ background: S.panel }} onClick={e => e.stopPropagation()}>
                    <ContextPanel
                      key={`${currentReport.id}:${selection}`}
                      title={historyTitle}
                      items={historyItems}
                      showFullHistoryLink={showFullHistoryLink}
                      onOpenFullHistory={() => { setArchiveJumpTopicId(selectedTopic?.id ?? null); setMode('archive'); setContextDrawerOpen(false) }}
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

        {mode === 'archive' && (
          <ArchiveView
            supabase={supabase}
            items={allItems}
            topics={topics}
            reports={reportsAsc}
            onOpenReport={handleOpenReport}
            initialTab={archiveJumpTopicId ? 'topic' : undefined}
            initialTopicId={archiveJumpTopicId ?? undefined}
          />
        )}
      </div>

      {restoreOpen && currentReport && !readOnly && (
        <RestoreTopicModal
          supabase={supabase}
          candidateTopics={restoreCandidates}
          reports={reportsAsc}
          onClose={() => setRestoreOpen(false)}
          onRestore={topicIds => { void handleAddExistingTopics(topicIds); setRestoreOpen(false) }}
        />
      )}

      {fullViewOpen && currentReport && (
        <ReportFullViewModal report={currentReport} rows={fullViewRows} items={allItems.filter(i => i.report_id === currentReport.id)} onClose={() => setFullViewOpen(false)} />
      )}
    </div>
  )
}
