// 학습자료 매체 목록 — 사용자 설정(user_settings 'learning_media_types')으로 추가·이름변경·삭제·순서변경 가능 (2026-11-09)
// '책'은 📚 책장 보기·범주 카드의 도서 단이 의존하므로 이름 변경·삭제를 막는다.

export const MEDIA_SETTING_KEY = 'learning_media_types'
export const DEFAULT_MEDIA = ['책', '영상', '아티클', '강의', '기타']
export const LOCKED_MEDIA = '책'
// 매체를 지울 때 그 매체 자료가 옮겨 갈 곳(목록에 있으면) — 없으면 '매체 없음'
export const FALLBACK_MEDIA = '기타'
