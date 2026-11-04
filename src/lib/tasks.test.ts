import { describe, it, expect } from 'vitest'
import { parseTags } from './tasks'

const Y = new Date().getFullYear()

describe('parseTags (빠른 입력 태그)', () => {
  it('날짜 태그를 올해 날짜로 바꾼다', () => {
    expect(parseTags('[시작 3/2] [중간공유 4/15] [최종보고 12/1]')).toMatchObject({
      start_date: `${Y}-03-02`, mid_date: `${Y}-04-15`, end_date: `${Y}-12-01`,
    })
  })
  it('담당자·유형·상태 태그', () => {
    expect(parseTags('[담당자 홍길동 ] [유형 개선] [상태 진행중]')).toEqual({ assignee_name: '홍길동', type: '개선', status: '진행중' })
  })
  it('목록에 없는 유형·파트는 무시', () => {
    expect(parseTags('[유형 잡무] [파트 없는팀]', ['코어', '비즈'])).toEqual({})
    expect(parseTags('[파트 비즈]', ['코어', '비즈'])).toEqual({ part: '비즈' })
  })
})
