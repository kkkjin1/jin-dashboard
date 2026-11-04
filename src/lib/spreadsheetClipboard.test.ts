import { describe, it, expect } from 'vitest'
import { parseSpreadsheetClipboard } from './spreadsheetClipboard'

// 실제 DataTransfer 대신 getData만 흉내
function clip(data: { html?: string; text?: string }): DataTransfer {
  return { getData: (t: string) => (t === 'text/html' ? data.html ?? '' : t === 'text/plain' ? data.text ?? '' : '') } as unknown as DataTransfer
}

describe('parseSpreadsheetClipboard (엑셀 붙여넣기) — 1e49bc6 회귀 방지', () => {
  it('엑셀 HTML 표는 행·열 그대로', () => {
    const rows = Array.from({ length: 3 }, (_, r) => `<tr>${Array.from({ length: 4 }, (_, c) => `<td>${r}-${c}</td>`).join('')}</tr>`).join('')
    const out = parseSpreadsheetClipboard(clip({ html: `<table>${rows}</table>` }))
    expect(out).toHaveLength(3)
    expect(out!.every(r => r.length === 4)).toBe(true)
    expect(out![2][3]).toBe('2-3')
  })

  it('병합 셀(colspan/rowspan)이 있어도 열이 밀리지 않는다', () => {
    const html = '<table><tr><td colspan="2">A</td><td rowspan="2">B</td></tr><tr><td>c</td><td>d</td></tr></table>'
    expect(parseSpreadsheetClipboard(clip({ html }))).toEqual([['A', 'A', 'B'], ['c', 'd', 'B']])
  })

  it('셀 안 줄바꿈(br)은 줄바꿈으로 남는다', () => {
    const out = parseSpreadsheetClipboard(clip({ html: '<table><tr><td>위<br>아래</td><td>x</td></tr></table>' }))
    expect(out![0][0]).toBe('위\n아래')
  })

  it('HTML 표가 없으면 탭 구분 텍스트를 표로', () => {
    expect(parseSpreadsheetClipboard(clip({ text: 'a\tb\r\nc\td\r\n' }))).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('탭 없는 여러 줄 글은 표로 오인하지 않는다', () => {
    expect(parseSpreadsheetClipboard(clip({ text: '첫 줄\n둘째 줄' }))).toBeNull()
  })
})
