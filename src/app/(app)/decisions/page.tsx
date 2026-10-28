'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Meeting } from '@/types'
import { fetchMeetingNotesByMeetingIds, type MeetingNotesGrouped } from '@/lib/meetingNotes'
import {
  fetchVoiceRawData, extractVoiceOccurrences, mergeVoiceOccurrences, htmlToPlainText,
  SOURCE_LABEL, DATE_KIND_LABEL, EXEC_MEETING_CATEGORY,
  type VoiceEntry, type VoiceSource, type VoiceSourceType,
} from '@/lib/executiveVoices'
import dynamic from 'next/dynamic'
import MarkdownContent from '@/components/MarkdownContent'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

type Persona = 'CEO' | 'CSO' | '피플본부장' | 'Jin'
const PERSONAS: Persona[] = ['CEO', 'CSO', '피플본부장', 'Jin']
// 피플본부장은 퇴사로 탭에서만 숨긴다 — 프로필(user_settings)·직접 기록(persona_logs)은 그대로 보존
const VISIBLE_PERSONAS: Persona[] = ['CEO', 'CSO', 'Jin']
// Alt+3/Alt+4로 표시한 발언을 모으는 대상(Jin은 시뮬레이션만, 발언 수집 대상 아님)
const VOICE_PERSONAS: Persona[] = ['CEO', 'CSO']

const PERSONA_META: Record<Persona, {
  role: string
  meetingCategory: string | null
  profilePlaceholder: string
  promptRequest: string
}> = {
  CEO: {
    role: '대표이사',
    meetingCategory: EXEC_MEETING_CATEGORY,
    profilePlaceholder: 'CEO의 의사결정 스타일, 관심사, 우선순위, 자주 하는 말, 민감한 포인트 등을 기록하세요.\n예) 숫자와 속도를 중시함. "그래서 언제까지 가능해?" 자주 물어봄. 리스크보다 기회를 먼저 봄.',
    promptRequest: '위 기록을 바탕으로, CEO가 이 상황을 어떻게 바라볼지 분석해주세요. CEO의 시각·우선순위·예상 질문·반응을 구체적으로 시뮬레이션해주세요.',
  },
  CSO: {
    role: '최고전략책임자',
    meetingCategory: EXEC_MEETING_CATEGORY,
    profilePlaceholder: 'CSO의 의사결정 스타일, 전략적 관심사, 자주 하는 말, 민감한 포인트 등을 기록하세요.',
    promptRequest: '위 기록을 바탕으로, CSO가 이 상황을 어떻게 바라볼지 분석해주세요. CSO의 시각·우선순위·예상 질문·반응을 구체적으로 시뮬레이션해주세요.',
  },
  '피플본부장': {
    role: '피플본부장',
    meetingCategory: '본부장',
    profilePlaceholder: '피플본부장의 의사결정 스타일, 관심사, 자주 하는 말, 민감한 포인트 등을 기록하세요.',
    promptRequest: '위 기록을 바탕으로, 피플본부장이 이 상황을 어떻게 바라볼지 분석해주세요. 본부장의 시각·우선순위·예상 질문·반응을 구체적으로 시뮬레이션해주세요.',
  },
  Jin: {
    role: '나 (김진일)',
    meetingCategory: null,
    profilePlaceholder: '나의 성향, 의사결정 패턴, 강점과 약점을 솔직하게 기록하세요.\n예) 분석 깊이는 있으나 맥락/컨디션에 따라 일관성이 흔들림. 빠른 실행보다 완성도를 추구하는 경향. 피드백을 주기보다 메모/머릿속으로 처리하는 편.',
    promptRequest: '위의 과거 판단 패턴과 피드백 기록을 바탕으로, 이번 상황에서 내가 놓치고 있을 수 있는 관점·비일관성·맹점을 날카롭게 지적해주세요. 내 성향의 강점과 함정을 모두 고려해주세요.',
  },
}

const PERSONA_COLORS: Record<Persona, string> = {
  CEO:       'bg-[#EBA698]/25 text-[#6B2D25] border-[#EBA698]/40',
  CSO:       'bg-[#90A7D8]/25 text-[#1E3A6B] border-[#90A7D8]/40',
  '피플본부장': 'bg-[#BFE4B5]/30 text-[#2D5A35] border-[#BFE4B5]/45',
  Jin:       'bg-[#BADEC8]/30 text-[#2D5A45] border-[#BADEC8]/45',
}

interface Log {
  id: string
  persona: Persona
  date: string
  title: string
  content: string
  created_at: string
}

type Period = 'all' | '1m' | '3m' | '6m'
const PERIODS: { key: Period; label: string; months: number }[] = [
  { key: 'all', label: '전체', months: 0 },
  { key: '1m', label: '1개월', months: 1 },
  { key: '3m', label: '3개월', months: 3 },
  { key: '6m', label: '6개월', months: 6 },
]
const SOURCE_TYPES: VoiceSourceType[] = ['meeting', 'agenda', 'subtask', 'retro', 'adhoc']
// 참고 회의록이 이만큼(글자 수)을 넘으면 길다고 알리기만 한다 — 자동으로 자르지 않음
const LONG_REF_CHARS = 30000

type ExecMeeting = Pick<Meeting, 'id' | 'title' | 'meeting_date'>

function cutoffDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sourceLine(s: VoiceSource): string {
  return `${SOURCE_LABEL[s.type]} «${s.title}»${s.context ? ` › ${s.context}` : ''}`
}

