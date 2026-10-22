'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import TiptapEditor from '@/components/TiptapEditor'
import { useAutosave } from '@/hooks/useAutosave'
import { fetchAgendaVoiceRawData, extractVoiceOccurrences, mergeVoiceOccurrences, SOURCE_LABEL, type VoiceEntry } from '@/lib/executiveVoices'

// 업무 회고 서랍(v62 agenda_retros) — 완료성과 안건 카드·안건 상세에서 연다.
// 4칸: ① 성과 한 줄 ② 받은 피드백(이 안건의 Alt+3/4 줄 자동 모음 + 직접 추가) ③ 어떻게 바뀌었나 ④ 놓친 것 → 다음엔
// 저장: 칸마다 600ms 디바운스 upsert(agenda_item_id 기준 1행) + useAutosave 병행 기록(project_item / retro_*)

type Field = 'outcome' | 'feedback' | 'changes' | 'lessons'
type Retro = Record<Field, string>
const EMPTY: Retro = { outcome: '', feedback: '', changes: '', lessons: '' }

const SAVE_ERROR_MSG = '저장 실패 — 화면에는 반영됐지만 서버에 저장되지 않았을 수 있습니다. 새로고침 후 다시 확인해주세요.'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function retroWritten(r: Retro): boolean {
  return (Object.keys(r) as Field[]).some(k => stripHtml(r[k] ?? '') !== '')
}

interface Props {
  agendaId: string | null
  onClose: (written: boolean) => void
}

