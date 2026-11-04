import { describe, it, expect } from 'vitest'
import { teamMembers, observationError, observationColumns, toggleId, filterByObservedMember, observationLabel, obsTitleFromContent, memoSaveTitle, OBS_TAG } from './observation'

const org = [
  { id: 't1', name: '인사관리팀', parts: [] },
  { id: 't2', name: '채용팀', parts: [{ id: 'p1', name: '운영' }] },
  { id: 't3', name: '파트 있는 팀', parts: [{ id: 'p2', name: 'A' }, { id: 'p3', name: 'B' }] },
]
const members = [
  { id: 'a', name: '가', part: 't1' },
  { id: 'b', name: '나', part: 't1' },
  { id: 'c', name: '다', part: 'p1' },
  { id: 'd', name: '라', part: 't1', archived_at: '2026-10-01' },
  { id: 'e', name: '마', part: 'p3' },
  { id: 'f', name: '바', part: null },
]

describe('팀원 고르기', () => {
  it('인사관리팀 소속만, 보관된 사람은 빼고', () => {
    expect(teamMembers(org, members).map(m => m.id)).toEqual(['a', 'b'])
  })
  it('파트가 있는 팀은 파트 소속까지', () => {
    expect(teamMembers(org, members, '파트 있는 팀').map(m => m.id)).toEqual(['e'])
  })
  it('조직 정보가 비어 있어도 소속이 팀 이름 그대로면 찾는다', () => {
    const byName = [{ id: 'x', name: '사', part: '인사관리팀' }, { id: 'y', name: '아', part: '인재전략팀' }]
    expect(teamMembers([], byName).map(m => m.id)).toEqual(['x'])
  })
  it('팀 이름이 없으면 빈 목록', () => {
    expect(teamMembers(org, members, '없는팀')).toEqual([])
  })
})

describe('저장 값', () => {
  it('팀원관찰인데 대상이 없으면 저장 막기', () => {
    expect(observationError(OBS_TAG, [])).not.toBeNull()
    expect(observationError(OBS_TAG, ['a'])).toBeNull()
    expect(observationError('업무관련', [])).toBeNull()
  })
  it('팀원관찰이면 대상·종류를 담고 중복은 뺀다', () => {
    expect(observationColumns(OBS_TAG, ['a', 'a', 'b'], '칭찬')).toEqual({ observed_member_ids: ['a', 'b'], observation_kind: '칭찬' })
    expect(observationColumns(OBS_TAG, ['a'], null)).toEqual({ observed_member_ids: ['a'], observation_kind: null })
  })
  it('다른 범주로 바꿔 저장하면 새 칸을 아예 보내지 않는다(골라 둔 팀원 무시, v72 전에도 저장 안전)', () => {
    expect(observationColumns('업무관련', ['a'], '개선')).toEqual({})
  })
  it('칩 누르기 = 켜고 끄기', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('팀원관찰 제목 자동 생성(제목 칸 없음)', () => {
  it('본문 첫 줄이 제목', () => {
    expect(obsTitleFromContent('<p></p><p>  채용 일정 &amp; 면접 조율 잘함 </p><p>둘째 줄</p>')).toBe('채용 일정 & 면접 조율 잘함')
  })
  it('목록·줄바꿈 첫 항목도', () => {
    expect(obsTitleFromContent('<ul><li><p>첫 항목</p></li></ul>')).toBe('첫 항목')
    expect(obsTitleFromContent('<p>위<br>아래</p>')).toBe('위')
  })
  it('40자 넘으면 줄인다', () => {
    const t = obsTitleFromContent('<p>' + '가'.repeat(50) + '</p>')
    expect(t).toBe('가'.repeat(40) + '…')
  })
  it('본문이 비면 빈 제목 → 저장 막힘', () => {
    expect(obsTitleFromContent('<p></p>')).toBe('')
    expect(memoSaveTitle(OBS_TAG, '', '<p></p>')).toBe('')
  })
  it('다른 범주는 입력한 제목 그대로', () => {
    expect(memoSaveTitle('업무관련', ' 제목 ', '<p>본문</p>')).toBe('제목')
    expect(memoSaveTitle(OBS_TAG, '', '<p>본문</p>')).toBe('본문')
  })
})

describe('메모함 표시', () => {
  const memos = [
    { id: 1, observed_member_ids: ['a', 'b'], observation_kind: '칭찬' },
    { id: 2, observed_member_ids: ['b'], observation_kind: null },
    { id: 3, observed_member_ids: null, observation_kind: null },
  ]
  it('팀원별 걸러 보기', () => {
    expect(filterByObservedMember(memos, 'a').map(m => m.id)).toEqual([1])
    expect(filterByObservedMember(memos, 'b').map(m => m.id)).toEqual([1, 2])
    expect(filterByObservedMember(memos, null)).toHaveLength(3)
  })
  it('카드 표시', () => {
    const names = { a: '가', b: '나' }
    expect(observationLabel(memos[0], names)).toBe('가·나 · 칭찬')
    expect(observationLabel(memos[1], names)).toBe('나')
    expect(observationLabel(memos[2], names)).toBeNull()
    expect(observationLabel({ observed_member_ids: ['z'] }, names)).toBe('(알 수 없음)')
  })
})
