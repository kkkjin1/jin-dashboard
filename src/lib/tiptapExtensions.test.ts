import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BASE_TIPTAP_EXTENSIONS, legacyToHtml, legacyPlainText, moveBlockInToggle } from './tiptapExtensions'

// ── 예전 형식(순수 텍스트) 회의록 → HTML ────────────────────────────────────
describe('legacyToHtml (예전 형식 회의록 변환)', () => {
  const textOf = (html: string) => (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, '')

  const SAMPLE = [
    '# 주간 회의',
    '1. 채용 현황',
    '1) 개발 2명 **최종** 진행',
    '- R&R 정리 필요',
    '▫ A<B 비교안',
    '2. 평가',
    '',
    '',
    '',
    '!!마감 엄수!! ==중요== ~~취소~~ {blue}파랑{/blue}',
    '> 결론',
  ].join('\n')

  it('변환해도 글자가 하나도 빠지지 않는다 — 경영진 회의록 11건 일괄 변환 기준', () => {
    expect(textOf(legacyToHtml(SAMPLE))).toBe(legacyPlainText(SAMPLE))
  })

  it('<, & 같은 글자는 태그로 읽히지 않는다', () => {
    const html = legacyToHtml('A<B 그리고 R&R')
    expect(html).toContain('A&lt;B')
    expect(html).toContain('R&amp;R')
  })

  it('빈 줄이 여러 개여도 빈 문단은 하나만', () => {
    expect(legacyToHtml('가\n\n\n\n나')).toBe('<p>가</p><p></p><p>나</p>')
  })

  it('끊긴 번호는 원래 번호로 이어진다(2.가 1.로 보이지 않게)', () => {
    expect(legacyToHtml('1. 하나\n설명\n2. 둘')).toContain('<ol start="2"')
  })

  it('이미 HTML이면 다시 변환하지 않는다', () => {
    expect(legacyToHtml('<p>이미 HTML</p>')).toBe('<p>이미 HTML</p>')
  })
})

// ── 편집기 동작 ────────────────────────────────────────────────────────────
let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function makeEditor(content: string): Editor {
  editor = new Editor({ element: document.createElement('div'), extensions: BASE_TIPTAP_EXTENSIONS, content })
  return editor
}
function cursorAtEndOf(ed: Editor, text: string) {
  let pos = -1
  ed.state.doc.descendants((n, p) => { if (n.isText && n.text?.includes(text)) pos = p + n.text.indexOf(text) + text.length })
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)))
}
function pressEnter(ed: Editor) {
  ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}
function typeText(ed: Editor, text: string) {
  ed.view.dispatch(ed.state.tr.insertText(text))
}
// 편집기(StarterKit TrailingNode)는 문서 끝이 토글이면 빈 줄을 하나 덧붙인다 — 실제 화면과 같은 동작이라 빼고 센다
function blocks(ed: Editor) {
  const out: import('@tiptap/pm/model').Node[] = []
  ed.state.doc.forEach(n => out.push(n))
  while (out.length > 1 && out[out.length - 1].type.name === 'paragraph' && out[out.length - 1].content.size === 0) out.pop()
  return out
}
function marksOf(ed: Editor, text: string): string[] {
  let names: string[] = []
  ed.state.doc.descendants(n => { if (n.isText && n.text === text) names = n.marks.map(m => m.type.name === 'textStyle' && m.attrs.color ? 'textStyle:color' : m.type.name) })
  return names
}

describe('Enter로 줄 나누면 빨간펜·형광펜 끊기 — 0910dea 회귀 방지', () => {
  it('형광펜(Alt+2) 줄 끝에서 Enter → 새 줄 글자에는 형광펜이 없다', () => {
    const ed = makeEditor('<p><mark data-color="#fde047" style="background-color:#fde047">형광</mark></p>')
    cursorAtEndOf(ed, '형광')
    pressEnter(ed)
    typeText(ed, '새줄')
    expect(ed.state.doc.childCount).toBe(2)
    expect(marksOf(ed, '새줄')).not.toContain('highlight')
  })

  it('빨간펜(Alt+1 글자색) 줄 끝에서 Enter → 새 줄은 색 없음', () => {
    const ed = makeEditor('<p><span style="color:#EF4444">빨강</span></p>')
    cursorAtEndOf(ed, '빨강')
    pressEnter(ed)
    typeText(ed, '새줄')
    expect(ed.state.doc.childCount).toBe(2)
    expect(marksOf(ed, '새줄').some(m => m.endsWith(':color'))).toBe(false)
  })

  it('굵게는 다음 줄로 그대로 이어진다(펜 서식만 끊는다)', () => {
    const ed = makeEditor('<p><strong>굵게</strong></p>')
    cursorAtEndOf(ed, '굵게')
    ed.commands.setMark('bold')
    pressEnter(ed)
    typeText(ed, '새줄')
    expect(marksOf(ed, '새줄')).toContain('bold')
  })
})

describe('토글 안팎 이동(Tab / Shift+Tab) — dc246a3 회귀 방지', () => {
  const TOGGLE = '<details open><summary>토글</summary><div data-type="detailsContent"><p></p></div></details>'

  it('토글 바로 아래 줄을 안으로 넣으면 빈 줄을 대체하고 글은 그대로', () => {
    const ed = makeEditor(TOGGLE + '<p>넣을 줄</p>')
    cursorAtEndOf(ed, '넣을 줄')
    expect(moveBlockInToggle(ed as never, 'in')).toBe(true)
    expect(blocks(ed)).toHaveLength(1)
    const content = ed.state.doc.firstChild!.lastChild!
    expect(content.childCount).toBe(1)
    expect(content.textContent).toBe('넣을 줄')
  })

  it('안에서 꺼내면 토글 바로 아래로 나오고, 토글 안엔 빈 줄이 남는다', () => {
    const ed = makeEditor('<details open><summary>토글</summary><div data-type="detailsContent"><p>꺼낼 줄</p></div></details>')
    cursorAtEndOf(ed, '꺼낼 줄')
    expect(moveBlockInToggle(ed as never, 'out')).toBe(true)
    expect(blocks(ed)).toHaveLength(2)
    expect(blocks(ed)[1].textContent).toBe('꺼낼 줄')
    expect(ed.state.doc.firstChild!.lastChild!.textContent).toBe('')
  })

  it('토글 밖 맨 위 줄은 위로 못 옮긴다(false)', () => {
    const ed = makeEditor('<p>맨 위</p><p>둘째</p>')
    cursorAtEndOf(ed, '맨 위')
    expect(moveBlockInToggle(ed as never, 'up')).toBe(false)
  })
})

describe('편집기 왕복 저장 — 저장된 HTML을 다시 열어도 내용 유지', () => {
  it('토글·목록·형광펜·질문 표시가 열고 다시 저장해도 사라지지 않는다', () => {
    const html = '<details open><summary>토글</summary><div data-type="detailsContent"><ul><li><p>항목</p></li></ul></div></details>'
      + '<p data-qa="q">질문</p><p><mark data-color="#fde047" style="background-color:#fde047">형광</mark></p>'
    const out = makeEditor(html).getHTML()
    expect(out).toContain('<details')
    expect(out).toContain('<li>')
    expect(out).toContain('data-qa="q"')
    expect(out).toContain('<mark')
  })
})
