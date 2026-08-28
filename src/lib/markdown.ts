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
