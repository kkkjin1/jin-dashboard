// Quick Memo(TiptapEditor.tsx)와 생각스케치(SketchTextEditor.tsx)가 공유하는 Tiptap
// 편집기 코어 — extension 구성 + 레거시 콘텐츠 로딩 + 중첩 리스트 backspace/delete
// 보정. 두 에디터가 동일한 문서 스키마/Markdown input rule을 쓰도록 이 모듈만 참조한다.
import { mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import OrderedList from '@tiptap/extension-ordered-list'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { ArrowShortcuts } from '@/lib/arrowShortcuts'
import { collapseEmptyParagraphs } from '@/lib/htmlCleanup'

// ── 레거시 콘텐츠(구버전 순수 텍스트 표기) → HTML 변환 ────────────────────────

const COLOR_MAP: Record<string, string> = {
  red: '#EF4444', blue: '#3B82F6', green: '#22C55E',
  orange: '#F97316', purple: '#A855F7', gray: '#9CA3AF',
}

function inlineToHtml(text: string): string {
  let s = text
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__(.+?)__/g, '<u>$1</u>')
  s = s.replace(/!!(.+?)!!/g, '<span style="color:#EF4444">$1</span>')
  s = s.replace(/==(.+?)==/g, '<mark style="background:rgba(250,204,21,0.35);border-radius:2px;padding:0 2px">$1</mark>')
  s = s.replace(/~~(.+?)~~/g, '<s>$1</s>')
  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    s = s.replace(new RegExp(`\\{${name}\\}(.+?)\\{\\/${name}\\}`, 'g'), `<span style="color:${hex}">$1</span>`)
  }
  return s
}

const NUM_RE  = /^(\d+)\.\s+(.*)$/
const PAR_RE  = /^(\d+)\)\s+(.*)$/
const KOR_RE  = /^([가나다라마바사아자차카타파하])[.)]\s*(.*)$/
const BULL_RE = /^[-*▪●■]\s+(.*)$/
const SUBB_RE = /^[▫○□]\s+(.*)$/

type LegacyKind = 'ol1' | 'ol2' | 'ul3' | 'ul4' | 'h1' | 'h2' | 'h3' | 'quote' | 'blank' | 'text'
interface LegacyLine { kind: LegacyKind; body: string }

