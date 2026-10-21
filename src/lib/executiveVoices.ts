// 경영진 의견 아카이브 — 회의록·안건 본문·세부task 메모 HTML에서 Alt+3/Alt+4로 표시한 줄(data-voice)만
// 모아 의사결정 탭에 보여준다. 원본 HTML은 읽기만 하고 별도 테이블에 복사하지 않는다.
// HTML 파싱(DOMParser)을 쓰므로 클라이언트에서만 호출한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { VOICE_TARGETS, type VoiceTarget } from '@/lib/tiptapExtensions'

export type VoiceSourceType = 'meeting' | 'agenda' | 'subtask'
// spoken=발언일(회의 날짜) · recorded=기록일(메모 작성일) · marked=표시일(Alt+3/4 누른 날) · unknown=날짜 미상
export type VoiceDateKind = 'spoken' | 'recorded' | 'marked' | 'unknown'

export const SOURCE_LABEL: Record<VoiceSourceType, string> = { meeting: '회의록', agenda: '안건', subtask: '세부 Task' }
export const DATE_KIND_LABEL: Record<VoiceDateKind, string> = { spoken: '발언일', recorded: '기록일', marked: '표시일', unknown: '날짜 미상' }

// 경영진 회의록 = meetings.category '경영진' (회의록 범주 고정 태그, 의사결정 탭이 원래 쓰던 기준)
export const EXEC_MEETING_CATEGORY = '경영진'

export interface VoiceSource {
  type: VoiceSourceType
  rowId: string            // meeting_notes / agenda_items / sub_task_notes 의 id
  title: string            // 회의 제목 / 안건 제목 / 세부task 제목
  context: string | null   // 회의: 노트 제목 · 안건: 그룹명(또는 연동 회의) · 세부task: 상위 안건 제목
  date: string | null      // YYYY-MM-DD
  dateKind: VoiceDateKind
  href: string
  relatedAgendas: string[] // 회의록 ↔ 안건 연결(meeting_agenda_links)
}

export interface VoiceOccurrence {
  voice: VoiceTarget
  voiceId: string | null
  text: string
  source: VoiceSource
}

export interface VoiceEntry {
  key: string
  voice: VoiceTarget
  voiceId: string | null
  text: string
  date: string | null
  dateKind: VoiceDateKind
  source: VoiceSource       // 대표 출처(날짜 근거가 가장 확실한 쪽)
  others: VoiceSource[]     // 같은 발언 ID로 묶인 다른 위치
  conflict: boolean         // 같은 ID인데 발언자·원문이 다른 기록이 있음 → 자동 병합하지 않음
}

export interface VoiceRawData {
  meetingNotes: { id: string; meeting_id: string; title: string | null; content: string | null }[]
  meetings: Record<string, { id: string; title: string; meeting_date: string | null; category: string | null }>
  meetingAgendas: Record<string, string[]>
  agendaItems: { id: string; title: string; description: string | null; groupName: string | null }[]
  subTaskNotes: { id: string; sub_task_id: string; title: string | null; content: string | null; created_at: string }[]
  subTasks: Record<string, { id: string; title: string; agenda_item_id: string | null; agendaTitle: string | null }>
  errors: string[]
}

const VOICE_PATTERN = '%data-voice=%'

