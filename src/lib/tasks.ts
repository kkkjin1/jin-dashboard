import { createClient } from '@/lib/supabase/client'
import type { Task, Member, Note, Attachment } from '@/types'
import { format, isToday, isThisWeek, addDays, parseISO } from 'date-fns'

// 날짜 태그 파싱: [중간공유 MM/DD], [최종보고 MM/DD], [시작 MM/DD]
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

export function isMidDateSoon(task: Task): boolean {
  if (!task.mid_date) return false
  const mid = parseISO(task.mid_date)
  const today = new Date()
  const diff = (mid.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 3
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
