export type ColWidths = { title: number; source: number; status: number }

export const DEFAULT_COL_WIDTHS: ColWidths = { title: 280, source: 140, status: 64 }

const KEY = 'learning_col_widths'

export function loadColWidths(): ColWidths {
  try {
    const s = localStorage.getItem(KEY)
    if (s) return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(s) }
  } catch {}
  return { ...DEFAULT_COL_WIDTHS }
}

export function saveColWidths(w: ColWidths) {
  try { localStorage.setItem(KEY, JSON.stringify(w)) } catch {}
}
