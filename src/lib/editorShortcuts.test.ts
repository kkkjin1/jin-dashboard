import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import { isQuoteKey, toggleQuoteAtSelection, voiceTargetOfKey } from './editorShortcuts'
import { isTodayTodoKey } from './todayTodoCapture'
import { BASE_TIPTAP_EXTENSIONS, ToggleInputRules } from './tiptapExtensions'

const EXT = [...BASE_TIPTAP_EXTENSIONS, ToggleInputRules]

const key = (code: string, o: Partial<KeyboardEventInit> = {}) => new KeyboardEvent('keydown', { code, altKey: true, ...o })

describe('편집기 Alt 단축키(2026-11-24 재배치)', () => {
  it('Alt+Q = CEO, Alt+W = CSO, 옛 Alt+3/4는 의견 표시 아님', () => {
    expect(voiceTargetOfKey(key('KeyQ'))).toBe('CEO')
    expect(voiceTargetOfKey(key('KeyW'))).toBe('CSO')
    expect(voiceTargetOfKey(key('Digit3'))).toBeNull()
    expect(voiceTargetOfKey(key('Digit4'))).toBeNull()
    expect(voiceTargetOfKey(key('KeyQ', { ctrlKey: true }))).toBeNull()
  })
  it('Alt+3 = 세로바, Alt+` = 오늘 할 일(옛 Alt+5 아님)', () => {
    expect(isQuoteKey(key('Digit3'))).toBe(true)
    expect(isQuoteKey(key('Digit3', { shiftKey: true }))).toBe(false)
    expect(isTodayTodoKey(key('Backquote'))).toBe(true)
    expect(isTodayTodoKey(key('Digit5'))).toBe(false)
  })
  const quoted = (ed: Editor) => { const out: string[] = []; ed.state.doc.descendants(n => { if (n.isTextblock && n.attrs.quoteLine) out.push(n.textContent) }); return out }
  const pick = (ed: Editor, a: string, b?: string) => {
    let x = -1, y = -1
    ed.state.doc.descendants((n, p) => { if (n.isText && n.text === a) x = b ? p : p + 1; if (b && n.isText && n.text === b) y = p + n.text.length }) // 블록 = 첫 글자 앞 ~ 마지막 글자 뒤
    ed.commands.setTextSelection({ from: x, to: y < 0 ? x : y })
  }
  it('고른 줄에만 세로선, 다시 누르면 꺼짐(구조는 그대로)', () => {
    const ed = new Editor({ extensions: EXT, content: '<p>첫째</p><p>둘째</p><p>셋째</p>' })
    pick(ed, '첫째', '둘째')
    expect(toggleQuoteAtSelection(ed)).toBe(true)
    expect(quoted(ed)).toEqual(['첫째', '둘째'])
    expect(ed.getHTML()).toContain('<p data-quote="1">첫째</p>')
    toggleQuoteAtSelection(ed)
    expect(quoted(ed)).toEqual([])
    ed.destroy()
  })
  it('제보: 1·2행(1단계)만 잡으면 2행에 딸린 3·4행(2단계)은 안 묶임, 1행만 잡으면 1행만', () => {
    const html = '<ul><li><p>일</p></li><li><p>이</p><ul><li><p>삼</p></li><li><p>사</p></li></ul></li></ul>'
    const ed = new Editor({ extensions: EXT, content: html })
    pick(ed, '일', '이')
    toggleQuoteAtSelection(ed)
    expect(quoted(ed)).toEqual(['일', '이'])
    expect(ed.getHTML()).toContain('<li><p>삼</p></li>') // 구조 그대로
    ed.destroy()
    const ed2 = new Editor({ extensions: EXT, content: html })
    pick(ed2, '일')
    toggleQuoteAtSelection(ed2)
    expect(quoted(ed2)).toEqual(['일'])
    ed2.destroy()
  })
  it('저장된 HTML(data-quote)을 다시 읽어도 세로선 유지', () => {
    const ed = new Editor({ extensions: EXT, content: '<p data-quote="1">가</p><p>나</p>' })
    expect(quoted(ed)).toEqual(['가'])
    ed.destroy()
  })
  it('토글 안에서 고르면 토글 본문 안에서만 묶인다(토글 구조 유지)', () => {
    const ed = new Editor({ extensions: EXT, content: '<details open><summary>제목</summary><div data-type="detailsContent"><p>가</p><p>나</p><p>다</p></div></details>' })
    let a = -1, b = -1
    ed.state.doc.descendants((n, pos) => { if (n.isText && n.text === '가') a = pos; if (n.isText && n.text === '나') b = pos + 1 })
    ed.commands.setTextSelection({ from: a, to: b })
    toggleQuoteAtSelection(ed)
    expect(ed.getHTML()).toContain('<summary>제목</summary>')
    expect(quoted(ed)).toEqual(['가', '나'])
    ed.destroy()
  })
})

import { quoteRuns } from './tiptapExtensions'
describe('세로선 묶음(선 1개로 이을 줄들)', () => {
  it('일반 줄·목록 줄이 연달아 켜져 있으면 한 묶음, 사이에 안 켠 줄이 끼면 끊김', () => {
    const ed = new Editor({ extensions: EXT, content: '<p data-quote="1">일반</p><ol><li><p data-quote="1">홍길동</p></li></ol><p>끊김</p><ul><li><p data-quote="1">가</p><ul><li><p data-quote="1">나</p></li></ul></li></ul>' })
    const runs = quoteRuns(ed.state.doc).map(r => r.map(pos => ed.state.doc.nodeAt(pos)!.textContent))
    expect(runs).toEqual([['일반', '홍길동'], ['가', '나']])
    ed.destroy()
  })
})

import { indentListLine } from './tiptapExtensions'
describe('끌어 고른 범위가 앞뒤 줄에 살짝 걸친 경우(2026-11-24 제보)', () => {
  const posOf = (ed: Editor, text: string, end = false) => { let p = -1; ed.state.doc.descendants((n, q) => { if (n.isText && n.text === text) p = q + (end ? n.text.length : 0) }); return p }
  it('1행 끝 ~ 4행 맨 앞으로 잡혀도 Alt+3은 2·3행만', () => {
    const ed = new Editor({ extensions: EXT, content: '<p>일</p><p>이</p><p>삼</p><p>사</p>' })
    ed.commands.setTextSelection({ from: posOf(ed, '일', true), to: posOf(ed, '사') })
    toggleQuoteAtSelection(ed)
    const q: string[] = []; ed.state.doc.descendants(n => { if (n.isTextblock && n.attrs.quoteLine) q.push(n.textContent) })
    expect(q).toEqual(['이', '삼'])
    ed.destroy()
  })
  it('목록에서 2·3행만 칠해 Tab → 4행 맨 앞에 걸려도 2·3행만 들어감', () => {
    const ed = new Editor({ extensions: EXT, content: '<ul><li><p>일</p></li><li><p>이</p></li><li><p>삼</p></li><li><p>사</p></li></ul>' })
    ed.commands.setTextSelection({ from: posOf(ed, '이'), to: posOf(ed, '사') })
    indentListLine(ed, 'in')
    expect(ed.getHTML().replace(/<p><\/p>$/, '')).toBe('<ul><li><p>일</p><ul><li><p>이</p></li><li><p>삼</p></li></ul></li><li><p>사</p></li></ul>')
    ed.destroy()
  })
})
