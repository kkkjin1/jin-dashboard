export type Part = '코어' | '비즈'
export type TaskType = '기획' | '개선' | '운영'
export type TaskStatus = '진행필요' | '진행중' | '완료'
export type AttachmentType = '파일' | '링크'

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
