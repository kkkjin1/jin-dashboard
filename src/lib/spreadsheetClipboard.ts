// Excel/Google Sheets 클립보드를 rows×cols string matrix로 변환한다.
// 우선순위: text/html의 실제 <table> → text/plain의 tab 구분(TSV) → null.
// 일반 여러 줄 텍스트를 표로 오인하지 않도록 최소 판정만 적용한다:
// 실제 <table> 태그가 있거나, text/plain에 탭 문자가 있을 때만 표로 판단한다.

function cellText(el: Element): string {
  // textContent는 <br>을 무시하므로, 셀 안의 줄바꿈을 보존하려면 먼저 개행으로 치환한다.
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  return (clone.textContent ?? '').replace(/ /g, ' ').replace(/\r/g, '').trim()
}

// rowspan/colspan이 있는 실제 HTML table을 rectangular matrix로 펼친다. 병합된
// 영역 자체(셀 하나가 여러 칸을 차지하는 표현)를 그대로 재현하지는 않고, 병합된
// 값을 덮인 칸마다 복제해 열 밀림 없이 채운다 — Excel/Sheets 모두 이 방식으로
// 값 누락 없이 커버된다.
function parseHtmlTable(html: string): string[][] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return null
  const trs = Array.from(table.querySelectorAll('tr'))
  if (trs.length === 0) return null

  const grid: string[][] = []
  const pending = new Map<number, { value: string; remaining: number }>()

  trs.forEach((tr, ri) => {
    grid[ri] = []
    const cells = Array.from(tr.querySelectorAll('td, th'))
    let col = 0
    let cellIdx = 0
    while (cellIdx < cells.length || (pending.size > 0 && col <= Math.max(...pending.keys()))) {
      const p = pending.get(col)
      if (p) {
        grid[ri][col] = p.value
        p.remaining -= 1
        if (p.remaining <= 0) pending.delete(col)
        col++
        continue
      }
      if (cellIdx < cells.length) {
        const cell = cells[cellIdx]
        const text = cellText(cell)
        const colspan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1)
        const rowspan = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1)
        for (let k = 0; k < colspan; k++) {
          grid[ri][col] = text
          if (rowspan > 1) pending.set(col, { value: text, remaining: rowspan - 1 })
          col++
        }
        cellIdx++
      } else {
        grid[ri][col] = ''
        col++
      }
    }
  })

  const maxCols = grid.reduce((m, r) => Math.max(m, r.length), 0)
  if (maxCols === 0) return null
  return grid.map(r => Array.from({ length: maxCols }, (_, i) => r[i] ?? ''))
}

function parseTsv(text: string): string[][] | null {
  if (!text.includes('\t')) return null
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const rows = lines.map(line => line.split('\t'))
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0)
  if (maxCols < 2) return null
  return rows.map(r => Array.from({ length: maxCols }, (_, i) => r[i] ?? ''))
}

export function parseSpreadsheetClipboard(clipboardData: DataTransfer): string[][] | null {
  const html = clipboardData.getData('text/html')
  if (html && /<table[\s>]/i.test(html)) {
    const fromHtml = parseHtmlTable(html)
    if (fromHtml) return fromHtml
  }
  const text = clipboardData.getData('text/plain')
  if (text) {
    const fromTsv = parseTsv(text)
    if (fromTsv) return fromTsv
  }
  return null
}
