'use client'

// "최근 기록" — 자동저장 기록(content_versions)에서 최근 1시간 안에 고친 칸을 모아 보여 주고,
// 원하는 시점의 내용을 서식 그대로 복사한다(본문에 붙여넣어 되살리기).
// 화면별 저장 코드는 건드리지 않는다 — 읽기 + 클립보드 복사만.
// 열기: window.dispatchEvent(new Event('open-recent-history'))

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { History, X, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  HISTORY_WINDOW_MS, fieldLabel, groupRecentFields, markVersions, relativeTime,
  versionHtml, versionPlainText, versionValue,
  type FieldKeyRow, type MarkedVersion, type RecentField, type VersionRow,
} from '@/lib/autosave/versionHistory'

const MAX_FIELDS = 30
const MAX_VERSIONS = 200

// 미리보기용 최소 정화 — 내 기록이지만 script·이벤트 속성은 빼고 그린다
function safeHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function openRecentHistory() {
  window.dispatchEvent(new Event('open-recent-history'))
}

export function RecentHistoryButton({ size = 26, iconSize = 14 }: { size?: number; iconSize?: number }) {
  return (
    <button type="button" onClick={openRecentHistory}
      title="최근 기록 — 지운 내용 되살리기 (최근 1시간)" aria-label="최근 기록"
      style={{ width: size, height: size, color: 'var(--text-muted)' }}
      className="theme-transition flex items-center justify-center rounded-lg hover:text-[var(--text-hover)] hover:bg-[var(--surface-hover)] flex-shrink-0">
      <History size={iconSize} strokeWidth={1.75} />
    </button>
  )
}

