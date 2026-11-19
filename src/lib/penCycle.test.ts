import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BASE_TIPTAP_EXTENSIONS, cyclePenColor, cycleHighlight } from './tiptapExtensions'

// Alt+1/Alt+2 누를 때마다 색 순환 + Ctrl+Y 취소선 (2026-11-19)
function make() {
  const ed = new Editor({ extensions: BASE_TIPTAP_EXTENSIONS, content: '<p>가나다</p>' })
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 4)))
  return ed
}

describe('Alt+1 글자색 순환', () => {
  it('빨강 → 파랑 → 흐림 → 해제', () => {
    const ed = make()
    const seen: (string | undefined)[] = []
    for (let i = 0; i < 4; i++) { cyclePenColor(ed); seen.push(ed.getAttributes('textStyle').color) }
    expect(seen).toEqual(['#EF4444', '#3B82F6', '#9CA3AF', undefined])
    expect(ed.getHTML()).toBe('<p>가나다</p>')
    ed.destroy()
  })
})

describe('Alt+2 형광펜 순환', () => {
  it('노랑 → 초록 → 분홍 → 해제', () => {
    const ed = make()
    const seen: (string | null)[] = []
    for (let i = 0; i < 4; i++) { cycleHighlight(ed); seen.push(ed.isActive('highlight') ? ed.getAttributes('highlight').color : null) }
    expect(seen).toEqual(['#FEF08A', '#BBF7D0', '#FBCFE8', null])
    ed.destroy()
  })
})

describe('서식 단축키', () => {
  const press = (ed: Editor, key: string) => {
    const ev = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true })
    ed.view.someProp('handleKeyDown', f => f(ed.view, ev))
  }
  it('Ctrl+Y 취소선 · Ctrl+U 밑줄 · Ctrl+I 기울임', () => {
    const ed = make()
    press(ed, 'y'); press(ed, 'u'); press(ed, 'i')
    expect(ed.isActive('strike')).toBe(true)
    expect(ed.isActive('underline')).toBe(true)
    expect(ed.isActive('italic')).toBe(true)
    ed.destroy()
  })
})
