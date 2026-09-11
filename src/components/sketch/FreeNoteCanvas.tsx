'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Square } from 'lucide-react'
import type { SketchBoard, SketchNoteElement } from '@/types'
import { useAutosave } from '@/hooks/useAutosave'
import { ImageOverlay, BoxOverlay, toDisplayHtml, type OverlayBox } from './FreeNoteOverlays'

const DEFAULT_BOX_WIDTH = 220
const DEFAULT_BOX_HEIGHT = 160
const MAX_IMAGE_DIM = 420 // 붙여넣은 이미지의 초기 최대 변 길이(px) — 이후 리사이즈는 자유

async function convertToJpeg(blob: Blob): Promise<Blob> {
  return new Promise(resolve => {
    const img = new window.Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(result => resolve(result!), 'image/jpeg', 0.92)
    }
    img.src = url
  })
}

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new window.Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: MAX_IMAGE_DIM, height: MAX_IMAGE_DIM })
    img.src = src
  })
}

function fitWithinMax(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height }
  const scale = width >= height ? max / width : max / height
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export default function FreeNoteCanvas({ boardId }: { boardId: string }) {
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const [board, setBoard] = useState<SketchBoard | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [elements, setElements] = useState<SketchNoteElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isEditingBody, setIsEditingBody] = useState(false)
  const [saveError, setSaveError] = useState('')
  const SAVE_ERROR_MSG = '저장 실패 — 화면에는 반영됐지만 서버에 저장되지 않았을 수 있습니다. 새로고침 후 다시 확인해주세요.'

  const elementsRef = useRef<SketchNoteElement[]>([])
  useEffect(() => { elementsRef.current = elements }, [elements])

  // ── 데이터 로딩 ───────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('sketch_boards').select('*').eq('id', boardId).single(),
      supabase.from('sketch_note_elements').select('*').eq('board_id', boardId).order('created_at'),
    ]).then(([boardRes, elRes]) => {
      if (boardRes.data) {
        const b = boardRes.data as SketchBoard
        setBoard(b)
        setNameInput(b.name)
        if (bodyRef.current) bodyRef.current.innerHTML = toDisplayHtml(b.note_body ?? '')
      }
      setElements((elRes.data ?? []) as SketchNoteElement[])
      setLoading(false)
    })
  }, [boardId])

  // 본문에 처음 진입하면 커서가 바로 깜빡이도록 자동 포커스(맨 끝으로)
  useEffect(() => {
    if (loading || !bodyRef.current) return
    const el = bodyRef.current
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [loading])

  // ── 본문(note_body) 저장 ─────────────────────────────────────────────────
  const [autosaveBody, setAutosaveBody] = useState('')
  const bodySaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useAutosave({
    supabase, enabled: isEditingBody, entityType: 'sketch_board', entityId: boardId, fieldKey: 'note_body', value: autosaveBody,
  })

  function handleBodyInput(e: React.FormEvent<HTMLDivElement>) {
    const html = e.currentTarget.innerHTML
    setAutosaveBody(html)
    clearTimeout(bodySaveTimer.current)
    bodySaveTimer.current = setTimeout(() => {
      supabase.from('sketch_boards').update({ note_body: html }).eq('id', boardId)
        .then(({ error }) => setSaveError(error ? SAVE_ERROR_MSG : ''))
    }, 500)
  }

  // ── canonical writes(오버레이 요소) ───────────────────────────────────────
  const handleOverlayChange = useCallback((id: string, box: OverlayBox) => {
    setElements(prev => prev.map(el => el.id === id
      ? { ...el, position_x: box.x, position_y: box.y, width: box.width, height: box.height, rotation: box.rotation }
      : el))
    supabase.from('sketch_note_elements')
      .update({ position_x: box.x, position_y: box.y, width: box.width, height: box.height, rotation: box.rotation })
      .eq('id', id)
      .then(({ error }) => setSaveError(error ? SAVE_ERROR_MSG : ''))
  }, [])

  const handleColorChange = useCallback((id: string, color: CategoryColorKey) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, color } : el))
    supabase.from('sketch_note_elements').update({ color }).eq('id', id)
      .then(({ error }) => setSaveError(error ? SAVE_ERROR_MSG : ''))
  }, [])

  const handleContentChange = useCallback((id: string, content: string) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, content } : el))
    supabase.from('sketch_note_elements').update({ content }).eq('id', id)
      .then(({ error }) => { if (error) console.error('메모 저장 실패:', error.message) })
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const el = elementsRef.current.find(e => e.id === id)
    const { error } = await supabase.from('sketch_note_elements').delete().eq('id', id)
    if (error) { alert('삭제에 실패했습니다.'); return }
    setElements(prev => prev.filter(e => e.id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
    if (el?.type === 'image') {
      const path = el.content.split('/object/public/attachments/')[1]
      if (path) await supabase.storage.from('attachments').remove([path])
    }
  }, [])

  // 선택된 오버레이 요소(포스트잇/이미지)를 Delete/Backspace로 삭제 — 본문/메모 등
  // 텍스트 편집 중일 때는 글자 지우기로 동작해야 하므로 건드리지 않는다.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedId) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const active = document.activeElement as HTMLElement | null
      const tag = active?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || active?.getAttribute('contenteditable') === 'true') return
      e.preventDefault()
      void handleDelete(selectedId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, handleDelete])

  // 새 오버레이 요소를 놓을 위치 — 현재 스크롤 뷰포트 안쪽, 겹치지 않도록 조금씩 어긋나게
  const pickCreatePos = useCallback((): { x: number; y: number } => {
    const scrollEl = scrollRef.current
    const baseX = (scrollEl?.scrollLeft ?? 0) + 48
    const baseY = (scrollEl?.scrollTop ?? 0) + 72
    const cascade = (elementsRef.current.length % 6) * 22
    return { x: baseX + cascade, y: baseY + cascade }
  }, [])

  // 낙관적 생성 — insert 응답을 기다리지 않고 즉시 화면에 놓은 뒤, 서버 id가 오면
  // 그 사이 사용자가 이미 옮기거나 입력한 값(있다면)을 살려서 canonical id로 갈아끼운다.
  const createBox = useCallback(async () => {
    const pos = pickCreatePos()
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()
    const optimistic: SketchNoteElement = {
      id: tempId, board_id: boardId, type: 'box', content: '', color: 'amber',
      position_x: pos.x, position_y: pos.y, width: DEFAULT_BOX_WIDTH, height: DEFAULT_BOX_HEIGHT, rotation: 0,
      created_at: now, updated_at: now,
    }
    setElements(prev => [...prev, optimistic])
    setSelectedId(tempId)

    const { data, error } = await supabase.from('sketch_note_elements')
      .insert({ board_id: boardId, type: 'box', content: '', color: 'amber', position_x: pos.x, position_y: pos.y, width: DEFAULT_BOX_WIDTH, height: DEFAULT_BOX_HEIGHT, rotation: 0 })
      .select().single()
    if (error || !data) {
      console.error('박스 생성 실패:', error?.message)
      setElements(prev => prev.filter(el => el.id !== tempId))
      setSelectedId(prev => (prev === tempId ? null : prev))
      return
    }
    const canonical = data as SketchNoteElement
    setElements(prev => prev.map(el => {
      if (el.id !== tempId) return el
      const merged = { ...canonical, position_x: el.position_x, position_y: el.position_y, width: el.width, height: el.height, rotation: el.rotation, color: el.color, content: el.content }
      // 임시 id로 들어온 중간 변경분(드래그/색상/메모)은 canonical id로 다시 써준다
      supabase.from('sketch_note_elements')
        .update({ position_x: merged.position_x, position_y: merged.position_y, width: merged.width, height: merged.height, rotation: merged.rotation, color: merged.color, content: merged.content })
        .eq('id', merged.id)
        .then(({ error: syncError }) => { if (syncError) setSaveError(SAVE_ERROR_MSG) })
      return merged
    }))
    setSelectedId(prev => (prev === tempId ? canonical.id : prev))
  }, [boardId, pickCreatePos])

  const createImage = useCallback(async (src: string, naturalSize: { width: number; height: number }) => {
    const { width, height } = fitWithinMax(naturalSize.width, naturalSize.height, MAX_IMAGE_DIM)
    const pos = pickCreatePos()
    const { data, error } = await supabase.from('sketch_note_elements')
      .insert({ board_id: boardId, type: 'image', content: src, color: 'blue', position_x: pos.x, position_y: pos.y, width, height, rotation: 0 })
      .select().single()
    if (error || !data) { console.error('이미지 생성 실패:', error?.message); return }
    setElements(prev => [...prev, data as SketchNoteElement])
    setSelectedId((data as SketchNoteElement).id)
  }, [boardId, pickCreatePos])

  // ── 이미지 붙여넣기(본문 타이핑 중에도 동작) ─────────────────────────────
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return
      const items = Array.from(e.clipboardData.items)
      const imageItem = items.find(item => item.type.startsWith('image/'))
      if (!imageItem) return
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (!blob) return
      setUploading(true)
      try {
        const jpgBlob = await convertToJpeg(blob)
        const objectUrl = URL.createObjectURL(jpgBlob)
        const naturalSize = await loadImageSize(objectUrl)
        URL.revokeObjectURL(objectUrl)
        const fileName = `paste_${Date.now()}.jpg`
        const path = `sketch-notes/${boardId}/${Date.now()}_${fileName}`
        const { error } = await supabase.storage.from('attachments').upload(path, jpgBlob, { contentType: 'image/jpeg' })
        if (error) { setSaveError('이미지 업로드에 실패했습니다.'); return }
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
        await createImage(urlData.publicUrl, naturalSize)
      } finally {
        setUploading(false)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [boardId, createImage])

  // 문서 전체 높이 — 오버레이 요소가 본문 끝보다 아래로 내려가면 그만큼 스크롤 영역을 늘림
  const [minHeight, setMinHeight] = useState(600)
  useEffect(() => {
    const bottoms = elements.map(el => el.position_y + el.height)
    const bodyHeight = bodyRef.current?.scrollHeight ?? 0
    setMinHeight(Math.max(600, bodyHeight + 200, ...(bottoms.length ? [Math.max(...bottoms) + 120] : [0])))
  }, [elements, autosaveBody])

  function handleDeselectClick(e: React.MouseEvent) {
    if (e.target === innerRef.current || e.target === scrollRef.current) setSelectedId(null)
  }

  async function saveBoardName() {
    const name = nameInput.trim()
    if (!name || !board || name === board.name) { setNameInput(board?.name ?? ''); return }
    await supabase.from('sketch_boards').update({ name }).eq('id', board.id)
    setBoard(prev => prev ? { ...prev, name } : prev)
  }

  if (loading) return <div className="h-full flex items-center justify-center text-[13px]" style={{ color: 'rgba(226,232,240,0.35)' }}>불러오는 중…</div>

  if (!board) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <p className="text-[13px]" style={{ color: 'rgba(226,232,240,0.35)' }}>보드를 찾을 수 없습니다</p>
      <Link href="/sketch" className="text-[12px] px-4 py-1.5 rounded-full transition-colors"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}>
        목록으로
      </Link>
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 툴바 */}
      <div className="flex-shrink-0 flex items-center gap-3 pt-6 pb-3">
        <Link href="/sketch" className="p-1.5 rounded-lg transition-colors flex-shrink-0"
          style={{ color: 'rgba(226,232,240,0.5)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
          <ArrowLeft size={16} />
        </Link>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={saveBoardName}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="text-[18px] font-bold bg-transparent focus:outline-none min-w-0"
          style={{ color: '#E2E8F0' }}
        />

        <button
          onClick={() => void createBox()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0 ml-auto"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}
        >
          <Square size={13} /> 포스트잇
        </button>
        {uploading && <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.4)' }}>이미지 업로드 중…</span>}
      </div>

      {saveError && (
        <div className="flex-shrink-0 mb-2 px-4 py-2.5 rounded-xl text-[12px] flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FC8181' }}>
          <span>⚠</span>
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError('')} className="text-[10px] opacity-70 hover:opacity-100 flex-shrink-0">닫기</button>
        </div>
      )}

      {/* 문서 */}
      <div ref={scrollRef} className="flex-1 min-h-0 rounded-2xl overflow-auto relative" style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#0F1319' }} onMouseDown={handleDeselectClick}>
        <div ref={innerRef} className="relative" style={{ minHeight, padding: '32px 40px' }}>
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            onFocus={() => setIsEditingBody(true)}
            onBlur={() => setIsEditingBody(false)}
            data-placeholder="여기에 바로 적어보세요…"
            className="relative outline-none leading-relaxed freenote-body"
            // maxWidth: 760 고정값이었을 때는 창을 넓게 켜도 본문이 그 폭에서 멈춰 줄바꿈되고
            // 오른쪽에 여백만 남는 문제가 있었다 — 좁은 화면(또는 좁은 창)에선 꽉 채우고,
            // 아주 넓은 화면에서만 가독성을 위해 줄 길이 상한이 걸리도록 가변폭으로 변경.
            style={{ color: '#E2E8F0', fontSize: 15, maxWidth: 'min(100%, 1100px)', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', minHeight: 200 }}
          />
          {elements.map(el => el.type === 'image' ? (
            <ImageOverlay
              key={el.id}
              box={{ x: el.position_x, y: el.position_y, width: el.width, height: el.height, rotation: el.rotation }}
              src={el.content}
              selected={selectedId === el.id}
              onSelect={() => setSelectedId(el.id)}
              onChange={box => handleOverlayChange(el.id, box)}
              onDelete={() => void handleDelete(el.id)}
            />
          ) : (
            <BoxOverlay
              key={el.id}
              id={el.id}
              box={{ x: el.position_x, y: el.position_y, width: el.width, height: el.height, rotation: el.rotation }}
              color={el.color as CategoryColorKey}
              content={el.content}
              selected={selectedId === el.id}
              onSelect={() => setSelectedId(el.id)}
              onChange={box => handleOverlayChange(el.id, box)}
              onDelete={() => void handleDelete(el.id)}
              onColorChange={color => handleColorChange(el.id, color)}
              onContentChange={content => handleContentChange(el.id, content)}
              supabase={supabase}
            />
          ))}
        </div>
      </div>

      <p className="text-center text-[11px] pt-2 flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>
        바로 타이핑하세요 · <span className="font-mono">Ctrl+V</span>로 이미지 붙여넣기(크기·회전 조절 가능) · 포스트잇에 메모 작성 가능 · 선택 후 <span className="font-mono">Delete</span>로 삭제
      </p>
    </div>
  )
}