export default function RecentHistoryPanel() {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<RecentField[]>([])
  const [hints, setHints] = useState<Record<string, string>>({})
  const [selKey, setSelKey] = useState<string | null>(null)
  const [versions, setVersions] = useState<MarkedVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [selVersionId, setSelVersionId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // 마지막으로 요청한 칸 — 빠르게 다른 칸을 누르면 늦게 온 이전 응답은 버린다
  const reqRef = useRef(0)
  const close = useCallback(() => { reqRef.current++; setOpen(false) }, [])

  function selectVersion(id: string | null) { setSelVersionId(id); setCopied(false) }

  // 고른 칸의 기록 전부(1시간 안 기록 + 그 전에 남겨 둔 마지막 1개)
  const selectField = useCallback(async (f: RecentField) => {
    const req = ++reqRef.current
    setSelKey(f.key); setVersionsLoading(true); setVersions([]); setSelVersionId(null); setCopied(false)
    const { data, error } = await supabase
      .from('content_versions')
      .select('id, created_at, version_no, content')
      .eq('entity_type', f.entityType).eq('entity_id', f.entityId).eq('field_key', f.fieldKey)
      .order('version_no', { ascending: false })
      .limit(MAX_VERSIONS)
    if (req !== reqRef.current) return
    setVersionsLoading(false)
    if (error) { setError(error.message); return }
    const marked = markVersions((data ?? []) as VersionRow[])
    setVersions(marked)
    // 처음엔 "지우기 직전" 중 가장 최근 것을, 없으면 바로 이전 기록을 고른다
    const pick = marked.find(v => v.beforeBigDrop) ?? marked[1] ?? marked[0]
    setSelVersionId(pick?.id ?? null)
  }, [supabase])

  // 칸 목록 — 최근 1시간 안에 기록이 생긴 칸
  const loadFields = useCallback(async () => {
    const t = Date.now()
    setNow(t); setLoading(true); setError(null); setFields([]); setHints({})
    setSelKey(null); setVersions([]); setSelVersionId(null); setCopied(false)
    const since = new Date(t - HISTORY_WINDOW_MS).toISOString()
    const { data, error } = await supabase
      .from('content_versions')
      .select('entity_type, entity_id, field_key, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000)
    setLoading(false)
    if (error) { setError(error.message); return }
    const grouped = groupRecentFields((data ?? []) as FieldKeyRow[]).slice(0, MAX_FIELDS)
    setFields(grouped)
    if (grouped[0]) void selectField(grouped[0])
    // 칸마다 최신 내용 첫 줄 — 어느 글인지 알아보게
    const entries = await Promise.all(grouped.map(async f => {
      const { data: row } = await supabase
        .from('content_versions').select('content')
        .eq('entity_type', f.entityType).eq('entity_id', f.entityId).eq('field_key', f.fieldKey)
        .order('version_no', { ascending: false }).limit(1).maybeSingle()
      const text = row ? versionPlainText(versionValue(row.content)) : ''
      return [f.key, text.split('\n').find(l => l.trim())?.trim().slice(0, 60) ?? ''] as const
    }))
    setHints(Object.fromEntries(entries))
  }, [supabase, selectField])

  useEffect(() => {
    const onOpen = () => { setOpen(true); void loadFields() }
    window.addEventListener('open-recent-history', onOpen)
    return () => window.removeEventListener('open-recent-history', onOpen)
  }, [loadFields])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, close])

  const selVersion = versions.find(v => v.id === selVersionId) ?? null
  const selHtml = selVersion ? versionHtml(versionValue(selVersion.content)) : null

  async function copySelected() {
    if (!selVersion) return
    const text = selVersion.text
    try {
      if (selHtml && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([selHtml], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopied(true)
    } catch {
      setError('복사하지 못했습니다. 미리보기 글을 직접 드래그해 복사해 주세요.')
    }
  }

  if (!open) return null

  const border = '1px solid rgba(var(--ink-rgb),0.07)'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[70]" onClick={close} />
      <div role="dialog" aria-label="최근 기록"
        className="fixed top-[8vh] left-1/2 -translate-x-1/2 w-[960px] max-w-[94vw] h-[80vh] rounded-2xl z-[70] overflow-hidden flex flex-col"
        style={{ background: 'var(--surface-modal2)', border: '1px solid rgba(var(--ink-rgb),0.08)', boxShadow: 'var(--shadow-modal)' }}>

        <div className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0" style={{ borderBottom: border }}>
          <History size={15} strokeWidth={1.75} className="text-[var(--text-muted)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">최근 기록</span>
          <span className="text-[11px] text-[var(--text-muted)]">최근 1시간 안에 고친 칸 · 원하는 시점을 복사해 본문에 붙여넣으면 되살아납니다</span>
          <button onClick={close} className="ml-auto p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)]" aria-label="닫기">
            <X size={15} />
          </button>
        </div>

        {error && <p className="px-4 py-2 text-xs text-red-500 flex-shrink-0" style={{ borderBottom: border }}>{error}</p>}

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* 칸 목록 */}
          <div className="md:w-[260px] flex-shrink-0 overflow-y-auto max-h-[28vh] md:max-h-none" style={{ borderRight: border }}>
            {loading && <p className="text-xs text-[var(--text-muted)] text-center py-6">불러오는 중…</p>}
            {!loading && fields.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center py-8 px-4 leading-relaxed">최근 1시간 안에 고친 칸이 없습니다.</p>
            )}
            {fields.map(f => (
              <button key={f.key} onClick={() => void selectField(f)}
                className={`w-full text-left px-3.5 py-2.5 transition-colors ${f.key === selKey ? 'bg-[var(--surface-hover-strong)]' : 'hover:bg-[var(--surface-hover)]'}`}
                style={{ borderBottom: border }}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">{fieldLabel(f.entityType, f.fieldKey)}</span>
                  <span className="ml-auto text-[10.5px] text-[var(--text-muted)] flex-shrink-0">{relativeTime(f.lastAt, now)}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{hints[f.key] || ' '}</p>
              </button>
            ))}
          </div>

          {/* 시점 목록 */}
          <div className="md:w-[190px] flex-shrink-0 overflow-y-auto max-h-[20vh] md:max-h-none" style={{ borderRight: border }}>
            {versionsLoading && <p className="text-xs text-[var(--text-muted)] text-center py-6">불러오는 중…</p>}
            {versions.map((v, i) => (
              <button key={v.id} onClick={() => selectVersion(v.id)}
                className={`w-full text-left px-3 py-2 transition-colors ${v.id === selVersionId ? 'bg-[var(--surface-hover-strong)]' : 'hover:bg-[var(--surface-hover)]'}`}
                style={{ borderBottom: border }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] tabular-nums text-[var(--text-primary)]">{timeLabel(v.created_at)}</span>
                  {i === 0 && <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-[rgba(var(--ink-rgb),0.06)] text-[var(--text-muted)]">현재</span>}
                  {v.beforeBigDrop && <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">지우기 직전</span>}
                </div>
                <span className="text-[10.5px] text-[var(--text-muted)] tabular-nums">{v.length.toLocaleString()}자</span>
              </button>
            ))}
          </div>

          {/* 미리보기 */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {!selVersion && !versionsLoading && fields.length > 0 && (
                <p className="text-xs text-[var(--text-muted)]">시점을 고르세요.</p>
              )}
              {selVersion && (selHtml
                ? <div className="note-html-dark text-[13px]" dangerouslySetInnerHTML={{ __html: safeHtml(selHtml) }} />
                : <pre className="whitespace-pre-wrap text-[13px] text-[var(--text-primary)] font-sans">{selVersion.text || '(빈 내용)'}</pre>)}
            </div>
            {selVersion && (
              <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0" style={{ borderTop: border }}>
                <span className="text-[11px] text-[var(--text-muted)]">복사 후 해당 화면 본문을 전체 선택(Ctrl+A)하고 붙여넣기(Ctrl+V)</span>
                <button onClick={copySelected}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent-primary)] hover:opacity-90">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? '복사됨' : selHtml ? '서식 그대로 복사' : '복사'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
