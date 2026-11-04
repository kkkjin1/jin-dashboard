import { describe, it, expect } from 'vitest'
import { buildQaText, countQuestions } from './oneOnOneQa'

const html = '<p>머리말</p><p data-qa="q">1. 요즘 어때요?</p><p>괜찮아요</p><ul><li><p>세부 답</p></li></ul><p data-qa="q">Q2. 다음 목표는?</p><p>평가 준비</p>'

describe('1on1 질문/답변 복사', () => {
  it('질문 수를 센다', () => {
    expect(countQuestions(html)).toBe(2)
  })
  it('질문만 복사 — 직접 붙인 번호(1. / Q2.)는 떼고 새로 매긴다', () => {
    expect(buildQaText(html, 'q')).toBe('1. 요즘 어때요?\n2. 다음 목표는?')
  })
  it('질문+답변 복사 — 답변 들여쓰기 유지', () => {
    expect(buildQaText(html, 'qa')).toBe('- 머리말\n\nQ1. 요즘 어때요?\nA1.\n- 괜찮아요\n  - 세부 답\n\nQ2. 다음 목표는?\nA2.\n- 평가 준비')
  })
  it('예전 평문 기록은 전부 답변 줄로', () => {
    expect(countQuestions('가\n나')).toBe(0)
    expect(buildQaText('가\n나', 'a')).toBe('- 가\n- 나')
  })
})
