'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Persona = 'CEO' | 'CSO' | '피플본부장' | 'Jin'

const PERSONAS: Persona[] = ['CEO', 'CSO', '피플본부장', 'Jin']

const PERSONA_META: Record<Persona, { role: string; promptRequest: string }> = {
  CEO: {
    role: '대표이사',
    promptRequest: '위 기록을 바탕으로, CEO가 이 상황을 어떻게 바라볼지 분석해주세요. CEO의 시각·우선순위·예상 질문·반응을 구체적으로 시뮬레이션해주세요.',
  },
  CSO: {
    role: '최고전략책임자',
    promptRequest: '위 기록을 바탕으로, CSO가 이 상황을 어떻게 바라볼지 분석해주세요. CSO의 시각·우선순위·예상 질문·반응을 구체적으로 시뮬레이션해주세요.',
  },
  '피플본부장': {
    role: '피플본부장',
    promptRequest: '위 기록을 바탕으로, 피플본부장이 이 상황을 어떻게 바라볼지 분석해주세요. 본부장의 시각·우선순위·예상 질문·반응을 구체적으로 시뮬레이션해주세요.',
  },
  Jin: {
    role: '나 (김진일)',
    promptRequest: '위의 과거 판단 패턴과 피드백 기록을 바탕으로, 이번 상황에서 내가 놓치고 있을 수 있는 관점·비일관성·맹점을 날카롭게 지적해주세요. 내 성향의 강점과 함정을 모두 고려해주세요.',
  },
}

interface Log {
  id: string
  persona: Persona
  date: string
  title: string
  content: string
  created_at: string
}

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
  const supabase = createClient()

  useEffect(() => {
    supabase.from('persona_logs').select('*').order('date', { ascending: false }).then(({ data }) => {
      setLogs((data ?? []) as Log[])
    })
  }, [])

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
    const lines: string[] = []

    lines.push(`# ${activeTab} 페르소나 시뮬레이션`)
    lines.push('')
    lines.push(`> **역할:** ${meta.role}`)
    lines.push(`> **기록 수:** ${tabLogs.length}건`)
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('## 축적된 대화 / 피드백 기록')
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

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">의사결정</h1>
        <p className="text-sm text-gray-400">페르소나 기록 축적 → 프롬프트 생성 → Claude.ai 붙여넣기</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {PERSONAS.map(p => (
          <button key={p} onClick={() => { setActiveTab(p); setAddOpen(false) }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {p}
            {countByPersona(p) > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === p ? 'bg-gray-100 text-gray-500' : 'bg-gray-200 text-gray-400'
              }`}>{countByPersona(p)}</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* 왼쪽: 기록 목록 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-semibold text-gray-800">{activeTab}</span>
              <span className="text-xs text-gray-400 ml-2">{PERSONA_META[activeTab].role} · {tabLogs.length}건</span>
            </div>
            <button onClick={() => { setAddOpen(v => !v); setSaveError(''); setTimeout(() => titleRef.current?.focus(), 50) }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                addOpen ? 'bg-gray-200 text-gray-700' : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}>
              {addOpen ? '취소' : '+ 기록 추가'}
            </button>
          </div>

          {addOpen && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3 space-y-3">
              <div className="flex gap-2">
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gray-400" />
                <input
                  ref={titleRef}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addLog() }
                    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); contentRef.current?.focus() }
                  }}
                  placeholder="제목 (예: 평가제도 개편안 피드백, Q1 전략 회의)"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400" />
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
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 resize-none" />
              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">Ctrl+Enter 저장 · Tab/Shift+Tab 이동</span>
                <div className="flex gap-2">
                  <button onClick={() => { setAddOpen(false); setSaveError('') }} className="text-xs text-gray-400 px-3 py-1.5 rounded-lg hover:text-gray-600">취소</button>
                  <button onClick={addLog} disabled={!newTitle.trim() || !newContent.trim() || saving}
                    className="text-xs bg-gray-900 text-white px-4 py-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-800 transition-colors">
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tabLogs.length === 0 ? (
            <div className="text-center py-16 text-gray-300">
              <p className="text-sm mb-1">아직 기록이 없습니다</p>
              <p className="text-xs">{activeTab}의 발언·피드백·대화를 쌓기 시작하세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tabLogs.map(log => (
                <div key={log.id} className="bg-white rounded-lg border border-gray-100 overflow-hidden group">
                  <button onClick={() => toggleOpen(log.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[10px] text-gray-300 flex-shrink-0">{openIds.has(log.id) ? '▼' : '▶'}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{log.date}</span>
                      <span className="text-sm font-medium text-gray-700 truncate">{log.title}</span>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteLog(log.id) }}
                      className="text-xs text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-3">
                      삭제
                    </button>
                  </button>
                  {openIds.has(log.id) && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-50">
                      <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{log.content}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 오른쪽: 프롬프트 생성기 */}
        <div className="lg:sticky lg:top-6">
          <div className="bg-white rounded-lg border border-gray-100 p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">프롬프트 생성</h3>
            <p className="text-xs text-gray-400 mb-4">
              {activeTab === 'Jin'
                ? '나의 과거 패턴 + 질문 → 객관화 요청'
                : `${activeTab} 기록 + 질문 → 예상반응 시뮬레이션`}
            </p>

            <label className="text-xs text-gray-500 font-medium block mb-1.5">상황 / 질문</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={
                activeTab === 'Jin'
                  ? '객관적으로 판단이 필요한 상황이나 고민을 입력하세요'
                  : `${activeTab}에게 보고하거나 설득해야 할 상황을 입력하세요`
              }
              rows={7}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400 resize-none mb-3"
            />

            <button
              onClick={copyPrompt}
              disabled={tabLogs.length === 0 || !question.trim()}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                copied
                  ? 'bg-[#BADEC8] text-[#2D5A45]'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              } disabled:opacity-30 disabled:cursor-not-allowed`}>
              {copied ? '✓ 복사됨 — Claude.ai에 붙여넣기' : `${activeTab} 페르소나 프롬프트 복사`}
            </button>

            {tabLogs.length === 0 && (
              <p className="text-xs text-gray-300 text-center mt-2">기록을 먼저 추가해야 합니다</p>
            )}
            {tabLogs.length > 0 && !question.trim() && (
              <p className="text-xs text-gray-300 text-center mt-2">질문을 입력하면 복사 버튼이 활성화됩니다</p>
            )}

            {tabLogs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-400 font-medium mb-1">포함되는 내용</p>
                <p className="text-xs text-gray-300">{tabLogs.length}건의 기록 + 질문 → MD 형식</p>
                <p className="text-xs text-gray-300 mt-0.5">Claude.ai 새 대화에 그대로 붙여넣기</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
