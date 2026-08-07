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
  role?: string
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
  agenda_item_id?: string | null
  meeting_id?: string | null
  sub_task_id?: string | null
  annual_goal_item_id?: string | null
  annual_goal_task_id?: string | null
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
  summary?: string   // 핵심문구 1문장 요약
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
  roadmap_period?: string | null
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
  roadmap_period?: string | null
  roadmap_rank?: number | null
}

export interface AgendaUpdate {
  id: string
  agenda_item_id: string
  project_meeting_id: string
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
  mid_date?: string | null
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

// ── 연간목표 ────────────────────────────────────────────────────

export type AnnualGoalCategory =
  | '1. 인재 확보' | '2. 검증과 정렬' | '3. 유지와 보상' | '4. 지속가능성' | '5. 확장 기반'
export type AnnualGoalStatus = 'active' | 'hold' | 'done'
export type MaturityLevel = 1 | 2 | 3
export type Track = 'A' | 'B' | 'C'
export type ImportanceLevel = '상' | '중' | '하'
export type AgreedPriority = '1순위' | '2순위' | '유예'

export interface AnnualGoalItem {
  id: string
  category: AnnualGoalCategory
  title: string
  color: string
  sort_order: number
  is_open: boolean
  roadmap_start_date?: string | null
  roadmap_end_date?: string | null
  target_deadline?: string | null
  created_at: string
  updated_at: string
}

export interface AnnualGoalTask {
  id: string
  item_id: string
  title: string
  status: AnnualGoalStatus
  description?: string | null
  maturity_level?: MaturityLevel | null
  maturity_rationale?: string | null
  track?: Track | null
  hr_importance?: ImportanceLevel | null
  hr_urgency?: ImportanceLevel | null
  suggested_period?: string | null
  hrm_function?: string | null
  notes?: string | null
  exec_importance?: ImportanceLevel | null
  agreed_priority?: AgreedPriority | null
  roadmap_start_date?: string | null
  roadmap_end_date?: string | null
  roadmap_rank?: number | null
  assignee_id?: string | null
  mid_date?: string | null
  due_date?: string | null
  target_date?: string | null
  sort_order: number
  hidden: boolean
  created_at: string
  updated_at: string
  annual_goal_items?: AnnualGoalItem
}

export interface AnnualGoalTaskNote {
  id: string
  task_id: string
  title?: string | null
  content: string
  created_at: string
  edited_at?: string | null
}

export interface AnnualGoalCategoryLabel {
  category_key: string
  name: string
  updated_at: string
}