// 표시가 있는 행만 좁혀 가져온다(이미지가 든 큰 HTML 전체를 받지 않도록). 세 출처는 병렬, 이름 정보는 id로 한 번 더.
export async function fetchVoiceRawData(sb: SupabaseClient): Promise<VoiceRawData> {
  const errors: string[] = []
  const [mn, ai, sn] = await Promise.all([
    sb.from('meeting_notes').select('id, meeting_id, title, content').ilike('content', VOICE_PATTERN),
    sb.from('agenda_items').select('id, title, description, agenda_groups(name)').ilike('description', VOICE_PATTERN),
    sb.from('sub_task_notes').select('id, sub_task_id, title, content, created_at').ilike('content', VOICE_PATTERN),
  ])
  if (mn.error) errors.push(`회의록: ${mn.error.message}`)
  if (ai.error) errors.push(`안건: ${ai.error.message}`)
  if (sn.error) errors.push(`세부 Task 메모: ${sn.error.message}`)
  const meetingNotes = (mn.data ?? []) as VoiceRawData['meetingNotes']
  const subTaskNotes = (sn.data ?? []) as VoiceRawData['subTaskNotes']
  const meetingIds = [...new Set(meetingNotes.map(n => n.meeting_id))]
  const subTaskIds = [...new Set(subTaskNotes.map(n => n.sub_task_id))]

  const [mt, links, st] = await Promise.all([
    meetingIds.length ? sb.from('meetings').select('id, title, meeting_date, category').in('id', meetingIds) : Promise.resolve({ data: [], error: null }),
    meetingIds.length ? sb.from('meeting_agenda_links').select('meeting_id, agenda_items(title)').in('meeting_id', meetingIds) : Promise.resolve({ data: [], error: null }),
    subTaskIds.length ? sb.from('agenda_sub_tasks').select('id, title, agenda_item_id, agenda_items(id, title)').in('id', subTaskIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (mt.error) errors.push(`회의 정보: ${mt.error.message}`)
  if (st.error) errors.push(`세부 Task 정보: ${st.error.message}`)

  const meetings: VoiceRawData['meetings'] = {}
  for (const m of (mt.data ?? []) as VoiceRawData['meetings'][string][]) meetings[m.id] = m
  const meetingAgendas: Record<string, string[]> = {}
  for (const l of (links.data ?? []) as { meeting_id: string; agenda_items: { title: string } | { title: string }[] | null }[]) {
    const items = Array.isArray(l.agenda_items) ? l.agenda_items : l.agenda_items ? [l.agenda_items] : []
    for (const it of items) (meetingAgendas[l.meeting_id] ??= []).push(it.title)
  }
  const subTasks: VoiceRawData['subTasks'] = {}
  for (const s of (st.data ?? []) as { id: string; title: string; agenda_item_id: string | null; agenda_items: { id: string; title: string } | { id: string; title: string }[] | null }[]) {
    const parent = Array.isArray(s.agenda_items) ? s.agenda_items[0] : s.agenda_items
    subTasks[s.id] = { id: s.id, title: s.title, agenda_item_id: s.agenda_item_id, agendaTitle: parent?.title ?? null }
  }
  const agendaItems = ((ai.data ?? []) as { id: string; title: string; description: string | null; agenda_groups: { name: string } | { name: string }[] | null }[])
    .map(a => ({ id: a.id, title: a.title, description: a.description, groupName: (Array.isArray(a.agenda_groups) ? a.agenda_groups[0]?.name : a.agenda_groups?.name) ?? null }))

  return { meetingNotes, meetings, meetingAgendas, agendaItems, subTaskNotes, subTasks, errors }
}

// ── HTML → 읽기 좋은 일반 텍스트 (MD 붙여넣기용). 문단·줄바꿈·목록·토글·표를 최대한 살린다 ──────────────

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SUMMARY', 'DETAILS', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'PRE', 'HR', 'SECTION'])

function inlineText(node: Node): string {
  let s = ''
  node.childNodes.forEach(c => {
    if (c.nodeType === Node.TEXT_NODE) s += (c.nodeValue ?? '').replace(/\s*\n\s*/g, ' ')
    else if (c instanceof HTMLElement) {
      if (c.tagName === 'BR') s += '\n'
      else if (c.tagName === 'IMG') s += '[이미지]'
      else if (!BLOCK_TAGS.has(c.tagName)) s += inlineText(c)
    }
  })
  return s
}

function blockLines(el: Node, lines: string[]): void {
  let buf = ''
  const flush = () => {
    const t = buf.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim()
    if (t) lines.push(...t.split('\n'))
    buf = ''
  }
  el.childNodes.forEach(c => {
    if (c.nodeType === Node.TEXT_NODE) { buf += (c.nodeValue ?? '').replace(/\s*\n\s*/g, ' '); return }
    if (!(c instanceof HTMLElement)) return
    if (!BLOCK_TAGS.has(c.tagName)) { buf += c.tagName === 'BR' ? '\n' : c.tagName === 'IMG' ? '[이미지]' : inlineText(c); return }
    flush()
    const tag = c.tagName
    if (tag === 'UL' || tag === 'OL') {
      let n = Number(c.getAttribute('start') ?? 1) || 1
      Array.from(c.children).forEach(li => {
        if (li.tagName !== 'LI') return
        const sub: string[] = []
        blockLines(li, sub)
        const prefix = tag === 'OL' ? `${n++}. ` : '- '
        lines.push(prefix + (sub[0] ?? ''))
        for (const l of sub.slice(1)) lines.push('   ' + l)
      })
    } else if (tag === 'HR') {
      lines.push('---')
    } else if (/^H[1-6]$/.test(tag)) {
      const t = inlineText(c).trim()
      if (t) lines.push(`**${t}**`)
    } else if (tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY') {
      c.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr').forEach(tr => {
        lines.push(Array.from(tr.children).map(td => inlineText(td).trim()).join(' | '))
      })
    } else if (tag === 'DETAILS') {
      const summary = c.querySelector(':scope > summary')
      lines.push('▸ ' + (summary ? inlineText(summary).trim() : ''))
      const sub: string[] = []
      c.childNodes.forEach(cc => { if (cc !== summary) { const tmp = document.createElement('div'); tmp.appendChild(cc.cloneNode(true)); blockLines(tmp, sub) } })
      for (const l of sub) lines.push('   ' + l)
    } else if (tag === 'P' && !inlineText(c).trim()) {
      lines.push('')
    } else {
      blockLines(c, lines)
    }
  })
  flush()
}

export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  if (!html.trimStart().startsWith('<')) return html.trim()   // 구버전 순수 텍스트
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lines: string[] = []
  blockLines(doc.body, lines)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── 추출 ────────────────────────────────────────────────────────────────────

function isVoiceTarget(v: unknown): v is VoiceTarget {
  return VOICE_TARGETS.includes(v as VoiceTarget)
}

function validDate(v: string | null | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

function localDate(iso: string): string | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 회의록 → 안건 연동(meetings/[id] addNoteToItem)으로 복사된 블록의 머리줄:
// <p><strong>[회의 연동] 노트제목 — 회의제목 (YYYY-MM-DD)</strong></p>  — 그 아래 의견은 그 회의 날짜가 발언일
const LINK_HEADER_RE = /^\[회의 연동\]\s*(.*?)\s+—\s+(.*?)(?:\s+\((\d{4}-\d{2}-\d{2})\))?\s*$/

function linkedMeetingOf(el: Element, body: HTMLElement): { meetingTitle: string; date: string | null } | null {
  let top: Element | null = el
  while (top && top.parentElement !== body) top = top.parentElement
  for (let p = top?.previousElementSibling ?? null; p; p = p.previousElementSibling) {
    if (p.tagName === 'HR') return null
    if (p.tagName === 'P') {
      const m = (p.textContent ?? '').trim().match(LINK_HEADER_RE)
      if (m) return { meetingTitle: m[2], date: m[3] ?? null }
    }
  }
  return null
}

function voiceElements(html: string): { el: Element; body: HTMLElement }[] {
  if (!html || !html.includes('data-voice')) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.body.querySelectorAll('[data-voice]'))
    .filter(el => isVoiceTarget(el.getAttribute('data-voice')))
    .map(el => ({ el, body: doc.body }))
}

function voiceText(el: Element): string {
  return inlineText(el).replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim()
}

function q(params: Record<string, string | null | undefined>): string {
  const s = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')
  return s ? `?${s}` : ''
}

export function extractVoiceOccurrences(raw: VoiceRawData): VoiceOccurrence[] {
  const out: VoiceOccurrence[] = []
  for (const n of raw.meetingNotes) {
    const m = raw.meetings[n.meeting_id]
    for (const { el } of voiceElements(n.content ?? '')) {
      const voiceId = el.getAttribute('data-voice-id'), voiceAt = validDate(el.getAttribute('data-voice-at'))
      const md = validDate(m?.meeting_date)
      out.push({
        voice: el.getAttribute('data-voice') as VoiceTarget, voiceId, text: voiceText(el),
        source: {
          type: 'meeting', rowId: n.id, title: m?.title ?? '(회의 정보 없음)', context: n.title || null,
          date: md ?? voiceAt, dateKind: md ? 'spoken' : voiceAt ? 'marked' : 'unknown',
          href: `/meetings/${n.meeting_id}${q({ note: n.id, voice: voiceId })}`,
          relatedAgendas: raw.meetingAgendas[n.meeting_id] ?? [],
        },
      })
    }
  }
  for (const a of raw.agendaItems) {
    for (const { el, body } of voiceElements(a.description ?? '')) {
      const voiceId = el.getAttribute('data-voice-id'), voiceAt = validDate(el.getAttribute('data-voice-at'))
      const linked = linkedMeetingOf(el, body)
      const spoken = validDate(linked?.date)
      out.push({
        voice: el.getAttribute('data-voice') as VoiceTarget, voiceId, text: voiceText(el),
        source: {
          type: 'agenda', rowId: a.id, title: a.title, context: linked ? `회의 연동: ${linked.meetingTitle}` : a.groupName,
          date: spoken ?? voiceAt, dateKind: spoken ? 'spoken' : voiceAt ? 'marked' : 'unknown',
          href: `/project/items/${a.id}${q({ voice: voiceId })}`,
          relatedAgendas: [],
        },
      })
    }
  }
  for (const n of raw.subTaskNotes) {
    const st = raw.subTasks[n.sub_task_id]
    const recorded = localDate(n.created_at)
    for (const { el } of voiceElements(n.content ?? '')) {
      const voiceId = el.getAttribute('data-voice-id')
      out.push({
        voice: el.getAttribute('data-voice') as VoiceTarget, voiceId, text: voiceText(el),
        source: {
          type: 'subtask', rowId: n.id, title: st?.title ?? '(세부 Task 정보 없음)', context: st?.agendaTitle ?? null,
          date: recorded, dateKind: recorded ? 'recorded' : 'unknown',
          href: st?.agenda_item_id
            ? `/project/items/${st.agenda_item_id}${q({ focus: n.sub_task_id, note: n.id, voice: voiceId })}`
            : `/subtasks/${n.sub_task_id}${q({ note: n.id, voice: voiceId })}`,
          relatedAgendas: [],
        },
      })
    }
  }
  return out
}

// ── 병합 — 같은 발언 ID + 같은 발언자 + 같은 원문만 하나로. 문장이 같아도 ID가 다르면 별개 ───────────────

const normText = (t: string) => t.replace(/\s+/g, ' ').trim()

function sourceRank(s: VoiceSource): number {
  if (s.dateKind === 'spoken') return s.type === 'meeting' ? 0 : 1
  return { recorded: 2, marked: 3, unknown: 4, spoken: 0 }[s.dateKind]
}

export function mergeVoiceOccurrences(occ: VoiceOccurrence[]): VoiceEntry[] {
  const entries: VoiceEntry[] = []
  const byId = new Map<string, VoiceOccurrence[]>()
  occ.forEach((o, i) => {
    if (!o.voiceId) {
      entries.push({ key: `noid:${o.source.type}:${o.source.rowId}:${i}`, voice: o.voice, voiceId: null, text: o.text,
        date: o.source.date, dateKind: o.source.dateKind, source: o.source, others: [], conflict: false })
      return
    }
    byId.set(o.voiceId, [...(byId.get(o.voiceId) ?? []), o])
  })
  for (const [id, list] of byId) {
    const clusters = new Map<string, VoiceOccurrence[]>()
    for (const o of list) {
      const k = `${o.voice}\u0000${normText(o.text)}`
      clusters.set(k, [...(clusters.get(k) ?? []), o])
    }
    const conflict = clusters.size > 1
    let ci = 0
    for (const group of clusters.values()) {
      const sorted = [...group].sort((x, y) => sourceRank(x.source) - sourceRank(y.source) || (x.source.date ?? '9999').localeCompare(y.source.date ?? '9999'))
      const [first, ...rest] = sorted
      // 같은 위치(같은 행)에 같은 발언이 두 번 있으면(문서 안 복사) 출처는 한 번만
      const seen = new Set([`${first.source.type}:${first.source.rowId}`])
      const others = rest.map(o => o.source).filter(s => { const k = `${s.type}:${s.rowId}`; if (seen.has(k)) return false; seen.add(k); return true })
      entries.push({ key: `id:${id}:${ci++}`, voice: first.voice, voiceId: id, text: first.text,
        date: first.source.date, dateKind: first.source.dateKind, source: first.source, others, conflict })
    }
  }
  // 날짜 내림차순, 날짜 미상은 맨 아래
  return entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.date ? 0 : 1) - (b.date ? 0 : 1))
}

