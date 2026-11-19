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
