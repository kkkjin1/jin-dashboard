import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BASE_TIPTAP_EXTENSIONS, ToggleInputRules, handleListKeymapWorkaround } from './tiptapExtensions'

// 빈 불릿(맨 위에 "- "로 만든 줄)에서 Delete → 아래 글을 불릿 줄로 끌어올린다 (2026-11-19)
const DEL = { key: 'Delete', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent

function pressDeleteInEmptyItem(html: string): { handled: boolean; html: string } {
  const ed = new Editor({ extensions: [...BASE_TIPTAP_EXTENSIONS, ToggleInputRules], content: html })
  let pos = -1
  ed.state.doc.descendants((n, p) => {
    if (pos === -1 && n.type.name === 'paragraph' && n.content.size === 0) { pos = p + 1; return false }
    return true
  })
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)))
  const handled = handleListKeymapWorkaround(ed, DEL)
  const out = ed.getHTML()
  ed.destroy()
  return { handled, html: out }
}

describe('빈 불릿에서 Delete로 아래 글 끌어올리기', () => {
  it('아래가 일반 문단', () => {
    const r = pressDeleteInEmptyItem('<ul><li><p></p></li></ul><p>첫줄</p><p>둘째</p>')
    expect(r.handled).toBe(true)
    expect(r.html).toBe('<ul><li><p>첫줄</p></li></ul><p>둘째</p>')
  })
  it('아래가 제목', () => {
    const r = pressDeleteInEmptyItem('<ul><li><p></p></li></ul><h2>첫줄</h2><p>둘째</p>')
    expect(r.handled).toBe(true)
    expect(r.html).toBe('<ul><li><p>첫줄</p></li></ul><p>둘째</p>')
  })
  it('토글 안의 목록', () => {
    const r = pressDeleteInEmptyItem('<details><summary>t</summary><div data-type="detailsContent"><ul><li><p></p></li></ul><p>첫줄</p><p>둘째</p></div></details>')
    expect(r.handled).toBe(true)
    expect(r.html).toContain('<ul><li><p>첫줄</p></li></ul><p>둘째</p>')
  })
})

// 목록 항목 안의 빈 둘째 줄에서 Backspace → 그 줄만 왼쪽으로, 위 ○ 항목은 그대로 (2026-11-24 제보)
describe('항목 안 빈 줄 Backspace', () => {
  const BS = { key: 'Backspace', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent
  const press = (html: string, nth = 0) => {
    const ed = new Editor({ extensions: [...BASE_TIPTAP_EXTENSIONS, ToggleInputRules], content: html })
    let pos = -1, k = 0
    ed.state.doc.descendants((n, p) => { if (n.type.name === 'paragraph' && n.content.size === 0) { if (k++ === nth) pos = p + 1 } })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)))
    const handled = handleListKeymapWorkaround(ed, BS)
    const out = ed.getHTML().replace(/<p><\/p>$/, ''), sel = ed.state.selection.$from // 문서 끝 자동 빈 줄(trailing node)은 빼고 비교
    ed.destroy()
    return { handled, html: out, inEmpty: sel.parent.content.size === 0 }
  }
  it('스크린샷 그대로: 빈 줄만 한 단계 왼쪽(바깥 항목 안), ○ 항목들은 그대로', () => {
    const r = press('<ul><li><p>쟁점</p><ul><li><p>어디까지</p></li><li><p>무엇을</p><p></p></li></ul></li><li><p>선제</p></li></ul>')
    expect(r.handled).toBe(true)
    expect(r.html).toBe('<ul><li><p>쟁점</p><ul><li><p>어디까지</p></li><li><p>무엇을</p></li></ul><p></p></li><li><p>선제</p></li></ul>')
    expect(r.inEmpty).toBe(true)
  })
  it('맨 바깥 목록이면 목록 밖 일반 줄로', () => {
    const r = press('<ul><li><p>가</p><p></p></li></ul><p>뒤</p>')
    expect(r.html).toBe('<ul><li><p>가</p></li></ul><p></p><p>뒤</p>'.replace(/<p><\/p>$/, ''))
  })
  it('중간에 끼인 빈 줄이면 그 줄만 지운다', () => {
    const r = press('<ul><li><p>가</p><p></p><p>나</p></li></ul>')
    expect(r.html).toBe('<ul><li><p>가</p><p>나</p></li></ul>')
  })
})

// Tab/Shift+Tab: 커서만 있으면 그 줄만, 블록 잡으면 잡힌 줄 전부 (2026-11-24)
import { indentListLine } from './tiptapExtensions'
describe('줄 단위 들여쓰기', () => {
  const mk = (html: string) => new Editor({ extensions: [...BASE_TIPTAP_EXTENSIONS, ToggleInputRules], content: html })
  const at = (ed: Editor, text: string, end?: string) => {
    let a = -1, b = -1
    ed.state.doc.descendants((n, p) => { if (n.isText && n.text === text) a = end ? p : p + 1; if (end && n.isText && n.text === end) b = p + n.text.length }) // 블록 = 첫 글자 앞 ~ 마지막 글자 뒤(화면에 칠해지는 범위)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, a, b < 0 ? a : b)))
  }
  const html = (ed: Editor) => ed.getHTML().replace(/<p><\/p>$/, '')
  it('제보 그대로: 중간 Enter로 하위 항목을 데려간 줄을 Tab → 그 줄만 들어가고 A·B는 제 단계', () => {
    const ed = mk('<ul><li><p>가나</p></li><li><p>다라</p><ul><li><p>A</p></li><li><p>B</p></li></ul></li></ul>')
    at(ed, '다라')
    expect(indentListLine(ed, 'in')).toBe(true)
    expect(html(ed)).toBe('<ul><li><p>가나</p><ul><li><p>다라</p></li><li><p>A</p></li><li><p>B</p></li></ul></li></ul>')
    ed.destroy()
  })
  it('블록 잡고 Tab → 잡힌 줄 전부 들어감', () => {
    const ed = mk('<ul><li><p>가</p></li><li><p>나</p></li><li><p>다</p></li></ul>')
    at(ed, '나', '다')
    indentListLine(ed, 'in')
    expect(html(ed)).toBe('<ul><li><p>가</p><ul><li><p>나</p></li><li><p>다</p></li></ul></li></ul>')
    ed.destroy()
  })
  it('Shift+Tab 커서만 → 그 줄만 나오고 하위 항목은 제 단계(위 형제 밑으로)', () => {
    const ed = mk('<ul><li><p>가</p><ul><li><p>나</p></li><li><p>다</p><ul><li><p>A</p></li></ul></li></ul></li></ul>')
    at(ed, '다')
    indentListLine(ed, 'out')
    expect(html(ed)).toBe('<ul><li><p>가</p><ul><li><p>나</p><ul><li><p>A</p></li></ul></li></ul></li><li><p>다</p></li></ul>')
    ed.destroy()
  })
  it('블록 잡고 Shift+Tab → 잡힌 줄 전부 나옴', () => {
    const ed = mk('<ul><li><p>가</p><ul><li><p>나</p></li><li><p>다</p></li></ul></li></ul>')
    at(ed, '나', '다')
    indentListLine(ed, 'out')
    expect(html(ed)).toBe('<ul><li><p>가</p></li><li><p>나</p></li><li><p>다</p></li></ul>')
    ed.destroy()
  })
})
