import { describe, it, expect } from 'vitest'
import { shouldPurge, isBigDrop, markVersions, groupRecentFields, versionPlainText, versionValue, versionHtml, fieldLabel, relativeTime } from './versionHistory'

describe('정리 호출 간격', () => {
  it('첫 저장이면 바로 정리', () => expect(shouldPurge(null, 1000)).toBe(true))
  it('10분 안에는 다시 안 부른다', () => expect(shouldPurge(0, 9 * 60_000)).toBe(false))
  it('10분 지나면 다시 부른다', () => expect(shouldPurge(0, 10 * 60_000)).toBe(true))
})

describe('큰 삭제 판정 ("지우기 직전" 표시)', () => {
  it('200자 이상 줄면 큰 삭제', () => expect(isBigDrop(5000, 4800)).toBe(true))
  it('30% 이상 줄면 큰 삭제', () => expect(isBigDrop(100, 60)).toBe(true))
  it('조금 지운 건 아님', () => expect(isBigDrop(1000, 990)).toBe(false))
  it('짧은 글에서 몇 글자 지운 건 아님', () => expect(isBigDrop(10, 5)).toBe(false))
  it('늘어난 건 아님', () => expect(isBigDrop(10, 500)).toBe(false))
})

describe('기록 표시', () => {
  const v = (id: string, html: string) => ({ id, created_at: `2026-11-04T05:0${id}:00Z`, version_no: Number(id), content: { schemaVersion: 1, value: html } })

  it('통째로 지운 기록 바로 앞 기록에 "지우기 직전" 표시', () => {
    const long = '<p>' + '가'.repeat(300) + '</p>'
    const marked = markVersions([v('3', '<p></p>'), v('2', long), v('1', '<p>가</p>')])
    expect(marked.map(m => m.beforeBigDrop)).toEqual([false, true, false])
    expect(marked[1].length).toBe(300)
  })

  it('HTML 값은 글자만, 객체 값은 안의 글자를 모아서', () => {
    expect(versionPlainText('<p>첫째</p><p>둘째 &amp; 셋</p>')).toBe('첫째\n둘째 & 셋')
    expect(versionPlainText({ rows: [{ a: '셀1' }, { a: '셀2' }] })).toBe('셀1\n셀2')
  })

  it('저장 형식 { schemaVersion, value }에서 값을 꺼낸다', () => {
    expect(versionValue({ schemaVersion: 1, value: '<p>x</p>' })).toBe('<p>x</p>')
    expect(versionHtml('<p>x</p>')).toBe('<p>x</p>')
    expect(versionHtml({ a: 1 })).toBeNull()
  })

  it('칸별로 묶고 최근 수정 칸이 위로', () => {
    const rows = [
      { entity_type: 'meeting_note', entity_id: 'a', field_key: 'content', created_at: '2026-11-04T05:10:00Z' },
      { entity_type: 'project_item', entity_id: 'b', field_key: 'description', created_at: '2026-11-04T05:05:00Z' },
      { entity_type: 'meeting_note', entity_id: 'a', field_key: 'content', created_at: '2026-11-04T05:01:00Z' },
    ]
    const g = groupRecentFields(rows)
    expect(g.map(f => [f.entityId, f.count])).toEqual([['a', 2], ['b', 1]])
  })

  it('이름표와 상대 시간', () => {
    expect(fieldLabel('project_item', 'description')).toBe('안건 · 본문')
    expect(fieldLabel('unknown_type', 'x')).toBe('unknown_type · x')
    const now = Date.parse('2026-11-04T05:30:00Z')
    expect(relativeTime('2026-11-04T05:27:00Z', now)).toBe('3분 전')
    expect(relativeTime('2026-11-04T05:29:40Z', now)).toBe('방금')
  })
})
