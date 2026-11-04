// 팀원관찰 메모 — 빠른 메모 "팀원관찰" 범주 + 관찰 대상 팀원 + 칭찬/개선.
// 저장: quick_memos.tag에 '팀원관찰', 대상은 observed_member_ids(uuid[]), 종류는 observation_kind (schema_v72).
// 팀원을 범주(tag)처럼 글자로 넣지 않는 이유: 메모함에 이름 칩이 범주처럼 쌓이고, 이름이 바뀌면 기록이 끊긴다.

import type { OrgTeam } from '@/hooks/useOrgData'

export const OBS_TAG = '팀원관찰'
export const OBS_TEAM_NAME = '인사관리팀'
export const OBS_KINDS = ['칭찬', '개선'] as const
export type ObsKind = typeof OBS_KINDS[number]

interface MemberLike { id: string; name: string; part?: string | null; archived_at?: string | null }

/** 팀 이름으로 소속 인원(보관된 사람 제외)을 찾는다.
 *  members.part에는 팀 이름 그대로("인사관리팀")가 들어 있는 경우가 있고, 설정 조직 정보가 있으면
 *  그 팀의 id·파트 id로도 찾는다(조직 정보가 비어 있어도 이름만으로 동작). */
export function teamMembers<M extends MemberLike>(org: OrgTeam[], members: M[], teamName = OBS_TEAM_NAME): M[] {
  const team = org.find(t => t.name.trim() === teamName)
  const ids = new Set([teamName, ...(team ? [team.id, ...team.parts.map(p => p.id)] : [])])
  return members.filter(m => !m.archived_at && !!m.part && ids.has(m.part))
}

/** 저장 전 검사 — 팀원관찰이면 대상 1명 이상 필수. 문제 없으면 null */
export function observationError(tag: string, memberIds: string[]): string | null {
  if (tag !== OBS_TAG) return null
  return memberIds.length === 0 ? '관찰 대상 팀원을 1명 이상 골라 주세요' : null
}

/** quick_memos insert에 붙일 칸 — 팀원관찰이 아니면 아무 칸도 붙이지 않는다
 *  (DB 기본값이 같고, schema_v72 실행 전에도 다른 범주 저장이 깨지지 않게) */
export function observationColumns(tag: string, memberIds: string[], kind: ObsKind | null): { observed_member_ids?: string[]; observation_kind?: ObsKind | null } {
  if (tag !== OBS_TAG) return {}
  return { observed_member_ids: [...new Set(memberIds)], observation_kind: kind }
}

const OBS_TITLE_MAX = 40

/** 팀원관찰은 제목 칸이 없다 — 본문 첫 줄(글자만, 40자까지)을 제목으로 쓴다. 본문이 비면 '' */
export function obsTitleFromContent(html: string): string {
  const text = html
    .replace(/<(br|\/p|\/li|\/h\d|\/summary|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const line = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).find(Boolean) ?? ''
  return line.length > OBS_TITLE_MAX ? line.slice(0, OBS_TITLE_MAX) + '…' : line
}

/** 저장할 제목 — 팀원관찰이면 본문 첫 줄, 아니면 입력한 제목 */
export function memoSaveTitle(tag: string, title: string, contentHtml: string): string {
  return tag === OBS_TAG ? (title.trim() || obsTitleFromContent(contentHtml)) : title.trim()
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
}

interface ObsMemoLike { observed_member_ids?: string[] | null; observation_kind?: string | null }

/** 메모함 팀원별 걸러 보기 — memberId가 null이면 전부 */
export function filterByObservedMember<T extends ObsMemoLike>(memos: T[], memberId: string | null): T[] {
  if (!memberId) return memos
  return memos.filter(m => (m.observed_member_ids ?? []).includes(memberId))
}

/** 카드에 붙일 짧은 표시 — "홍길동·김철수 · 칭찬". 대상이 없으면 null */
export function observationLabel(memo: ObsMemoLike, nameById: Record<string, string>): string | null {
  const ids = memo.observed_member_ids ?? []
  if (ids.length === 0) return null
  const names = ids.map(id => nameById[id] ?? '(알 수 없음)').join('·')
  return memo.observation_kind ? `${names} · ${memo.observation_kind}` : names
}
