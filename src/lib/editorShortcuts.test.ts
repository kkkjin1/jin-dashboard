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
  it('고른 여러 줄을 세로바 하나로 묶고, 다시 누르면 푼다', () => {
    const ed = new Editor({ extensions: EXT, content: '<p>첫째</p><p>둘째</p><p>셋째</p>' })
    ed.commands.setTextSelection({ from: 2, to: 6 }) // 첫째~둘째
    expect(toggleQuoteAtSelection(ed)).toBe(true)
    expect(ed.getHTML()).toBe('<blockquote><p>첫째</p><p>둘째</p></blockquote><p>셋째</p>')
    toggleQuoteAtSelection(ed)
    expect(ed.getHTML()).toBe('<p>첫째</p><p>둘째</p><p>셋째</p>')
    ed.destroy()
  })
  it('토글 안에서 고르면 토글 본문 안에서만 묶인다(토글 구조 유지)', () => {
    const ed = new Editor({ extensions: EXT, content: '<details open><summary>제목</summary><div data-type="detailsContent"><p>가</p><p>나</p><p>다</p></div></details>' })
    let a = -1, b = -1
    ed.state.doc.descendants((n, pos) => { if (n.isText && n.text === '가') a = pos; if (n.isText && n.text === '나') b = pos + 1 })
    ed.commands.setTextSelection({ from: a, to: b })
    toggleQuoteAtSelection(ed)
    const html = ed.getHTML()
    expect(html).toContain('<summary>제목</summary>')
    expect(html).toMatch(/data-type="detailsContent"[^>]*><blockquote><p>가<\/p><p>나<\/p><\/blockquote><p>다<\/p>/)
    ed.destroy()
  })
})
