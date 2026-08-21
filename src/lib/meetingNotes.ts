import type { SupabaseClient } from '@supabase/supabase-js'

// Track B-4: meeting_notes 정규화 테이블 read 헬퍼.
//
// 정렬 방향이 두 그룹에서 서로 다르다(실측 검증 완료, Track B-4 2단계):
// - 일반 노트(is_prep=false): created_at DESC — 항상 prepend되어 온 기존
//   동작과 동일한 결과를 냄(과거 meeting_notes 61건 중 2개 이상인 6개
//   meeting 전부 sort_order 기준과 일치 확인됨).
// - 사전 메모(is_prep=true): created_at ASC — 항상 append되어 온 기존
//   동작과 동일한 결과를 냄(과거 데이터 2개 meeting 전부 확인됨).
// sort_order는 이제 과거 데이터의 원본 배열 위치를 보존하는 기록용 컬럼일
// 뿐, 이 두 정렬 기준으로 대체되었으므로 read 경로에서 사용하지 않는다.
export interface MeetingNoteRow {
  id: string
  meeting_id: string
  title: string
  content: string
  is_prep: boolean
  sort_order: number | null
  created_at: string
  updated_at: string
}

export interface MeetingNotesGrouped {
  regular: MeetingNoteRow[] // is_prep=false, created_at DESC(최신 우선)
  prep: MeetingNoteRow[]    // is_prep=true,  created_at ASC(오래된 것 우선)
}

const EMPTY_GROUPED: MeetingNotesGrouped = { regular: [], prep: [] }

function groupAndSort(rows: MeetingNoteRow[]): MeetingNotesGrouped {
  const regular = rows
    .filter(r => !r.is_prep)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const prep = rows
    .filter(r => r.is_prep)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { regular, prep }
}

// 노트가 생성 후 실제로 수정된 적이 있는지 — 구 NoteEntry.edited_at의
// "값이 존재하면 수정됨" 판정을 대체한다. meeting_notes.updated_at은
// NOT NULL이라 존재 여부로는 판정할 수 없고, created_at과의 비교로만
// 판정 가능(Track B-4 2단계에서 실측 검증: 원본 edited_at 없던 39건은
// updated_at=created_at, 있던 22건은 updated_at>created_at으로 정확히
// 대응함).
export function wasEdited(note: Pick<MeetingNoteRow, 'created_at' | 'updated_at'>): boolean {
  return note.updated_at > note.created_at
}

export async function fetchMeetingNotes(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<MeetingNotesGrouped> {
  const { data, error } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('meeting_id', meetingId)
  if (error || !data) return EMPTY_GROUPED
  return groupAndSort(data as MeetingNoteRow[])
}

// 여러 meeting의 노트를 한 번에 배치 조회 — 목록/미리보기 화면(목록 노트 수,
// 홈/일정 탭의 사전 메모 미리보기)에서 meeting마다 개별 조회하지 않도록.
export async function fetchMeetingNotesByMeetingIds(
  supabase: SupabaseClient,
  meetingIds: string[],
): Promise<Record<string, MeetingNotesGrouped>> {
  const grouped: Record<string, MeetingNotesGrouped> = {}
  if (meetingIds.length === 0) return grouped

  const { data, error } = await supabase
    .from('meeting_notes')
    .select('*')
    .in('meeting_id', meetingIds)

  const byMeeting: Record<string, MeetingNoteRow[]> = {}
  if (!error && data) {
    ;(data as MeetingNoteRow[]).forEach(row => {
      ;(byMeeting[row.meeting_id] ??= []).push(row)
    })
  }
  meetingIds.forEach(id => {
    grouped[id] = groupAndSort(byMeeting[id] ?? [])
  })
  return grouped
}
