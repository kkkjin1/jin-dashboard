export type Part = string
export type TaskType = '기획' | '개선' | '운영'
export type TaskStatus = '진행필요' | '진행중' | '완료'
export type ScheduleTag = 'today' | 'tomorrow' | 'this_week'
export type AttachmentType = '파일' | '링크'
export type AchievementCategory = '성과' | '개선' | '리소스' | '수명' | '기타'
export type FeedbackType = '긍정' | '부정' | '요청'

export interface Member {
  id: string
  name: string
  part: Part
  archived_at?: string | null
  created_at: string
}

export interface Task {
  id: string
  title: string
  short_name?: string | null
  part: Part
  type: TaskType
  assignee_id: string | null
  status: TaskStatus
  start_date: string | null
  mid_date: string | null
  end_date: string | null
  work_months: string[]
  achievement_category: AchievementCategory | null
  retrospective?: { good: string; bad: string; improvement: string } | null
  created_at: string
  updated_at: string
  members?: Member
}

export interface TaskTodo {
  id: string
  task_id: string
  title: string
  schedule_tag?: ScheduleTag | null
  target_date?: string | null
  done: boolean
  done_at?: string | null
  sort_order: number
  created_at: string
  tasks?: { id: string; title: string; short_name?: string | null } | null
}

export interface Note {
  id: string
  task_id: string
  title?: string | null
  content: string
  created_at: string
  edited_at?: string | null
}

export interface Attachment {
  id: string
  task_id: string | null
  meeting_id?: string | null
  sub_task_id?: string | null
  name: string
  type: AttachmentType
  url: string
  created_at: string
}

export type MemoTag = '업무관련' | '회의관련' | '아이디어' | '공지' | '완료'

export interface QuickMemo {
  id: string
  title: string
  content: string
  tag: MemoTag
  created_at: string
}

export interface NoteEntry {
  title: string
  content: string
  created_at: string
  edited_at?: string
  is_prep?: boolean  // 홈탭 사전 메모에서 연동된 항목
}

export interface Meeting {
  id: string
  title: string
  meeting_date: string | null
  category?: string | null
  notes: NoteEntry[]
  created_at: string
  updated_at: string
}

export interface LearningResource {
  id: string
  title: string
  source: string
  tags?: string[]
  media_type?: string | null
  notes: NoteEntry[]
  created_at: string
  updated_at: string
}

export interface OneOnOne {
  id: string
  member_id: string
  session_date: string | null
  title?: string | null
  notes: NoteEntry[]
  next_appointment?: string | null
  next_appointment_date?: string | null
  created_at: string
  updated_at: string
}

export interface MyFeedback {
  id: string
  month: string
  content: string
  feedback_type: FeedbackType | null
  feedback_date?: string | null
  from_member?: string | null
  created_at: string
}

// ── 안건 매트릭스 ────────────────────────────────────────────────

export type AgendaItemType = 'do' | 'fb' | 'rp' | 'ag'
export type AgendaItemStatus = 'active' | 'hold' | 'done'

export interface AgendaGroup {
  id: string
  category: string          // meetings.category 와 동일 (코어, 비즈 등)
  name: string              // 평가/보상, 노무 등
  color: string
  sort_order: number
  is_open: boolean
  created_at: string
}

export interface AgendaItem {
  id: string
  group_id: string
  title: string
  description?: string | null
  item_type: AgendaItemType
  status: AgendaItemStatus
  linked_task_id: string | null
  assignee_id?: string | null
  sort_order: number
  hidden: boolean
  created_at: string
  updated_at: string
  agenda_groups?: AgendaGroup
}

export interface AgendaUpdate {
  id: string
  agenda_item_id: string
  meeting_id: string
  note: string
  created_at: string
  updated_at: string
}

export interface AgendaSubTask {
  id: string
  agenda_item_id: string
  title: string
  status: AgendaItemStatus
  sort_order: number
  assignee_id?: string | null
  due_date?: string | null
  target_date?: string | null
  created_at: string
}

export interface SubTaskNote {
  id: string
  sub_task_id: string
  title?: string | null
  content: string
  created_at: string
  edited_at?: string | null
}