// Convert old custom markdown → HTML for Tiptap loading
// Hierarchy: 1. → 1) / 가. → • → ○
export function legacyToHtml(text: string): string {
  if (!text) return '<p></p>'
  if (text.trimStart().startsWith('<')) return collapseEmptyParagraphs(text)

  // 연달아 여러 줄이 비어있어도 빈 <p>는 1개만 생성되도록 미리 합친다
  const normalized = text.replace(/\n{3,}/g, '\n\n')
  const parsed: LegacyLine[] = normalized.split('\n').map(raw => {
    const t = raw.trimStart()
    const num  = t.match(NUM_RE)
    const par  = t.match(PAR_RE)
    const kor  = t.match(KOR_RE)
    const bull = t.match(BULL_RE)
    const subb = t.match(SUBB_RE)
    if (num)  return { kind: 'ol1',   body: num[2] }
    if (par)  return { kind: 'ol2',   body: par[2] }
    if (kor)  return { kind: 'ol2',   body: kor[2] }
    if (bull) return { kind: 'ul3',   body: bull[1] }
    if (subb) return { kind: 'ul4',   body: subb[1] }
    if (t.startsWith('# '))   return { kind: 'h1',    body: t.slice(2) }
    if (t.startsWith('## '))  return { kind: 'h2',    body: t.slice(3) }
    if (t.startsWith('### ')) return { kind: 'h3',    body: t.slice(4) }
    if (t.startsWith('> '))   return { kind: 'quote', body: t.slice(2) }
    if (t === '')             return { kind: 'blank',  body: '' }
    return { kind: 'text', body: t }
  })

  let html = ''
  let i = 0

  while (i < parsed.length) {
    const item = parsed[i]

    if (item.kind === 'ol1') {
      html += '<ol>'
      while (i < parsed.length && ['ol1', 'ol2', 'ul3', 'ul4'].includes(parsed[i].kind)) {
        if (parsed[i].kind === 'ol1') {
          html += `<li>${inlineToHtml(parsed[i].body)}`
          i++
          // Collect sub-items belonging to this ol1 item
          if (i < parsed.length && parsed[i].kind === 'ol2') {
            html += '<ol>'
            while (i < parsed.length && parsed[i].kind === 'ol2') {
              html += `<li>${inlineToHtml(parsed[i].body)}`
              i++
              if (i < parsed.length && parsed[i].kind === 'ul3') {
                html += '<ul>'
                while (i < parsed.length && (parsed[i].kind === 'ul3' || parsed[i].kind === 'ul4')) {
                  if (parsed[i].kind === 'ul3') {
                    html += `<li>${inlineToHtml(parsed[i].body)}`
                    i++
                    if (i < parsed.length && parsed[i].kind === 'ul4') {
                      html += '<ul>'
                      while (i < parsed.length && parsed[i].kind === 'ul4') {
                        html += `<li>${inlineToHtml(parsed[i].body)}</li>`
                        i++
                      }
                      html += '</ul>'
                    }
                    html += '</li>'
                  } else { break }
                }
                html += '</ul>'
              }
              html += '</li>'
            }
            html += '</ol>'
          } else if (i < parsed.length && parsed[i].kind === 'ul3') {
            html += '<ul>'
            while (i < parsed.length && (parsed[i].kind === 'ul3' || parsed[i].kind === 'ul4')) {
              if (parsed[i].kind === 'ul3') {
                html += `<li>${inlineToHtml(parsed[i].body)}`
                i++
                if (i < parsed.length && parsed[i].kind === 'ul4') {
                  html += '<ul>'
                  while (i < parsed.length && parsed[i].kind === 'ul4') {
                    html += `<li>${inlineToHtml(parsed[i].body)}</li>`
                    i++
                  }
                  html += '</ul>'
                }
                html += '</li>'
              } else { break }
            }
            html += '</ul>'
          }
          html += '</li>'
        } else {
          // ol2/ul3/ul4 without preceding ol1 — treat as standalone within this ol
          html += `<li>${inlineToHtml(parsed[i].body)}</li>`
          i++
        }
      }
      html += '</ol>'
    } else if (item.kind === 'ol2') {
      html += '<ol>'
      while (i < parsed.length && parsed[i].kind === 'ol2') {
        html += `<li>${inlineToHtml(parsed[i].body)}</li>`
        i++
      }
      html += '</ol>'
    } else if (item.kind === 'ul3') {
      html += '<ul>'
      while (i < parsed.length && (parsed[i].kind === 'ul3' || parsed[i].kind === 'ul4')) {
        if (parsed[i].kind === 'ul3') {
          html += `<li>${inlineToHtml(parsed[i].body)}`
          i++
          if (i < parsed.length && parsed[i].kind === 'ul4') {
            html += '<ul>'
            while (i < parsed.length && parsed[i].kind === 'ul4') {
              html += `<li>${inlineToHtml(parsed[i].body)}</li>`
              i++
            }
            html += '</ul>'
          }
          html += '</li>'
        } else { break }
      }
      html += '</ul>'
    } else if (item.kind === 'ul4') {
      html += '<ul>'
      while (i < parsed.length && parsed[i].kind === 'ul4') {
        html += `<li>${inlineToHtml(parsed[i].body)}</li>`
        i++
      }
      html += '</ul>'
    } else if (item.kind === 'h1') { html += `<h1>${inlineToHtml(item.body)}</h1>`; i++
    } else if (item.kind === 'h2') { html += `<h2>${inlineToHtml(item.body)}</h2>`; i++
    } else if (item.kind === 'h3') { html += `<h3>${inlineToHtml(item.body)}</h3>`; i++
    } else if (item.kind === 'quote') { html += `<p><strong>${inlineToHtml(item.body)}</strong></p>`; i++
    } else if (item.kind === 'blank') { html += '<p></p>'; i++
    } else { html += `<p>${inlineToHtml(item.body)}</p>`; i++ }
  }

  return html || '<p></p>'
}

// ── 공용 확장 구성 ────────────────────────────────────────────────────────────

