import { format } from 'date-fns'

export interface NoteItem {
  title: string
  content: string
  created_at: string
}

export interface AttachmentItem {
  name: string
  url: string
}

export interface TaskMdData {
  title: string
  status?: string
  assignee?: string
  part?: string
  type?: string
  start_date?: string | null
  mid_date?: string | null
  end_date?: string | null
  notes: NoteItem[]
  attachments: AttachmentItem[]
}

export interface MeetingMdData {
  title: string
  meeting_date?: string | null
  notes: NoteItem[]
}

export interface LearningMdData {
  title: string
  source?: string
  notes: NoteItem[]
}

function formatDateMd(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd')
  } catch {
    return dateStr
  }
}

function renderNotes(notes: NoteItem[]): string {
  if (notes.length === 0) return '_기록된 노트가 없습니다._'
  return notes
    .map(n => `### ${n.title}\n${n.content}`)
    .join('\n\n---\n\n')
}

export function generateTaskMd(data: TaskMdData): string {
  const lines: string[] = []
  lines.push(`# ${data.title}`)
  lines.push('')
  if (data.status) lines.push(`**상태**: ${data.status}`)
  if (data.assignee) lines.push(`**담당자**: ${data.assignee}`)
  if (data.part || data.type) lines.push(`**파트**: ${[data.part, data.type].filter(Boolean).join(' / ')}`)
  if (data.start_date) lines.push(`**시작일**: ${formatDateMd(data.start_date)}`)
  if (data.mid_date) lines.push(`**중간공유**: ${formatDateMd(data.mid_date)}`)
  if (data.end_date) lines.push(`**최종보고**: ${formatDateMd(data.end_date)}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 맥락 / 노트')
  lines.push('')
  lines.push(renderNotes(data.notes))
  if (data.attachments.length > 0) {
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('## 첨부파일')
    lines.push('')
    data.attachments.forEach(a => lines.push(`- [${a.name}](${a.url})`))
  }
  return lines.join('\n')
}

export function generateMeetingMd(data: MeetingMdData): string {
  const lines: string[] = []
  lines.push(`# ${data.title}`)
  lines.push('')
  if (data.meeting_date) lines.push(`**회의 날짜**: ${formatDateMd(data.meeting_date)}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 회의 내용')
  lines.push('')
  lines.push(renderNotes(data.notes))
  return lines.join('\n')
}

export function generateLearningMd(data: LearningMdData): string {
  const lines: string[] = []
  lines.push(`# ${data.title}`)
  lines.push('')
  if (data.source) lines.push(`**출처**: ${data.source}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 내용')
  lines.push('')
  lines.push(renderNotes(data.notes))
  return lines.join('\n')
}

export interface MeetingContextItem {
  title: string
  meeting_date?: string | null
  category?: string | null
  notes: NoteItem[]
}

export interface TaskContextItem {
  title: string
  status?: string
  part?: string
  type?: string
  assignee?: string
  start_date?: string | null
  mid_date?: string | null
  end_date?: string | null
  retrospective?: { good: string; bad: string; improvement: string } | null
  notes: NoteItem[]
  todos: { content: string; done: boolean; target_date?: string | null }[]
}

export function generateMeetingsContextMd(items: MeetingContextItem[]): string {
  const now = format(new Date(), 'yyyy-MM-dd')
  const lines: string[] = []
  lines.push(`# 회의록 컨텍스트 — ${now} (${items.length}건)`)
  lines.push('')
  lines.push('> NotebookLM / GPT 맥락 이해용 내보내기. 요약 없이 전문 포함.')
  lines.push('')
  items.forEach((m, i) => {
    if (i > 0) lines.push('\n---\n')
    lines.push(`# ${m.title || '(제목 없음)'}`)
    if (m.meeting_date) lines.push(`**날짜**: ${formatDateMd(m.meeting_date)}`)
    if (m.category) lines.push(`**구분**: ${m.category}`)
    lines.push('')
    if (m.notes.length === 0) {
      lines.push('_기록된 내용 없음_')
    } else {
      m.notes.forEach(n => {
        lines.push(`## ${n.title || '노트'}`)
        lines.push('')
        lines.push(n.content)
        lines.push('')
      })
    }
  })
  return lines.join('\n')
}

export function generateTasksContextMd(items: TaskContextItem[]): string {
  const now = format(new Date(), 'yyyy-MM-dd')
  const lines: string[] = []
  lines.push(`# 업무 컨텍스트 — ${now} (${items.length}건)`)
  lines.push('')
  lines.push('> NotebookLM / GPT 맥락 이해용 내보내기. 요약 없이 전문 포함.')
  lines.push('')
  items.forEach((t, i) => {
    if (i > 0) lines.push('\n---\n')
    lines.push(`# ${t.title || '(제목 없음)'}`)
    lines.push('')
    if (t.status) lines.push(`**상태**: ${t.status}`)
    if (t.part || t.type) lines.push(`**파트/유형**: ${[t.part, t.type].filter(Boolean).join(' / ')}`)
    if (t.assignee) lines.push(`**담당자**: ${t.assignee}`)
    if (t.start_date) lines.push(`**시작일**: ${formatDateMd(t.start_date)}`)
    if (t.mid_date) lines.push(`**중간공유**: ${formatDateMd(t.mid_date)}`)
    if (t.end_date) lines.push(`**최종보고**: ${formatDateMd(t.end_date)}`)
    lines.push('')
    if (t.todos.length > 0) {
      lines.push('## 할 일 목록')
      lines.push('')
      t.todos.forEach(td => {
        const check = td.done ? '[x]' : '[ ]'
        const date = td.target_date ? ` (${td.target_date})` : ''
        lines.push(`- ${check} ${td.content}${date}`)
      })
      lines.push('')
    }
    if (t.notes.length > 0) {
      lines.push('## 노트')
      lines.push('')
      t.notes.forEach(n => {
        lines.push(`### ${n.title || '노트'}`)
        lines.push('')
        lines.push(n.content)
        lines.push('')
      })
    }
    if (t.retrospective) {
      lines.push('## 회고')
      lines.push('')
      if (t.retrospective.good) lines.push(`**잘한 점**: ${t.retrospective.good}`)
      if (t.retrospective.bad) lines.push(`**아쉬운 점**: ${t.retrospective.bad}`)
      if (t.retrospective.improvement) lines.push(`**개선점**: ${t.retrospective.improvement}`)
      lines.push('')
    }
  })
  return lines.join('\n')
}

export function downloadMd(content: string, title: string): void {
  const dateStr = format(new Date(), 'yyMMdd')
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_')
  const filename = `${safeTitle}-${dateStr}.md`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
