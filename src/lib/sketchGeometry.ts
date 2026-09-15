// 생각스케치 오버레이 카드(Image/Box/Table/MindmapCard)가 공유하는 순수 기하 헬퍼.
// OverlayFrame의 회전 계산에서 사용 — DB 저장 포맷(도 단위 double)은 그대로 유지한다.

const CARDINAL_ANGLES = [0, 90, 180, 270]
const SNAP_THRESHOLD_DEG = 4

/** 각도를 [0, 360) 범위로 정규화 */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  return Math.min(diff, 360 - diff)
}

/**
 * 0/90/180/270 근처(threshold 이내)에서는 정확히 그 각도로 스냅하고,
 * 벗어나면 원래 각도를 그대로 반환해 자유 회전을 유지한다.
 */
export function snapRotation(angle: number, threshold: number = SNAP_THRESHOLD_DEG): number {
  for (const cardinal of CARDINAL_ANGLES) {
    if (angularDistance(angle, cardinal) <= threshold) {
      return cardinal
    }
  }
  return angle
}