// list-style:none + CSS counter로 4단계(1. → 1) → • → ○) 넘버링을 직접 그리다 보니
// counter-reset이 항상 0에서 시작해서, "2."를 입력해 만든 ol의 start="2"가 화면엔
// 반영 안 되고 무조건 1부터 보이는 문제가 있었다 — start를 --ol-start CSS 변수로도
// 내보내서 globals.css의 counter-reset이 그 값에서 이어가도록 한다.
export const CustomOrderedList = OrderedList.extend({
  renderHTML({ HTMLAttributes }) {
    const { start, type, ...rest } = HTMLAttributes
    const attrs = mergeAttributes(this.options.HTMLAttributes, rest)
    // --ol-start는 CSS 커스텀 프로퍼티라 상속된다 — start===1이라고 style을 안 쓰면
    // 조상 <ol>이 설정해둔 --ol-start를 그대로 물려받아 카운터가 엉뚱한 값에서 시작한다
    // (예: start=2인 리스트 밑에 새로 생긴 start=1 하위 리스트가 "1)" 대신 "2)"로 보임).
    // start값과 무관하게 항상 자기 자신에 명시해서 상속을 차단한다.
    attrs.style = `--ol-start:${start - 1}`
    if (start !== 1) {
      attrs.start = start
    }
    if (type && type !== '1') attrs.type = type
    return ['ol', attrs, 0]
  },
})

// 모듈 레벨 상수 — 렌더마다 새 참조 생성 방지 (Tiptap v3에서 extensions 참조 변경 시 refreshEditorInstance 호출됨)
// Quick Memo/생각스케치가 공유하는 최소 코어. Quick Memo 전용 기능(Image 붙여넣기 등)은
// 각 에디터가 이 배열 위에 자신만 추가한다.
export const BASE_TIPTAP_EXTENSIONS = [
  StarterKit.configure({ orderedList: false }),  // StarterKit v3에 Underline 포함
  CustomOrderedList,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  ArrowShortcuts,
]

// ── 중첩 리스트 backspace/delete 보정 (Quick Memo/생각스케치 공용) ─────────────

// Backspace on an already-empty, childless list item: ProseMirror's default
// liftListItem chain (StarterKit's ListKeymap) outdents the item one level per
// press instead of removing it, and — when the item isn't the last child of
// its list — that lift SPLITS the surrounding orderedList into separate
// sibling ol nodes (nesting the trailing siblings underneath the lifted item).
// Each split-off ol keeps the default start=1, so a later item that used to
// read "3." renders as "1." once it lands in its own detached ol. Nested lists
// several levels deep can cascade through this on repeated backspaces until it
// reaches the top-level list. Intercepting only this exact case (empty leaf
// item, cursor at its start) and splicing the listItem straight out of its
// parent list's content sidesteps the lift chain entirely, so numbering for
// every remaining sibling stays correct automatically (same ol, same CSS
// counter). All other backspace/delete behavior is untouched.
export function removeEmptyListItemOnBackspace(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.parentOffset !== 0) return false
  if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false
  if ($from.depth < 3) return false

  const liDepth = $from.depth - 1
  const li = $from.node(liDepth)
  if (li.type.name !== 'listItem' || li.childCount !== 1) return false
  const list = $from.node(liDepth - 1)
  if (!list || (list.type.name !== 'orderedList' && list.type.name !== 'bulletList')) return false

  const liStart = $from.before(liDepth)
  const liEnd = $from.after(liDepth)

  return editor.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    if (list.childCount === 1) {
      // Sole item in this list — the whole list node goes away, not just the item.
      const listStart = $from.before(liDepth - 1)
      const listEnd = $from.after(liDepth - 1)
      const listParent = $from.node(liDepth - 2)
      if (listParent && listParent.type.name === 'listItem') {
        // This list is nested inside another listItem, whose content model
        // ("paragraph block*") guarantees a paragraph already precedes it —
        // deleting the list outright leaves that parent listItem with valid,
        // untouched content. Replacing it with an empty paragraph instead (as
        // below) would leave that placeholder behind as a second paragraph
        // sibling inside the parent listItem — a residue that the guard above
        // (`li.childCount !== 1`) can no longer recognize as "the empty list
        // item" on the next Backspace, so it falls through to Tiptap's default
        // ListKeymap handling, which lifts the whole parent item out of its
        // list one level per keystroke — splitting the surrounding ordered
        // list in two once it reaches the top level. Deleting the list
        // in-place avoids ever creating that residue.
        tr.delete(listStart, listEnd)
        tr.setSelection(TextSelection.near(tr.doc.resolve(listStart), -1))
      } else {
        // Top-level (or otherwise non-listItem-nested) list — its container
        // doesn't already have other content guaranteeing validity, so
        // collapse to an empty paragraph instead of deleting outright.
        tr.replaceWith(listStart, listEnd, state.schema.nodes.paragraph.create())
        tr.setSelection(TextSelection.near(tr.doc.resolve(listStart + 1)))
      }
    } else {
      tr.delete(liStart, liEnd)
      tr.setSelection(TextSelection.near(tr.doc.resolve(liStart), -1))
    }
    dispatch(tr)
    return true
  }).run()
}

