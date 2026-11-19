// Alt+5 — 편집기에서 블록 잡은 글을 홈 "오늘 할 일"(quick_todos, 오늘 날짜)로 바로 넣는다.
// 회의·업무 상세의 "📌 오늘 업무로" 팝업(TextSelectionCapture)과 같은 테이블·같은 제목 규칙.
// 화면마다 상태를 엮지 않도록 결과는 잠깐 뜨는 토스트(DOM 직접)로만 알린다.
import type { Editor } from '@tiptap/core'
import { createClient } from '@/lib/supabase/client'
import { todayYmd } from '@/lib/tiptapExtensions'

// 즉석 할 일 제목은 한 줄 — 여러 줄을 골랐으면 " / "로 잇고 너무 길면 자른다
const MAX_TITLE = 200
export function toTodoTitle(text: string): string {
  const one = text.split('\n').map(l => l.trim()).filter(Boolean).join(' / ').replace(/\s+/g, ' ')
  return one.length > MAX_TITLE ? `${one.slice(0, MAX_TITLE)}…` : one
}

/** Alt+5 판별 — e.code(맥 Option+숫자 대비), 한글 조합 중 무시 */
export function isTodayTodoKey(e: KeyboardEvent): boolean {
  return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && e.code === 'Digit5'
}

function showToast(message: string, ok: boolean) {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.textContent = message
  el.setAttribute('role', 'status')
  Object.assign(el.style, {
    position: 'fixed', left: '50%', bottom: '32px', transform: 'translateX(-50%)', zIndex: '9999',
    padding: '8px 14px', borderRadius: '10px', fontSize: '13px', maxWidth: '80vw',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    background: ok ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)', color: '#fff',
    boxShadow: '0 6px 20px rgba(0,0,0,0.25)', pointerEvents: 'none', transition: 'opacity .3s',
  } as Partial<CSSStyleDeclaration>)
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0' }, 1800)
  setTimeout(() => el.remove(), 2200)
}

/** 편집기 선택 글을 오늘 할 일로 추가. 선택이 비어 있으면 false(키 기본 동작 유지) */
export function addSelectionToToday(ed: Editor): boolean {
  const { from, to } = ed.state.selection
  const title = toTodoTitle(ed.state.doc.textBetween(from, to, '\n', ' '))
  if (!title) {
    showToast('오늘 할 일로 보낼 글을 먼저 블록으로 잡아 주세요', false)
    return true
  }
  void createClient().from('quick_todos').insert({ title, target_date: todayYmd() }).then(({ error }) => {
    if (error) {
      console.error('오늘 할 일 추가 실패:', error.message)
      showToast('오늘 할 일 추가 실패 — 다시 시도해 주세요', false)
    } else {
      showToast(`📌 오늘 할 일에 추가: ${title}`, true)
    }
  })
  return true
}
