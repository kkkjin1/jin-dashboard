// 생각스케치 전용 "block(줄) 단위 A-/A+ 글자크기" — Quick Memo에는 없는 기능이라
// 공용 tiptapExtensions.ts가 아니라 여기 별도로 둔다. paragraph/heading 노드에
// fontSize 속성을 붙여 인라인 style로 렌더링 — 기존 raw contentEditable이
// block.style.fontSize를 직접 건드리던 것과 시각적으로 동일한 결과를 낸다.
import { Extension } from '@tiptap/core'

const FONT_SIZE_NODE_TYPES = ['paragraph', 'heading']

// 이름을 fontSize/setFontSize로 두면 @tiptap/extension-text-style이 이미 전역
// 선언한 (character mark 기반, selection 필수) fontSize 커맨드와 타입이 충돌한다.
// 여기서 원하는 건 "선택 없이 커서 위치의 block 전체"에 적용되는 별개 의미라
// blockFontSize로 이름을 분리한다.
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockFontSize: {
      setBlockFontSize: (size: number) => ReturnType
      unsetBlockFontSize: () => ReturnType
    }
  }
}

export const FontSize = Extension.create({
  name: 'blockFontSize',

  addGlobalAttributes() {
    return [{
      types: FONT_SIZE_NODE_TYPES,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => {
            const size = element.style.fontSize
            return size ? parseFloat(size) : null
          },
          renderHTML: attributes => {
            if (!attributes.fontSize) return {}
            return { style: `font-size:${attributes.fontSize}px` }
          },
        },
      },
    }]
  },

  addCommands() {
    return {
      setBlockFontSize: (size: number) => ({ tr, state, dispatch }) => {
        const { from, to } = state.selection
        let applied = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (FONT_SIZE_NODE_TYPES.includes(node.type.name)) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, fontSize: size })
            applied = true
          }
        })
        if (!applied) {
          const { $from } = state.selection
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (FONT_SIZE_NODE_TYPES.includes(node.type.name)) {
              tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, fontSize: size })
              applied = true
              break
            }
          }
        }
        if (applied && dispatch) dispatch(tr)
        return applied
      },
      unsetBlockFontSize: () => ({ tr, state, dispatch }) => {
        const { from, to } = state.selection
        let applied = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (FONT_SIZE_NODE_TYPES.includes(node.type.name) && node.attrs.fontSize) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, fontSize: null })
            applied = true
          }
        })
        if (applied && dispatch) dispatch(tr)
        return applied
      },
    }
  },
})

/** 현재 커서(또는 선택 시작 지점)가 속한 block의 fontSize — 없으면 fallback. */
export function getCurrentBlockFontSize(state: { selection: { $from: import('@tiptap/pm/model').ResolvedPos } }, fallback: number): number {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (FONT_SIZE_NODE_TYPES.includes(node.type.name)) {
      return typeof node.attrs.fontSize === 'number' ? node.attrs.fontSize : fallback
    }
  }
  return fallback
}
