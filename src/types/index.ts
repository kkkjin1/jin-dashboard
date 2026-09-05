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

// 메모 카테고리 — /memos 페이지에서 사용자가 자유롭게 추가/삭제할 수 있어 고정 리터럴 유니언이 아닌 문자열
export type MemoTag = string

export interface QuickMemo {
  id: string
  title: string
  content: string
  tag: MemoTag[]
  created_at: string
}

export interface ManualAchievement {
  id: string
  group_id: string
  title: string
  achievement_type: AchievementType | null
  content: string
  month: string // 'YYYY-MM'
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

export interface OneOnOneTemplate {
  id: string
  title: string
  content: string
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
  category: string          // meetings.category 와 동일 (팀명 또는 고정 태그)
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

export type AchievementType = '기획' | '운영' | '개선'

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
  achievement_type?: AchievementType | null
  tags?: string[]
  created_at: string
  updated_at: string
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
  linked_agenda_sub_task_id?: string | null
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

// ── 테스트실무 (PoC: 연간목표 3단계 -> 4단계 실행 TASK) ─────────────
// annual_goal_items/annual_goal_tasks는 그대로 참조만 하고 복제하지 않는다.

export interface TestPracticeTask {
  id: string
  annual_goal_task_id: string
  title: string
  status: AnnualGoalStatus
  assignee_id?: string | null
  start_date?: string | null
  due_date?: string | null
  description?: string | null
  completed_at?: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// 테스트실무 화면 전용 우선순위 — annual_goal_tasks.agreed_priority와 완전히 분리된 값.
// annual_goal_tasks(연간목표 TASK)를 이 화면에서는 "과제 카드"로 취급하고, 그 카드에만 붙는다.
export type AgendaPriority = 'P1' | 'P2' | 'P3'

export interface TestPracticeAgendaPriority {
  annual_goal_task_id: string
  priority: AgendaPriority
  created_at: string
  updated_at: string
}

// ── 생각스케치 ────────────────────────────────────────────────────

export interface SketchBoard {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface SketchCard {
  id: string
  board_id: string
  content: string
  color: string
  position_x: number
  position_y: number
  width: number
  height: number
  frame_id: string | null
  /** null = 기본 크기(프론트 DEFAULT_FONT_SIZE) */
  font_size: number | null
  created_at: string
  updated_at: string
}

export interface SketchEdge {
  id: string
  board_id: string
  source_card_id: string
  target_card_id: string
  /** 'hierarchy' = Tab으로 만든 부모→자식 연결, null = 드래그로 만든 수동 연결 */
  kind: string | null
  created_at: string
}

export interface SketchFrame {
  id: string
  board_id: string
  title: string
  position_x: number
  position_y: number
  width: number
  height: number
  collapsed: boolean
  created_at: string
  updated_at: string
}

// ── 홈 타임라인 업무 일정 ────────────────────────────────────────────────────

export interface ScheduleItem {
  id: string
  title: string
  item_date: string
  start_hour: number
  duration_hours: number
  created_at: string
  updated_at: string
}

// ── 즉석 할일 (프로젝트/안건에 속하지 않는 "오늘 업무" 퀵 추가) ──────────────

export interface QuickTodo {
  id: string
  title: string
  target_date: string
  done: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ── 업무보고 ────────────────────────────────────────────────────
// 보고서(work_reports)와 주제(work_report_topics)는 분리되어 있고,
// work_report_entries가 "이 report에서 이 topic에 무엇을 보고했는지"를 담는
// 연결 레코드다. topic은 연결고리일 뿐이며, 과거 report의 entry는 topic이
// 나중에 수정되어도 절대 바뀌지 않는 그 시점의 스냅샷이다.

export type WorkReportTopicStatus = 'active' | 'archived'

export interface WorkReportTopic {
  id: string
  title: string
  status: WorkReportTopicStatus
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type WorkReportStatus = 'draft' | 'final'

export interface WorkReport {
  id: string
  period_start: string
  period_end: string
  status: WorkReportStatus
  summary: string
  issues: string
  next_steps: string
  created_at: string
  updated_at: string
  finalized_at: string | null
}

export interface WorkReportEntry {
  id: string
  report_id: string
  topic_id: string
  sort_order: number
  /** entry 생성 시점(또는 draft 상태에서 topic이 rename된 시점)의 topic 제목 스냅샷.
   *  work_report_topics.title(master)이 나중에 바뀌어도 이 값은 그 report가 final이 된
   *  이후로는 절대 바뀌지 않는다 — "당시 보고 내용"을 보여주는 화면은 이 값을 쓴다. */
  topic_title_snapshot: string
  report_text: string
  executive_point: string
  next_action: string
  working_memo: string
  created_at: string
  updated_at: string
}
