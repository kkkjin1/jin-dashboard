import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BASE_TIPTAP_EXTENSIONS, legacyToHtml, legacyPlainText, moveBlockInToggle, syncSelectionFromDom } from './tiptapExtensions'

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

// ── Alt+1 전에 화면 선택 동기화 — 2026-11-18 빠른 메모 "위쪽 행 서식 풀림" 회귀 방지 ──
describe('syncSelectionFromDom (화면 선택 ↔ 편집기 선택)', () => {
  it('편집기 선택이 위쪽 빨강 범위에 남아 있어도 Alt+1은 화면에서 잡은 글자에만 적용된다', () => {
    const el = document.createElement('div'); document.body.appendChild(el)
    const ed = new Editor({ element: el, extensions: BASE_TIPTAP_EXTENSIONS,
      content: '<p>7행 <span style="color:#EF4444">빨강글자</span></p><p>11행 새글자</p>' })
    editor = ed
    // 편집기 선택: 7행 "빨강글자" (예전에 서식 준 범위가 남은 상태)
    let redFrom = -1
    ed.state.doc.descendants((n, p) => { if (n.isText && n.text === '빨강글자') redFrom = p })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, redFrom, redFrom + 4)))
    // 화면 선택: 11행 "새글자" — 편집기에는 아직 반영 안 된 상태를 흉내(이벤트 없이 DOM만 바꿈)
    const textNode = [...el.querySelectorAll('p')][1].firstChild as Text
    const off = textNode.data.indexOf('새글자')
    const domSel = document.getSelection()!
    const observer = (ed.view as unknown as { domObserver: { stop(): void; start(): void } }).domObserver
    observer.stop()
    domSel.setBaseAndExtent(textNode, off, textNode, off + 3)
    observer.start()
    syncSelectionFromDom(ed)
    ed.isActive('textStyle', { color: '#EF4444' }) ? ed.chain().unsetColor().run() : ed.chain().setColor('#EF4444').run()
    expect(ed.getHTML()).toContain('<span style="color: rgb(239, 68, 68);">빨강글자</span>')
    expect(ed.getHTML()).toMatch(/11행 <span style="color: (rgb\(239, 68, 68\)|#EF4444);">새글자<\/span>/)
    el.remove()
  })
})

// ── 공백 줄로 갈라진 아래 번호 목록 다시 매기기 — 2026-11-18 제보 회귀 방지 ──
describe('번호 목록 "4. " 다시 입력 → 아래 항목이 이어받음', () => {
  const START = '<ol><li><p>일</p></li><li><p>이</p></li><li><p>삼</p><ol><li><p>가</p></li><li><p>나</p></li></ol></li></ol><p></p><ol><li><p>사</p></li><li><p>오</p></li></ol>'
  function typeWithRules(ed: Editor, s: string) {
    for (const ch of s) {
      const { from, to } = ed.state.selection
      const handled = ed.view.someProp('handleTextInput', f => f(ed.view, from, to, ch, () => ed.state.tr.insertText(ch, from, to)))
      if (!handled) ed.view.dispatch(ed.state.tr.insertText(ch, from, to))
    }
  }
  function lowerList(ed: Editor) {
    let found: import('@tiptap/pm/model').Node | null = null
    ed.state.doc.forEach(n => { if (n.type.name === 'orderedList') found = n })
    return found as unknown as import('@tiptap/pm/model').Node
  }
  function placeAt(ed: Editor, text: string, end: boolean) {
    let pos = -1
    ed.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === text) pos = p + (end ? text.length : 0) })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)))
  }

  it('"1."이 된 줄의 글자를 지우고 그 자리에 "4. " → 목록이 4부터, 아래 줄은 5', () => {
    const ed = makeEditor(START)
    placeAt(ed, '사', true)
    ed.view.dispatch(ed.state.tr.delete(ed.state.selection.from - 1, ed.state.selection.from))
    typeWithRules(ed, '4. 사')
    const list = lowerList(ed)
    expect(list.attrs.start).toBe(4)
    expect(list.childCount).toBe(2)
    expect(list.textContent).toBe('사오')
  })

  it('첫 항목 글자 앞에 "4. " → 같은 결과(글자로 남지 않음)', () => {
    const ed = makeEditor(START)
    placeAt(ed, '사', false)
    typeWithRules(ed, '4. ')
    const list = lowerList(ed)
    expect(list.attrs.start).toBe(4)
    expect(list.textContent).toBe('사오')
  })

  it('중간 항목 앞의 "4. "는 기존대로 글자로 둔다', () => {
    const ed = makeEditor(START)
    placeAt(ed, '오', false)
    typeWithRules(ed, '4. ')
    expect(lowerList(ed).attrs.start).toBe(1)
    expect(lowerList(ed).textContent).toBe('사4. 오')
  })
})

describe('가로줄(슬라이드 나눔) 편집 묶음 — 2026-11-18', () => {
  it('편집 화면은 [⠿][줄][×]로 그려도 저장 HTML은 그대로 <hr>', () => {
    const ed = makeEditor('<p>가</p><hr><p>나</p>')
    expect(ed.view.dom.querySelector('.hr-block .hr-handle')).not.toBeNull()
    expect(ed.getHTML()).toBe('<p>가</p><hr><p>나</p>')
  })
  it('× 누르면 그 줄만 지워진다', () => {
    const ed = makeEditor('<p>가</p><hr><p>나</p><hr><p>다</p>')
    ;(ed.view.dom.querySelectorAll('.hr-delete')[0] as HTMLButtonElement).click()
    expect(ed.getHTML()).toBe('<p>가</p><p>나</p><hr><p>다</p>')
  })
  it('--- 입력하면 가로줄이 생긴다', () => {
    const ed = makeEditor('<p></p>')
    for (const ch of '---') {
      const { from, to } = ed.state.selection
      const ok = ed.view.someProp('handleTextInput', f => f(ed.view, from, to, ch, () => ed.state.tr.insertText(ch, from, to)))
      if (!ok) ed.view.dispatch(ed.state.tr.insertText(ch, from, to))
    }
    expect(ed.getHTML()).toContain('<hr>')
  })
})
