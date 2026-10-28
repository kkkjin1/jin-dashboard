import type { SupabaseClient } from '@supabase/supabase-js'
import type { SketchTableData } from '@/types'

// 전체 검색(Ctrl+K)용 — 안건 상세 A 본문 위에 떠 있는 포스트잇·표·마인드맵 카드 글자.
// 안건별 숨김 보드(sketch_boards.agenda_item_id, schema_v64)에 담긴 요소를 안건 id로 모은다.
export type AgendaSearchExtra = { agendaItemId: string; label: string; text: string }

function plain(html: string | null | undefined) {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function loadAgendaSearchExtras(supabase: SupabaseClient): Promise<AgendaSearchExtra[]> {
  const { data: boards } = await supabase.from('sketch_boards').select('id, agenda_item_id').not('agenda_item_id', 'is', null)
  const boardToItem = new Map((boards ?? []).map((b: { id: string; agenda_item_id: string }) => [b.id, b.agenda_item_id]))
  if (boardToItem.size === 0) return []

  const { data: els } = await supabase.from('sketch_note_elements').select('board_id, type, content, table_data').in('board_id', [...boardToItem.keys()])
  const out: AgendaSearchExtra[] = []
  const mindmapToItem = new Map<string, string>()
  for (const el of (els ?? []) as { board_id: string; type: string; content: string; table_data: SketchTableData | null }[]) {
    const itemId = boardToItem.get(el.board_id)
    if (!itemId) continue
    if (el.type === 'box') out.push({ agendaItemId: itemId, label: '포스트잇', text: plain(el.content) })
    else if (el.type === 'table' && el.table_data) out.push({ agendaItemId: itemId, label: '표', text: el.table_data.rows.map(r => r.join(' ')).join(' ') })
    else if (el.type === 'mindmap' && el.content) mindmapToItem.set(el.content, itemId)
  }

  if (mindmapToItem.size > 0) {
    const { data: cards } = await supabase.from('sketch_cards').select('board_id, content').in('board_id', [...mindmapToItem.keys()])
    for (const c of (cards ?? []) as { board_id: string; content: string }[]) {
      const itemId = mindmapToItem.get(c.board_id)
      if (itemId) out.push({ agendaItemId: itemId, label: '마인드맵', text: plain(c.content) })
    }
  }
  return out.filter(e => e.text)
}
