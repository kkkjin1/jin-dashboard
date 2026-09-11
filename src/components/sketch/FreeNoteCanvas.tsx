'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Square, Network, Table2 } from 'lucide-react'
import type { SketchBoard, SketchNoteElement, SketchTableData } from '@/types'
import { useAutosave, clearAutosaveBuffer } from '@/hooks/useAutosave'
import {
  ImageOverlay, BoxOverlay, TableOverlay, MindmapCardOverlay,
  toDisplayHtml, ensureEmptyBlocksHaveBr, BlockFormatBar, AutosaveStatusHint, type OverlayBox,
} from './FreeNoteOverlays'

// 마인드맵 카드를 확장할 때만 필요한 무거운 캔버스(React Flow)라, 자유노트를 열 때마다
// 같이 불러오지 않도록 지연 로딩한다.
const SketchCanvas = dynamic(() => import('./SketchCanvas'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-[13px]" style={{ color: 'rgba(226,232,240,0.35)' }}>불러오는 중…</div>,
})

const DEFAULT_TABLE_DATA: SketchTableData = {
  headerRow: true, transparentBg: false, colWidths: [110, 110, 110], rows: [['열 1', '열 2', '열 3'], ['', '', '']],
}

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

  // 마인드맵 카드를 확장 편집 중일 때만 값이 있음 — 그 카드가 가리키는 자식 보드를
  // 전체화면으로 연다. 닫으면 mindmapRefreshTick을 올려서 카드 미리보기들이 다시 불러오게 한다.
  const [expandedMindmap, setExpandedMindmap] = useState<{ elementId: string; boardId: string } | null>(null)
  const [mindmapRefreshTick, setMindmapRefreshTick] = useState(0)
  function closeMindmapModal() {
    setExpandedMindmap(null)
    setMindmapRefreshTick(t => t + 1)
  }

  const elementsRef = useRef<SketchNoteElement[]>([])
  useEffect(() => { elementsRef.current = elements }, [elements])

  // ── 본문(note_body) autosave 안전망 값 — 데이터 로딩 effect보다 먼저 선언해야
  // 로딩 완료 시 이 state를 canonical 값으로 seed할 수 있다(false recovery 방지, 아래).
  const [autosaveBody, setAutosaveBody] = useState('')

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
        // canonical 값이 아직 안 채워진 초기값('')과 로컬 autosave 버퍼를 비교하면
        // 실제로는 아무것도 유실되지 않았는데도 매번 "복구 가능" 배너가 뜬다(1on1
        // 세션 편집 화면에서 이미 재현/수정된 것과 동일한 종류의 false positive) —
        // canonical 로드 직후 autosaveBody를 그 값으로 맞춰 훅의 mount-time 비교가
        // 정확한 기준값을 보게 한다.
        setAutosaveBody(b.note_body ?? '')
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
  const bodySaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const bodyAutosave = useAutosave({
    supabase, enabled: isEditingBody, entityType: 'sketch_board', entityId: boardId, fieldKey: 'note_body', value: autosaveBody,
  })

  function saveBodyCanonical(html: string) {
    supabase.from('sketch_boards').update({ note_body: html }).eq('id', boardId)
      .then(({ error }) => setSaveError(error ? SAVE_ERROR_MSG : ''))
  }

  function persistBody(html: string) {
    setAutosaveBody(html)
    clearTimeout(bodySaveTimer.current)
    bodySaveTimer.current = setTimeout(() => saveBodyCanonical(html), 500)
  }

  function handleBodyInput(e: React.FormEvent<HTMLDivElement>) {
    ensureEmptyBlocksHaveBr(e.currentTarget)
    persistBody(e.currentTarget.innerHTML)
  }

  // 복구 배너 "적용" — 로컬 state/DOM을 되돌린 뒤, 대기 중이던 canonical debounce는
  // 지우고 즉시 canonical에도 반영한다(1on1 세션 편집 화면의 applyRecoveredContent와
  // 동일한 원칙 — state만 바꾸고 끝내면 다시 새로고침할 때 또 사라짐).
  function applyRecoveredBody() {
    if (!bodyAutosave.recovered) return
    const html = (bodyAutosave.recovered.value as string) ?? ''
    bodyAutosave.discardRecovered()
    clearTimeout(bodySaveTimer.current)
    setAutosaveBody(html)
    if (bodyRef.current) bodyRef.current.innerHTML = toDisplayHtml(html)
    saveBodyCanonical(html)
  }

  function placeCaretEndInBlock(el: HTMLElement) {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  // 워드의 "클릭하여 입력"과 같은 동작 — 본문이 짧아서 아직 없는 행(예: 2행까지만
  // 썼는데 그보다 훨씬 아래)을 클릭해도, 그 자리까지 빈 줄을 채워서 정확히 그
  // 행에 캐럿을 둔다. 본문도 카드도 아닌 빈 캔버스를 클릭했을 때만 호출된다.
  function handleEmptyAreaClick(e: React.MouseEvent) {
    const body = bodyRef.current, inner = innerRef.current
    if (!body || !inner) return
    e.preventDefault()
    body.focus()
    const innerRect = inner.getBoundingClientRect()
    const clickY = e.clientY - innerRect.top
    const lines = Array.from(body.children) as HTMLElement[]
    if (!lines.length) return
    const lineHeightPx = parseFloat(getComputedStyle(body).lineHeight) || parseFloat(getComputedStyle(body).fontSize) * 1.5 || 24
    const relY = clickY - body.offsetTop
    const targetIndex = Math.max(0, Math.round(relY / lineHeightPx))

    if (targetIndex < lines.length) {
      // 이미 있는 행 범위 안 — 그 행 끝에 캐럿(가로 위치는 클릭한 x가 아니라 그 줄 끝)
      placeCaretEndInBlock(lines[targetIndex])
    } else {
      // 아직 없는 행 — 클릭한 행까지 빈 줄을 만들어 늘린 뒤 마지막 줄 끝에 캐럿
      const toAdd = targetIndex - lines.length + 1
      for (let i = 0; i < toAdd; i++) {
        const div = document.createElement('div')
        div.appendChild(document.createElement('br'))
        body.appendChild(div)
      }
      placeCaretEndInBlock(body.lastElementChild as HTMLElement)
    }
    persistBody(body.innerHTML)
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
      .then(({ error }) => setSaveError(error ? SAVE_ERROR_MSG : ''))
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const el = elementsRef.current.find(e => e.id === id)
    const { error } = await supabase.from('sketch_note_elements').delete().eq('id', id)
    if (error) { alert('삭제에 실패했습니다.'); return }
    setElements(prev => prev.filter(e => e.id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
    // canonical DELETE 성공 이후에만 로컬 autosave 버퍼 정리 — 실패해도 canonical
    // 삭제 자체는 되돌리지 않는다(meeting_note/quick_memo delete와 동일 원칙).
    // fieldKey는 요소 타입별 실제 사용 필드만(box→content, table→table_data);
    // image/mindmap은 useAutosave를 쓰지 않으므로 정리할 버퍼가 없다.
    try {
      if (el?.type === 'box') clearAutosaveBuffer('sketch_note_element', id, 'content')
      else if (el?.type === 'table') clearAutosaveBuffer('sketch_note_element', id, 'table_data')
    } catch {}
    if (el?.type === 'image') {
      const path = el.content.split('/object/public/attachments/')[1]
      if (path) await supabase.storage.from('attachments').remove([path])
    } else if (el?.type === 'mindmap' && el.content) {
      // 카드가 가리키던 자식 마인드맵 보드도 함께 삭제 — 그 보드의 카드/연결선/
      // 프레임은 FK ON DELETE CASCADE로 알아서 같이 지워진다.
      await supabase.from('sketch_boards').delete().eq('id', el.content)
    }
  }, [])

  const handleTableDataChange = useCallback((id: string, tableData: SketchTableData) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, table_data: tableData } : el))
    supabase.from('sketch_note_elements').update({ table_data: tableData }).eq('id', id)
      .then(({ error }) => { if (error) setSaveError(SAVE_ERROR_MSG) })
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
      id: tempId, board_id: boardId, type: 'box', content: '', color: 'amber', table_data: null,
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

  const createTable = useCallback(async () => {
    const pos = pickCreatePos()
    const { data, error } = await supabase.from('sketch_note_elements')
      .insert({
        board_id: boardId, type: 'table', content: '', color: 'blue',
        position_x: pos.x, position_y: pos.y, width: 360, height: 190, rotation: 0,
        table_data: DEFAULT_TABLE_DATA,
      })
      .select().single()
    if (error || !data) {
      console.error('표 생성 실패:', error?.message)
      setSaveError('표 생성에 실패했습니다 — 서버 스키마가 아직 준비되지 않았을 수 있습니다.')
      return
    }
    setElements(prev => [...prev, data as SketchNoteElement])
    setSelectedId((data as SketchNoteElement).id)
  }, [boardId, pickCreatePos])

  // 마인드맵 카드 — 실제로는 자유노트 위의 포스트잇 같은 카드일 뿐, 편집은 그 카드가
  // 가리키는 자식 sketch_boards(board_type='mindmap')를 기존 SketchCanvas로 그대로 연다.
  const createMindmap = useCallback(async () => {
    const pos = pickCreatePos()
    const { data: childBoard, error: boardError } = await supabase.from('sketch_boards')
      .insert({ name: '새 마인드맵', board_type: 'mindmap', parent_board_id: boardId })
      .select().single()
    if (boardError || !childBoard) {
      console.error('마인드맵 보드 생성 실패:', boardError?.message)
      setSaveError('마인드맵 카드 생성에 실패했습니다 — 서버 스키마가 아직 준비되지 않았을 수 있습니다.')
      return
    }
    const { data, error } = await supabase.from('sketch_note_elements')
      .insert({
        board_id: boardId, type: 'mindmap', content: childBoard.id as string, color: 'blue',
        position_x: pos.x, position_y: pos.y, width: 380, height: 240, rotation: 0,
      })
      .select().single()
    if (error || !data) {
      console.error('마인드맵 카드 생성 실패:', error?.message)
      setSaveError('마인드맵 카드 생성에 실패했습니다 — 서버 스키마가 아직 준비되지 않았을 수 있습니다.')
      await supabase.from('sketch_boards').delete().eq('id', childBoard.id as string)
      return
    }
    const el = data as SketchNoteElement
    setElements(prev => [...prev, el])
    setSelectedId(el.id)
    setExpandedMindmap({ elementId: el.id, boardId: childBoard.id as string })
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

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.target === scrollRef.current) { setSelectedId(null); return }
    if (e.target === innerRef.current) {
      setSelectedId(null)
      handleEmptyAreaClick(e)
    }
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
          onClick={() => void createMindmap()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0 ml-auto"
          style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.38)', color: '#9DBEF5' }}
        >
          <Network size={13} /> 마인드맵 카드
        </button>
        <button
          onClick={() => void createBox()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}
        >
          <Square size={13} /> 포스트잇
        </button>
        <button
          onClick={() => void createTable()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0"
          style={{ background: 'rgba(107,182,199,0.14)', border: '1px solid rgba(107,182,199,0.4)', color: '#A6D5E0' }}
        >
          <Table2 size={13} /> 표
        </button>
        {uploading && <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.4)' }}>이미지 업로드 중…</span>}
        <AutosaveStatusHint status={bodyAutosave.status} failureReason={bodyAutosave.failureReason} />
      </div>

      {/* Autosave: 본문 복구 배너 — 자동 적용하지 않고 사용자가 선택 */}
      {bodyAutosave.recovered && (
        <div className="flex-shrink-0 mb-2 px-4 py-2.5 rounded-xl text-[12px] flex items-center gap-2"
          style={{ background: 'rgba(76,127,224,0.1)', border: '1px solid rgba(76,127,224,0.3)', color: '#9DBEF5' }}>
          <span className="flex-1">복구 가능한 자동저장 내용이 있습니다</span>
          <button onClick={applyRecoveredBody} className="underline underline-offset-2">적용</button>
          <button onClick={() => bodyAutosave.discardRecovered()} className="underline underline-offset-2">무시</button>
        </div>
      )}

      {saveError && (
        <div className="flex-shrink-0 mb-2 px-4 py-2.5 rounded-xl text-[12px] flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FC8181' }}>
          <span>⚠</span>
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError('')} className="text-[10px] opacity-70 hover:opacity-100 flex-shrink-0">닫기</button>
        </div>
      )}

      {/* 문서 */}
      <div ref={scrollRef} className="flex-1 min-h-0 rounded-2xl overflow-auto relative" style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#0F1319' }} onMouseDown={handleCanvasMouseDown}>
        <div ref={innerRef} className="relative" style={{ minHeight, padding: '32px 40px' }}>
          <div className="mb-3.5">
            <BlockFormatBar editorRef={bodyRef} fallbackSize={15} />
          </div>
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            onFocus={() => setIsEditingBody(true)}
            onBlur={() => { setIsEditingBody(false); void bodyAutosave.flush() }}
            data-placeholder="여기에 바로 적어보세요…"
            className="relative outline-none leading-relaxed freenote-body"
            // maxWidth: 760 고정값이었을 때는 창을 넓게 켜도 본문이 그 폭에서 멈춰 줄바꿈되고
            // 오른쪽에 여백만 남는 문제가 있었다 — 좁은 화면(또는 좁은 창)에선 꽉 채우고,
            // 아주 넓은 화면에서만 가독성을 위해 줄 길이 상한이 걸리도록 가변폭으로 변경.
            style={{ color: '#E2E8F0', fontSize: 15, maxWidth: 'min(100%, 1100px)', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', minHeight: 200 }}
          />
          {elements.map(el => {
            const box = { x: el.position_x, y: el.position_y, width: el.width, height: el.height, rotation: el.rotation }
            if (el.type === 'image') {
              return (
                <ImageOverlay
                  key={el.id}
                  box={box}
                  src={el.content}
                  selected={selectedId === el.id}
                  onSelect={() => setSelectedId(el.id)}
                  onChange={b => handleOverlayChange(el.id, b)}
                  onDelete={() => void handleDelete(el.id)}
                />
              )
            }
            if (el.type === 'mindmap') {
              return (
                <MindmapCardOverlay
                  key={el.id}
                  box={box}
                  childBoardId={el.content}
                  selected={selectedId === el.id}
                  onSelect={() => setSelectedId(el.id)}
                  onChange={b => handleOverlayChange(el.id, b)}
                  onDelete={() => void handleDelete(el.id)}
                  onExpand={() => setExpandedMindmap({ elementId: el.id, boardId: el.content })}
                  refreshToken={mindmapRefreshTick}
                  supabase={supabase}
                />
              )
            }
            if (el.type === 'table') {
              return (
                <TableOverlay
                  key={el.id}
                  id={el.id}
                  box={box}
                  data={el.table_data ?? DEFAULT_TABLE_DATA}
                  selected={selectedId === el.id}
                  onSelect={() => setSelectedId(el.id)}
                  onChange={b => handleOverlayChange(el.id, b)}
                  onDelete={() => void handleDelete(el.id)}
                  onDataChange={tableData => handleTableDataChange(el.id, tableData)}
                  supabase={supabase}
                />
              )
            }
            return (
              <BoxOverlay
                key={el.id}
                id={el.id}
                box={box}
                color={el.color as CategoryColorKey}
                content={el.content}
                selected={selectedId === el.id}
                onSelect={() => setSelectedId(el.id)}
                onChange={b => handleOverlayChange(el.id, b)}
                onDelete={() => void handleDelete(el.id)}
                onColorChange={color => handleColorChange(el.id, color)}
                onContentChange={content => handleContentChange(el.id, content)}
                supabase={supabase}
              />
            )
          })}
        </div>
      </div>

      <p className="text-center text-[11px] pt-2 flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>
        바로 타이핑하세요 · <span className="font-mono">Ctrl+V</span>로 이미지 붙여넣기(크기·회전 조절 가능) ·
        <span className="font-mono">Alt+1</span> 빨간펜 · <span className="font-mono">Alt+2</span> 형광펜 ·
        마인드맵 카드는 더블클릭(또는 확장 아이콘)으로 편집 · 표는 셀을 엑셀처럼 편집 · 선택 후 <span className="font-mono">Delete</span>로 삭제
      </p>

      {expandedMindmap && (
        <div className="fixed inset-0 z-50" style={{ background: '#0B0E13' }}>
          <SketchCanvas boardId={expandedMindmap.boardId} onBack={closeMindmapModal} />
        </div>
      )}
    </div>
  )
}
