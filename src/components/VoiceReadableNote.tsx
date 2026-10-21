'use client'

// 회의록 노트 읽기 화면 + 경영진 의견 표시(Alt+3 CEO / Alt+4 CSO).
// 읽기 화면에서 줄을 클릭(또는 여러 줄 드래그)하고 단축키를 누르면 그 줄에 표시를 붙여 이 노트(meeting_notes)
// 한 건만 바로 저장한다. 다른 곳에서 먼저 고쳤으면(updated_at 불일치) 저장하지 않고 최신 내용을 다시 불러온다.
// 예전 형식(순수 텍스트) 노트는 표시할 때 "수정→저장"과 같은 변환으로 새 형식(HTML)이 되므로 노트마다 처음 한 번 확인한다.
import { useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import MarkdownContent from '@/components/MarkdownContent'
import { applyVoiceToContent, isHtmlContent, withReadBlockMarkers, showVoiceNotice, type ReadSelection } from '@/lib/executiveVoices'
import type { VoiceTarget } from '@/lib/tiptapExtensions'

interface Props {
  noteId: string
  content: string
  updatedAt: string
  onSaved: (content: string, updatedAt: string) => void
  dark?: boolean
  className?: string
}

// 선택 범위가 이 블록의 글자를 실제로 덮는지(트리플클릭처럼 다음 줄 맨 앞에 걸친 경우 제외)
function coversText(range: Range, el: Element): boolean {
  if (!range.intersectsNode(el)) return false
  const r = document.createRange()
  r.selectNodeContents(el)
  if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset)
  if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset)
  return r.toString().trim() !== ''
}

export default function VoiceReadableNote({ noteId, content, updatedAt, onSaved, dark = true, className }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const html = isHtmlContent(content)
  const rendered = useMemo(() => (html ? withReadBlockMarkers(content) : content), [content, html])
  const latest = useRef({ content, updatedAt, onSaved, html })
  useEffect(() => { latest.current = { content, updatedAt, onSaved, html } })
  const busy = useRef(false)
  const legacyConfirmed = useRef(false)

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return
      if (e.code !== 'Digit3' && e.code !== 'Digit4') return
      const box = boxRef.current
      const sel = window.getSelection()
      if (!box || !sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (!box.contains(range.commonAncestorContainer)) return
      // 입력칸·에디터에 포커스가 있으면 그쪽 단축키가 처리한다
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return
      e.preventDefault()
      if (busy.current) return

      const { content: cur, updatedAt: curAt, onSaved: save, html: isHtml } = latest.current
      const attr = isHtml ? 'data-vblk' : 'data-line'
      let els: Element[]
      if (range.collapsed) {
        const node = range.startContainer
        const el = (node instanceof Element ? node : node.parentElement)?.closest(`[${attr}]`)
        els = el && box.contains(el) ? [el] : []
      } else {
        els = Array.from(box.querySelectorAll(`[${attr}]`)).filter(el => coversText(range, el))
      }
      const idx = [...new Set(els.map(el => Number(el.getAttribute(attr))).filter(n => Number.isInteger(n) && n >= 0))]
      if (idx.length === 0) { showVoiceNotice('표시할 줄을 찾지 못했습니다 — 줄을 클릭하거나 드래그한 뒤 눌러 주세요'); return }

      const target: VoiceTarget = e.code === 'Digit3' ? 'CEO' : 'CSO'
      const selection: ReadSelection = isHtml ? { kind: 'html', blocks: idx } : { kind: 'legacy', lines: idx }
      const result = applyVoiceToContent(cur, selection, target)
      if (!result.ok) { showVoiceNotice(result.reason); return }
      if (result.converted && !legacyConfirmed.current) {
        const okConvert = window.confirm('이 노트는 예전 형식이라, 표시하려면 새 형식으로 바꿔 저장합니다.\n글자 내용은 그대로이고, 보이는 모양은 "수정 → 저장"했을 때처럼 바뀔 수 있습니다(예: > 접힘 → 펼친 굵은 줄).\n계속할까요?')
        if (!okConvert) return
        legacyConfirmed.current = true
      }

      busy.current = true
      const sb = createClient()
      const now = new Date().toISOString()
      const { data, error } = await sb.from('meeting_notes').update({ content: result.content, updated_at: now })
        .eq('id', noteId).eq('updated_at', curAt).select('id')
      if (error) {
        showVoiceNotice('저장 실패 — 서버에 저장되지 않았습니다. 잠시 후 다시 시도해 주세요.')
      } else if (!data || data.length === 0) {
        // 다른 탭·화면에서 먼저 고친 경우 — 덮어쓰지 않고 최신 내용을 다시 보여준다
        const fresh = await sb.from('meeting_notes').select('content, updated_at').eq('id', noteId).maybeSingle()
        if (fresh.data) save((fresh.data as { content: string }).content, (fresh.data as { updated_at: string }).updated_at)
        showVoiceNotice(fresh.data ? '다른 곳에서 먼저 수정돼 저장하지 않았습니다 — 최신 내용으로 다시 불러왔으니 다시 시도해 주세요.' : '원본 노트를 찾지 못했습니다 — 삭제되었을 수 있습니다.')
      } else {
        save(result.content, now)
        showVoiceNotice(result.action === 'set' ? `${target} 표시를 저장했습니다${result.converted ? ' (새 형식으로 변환됨)' : ''}` : '표시를 해제했습니다')
      }
      busy.current = false
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [noteId])

  return (
    <div ref={boxRef}>
      <MarkdownContent content={rendered} dark={dark} className={className} />
    </div>
  )
}
