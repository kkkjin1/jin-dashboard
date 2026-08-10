// 빠른 메모 팝업을 여는 공통 로직 — 메인 앱 창(QuickMemoPanel)과 팝업 자신
// (/memo/quick, Ctrl+3으로 팝업 안에서 또 열 때) 양쪽에서 같이 쓴다.
// lastPopup은 모듈 단위 상태라 창마다(메인 앱, 각 팝업) 독립적으로 "내가 마지막으로
// 띄운 자식 팝업"만 기억하면 되고, 캐스케이드 카운터(_qmc)는 sessionStorage라
// 같은 브라우저 탭 그룹 전체가 공유해서 위치가 계속 이어서 어긋난다.
let lastPopup: Window | null = null

export function openQuickMemo() {
  const n = (parseInt(sessionStorage.getItem('_qmc') ?? '0') + 1) % 20
  sessionStorage.setItem('_qmc', String(n))
  const cascade = (n - 1) * 24
  const left = window.screenX + window.outerWidth - 480 - cascade
  const top  = window.screenY + 80 + cascade
  // 기존 팝업이 살아있으면 새 창은 draft 복원 없이 blank로 열림
  const isAlive = lastPopup !== null && !lastPopup.closed
  const url = isAlive ? '/memo/quick?blank=1' : '/memo/quick'
  lastPopup = window.open(
    url,
    `qm_${Date.now()}`,
    `width=440,height=520,left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`,
  )
}
