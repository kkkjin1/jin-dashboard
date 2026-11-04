import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from './tiptapMarkdown'

// 업무보고 "마크다운 복사" 등 — 저장된 HTML을 마크다운으로 내보낼 때
describe('htmlToMarkdown (마크다운 복사)', () => {
  it('비어 있으면 빈 문자열', () => {
    expect(htmlToMarkdown(null)).toBe('')
    expect(htmlToMarkdown('')).toBe('')
  })

  it('예전 순수 텍스트 값은 그대로 돌려준다', () => {
    expect(htmlToMarkdown('  그냥 글  ')).toBe('그냥 글')
  })

  it('줄 안 줄바꿈(Shift+Enter)이 두 줄로 남는다 — 481e02c 회귀 방지', () => {
    expect(htmlToMarkdown('<p>첫째 줄<br>둘째 줄</p>')).toBe('첫째 줄\n둘째 줄')
  })

  it('목록 항목 안 줄바꿈은 다음 줄이 목록 밖으로 새지 않게 들여쓴다', () => {
    expect(htmlToMarkdown('<ul><li><p>항목<br>이어서</p></li></ul>')).toBe('- 항목\n  이어서')
    expect(htmlToMarkdown('<ol><li><p>하나<br>이어서</p></li></ol>')).toBe('1. 하나\n   이어서')
  })

  it('번호 목록은 시작 번호를 지킨다', () => {
    expect(htmlToMarkdown('<ol start="3"><li><p>셋</p></li><li><p>넷</p></li></ol>')).toBe('3. 셋\n4. 넷')
  })

  it('굵게·취소선·제목을 마크다운 기호로 바꾼다', () => {
    expect(htmlToMarkdown('<h2>제목</h2><p><strong>굵게</strong> <s>지움</s></p>')).toBe('## 제목\n**굵게** ~~지움~~')
  })

  it('토글은 제목 + 한 단계 들여쓴 내용으로', () => {
    const html = '<details><summary>토글 제목</summary><div data-type="detailsContent"><p>속 내용</p></div></details>'
    expect(htmlToMarkdown(html)).toBe('- 토글 제목\n   속 내용')
  })
})
