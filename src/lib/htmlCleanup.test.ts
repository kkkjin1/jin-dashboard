import { describe, it, expect } from 'vitest'
import { collapseEmptyParagraphs, cleanPastedHTML } from './htmlCleanup'

describe('collapseEmptyParagraphs', () => {
  it('연달아 있는 빈 문단은 하나로 합친다', () => {
    expect(collapseEmptyParagraphs('<p>가</p><p></p><p><br></p><p>&nbsp;</p><p>나</p>')).toBe('<p>가</p><p></p><p>나</p>')
  })
  it('빈 문단 하나는 그대로 둔다', () => {
    expect(collapseEmptyParagraphs('<p>가</p><p></p><p>나</p>')).toBe('<p>가</p><p></p><p>나</p>')
  })
})

describe('cleanPastedHTML (붙여넣기)', () => {
  it('Windows Chrome 클립보드 껍데기를 벗기고 조각만 남긴다 — afd8799 토글 빈 줄 회귀 방지', () => {
    const clip = '<html>\n<body>\n<!--StartFragment--><p>붙인 글</p><!--EndFragment-->\n</body>\n</html>'
    expect(cleanPastedHTML(clip)).toBe('<p>붙인 글</p>')
  })
  it('조각 표시가 없으면 앞뒤 공백만 걷는다', () => {
    expect(cleanPastedHTML('  <p>글</p>\n')).toBe('<p>글</p>')
  })
})
