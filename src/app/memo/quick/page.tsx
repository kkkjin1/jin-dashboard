'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import TiptapEditor from '@/components/TiptapEditor'
import type { MemoTag } from '@/types'

const TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어', '공지']

const TAG_COLORS: Record<MemoTag, string> = {
  '업무관련': 'bg-[rgba(79,141,255,0.15)] text-[#4F8DFF] border-[rgba(79,141,255,0.3)]',
  '회의관련': 'bg-[rgba(139,92,246,0.15)] text-[#A78BFA] border-[rgba(139,92,246,0.3)]',
  '아이디어': 'bg-[rgba(249,158,11,0.15)] text-[#F99E0B] border-[rgba(249,158,11,0.3)]',
  '공지': 'bg-[rgba(239,68,68,0.15)] text-[#FC8181] border-[rgba(239,68,68,0.3)]',
  '완료': 'bg-[rgba(91,98,112,0.15)] text-[#7B8290] border-[rgba(91,98,112,0.3)]',
}

function parseMeetingDate(text: string): string | null {
  const year = new Date().getFullYear()
  const kr = text.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (kr) return `${year}-${kr[1].padStart(2, '0')}-${kr[2].padStart(2, '0')}`
  const slash = text.match(/(\d{1,2})[/\-](\d{1,2})/)
  if (slash) return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
  return null
}

type AgendaGroupOption  = { id: string; name: string; color: string }
type AgendaItemOption   = { id: string; title: string }

