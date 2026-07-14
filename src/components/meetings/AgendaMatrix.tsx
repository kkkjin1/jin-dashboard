'use client'

import { useEffect, useState, useRef, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AgendaGroup, AgendaItem, AgendaUpdate, AgendaSubTask, Attachment, Member } from '@/types'
import ReactMarkdown from 'react-markdown'
import TiptapEditor from '@/components/TiptapEditor'

// ── 상수 ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = { active: '#3B82F6', hold: '#9CA3AF', done: '#10B981' }
const STATUS_LABEL: Record<string, string> = { active: '진행', hold: '보류', done: '완료' }
const GROUP_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#9CA3AF']
const MATRIX_CATS = ['코어', '비즈', '개인']
const CAT_CLS: Record<string, string> = {
  '코어':  'bg-blue-50 text-blue-700 border-blue-200',
  '비즈':  'bg-amber-50 text-amber-700 border-amber-200',
  '개인':  'bg-emerald-50 text-emerald-700 border-emerald-200',
}
const CAT_BG: Record<string, string>     = { '코어': 'rgba(59,130,246,0.09)',  '비즈': 'rgba(245,158,11,0.09)',  '개인': 'rgba(16,185,129,0.09)' }
const CAT_BORDER: Record<string, string> = { '코어': '#3B82F6',                '비즈': '#F59E0B',                '개인': '#10B981' }
const CAT_DOT: Record<string, string>    = { '코어': '#3B82F6',                '비즈': '#F59E0B',                '개인': '#10B981' }

const W_LEFT = 240
const W_CAL  = 52

interface MeetingCol { id: string; title: string; meeting_date: string | null }
interface PrevRecord { date: string; note: string; meetingId: string }

function formatDate(d: string | null) {
  if (!d) return '날짜 미지정'
  const dt = new Date(d + 'T00:00:00')
  const days = ['일','월','화','수','목','금','토']
  return `${dt.getMonth()+1}/${dt.getDate()} (${days[dt.getDay()]})`
}
function formatDateShort(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getMonth()+1}/${dt.getDate()}`
}
function formatDayLabel(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return ['일','월','화','수','목','금','토'][dt.getDay()]
}
function nk(itemId: string, meetingId: string) { return `${itemId}_${meetingId}` }
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${alpha})`
}

const S = { bd: '1px solid #E5E9F0', bdL: '1px solid #BDD0EA', bg: '#fff', bgRow: '#F7F9FC', t1: '#1A2233', t2: '#4A5A72', t3: '#8FA0B5' }

function stDateLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return '오늘'
  if (date === tomorrow) return '내일'
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth()+1}/${d.getDate()}`
}

// HTML vs Markdown 둘 다 처리하는 읽기 전용 렌더러
function renderNote(note: string, style?: React.CSSProperties) {
  const base: React.CSSProperties = { fontSize: 12, color: S.t2, lineHeight: 1.65, ...style }
  if (note.trimStart().startsWith('<')) {
    return <div className="note-html" style={base} dangerouslySetInnerHTML={{ __html: note }} />
  }
  return <div className="md-preview" style={base}><ReactMarkdown>{note}</ReactMarkdown></div>
}

// ── 회의 팝업 ────────────────────────────────────────────────────────
interface MeetingPopupProps {
  meeting: MeetingCol
  allMeetings: MeetingCol[]
  items: AgendaItem[]
  groups: AgendaGroup[]
  subTasks: AgendaSubTask[]
  notes: Record<string, string>
  stNotes: Record<string, string>
  allPrevNotes: Record<string, PrevRecord[]>
  onNote: (itemId: string, meetingId: string, value: string) => void
  onSTNote: (stId: string, meetingId: string, value: string) => void
  onClose: () => void
  onSelectMeeting: (m: MeetingCol) => void
  catColor: string
  category: string
}

function MeetingPopup({ meeting, allMeetings, items, groups, subTasks, notes, stNotes, allPrevNotes, onNote, onSTNote, onClose, onSelectMeeting, catColor, category }: MeetingPopupProps) {
  const supabase = createClient()
  const [openPrev,     setOpenPrev]     = useState<Set<string>>(new Set())
  const [attachments,  setAttachments]  = useState<Attachment[]>([])
  const [uploading,    setUploading]    = useState(false)
  const [uploadError,  setUploadError]  = useState('')
  const [expandKey,    setExpandKey]    = useState<string | null>(null)
  const [expandLabel,  setExpandLabel]  = useState('')
  const [refreshKey,   setRefreshKey]   = useState(0)
  const expandOnChangeRef = useRef<((v: string) => void) | null>(null)
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (expandKey) { setExpandKey(null); setRefreshKey(r => r + 1) }
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, expandKey])

  useEffect(() => {
    supabase.from('attachments').select('*').eq('meeting_id', meeting.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setAttachments((data ?? []) as Attachment[]))
  }, [meeting.id])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true); setUploadError('')
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `meetings/${meeting.id}/${Date.now()}_${safeName}`
        const { error } = await supabase.storage.from('attachments').upload(path, file)
        if (error) { setUploadError(`업로드 실패: ${error.message}`); continue }
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        const { data } = await supabase.from('attachments')
          .insert({ meeting_id: meeting.id, task_id: null, name: file.name, type: '파일', url: urlData.publicUrl })
          .select().single()
        if (data) setAttachments(prev => [data as Attachment, ...prev])
      }
    } finally { setUploading(false); e.target.value = '' }
  }

  async function deleteAttachment(att: Attachment) {
    if (att.type === '파일') {
      const path = att.url.split('/object/public/attachments/')[1]
      if (path) await supabase.storage.from('attachments').remove([path])
    }
    await supabase.from('attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  function togglePrev(key: string) {
    setOpenPrev(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }
  function toggleItem(itemId: string) {
    setCollapsedItems(prev => { const s = new Set(prev); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return s })
  }

  // 전체 회의 목록 (현재 포함), 날짜 내림차순
  const allSortedMeetings = [...allMeetings]
    .filter(m => m.meeting_date)
    .sort((a, b) => b.meeting_date!.localeCompare(a.meeting_date!))

  // 안건별 노트 유무 (내용 있으면 dot 표시)
  function meetingHasNotes(meetingId: string) {
    return items.some(i => (notes[nk(i.id, meetingId)] ?? '').trim().length > 0)
  }

  const byGroup = groups
    .map(g => ({ group: g, items: items.filter(i => i.group_id === g.id) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,.28)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
        style={{ width: '94vw', maxWidth: 1300, height: '88vh' }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ borderLeft: `4px solid ${catColor}` }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
              {category === '코어' ? '코어 회의록' : category === '비즈' ? '비즈 회의록' : `${category} 회의록`}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: S.t1 }}>{formatDate(meeting.meeting_date)}</div>
          </div>
          <div className="flex items-center gap-2">
            <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-gray-50 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
              📎 {uploading ? '업로드 중…' : '파일 첨부'}
              <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
            {uploadError && <span className="text-[10px] text-red-400">{uploadError}</span>}
            <span className="text-xs text-gray-300">ESC</span>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-100 text-lg leading-none transition-colors ml-1">
              ×
            </button>
          </div>
        </div>

        {/* 첨부파일 목록 */}
        {attachments.length > 0 && (
          <div className="flex-shrink-0 flex gap-2 px-6 py-2 bg-gray-50/80 border-b border-gray-100 flex-wrap">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1 group">
                <a href={att.url} target="_blank" rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900 hover:underline transition-colors truncate max-w-[160px]">
                  📄 {att.name}
                </a>
                <button onClick={() => deleteAttachment(att)}
                  className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">×</button>
              </div>
            ))}
          </div>
        )}

        {/* 본문: 사이드바 + 메인 */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* 왼쪽: 회의 네비게이션 (전체 목록) */}
          {allSortedMeetings.length > 0 && (
            <div className="w-40 flex-shrink-0 border-r border-gray-100 overflow-y-auto bg-gray-50/60">
              <div style={{ padding: '10px 12px 6px', fontSize: 10, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                회의 목록
              </div>
              {allSortedMeetings.map(m => {
                const isCurrent = m.id === meeting.id
                const hasNotes  = meetingHasNotes(m.id)
                const isFuture  = m.meeting_date! > (meeting.meeting_date ?? '')
                return (
                  <button key={m.id} onClick={() => onSelectMeeting(m)}
                    className="w-full text-left px-3 py-2 hover:bg-white/80 transition-colors"
                    style={{ borderRight: isCurrent ? `2px solid ${catColor}` : '2px solid transparent', background: isCurrent ? 'white' : 'transparent' }}>
                    <div className="flex items-center gap-1.5">
                      {/* 내용 유무 dot */}
                      <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                        background: hasNotes ? catColor : 'transparent',
                        border: hasNotes ? 'none' : `1.5px solid ${isCurrent ? catColor : '#CBD5E0'}` }} />
                      <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? catColor : isFuture ? S.t2 : S.t2, flex: 1 }}>
                        {formatDateShort(m.meeting_date)}
                      </span>
                      {isFuture && <span style={{ fontSize: 9, color: S.t3 }}>예정</span>}
                    </div>
                    <div style={{ fontSize: 10, color: S.t3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 12 }}>
                      {hasNotes ? '기록 있음' : '미작성'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* 오른쪽: 안건별 기록 */}
          <div className="flex-1 overflow-y-auto">
            {byGroup.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: S.t3 }}>
                안건이 없습니다. 전체 탭에서 안건을 먼저 추가해주세요.
              </div>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <colgroup><col style={{ width: 200 }} /><col /></colgroup>
                <thead>
                  <tr style={{ borderBottom: S.bd }}>
                    <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2, padding: '10px 20px', fontSize: 11, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left', borderBottom: S.bd }}>안건</th>
                    <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2, padding: '10px 20px', fontSize: 11, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left', borderLeft: S.bd, borderBottom: S.bd }}>기록</th>
                  </tr>
                </thead>
                <tbody>
                  {byGroup.map(({ group, items: gItems }) => (
                    <Fragment key={group.id}>
                      <tr style={{ background: hexToRgba(group.color, 0.07), borderBottom: S.bd }}>
                        <td colSpan={2} style={{ padding: '7px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', borderLeft: `3px solid ${group.color}` }}>
                          <span style={{ color: group.color }}>{group.name}</span>
                        </td>
                      </tr>
                      {gItems.map(item => {
                        const prevRecords  = allPrevNotes[item.id] ?? []
                        const currentNote  = notes[nk(item.id, meeting.id)] ?? ''
                        const itemSubTasks = subTasks.filter(st => st.agenda_item_id === item.id)
                        const isCollapsed  = collapsedItems.has(item.id)
                        const hasNote      = currentNote.replace(/<[^>]*>/g, '').trim().length > 0
                                          || itemSubTasks.some(st => (stNotes[nk(st.id, meeting.id)] ?? '').replace(/<[^>]*>/g, '').trim().length > 0)
                        return (
                          <Fragment key={item.id}>
                          {isCollapsed ? (
                            <tr style={{ borderBottom: S.bd, cursor: 'pointer' }} onClick={() => toggleItem(item.id)}>
                              <td colSpan={2} style={{ padding: '10px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 8, color: S.t3, flexShrink: 0 }}>▶</span>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0 }} />
                                  <span style={{ fontSize: 13, fontWeight: 600, color: item.status === 'done' ? S.t3 : S.t1, textDecoration: item.status === 'done' ? 'line-through' : 'none', flex: 1 }}>
                                    {item.title}
                                  </span>
                                  {hasNote && <span style={{ fontSize: 9, color: catColor, background: `${catColor}18`, padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>기록</span>}
                                  {prevRecords.length > 0 && <span style={{ fontSize: 10, color: S.t3, flexShrink: 0 }}>이전 {prevRecords.length}건</span>}
                                  {itemSubTasks.length > 0 && <span style={{ fontSize: 9, color: S.t3, flexShrink: 0 }}>세부 {itemSubTasks.length}</span>}
                                </div>
                              </td>
                            </tr>
                          ) : (
                          <>
                          <tr style={{ borderBottom: itemSubTasks.length > 0 ? 'none' : S.bd, verticalAlign: 'top' }}>
                            <td style={{ padding: '14px 20px', verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }} onClick={() => toggleItem(item.id)}>
                                <span style={{ fontSize: 8, color: S.t3, display: 'inline-block', transition: 'transform .15s', transform: 'rotate(90deg)', flexShrink: 0, marginTop: 4 }}>▶</span>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0, marginTop: 4 }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: item.status === 'done' ? S.t3 : S.t1, lineHeight: 1.4, textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                                  {item.title}
                                </span>
                              </div>
                              {prevRecords.length > 0 && (
                                <div style={{ marginTop: 4, marginLeft: 16, fontSize: 10, color: S.t3 }}>이전 기록 {prevRecords.length}건</div>
                              )}
                            </td>
                            <td style={{ borderLeft: S.bd, padding: '12px 16px', verticalAlign: 'top' }}>
                              {prevRecords.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                  {prevRecords.map(rec => {
                                    const key    = `${item.id}_${rec.meetingId}`
                                    const isOpen = openPrev.has(key)
                                    const rawText = rec.note.trimStart().startsWith('<') ? rec.note.replace(/<[^>]*>/g, '').trim() : rec.note.split('\n')[0]
                                    const preview = rawText.slice(0, 60)
                                    return (
                                      <div key={rec.meetingId} style={{ marginBottom: 4, border: `1px solid ${catColor}22`, borderRadius: 8, overflow: 'hidden' }}>
                                        <button onClick={() => togglePrev(key)}
                                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: isOpen ? `${catColor}0A` : '#F8FAFC', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                          <span style={{ fontSize: 8, color: catColor, display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                                          <span style={{ fontSize: 11, fontWeight: 700, color: catColor, flexShrink: 0, minWidth: 52 }}>{formatDate(rec.date)}</span>
                                          {!isOpen && preview && (
                                            <span style={{ fontSize: 11, color: S.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                              {preview}{rawText.length > 60 ? '…' : ''}
                                            </span>
                                          )}
                                        </button>
                                        {isOpen && (
                                          <div style={{ padding: '8px 12px 10px 28px', background: '#FAFBFD', borderTop: `1px solid ${catColor}15`, fontFamily: 'inherit' }}>
                                            {renderNote(rec.note)}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              <div style={{ borderTop: prevRecords.length > 0 ? `1px dashed ${catColor}30` : 'none', paddingTop: prevRecords.length > 0 ? 10 : 0 }}>
                                {prevRecords.length > 0 && (
                                  <div style={{ fontSize: 10, fontWeight: 700, color: catColor, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                                    {formatDate(meeting.meeting_date)} 기록
                                  </div>
                                )}
                                <TiptapEditor
                                  key={`${nk(item.id, meeting.id)}-${refreshKey}`}
                                  value={currentNote}
                                  onChange={(html) => onNote(item.id, meeting.id, html)}
                                  minHeight={72}
                                  className="px-3 py-2"
                                  onExpand={() => {
                                    setExpandKey(nk(item.id, meeting.id))
                                    setExpandLabel(item.title)
                                    expandOnChangeRef.current = (html) => onNote(item.id, meeting.id, html)
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                          {itemSubTasks.map((st, idx) => {
                            const stNote = stNotes[nk(st.id, meeting.id)] ?? ''
                            return (
                              <tr key={st.id} style={{ borderBottom: idx === itemSubTasks.length - 1 ? S.bd : 'none', background: '#FAFBFD', verticalAlign: 'top' }}>
                                <td style={{ padding: '10px 20px 10px 24px', verticalAlign: 'top' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: STATUS_COLOR[st.status] }} />
                                    <span style={{ fontSize: 12, color: st.status === 'done' ? S.t3 : S.t2, textDecoration: st.status === 'done' ? 'line-through' : 'none', lineHeight: 1.4 }}>
                                      {st.title}
                                    </span>
                                    <span style={{ fontSize: 9, color: S.t3, background: '#E5E9F0', padding: '1px 5px', borderRadius: 99, flexShrink: 0 }}>
                                      {STATUS_LABEL[st.status]}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ borderLeft: S.bd, verticalAlign: 'top' }}>
                                  <TiptapEditor
                                    key={`${nk(st.id, meeting.id)}-${refreshKey}`}
                                    value={stNote}
                                    onChange={(html) => onSTNote(st.id, meeting.id, html)}
                                    minHeight={52}
                                    className="px-3 py-2"
                                    onExpand={() => {
                                      setExpandKey(nk(st.id, meeting.id))
                                      setExpandLabel(st.title)
                                      expandOnChangeRef.current = (html) => onSTNote(st.id, meeting.id, html)
                                    }}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                          </>
                          )}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {expandKey && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0"
            style={{ borderLeft: `4px solid ${catColor}` }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: S.t3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                {formatDate(meeting.meeting_date)} · 회의 기록
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: S.t1 }}>{expandLabel}</div>
            </div>
            <button onClick={() => { setExpandKey(null); setRefreshKey(r => r + 1) }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200">
              <span>ESC</span><span> 닫기</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <TiptapEditor
              key={`expand-${expandKey}`}
              value={notes[expandKey] ?? stNotes[expandKey] ?? ''}
              onChange={v => expandOnChangeRef.current?.(v)}
              minHeight={500}
              className="px-8 py-6"
              autoFocus
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 드래그 소스 추적 (모듈 레벨 — React state/dataTransfer 우회) ────
let _dragItemId: string | null = null
let _dragSTId: string | null = null
let _dragGroupId: string | null = null

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function AgendaMatrix({ category, allCats }: { category: string; allCats: string[] }) {
  const supabase = createClient()
  const router   = useRouter()

  const [groups,  setGroups]  = useState<AgendaGroup[]>([])
  const [items,   setItems]   = useState<AgendaItem[]>([])
  const [cols,    setCols]    = useState<MeetingCol[]>([])
  const [notes,   setNotes]   = useState<Record<string, string>>({})
  const [stNotes, setSTNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [openGroups,       setOpenGroups]       = useState<Set<string>>(new Set())
  const [expandedItems,    setExpandedItems]    = useState<Set<string>>(new Set())   // 전체 모드
  const [expandedCalItems, setExpandedCalItems] = useState<Set<string>>(new Set())  // 달력 모드 서브태스크
  const [selectedMeeting,  setSelectedMeeting]  = useState<MeetingCol | null>(null)

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGName,    setNewGName]    = useState('')
  const [newGColor,   setNewGColor]   = useState(GROUP_COLORS[0])
  const [newGCat,     setNewGCat]     = useState<string>(MATRIX_CATS[0])
  const [addingItem,  setAddingItem]  = useState<string | null>(null)
  const [newITitle,   setNewITitle]   = useState('')

  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const [deletingItem,  setDeletingItem]  = useState<string | null>(null)

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGName,      setEditGName]      = useState('')
  const [editGColor,     setEditGColor]     = useState(GROUP_COLORS[0])
  const [editingItemId,  setEditingItemId]  = useState<string | null>(null)
  const [editITitle,     setEditITitle]     = useState('')
  const [editingSTId,    setEditingSTId]    = useState<string | null>(null)
  const [editSTTitle,    setEditSTTitle]    = useState('')

  const [members,       setMembers]       = useState<Member[]>([])
  const [subTasks,      setSubTasks]      = useState<AgendaSubTask[]>([])
  const [addingSubTask, setAddingSubTask] = useState<string | null>(null)
  const [newSTTitle,    setNewSTTitle]    = useState('')
  const [deletingST,    setDeletingST]    = useState<string | null>(null)
  const [meetingErr,    setMeetingErr]    = useState<string>('')
  const [dndErr,        setDndErr]        = useState<string>('')
  const [showDoneGroups, setShowDoneGroups] = useState<Set<string>>(new Set())
  function toggleShowDone(groupId: string) {
    setShowDoneGroups(prev => { const s = new Set(prev); s.has(groupId) ? s.delete(groupId) : s.add(groupId); return s })
  }
  const [viewMode, setViewMode] = useState<'calendar' | 'monthly'>('calendar')
  const [monthNav, setMonthNav] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [draggingItemId,  setDraggingItemId]  = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const [dragOverItemId,  setDragOverItemId]  = useState<string | null>(null)
  const [draggingSTId,    setDraggingSTId]    = useState<string | null>(null)
  const [dragOverSTId,    setDragOverSTId]    = useState<string | null>(null)

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const isAll = category === '전체'

  const sched = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
    const tom = new Date(d); tom.setDate(d.getDate()+1)
    const fri = new Date(d); fri.setDate(d.getDate() + (5 - d.getDay() + 7) % 7)
    return { today: fmt(d), tomorrow: fmt(tom), friday: fmt(fri) }
  }, [])

  // ── 달력용 전체 날짜 범위 ────────────────────────────────────────
  const todayStr     = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const todayColRef  = useRef<HTMLTableCellElement | null>(null)

  const dateRange = useMemo((): string[] => {
    if (isAll) return []
    const dates: string[] = []
    const start = new Date(); start.setDate(start.getDate() - 90)
    const end   = new Date(); end.setDate(end.getDate() + 14)
    let cur = new Date(start)
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10))
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
    }
    return dates
  }, [isAll])

  const meetingByDate = useMemo(() => {
    const map: Record<string, MeetingCol> = {}
    cols.forEach(m => { if (m.meeting_date) map[m.meeting_date] = m })
    return map
  }, [cols])

  const monthDays = useMemo((): string[] => {
    if (isAll) return []
    const { year, month } = monthNav
    const pad = (n: number) => String(n).padStart(2, '0')
    const days = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: days }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)
  }, [isAll, monthNav])

  // ── 오늘로 자동 스크롤 ───────────────────────────────────────────
  useEffect(() => {
    if (isAll || loading || !containerRef.current || !todayColRef.current) return
    const offset = todayColRef.current.offsetLeft - containerRef.current.clientWidth * 0.65
    containerRef.current.scrollLeft = Math.max(0, offset)
  }, [isAll, loading, dateRange.length])

  // ── 데이터 로드 ──────────────────────────────────────────────────
  useEffect(() => { load() }, [category])

  async function load() {
    setLoading(true)
    const gQuery = supabase.from('agenda_groups').select('*').order('sort_order')
    const { data: gData } = isAll ? await gQuery : await gQuery.eq('category', category)
    const fetchedGroups = (gData ?? []) as AgendaGroup[]
    setGroups(fetchedGroups)
    setOpenGroups(new Set(fetchedGroups.filter(g => g.is_open).map(g => g.id)))

    if (fetchedGroups.length > 0) {
      const { data: iData } = await supabase.from('agenda_items').select('*').in('group_id', fetchedGroups.map(g => g.id)).order('sort_order')
      const fetchedItems = (iData ?? []) as AgendaItem[]
      setItems(fetchedItems)
      if (fetchedItems.length > 0) {
        const { data: stData } = await supabase.from('agenda_sub_tasks').select('*').in('agenda_item_id', fetchedItems.map(i => i.id)).order('sort_order')
        setSubTasks((stData ?? []) as AgendaSubTask[])
      } else { setSubTasks([]) }
    } else { setItems([]); setSubTasks([]) }

    if (!isAll) {
      const { data: mData } = await supabase.from('project_meetings').select('id, title, meeting_date').eq('category', category).order('meeting_date', { ascending: true })
      const fetchedCols = (mData ?? []) as MeetingCol[]
      setCols(fetchedCols)
      if (fetchedCols.length > 0) {
        const { data: uData } = await supabase.from('agenda_updates').select('*').in('project_meeting_id', fetchedCols.map(m => m.id))
        const map: Record<string, string> = {}
        ;(uData ?? []).forEach((u: AgendaUpdate) => { map[nk(u.agenda_item_id, u.project_meeting_id)] = u.note })
        setNotes(map)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: stUData } = await supabase.from('sub_task_updates').select('*').in('project_meeting_id', fetchedCols.map(m => m.id))
        const stMap: Record<string, string> = {}
        ;(stUData ?? []).forEach((u: any) => { stMap[nk(u.sub_task_id, u.project_meeting_id)] = u.note })
        setSTNotes(stMap)
      }
    } else { setCols([]); setNotes({}); setSTNotes({}) }

    const { data: memberListData } = await supabase.from('members').select('id, name').is('archived_at', null).order('name')
    setMembers((memberListData ?? []) as Member[])

    setLoading(false)
  }

  // ── 노트 저장 ────────────────────────────────────────────────────
  function handleNote(itemId: string, meetingId: string, value: string) {
    const key = nk(itemId, meetingId)
    setNotes(prev => ({ ...prev, [key]: value }))
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      await supabase.from('agenda_updates').upsert(
        { agenda_item_id: itemId, project_meeting_id: meetingId, note: value },
        { onConflict: 'agenda_item_id,project_meeting_id' }
      )
    }, 600)
  }

  function handleSTNote(stId: string, meetingId: string, value: string) {
    const key = nk(stId, meetingId)
    setSTNotes(prev => ({ ...prev, [key]: value }))
    clearTimeout(saveTimers.current[`st_${key}`])
    saveTimers.current[`st_${key}`] = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('sub_task_updates') as any).upsert(
        { sub_task_id: stId, project_meeting_id: meetingId, note: value },
        { onConflict: 'sub_task_id,project_meeting_id' }
      )
    }, 600)
  }

  // ── 그룹 토글 ────────────────────────────────────────────────────
  async function toggleGroup(id: string) {
    const isOpen = openGroups.has(id)
    setOpenGroups(prev => { const s = new Set(prev); isOpen ? s.delete(id) : s.add(id); return s })
    await supabase.from('agenda_groups').update({ is_open: !isOpen }).eq('id', id)
  }

  async function updateGroupCat(groupId: string, cat: string) {
    await supabase.from('agenda_groups').update({ category: cat }).eq('id', groupId)
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, category: cat } : g))
  }

  // ── CRUD ─────────────────────────────────────────────────────────
  function openAddGroup() { setNewGCat(isAll ? MATRIX_CATS[0] : category); setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(true) }
  async function addGroup() {
    const name = newGName.trim(); if (!name) { setAddingGroup(false); return }
    const { data } = await supabase.from('agenda_groups').insert({ category: newGCat, name, color: newGColor, sort_order: groups.length, is_open: true }).select().single()
    if (data) { setGroups(p => [...p, data as AgendaGroup]); setOpenGroups(p => new Set([...p, (data as AgendaGroup).id])) }
    setNewGName(''); setNewGColor(GROUP_COLORS[0]); setAddingGroup(false)
  }
  async function deleteGroup(groupId: string) {
    await supabase.from('agenda_groups').delete().eq('id', groupId)
    setGroups(p => p.filter(g => g.id !== groupId)); setItems(p => p.filter(i => i.group_id !== groupId)); setDeletingGroup(null)
  }
  async function addItem(groupId: string) {
    const title = newITitle.trim(); if (!title) { setAddingItem(null); return }
    const { data } = await supabase.from('agenda_items').insert({ group_id: groupId, title, item_type: 'do', status: 'active', sort_order: items.filter(i => i.group_id === groupId).length }).select().single()
    if (data) setItems(p => [...p, data as AgendaItem])
    setNewITitle(''); setAddingItem(null)
  }
  async function deleteItem(itemId: string) {
    await supabase.from('agenda_items').delete().eq('id', itemId)
    setItems(p => p.filter(i => i.id !== itemId)); setDeletingItem(null)
  }
  function toggleExpandedItem(itemId: string) { setExpandedItems(prev => { const s = new Set(prev); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return s }) }
  function toggleExpandedCalItem(itemId: string) { setExpandedCalItems(prev => { const s = new Set(prev); s.has(itemId) ? s.delete(itemId) : s.add(itemId); return s }) }
  async function addSubTask(itemId: string) {
    const title = newSTTitle.trim(); if (!title) { setAddingSubTask(null); return }
    const { data } = await supabase.from('agenda_sub_tasks').insert({ agenda_item_id: itemId, title, status: 'active', sort_order: subTasks.filter(st => st.agenda_item_id === itemId).length }).select().single()
    if (data) setSubTasks(p => [...p, data as AgendaSubTask])
    setNewSTTitle(''); setAddingSubTask(null)
  }
  async function deleteSubTask(stId: string) {
    await supabase.from('agenda_sub_tasks').delete().eq('id', stId)
    setSubTasks(p => p.filter(st => st.id !== stId)); setDeletingST(null)
  }
  async function updateGroup(groupId: string) {
    const name = editGName.trim(); if (!name) { setEditingGroupId(null); return }
    await supabase.from('agenda_groups').update({ name, color: editGColor }).eq('id', groupId)
    setGroups(p => p.map(g => g.id === groupId ? { ...g, name, color: editGColor } : g)); setEditingGroupId(null)
  }
  async function updateItem(itemId: string) {
    const title = editITitle.trim(); if (!title) { setEditingItemId(null); return }
    await supabase.from('agenda_items').update({ title }).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, title } : i)); setEditingItemId(null)
  }
  async function updateSubTaskDate(stId: string, date: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('agenda_sub_tasks') as any).update({ target_date: date }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, target_date: date } : s))
  }
  async function updateSubTask(stId: string) {
    const title = editSTTitle.trim(); if (!title) { setEditingSTId(null); return }
    await supabase.from('agenda_sub_tasks').update({ title }).eq('id', stId)
    setSubTasks(p => p.map(s => s.id === stId ? { ...s, title } : s)); setEditingSTId(null)
  }
  async function updateItemAssignee(itemId: string, assigneeId: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('agenda_items').update({ assignee_id: assigneeId } as any).eq('id', itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, assignee_id: assigneeId } : i))
  }
  async function cycleStatus(item: AgendaItem) {
    const order: AgendaItem['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    await supabase.from('agenda_items').update({ status: next }).eq('id', item.id)
    setItems(p => p.map(i => i.id === item.id ? { ...i, status: next } : i))
  }
  async function cycleSubTaskStatus(st: AgendaSubTask) {
    const order: AgendaSubTask['status'][] = ['active', 'hold', 'done']
    const next = order[(order.indexOf(st.status) + 1) % order.length]
    await supabase.from('agenda_sub_tasks').update({ status: next }).eq('id', st.id)
    setSubTasks(p => p.map(s => s.id === st.id ? { ...s, status: next } : s))
  }
  async function moveItemToGroup(itemId: string, newGroupId: string) {
    setItems(p => p.map(i => i.id === itemId ? { ...i, group_id: newGroupId } : i))
    const { error } = await supabase.from('agenda_items').update({ group_id: newGroupId }).eq('id', itemId)
    if (error) { setDndErr(`범주 이동 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000) }
  }
  async function reorderGroup(dragId: string, targetId: string) {
    const sortedG = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    const dragIdx = sortedG.findIndex(g => g.id === dragId)
    const targetIdx = sortedG.findIndex(g => g.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...sortedG]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setGroups(p => p.map(g => { const idx = newOrder.findIndex(x => x.id === g.id); return idx >= 0 ? { ...g, sort_order: idx } : g }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('agenda_groups').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`범주 순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }
  async function reorderItem(dragId: string, targetId: string) {
    const draggedItem = items.find(i => i.id === dragId)
    if (!draggedItem) { setDndErr(`항목 못 찾음: ${dragId.slice(0, 8)}`); setTimeout(() => setDndErr(''), 4000); return }
    const groupItems = items.filter(i => i.group_id === draggedItem.group_id).sort((a, b) => a.sort_order - b.sort_order)
    const dragIdx = groupItems.findIndex(i => i.id === dragId)
    const targetIdx = groupItems.findIndex(i => i.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...groupItems]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setItems(p => p.map(item => { const idx = newOrder.findIndex(i => i.id === item.id); return idx >= 0 ? { ...item, sort_order: idx } : item }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('agenda_items').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }
  async function reorderSubTask(dragId: string, targetId: string) {
    const draggedST = subTasks.find(s => s.id === dragId)
    if (!draggedST) { setDndErr(`task 못 찾음: ${dragId.slice(0, 8)}`); setTimeout(() => setDndErr(''), 4000); return }
    const groupSTs = subTasks.filter(s => s.agenda_item_id === draggedST.agenda_item_id).sort((a, b) => a.sort_order - b.sort_order)
    const dragIdx = groupSTs.findIndex(s => s.id === dragId)
    const targetIdx = groupSTs.findIndex(s => s.id === targetId)
    if (dragIdx < 0 || targetIdx < 0 || dragIdx === targetIdx) return
    const newOrder = [...groupSTs]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setSubTasks(p => p.map(st => { const idx = newOrder.findIndex(s => s.id === st.id); return idx >= 0 ? { ...st, sort_order: idx } : st }))
    for (let i = 0; i < newOrder.length; i++) {
      const { error } = await supabase.from('agenda_sub_tasks').update({ sort_order: i }).eq('id', newOrder[i].id)
      if (error) { setDndErr(`task 순서 저장 실패: ${error.message}`); setTimeout(() => setDndErr(''), 4000); return }
    }
  }

  // ── 날짜 클릭 — 기존 회의면 열고, 없으면 생성 후 열기 ──────────
  async function openOrCreateMeeting(dateStr: string) {
    setMeetingErr('')
    const existing = meetingByDate[dateStr]
    if (existing) { setSelectedMeeting(existing); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('project_meetings') as any)
      .insert({ title: `${category} ${dateStr}`, meeting_date: dateStr, category })
      .select('id, title, meeting_date').single()
    if (data) {
      const newCol = data as MeetingCol
      setCols(prev => [...prev, newCol].sort((a, b) => (a.meeting_date ?? '').localeCompare(b.meeting_date ?? '')))
      setSelectedMeeting(newCol)
      return
    }
    // insert 실패(중복 등) 시 DB에서 기존 회의 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: found } = await (supabase.from('project_meetings') as any)
      .select('id, title, meeting_date').eq('category', category).eq('meeting_date', dateStr).single()
    if (found) {
      const col = found as MeetingCol
      setCols(prev => prev.some(c => c.id === col.id) ? prev : [...prev, col].sort((a, b) => (a.meeting_date ?? '').localeCompare(b.meeting_date ?? '')))
      setSelectedMeeting(col)
      return
    }
    setMeetingErr(`회의 생성 실패: ${error?.message ?? '알 수 없는 오류'} (category=${category}, date=${dateStr})`)
  }

  // ── 이전 회의 노트 전체 계산 ─────────────────────────────────────
  const allPrevNotesForPopup = useMemo((): Record<string, PrevRecord[]> => {
    if (!selectedMeeting?.meeting_date) return {}
    const prevMeetings = [...cols]
      .filter(m => m.meeting_date && m.meeting_date < selectedMeeting.meeting_date!)
      .sort((a, b) => b.meeting_date!.localeCompare(a.meeting_date!))
    if (prevMeetings.length === 0) return {}
    const map: Record<string, PrevRecord[]> = {}
    items.forEach(item => {
      const records = prevMeetings
        .map(m => ({ date: m.meeting_date!, note: notes[nk(item.id, m.id)] ?? '', meetingId: m.id }))
        .filter(r => r.note.trim())
      if (records.length > 0) map[item.id] = records
    })
    return map
  }, [selectedMeeting, cols, items, notes])



  if (loading) return <div className="flex items-center justify-center h-32 text-sm text-gray-400 animate-pulse">불러오는 중…</div>

  // ── 전체 모드 ────────────────────────────────────────────────────
  if (isAll) {
    return (
      <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: S.bd }}>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 5, background: S.bg, padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase', borderBottom: S.bd, width: '60%' }}>안건</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: S.bg, padding: '12px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase', borderBottom: S.bd, borderLeft: S.bd, width: 90 }}>상태</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: S.bg, padding: '12px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase', borderBottom: S.bd, borderLeft: S.bd, width: 120 }}>담당자</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: S.bg, padding: '12px 12px', borderBottom: S.bd, borderLeft: S.bd, width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {[...groups].sort((a, b) => a.sort_order - b.sort_order).map(group => {
              const groupItems = items.filter(i => i.group_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
              const doneGroupItems = groupItems.filter(i => i.status === 'done')
              const visibleGroupItems = showDoneGroups.has(group.id) ? groupItems : groupItems.filter(i => i.status !== 'done')
              const isOpen = openGroups.has(group.id)
              return (
                <Fragment key={group.id}>
                  <tr
                    style={{ background: draggingGroupId === group.id ? 'rgba(0,0,0,0.04)' : dragOverGroupId === group.id ? hexToRgba(group.color, 0.22) : (CAT_BG[group.category ?? ''] ?? hexToRgba(group.color, 0.09)), opacity: draggingGroupId === group.id ? 0.4 : 1, transition: 'background .15s' }}
                    onDragOver={e => { if (!_dragItemId && !_dragGroupId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverGroupId(group.id); setDragOverItemId(null) }}
                    onDrop={e => {
                      e.preventDefault()
                      if (_dragGroupId) {
                        const gId = _dragGroupId; _dragGroupId = null
                        if (gId !== group.id) reorderGroup(gId, group.id)
                        setDraggingGroupId(null); setDragOverGroupId(null)
                      } else if (_dragItemId) {
                        const dragId = _dragItemId; _dragItemId = null
                        const di = items.find(i => i.id === dragId)
                        if (di && di.group_id !== group.id) moveItemToGroup(dragId, group.id)
                        setDraggingItemId(null); setDragOverGroupId(null); setDragOverItemId(null)
                      }
                    }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null) }}>
                    <td colSpan={4} style={{ padding: 0, borderTop: dragOverGroupId === group.id ? `2px solid ${group.color}` : '3px solid #fff', borderBottom: S.bd, borderLeft: `3px solid ${CAT_BORDER[group.category ?? ''] ?? group.color}` }}>
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-2 flex-wrap" style={{ padding: '24px 16px' }}>
                          <input autoFocus value={editGName} onChange={e => setEditGName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateGroup(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                            className="border border-gray-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-gray-400 font-semibold w-40" style={{ color: S.t1 }} />
                          <div className="flex gap-1.5">
                            {GROUP_COLORS.map(c => <div key={c} onClick={() => setEditGColor(c)} style={{ width: 13, height: 13, borderRadius: '50%', background: c, cursor: 'pointer', border: editGColor === c ? '2px solid #1A2233' : '2px solid transparent', flexShrink: 0 }} />)}
                          </div>
                          <button onClick={() => updateGroup(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1 rounded-lg">저장</button>
                          <button onClick={() => setEditingGroupId(null)} className="text-xs text-gray-400 px-2">취소</button>
                        </div>
                      ) : (
                        <div onClick={() => toggleGroup(group.id)}
                          className="flex items-center gap-2 group/grow cursor-pointer hover:brightness-95 transition-all"
                          style={{ padding: '24px 16px' }}>
                          <span
                            draggable
                            onDragStart={e => { e.stopPropagation(); _dragGroupId = group.id; _dragItemId = null; _dragSTId = null; e.dataTransfer.effectAllowed = 'move'; setDraggingGroupId(group.id) }}
                            onDragEnd={e => { e.stopPropagation(); _dragGroupId = null; setDraggingGroupId(null); setDragOverGroupId(null) }}
                            onClick={e => e.stopPropagation()}
                            title="드래그하여 범주 이동"
                            style={{ cursor: 'grab', color: '#A0AEC0', fontSize: 14, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}
                          >⠿</span>
                          <span style={{ width: 3, height: 14, borderRadius: 2, background: CAT_BORDER[group.category ?? ''] ?? group.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 9, color: S.t3, display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: S.t1 }}>{group.name}</span>
                          <span style={{ fontSize: 11, color: S.t3, background: '#E5E9F0', padding: '1px 7px', borderRadius: 99 }}>{groupItems.length}</span>
                          <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                            {MATRIX_CATS.map(c => (
                              <button key={c} onClick={() => updateGroupCat(group.id, c)}
                                className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold transition-all ${group.category === c ? CAT_CLS[c] : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>{c}</button>
                            ))}
                          </div>
                          <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover/grow:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setEditingGroupId(group.id); setEditGName(group.name); setEditGColor(group.color) }} className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors px-1">수정</button>
                            {deletingGroup === group.id ? (
                              <>
                                <span className="text-[10px] text-gray-500">삭제?</span>
                                <button onClick={() => deleteGroup(group.id)} className="text-[10px] text-red-500 font-semibold px-1.5 py-0.5 rounded">삭제</button>
                                <button onClick={() => setDeletingGroup(null)} className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded">취소</button>
                              </>
                            ) : (
                              <button onClick={() => setDeletingGroup(group.id)} className="text-[10px] text-gray-300 hover:text-red-400 transition-colors px-1">삭제</button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>

                  {isOpen && visibleGroupItems.map(item => {
                    const itemSubTasks  = subTasks.filter(st => st.agenda_item_id === item.id).sort((a, b) => a.sort_order - b.sort_order)
                    const isItemExpanded = expandedItems.has(item.id)
                    const activeColor   = item.status === 'active' ? (CAT_BORDER[group.category ?? ''] ?? group.color) : STATUS_COLOR[item.status]
                    return (
                      <Fragment key={item.id}>
                        <tr
                          style={{ borderBottom: isItemExpanded ? 'none' : S.bd, opacity: draggingItemId === item.id ? 0.35 : 1, borderTop: dragOverItemId === item.id ? `2px solid #3B82F6` : undefined }}
                          className="group/irow"
                          onDragOver={e => {
                            if (!_dragItemId) return
                            e.preventDefault(); e.dataTransfer.dropEffect = 'move'
                            const di = items.find(i => i.id === _dragItemId)
                            if (di?.group_id === group.id) { setDragOverItemId(item.id); setDragOverGroupId(null) }
                            else { setDragOverGroupId(group.id); setDragOverItemId(null) }
                          }}
                          onDrop={e => {
                            e.preventDefault()
                            const dragId = _dragItemId; _dragItemId = null
                            if (dragId && dragId !== item.id) {
                              const di = items.find(i => i.id === dragId)
                              if (di) {
                                if (di.group_id !== group.id) moveItemToGroup(dragId, group.id)
                                else reorderItem(dragId, item.id)
                              }
                            }
                            setDraggingItemId(null); setDragOverGroupId(null); setDragOverItemId(null)
                          }}
                          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverItemId(null) }}
                          onClick={() => toggleExpandedItem(item.id)}
                          onMouseEnter={() => router.prefetch(`/project/items/${item.id}`)}>
                          <td style={{ padding: '18px 16px', verticalAlign: 'middle' }}>
                            <div className="flex items-center gap-2">
                              <span
                                draggable
                                onDragStart={e => { e.stopPropagation(); _dragItemId = item.id; _dragSTId = null; e.dataTransfer.effectAllowed = 'move'; setDraggingItemId(item.id) }}
                                onDragEnd={e => { e.stopPropagation(); _dragItemId = null; setDraggingItemId(null); setDragOverGroupId(null); setDragOverItemId(null) }}
                                onClick={e => e.stopPropagation()}
                                title="드래그하여 이동"
                                style={{ cursor: 'grab', color: '#CBD5E1', fontSize: 14, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}
                              >⠿</span>
                              <button onClick={e => { e.stopPropagation(); toggleExpandedItem(item.id) }}
                                style={{ fontSize: 8, color: S.t3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, transition: 'transform .15s', transform: isItemExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, width: 10 }}>▶</button>
                              <button onClick={e => { e.stopPropagation(); cycleStatus(item) }} title={`상태: ${STATUS_LABEL[item.status]}`}
                                style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: activeColor, border: 'none', cursor: 'pointer', padding: 0 }} />
                              {editingItemId === item.id ? (
                                <input autoFocus value={editITitle} onChange={e => setEditITitle(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateItem(item.id); if (e.key === 'Escape') setEditingItemId(null) }}
                                  className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-400 font-medium flex-1 min-w-0"
                                  style={{ color: S.t1 }} />
                              ) : (
                                <span className="hover:text-blue-600 transition-colors cursor-pointer" style={{ fontSize: 14, fontWeight: 500, color: item.status === 'done' ? S.t3 : S.t1, textDecoration: item.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35 }}
                                  onClick={e => { e.stopPropagation(); router.push(`/project/items/${item.id}`) }}>
                                  {item.title}
                                </span>
                              )}
                              {itemSubTasks.length > 0 && (
                                <span style={{ fontSize: 10, color: S.t3, background: '#E5E9F0', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>
                                  {itemSubTasks.filter(st => st.status !== 'done').length}/{itemSubTasks.length}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ borderLeft: S.bd, padding: '18px 12px', fontSize: 12, color: S.t2, verticalAlign: 'middle' }}>
                            {STATUS_LABEL[item.status]}
                          </td>
                          <td style={{ borderLeft: S.bd, padding: '10px 12px', fontSize: 12, verticalAlign: 'middle', width: 120 }} onClick={e => e.stopPropagation()}>
                            <select
                              value={item.assignee_id ?? ''}
                              onChange={e => updateItemAssignee(item.id, e.target.value || null)}
                              className="text-xs bg-transparent border-none outline-none cursor-pointer w-full"
                              style={{ color: item.assignee_id ? S.t2 : S.t3 }}
                            >
                              <option value="">-</option>
                              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </td>
                          <td style={{ borderLeft: S.bd, padding: '18px 12px', verticalAlign: 'middle', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 justify-center opacity-0 group-hover/irow:opacity-100 transition-all">
                              {editingItemId !== item.id && (
                                <button onClick={() => { setEditingItemId(item.id); setEditITitle(item.title) }} className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                              )}
                              {deletingItem === item.id ? (
                                <>
                                  <button onClick={() => deleteItem(item.id)} className="text-[10px] text-red-500 hover:text-red-700 font-semibold">삭제</button>
                                  <button onClick={() => setDeletingItem(null)} className="text-[10px] text-gray-400">취소</button>
                                </>
                              ) : (
                                <button onClick={() => setDeletingItem(item.id)} className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isItemExpanded && itemSubTasks.map(st => (
                          <tr key={st.id}
                            style={{ borderBottom: S.bd, background: '#FAFBFD', opacity: draggingSTId === st.id ? 0.35 : 1, borderTop: dragOverSTId === st.id ? `2px solid #3B82F6` : undefined }}
                            className="group/strow hover:bg-blue-50/30"
                            onDragOver={e => { if (!_dragSTId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSTId(st.id) }}
                            onDrop={e => { e.preventDefault(); const dragId = _dragSTId; _dragSTId = null; if (dragId && dragId !== st.id) reorderSubTask(dragId, st.id); setDraggingSTId(null); setDragOverSTId(null) }}
                            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSTId(null) }}
                            onClick={() => router.push(`/project/items/${item.id}?focus=${st.id}`)}
                            onMouseEnter={() => router.prefetch(`/project/items/${item.id}`)}>
                            <td style={{ padding: '14px 16px 14px 36px', verticalAlign: 'middle' }}>
                              <div className="flex items-center gap-2">
                                <span
                                  draggable
                                  onDragStart={e => { e.stopPropagation(); _dragSTId = st.id; _dragItemId = null; e.dataTransfer.effectAllowed = 'move'; setDraggingSTId(st.id) }}
                                  onDragEnd={e => { e.stopPropagation(); _dragSTId = null; setDraggingSTId(null); setDragOverSTId(null) }}
                                  onClick={e => e.stopPropagation()}
                                  title="드래그하여 이동"
                                  style={{ cursor: 'grab', color: '#CBD5E1', fontSize: 12, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}
                                >⠿</span>
                                <button onClick={e => { e.stopPropagation(); cycleSubTaskStatus(st) }} title={`클릭하여 완료 처리 (현재: ${STATUS_LABEL[st.status]})`}
                                  style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${st.status === 'done' ? '#10B981' : st.status === 'hold' ? '#F59E0B' : (CAT_BORDER[group.category ?? ''] ?? group.color)}`, background: st.status === 'done' ? '#10B981' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                                  {st.status === 'done' && <span style={{ color: 'white', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                                  {st.status === 'hold' && <span style={{ color: '#F59E0B', fontSize: 9, lineHeight: 1 }}>−</span>}
                                </button>
                                {editingSTId === st.id ? (
                                  <input autoFocus value={editSTTitle} onChange={e => setEditSTTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) updateSubTask(st.id); if (e.key === 'Escape') setEditingSTId(null) }}
                                    className="border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-gray-400 flex-1 min-w-0"
                                    style={{ color: S.t2 }} onClick={e => e.stopPropagation()} />
                                ) : (
                                  <span style={{ fontSize: 13, color: st.status === 'done' ? S.t3 : S.t2, textDecoration: st.status === 'done' ? 'line-through' : 'none', lineHeight: 1.35 }}>
                                    {st.title}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ borderLeft: S.bd }} />
                            <td style={{ borderLeft: S.bd }} />
                            <td style={{ borderLeft: S.bd, padding: '8px 12px', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5 justify-end">
                                {/* 날짜 뱃지 (설정된 경우 항상 표시) */}
                                {st.target_date && (
                                  <button
                                    onClick={() => updateSubTaskDate(st.id, null)}
                                    style={{
                                      fontSize: 9, padding: '2px 7px', borderRadius: 999, fontWeight: 600, flexShrink: 0, border: 'none', cursor: 'pointer',
                                      background: st.target_date === sched.today ? '#FEE2E2' : st.target_date === sched.tomorrow ? '#FEF3C7' : '#EFF6FF',
                                      color: st.target_date === sched.today ? '#DC2626' : st.target_date === sched.tomorrow ? '#92400E' : '#1D4ED8',
                                    }}>
                                    {stDateLabel(st.target_date, sched.today, sched.tomorrow)} ×
                                  </button>
                                )}
                                {/* 날짜 칩 (미설정일 때 hover 시 표시) */}
                                {!st.target_date && (
                                  <div className="opacity-0 pointer-events-none group-hover/strow:opacity-100 group-hover/strow:pointer-events-auto transition-all flex items-center gap-0.5">
                                    <button onClick={() => updateSubTaskDate(st.id, sched.today)} className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 font-medium">오늘</button>
                                    <button onClick={() => updateSubTaskDate(st.id, sched.tomorrow)} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 font-medium">내일</button>
                                    <button onClick={() => updateSubTaskDate(st.id, sched.friday)} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 font-medium">금주</button>
                                    <label className="relative cursor-pointer text-gray-400 hover:text-gray-600 text-[10px] px-0.5" title="특정일 선택">
                                      📅<input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onChange={e => e.target.value && updateSubTaskDate(st.id, e.target.value)} />
                                    </label>
                                  </div>
                                )}
                                {/* 수정/삭제 (hover) */}
                                <div className="opacity-0 group-hover/strow:opacity-100 transition-all flex items-center gap-1.5">
                                  {editingSTId !== st.id && (
                                    <button onClick={() => { setEditingSTId(st.id); setEditSTTitle(st.title) }} className="text-[10px] text-gray-400 hover:text-gray-700">수정</button>
                                  )}
                                  {deletingST === st.id ? (
                                    <>
                                      <button onClick={() => deleteSubTask(st.id)} className="text-[10px] text-red-500 font-semibold">삭제</button>
                                      <button onClick={() => setDeletingST(null)} className="text-[10px] text-gray-400">취소</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setDeletingST(st.id)} className="text-[10px] text-gray-300 hover:text-red-400">삭제</button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {isItemExpanded && (
                          <tr key={`add-st-${item.id}`} style={{ borderBottom: S.bd, background: '#FAFBFD' }}>
                            <td colSpan={4} style={{ padding: 0 }}>
                              {addingSubTask === item.id ? (
                                <div className="flex items-center gap-2 px-10 py-2">
                                  <input autoFocus value={newSTTitle} onChange={e => setNewSTTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSubTask(item.id); if (e.key === 'Escape') { setAddingSubTask(null); setNewSTTitle('') } }}
                                    placeholder="하위 태스크 입력 후 Enter"
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                                  <button onClick={() => addSubTask(item.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                                  <button onClick={() => { setAddingSubTask(null); setNewSTTitle('') }} className="text-xs text-gray-400 px-2">취소</button>
                                </div>
                              ) : (
                                <div onClick={() => setAddingSubTask(item.id)}
                                  className="flex items-center gap-1 px-10 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                                  ＋ 하위 태스크
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}

                  {isOpen && doneGroupItems.length > 0 && (
                    <tr key={`done-toggle-${group.id}`} style={{ borderBottom: S.bd }}>
                      <td colSpan={4} style={{ padding: 0 }}>
                        <button onClick={() => toggleShowDone(group.id)}
                          className="w-full flex items-center gap-1.5 px-5 py-2 text-xs text-gray-400 hover:text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                          <span style={{ fontSize: 8, transform: showDoneGroups.has(group.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                          완료 {doneGroupItems.length}건
                        </button>
                      </td>
                    </tr>
                  )}

                  {isOpen && (
                    <tr key={`add-i-${group.id}`} style={{ borderBottom: S.bd }}>
                      <td colSpan={4} style={{ padding: 0 }}>
                        {addingItem === group.id ? (
                          <div className="flex items-center gap-2 px-5 py-2.5">
                            <input autoFocus value={newITitle} onChange={e => setNewITitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(group.id); if (e.key === 'Escape') { setAddingItem(null); setNewITitle('') } }}
                              placeholder="안건명 입력 후 Enter"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                            <button onClick={() => addItem(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                            <button onClick={() => { setAddingItem(null); setNewITitle('') }} className="text-xs text-gray-400 px-2 py-1">취소</button>
                          </div>
                        ) : (
                          <div onClick={() => { setAddingItem(group.id); setNewITitle('') }}
                            className="flex items-center gap-1 px-5 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                            ＋ {group.name}에 안건 추가
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            <tr>
              <td colSpan={4} style={{ background: S.bgRow, padding: 0 }}>
                {addingGroup ? (
                  <div className="flex items-center gap-2 px-5 py-3 flex-wrap">
                    <input autoFocus value={newGName} onChange={e => setNewGName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGName('') } }}
                      placeholder="범주명 입력 후 Enter"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400 w-40" />
                    {isAll && (
                      <div className="flex gap-1">
                        {MATRIX_CATS.map(c => (
                          <button key={c} type="button" onClick={() => setNewGCat(c)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all ${newGCat === c ? CAT_CLS[c] : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>{c}</button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      {GROUP_COLORS.map(c => <div key={c} onClick={() => setNewGColor(c)} style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: newGColor === c ? '2px solid #1A2233' : '2px solid transparent', flexShrink: 0 }} />)}
                    </div>
                    <button onClick={addGroup} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                    <button onClick={() => { setAddingGroup(false); setNewGName('') }} className="text-xs text-gray-400 px-2 py-1">취소</button>
                  </div>
                ) : (
                  <div onClick={openAddGroup}
                    className="flex items-center gap-1 px-5 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100/60 cursor-pointer transition-colors">
                    ＋ 범주 추가
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // ── 달력/월별 공통 상수 ───────────────────────────────────────────
  const catColor  = CAT_BORDER[category] ?? '#1B3A6B'
  const catDot    = CAT_DOT[category]    ?? '#1B3A6B'
  const minTotalW = W_LEFT + dateRange.length * W_CAL + 56
  const W_MONTH_COL = 28
  const DAYS_KO = ['일','월','화','수','목','금','토']

  // ── 뷰 토글 헤더 (달력/월별 공통) ────────────────────────────────
  const viewToggle = (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 pb-3">
      <div className="flex items-center gap-0.5 bg-gray-100/80 rounded-lg p-0.5">
        <button onClick={() => setViewMode('calendar')}
          className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${viewMode === 'calendar' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>달력</button>
        <button onClick={() => setViewMode('monthly')}
          className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${viewMode === 'monthly' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>월별 플랜</button>
      </div>
      {viewMode === 'monthly' && (
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMonthNav(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="text-gray-400 hover:text-gray-700 text-base px-1 leading-none">‹</button>
          <span className="text-sm font-semibold text-gray-700 w-20 text-center">{monthNav.year}년 {monthNav.month + 1}월</span>
          <button onClick={() => setMonthNav(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="text-gray-400 hover:text-gray-700 text-base px-1 leading-none">›</button>
        </div>
      )}
    </div>
  )

  // ── 월별 Gantt 모드 ────────────────────────────────────────────────
  if (!isAll && viewMode === 'monthly') {
    return (
      <>
        {viewToggle}
        <div className="flex-1 min-h-0 overflow-auto">
          <table style={{ borderCollapse: 'collapse', minWidth: W_LEFT + monthDays.length * W_MONTH_COL }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 5, background: S.bg, borderBottom: S.bdL, borderRight: S.bdL, width: W_LEFT, minWidth: W_LEFT, padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  안건
                </th>
                {monthDays.map(day => {
                  const dt = new Date(day + 'T00:00:00')
                  const dow = dt.getDay()
                  const isToday = day === todayStr
                  const isSun = dow === 0, isSat = dow === 6
                  return (
                    <th key={day} style={{ position: 'sticky', top: 0, zIndex: 3, background: isToday ? '#EFF6FF' : 'white', borderBottom: isToday ? `2px solid ${catColor}` : S.bd, borderLeft: S.bd, width: W_MONTH_COL, minWidth: W_MONTH_COL, padding: 0 }}>
                      <div style={{ padding: '6px 2px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: isToday ? 700 : 400, color: isToday ? catColor : isSun ? '#EF4444' : isSat ? '#3B82F6' : S.t3, lineHeight: 1.2 }}>{dt.getDate()}</div>
                        <div style={{ fontSize: 8, color: isToday ? catColor : isSun ? '#FCA5A5' : isSat ? '#93C5FD' : '#C8D4E3', marginTop: 1 }}>{DAYS_KO[dow]}</div>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {[...groups].sort((a, b) => a.sort_order - b.sort_order).map(group => {
                const groupItems = items.filter(i => i.group_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
                const doneGroupItems = groupItems.filter(i => i.status === 'done')
                const visibleItems = showDoneGroups.has(group.id) ? groupItems : groupItems.filter(i => i.status !== 'done')
                const isOpen = openGroups.has(group.id)
                const gColor = CAT_BORDER[group.category ?? ''] ?? group.color
                const gBg = CAT_BG[group.category ?? ''] ?? hexToRgba(group.color, 0.09)
                return (
                  <Fragment key={group.id}>
                    {/* 범주 헤더 행 */}
                    <tr>
                      <td onClick={() => toggleGroup(group.id)} style={{ position: 'sticky', left: 0, zIndex: 2, background: gBg, borderBottom: S.bd, borderRight: S.bdL, padding: '7px 16px', cursor: 'pointer' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 8, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s', color: gColor }}>▶</span>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: gColor, letterSpacing: '.03em' }}>{group.name}</span>
                        </div>
                      </td>
                      {monthDays.map(day => (
                        <td key={day} style={{ borderLeft: S.bd, borderBottom: S.bd, background: day === todayStr ? hexToRgba(catColor, 0.05) : gBg }} />
                      ))}
                    </tr>
                    {/* 안건 + 세부task 행 */}
                    {isOpen && visibleItems.map(item => {
                      const itemSTs = subTasks.filter(st => st.agenda_item_id === item.id && st.status !== 'done' && st.target_date)
                      const stDates = itemSTs.map(st => st.target_date!).sort()
                      const minDate = stDates[0] ?? null
                      const maxDate = stDates[stDates.length - 1] ?? null
                      const isDone = item.status === 'done'
                      return (
                        <Fragment key={item.id}>
                          {/* 안건 행 */}
                          <tr style={{ borderBottom: S.bd, opacity: isDone ? 0.45 : 1 }} className="hover:bg-gray-50/40">
                            <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'white', borderRight: S.bdL, padding: '9px 16px', cursor: 'pointer' }}
                              onClick={() => router.push(`/project/items/${item.id}`)}>
                              <div className="flex items-center gap-2">
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.status === 'done' ? '#10B981' : item.status === 'hold' ? '#F59E0B' : gColor, flexShrink: 0, display: 'inline-block' }} />
                                <span style={{ fontSize: 13, fontWeight: 500, color: isDone ? S.t3 : S.t1, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.3 }}>{item.title}</span>
                                {itemSTs.length > 0 && <span style={{ fontSize: 10, color: S.t3 }}>· {itemSTs.length}건</span>}
                              </div>
                            </td>
                            {monthDays.map(day => {
                              if (!minDate || !maxDate) return <td key={day} style={{ borderLeft: S.bd, background: day === todayStr ? hexToRgba(catColor, 0.04) : 'transparent' }} />
                              const inRange = day >= minDate && day <= maxDate
                              const isFirst = day === minDate, isLast = day === maxDate, isSingle = minDate === maxDate
                              return (
                                <td key={day} style={{ borderLeft: S.bd, padding: '0 1px', verticalAlign: 'middle', background: day === todayStr ? hexToRgba(catColor, 0.04) : 'transparent' }}>
                                  {inRange && <div style={{ height: 5, background: gColor, opacity: 0.4, borderRadius: isSingle ? 3 : isFirst ? '3px 0 0 3px' : isLast ? '0 3px 3px 0' : 0 }} />}
                                </td>
                              )
                            })}
                          </tr>
                          {/* 세부task 행 */}
                          {subTasks.filter(st => st.agenda_item_id === item.id && st.status !== 'done').map(st => (
                            <tr key={st.id} style={{ borderBottom: S.bd, background: '#FAFBFD' }} className="group/mst hover:bg-blue-50/20">
                              <td style={{ position: 'sticky', left: 0, zIndex: 2, background: '#FAFBFD', borderRight: S.bdL, padding: '6px 16px 6px 32px', cursor: 'pointer' }}
                                onClick={() => router.push(`/project/items/${item.id}?focus=${st.id}`)}>
                                <div className="flex items-center gap-2">
                                  <button onClick={e => { e.stopPropagation(); cycleSubTaskStatus(st) }}
                                    title={`완료 처리 (현재: ${STATUS_LABEL[st.status]})`}
                                    style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${st.status === 'hold' ? '#F59E0B' : gColor}`, background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {st.status === 'hold' && <span style={{ color: '#F59E0B', fontSize: 8, lineHeight: 1 }}>−</span>}
                                  </button>
                                  <span style={{ fontSize: 12, color: S.t2, lineHeight: 1.3 }}>{st.title}</span>
                                  {st.target_date && <span style={{ fontSize: 9, color: S.t3, marginLeft: 2 }}>{stDateLabel(st.target_date, sched.today, sched.tomorrow)}</span>}
                                </div>
                              </td>
                              {monthDays.map(day => {
                                const isTarget = st.target_date === day
                                return (
                                  <td key={day} style={{ borderLeft: S.bd, verticalAlign: 'middle', textAlign: 'center', padding: 0, background: day === todayStr ? hexToRgba(catColor, 0.04) : 'transparent' }}>
                                    {isTarget && <div style={{ width: 10, height: 10, borderRadius: 3, background: st.status === 'hold' ? '#F59E0B' : gColor, margin: '0 auto' }} />}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                    {/* 완료 안건 토글 */}
                    {isOpen && doneGroupItems.length > 0 && (
                      <tr style={{ borderBottom: S.bd }}>
                        <td colSpan={monthDays.length + 1} style={{ padding: 0 }}>
                          <button onClick={() => toggleShowDone(group.id)}
                            style={{ position: 'sticky', left: 0, width: 'max-content' }}
                            className="flex items-center gap-1.5 px-5 py-2 text-xs text-gray-400 hover:text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                            <span style={{ fontSize: 8, transform: showDoneGroups.has(group.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                            완료 {doneGroupItems.length}건
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {dndErr && <div style={{ position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: '#DC2626', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 12, zIndex: 9999 }} onClick={() => setDndErr('')}>⠿ {dndErr}</div>}
      </>
    )
  }

  // ── 달력 칸반 모드 ────────────────────────────────────────────────
  return (
    <>
      {viewToggle}
      <div className="flex-1 min-h-0 overflow-auto w-full" ref={containerRef}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: minTotalW }}>
          <thead>
            <tr>
              {/* 왼쪽 고정 헤더 */}
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 5, background: S.bg, borderBottom: S.bdL, borderRight: S.bdL, width: W_LEFT, minWidth: W_LEFT, padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: S.t3, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                안건
                <span style={{ marginLeft: 8, fontSize: 10, color: S.t3, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>빈 날짜 클릭 → 회의 생성</span>
              </th>

              {/* 날짜 헤더 */}
              {dateRange.map(date => {
                const meeting    = meetingByDate[date]
                const dayLabel   = formatDayLabel(date)
                const isSun      = dayLabel === '일', isSat = dayLabel === '토'
                const isToday    = date === todayStr
                const hasMeeting = !!meeting
                return (
                  <th key={date}
                    ref={isToday ? (el => { todayColRef.current = el }) as React.Ref<HTMLTableCellElement> : undefined}
                    onClick={() => openOrCreateMeeting(date)}
                    style={{
                      position: 'sticky', top: 0, zIndex: 3,
                      background: isToday ? hexToRgba(catColor, 0.1) : S.bg,
                      borderBottom: isToday ? `2px solid ${catColor}` : hasMeeting ? S.bdL : S.bd,
                      borderLeft: S.bd, width: W_CAL, minWidth: W_CAL,
                      cursor: 'pointer',
                    }}
                    className="hover:bg-blue-50/50 transition-colors">
                    <div style={{ padding: '8px 2px', textAlign: 'center' }}>
                      <div style={{ fontSize: hasMeeting ? 12 : 11, fontWeight: hasMeeting ? 700 : 400, color: isToday ? catColor : isSun ? '#EF4444' : isSat ? '#3B82F6' : hasMeeting ? S.t1 : S.t3, lineHeight: 1.2 }}>
                        {formatDateShort(date)}
                      </div>
                      <div style={{ fontSize: 9, color: isToday ? catColor : isSun ? '#FCA5A5' : isSat ? '#93C5FD' : S.t3, marginTop: 1 }}>{dayLabel}</div>
                      {hasMeeting && <div style={{ width: 4, height: 2, borderRadius: 1, background: catColor, margin: '2px auto 0' }} />}
                    </div>
                  </th>
                )
              })}

              {/* + 날짜 (수동 추가) */}
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: S.bg, borderBottom: S.bd, borderLeft: S.bd, width: 56, minWidth: 56 }} />
            </tr>
          </thead>

          <tbody>
            {[...groups].sort((a, b) => a.sort_order - b.sort_order).map(group => {
              const groupItems = items.filter(i => i.group_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
              const doneGroupItems = groupItems.filter(i => i.status === 'done')
              const visibleGroupItems = showDoneGroups.has(group.id) ? groupItems : groupItems.filter(i => i.status !== 'done')
              const isOpen     = openGroups.has(group.id)
              return (
                <Fragment key={group.id}>
                  {/* 범주 헤더 — 타이틀 td(sticky) + 날짜 td 개별 분리 */}
                  <tr>
                    {/* 타이틀 td: 클릭 → 그룹 토글 */}
                    <td onClick={() => toggleGroup(group.id)}
                      style={{
                        position: 'sticky', left: 0, zIndex: 2,
                        background: hexToRgba(group.color, 0.10),
                        borderTop: '3px solid #fff', borderBottom: S.bd,
                        borderLeft: `3px solid ${group.color}`,
                        width: W_LEFT, minWidth: W_LEFT,
                        cursor: 'pointer', padding: '14px 16px',
                        verticalAlign: 'middle',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, color: S.t3, display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }}>▼</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: S.t1, flexShrink: 0 }}>{group.name}</span>
                        {group.category && CAT_BORDER[group.category] && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: CAT_BORDER[group.category], background: CAT_BG[group.category], border: `1px solid ${CAT_BORDER[group.category]}30`, padding: '1px 7px', borderRadius: 99, flexShrink: 0 }}>
                            {group.category}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: S.t3, background: '#E5E9F0', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>{groupItems.length}</span>
                      </div>
                    </td>
                    {/* 날짜 td: 클릭 → 회의 팝업 열기 */}
                    {dateRange.map(date => (
                      <td key={date}
                        onClick={() => openOrCreateMeeting(date)}
                        style={{
                          background: hexToRgba(group.color, 0.06),
                          borderTop: '3px solid #fff', borderBottom: S.bd, borderLeft: S.bd,
                          width: W_CAL, minWidth: W_CAL,
                          cursor: 'pointer',
                        }}
                        className="hover:bg-blue-50/40 transition-colors">
                      </td>
                    ))}
                    <td style={{ background: hexToRgba(group.color, 0.06), borderTop: '3px solid #fff', borderBottom: S.bd, borderLeft: S.bd }}></td>
                  </tr>

                  {/* 안건 행들 */}
                  {isOpen && visibleGroupItems.map(item => {
                    const itemSubTasks    = subTasks.filter(st => st.agenda_item_id === item.id).sort((a, b) => a.sort_order - b.sort_order)
                    const isCalExpanded   = expandedCalItems.has(item.id)
                    return (
                      <Fragment key={item.id}>
                        <tr style={{ borderBottom: S.bd }} className="hover:bg-gray-50/30 group/irow">
                          {/* 왼쪽 흰박스: 전체 영역 클릭 → 서브태스크 토글, 제목 클릭 → 상세 이동 */}
                          <td
                            onClick={() => itemSubTasks.length > 0 && toggleExpandedCalItem(item.id)}
                            style={{ position: 'sticky', left: 0, zIndex: 2, background: S.bg, borderRight: S.bdL, width: W_LEFT, minWidth: W_LEFT, verticalAlign: 'middle', cursor: itemSubTasks.length > 0 ? 'pointer' : 'default' }}>
                            <div style={{ padding: '16px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* 토글 화살표 — 시각 지시자만, 버튼 아님 */}
                              <span style={{ fontSize: 9, color: S.t3, lineHeight: 1, transition: 'transform .15s', transform: isCalExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, width: 10, display: 'inline-block', opacity: itemSubTasks.length > 0 ? 1 : 0 }}>▶</span>
                              {/* 상태 점 — 시각 지시자만 */}
                              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: item.status === 'active' ? catDot : STATUS_COLOR[item.status], display: 'inline-block' }} />
                              {/* 제목 클릭 → 업무 상세 이동 (td 토글과 독립) */}
                              <span
                                onClick={e => { e.stopPropagation(); router.push(`/project/items/${item.id}`) }}
                                style={{ fontSize: 13, fontWeight: 500, color: item.status === 'done' ? S.t3 : '#1B3A6B', lineHeight: 1.35, flex: 1, minWidth: 0, textDecoration: item.status === 'done' ? 'line-through' : 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textUnderlineOffset: 3 }}>
                                {item.title}
                              </span>
                              {itemSubTasks.length > 0 && (
                                <span style={{ fontSize: 9, color: S.t3, background: '#E5E9F0', padding: '1px 5px', borderRadius: 99, flexShrink: 0 }}>
                                  {itemSubTasks.filter(st => st.status !== 'done').length}/{itemSubTasks.length}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 날짜 셀들 */}
                          {dateRange.map(date => {
                            const meeting    = meetingByDate[date]
                            const note       = meeting ? (notes[nk(item.id, meeting.id)] ?? '') : ''
                            const hasContent = note.trim().length > 0
                            const isToday    = date === todayStr
                            const hasMeeting = !!meeting
                            const hasSubtaskOnDate = !isCalExpanded && itemSubTasks.some(st => st.target_date === date && st.status !== 'done')
                            return (
                              <td key={date}
                                onClick={() => openOrCreateMeeting(date)}
                                style={{
                                  borderLeft: S.bd,
                                  background: isToday ? hexToRgba(catColor, 0.05) : 'transparent',
                                  width: W_CAL, minWidth: W_CAL,
                                  textAlign: 'center', verticalAlign: 'middle',
                                  cursor: 'pointer', padding: '12px 2px',
                                  position: 'relative',
                                }}
                                className="hover:bg-blue-50/50 transition-colors group/datecell">
                                {hasContent ? (
                                  <div title={note.slice(0, 60)}
                                    style={{ width: 9, height: 9, borderRadius: '50%', background: catDot, margin: '0 auto', boxShadow: `0 0 0 2px ${hexToRgba(catDot, 0.2)}` }} />
                                ) : hasSubtaskOnDate ? (
                                  <div title="세부업무 예정일"
                                    style={{ width: 7, height: 7, borderRadius: 2, background: hexToRgba(catDot, 0.55), margin: '0 auto' }} />
                                ) : hasMeeting ? (
                                  <div style={{ width: 5, height: 5, borderRadius: '50%', border: `1.5px solid ${hexToRgba(catDot, 0.4)}`, margin: '0 auto' }} />
                                ) : (
                                  <div className="opacity-0 group-hover/datecell:opacity-100 transition-opacity"
                                    style={{ width: 5, height: 5, borderRadius: '50%', border: `1px dashed ${hexToRgba(catDot, 0.35)}`, margin: '0 auto' }} />
                                )}
                              </td>
                            )
                          })}
                          <td style={{ borderLeft: S.bd }}></td>
                        </tr>

                        {/* 서브태스크 토글 행 */}
                        {isCalExpanded && itemSubTasks.map(st => (
                          <tr key={st.id} style={{ borderBottom: S.bd, background: '#FAFBFD' }} className="group/stcal">
                            <td style={{ position: 'sticky', left: 0, zIndex: 2, background: '#FAFBFD', borderRight: S.bdL, width: W_LEFT, minWidth: W_LEFT, padding: '12px 16px 12px 36px', verticalAlign: 'middle' }}>
                              <div className="flex items-center gap-2">
                                <button onClick={() => cycleSubTaskStatus(st)} title={`클릭하여 완료 처리 (현재: ${STATUS_LABEL[st.status]})`}
                                  style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${st.status === 'done' ? '#10B981' : st.status === 'hold' ? '#F59E0B' : hexToRgba(catDot, 0.7)}`, background: st.status === 'done' ? '#10B981' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                                  {st.status === 'done' && <span style={{ color: 'white', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                                  {st.status === 'hold' && <span style={{ color: '#F59E0B', fontSize: 9, lineHeight: 1 }}>−</span>}
                                </button>
                                <span style={{ fontSize: 12, color: st.status === 'done' ? S.t3 : S.t2, textDecoration: st.status === 'done' ? 'line-through' : 'none', lineHeight: 1.3, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                  onClick={() => router.push(`/project/items/${item.id}?focus=${st.id}`)}>
                                  {st.title}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold flex-shrink-0 ${st.status === 'active' ? 'text-blue-600 border-blue-200 bg-blue-50' : st.status === 'hold' ? 'text-amber-600 border-amber-200 bg-amber-50' : 'text-gray-400 border-gray-200 bg-gray-100'}`}>
                                  {STATUS_LABEL[st.status]}
                                </span>
                              </div>
                            </td>
                            {dateRange.map(date => {
                              const mtg = meetingByDate[date]
                              const stNote = mtg ? (stNotes[nk(st.id, mtg.id)] ?? '') : ''
                              const hasSTContent = stNote.trim().length > 0
                              const isToday = date === todayStr
                              const isTargetDate = st.target_date === date
                              return (
                                <td key={date}
                                  onClick={() => openOrCreateMeeting(date)}
                                  style={{
                                    borderLeft: S.bd,
                                    background: isToday ? hexToRgba(catColor, 0.03) : 'transparent',
                                    width: W_CAL, minWidth: W_CAL,
                                    cursor: 'pointer', padding: '8px 2px',
                                    textAlign: 'center', verticalAlign: 'middle',
                                  }}
                                  className="hover:bg-blue-50/30 transition-colors group/stdatecell">
                                  {hasSTContent ? (
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: catDot, margin: '0 auto', opacity: 0.7 }} />
                                  ) : isTargetDate ? (
                                    <div title={`목표일: ${st.title}`}
                                      style={{ width: 8, height: 8, borderRadius: 2, background: catDot, margin: '0 auto', opacity: 0.8 }} />
                                  ) : mtg ? (
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', border: `1.5px solid ${hexToRgba(catDot, 0.3)}`, margin: '0 auto' }} />
                                  ) : (
                                    <div className="opacity-0 group-hover/stdatecell:opacity-100 transition-opacity"
                                      style={{ width: 4, height: 4, borderRadius: '50%', border: `1px dashed ${hexToRgba(catDot, 0.3)}`, margin: '0 auto' }} />
                                  )}
                                </td>
                              )
                            })}
                            <td style={{ borderLeft: S.bd }}></td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}

                  {/* 완료 안건 토글 */}
                  {isOpen && doneGroupItems.length > 0 && (
                    <tr key={`done-toggle-cal-${group.id}`} style={{ borderBottom: S.bd }}>
                      <td colSpan={dateRange.length + 2} style={{ padding: 0 }}>
                        <button onClick={() => toggleShowDone(group.id)}
                          style={{ position: 'sticky', left: 0, width: 'max-content' }}
                          className="flex items-center gap-1.5 px-5 py-2 text-xs text-gray-400 hover:text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                          <span style={{ fontSize: 8, transform: showDoneGroups.has(group.id) ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                          완료 {doneGroupItems.length}건
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* 안건 추가 */}
                  {isOpen && (
                    <tr key={`add-i-${group.id}`} style={{ borderBottom: S.bd }}>
                      <td colSpan={dateRange.length + 2} style={{ padding: 0 }}>
                        {addingItem === group.id ? (
                          <div className="flex items-center gap-2 px-5 py-2.5" style={{ position: 'sticky', left: 0, width: 'max-content' }}>
                            <input autoFocus value={newITitle} onChange={e => setNewITitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addItem(group.id); if (e.key === 'Escape') { setAddingItem(null); setNewITitle('') } }}
                              placeholder="안건명 입력 후 Enter"
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400 w-48" />
                            <button onClick={() => addItem(group.id)} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                            <button onClick={() => { setAddingItem(null); setNewITitle('') }} className="text-xs text-gray-400 px-2 py-1">취소</button>
                          </div>
                        ) : (
                          <div onClick={() => { setAddingItem(group.id); setNewITitle('') }}
                            style={{ position: 'sticky', left: 0, width: 'max-content' }}
                            className="flex items-center gap-1 px-5 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                            ＋ {group.name}에 안건 추가
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            <tr>
              <td colSpan={dateRange.length + 2} style={{ background: S.bgRow, padding: 0 }}>
                {addingGroup ? (
                  <div className="flex items-center gap-2 px-5 py-3 flex-wrap" style={{ position: 'sticky', left: 0, width: 'max-content' }}>
                    <input autoFocus value={newGName} onChange={e => setNewGName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGName('') } }}
                      placeholder="범주명 입력 후 Enter"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400 w-40" />
                    <div className="flex gap-1.5">
                      {GROUP_COLORS.map(c => <div key={c} onClick={() => setNewGColor(c)} style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: newGColor === c ? '2px solid #1A2233' : '2px solid transparent', flexShrink: 0 }} />)}
                    </div>
                    <button onClick={addGroup} className="text-xs bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-3 py-1.5 rounded-lg">추가</button>
                    <button onClick={() => { setAddingGroup(false); setNewGName('') }} className="text-xs text-gray-400 px-2 py-1">취소</button>
                  </div>
                ) : (
                  <div onClick={openAddGroup}
                    style={{ position: 'sticky', left: 0, width: 'max-content' }}
                    className="flex items-center gap-1 px-5 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100/60 cursor-pointer transition-colors">
                    ＋ 범주 추가
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {groups.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: S.t3 }}>
            전체 탭에서 {category} 범주를 추가하면 나타납니다.
          </div>
        )}
      </div>

      {/* 회의 생성 에러 토스트 */}
      {meetingErr && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1A2233', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 12, zIndex: 9999, maxWidth: '90vw', wordBreak: 'break-all' }}
          onClick={() => setMeetingErr('')}>
          ⚠ {meetingErr}
        </div>
      )}

      {/* 드래그앤드롭 에러 토스트 */}
      {dndErr && (
        <div style={{ position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: '#DC2626', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 12, zIndex: 9999, maxWidth: '90vw', wordBreak: 'break-all' }}
          onClick={() => setDndErr('')}>
          ⠿ {dndErr}
        </div>
      )}

      {/* 회의 팝업 */}
      {selectedMeeting && (
        <MeetingPopup
          meeting={selectedMeeting}
          allMeetings={cols}
          items={items}
          groups={groups}
          subTasks={subTasks}
          notes={notes}
          stNotes={stNotes}
          allPrevNotes={allPrevNotesForPopup}
          onNote={handleNote}
          onSTNote={handleSTNote}
          onClose={() => setSelectedMeeting(null)}
          onSelectMeeting={m => setSelectedMeeting(m)}
          catColor={catColor}
          category={category}
        />
      )}
    </>
  )
}
