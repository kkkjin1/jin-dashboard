'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CalendarDays, UserRound, FileText } from 'lucide-react'
import type { AdhocReport } from '@/types'
import { useAutosave } from '@/hooks/useAutosave'
import { useCanonicalSync, canonicalStatusText } from '@/hooks/useCanonicalSync'
import { revealVoiceBlock } from '@/lib/executiveVoices'
import { htmlToMarkdown } from '@/lib/tiptapMarkdown'
import { TextBox } from './ReportEditorPanel'
import { S, WRITING_CONTENT_WIDTH, fmtDateFull, todayStr, hasContent } from './style'

// 수시보고(2026-10-28) — 정기보고(work_reports)와 표·화면을 완전히 나눴다. 정기보고의 직전 회차·이월·
// 보고일 기본값이 모두 work_reports 목록 순서로 계산되므로, 같은 표에 섞으면 그 계산이 깨진다.
// 회차·이월 개념 없이 한 건씩 쌓이는 아카이브: 왼쪽 목록(본문은 노출하지 않음) + 오른쪽 편집.
// 보고 내용·결과 칸에서 Alt+3/4로 표시한 줄은 의사결정 탭에 출처 "수시보고"로 모인다.

export type ReportKind = 'regular' | 'adhoc'

// 상단 [정기 | 수시] 전환 — 정기 화면 머리글과 수시 화면 머리글이 같이 쓴다.
export function ReportKindSwitch({ kind, onChange }: { kind: ReportKind; onChange: (k: ReportKind) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(var(--ink-rgb),0.04)' }}>
      {([['regular', '정기'], ['adhoc', '수시']] as const).map(([k, label]) => (
        <button
          key={k}
          onClick={() => { if (k !== kind) onChange(k) }}
          className="px-3 py-1 rounded-lg text-[12px] font-medium transition-colors"
          style={{ color: kind === k ? S.t1 : S.t3, background: kind === k ? S.accentDim : 'transparent' }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

type ListRow = Pick<AdhocReport, 'id' | 'report_date' | 'title' | 'audience' | 'created_at'>
type Draft = Pick<AdhocReport, 'report_date' | 'title' | 'audience' | 'body' | 'result'>

const LIST_COLS = 'id, report_date, title, audience, created_at'

// 보고일 최신순, 같은 날이면 나중에 만든 것 먼저
const byRecent = (a: ListRow, b: ListRow) => b.report_date.localeCompare(a.report_date) || b.created_at.localeCompare(a.created_at)

export function adhocToMarkdown(d: Draft): string {
  const text = (v: string) => (hasContent(v) ? htmlToMarkdown(v) : '(작성된 내용 없음)')
  const out = [`# ${d.title.trim() || '(제목 없음)'}`, '', `- 보고일: ${fmtDateFull(d.report_date)}`]
  if (d.audience.trim()) out.push(`- 보고 대상: ${d.audience.trim()}`)
  out.push('', '## 보고 내용', '', text(d.body), '', '## 결과 · 피드백', '', text(d.result))
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export default function AdhocReportView({
  supabase, kindSwitch, initialId, initialVoice,
}: {
  supabase: SupabaseClient
  kindSwitch: React.ReactNode
  initialId: string | null
  initialVoice: string | null
}) {
  const [rows, setRows] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // 검색은 서버에서 id만 받아 거른다 — 본문을 목록에 내려받지 않기 위함
  // 결과는 어떤 검색어의 것인지 함께 둔다 — 검색어를 지우면 effect 없이 바로 전체 목록
  const [match, setMatch] = useState<{ q: string; ids: Set<string> } | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // 좁은 화면: 목록 ↔ 편집 한쪽만
  const [mobileEditing, setMobileEditing] = useState(false)

  useEffect(() => {
    let alive = true
    void supabase.from('adhoc_reports').select(LIST_COLS).then(({ data, error }) => {
      if (!alive) return
      if (error) { setLoadError(error.message); setLoading(false); return }
      const list = ((data ?? []) as ListRow[]).sort(byRecent)
      setRows(list)
      const first = initialId && list.some(r => r.id === initialId) ? initialId : list[0]?.id ?? null
      setSelectedId(first)
      if (initialId && first === initialId) setMobileEditing(true)
      setLoading(false)
    })
    return () => { alive = false }
  }, [supabase, initialId])

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let alive = true
    const t = setTimeout(() => {
      // ilike 패턴의 , ( ) 는 or() 구문을 깨므로 공백으로 바꾼다
      const p = `%${q.replace(/[,()%_]/g, ' ')}%`
      void supabase.from('adhoc_reports').select('id')
        .or(`title.ilike.${p},audience.ilike.${p},body.ilike.${p},result.ilike.${p}`)
        .then(({ data }) => { if (alive) setMatch({ q, ids: new Set((data ?? []).map((r: { id: string }) => r.id)) }) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [query, supabase])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  const q = query.trim()
  const matchIds = q && match?.q === q ? match.ids : null
  const visible = useMemo(() => (matchIds ? rows.filter(r => matchIds.has(r.id)) : rows), [rows, matchIds])

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    const { data, error } = await supabase.from('adhoc_reports').insert({ report_date: todayStr() }).select(LIST_COLS).single()
    setCreating(false)
    if (error || !data) { setNotice('새 수시보고를 만들지 못했습니다'); return }
    setQuery('')
    setRows(prev => [data as ListRow, ...prev].sort(byRecent))
    setSelectedId((data as ListRow).id)
    setMobileEditing(true)
  }

  const handleSaved = useCallback((row: AdhocReport) => {
    setRows(prev => prev.map(r => (r.id === row.id ? { id: row.id, report_date: row.report_date, title: row.title, audience: row.audience, created_at: row.created_at } : r)).sort(byRecent))
  }, [])

  // 목록 행의 삭제 — 브라우저 확인창 대신 두 번 눌러 삭제(첫 클릭은 "삭제 확인"으로 바뀌고 3초 뒤 원래대로)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  useEffect(() => {
    if (!confirmDeleteId) return
    const t = setTimeout(() => setConfirmDeleteId(null), 3000)
    return () => clearTimeout(t)
  }, [confirmDeleteId])

  async function handleDelete(id: string) {
    setConfirmDeleteId(null)
    // 열려 있는 보고를 지우면 편집 화면을 먼저 닫아(저장 마무리) 지운 행에 다시 쓰지 않게 한다
    if (id === selectedId) {
      setSelectedId(rows.find(r => r.id !== id)?.id ?? null)
      setMobileEditing(false)
    }
    const { error } = await supabase.from('adhoc_reports').delete().eq('id', id)
    if (error) { setNotice('삭제하지 못했습니다'); return }
    setRows(prev => prev.filter(r => r.id !== id))
    setNotice('삭제했습니다')
  }

  const voiceForSelected = selectedId && selectedId === initialId ? initialVoice : null

  return (
    <div className="h-full flex flex-col" style={{ background: S.bg }}>
      <div className="flex items-center gap-x-4 gap-y-2 px-6 py-3 flex-shrink-0 flex-wrap" style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-3">
          <p className="text-[15px] font-semibold" style={{ color: S.t1 }}>업무보고</p>
          {kindSwitch}
        </div>
        <div className="flex-1" />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
          style={{ color: S.accentText, background: S.accentDim, border: `1px solid ${S.accentBorder}` }}
        >
          + 새 수시보고
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* 왼쪽 목록 — 제목·대상·보고일만(본문 미노출) */}
        <div
          className={`${mobileEditing ? 'hidden' : 'flex'} md:flex flex-col w-full md:w-[280px] flex-shrink-0 min-h-0`}
          style={{ borderRight: `1px solid ${S.border}` }}
        >
          <div className="px-3 pt-3 pb-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="제목·대상·내용 검색"
              className="w-full text-[12px] px-2.5 py-1.5 rounded-lg focus:outline-none"
              style={{ background: 'rgba(var(--ink-rgb),0.05)', border: `1px solid ${S.border}`, color: S.t1 }}
            />
            <p className="mt-2 text-[10.5px] font-semibold" style={{ color: S.t4 }}>
              수시보고 {matchIds ? `${visible.length} / ${rows.length}` : rows.length}건
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {loading && <p className="px-2 py-3 text-[12px]" style={{ color: S.t4 }}>불러오는 중…</p>}
            {loadError && <p className="px-2 py-3 text-[12px]" style={{ color: S.danger }}>불러오지 못했습니다: {loadError}</p>}
            {!loading && !loadError && visible.length === 0 && (
              <p className="px-2 py-3 text-[12px]" style={{ color: S.t4 }}>{rows.length === 0 ? '아직 수시보고가 없습니다.' : '검색 결과가 없습니다.'}</p>
            )}
            {visible.map(r => {
              const active = r.id === selectedId
              const confirming = confirmDeleteId === r.id
              return (
                <div key={r.id} className="group relative mb-0.5">
                  <button
                    onClick={() => { setSelectedId(r.id); setMobileEditing(true) }}
                    className="w-full text-left pl-2.5 pr-16 py-2 rounded-lg transition-colors"
                    style={{ background: active ? S.accentDim : 'transparent' }}
                  >
                    <p className="text-[12.5px] font-medium truncate" style={{ color: active ? S.accentText : r.title.trim() ? S.t1 : S.t4 }}>
                      {r.title.trim() || '(제목 없음)'}
                    </p>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: S.t4 }}>
                      {fmtDateFull(r.report_date)}{r.audience.trim() ? ` · ${r.audience.trim()}` : ''}
                    </p>
                  </button>
                  {/* 마우스를 올렸을 때만 보임(확인 대기 중엔 계속 보임) */}
                  <button
                    onClick={() => (confirming ? void handleDelete(r.id) : setConfirmDeleteId(r.id))}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md text-[10.5px] transition-opacity ${confirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                    style={{ color: S.danger, background: confirming ? 'rgba(229,72,77,0.12)' : 'rgba(var(--ink-rgb),0.05)' }}
                  >
                    {confirming ? '삭제 확인' : '삭제'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* 오른쪽 편집 */}
        <div className={`${mobileEditing ? 'block' : 'hidden'} md:block flex-1 min-w-0 min-h-0`}>
          {selectedId ? (
            <AdhocEditor
              key={selectedId}
              supabase={supabase}
              id={selectedId}
              revealVoice={voiceForSelected}
              onSaved={handleSaved}
              onBack={() => setMobileEditing(false)}
              onNotice={setNotice}
            />
          ) : !loading && (
            <div className="h-full flex items-center justify-center px-6">
              <div className="text-center max-w-xs">
                <p className="text-[13px] font-medium mb-1.5" style={{ color: S.t2 }}>정기보고 외에 따로 보고한 내용을 남겨 두는 곳입니다.</p>
                <p className="text-[12.5px]" style={{ color: S.t4 }}>오른쪽 위 &quot;+ 새 수시보고&quot;로 시작하세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div
          className="fixed left-1/2 bottom-7 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-[12.5px]"
          style={{ background: 'var(--surface-elevated)', color: S.t1, border: `1px solid ${S.borderStrong}`, boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}
        >
          {notice}
        </div>
      )}
    </div>
  )
}

function AdhocEditor({
  supabase, id, revealVoice, onSaved, onBack, onNotice,
}: {
  supabase: SupabaseClient
  id: string
  revealVoice: string | null
  onSaved: (row: AdhocReport) => void
  onBack: () => void
  onNotice: (msg: string) => void
}) {
  const [row, setRow] = useState<AdhocReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void supabase.from('adhoc_reports').select('*').eq('id', id).single().then(({ data, error: e }) => {
      if (!alive) return
      if (e || !data) setError(e?.message ?? '찾을 수 없습니다')
      else setRow(data as AdhocReport)
    })
    return () => { alive = false }
  }, [supabase, id])

  if (error) return <p className="px-8 py-5 text-[12.5px]" style={{ color: S.danger }}>불러오지 못했습니다: {error}</p>
  if (!row) return <p className="px-8 py-5 text-[12.5px]" style={{ color: S.t4 }}>불러오는 중…</p>
  return <AdhocForm supabase={supabase} row={row} revealVoice={revealVoice} onSaved={onSaved} onBack={onBack} onNotice={onNotice} />
}

function AdhocForm({
  supabase, row, revealVoice, onSaved, onBack, onNotice,
}: {
  supabase: SupabaseClient
  row: AdhocReport
  revealVoice: string | null
  onSaved: (row: AdhocReport) => void
  onBack: () => void
  onNotice: (msg: string) => void
}) {
  const [title, setTitle] = useState(row.title)
  const [audience, setAudience] = useState(row.audience)
  // 날짜 입력 중 빈 값('')이 될 수 있어 저장은 마지막 유효 날짜로 한다(report_date NOT NULL)
  const [dateLocal, setDateLocal] = useState(row.report_date)
  const [validDate, setValidDate] = useState(row.report_date)
  const [body, setBody] = useState(row.body)
  const [result, setResult] = useState(row.result)
  const [recoverSeq, setRecoverSeq] = useState(0)

  const draft: Draft = useMemo(
    () => ({ report_date: validDate, title, audience, body, result }),
    [validDate, title, audience, body, result],
  )

  const canonical = useCanonicalSync<Draft>({
    supabase, table: 'adhoc_reports', id: row.id, draft, readOnly: false,
    onSaved: r => onSaved(r as AdhocReport),
  })

  const autosave = useAutosave({
    supabase, enabled: true, entityType: 'adhoc_report', entityId: row.id, fieldKey: 'draft', value: draft,
  })

  useEffect(() => {
    if (!revealVoice) return
    const t = setTimeout(() => void revealVoiceBlock(revealVoice), 250)
    return () => clearTimeout(t)
  }, [revealVoice])

  function applyRecovered() {
    const v = autosave.recovered?.value as Draft | undefined
    if (!v) return
    setTitle(v.title ?? '')
    setAudience(v.audience ?? '')
    if (v.report_date) { setDateLocal(v.report_date); setValidDate(v.report_date) }
    setBody(v.body ?? '')
    setResult(v.result ?? '')
    setRecoverSeq(n => n + 1)
    autosave.discardRecovered()
  }

  async function handleCopy() {
    await canonical.flush()
    navigator.clipboard.writeText(adhocToMarkdown(draft)).then(
      () => onNotice('수시보고를 마크다운으로 복사했습니다'),
      () => onNotice('복사에 실패했습니다'),
    )
  }

  // 제목 아래 정보 줄 — 3칸 균등 네모 박스. 아이콘+칸 이름은 왼쪽, 값은 오른쪽. 마우스를 올리면 살짝 진해짐
  const metaBox = 'flex items-center gap-2 min-w-0 h-9 px-3 text-[13px] transition-colors hover:bg-[rgba(var(--ink-rgb),0.07)] focus-within:bg-[rgba(var(--ink-rgb),0.07)]'
  const metaBoxStyle: React.CSSProperties = {
    background: 'rgba(var(--ink-rgb),0.04)',
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    color: S.t1,
  }
  const metaLabel = 'flex items-center gap-1.5 text-[12px] font-semibold flex-shrink-0'

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-5">
      <div style={{ maxWidth: WRITING_CONTENT_WIDTH }}>
        <button onClick={onBack} className="md:hidden mb-3 text-[12px] px-2 py-1 rounded-lg" style={{ color: S.t3, background: 'rgba(var(--ink-rgb),0.04)' }}>← 목록</button>

        {/* 아래 보고 내용 칸과 같은 라벨+박스 — 제목 입력 자리임이 바로 보이게 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[15px] font-bold" style={{ color: S.t1 }}>제목</span>
            <span className="text-[10.5px]" style={{ color: S.t4 }}>{canonicalStatusText(canonical.status)}</span>
          </div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="수시보고 제목을 입력하세요"
            autoFocus={!row.title}
            className="w-full text-[16px] font-semibold px-3.5 py-2 focus:outline-none"
            style={{ color: S.t1, background: 'rgba(var(--ink-rgb),0.03)', border: `1px solid ${S.borderStrong}`, borderRadius: S.r }}
          />
        </div>

        {/* 제목 바로 아래 붙는 정보 줄 — 보고일 · 보고 대상 · 마크다운 복사 3칸 */}
        <div className="grid grid-cols-3 gap-2 mt-2.5 mb-6">
          <label className={metaBox} style={metaBoxStyle}>
            <span className={metaLabel} style={{ color: S.t2 }}><CalendarDays size={14} strokeWidth={2} />보고일</span>
            <span className="flex-1 min-w-0 flex justify-end">
              <input
                type="date"
                value={dateLocal}
                onChange={e => { setDateLocal(e.target.value); if (e.target.value) setValidDate(e.target.value) }}
                className="bg-transparent focus:outline-none min-w-0 font-medium"
                style={{ color: S.t1 }}
              />
            </span>
          </label>
          <label className={metaBox} style={metaBoxStyle}>
            <span className={metaLabel} style={{ color: S.t2 }}><UserRound size={14} strokeWidth={2} />보고 대상</span>
            <input
              value={audience}
              onChange={e => setAudience(e.target.value)}
              placeholder="예: 대표님"
              className="flex-1 min-w-0 bg-transparent focus:outline-none text-right font-medium"
              style={{ color: S.t1 }}
            />
          </label>
          <button onClick={handleCopy} className={`${metaBox} justify-between`} style={metaBoxStyle}>
            <span className={metaLabel} style={{ color: S.t2 }}><FileText size={14} strokeWidth={2} />마크다운</span>
            <span className="font-medium" style={{ color: S.t1 }}>복사하기</span>
          </button>
        </div>

        {autosave.recovered && (
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg mb-3 text-[12px]"
            style={{ background: 'rgba(245,194,71,0.1)', border: '1px solid rgba(245,194,71,0.28)', color: '#F5C247' }}
          >
            <span>이전에 저장되지 않은 임시본이 있습니다.</span>
            <div className="flex items-center gap-2">
              <button onClick={applyRecovered} className="underline">적용</button>
              <button onClick={() => autosave.discardRecovered()} className="underline opacity-70">무시</button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <TextBox
            key={`body:${recoverSeq}`}
            heightKey="adhoc:body"
            label="보고 내용"
            largeLabel
            variant="primary"
            value={body}
            onChange={setBody}
            minHeight={320}
            readOnly={false}
            enableVoice
            borderless
            enableFontSize
          />
          <div>
            <TextBox
              key={`result:${recoverSeq}`}
              heightKey="adhoc:result"
              label="결과 · 피드백"
              largeLabel
              variant="callout"
              value={result}
              onChange={setResult}
              minHeight={200}
              readOnly={false}
              enableVoice
              borderless
              enableFontSize
            />
            <p className="text-[11px] mt-1.5" style={{ color: S.t4 }}>Alt+3 CEO · Alt+4 CSO 표시 줄은 의사결정 탭에 모입니다</p>
          </div>
        </div>
      </div>
    </div>
  )
}
