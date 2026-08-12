// 빠른 메모 팝업을 여는 공통 로직 — 메인 앱 창(QuickMemoPanel)과 팝업 자신
// (/memo/quick, Ctrl+3으로 팝업 안에서 또 열 때) 양쪽에서 같이 쓴다.
//
// "이미 살아있는 창이 있는지"는 localStorage 하트비트로 판단한다 — window.open()이
// 반환하는 Window 참조는 그 스크립트가 실행 중인 창(메인 앱 또는 개별 팝업)의 모듈
// 스코프에만 존재해서, 팝업 안에서 Ctrl+3을 또 누르면 "그 팝업" 입장에선 자기가
// 띄운 자식이 없으니 살아있는 창이 없다고 오판 — 그 결과 새 팝업이 blank가 아니라
// 기존 draft를 복원해버려서(그리고 같은 qid를 공유해버려서) 1번 메모 내용이 2번
// 메모에도 그대로 나타나는 버그로 이어졌다. 하트비트는 창 종류와 무관하게 전역으로
// 보이므로 이 문제가 없다. 캐스케이드 카운터(_qmc)는 sessionStorage라 같은 브라우저
// 탭 그룹 전체가 공유해서 위치가 계속 이어서 어긋난다.
const HEARTBEAT_KEY = 'quick_memo_heartbeats'
const HEARTBEAT_STALE_MS = 5000
const HEARTBEAT_INTERVAL_MS = 2000

function readHeartbeats(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch { return {} }
}

function isAnyQuickMemoWindowAlive(): boolean {
  const now = Date.now()
  return Object.values(readHeartbeats()).some(ts => now - ts < HEARTBEAT_STALE_MS)
}

// /memo/quick 팝업이 마운트될 때 호출 — 이 창이 살아있는 동안 주기적으로 자신의
// 존재를 기록하고, 언마운트/종료 시 정리한다.
export function registerQuickMemoHeartbeat(): () => void {
  const id = Math.random().toString(36).slice(2)
  function beat() {
    try {
      const map = readHeartbeats()
      map[id] = Date.now()
      localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(map))
    } catch {}
  }
  function cleanup() {
    clearInterval(interval)
    try {
      const map = readHeartbeats()
      delete map[id]
      localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(map))
    } catch {}
    window.removeEventListener('beforeunload', cleanup)
  }
  beat()
  const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS)
  window.addEventListener('beforeunload', cleanup)
  return cleanup
}

export function openQuickMemo() {
  const n = (parseInt(sessionStorage.getItem('_qmc') ?? '0') + 1) % 20
  sessionStorage.setItem('_qmc', String(n))
  const cascade = (n - 1) * 24
  const left = window.screenX + window.outerWidth - 480 - cascade
  const top  = window.screenY + 80 + cascade
  // 기존 팝업이 살아있으면 새 창은 draft 복원 없이 blank로 열림
  const isAlive = isAnyQuickMemoWindowAlive()
  const url = isAlive ? '/memo/quick?blank=1' : '/memo/quick'
  window.open(
    url,
    `qm_${Date.now()}`,
    `width=440,height=520,left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`,
  )
}