function refNotesText(grouped: MeetingNotesGrouped | undefined): string {
  if (!grouped) return ''
  const parts: string[] = []
  for (const note of [...grouped.regular, ...grouped.prep]) {
    const body = htmlToPlainText(note.content)
    parts.push([note.title ? `**${note.title}${note.is_prep ? ' (사전 준비)' : ''}**` : '', body].filter(Boolean).join('\n'))
  }
  return parts.join('\n\n')
}

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)] shadow-sm'
const pOff = 'bg-[rgba(var(--ink-rgb),0.06)] backdrop-blur-xl border-[rgba(var(--ink-rgb),0.09)] text-[rgba(var(--text-rgb),0.5)] hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[rgba(var(--text-rgb),0.8)]'
const chip = 'text-[11px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap'
const chipOn = 'bg-[rgba(var(--accent-tint-rgb),0.14)] border-[rgba(var(--accent-tint-rgb),0.35)] text-[var(--accent-tint-text)]'
const chipOff = 'bg-transparent border-[rgba(var(--ink-rgb),0.1)] text-[rgba(var(--text-rgb),0.45)] hover:text-[rgba(var(--text-rgb),0.75)]'

export default function DecisionsPage() {
  const [activeTab, setActiveTab] = useState<Persona>('CEO')
  const [logs, setLogs] = useState<Log[]>([])
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [question, setQuestion] = useState('')
  const [copied, setCopied] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  const [profiles, setProfiles] = useState<Record<Persona, string>>({ CEO: '', CSO: '', '피플본부장': '', Jin: '' })
  const [profileOpen, setProfileOpen] = useState(false)
  const profileSaveTimers = useRef<Partial<Record<Persona, ReturnType<typeof setTimeout>>>>({})
  const logDraftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function logDraftKey(persona: Persona) { return `decisions_log_draft_${persona}` }

  // ── 모인 의견(Alt+3/4 표시) ──
  const [leftView, setLeftView] = useState<'voices' | 'logs'>('voices')
  const [voices, setVoices] = useState<VoiceEntry[] | null>(null)
  const [voiceErrors, setVoiceErrors] = useState<string[]>([])
  const [period, setPeriod] = useState<Period>('all')
  const [sourceFilter, setSourceFilter] = useState<Set<VoiceSourceType>>(new Set(SOURCE_TYPES))
  const [selectedVoices, setSelectedVoices] = useState<Record<string, Set<string>>>({})
  const [openOthers, setOpenOthers] = useState<Set<string>>(new Set())

  // ── 포함할 자료 ──
  const [includeVoices, setIncludeVoices] = useState(true)
  const [includeLogs, setIncludeLogs] = useState(true)
  const [includeRef, setIncludeRef] = useState(false)
  const [execMeetings, setExecMeetings] = useState<ExecMeeting[] | null>(null)
  const [refSelected, setRefSelected] = useState<Record<string, Set<string>>>({})
  const [refNotes, setRefNotes] = useState<Record<string, MeetingNotesGrouped>>({})
  const [refLoading, setRefLoading] = useState<Set<string>>(new Set())

  const supabase = createClient()

  useEffect(() => {
    supabase.from('persona_logs').select('*').order('date', { ascending: false }).then(({ data }) => {
      setLogs((data ?? []) as Log[])
    })
    const keys = PERSONAS.map(p => `persona_profile_${p}`)
    supabase.from('user_settings').select('key, value').in('key', keys).then(({ data }) => {
      if (!data) return
      const updates: Partial<Record<Persona, string>> = {}
      for (const row of data) {
        const persona = row.key.replace('persona_profile_', '') as Persona
        updates[persona] = row.value as string
      }
      setProfiles(prev => ({ ...prev, ...updates }))
    })
    // 표시된 의견 — 표시가 있는 행만 좁혀 한 번 불러오고, 필터는 화면에서만 바꾼다
    fetchVoiceRawData(supabase).then(raw => {
      setVoices(mergeVoiceOccurrences(extractVoiceOccurrences(raw)))
      setVoiceErrors(raw.errors)
    })
    // 경영진 회의록 목록(제목·날짜만) — 본문은 MD에 넣으려고 고른 회의만 그때 불러온다
    supabase.from('meetings').select('id, title, meeting_date')
      .eq('category', EXEC_MEETING_CATEGORY)
      .order('meeting_date', { ascending: false })
      .then(({ data }) => setExecMeetings((data ?? []) as ExecMeeting[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setAddOpen(false)
    setSaveError('')
    setProfileOpen(false)
    setLeftView(VOICE_PERSONAS.includes(activeTab) ? 'voices' : 'logs')
  }, [activeTab])

  function saveProfile(persona: Persona, text: string) {
    setProfiles(prev => ({ ...prev, [persona]: text }))
    if (profileSaveTimers.current[persona]) clearTimeout(profileSaveTimers.current[persona])
    profileSaveTimers.current[persona] = setTimeout(() => {
      supabase.from('user_settings').upsert({
        key: `persona_profile_${persona}`,
        value: text,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.error('persona_profile_save_failed', error) })
    }, 800)
  }

  function openAddLog() {
    try {
      const raw = localStorage.getItem(logDraftKey(activeTab))
      if (raw) {
        const d = JSON.parse(raw) as { date: string; title: string; content: string }
        setNewDate(d.date ?? new Date().toISOString().slice(0, 10))
        setNewTitle(d.title ?? '')
        setNewContent(d.content ?? '')
      }
    } catch {}
    setAddOpen(true)
    setSaveError('')
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  // 새 기록 작성 초안 로컬 백업 — 저장 없이 탭 전환/이탈해도 다시 열면 복원됨
  useEffect(() => {
    if (!addOpen) return
    clearTimeout(logDraftTimer.current)
    logDraftTimer.current = setTimeout(() => {
      try { localStorage.setItem(logDraftKey(activeTab), JSON.stringify({ date: newDate, title: newTitle, content: newContent })) } catch {}
    }, 500)
    return () => clearTimeout(logDraftTimer.current)
  }, [newDate, newTitle, newContent, addOpen, activeTab])

  const tabLogs = useMemo(() => logs.filter(l => l.persona === activeTab), [logs, activeTab])
  const isVoicePersona = VOICE_PERSONAS.includes(activeTab)
  const hasRefMeetings = !!PERSONA_META[activeTab].meetingCategory && isVoicePersona

  // 이 페르소나의 의견 / 필터 결과
  const personaVoices = useMemo(() => (voices ?? []).filter(v => v.voice === activeTab), [voices, activeTab])
  const cutoff = useMemo(() => { const p = PERIODS.find(x => x.key === period)!; return p.months ? cutoffDate(p.months) : null }, [period])
  const visibleVoices = useMemo(() => personaVoices.filter(v =>
    sourceFilter.has(v.source.type) && (!cutoff || (v.date !== null && v.date >= cutoff))
  ), [personaVoices, sourceFilter, cutoff])
  const undatedHidden = cutoff ? personaVoices.filter(v => sourceFilter.has(v.source.type) && !v.date).length : 0
  const selSet = selectedVoices[activeTab] ?? new Set<string>()
  // 선택은 필터를 바꿔도 유지된다 — MD에는 선택한 것 전부(지금 목록 밖 포함)가 들어가고, 그 수를 따로 보여준다
  const selectedEntries = personaVoices.filter(v => selSet.has(v.key))
  const selectedOutside = selectedEntries.filter(v => !visibleVoices.some(x => x.key === v.key)).length
  const visibleSelectedCount = visibleVoices.filter(v => selSet.has(v.key)).length
  const allVisibleSelected = visibleVoices.length > 0 && visibleSelectedCount === visibleVoices.length

  function toggleVoice(key: string) {
    setSelectedVoices(prev => {
      const s = new Set(prev[activeTab] ?? [])
      if (s.has(key)) s.delete(key); else s.add(key)
      return { ...prev, [activeTab]: s }
    })
  }
  // "보이는 항목 전체 선택" — 지금 필터 결과에만 적용(목록 밖 선택은 건드리지 않음)
  function toggleAllVisible() {
    setSelectedVoices(prev => {
      const s = new Set(prev[activeTab] ?? [])
      if (allVisibleSelected) visibleVoices.forEach(v => s.delete(v.key))
      else visibleVoices.forEach(v => s.add(v.key))
      return { ...prev, [activeTab]: s }
    })
  }
  function toggleSource(t: VoiceSourceType) {
    setSourceFilter(prev => {
      const s = new Set(prev)
      if (s.has(t)) { if (s.size > 1) s.delete(t) } else s.add(t)
      return s
    })
  }

  // 참고 회의록 — 고른 회의만 본문을 불러오고, 같은 회의는 한 번만 들어간다(Set)
  const refSet = useMemo(() => refSelected[activeTab] ?? new Set<string>(), [refSelected, activeTab])
  const refChosen = useMemo(() => (execMeetings ?? []).filter(m => refSet.has(m.id)), [execMeetings, refSet])
  function toggleRef(meetingId: string) {
    const willSelect = !refSet.has(meetingId)
    setRefSelected(prev => {
      const s = new Set(prev[activeTab] ?? [])
      if (s.has(meetingId)) s.delete(meetingId); else s.add(meetingId)
      return { ...prev, [activeTab]: s }
    })
    if (willSelect && !refNotes[meetingId] && !refLoading.has(meetingId)) {
      setRefLoading(prev => new Set(prev).add(meetingId))
      fetchMeetingNotesByMeetingIds(supabase, [meetingId]).then(res => {
        setRefNotes(prev => ({ ...prev, [meetingId]: res[meetingId] ?? { regular: [], prep: [] } }))
        setRefLoading(prev => { const s = new Set(prev); s.delete(meetingId); return s })
      })
    }
  }
  const refTexts = useMemo(() => refChosen.map(m => ({ m, text: refNotesText(refNotes[m.id]) })), [refChosen, refNotes])
  const refChars = refTexts.reduce((s, r) => s + r.text.length, 0)
  const refPending = refChosen.some(m => !refNotes[m.id])

  const voiceCount = isVoicePersona && includeVoices ? selectedEntries.length : 0
  const logCount = includeLogs ? tabLogs.length : 0
  const refCount = hasRefMeetings && includeRef ? refChosen.length : 0
  const hasContext = voiceCount + logCount + refCount > 0

  function toggleOpen(id: string) {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function addLog() {
    if (!newTitle.trim() || !stripHtml(newContent)) return
    setSaving(true)
    setSaveError('')
    try {
      const { data, error } = await supabase.from('persona_logs').insert({
        persona: activeTab,
        date: newDate,
        title: newTitle.trim(),
        content: newContent,
      }).select().single()
      if (error) { setSaveError(error.message); return }
      if (data) {
        setLogs(prev => [data as Log, ...prev])
        try { localStorage.removeItem(logDraftKey(activeTab)) } catch {}
        setNewTitle('')
        setNewContent('')
        setAddOpen(false)
      }
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteLog(id: string) {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return
    await supabase.from('persona_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  function generatePrompt(): string {
    const meta = PERSONA_META[activeTab]
    const profile = stripHtml(profiles[activeTab])
    const lines: string[] = []
    lines.push(`# ${activeTab} 페르소나 시뮬레이션`)
    lines.push('')
    lines.push(`> **역할:** ${meta.role}`)
    lines.push('')
    lines.push('---')
    if (profile) {
      lines.push('')
      lines.push('## 페르소나 프로필')
      lines.push('')
      lines.push(profile)
      lines.push('')
      lines.push('---')
    }
    if (voiceCount > 0) {
      lines.push('')
      lines.push(`## 경영진 의견 원문 (${activeTab} · ${selectedEntries.length}건)`)
      lines.push('')
      lines.push(`> 회의록·안건·세부 Task 메모에서 ${activeTab} 발언으로 직접 표시한 원문입니다. 요약·해석 없이 그대로 옮겼습니다.`)
      lines.push(`> 날짜 유형 — 발언일: 회의 날짜 · 기록일: 메모 작성일 · 표시일: 발언으로 표시한 날(실제 발언일과 다를 수 있음) · 날짜 미상`)
      selectedEntries.forEach((v, i) => {
        lines.push('')
        lines.push(`### ${i + 1}. ${v.date ?? '날짜 미상'}${v.date ? ` (${DATE_KIND_LABEL[v.dateKind]})` : ''} · ${SOURCE_LABEL[v.source.type]} · ${v.source.title}`)
        lines.push('')
        lines.push(`- 출처: ${sourceLine(v.source)}`)
        const related = [...new Set([v.source, ...v.others].flatMap(s => s.relatedAgendas))]
        if (related.length) lines.push(`- 관련 안건: ${related.join(', ')}`)
        if (v.others.length) lines.push(`- 같은 발언의 다른 위치: ${v.others.map(sourceLine).join(' / ')}`)
        if (v.conflict) lines.push('- ⚠ 같은 발언 ID에 원문·발언자가 다른 기록이 있어 따로 표시했습니다(자동 병합하지 않음).')
        lines.push('')
        for (const l of v.text.split('\n')) lines.push(`> ${l}`)
      })
      lines.push('')
      lines.push('---')
    }
    if (logCount > 0) {
      lines.push('')
      lines.push(`## 직접 기록 — 축적된 대화 / 피드백 (${tabLogs.length}건)`)
      lines.push('')
      for (const log of tabLogs) {
        lines.push(`### ${log.date} — ${log.title}`)
        lines.push('')
        lines.push(stripHtml(log.content))
        lines.push('')
      }
      lines.push('---')
    }
    if (refCount > 0) {
      lines.push('')
      lines.push(`## 경영진 회의록 참고자료 (${refChosen.length}건)`)
      lines.push('')
      lines.push(`> 주의: 이 섹션은 회의록 전체 맥락입니다. ${activeTab}가 직접 말한 내용만을 의미하지 않으며, 발언자가 확인되지 않은 내용이 섞여 있습니다.`)
      for (const { m, text } of refTexts) {
        lines.push('')
        lines.push(`### ${m.meeting_date ?? '날짜미상'} — ${m.title}`)
        lines.push('')
        lines.push(text || '(노트 없음)')
      }
      lines.push('')
      lines.push('---')
    }
    lines.push('')
    lines.push('## 현재 상황 / 질문')
    lines.push('')
    lines.push(stripHtml(question) || '(질문을 입력해주세요)')
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('## 요청')
    lines.push('')
    lines.push(meta.promptRequest)
    return lines.join('\n')
  }

  function copyPrompt() {
    navigator.clipboard.writeText(generatePrompt()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const countByPersona = (p: Persona) => logs.filter(l => l.persona === p).length
  const voiceCountByPersona = (p: Persona) => (voices ?? []).filter(v => v.voice === p).length
  const canCopy = hasContext && !!stripHtml(question) && !(refCount > 0 && refPending)

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-4 flex-wrap">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-[rgba(var(--text-rgb),1)]">의사결정</h1>
          <p className="text-xs text-[rgba(var(--text-rgb),0.4)] mt-0.5">경영진 의견·기록 축적 → 프롬프트 생성 → Claude.ai 붙여넣기</p>
        </div>
        <div className="flex items-center bg-[rgba(var(--ink-rgb),0.06)] backdrop-blur-xl border border-[rgba(var(--ink-rgb),0.09)] rounded-full p-1 overflow-x-auto scrollbar-hide flex-shrink-0">
          {VISIBLE_PERSONAS.map(p => {
            const n = VOICE_PERSONAS.includes(p) ? voiceCountByPersona(p) + countByPersona(p) : countByPersona(p)
            return (
              <button key={p} onClick={() => setActiveTab(p)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === p ? 'bg-[var(--accent-primary)] text-white shadow-sm' : 'text-[rgba(var(--text-rgb),0.5)] hover:text-[rgba(var(--text-rgb),0.8)]'
                }`}>
                {p}
                {n > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeTab === p ? 'bg-[rgba(var(--ink-rgb),0.06)] text-white/70' : 'bg-[rgba(var(--ink-rgb),0.06)] text-[rgba(var(--text-rgb),0.4)]'
                  }`}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 pb-6 items-start">

          {/* 왼쪽: 프로필 + 의견 아카이브 */}
          <div className="space-y-4">

            {/* 페르소나 프로필 카드 */}
            <div className="bg-[rgba(var(--ink-rgb),0.06)] backdrop-blur-xl border border-[rgba(var(--ink-rgb),0.09)] rounded-3xl overflow-hidden">
              <button onClick={() => setProfileOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[rgba(var(--ink-rgb),0.06)] transition-colors group">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-[rgba(var(--text-rgb),0.3)] group-hover:text-[rgba(var(--text-rgb),0.5)] transition-colors">{profileOpen ? '▼' : '▶'}</span>
                  <span className="text-sm font-semibold text-[rgba(var(--text-rgb),0.8)]">페르소나 프로필</span>
                  {stripHtml(profiles[activeTab]) && (
                    <span className="text-[10px] text-[#2D5A45] bg-[#BADEC8]/30 border border-[#BADEC8]/40 px-2 py-0.5 rounded-full">작성됨</span>
                  )}
                </div>
                <span className="text-xs text-[rgba(var(--text-rgb),0.4)]">프롬프트 최상단에 포함</span>
              </button>
              {profileOpen && (
                <div className="px-6 pb-6 border-t border-[rgba(var(--ink-rgb),0.09)]">
                  <div className="mt-4 bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.09)] rounded-2xl overflow-hidden">
                    <TiptapEditor
                      dark
                      value={profiles[activeTab]}
                      onChange={val => saveProfile(activeTab, val)}
                      minHeight={120}
                    />
                  </div>
                  <p className="text-xs text-[rgba(var(--text-rgb),0.3)] mt-2">입력 즉시 자동저장</p>
                </div>
              )}
            </div>

            {/* 의견 아카이브 카드 — 모인 의견 / 직접 기록 */}
            <div className="bg-[rgba(var(--ink-rgb),0.06)] backdrop-blur-xl border border-[rgba(var(--ink-rgb),0.09)] rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[rgba(var(--ink-rgb),0.09)] flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${PERSONA_COLORS[activeTab]}`}>{activeTab}</span>
                  {isVoicePersona ? (
                    <div className="flex items-center bg-[rgba(var(--ink-rgb),0.05)] border border-[rgba(var(--ink-rgb),0.08)] rounded-full p-0.5">
                      {([['voices', `모인 의견 ${personaVoices.length}`], ['logs', `직접 기록 ${tabLogs.length}`]] as const).map(([k, label]) => (
                        <button key={k} onClick={() => setLeftView(k)}
                          className={`text-xs px-3 py-1 rounded-full transition-colors ${leftView === k ? 'bg-[var(--surface-elevated)] text-[rgba(var(--text-rgb),0.9)] shadow-sm font-medium' : 'text-[rgba(var(--text-rgb),0.45)] hover:text-[rgba(var(--text-rgb),0.75)]'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-[rgba(var(--text-rgb),0.4)]">{PERSONA_META[activeTab].role} · {tabLogs.length}건</span>
                  )}
                </div>
                {leftView === 'logs' && (
                  <button onClick={() => (addOpen ? setAddOpen(false) : openAddLog())}
                    className={addOpen ? `${pill} ${pOff}` : 'text-xs bg-[rgba(76,127,224,0.1)] text-[var(--accent-primary)] border border-[rgba(76,127,224,0.25)] px-4 py-1.5 rounded-full font-medium hover:bg-[rgba(76,127,224,0.18)] transition-colors'}>
                    {addOpen ? '취소' : '+ 기록 추가'}
                  </button>
                )}
              </div>

              {leftView === 'voices' && isVoicePersona ? (
                <>
                  {/* 필터 */}
                  <div className="px-6 py-3 border-b border-[rgba(var(--ink-rgb),0.06)] flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-[rgba(var(--text-rgb),0.4)] mr-0.5">기간</span>
                    {PERIODS.map(p => (
                      <button key={p.key} onClick={() => setPeriod(p.key)} className={`${chip} ${period === p.key ? chipOn : chipOff}`}>{p.label}</button>
                    ))}
                    <span className="w-px h-3.5 bg-[rgba(var(--ink-rgb),0.12)] mx-1.5" />
                    <span className="text-[11px] text-[rgba(var(--text-rgb),0.4)] mr-0.5">출처</span>
                    {SOURCE_TYPES.map(t => (
                      <button key={t} onClick={() => toggleSource(t)} className={`${chip} ${sourceFilter.has(t) ? chipOn : chipOff}`}>
                        {SOURCE_LABEL[t]} {personaVoices.filter(v => v.source.type === t).length}
                      </button>
                    ))}
                  </div>
                  {/* 전체 선택 줄 */}
                  {visibleVoices.length > 0 && (
                    <div className="px-6 py-2 border-b border-[rgba(var(--ink-rgb),0.06)] flex items-center gap-2.5 text-xs text-[rgba(var(--text-rgb),0.5)]">
                      <input type="checkbox" checked={allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected }}
                        onChange={toggleAllVisible} className="w-3.5 h-3.5 accent-[var(--accent-primary)] cursor-pointer" />
                      <span>보이는 항목 전체 선택 ({visibleSelectedCount}/{visibleVoices.length})</span>
                      {selectedOutside > 0 && <span className="text-[rgba(var(--text-rgb),0.4)]">· 목록 밖 선택 {selectedOutside}건 유지 중</span>}
                    </div>
                  )}
                  {voiceErrors.length > 0 && (
                    <p className="mx-6 mt-3 text-xs rounded-xl px-3 py-2" style={{ color: 'var(--error-badge-text)', background: 'rgba(239,68,68,0.08)' }}>
                      일부 출처를 불러오지 못했습니다 — {voiceErrors.join(' · ')}
                    </p>
                  )}
                  {voices === null ? (
                    <p className="text-sm text-center py-14 text-[rgba(var(--text-rgb),0.3)] animate-pulse">불러오는 중...</p>
                  ) : visibleVoices.length === 0 ? (
                    <div className="text-center py-14 text-[rgba(var(--text-rgb),0.3)] px-6">
                      <p className="text-sm mb-1">{personaVoices.length === 0 ? '아직 모인 의견이 없습니다' : '조건에 맞는 의견이 없습니다'}</p>
                      <p className="text-xs">회의록·안건·세부 Task 메모에서 {activeTab} 발언 줄에 커서를 두고 {activeTab === 'CEO' ? 'Alt+3' : 'Alt+4'}을 누르면 여기에 모입니다</p>
                      {undatedHidden > 0 && <p className="text-xs mt-2">날짜 미상 {undatedHidden}건은 기간 필터 &lsquo;전체&rsquo;에서만 보입니다</p>}
                    </div>
                  ) : (
                    <div className="divide-y divide-[rgba(var(--ink-rgb),0.06)]">
                      {visibleVoices.map(v => {
                        const related = [...new Set([v.source, ...v.others].flatMap(s => s.relatedAgendas))]
                        return (
                          <div key={v.key} className="flex gap-3 px-6 py-3.5 hover:bg-[rgba(var(--ink-rgb),0.03)] transition-colors">
                            <input type="checkbox" checked={selSet.has(v.key)} onChange={() => toggleVoice(v.key)}
                              aria-label="MD에 포함할 의견 선택" className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 accent-[var(--accent-primary)] cursor-pointer" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                <span className="tabular-nums text-[rgba(var(--text-rgb),0.6)] font-medium">{v.date ?? '날짜 미상'}</span>
                                {v.date && <span className="text-[rgba(var(--text-rgb),0.4)]">{DATE_KIND_LABEL[v.dateKind]}</span>}
                                <span className="px-1.5 py-px rounded border border-[rgba(var(--ink-rgb),0.12)] text-[rgba(var(--text-rgb),0.55)]">{SOURCE_LABEL[v.source.type]}</span>
                                <span className="text-[rgba(var(--text-rgb),0.7)] truncate max-w-[60%]">
                                  {v.source.title}{v.source.context ? <span className="text-[rgba(var(--text-rgb),0.4)]"> › {v.source.context}</span> : null}
                                </span>
                                {v.conflict && <span className="px-1.5 py-px rounded" style={{ color: 'var(--quick-todo-text)', background: 'rgba(244,163,90,0.14)' }} title="같은 발언 ID에 원문·발언자가 다른 기록이 있어 자동으로 합치지 않았습니다">⚠ 원문 다름</span>}
                                <Link href={v.source.href} className="ml-auto text-[rgba(var(--text-rgb),0.4)] hover:text-[var(--accent-tint-text)] whitespace-nowrap">원본 →</Link>
                              </div>
                              <p className="mt-1.5 text-[13px] leading-relaxed text-[rgba(var(--text-rgb),0.88)] whitespace-pre-wrap break-words">{v.text || '(빈 줄)'}</p>
                              {(related.length > 0 || v.others.length > 0) && (
                                <div className="mt-1.5 text-[11px] text-[rgba(var(--text-rgb),0.45)] flex items-center gap-2 flex-wrap">
                                  {related.length > 0 && <span>관련 안건: {related.join(', ')}</span>}
                                  {v.others.length > 0 && (
                                    <button onClick={() => setOpenOthers(prev => { const s = new Set(prev); if (s.has(v.key)) s.delete(v.key); else s.add(v.key); return s })}
                                      className="hover:text-[rgba(var(--text-rgb),0.75)]">
                                      다른 위치 {v.others.length}곳 {openOthers.has(v.key) ? '▴' : '▾'}
                                    </button>
                                  )}
                                </div>
                              )}
                              {openOthers.has(v.key) && (
                                <ul className="mt-1 space-y-0.5 text-[11px] text-[rgba(var(--text-rgb),0.5)]">
                                  {v.others.map(o => (
                                    <li key={`${o.type}:${o.rowId}`} className="flex items-center gap-2">
                                      <span>{sourceLine(o)}{o.date ? ` · ${o.date} ${DATE_KIND_LABEL[o.dateKind]}` : ''}</span>
                                      <Link href={o.href} className="hover:text-[var(--accent-tint-text)]">원본 →</Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {undatedHidden > 0 && (
                        <p className="px-6 py-2.5 text-[11px] text-[rgba(var(--text-rgb),0.35)]">날짜 미상 {undatedHidden}건은 기간 필터 &lsquo;전체&rsquo;에서만 보입니다</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {addOpen && (
                    <div className="px-6 py-5 border-b border-[rgba(var(--ink-rgb),0.09)] bg-[rgba(var(--ink-rgb),0.06)] space-y-3">
                      <div className="flex gap-2">
                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                          className="text-xs bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.09)] rounded-2xl px-3 py-2 focus:outline-none text-[rgba(var(--text-rgb),0.7)] flex-shrink-0" />
                        <input
                          ref={titleRef}
                          value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addLog() }
                          }}
                          placeholder="제목 (예: 평가제도 개편안 피드백, Q1 전략 회의)"
                          className="flex-1 text-sm bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.09)] rounded-2xl px-4 py-2 focus:outline-none text-[rgba(var(--text-rgb),0.8)] placeholder-[rgba(var(--text-rgb),0.3)]" />
                      </div>
                      <div className="bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.09)] rounded-2xl overflow-hidden">
                        <TiptapEditor
                          dark
                          value={newContent}
                          onChange={setNewContent}
                          onSubmit={addLog}
                          minHeight={140}
                        />
                      </div>
                      {saveError && (
                        <p className="text-xs text-red-500 bg-red-50/60 backdrop-blur-sm rounded-2xl px-4 py-2">{saveError}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[rgba(var(--text-rgb),0.3)]">Ctrl+Enter 저장 · Tab/Shift+Tab 이동</span>
                        <div className="flex gap-2">
                          <button onClick={() => { setAddOpen(false); setSaveError('') }} className={`${pill} ${pOff}`}>취소</button>
                          <button onClick={addLog} disabled={!newTitle.trim() || !stripHtml(newContent) || saving}
                            className="text-xs bg-[rgba(76,127,224,0.1)] text-[var(--accent-primary)] border border-[rgba(76,127,224,0.25)] px-5 py-1.5 rounded-full disabled:opacity-30 hover:bg-[rgba(76,127,224,0.18)] transition-colors font-medium">
                            {saving ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {tabLogs.length === 0 ? (
                    <div className="text-center py-14 text-[rgba(var(--text-rgb),0.3)] px-6">
                      <p className="text-sm mb-1">아직 기록이 없습니다</p>
                      <p className="text-xs">{activeTab}의 발언·피드백·대화를 쌓기 시작하세요</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[rgba(var(--ink-rgb),0.06)]">
                      {tabLogs.map(log => (
                        <div key={log.id} className="group hover:bg-[rgba(var(--ink-rgb),0.06)] transition-colors">
                          <button onClick={() => toggleOpen(log.id)}
                            className="w-full flex items-center justify-between px-6 py-4 text-left">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[10px] text-[rgba(var(--text-rgb),0.3)] flex-shrink-0">{openIds.has(log.id) ? '▼' : '▶'}</span>
                              <span className="text-xs text-[rgba(var(--text-rgb),0.4)] flex-shrink-0 tabular-nums">{log.date}</span>
                              <span className="text-sm font-semibold text-[rgba(var(--text-rgb),0.8)] truncate">{log.title}</span>
                            </div>
                            <button onClick={e => { e.stopPropagation(); deleteLog(log.id) }}
                              className="text-xs text-[rgba(var(--text-rgb),0.2)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-3 px-2 py-1 rounded-full hover:bg-red-50/50">
                              삭제
                            </button>
                          </button>
                          {openIds.has(log.id) && (
                            <div className="px-6 pb-5 pt-1">
                              <div className="bg-[rgba(var(--ink-rgb),0.06)] rounded-2xl px-4 py-3">
                              <MarkdownContent content={log.content} dark className="text-sm leading-relaxed" />
                            </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 오른쪽: 프롬프트 생성기 */}
          <div className="lg:sticky lg:top-0 space-y-4">
            <div className="bg-[rgba(var(--ink-rgb),0.06)] backdrop-blur-xl border border-[rgba(var(--ink-rgb),0.09)] rounded-3xl p-6">
              <h3 className="text-xs font-semibold text-[rgba(var(--text-rgb),0.5)] uppercase tracking-wide mb-0.5">프롬프트 생성</h3>
              <p className="text-xs text-[rgba(var(--text-rgb),0.4)] mb-5">
                {activeTab === 'Jin' ? '나의 과거 패턴 + 질문 → 객관화 요청' : `${activeTab} 의견·기록 + 질문 → 예상반응 시뮬레이션`}
              </p>

              {/* 포함할 자료 — 자료 유형별로 따로 고른다 */}
              <div className="mb-5 pb-5 border-b border-[rgba(var(--ink-rgb),0.09)] space-y-2.5">
                <p className="text-xs font-medium text-[rgba(var(--text-rgb),0.7)]">포함할 자료</p>
                {isVoicePersona && (
                  <label className={`flex items-start gap-2.5 text-xs ${selectedEntries.length ? 'cursor-pointer text-[rgba(var(--text-rgb),0.7)]' : 'text-[rgba(var(--text-rgb),0.35)]'}`}>
                    <input type="checkbox" checked={includeVoices && selectedEntries.length > 0} disabled={selectedEntries.length === 0}
                      onChange={e => setIncludeVoices(e.target.checked)} className="mt-0.5 w-3.5 h-3.5 accent-[var(--accent-primary)]" />
                    <span>선택한 {activeTab} 의견 원문 {selectedEntries.length}건
                      {selectedOutside > 0 && <span className="text-[rgba(var(--text-rgb),0.4)]"> (목록 밖 {selectedOutside}건 포함)</span>}
                      {selectedEntries.length === 0 && <span className="block text-[11px] mt-0.5">왼쪽 모인 의견에서 체크하세요</span>}
                    </span>
                  </label>
                )}
                <label className={`flex items-start gap-2.5 text-xs ${tabLogs.length ? 'cursor-pointer text-[rgba(var(--text-rgb),0.7)]' : 'text-[rgba(var(--text-rgb),0.35)]'}`}>
                  <input type="checkbox" checked={includeLogs && tabLogs.length > 0} disabled={tabLogs.length === 0}
                    onChange={e => setIncludeLogs(e.target.checked)} className="mt-0.5 w-3.5 h-3.5 accent-[var(--accent-primary)]" />
                  <span>직접 기록 {tabLogs.length}건</span>
                </label>
                {hasRefMeetings && (
                  <div>
                    <label className="flex items-start gap-2.5 text-xs cursor-pointer text-[rgba(var(--text-rgb),0.7)]">
                      <input type="checkbox" checked={includeRef} onChange={e => setIncludeRef(e.target.checked)}
                        className="mt-0.5 w-3.5 h-3.5 accent-[var(--accent-primary)]" />
                      <span>경영진 회의록 참고자료 {includeRef && refChosen.length > 0 ? `${refChosen.length}건` : ''}
                        <span className="block text-[11px] text-[rgba(var(--text-rgb),0.4)] mt-0.5">회의록 전체 맥락 — {activeTab} 발언만이 아님</span>
                      </span>
                    </label>
                    {includeRef && (
                      <div className="mt-2 ml-6 rounded-2xl border border-[rgba(var(--ink-rgb),0.09)] bg-[rgba(var(--ink-rgb),0.03)] max-h-56 overflow-y-auto scrollbar-hide">
                        {execMeetings === null ? (
                          <p className="text-[11px] text-[rgba(var(--text-rgb),0.35)] px-3 py-2.5 animate-pulse">불러오는 중...</p>
                        ) : execMeetings.length === 0 ? (
                          <p className="text-[11px] text-[rgba(var(--text-rgb),0.35)] px-3 py-2.5">&lsquo;{EXEC_MEETING_CATEGORY}&rsquo; 범주 회의록이 없습니다</p>
                        ) : execMeetings.map(m => (
                          <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px] cursor-pointer hover:bg-[rgba(var(--ink-rgb),0.04)]">
                            <input type="checkbox" checked={refSet.has(m.id)} onChange={() => toggleRef(m.id)} className="w-3 h-3 accent-[var(--accent-primary)]" />
                            <span className="tabular-nums text-[rgba(var(--text-rgb),0.45)] flex-shrink-0">{m.meeting_date ?? '날짜미상'}</span>
                            <span className="truncate text-[rgba(var(--text-rgb),0.75)]">{m.title}</span>
                            {refLoading.has(m.id) && <span className="text-[10px] text-[rgba(var(--text-rgb),0.35)] ml-auto">…</span>}
                          </label>
                        ))}
                      </div>
                    )}
                    {includeRef && refChosen.length > 0 && (
                      <p className={`ml-6 mt-1.5 text-[11px] ${refChars > LONG_REF_CHARS ? '' : 'text-[rgba(var(--text-rgb),0.4)]'}`}
                        style={refChars > LONG_REF_CHARS ? { color: 'var(--quick-todo-text)' } : undefined}>
                        {refPending ? '본문 불러오는 중…' : `참고자료 약 ${refChars.toLocaleString()}자`}
                        {!refPending && refChars > LONG_REF_CHARS && ' — 길어요. 붙여넣을 LLM의 입력 한도를 확인하세요(자동으로 자르지 않음)'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <label className="text-xs text-[rgba(var(--text-rgb),0.5)] font-medium block mb-2">상황 / 질문</label>
              <div className="bg-[rgba(var(--ink-rgb),0.06)] border border-[rgba(var(--ink-rgb),0.09)] rounded-2xl overflow-hidden mb-4">
                <TiptapEditor
                  dark
                  value={question}
                  onChange={setQuestion}
                  minHeight={140}
                />
              </div>

              <button
                onClick={copyPrompt}
                disabled={!canCopy}
                className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${
                  copied ? 'bg-[#BADEC8] text-[#2D5A45]' : 'bg-[rgba(76,127,224,0.1)] text-[var(--accent-primary)] border border-[rgba(76,127,224,0.25)] hover:bg-[rgba(76,127,224,0.18)]'
                } disabled:opacity-30 disabled:cursor-not-allowed`}>
                {copied ? '✓ 복사됨 — Claude.ai에 붙여넣기' : `${activeTab} 페르소나 프롬프트 복사`}
              </button>

              {!hasContext && (
                <p className="text-xs text-[rgba(var(--text-rgb),0.3)] text-center mt-3">{isVoicePersona ? '의견을 선택하거나 직접 기록·참고 회의록을 포함하세요' : '기록을 먼저 추가해야 합니다'}</p>
              )}
              {hasContext && !stripHtml(question) && (
                <p className="text-xs text-[rgba(var(--text-rgb),0.3)] text-center mt-3">질문을 입력하면 복사 버튼이 활성화됩니다</p>
              )}

              {(hasContext || stripHtml(profiles[activeTab])) && (
                <div className="mt-5 pt-4 border-t border-[rgba(var(--ink-rgb),0.09)] space-y-1.5">
                  <p className="text-xs text-[rgba(var(--text-rgb),0.5)] font-semibold mb-2">프롬프트 구성</p>
                  {stripHtml(profiles[activeTab]) && (
                    <p className="text-xs text-[rgba(var(--text-rgb),0.4)] flex items-center gap-2">
                      <span className="text-[#2D5A45] font-bold">✓</span>페르소나 프로필
                    </p>
                  )}
                  {voiceCount > 0 && (
                    <p className="text-xs text-[rgba(var(--text-rgb),0.4)] flex items-center gap-2">
                      <span className="text-[#2D5A45] font-bold">✓</span>경영진 의견 원문 {voiceCount}건
                    </p>
                  )}
                  {logCount > 0 && (
                    <p className="text-xs text-[rgba(var(--text-rgb),0.4)] flex items-center gap-2">
                      <span className="text-[#2D5A45] font-bold">✓</span>직접 기록 {logCount}건
                    </p>
                  )}
                  {refCount > 0 && (
                    <p className="text-xs text-[rgba(var(--text-rgb),0.4)] flex items-center gap-2">
                      <span className="text-[#2D5A45] font-bold">✓</span>경영진 회의록 참고자료 {refCount}건
                    </p>
                  )}
                  <p className="text-xs text-[rgba(var(--text-rgb),0.4)] flex items-center gap-2">
                    <span className="text-[#2D5A45] font-bold">✓</span>질문 → MD 형식 복사
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
