// 자동저장 기록(content_versions) — 정리 호출 간격 + "최근 기록" 창 표시용 순수 함수.
// 정리 규칙 자체는 DB 함수 purge_stale_content_versions(schema_v71.sql):
//   한 칸을 마지막으로 고친 뒤 1시간 무변경 → 최근 1개만 남기고 삭제.

export const HISTORY_WINDOW_MS = 60 * 60 * 1000        // 창에 보여 줄 범위 = 정리 기준과 같은 1시간
export const PURGE_INTERVAL_MS = 10 * 60 * 1000        // 정리 함수는 탭당 10분에 한 번만 부른다

/** 마지막 정리 시각 기준으로 지금 정리를 불러야 하는지. 첫 저장(null)이면 바로 부른다. */
export function shouldPurge(lastPurgeAt: number | null, now: number, interval = PURGE_INTERVAL_MS): boolean {
  return lastPurgeAt === null || now - lastPurgeAt >= interval
}

const TYPE_LABEL: Record<string, string> = {
  meeting: '회의록(새 노트)',
  meeting_note: '회의록',
  quick_memo: '빠른 메모',
  project_item: '안건',
  agenda_sub_task: '히스토리·할 일',
  daily_journal: '회고',
  one_on_one: '1on1',
  sketch_card: '생각스케치 카드',
  sketch_frame: '생각스케치 프레임',
  sketch_board: '생각스케치 노트',
  sketch_note_element: '생각스케치 요소',
  work_report: '업무보고',
  work_report_entry: '업무보고 행',
  adhoc_report: '수시보고',
}

const FIELD_LABEL: Record<string, string> = {
  description: '본문', content: '본문', body: '본문', draft: '작성 중', note_body: '본문', table_data: '표',
}

export function fieldLabel(entityType: string, fieldKey: string): string {
  const t = TYPE_LABEL[entityType] ?? entityType
  const f = FIELD_LABEL[fieldKey] ?? fieldKey
  return `${t} · ${f}`
}

/** content_versions.content = { schemaVersion: 1, value } — value는 화면마다 문자열(HTML) 또는 객체. */
export function versionValue(content: unknown): unknown {
  if (content && typeof content === 'object' && 'value' in content) return (content as { value: unknown }).value
  return content
}

/** 객체 값 안의 글자만 모아 한 덩어리로(표·업무보고 행 등) — 미리보기·글자수 비교용 */
function collectStrings(v: unknown, out: string[]) {
  if (typeof v === 'string') { out.push(v); return }
  if (Array.isArray(v)) { v.forEach(x => collectStrings(x, out)); return }
  if (v && typeof v === 'object') Object.values(v).forEach(x => collectStrings(x, out))
}

/** 값 → 사람이 읽는 글자(HTML 태그 제거). 글자수 비교와 목록 첫 줄에 쓴다. */
export function versionPlainText(value: unknown): string {
  const parts: string[] = []
  collectStrings(value, parts)
  return parts
    .map(s => s.trimStart().startsWith('<')
      ? s.replace(/<(br|\/p|\/li|\/h\d|\/summary|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      : s)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 값이 HTML 문자열이면 그대로(서식 유지 복사·미리보기), 아니면 null */
export function versionHtml(value: unknown): string | null {
  return typeof value === 'string' && value.trimStart().startsWith('<') ? value : null
}

export interface VersionRow { id: string; created_at: string; version_no: number; content: unknown }

export interface MarkedVersion extends VersionRow {
  text: string
  length: number
  /** 다음(더 새로운) 기록에서 글이 크게 줄었다 = "지우기 직전" 후보 */
  beforeBigDrop: boolean
}

/** 큰 삭제 판정: 30% 이상 또는 200자 이상 줄면 (짧은 글은 20자 이상일 때만) */
export function isBigDrop(before: number, after: number): boolean {
  const lost = before - after
  if (lost <= 0) return false
  if (lost >= 200) return true
  return lost >= 20 && lost / before >= 0.3
}

/** 최신 → 과거 순 기록에 글자수와 "지우기 직전" 표시를 붙인다 */
export function markVersions(rowsNewestFirst: VersionRow[]): MarkedVersion[] {
  const marked = rowsNewestFirst.map(r => {
    const text = versionPlainText(versionValue(r.content))
    return { ...r, text, length: text.replace(/\s+/g, '').length, beforeBigDrop: false }
  })
  for (let i = 1; i < marked.length; i++) {
    marked[i].beforeBigDrop = isBigDrop(marked[i].length, marked[i - 1].length)
  }
  return marked
}

export interface FieldKeyRow { entity_type: string; entity_id: string; field_key: string; created_at: string }
export interface RecentField { key: string; entityType: string; entityId: string; fieldKey: string; lastAt: string; count: number }

/** 최근 기록 행(최신순) → 칸별로 묶기, 마지막 수정이 최근인 칸부터 */
export function groupRecentFields(rowsNewestFirst: FieldKeyRow[]): RecentField[] {
  const map = new Map<string, RecentField>()
  for (const r of rowsNewestFirst) {
    const key = `${r.entity_type}|${r.entity_id}|${r.field_key}`
    const f = map.get(key)
    if (f) { f.count++; if (r.created_at > f.lastAt) f.lastAt = r.created_at }
    else map.set(key, { key, entityType: r.entity_type, entityId: r.entity_id, fieldKey: r.field_key, lastAt: r.created_at, count: 1 })
  }
  return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}

export function relativeTime(iso: string, now: number): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}