// Backspace on an empty paragraph that is a listItem's FIRST child, where that
// listItem's ONLY other content is a nested list (childCount === 2): the
// listItem itself isn't empty/removable the way removeEmptyListItemOnBackspace
// handles (it has real content — the nested list), so that function's
// `childCount !== 1` guard correctly leaves this case alone. Left untouched,
// it falls to Tiptap's default ListKeymap, whose handleBackspace only checks
// "cursor at offset 0 inside some listItem" and calls liftListItem — which,
// for a listItem carrying a nested list, lifts the WHOLE item (empty
// paragraph + nested list) out via prosemirror-schema-list. When this listItem
// sits directly in the outermost list, that lift routes to liftOutOfList
// (confirmed via prosemirror-schema-list source: liftToOuterList only runs
// when the list's own parent is itself a listItem, which isn't the case here),
// and liftOutOfList unwraps the nested list to bare top-level flow content and
// splits the surrounding ordered list in two around the removed item — same
// class of split/renumber corruption as the leaf-item bug above, but via a
// different trigger (a non-leaf item with a real nested child, not a residue).
//
// Confirmed by inspection that neither prosemirror-schema-list helper fits:
// liftOutOfList has no rejoin step (that's the bug itself), and liftToOuterList
// can't even be reached here (and would be unsafe to force, since its
// ReplaceAroundStep assumes an outer listItem to wrap trailing siblings into).
// So this case is handled the same way as every other handler in this file —
// a direct, precisely-targeted transaction, no lift command involved: replace
// the whole listItem with its nested list's own listItem children, splicing
// them into the parent list at the same slot. The nested list's internal
// structure (its own further nesting, if any) is copied over unchanged since
// we move its `content` Fragment as-is — only the nested list's own wrapper
// node is discarded, nothing inside it is touched.
export function spliceNestedListOnBackspace(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.parentOffset !== 0) return false
  if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false
  if ($from.depth < 3) return false

  const liDepth = $from.depth - 1
  const li = $from.node(liDepth)
  if (li.type.name !== 'listItem') return false
  if ($from.index(liDepth) !== 0) return false
  if (li.childCount !== 2) return false
  const nestedList = li.child(1)
  if (nestedList.type.name !== 'orderedList' && nestedList.type.name !== 'bulletList') return false
  const list = $from.node(liDepth - 1)
  if (!list || (list.type.name !== 'orderedList' && list.type.name !== 'bulletList')) return false

  const liStart = $from.before(liDepth)
  const liEnd = $from.after(liDepth)

  return editor.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    tr.replaceWith(liStart, liEnd, nestedList.content)
    tr.setSelection(TextSelection.near(tr.doc.resolve(liStart + 1), 1))
    dispatch(tr)
    return true
  }).run()
}

