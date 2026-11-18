// 메모탭(/memos) ↔ 메모 팝업창(/memo/view, /memo/quick) 사이 실시간 연동.
// 같은 브라우저의 창끼리 BroadcastChannel로 "어떤 메모가 바뀌었다"만 알린다.
// DB 저장은 각 창이 직접 하고, 이 채널은 화면 갱신용 알림일 뿐이다(서버 왕복 없음).
// 자기 창이 보낸 알림은 SENDER_ID로 걸러서 무시한다.
import type { MemoTag } from '@/types'

export type MemoSyncMessage =
  | { type: 'updated'; memo: { id: string; title: string; content: string; tag: MemoTag[] } }
  | { type: 'deleted'; id: string }
  | { type: 'created'; id: string }

const CHANNEL_NAME = 'jin-memos-sync'
const SENDER_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2)

type Envelope = { sender: string; msg: MemoSyncMessage }

let channel: BroadcastChannel | null = null
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME)
  return channel
}

export function broadcastMemo(msg: MemoSyncMessage) {
  try { getChannel()?.postMessage({ sender: SENDER_ID, msg } satisfies Envelope) } catch {}
}

export function subscribeMemoSync(cb: (msg: MemoSyncMessage) => void): () => void {
  const ch = getChannel()
  if (!ch) return () => {}
  const handler = (e: MessageEvent<Envelope>) => {
    if (!e.data || e.data.sender === SENDER_ID) return
    cb(e.data.msg)
  }
  ch.addEventListener('message', handler)
  return () => ch.removeEventListener('message', handler)
}

// 저장된 메모를 별도 팝업창으로 연다. 창 이름을 메모 id로 고정해서 같은 메모를
// 또 누르면 새 창이 생기지 않고 이미 열린 창이 앞으로 나온다.
export function openMemoPopup(id: string) {
  const w = 560, h = 720
  const left = window.screenX + Math.max(0, window.outerWidth - w - 40)
  const top = window.screenY + 60
  const win = window.open(
    `/memo/view?id=${encodeURIComponent(id)}`,
    `memo_${id}`,
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`,
  )
  win?.focus()
}
