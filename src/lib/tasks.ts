import { createClient } from '@/lib/supabase/client'
import type { Task, Member, Note, Attachment } from '@/types'
import { format, isToday, isThisWeek, addDays, parseISO } from 'date-fns'

export type ParsedTags = {
  mid_date?: string
  end_date?: string
  start_date?: string
  assignee_name?: string
  type?: import('@/types').TaskType
  status?: import('@/types').TaskStatus
  part?: import('@/types').Part
}

// 날짜 태그 파싱: [중간공유 MM/DD], [최종보고 MM/DD], [시작 MM/DD]
// 확장 태그: [담당자 이름], [유형 기획|개선|운영], [상태 진행필요|진행중|완료], [파트 코어|비즈]
export function parseDateTags(content: string): { mid_date?: string; end_date?: string; start_date?: string } {
  const year = new Date().getFullYear()
  const result: { mid_date?: string; end_date?: string; start_date?: string } = {}

  const midMatch = content.match(/\[중간공유\s+(\d{1,2})\/(\d{1,2})\]/)
  if (midMatch) result.mid_date = `${year}-${midMatch[1].padStart(2, '0')}-${midMatch[2].padStart(2, '0')}`

  const endMatch = content.match(/\[최종보고\s+(\d{1,2})\/(\d{1,2})\]/)
  if (endMatch) result.end_date = `${year}-${endMatch[1].padStart(2, '0')}-${endMatch[2].padStart(2, '0')}`

  const startMatch = content.match(/\[시작\s+(\d{1,2})\/(\d{1,2})\]/)
  if (startMatch) result.start_date = `${year}-${startMatch[1].padStart(2, '0')}-${startMatch[2].padStart(2, '0')}`

  return result
}

export function parseTags(content: string): ParsedTags {
  const year = new Date().getFullYear()
  const result: ParsedTags = {}

  const midMatch = content.match(/\[중간공유\s+(\d{1,2})\/(\d{1,2})\]/)
  if (midMatch) result.mid_date = `${year}-${midMatch[1].padStart(2, '0')}-${midMatch[2].padStart(2, '0')}`

  const endMatch = content.match(/\[최종보고\s+(\d{1,2})\/(\d{1,2})\]/)
  if (endMatch) result.end_date = `${year}-${endMatch[1].padStart(2, '0')}-${endMatch[2].padStart(2, '0')}`

  const startMatch = content.match(/\[시작\s+(\d{1,2})\/(\d{1,2})\]/)
  if (startMatch) result.start_date = `${year}-${startMatch[1].padStart(2, '0')}-${startMatch[2].padStart(2, '0')}`

  const assigneeMatch = content.match(/\[담당자\s+([^\]]+)\]/)
  if (assigneeMatch) result.assignee_name = assigneeMatch[1].trim()

  const typeMatch = content.match(/\[유형\s+(기획|개선|운영)\]/)
  if (typeMatch) result.type = typeMatch[1] as import('@/types').TaskType

  const statusMatch = content.match(/\[상태\s+(진행필요|진행중|완료)\]/)
  if (statusMatch) result.status = statusMatch[1] as import('@/types').TaskStatus

  const partMatch = content.match(/\[파트\s+(코어|비즈)\]/)
  if (partMatch) result.part = partMatch[1] as import('@/types').Part

  return result
}

export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = parseISO(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function isMidDateSoon(task: Task): boolean {
  if (!task.mid_date) return false
  const d = daysUntil(task.mid_date)
  return d >= 0 && d <= 7
}

export function isEndDateSoon(task: Task): boolean {
  if (!task.end_date) return false
  const d = daysUntil(task.end_date)
  return d >= 0 && d <= 7
}

export function isAnyDateSoon(task: Task): boolean {
  return isMidDateSoon(task) || isEndDateSoon(task)
}

export function nearestEventDays(task: Task): number {
  const candidates: number[] = []
  if (task.mid_date) { const d = daysUntil(task.mid_date); if (d >= 0 && d <= 7) candidates.push(d) }
  if (task.end_date) { const d = daysUntil(task.end_date); if (d >= 0 && d <= 7) candidates.push(d) }
  return candidates.length > 0 ? Math.min(...candidates) : Infinity
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = parseISO(dateStr)
    return format(d, 'M/d')
  } catch {
    return ''
  }
}

export async function fetchAllTasks(): Promise<Task[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('tasks')
    .select('*, members(id, name, part)')
    .order('created_at', { ascending: false })
  return (data ?? []) as Task[]
}

export async function fetchMembers(): Promise<Member[]> {
  const supabase = createClient()
  const { data } = await supabase.from('members').select('*').order('part').order('name')
  return (data ?? []) as Member[]
}