// Delete (forward) at the very end of the last item of a nested list: the
// next textblock in document order lives in a shallower list (or a different
// branch entirely), so the default join-forward has to cross a depth
// boundary to reach it. Verified via before/after document JSON: the default
// relocates that next node bodily into the deeper list as an EXTRA sibling
// item without removing the current one — e.g. deleting forward at the end
// of "아" (last child of a level-3 list) pulled the unrelated level-2 item
// "아아" one level deeper, duplicating structure without deleting anything.
// That's a different failure (forward join mis-nesting a sibling) from the
// Backspace lift/split bug above (same-depth list splitting) — same
// "crossing a nested-list depth boundary" class of default-behavior bug, but
// a separate mechanism, so it needs its own handling.
//
// The desired behavior (confirmed with the reporter) isn't "block it" but
// "do the move correctly": delete the current leaf item, and if some
// ancestor list has a following sibling item (walking up past however many
// list levels have none), move THAT sibling node down to replace the current
// item's position — same slot, same depth, current item's own text/node
// discarded. E.g. deleting at the end of "무궁화" (last leaf of a level-3
// list nested three levels under "산이마") pulls "삼천리" — the next item of
// the level-1 list two levels up — down to become the new last item of that
// same level-3 list; "대한으로" then correctly becomes the level-1 list's
// item 2.
//
// Only intercepts the exact edge case: cursor at the true end of a leaf item
// (no nested sub-list of its own) that is the last child of its list. Every
// other Delete path (mid-text, non-last item, item with children) falls
// through untouched and keeps using Tiptap's default merge, which is already
// correct there.
export function pullAncestorSiblingOnDelete(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.parent.type.name !== 'paragraph' || $from.parentOffset !== $from.parent.content.size) return false
  if ($from.depth < 3) return false

  const liDepth = $from.depth - 1
  const li = $from.node(liDepth)
  if (li.type.name !== 'listItem' || li.childCount !== 1) return false
  const list = $from.node(liDepth - 1)
  if (!list || (list.type.name !== 'orderedList' && list.type.name !== 'bulletList')) return false
  if ($from.index(liDepth - 1) !== list.childCount - 1) return false // not the last item — default merge is safe

  // Walk up through ancestor (listItem, list) pairs looking for the first
  // level where the listItem owning the current nested list has a following
  // sibling in ITS OWN parent list. That sibling is what document order says
  // comes "next" after this whole branch — the item we pull down.
  let ownerLiDepth = liDepth - 2
  let targetParentListDepth = -1
  let targetIndex = -1
  while (ownerLiDepth >= 1) {
    const ownerLi = $from.node(ownerLiDepth)
    const ownerList = $from.node(ownerLiDepth - 1)
    if (!ownerLi || ownerLi.type.name !== 'listItem') break
    if (!ownerList || (ownerList.type.name !== 'orderedList' && ownerList.type.name !== 'bulletList')) break
    const idx = $from.index(ownerLiDepth - 1)
    if (idx < ownerList.childCount - 1) {
      targetParentListDepth = ownerLiDepth - 1
      targetIndex = idx + 1
      break
    }
    ownerLiDepth -= 2
  }
  // Nothing follows anywhere up the list-nesting chain — whatever comes next
  // in the document (if anything) lives outside every enclosing list entirely
  // (e.g. a plain paragraph right after the whole list), so there's no list
  // depth boundary left to cross. That's exactly the case Tiptap's default
  // forward-join already handles correctly — only the list-to-list crossing
  // above needed this custom transaction. Falling through to default here
  // (instead of swallowing the key) is what makes Delete at the end of a
  // last leaf item merge the next paragraph up, matching Backspace from the
  // other direction.
  if (targetIndex === -1) return false

  const targetParentList = $from.node(targetParentListDepth)
  const targetNode = targetParentList.child(targetIndex)
  const targetListStart = $from.start(targetParentListDepth)
  let targetFrom = targetListStart
  for (let i = 0; i < targetIndex; i++) targetFrom += targetParentList.child(i).nodeSize
  const targetTo = targetFrom + targetNode.nodeSize

  const curFrom = $from.before(liDepth)
  const curTo = $from.after(liDepth)
  // Current item is always nested inside the branch that precedes the target
  // sibling in the document, so curTo <= targetFrom always holds — deleting
  // the target first can't shift curFrom/curTo.

  return editor.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    tr.delete(targetFrom, targetTo)
    tr.delete(curFrom, curTo)
    tr.insert(curFrom, targetNode)
    tr.setSelection(TextSelection.near(tr.doc.resolve(curFrom + 1)))
    dispatch(tr)
    return true
  }).run()
}

/** Backspace/Delete 키다운에서 위 세 보정을 순서대로 시도 — 처리했으면 true. */
export function handleListKeymapWorkaround(editor: Editor, e: KeyboardEvent): boolean {
  if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (removeEmptyListItemOnBackspace(editor)) return true
    if (spliceNestedListOnBackspace(editor)) return true
  }
  if (e.key === 'Delete' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (pullAncestorSiblingOnDelete(editor)) return true
  }
  return false
}
