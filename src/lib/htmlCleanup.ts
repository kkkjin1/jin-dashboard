// 빈 문단(빈 <p>)이 2개 이상 연달아 있으면 1개로 합친다.
// 외부 텍스트(카톡/문서 등)를 붙여넣을 때 문단 사이 여러 줄바꿈이 그대로
// 빈 <p></p>로 쌓여 줄간격이 과도하게 벌어지는 문제를 방지한다.
const EMPTY_P = '<p[^>]*>(?:\\s|&nbsp;|<br\\s*/?>)*</p>'
const CONSECUTIVE_EMPTY_P_RE = new RegExp(`(?:${EMPTY_P}\\s*){2,}`, 'gi')

export function collapseEmptyParagraphs(html: string): string {
  return html.replace(CONSECUTIVE_EMPTY_P_RE, '<p></p>')
}

// Windows Chrome 클립보드 HTML은 `<html>\n<body>\n<!--StartFragment-->…<!--EndFragment-->\n</body>\n</html>`
// 로 감싸진다. 다른 에디터에서 복사해 data-pm-slice가 붙어 있으면 ProseMirror가 공백을 보존해서 파싱하고,
// HardBreak(linebreakReplacement)가 감싼 부분의 "\n"을 <br>로 바꿔 붙여넣은 내용 앞뒤에
// <p><br><br></p>가 생겼다(2026-10-21 토글 붙여넣기 빈 줄 5줄 증상). 조각만 남기고 앞뒤 공백을 걷어낸다.
export function cleanPastedHTML(html: string): string {
  const m = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/)
  return collapseEmptyParagraphs((m ? m[1] : html).trim())
}
