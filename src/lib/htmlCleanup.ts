// 빈 문단(빈 <p>)이 2개 이상 연달아 있으면 1개로 합친다.
// 외부 텍스트(카톡/문서 등)를 붙여넣을 때 문단 사이 여러 줄바꿈이 그대로
// 빈 <p></p>로 쌓여 줄간격이 과도하게 벌어지는 문제를 방지한다.
const EMPTY_P = '<p[^>]*>(?:\\s|&nbsp;|<br\\s*/?>)*</p>'
const CONSECUTIVE_EMPTY_P_RE = new RegExp(`(?:${EMPTY_P}\\s*){2,}`, 'gi')

export function collapseEmptyParagraphs(html: string): string {
  return html.replace(CONSECUTIVE_EMPTY_P_RE, '<p></p>')
}