export default function AgendaRetroDrawer({ agendaId, onClose }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState('')
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [retro, setRetro] = useState<Retro>(EMPTY)
  const [voices, setVoices] = useState<VoiceEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const timers = useRef<Partial<Record<Field, ReturnType<typeof setTimeout>>>>({})
  const latest = useRef<Retro>(EMPTY)

  useEffect(() => {
    if (!agendaId) return
    let cancelled = false
    Promise.all([
      supabase.from('agenda_items').select('title, completed_at').eq('id', agendaId).single(),
      supabase.from('agenda_retros').select('outcome, feedback, changes, lessons').eq('agenda_item_id', agendaId).maybeSingle(),
      fetchAgendaVoiceRawData(supabase, agendaId),
    ]).then(([it, rt, raw]) => {
      if (cancelled) return
      setTitle((it.data as { title: string } | null)?.title ?? '')
      setCompletedAt((it.data as { completed_at: string | null } | null)?.completed_at ?? null)
      const r = { ...EMPTY, ...((rt.data ?? {}) as Partial<Retro>) }
      setRetro(r); latest.current = r
      setVoices(mergeVoiceOccurrences(extractVoiceOccurrences(raw)))
      if (it.error || rt.error || raw.errors.length) setSaveError('불러오기 일부 실패 — 새로고침 후 다시 열어주세요.')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [agendaId, supabase])

  const saveNow = useCallback(async (field: Field) => {
    if (!agendaId) return
    setSaving(true)
    const { error } = await supabase.from('agenda_retros')
      .upsert({ agenda_item_id: agendaId, [field]: latest.current[field] }, { onConflict: 'agenda_item_id' })
    setSaving(false)
    setSaveError(error ? SAVE_ERROR_MSG : '')
  }, [agendaId, supabase])

  function change(field: Field, value: string) {
    latest.current = { ...latest.current, [field]: value }
    setRetro(latest.current)
    const t = timers.current[field]
    if (t) clearTimeout(t)
    timers.current[field] = setTimeout(() => { delete timers.current[field]; saveNow(field) }, 600)
  }

  // 닫을 때 대기 중인 저장은 바로 보낸다
  const close = useCallback(() => {
    for (const f of Object.keys(timers.current) as Field[]) {
      clearTimeout(timers.current[f]); delete timers.current[f]; saveNow(f)
    }
    onClose(retroWritten(latest.current))
    // 다음에 열 때 이전 안건 내용이 비치지 않도록 여기서 비운다
    setLoading(true); setSaveError(''); setRetro(EMPTY); latest.current = EMPTY; setVoices([])
  }, [onClose, saveNow])

  useEffect(() => {
    if (!agendaId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [agendaId, close])

  const enabled = !!agendaId && !loading
  useAutosave({ supabase, enabled, entityType: 'project_item', entityId: agendaId ?? '', fieldKey: 'retro_outcome', value: retro.outcome })
  useAutosave({ supabase, enabled, entityType: 'project_item', entityId: agendaId ?? '', fieldKey: 'retro_feedback', value: retro.feedback })
  useAutosave({ supabase, enabled, entityType: 'project_item', entityId: agendaId ?? '', fieldKey: 'retro_changes', value: retro.changes })
  useAutosave({ supabase, enabled, entityType: 'project_item', entityId: agendaId ?? '', fieldKey: 'retro_lessons', value: retro.lessons })

  const open = !!agendaId

  return (
    <>
      {open && <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.25)' }} onClick={close} />}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden w-full max-w-[560px]"
        style={{
          background: 'var(--surface-primary)',
          borderLeft: '1px solid rgba(var(--ink-rgb),0.08)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.4)' : 'none',
        }}>
        {open && (
          <>
            <div className="flex items-start justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(var(--ink-rgb),0.07)' }}>
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-[11px] text-[rgba(var(--text-rgb),0.4)] mb-1">
                  업무 회고{completedAt && ` · ${completedAt.slice(5).replace('-', '/')} 완료`}
                  <span className="ml-2" style={{ color: saveError ? '#D98B8B' : 'rgba(var(--text-rgb),0.3)' }}>
                    {saving ? '저장 중…' : saveError ? '저장 확인 필요' : ''}
                  </span>
                </p>
                <Link href={`/project/items/${agendaId}`} className="text-[16px] font-semibold text-[rgba(var(--text-rgb),0.95)] leading-snug hover:underline">
                  {title || '…'}
                </Link>
              </div>
              <button onClick={close}
                className="text-[rgba(var(--text-rgb),0.35)] hover:text-[rgba(var(--text-rgb),0.7)] transition-colors text-lg leading-none flex-shrink-0 mt-0.5">
                ✕
              </button>
            </div>

            {saveError && (
              <div className="mx-6 mt-3 px-3 py-2 rounded-lg text-[11px]" style={{ background: 'rgba(217,139,139,0.12)', color: '#C77474' }}>{saveError}</div>
            )}

            {loading ? (
              <p className="text-sm text-[rgba(var(--text-rgb),0.3)] text-center py-12">불러오는 중...</p>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
                <Section no="①" title="성과 한 줄" hint="숫자가 들어간 결과 한 줄 — 평가 자기기술서 재료">
                  <input value={retro.outcome} onChange={e => change('outcome', e.target.value)}
                    placeholder="예) 평가 등급 5→3단계 단순화, 조정 기간 2주 단축"
                    className="w-full bg-transparent text-[13px] px-3 py-2.5 rounded-lg focus:outline-none"
                    style={{ border: '1px solid rgba(var(--ink-rgb),0.12)', color: 'rgba(var(--text-rgb),0.95)' }} />
                </Section>

                <Section no="②" title="받은 피드백" hint="이 안건에서 Alt+3/4로 표시한 줄이 자동으로 모입니다">
                  {voices.length === 0 ? (
                    <p className="text-[12px] text-[rgba(var(--text-rgb),0.35)] px-1 pb-1">이 안건에 표시된 의견이 없습니다</p>
                  ) : (
                    <div className="flex flex-col gap-1.5 mb-2">
                      {voices.map(v => (
                        <Link key={v.key} href={v.source.href}
                          className="block px-3 py-2 rounded-lg transition-colors hover:bg-[rgba(var(--ink-rgb),0.05)]"
                          style={{ background: 'rgba(var(--ink-rgb),0.03)', border: '1px solid rgba(var(--ink-rgb),0.06)' }}>
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-px"
                              style={{ background: 'rgba(55,138,221,0.14)', color: '#378ADD' }}>{v.voice}</span>
                            <span className="text-[13px] leading-snug text-[rgba(var(--text-rgb),0.9)] whitespace-pre-line">{v.text}</span>
                          </div>
                          <div className="text-[10px] text-[rgba(var(--text-rgb),0.4)] mt-1 pl-[34px]">
                            {SOURCE_LABEL[v.source.type]} · {v.source.title}{v.date && ` · ${v.date}`}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-[rgba(var(--text-rgb),0.4)] mb-1 px-1">직접 추가 (구두로 들은 피드백 등)</p>
                  <Box>
                    <TiptapEditor enableToggle enableVoice dark hideToolbar value={retro.feedback} onChange={v => change('feedback', v)} minHeight={70} className="px-3 py-2" />
                  </Box>
                </Section>

                <Section no="③" title="어떻게 바뀌었나" hint="1차 → 최종, 버린 안과 그 이유">
                  <Box>
                    <TiptapEditor enableToggle dark hideToolbar value={retro.changes} onChange={v => change('changes', v)} minHeight={110} className="px-3 py-2" />
                  </Box>
                </Section>

                <Section no="④" title="놓친 것 → 다음엔" hint="왜 처음엔 못 봤나, 다음 기획에 쓸 원칙 한 줄">
                  <Box>
                    <TiptapEditor enableToggle dark hideToolbar value={retro.lessons} onChange={v => change('lessons', v)} minHeight={110} className="px-3 py-2" />
                  </Box>
                </Section>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function Section({ no, title, hint, children }: { no: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[13px] font-bold text-[rgba(var(--text-rgb),0.9)]">{no} {title}</span>
        <span className="text-[11px] text-[rgba(var(--text-rgb),0.4)]">{hint}</span>
      </div>
      {children}
    </section>
  )
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(var(--ink-rgb),0.12)' }}>{children}</div>
  )
}
