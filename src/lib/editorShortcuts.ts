// 편집기 Alt 단축키 판별 — 모든 편집기(TiptapEditor·생각스케치)와 회의록 읽기 화면이 같은 키를 쓴다.
// 2026-11-24 키 재배치(사용자 요청):
//   Alt+1 글자색 · Alt+2 형광펜(그대로)
//   Alt+3  고른 줄을 세로바(인용구)로 묶기/풀기 — 토글 안이면 그 토글 본문 안에서
//   Alt+Q / Alt+W  경영진 의견 줄 표시 CEO / CSO (예전 Alt+3 / Alt+4)
//   Alt+`  고른 글을 홈 '오늘 할 일'로 (예전 Alt+5)
// 키는 e.code로 판별한다(macOS Option+글자는 e.key가 특수문자, 한글 입력 상태에서도 e.code는 그대로).
// 한글 조합 중(isComposing)에는 무시 — 조합이 끝난 뒤 다시 누르면 된다.
import type { Editor } from '@tiptap/core'

const altOnly = (e: KeyboardEvent) => e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.isComposing

/** Alt+Q = CEO, Alt+W = CSO, 그 밖엔 null */
export function voiceTargetOfKey(e: KeyboardEvent): 'CEO' | 'CSO' | null {
  if (!altOnly(e)) return null
  return e.code === 'KeyQ' ? 'CEO' : e.code === 'KeyW' ? 'CSO' : null
}

/** Alt+3 — 세로바(인용구) 묶기/풀기 */
export function isQuoteKey(e: KeyboardEvent): boolean {
  return altOnly(e) && e.code === 'Digit3'
}

/** 고른 줄(커서만 있으면 그 줄)을 세로바로 묶는다. 이미 세로바 안이면 푼다. 처리했으면 true */
export function toggleQuoteAtSelection(ed: Editor): boolean {
  return ed.chain().focus().toggleBlockquote().run()
}
