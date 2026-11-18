import { describe, it, expect } from 'vitest'
import { splitSlides } from './AdhocSlideShow'

describe('splitSlides (수시보고 확대보기 페이지 나누기)', () => {
  it('가로줄마다 한 장', () => {
    expect(splitSlides('<p>가</p><hr><p>나</p><p>다</p><hr><ul><li><p>라</p></li></ul>'))
      .toEqual(['<p>가</p>', '<p>나</p><p>다</p>', '<ul><li><p>라</p></li></ul>'])
  })
  it('줄이 없으면 한 장, 연달아 그은 줄·빈 장은 뺀다', () => {
    expect(splitSlides('<p>가</p>')).toEqual(['<p>가</p>'])
    expect(splitSlides('<hr><p>가</p><hr><hr><p></p><hr><p>나</p><hr>')).toEqual(['<p>가</p>', '<p>나</p>'])
    expect(splitSlides('')).toEqual([])
  })
  it('서식(빨간펜·형광펜)은 그대로, 이벤트 속성은 걷어낸다', () => {
    const [one] = splitSlides('<p><span style="color:#EF4444" onclick="x()">빨강</span> <mark>형광</mark></p>')
    expect(one).toContain('color:#EF4444')
    expect(one).toContain('<mark>형광</mark>')
    expect(one).not.toContain('onclick')
  })
})