// ── 원본 이동 — 도착 화면에서 의견 줄로 스크롤 후 잠깐 강조 ─────────────────────────────────────────
// 에디터(ProseMirror) DOM에 클래스를 달면 변경으로 읽혀 자동저장이 돌 수 있어, 화면 위에 겹쳐 그리고 지운다.

export function showVoiceNotice(message: string): void {
  const el = document.createElement('div')
  el.textContent = message
  el.setAttribute('role', 'status')
  Object.assign(el.style, {
    position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: '9999',
    padding: '9px 16px', borderRadius: '10px', fontSize: '12.5px', maxWidth: '90vw',
    background: 'var(--surface-elevated)', color: 'var(--text-primary)',
    border: '1px solid rgba(var(--ink-rgb),0.12)', boxShadow: 'var(--shadow-modal)',
    transition: 'opacity 400ms ease', pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0' }, 3200)
  setTimeout(() => el.remove(), 3700)
}

export function revealVoiceBlock(voiceId: string, { timeoutMs = 4000 } = {}): Promise<boolean> {
  return new Promise(resolve => {
    const started = Date.now()
    const tick = () => {
      const target = document.querySelector(`[data-voice-id="${CSS.escape(voiceId)}"]`)
      if (!target) {
        if (Date.now() - started < timeoutMs) { setTimeout(tick, 150); return }
        showVoiceNotice('원본에서 해당 의견 줄을 찾지 못했습니다 — 삭제되었거나 표시가 해제되었을 수 있습니다.')
        resolve(false)
        return
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 부드러운 스크롤이 멈춘 뒤(위치가 두 번 연속 같을 때, 최대 1.5초) 위치를 재서 겹쳐 그린다
      let last = NaN, stable = 0
      const waitStill = (left: number) => {
        const top = target.getBoundingClientRect().top
        stable = Math.abs(top - last) < 1 ? stable + 1 : 0
        last = top
        if (stable >= 2 || left <= 0) draw(); else setTimeout(() => waitStill(left - 80), 80)
      }
      const draw = () => {
        const r = target.getBoundingClientRect()
        const ov = document.createElement('div')
        ov.setAttribute('aria-hidden', 'true')
        Object.assign(ov.style, {
          position: 'fixed', left: `${r.left - 6}px`, top: `${r.top - 3}px`, width: `${r.width + 12}px`, height: `${r.height + 6}px`,
          borderRadius: '6px', background: 'rgba(var(--accent-tint-rgb),0.16)', boxShadow: '0 0 0 2px rgba(var(--accent-tint-rgb),0.55)',
          pointerEvents: 'none', zIndex: '9998', transition: 'opacity 900ms ease',
        } satisfies Partial<CSSStyleDeclaration>)
        document.body.appendChild(ov)
        setTimeout(() => { ov.style.opacity = '0' }, 1500)
        setTimeout(() => ov.remove(), 2500)
        resolve(true)
      }
      setTimeout(() => waitStill(1500), 120)
    }
    tick()
  })
}
