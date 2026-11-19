// 붙여넣기에서 "이미지로 처리할지" 판정.
// PowerPoint·Word·Excel·한글 등 오피스 앱은 글을 복사해도 클립보드에 글(text/plain, text/html)과
// 함께 그 글을 찍은 그림 사본(PNG 등)을 같이 싣는다. 이미지 항목만 보고 처리하면 글 대신(또는 글과 함께)
// 엉뚱한 그림이 붙었다(2026-11-19 PPT 슬라이드 노트 복붙). 글자가 실려 있으면 글 붙여넣기로 보고
// 이미지는 무시한다. 브라우저 "이미지 복사"·캡처 도구는 text/plain이 비어 있어 그대로 이미지로 처리된다.
export function pastedImageItem(data: DataTransfer | null | undefined): DataTransferItem | null {
  if (!data) return null
  if (data.getData('text/plain').trim()) return null
  return Array.from(data.items).find(item => item.kind === 'file' && item.type.startsWith('image/')) ?? null
}
