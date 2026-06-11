export type Part = '코어' | '비즈' | '팀장'
export type TaskType = '기획' | '개선' | '운영'
export type TaskStatus = '진행필요' | '진행중' | '완료'
export type AttachmentType = '파일' | '링크'
export type AchievementCategory = '성과' | '개선' | '리소스' | '수명' | '기타'

export interface Member {
  id: string
  name: string
  part: Part
  created_at: string
}

export interface Task {
  id: string
  title: string
  part: Part
  type: TaskType
  assignee_id: string | null
  status: TaskStatus
  start_date: string | null
  mid_date: string | null
  end_date: string | null
  work_months: string[]
  achievement_category: AchievementCategory | null
  created_at: string
  updated_at: string
  members?: Member
}

export interface Note {
  id: string
  task_id: string
  content: string
  created_at: string
}

export interface Attachment {
  id: string
  task_id: string
  name: string
  type: AttachmentType
  url: string
  created_at: string
}

export type MemoTag = '업무관련' | '회의관련' | '아이디어' | '공지'

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
}

export interface Meeting {
  id: string
  title: string
  meeting_date: string | null
  notes: NoteEntry[]
  created_at: string
  updated_at: string
}

export interface LearningResource {
  id: string
  title: string
  source: string
  notes: NoteEntry[]
  created_at: string
  updated_at: string
}

export interface OneOnOne {
  id: string
  member_id: string
  session_date: string | null
  notes: NoteEntry[]
  created_at: string
  updated_at: string
}
