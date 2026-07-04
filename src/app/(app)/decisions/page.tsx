'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Meeting } from '@/types'

type Persona = 'CEO' | 'CSO' | '피플본부장' | 'Jin'
const PERSONAS: Persona[] = ['CEO', 'CSO', '피플본부장', 'Jin']

const PERSONA_META: Record<Persona, {
  role: string
  meetingCategory: string | null
  profilePlaceholder: string
  promptRequest: string
}> = {
  CEO: {
    role: '대표이사',
    meetingCategory: '경영진',
    profilePlaceholder: 'CEO의 의사결정 스타일, 관심사, 우선순위, 자주 하는 말, 민감한 포인트 등을 기록하세요.\n예) 숫자와 속도를 중시함. "그래서 언제까지 가능해?" 자주 물어봄. 리스크보다 기회를 먼저 봄.',
    promptRequest: '위 기록을 바탕으로, CEO가 이 상황을 어떻게 바라볼지 분석해주세요. CEO의 시각·우선순위·예상 질문·반응을 구체적으로 시뮬레이션해주세요.',
  },
  CSO: {
    role: '최고전략책임자',
    meetingCategory: '경영진',
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

const pill  = 'text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all whitespace-nowrap'
const pOn  = 'bg-gray-900 text-white border-gray-900 shadow-sm'
const pOff = 'bg-white/40 backdrop-blur-xl border-white/60 text-gray-500 hover:bg-white/60 hover:text-gray-700'

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
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const [profiles, setProfiles] = useState<Record<Persona, string>>({ CEO: '', CSO: '', '피플본부장': '', Jin: '' })
  const [profileOpen, setProfileOpen] = useState(false)
  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [includeMeetings, setIncludeMeetings] = useState(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [meetingsLoading, setMeetingsLoading] = useState(false)

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
  }, [])

  useEffect(() => {
    const category = PERSONA_META[activeTab].meetingCategory
    if (!includeMeetings || !category) { setMeetings([]); return }
    setMeetingsLoading(true)
    supabase.from('meetings')
      .select('id, title, meeting_date, category, notes, created_at, updated_at')
      .eq('category', category)
      .order('meeting_date', { ascending: false })
      .then(({ data }) => {
        setMeetings((data ?? []) as Meeting[])
        setMeetingsLoading(false)
      })
  }, [includeMeetings, activeTab])

  useEffect(() => {
    setIncludeMeetings(false)
    setMeetings([])
    setAddOpen(false)
    setSaveError('')
    setProfileOpen(false)
  }, [activeTab])

  function saveProfile(persona: Persona, text: string) {
    setProfiles(prev => ({ ...prev, [persona]: text }))
    if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current)
    profileSaveTimer.current = setTimeout(() => {
      supabase.from('user_settings').upsert({
        key: `persona_profile_${persona}`,
        value: text,
        updated_at: new Date().toISOString(),
      })
    }, 800)
  }

  const tabLogs = useMemo(() => logs.filter(l => l.persona === activeTab), [logs, activeTab])

  function toggleOpen(id: string) {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function addLog() {
    if (!newTitle.trim() || !newContent.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const { data, error } = await supabase.from('persona_logs').insert({
        persona: activeTab,
        date: newDate,
        title: newTitle.trim(),
        content: newContent.trim(),
      }).select().single()
      if (error) { setSaveError(error.message); return }
      if (data) {
        setLogs(prev => [data as Log, ...prev])
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
    const profile = profiles[activeTab].trim()
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
    lines.push('')
    lines.push(`## 축적된 대화 / 피드백 기록 (${tabLogs.length}건)`)
    lines.push('')
    if (tabLogs.length === 0) {
      lines.push('(기록 없음)')
    } else {
      for (const log of tabLogs) {
        lines.push(`### ${log.date} — ${log.title}`)
        lines.push('')
        lines.push(log.content)
        lines.push('')
      }
    }
    if (includeMeetings && meetings.length > 0) {
      lines.push('---')
      lines.push('')
      lines.push(`## 관련 회의록 (${meta.meetingCategory} · ${meetings.length}건)`)
      lines.push('')
      for (const m of meetings) {
        lines.push(`### ${m.meeting_date ?? '날짜미상'} — ${m.title}`)
        lines.push('')
        for (const note of (m.notes ?? [])) {
          if (note.title) lines.push(`**${note.title}**`)
          lines.push(note.content)
          lines.push('')
        }
      }
    }
    lines.push('---')
    lines.push('')
    lines.push('## 현재 상황 / 질문')
    lines.push('')
    lines.push(question.trim() || '(질문을 입력해주세요)')
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
  const hasMeetingCategory = !!PERSONA_META[activeTab].meetingCategory

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">

      {/* 헤더 */}
      <div className="flex-shrink-0 pt-6 pb-4 flex items-center gap-4 flex-wrap">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-gray-900">의사결정</h1>
          <p className="text-xs text-gray-400 mt-0.5">페르소나 기록 축적 → 프롬프트 생성 → Claude.ai 붙여넣기</p>
        </div>
        <div className="flex items-center bg-white/40 backdrop-blur-xl border border-white/60 rounded-full p-1 overflow-x-auto scrollbar-hide flex-shrink-0">
          {PERSONAS.map(p => (
            <button key={p} onClick={() => setActiveTab(p)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === p ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p}
              {countByPersona(p) > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === p ? 'bg-white/20 text-white/70' : 'bg-gray-100/80 text-gray-400'
                }`}>{countByPersona(p)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 pb-6 items-start">

          {/* 왼쪽: 프로필 + 기록 */}
          <div className="space-y-4">

            {/* 페르소나 프로필 카드 */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden">
              <button onClick={() => setProfileOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/20 transition-colors group">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-gray-300 group-hover:text-gray-500 transition-colors">{profileOpen ? '▼' : '▶'}</span>
                  <span className="text-sm font-semibold text-gray-700">페르소나 프로필</span>
                  {profiles[activeTab].trim() && (
                    <span className="text-[10px] text-[#2D5A45] bg-[#BADEC8]/30 border border-[#BADEC8]/40 px-2 py-0.5 rounded-full">작성됨</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">프롬프트 최상단에 포함</span>
              </button>
              {profileOpen && (
                <div className="px-6 pb-6 border-t border-white/40">
                  <textarea
                    value={profiles[activeTab]}
                    onChange={e => saveProfile(activeTab, e.target.value)}
                    placeholder={PERSONA_META[activeTab].profilePlaceholder}
                    rows={5}
                    className="w-full mt-4 text-sm bg-white/50 border border-white/70 rounded-2xl px-4 py-3 focus:outline-none resize-none text-gray-700 placeholder-gray-300" />
                  <p className="text-xs text-gray-300 mt-2">입력 즉시 자동저장</p>
                </div>
              )}
            </div>

            {/* 기록 목록 카드 */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/30">
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${PERSONA_COLORS[activeTab]}`}>{activeTab}</span>
                  <span className="text-xs text-gray-400">{PERSONA_META[activeTab].role} · {tabLogs.length}건</span>
                </div>
                <button onClick={() => { setAddOpen(v => !v); setSaveError(''); setTimeout(() => titleRef.current?.focus(), 50) }}
                  className={addOpen ? `${pill} ${pOff}` : 'text-xs bg-gray-900 text-white px-4 py-1.5 rounded-full font-medium hover:bg-gray-800 transition-colors'}>
                  {addOpen ? '취소' : '+ 기록 추가'}
                </button>
              </div>

              {addOpen && (
                <div className="px-6 py-5 border-b border-white/30 bg-white/20 space-y-3">
                  <div className="flex gap-2">
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                      className="text-xs bg-white/50 border border-white/70 rounded-2xl px-3 py-2 focus:outline-none text-gray-600 flex-shrink-0" />
                    <input
                      ref={titleRef}
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addLog() }
                        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); contentRef.current?.focus() }
                      }}
                      placeholder="제목 (예: 평가제도 개편안 피드백, Q1 전략 회의)"
                      className="flex-1 text-sm bg-white/50 border border-white/70 rounded-2xl px-4 py-2 focus:outline-none text-gray-700 placeholder-gray-300" />
                  </div>
                  <textarea
                    ref={contentRef}
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addLog() }
                      if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); titleRef.current?.focus() }
                    }}
                    placeholder={`${activeTab}의 발언, 피드백, 대화 내용을 그대로 기록하세요.\n많이 쌓을수록 페르소나 정확도가 높아집니다.`}
                    rows={6}
                    className="w-full text-sm bg-white/50 border border-white/70 rounded-2xl px-4 py-3 focus:outline-none resize-none text-gray-700 placeholder-gray-300" />
                  {saveError && (
                    <p className="text-xs text-red-500 bg-red-50/60 backdrop-blur-sm rounded-2xl px-4 py-2">{saveError}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">Ctrl+Enter 저장 · Tab/Shift+Tab 이동</span>
                    <div className="flex gap-2">
                      <button onClick={() => { setAddOpen(false); setSaveError('') }} className={`${pill} ${pOff}`}>취소</button>
                      <button onClick={addLog} disabled={!newTitle.trim() || !newContent.trim() || saving}
                        className="text-xs bg-gray-900 text-white px-5 py-1.5 rounded-full disabled:opacity-30 hover:bg-gray-800 transition-colors font-medium">
                        {saving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tabLogs.length === 0 ? (
                <div className="text-center py-14 text-gray-300 px-6">
                  <p className="text-sm mb-1">아직 기록이 없습니다</p>
                  <p className="text-xs">{activeTab}의 발언·피드백·대화를 쌓기 시작하세요</p>
                </div>
              ) : (
                <div className="divide-y divide-white/30">
                  {tabLogs.map(log => (
                    <div key={log.id} className="group hover:bg-white/20 transition-colors">
                      <button onClick={() => toggleOpen(log.id)}
                        className="w-full flex items-center justify-between px-6 py-4 text-left">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-[10px] text-gray-300 flex-shrink-0">{openIds.has(log.id) ? '▼' : '▶'}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{log.date}</span>
                          <span className="text-sm font-semibold text-gray-700 truncate">{log.title}</span>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteLog(log.id) }}
                          className="text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-3 px-2 py-1 rounded-full hover:bg-red-50/50">
                          삭제
                        </button>
                      </button>
                      {openIds.has(log.id) && (
                        <div className="px-6 pb-5 pt-1">
                          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed bg-white/30 rounded-2xl px-4 py-3">{log.content}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 프롬프트 생성기 */}
          <div className="lg:sticky lg:top-0 space-y-4">
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">프롬프트 생성</h3>
              <p className="text-xs text-gray-400 mb-5">
                {activeTab === 'Jin' ? '나의 과거 패턴 + 질문 → 객관화 요청' : `${activeTab} 기록 + 질문 → 예상반응 시뮬레이션`}
              </p>

              {hasMeetingCategory && (
                <div className="mb-5 pb-5 border-b border-white/40">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-xs font-medium text-gray-600">회의록 포함</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {PERSONA_META[activeTab].meetingCategory} 카테고리 회의록 자동 추가
                        {includeMeetings && !meetingsLoading && (
                          <span className="ml-1 text-[#2D5A45]">({meetings.length}건)</span>
                        )}
                        {meetingsLoading && <span className="ml-1">로딩 중...</span>}
                      </p>
                    </div>
                    <div
                      onClick={() => setIncludeMeetings(v => !v)}
                      className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
                        includeMeetings ? 'bg-[#BADEC8]' : 'bg-gray-200'
                      }`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        includeMeetings ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </div>
                  </label>
                </div>
              )}

              <label className="text-xs text-gray-500 font-medium block mb-2">상황 / 질문</label>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder={
                  activeTab === 'Jin'
                    ? '객관적으로 판단이 필요한 상황이나 고민을 입력하세요'
                    : `${activeTab}에게 보고하거나 설득해야 할 상황을 입력하세요`
                }
                rows={6}
                className="w-full text-sm bg-white/50 border border-white/70 rounded-2xl px-4 py-3 focus:outline-none resize-none mb-4 text-gray-700 placeholder-gray-300" />

              <button
                onClick={copyPrompt}
                disabled={tabLogs.length === 0 || !question.trim()}
                className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${
                  copied ? 'bg-[#BADEC8] text-[#2D5A45]' : 'bg-gray-900 text-white hover:bg-gray-800'
                } disabled:opacity-30 disabled:cursor-not-allowed`}>
                {copied ? '✓ 복사됨 — Claude.ai에 붙여넣기' : `${activeTab} 페르소나 프롬프트 복사`}
              </button>

              {tabLogs.length === 0 && (
                <p className="text-xs text-gray-300 text-center mt-3">기록을 먼저 추가해야 합니다</p>
              )}
              {tabLogs.length > 0 && !question.trim() && (
                <p className="text-xs text-gray-300 text-center mt-3">질문을 입력하면 복사 버튼이 활성화됩니다</p>
              )}

              {(tabLogs.length > 0 || profiles[activeTab].trim()) && (
                <div className="mt-5 pt-4 border-t border-white/40 space-y-1.5">
                  <p className="text-xs text-gray-500 font-semibold mb-2">프롬프트 구성</p>
                  {profiles[activeTab].trim() && (
                    <p className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="text-[#2D5A45] font-bold">✓</span>페르소나 프로필
                    </p>
                  )}
                  {tabLogs.length > 0 && (
                    <p className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="text-[#2D5A45] font-bold">✓</span>기록 {tabLogs.length}건
                    </p>
                  )}
                  {includeMeetings && meetings.length > 0 && (
                    <p className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="text-[#2D5A45] font-bold">✓</span>회의록 {meetings.length}건
                    </p>
                  )}
                  <p className="text-xs text-gray-400 flex items-center gap-2">
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
