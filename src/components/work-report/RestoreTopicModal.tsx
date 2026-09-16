'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { X } from 'lucide-react'
import type { WorkReport, WorkReportTopic } from '@/types'
import { S, fmtPeriodLabel } from './style'

// "기존 주제 불러오기" — topic master에는 존재하고(archived 아님), 이번 report에는 아직
// entry가 없는 active topic만 후보로 보여준다(page.tsx가 candidateTopics로 이미 필터링해
// 넘긴다). 선택해서 추가하면 기존 topic_id 그대로 새 work_report_entry만 생성된다 — 여기서
// 새 topic을 만들지 않는다.
interface Props {
  supabase: SupabaseClient
  candidateTopics: WorkReportTopic[]
  reports: WorkReport[]           // 전체 report — "마지막 보고 기간" 라벨 계산용
  onClose: () => void
  onRestore: (topicIds: string[]) => void
}

export default function RestoreTopicModal({ supabase, candidateTopics, reports, onClose, onRestore }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastReport, setLastReport] = useState<Map<string, WorkReport>>(new Map())
  const [loading, setLoading] = useState(candidateTopics.length > 0)

  const reportById = useMemo(() => new Map(reports.map(r => [r.id, r])), [reports])
  const candidateIds = useMemo(() => candidateTopics.map(t => t.id), [candidateTopics])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (candidateIds.length === 0) { if (!cancelled) setLoading(false); return }
      setLoading(true)
      const { data } = await supabase
        .from('work_report_entries')
        .select('topic_id, report_id')
        .in('topic_id', candidateIds)
      if (cancelled) return
      const latest = new Map<string, WorkReport>()
      for (const row of (data as { topic_id: string; report_id: string }[]) ?? []) {
        const report = reportById.get(row.report_id)
        if (!report) continue
        const existing = latest.get(row.topic_id)
        if (!existing || report.period_start > existing.period_start) latest.set(row.topic_id, report)
      }
      setLastReport(latest)
      setLoading(false)
    }
    void run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIds.join(',')])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? candidateTopics.filter(t => t.title.toLowerCase().includes(q)) : candidateTopics
    return [...list].sort((a, b) => {
      const ra = lastReport.get(a.id)
      const rb = lastReport.get(b.id)
      if (ra && rb) return rb.period_start.localeCompare(ra.period_start)
      if (ra) return -1
      if (rb) return 1
      return a.title.localeCompare(b.title)
    })
  }, [candidateTopics, query, lastReport])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface-elevated)', border: `1px solid ${S.borderStrong}`, maxHeight: '80vh', boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${S.border}` }}>
          <h3 className="text-[14.5px] font-semibold" style={{ color: S.t1 }}>기존 주제 불러오기</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[rgba(var(--ink-rgb),0.07)]" style={{ color: S.t3 }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pt-3.5 pb-2 flex-shrink-0">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="주제 검색…"
            className="w-full text-[12.5px] px-3 py-2 rounded-lg outline-none"
            style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}`, color: S.t1 }}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {loading ? (
            <p className="px-3 py-4 text-[12px]" style={{ color: S.t4 }}>불러오는 중…</p>
          ) : candidateTopics.length === 0 ? (
            <p className="px-3 py-4 text-[12px]" style={{ color: S.t4 }}>불러올 수 있는 과거 주제가 없습니다.</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-[12px]" style={{ color: S.t4 }}>검색 결과가 없습니다.</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(t => {
                const report = lastReport.get(t.id)
                const checked = selected.has(t.id)
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer"
                    style={{ background: checked ? S.accentDim : 'transparent' }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(t.id)} className="flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-[12.5px] truncate" style={{ color: checked ? S.accentText : S.t2, fontWeight: checked ? 600 : 400 }}>
                      {t.title}
                    </span>
                    <span className="flex-shrink-0 text-[10.5px]" style={{ color: S.t4 }}>
                      {report ? `마지막 보고 ${fmtPeriodLabel(report.period_start, report.period_end)}` : '처음 사용'}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0" style={{ borderTop: `1px solid ${S.border}` }}>
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium" style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.05)' }}>
            취소
          </button>
          <button
            onClick={() => { if (selected.size > 0) onRestore([...selected]) }}
            disabled={selected.size === 0}
            className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold disabled:opacity-40"
            style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}
          >
            추가{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
