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