export default function QuickMemoPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [autoSaved, setAutoSaved] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // ── 세부task 연동 state ──────────────────────────────────────────────────────
  const [selText,        setSelText]        = useState('')
  const [showPicker,     setShowPicker]     = useState(false)
  const [pickerStep,     setPickerStep]     = useState<'group' | 'item'>('group')
  const [groups,         setGroups]         = useState<AgendaGroupOption[]>([])
  const [pickerItems,    setPickerItems]    = useState<AgendaItemOption[]>([])
  const [pickerLoading,  setPickerLoading]  = useState(false)
  const [subTaskCreated, setSubTaskCreated] = useState('')

  // 안건 그룹 미리 로드
  useEffect(() => {
    supabase.from('agenda_groups').select('id, name, color').order('sort_order').then(({ data }) => {
      setGroups((data ?? []) as AgendaGroupOption[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelectionChange = useCallback((text: string) => {
    setSelText(text)
    if (!text) setShowPicker(false)
  }, [])

  async function onGroupSelect(groupId: string) {
    setPickerLoading(true)
    const { data } = await supabase
      .from('agenda_items')
      .select('id, title')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .order('sort_order')
    setPickerItems((data ?? []) as AgendaItemOption[])
    setPickerLoading(false)
    setPickerStep('item')
  }

  async function onItemSelect(agendaItemId: string) {
    setPickerLoading(true)
    const { count } = await supabase
      .from('agenda_sub_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('agenda_item_id', agendaItemId)
    await supabase.from('agenda_sub_tasks').insert({
      agenda_item_id: agendaItemId,
      title: selText,
      status: 'active',
      sort_order: (count ?? 0) + 1,
    })
    setPickerLoading(false)
    setSubTaskCreated(selText)
    setSelText('')
    setShowPicker(false)
    setPickerStep('group')
    setTimeout(() => setSubTaskCreated(''), 2500)
  }

  // ── 자동저장 (localStorage) ──────────────────────────────────────────────
  const saveDraft = useCallback((t: string, c: string, tg: MemoTag) => {
    if (t || c) {
      localStorage.setItem('quick_memo_draft', JSON.stringify({ title: t, content: c, tag: tg }))
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 1500)
    } else {
      localStorage.removeItem('quick_memo_draft')
    }
  }, [])

  // ── 초기 복원 ────────────────────────────────────────────────────────────
  useEffect(() => {
    document.title = '빠른 메모'
    try {
      const saved = localStorage.getItem('quick_memo_draft')
      if (saved) {
        const { title: t, content: c, tag: tg } = JSON.parse(saved)
        if (t) setTitle(t)
        if (c) setContent(c)
        if (tg) setTag(tg)
      }
    } catch {}
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [])

  // ── ESC 닫기 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showPicker) { setShowPicker(false); return }
        window.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPicker])

  const meetingDate = tag === '회의관련' ? parseMeetingDate(title) : null

  // ── 저장 ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    if (tag === '회의관련' && meetingDate) {
      const { data: newMeeting } = await supabase
        .from('project_meetings')
        .insert({ title: title.trim(), meeting_date: meetingDate })
        .select('id, title, meeting_date')
        .single()
      if (newMeeting && window.opener) {
        window.opener.dispatchEvent(new CustomEvent('quick-meeting-created', { detail: newMeeting }))
      }
      setSavedMsg('📅 일정에 추가됨!')
    } else {
      await supabase.from('quick_memos').insert({ title: title.trim(), content, tag })
      if (window.opener) window.opener.dispatchEvent(new CustomEvent('quick-memo-saved'))
      setSavedMsg('저장됨!')
    }
    localStorage.removeItem('quick_memo_draft')
    setSaving(false)
    setTitle('')
    setContent('')
    setTag('업무관련')
    setTimeout(() => {
      setSavedMsg('')
      titleRef.current?.focus()
    }, 1200)
  }

  return (
    <div className="h-screen flex flex-col p-5" style={{ background: '#161B24', colorScheme: 'dark', boxSizing: 'border-box' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#E5E7EB] text-sm tracking-wide">빠른 메모</h3>
        <div className="flex items-center gap-2">
          {autoSaved && <span className="text-[10px] text-[#5B6270]">임시저장됨</span>}
          <button onClick={() => window.close()} className="text-[#5B6270] hover:text-[#E5E7EB] text-lg leading-none transition-colors">×</button>
        </div>
      </div>

      {/* 태그 */}
      <div className="flex gap-1.5 mb-3">
        {TAGS.map(t => (
          <button
            key={t}
            onClick={() => { setTag(t); saveDraft(title, content, t) }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              tag === t
                ? TAG_COLORS[t]
                : 'bg-[rgba(255,255,255,0.05)] text-[#5B6270] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#A1A7B3]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 제목 */}
      <input
        ref={titleRef}
        value={title}
        onChange={e => { setTitle(e.target.value); saveDraft(e.target.value, content, tag) }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault() }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        }}
        placeholder={tag === '회의관련' ? '6월15일 미팅(홍길동/업무내용)' : '제목 (Ctrl+Enter 저장)'}
        className="w-full text-sm placeholder:text-[#5B6270] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 focus:outline-none focus:border-[rgba(255,255,255,0.2)] mb-1.5"
        style={{ background: '#1A1C1F', color: '#E5E7EB' }}
      />

      {tag === '회의관련' && (
        <p className={`text-xs mb-2 px-0.5 ${meetingDate ? 'text-[#A78BFA]' : 'text-[#5B6270]'}`}>
          {meetingDate
            ? `📅 ${meetingDate} 일정으로 등록됩니다`
            : '날짜 포함 시 일정탭에 자동 등록 (예: 6월15일 미팅)'}
        </p>
      )}

      {/* 본문 — TiptapEditor */}
      <div className="flex-1 min-h-0 mb-2 overflow-y-auto border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2"
        style={{ background: '#1A1C1F' }}>
        <TiptapEditor
          value={content}
          onChange={v => { setContent(v); saveDraft(title, v, tag) }}
          onSubmit={handleSave}
          onSelectionChange={handleSelectionChange}
          dark
          minHeight={140}
        />
      </div>

      {/* ── 세부task 생성 Bar ── */}
      {subTaskCreated ? (
        <div className="mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: 'rgba(56,190,152,0.12)', border: '1px solid rgba(56,190,152,0.2)', color: '#38BE98' }}>
          <span>✓</span>
          <span className="flex-1 truncate">세부task 생성됨: {subTaskCreated}</span>
        </div>
      ) : selText && !showPicker ? (
        <div className="mb-2 flex items-center gap-2">
          <div className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg truncate"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.07)' }}>
            &ldquo;{selText}&rdquo;
          </div>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setShowPicker(true); setPickerStep('group') }}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: 'rgba(76,127,224,0.14)', color: '#8DAEE6', border: '1px solid rgba(76,127,224,0.25)' }}>
            + 세부task
          </button>
        </div>
      ) : null}

      {/* ── 안건 Picker ── */}
      {showPicker && (
        <div className="mb-2 rounded-lg overflow-hidden"
          style={{ background: '#1A2030', border: '1px solid rgba(255,255,255,0.09)' }}>
          {/* Picker 헤더 */}
          <div className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {pickerStep === 'item' ? (
              <button
                type="button"
                onClick={() => setPickerStep('group')}
                className="text-[11px] flex items-center gap-1"
                style={{ color: '#7B8397' }}>
                ← 뒤로
              </button>
            ) : (
              <span className="text-[11px]" style={{ color: '#7B8397' }}>프로젝트 선택</span>
            )}
            <span className="text-[10px] truncate max-w-[160px] px-2" style={{ color: '#5B6270' }}>
              &ldquo;{selText}&rdquo;
            </span>
            <button type="button" onClick={() => setShowPicker(false)}
              className="text-[13px] leading-none" style={{ color: '#5B6270' }}>×</button>
          </div>

          {/* Picker 목록 */}
          <div className="max-h-[140px] overflow-y-auto py-1">
            {pickerLoading ? (
              <div className="text-[11px] px-3 py-3 text-center" style={{ color: '#5B6270' }}>로딩 중...</div>
            ) : pickerStep === 'group' ? (
              groups.length === 0
                ? <div className="text-[11px] px-3 py-3 text-center" style={{ color: '#5B6270' }}>프로젝트가 없습니다</div>
                : groups.map(g => (
                    <button key={g.id} type="button"
                      onClick={() => onGroupSelect(g.id)}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                      style={{ color: '#C9D2E0' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color, flexShrink: 0, display: 'inline-block' }} />
                      {g.name}
                    </button>
                  ))
            ) : (
              pickerItems.length === 0
                ? <div className="text-[11px] px-3 py-3 text-center" style={{ color: '#5B6270' }}>안건이 없습니다</div>
                : pickerItems.map(item => (
                    <button key={item.id} type="button"
                      onClick={() => onItemSelect(item.id)}
                      disabled={pickerLoading}
                      className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40"
                      style={{ color: '#C9D2E0' }}>
                      {item.title}
                    </button>
                  ))
            )}
          </div>
        </div>
      )}

      {/* 푸터 */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-[#5B6270]">ESC 닫기 · Ctrl+Enter 저장 · 텍스트 선택 → 세부task</span>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="text-xs bg-[rgba(76,127,224,0.1)] text-[rgba(230,231,234,0.85)] border border-[rgba(255,255,255,0.08)] px-4 py-2 rounded-lg hover:bg-[rgba(76,127,224,0.18)] disabled:opacity-30 transition-colors"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}
        >
          {savedMsg || (saving ? '저장 중...' : meetingDate ? '일정 등록' : '저장')}
        </button>
      </div>
    </div>
  )
}
