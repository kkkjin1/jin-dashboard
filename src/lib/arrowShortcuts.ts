import { Extension } from '@tiptap/react'
import { Plugin } from '@tiptap/pm/state'

// "->" / "<-" / "<->" 타이핑 시 화살표 문자로 즉시 치환.
// "<-"는 일단 즉시 "←"로 바뀌지만, 바로 이어서 ">"를 치면 그 "←"를 "↔"로 승격시킨다
// (그래서 "<->"를 순서대로 입력해도 중간에 "←" 상태를 거쳐 자연스럽게 "↔"가 된다).
function resolveReplacement(char: string, before: string): string | null {
  if (char === '-' && before === '<') return '←'
  if (char === '>' && before === '-') return '→'
  if (char === '>' && before === '←') return '↔'
  return null
}

// 리치텍스트 에디터(Tiptap)용
export const ArrowShortcuts = Extension.create({
  name: 'arrowShortcuts',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput(view, from, to, text) {
            if (text !== '-' && text !== '>') return false
            if (from < 1) return false
            const before = view.state.doc.textBetween(from - 1, from)
            const replacement = resolveReplacement(text, before)
            if (!replacement) return false
            view.dispatch(view.state.tr.delete(from - 1, to).insertText(replacement, from - 1))
            return true
          },
        },
      }),
    ]
  },
})

// 일반 <input>/<textarea>용 — 전역 input 이벤트를 캡처해서 치환
export function installArrowShortcuts(): () => void {
  function onInput(e: Event) {
    const ie = e as InputEvent
    if (ie.inputType !== 'insertText' || !ie.data) return
    const char = ie.data
    if (char !== '-' && char !== '>') return

    const target = e.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    if (target instanceof HTMLInputElement && target.type !== 'text' && target.type !== 'search') return

    const pos = target.selectionStart
    if (pos == null || pos < 2) return
    const value = target.value
    const before = value[pos - 2] ?? ''
    const replacement = resolveReplacement(char, before)
    if (!replacement) return

    const newValue = value.slice(0, pos - 2) + replacement + value.slice(pos)
    const newPos = pos - 1

    const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
    setter.call(target, newValue)
    target.setSelectionRange(newPos, newPos)
    target.dispatchEvent(new Event('input', { bubbles: true }))
  }

  document.addEventListener('input', onInput, true)
  return () => document.removeEventListener('input', onInput, true)
}
