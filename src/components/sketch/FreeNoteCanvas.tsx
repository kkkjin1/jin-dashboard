'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls,
  useNodesState, useReactFlow,
  type Node, type NodeTypes, type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import type { CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Type, Square } from 'lucide-react'
import type { SketchBoard, SketchNoteElement } from '@/types'
import {
  NoteTextNodeComponent, NoteImageNodeComponent, NoteBoxNodeComponent,
  type NoteTextData, type NoteImageData, type NoteBoxData,
} from './FreeNoteNodes'

// ── 상수 ──────────────────────────────────────────────────────────────────────
const DEFAULT_TEXT_WIDTH = 240
const DEFAULT_TEXT_HEIGHT = 90
const DEFAULT_BOX_WIDTH = 280
const DEFAULT_BOX_HEIGHT = 200
const MAX_IMAGE_DIM = 420 // 붙여넣은 이미지의 초기 최대 변 길이(px) — 그 이상은 비율 유지해서 축소, 이후 리사이즈는 자유

function viewportKey(boardId: string) { return `sketch_note_viewport_${boardId}` }

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

// ── Node 빌더 ──────────────────────────────────────────────────────────────────
type CommonHandlers = {
  onDelete: (id: string) => void
  onResize: (id: string, box: { x: number; y: number; width: number; height: number }) => void
}

function elementToNode(
  el: SketchNoteElement,
  handlers: {
    text: Omit<NoteTextData, 'content' | 'color' | 'hasBackground' | 'autoFocus'>
    box: Omit<NoteBoxData, 'color'>
    image: CommonHandlers
  },
  extraData?: { autoFocus?: boolean },
): Node {
  const base = {
    id: el.id,
    position: { x: el.position_x, y: el.position_y },
    style: { width: el.width, height: el.height },
  }
  if (el.type === 'text') {
    return {
      ...base,
      type: 'notetext',
      zIndex: 10,
      data: {
        content: el.content,
        color: el.color as CategoryColorKey,
        hasBackground: el.has_background,
        ...handlers.text,
        ...extraData,
      },
    }
  }
  if (el.type === 'image') {
    return { ...base, type: 'noteimage', zIndex: 10, data: { src: el.content, ...handlers.image } }
  }
  return { ...base, type: 'notebox', zIndex: 0, data: { color: el.color as CategoryColorKey, ...handlers.box } }
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
function FreeNoteCanvasInner({ boardId }: { boardId: string }) {
  const supabase = createClient()
  const { screenToFlowPosition } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [initialViewport, setInitialViewport] = useState<{ x: number; y: number; zoom: number } | null>(null)
  const [viewportReady, setViewportReady] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(viewportKey(boardId))
      if (raw) setInitialViewport(JSON.parse(raw))
    } catch {}
    setViewportReady(true)
  }, [boardId])
  function handleMoveEnd(_e: unknown, viewport: { x: number; y: number; zoom: number }) {
    try { localStorage.setItem(viewportKey(boardId), JSON.stringify(viewport)) } catch {}
  }

  const [board, setBoard] = useState<SketchBoard | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const SAVE_ERROR_MSG = '저장 실패 — 화면에는 반영됐지만 서버에 저장되지 않았을 수 있습니다. 새로고침 후 다시 확인해주세요.'

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const nodesRef = useRef<Node[]>([])
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  // 캔버스 위 마지막 마우스 좌표(flow 좌표계) — 툴바 버튼/단축키로 새 요소를 만들 때
  // "지금 보고 있는 자리"에 놓기 위해 추적한다.
  const lastFlowPosRef = useRef<{ x: number; y: number } | null>(null)
  function handlePaneMouseMove(e: React.MouseEvent) {
    lastFlowPosRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY })
  }

  // ── canonical writes ──────────────────────────────────────────────────────
  const handleContentChange = useCallback((id: string, content: string) => {
    supabase.from('sketch_note_elements').update({ content }).eq('id', id)
      .then(({ error }) => { if (error) console.error('텍스트 저장 실패:', error.message) })
  }, [])

  const handleColorChange = useCallback((id: string, color: CategoryColorKey) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, color } } : n))
    supabase.from('sketch_note_elements').update({ color }).eq('id', id)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [setNodes])

  const handleBackgroundToggle = useCallback((id: string, hasBackground: boolean) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, hasBackground } } : n))
    supabase.from('sketch_note_elements').update({ has_background: hasBackground }).eq('id', id)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [setNodes])

  const handleDelete = useCallback(async (id: string) => {
    const el = nodesRef.current.find(n => n.id === id)
    const { error } = await supabase.from('sketch_note_elements').delete().eq('id', id)
    if (error) { alert('삭제에 실패했습니다.'); return }
    setNodes(prev => prev.filter(n => n.id !== id))
    // 이미지 스토리지 파일도 함께 정리 (실패해도 DB row는 이미 지워졌으니 무시)
    if (el?.type === 'noteimage') {
      const src = (el.data as NoteImageData).src
      const path = src.split('/object/public/attachments/')[1]
      if (path) await supabase.storage.from('attachments').remove([path])
    }
  }, [setNodes])

  const handleResize = useCallback((id: string, box: { x: number; y: number; width: number; height: number }) => {
    setNodes(prev => prev.map(n => n.id === id
      ? { ...n, position: { x: box.x, y: box.y }, style: { ...n.style, width: box.width, height: box.height } }
      : n))
    supabase.from('sketch_note_elements')
      .update({ position_x: box.x, position_y: box.y, width: box.width, height: box.height })
      .eq('id', id)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [setNodes])

  const savePosition = useCallback((id: string, position: { x: number; y: number }) => {
    supabase.from('sketch_note_elements').update({ position_x: position.x, position_y: position.y }).eq('id', id)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [])

  const textHandlers = useMemo(() => ({
    onContentChange: handleContentChange, onColorChange: handleColorChange, onBackgroundToggle: handleBackgroundToggle, onDelete: handleDelete, onResize: handleResize, supabase,
  }), [handleContentChange, handleColorChange, handleBackgroundToggle, handleDelete, handleResize, supabase])
  const boxHandlers = useMemo(() => ({
    onColorChange: handleColorChange, onDelete: handleDelete, onResize: handleResize,
  }), [handleColorChange, handleDelete, handleResize])
  const imageHandlers = useMemo(() => ({
    onDelete: handleDelete, onResize: handleResize,
  }), [handleDelete, handleResize])

  // ── 데이터 로딩 ───────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('sketch_boards').select('*').eq('id', boardId).single(),
      supabase.from('sketch_note_elements').select('*').eq('board_id', boardId).order('created_at'),
    ]).then(([boardRes, elRes]) => {
      if (boardRes.data) { setBoard(boardRes.data as SketchBoard); setNameInput(boardRes.data.name) }
      const elements = (elRes.data ?? []) as SketchNoteElement[]
      const handlers = { text: textHandlers, box: boxHandlers, image: imageHandlers }
      const boxes = elements.filter(e => e.type === 'box').map(e => elementToNode(e, handlers))
      const rest = elements.filter(e => e.type !== 'box').map(e => elementToNode(e, handlers))
      setNodes([...boxes, ...rest])
      setLoading(false)
    })
    // 보드 최초 로딩은 boardId가 바뀔 때 한 번만 — textHandlers 등은 여기서 그
    // 시점의 최신 값을 그대로 읽어 쓰면 충분하고 재조회 트리거로 삼지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  // ── 요소 생성 ─────────────────────────────────────────────────────────────
  const pickCreatePos = useCallback((clientPos?: { x: number; y: number }): { x: number; y: number } => {
    if (clientPos) return screenToFlowPosition(clientPos)
    if (lastFlowPosRef.current) return lastFlowPosRef.current
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (rect) return screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    return { x: 0, y: 0 }
  }, [screenToFlowPosition])

  const createText = useCallback(async (pos: { x: number; y: number }) => {
    const position_x = pos.x - DEFAULT_TEXT_WIDTH / 2
    const position_y = pos.y - DEFAULT_TEXT_HEIGHT / 2
    const { data, error } = await supabase.from('sketch_note_elements')
      .insert({
        board_id: boardId, type: 'text', content: '', color: 'blue', has_background: false,
        position_x, position_y, width: DEFAULT_TEXT_WIDTH, height: DEFAULT_TEXT_HEIGHT,
      })
      .select().single()
    if (error || !data) { console.error('텍스트 생성 실패:', error?.message); return }
    setNodes(prev => [...prev, elementToNode(data as SketchNoteElement, { text: textHandlers, box: boxHandlers, image: imageHandlers }, { autoFocus: true })])
  }, [boardId, supabase, setNodes, textHandlers, boxHandlers, imageHandlers])

  const createBox = useCallback(async (pos: { x: number; y: number }) => {
    const position_x = pos.x - DEFAULT_BOX_WIDTH / 2
    const position_y = pos.y - DEFAULT_BOX_HEIGHT / 2
    const { data, error } = await supabase.from('sketch_note_elements')
      .insert({
        board_id: boardId, type: 'box', content: '', color: 'neutral', has_background: false,
        position_x, position_y, width: DEFAULT_BOX_WIDTH, height: DEFAULT_BOX_HEIGHT,
      })
      .select().single()
    if (error || !data) { console.error('박스 생성 실패:', error?.message); return }
    // 박스는 항상 다른 요소보다 아래에 렌더링되도록 배열 맨 앞에 둔다
    setNodes(prev => [elementToNode(data as SketchNoteElement, { text: textHandlers, box: boxHandlers, image: imageHandlers }), ...prev])
  }, [boardId, supabase, setNodes, textHandlers, boxHandlers, imageHandlers])

  const createImage = useCallback(async (src: string, naturalSize: { width: number; height: number }, pos: { x: number; y: number }) => {
    const { width, height } = fitWithinMax(naturalSize.width, naturalSize.height, MAX_IMAGE_DIM)
    const position_x = pos.x - width / 2
    const position_y = pos.y - height / 2
    const { data, error } = await supabase.from('sketch_note_elements')
      .insert({ board_id: boardId, type: 'image', content: src, color: 'blue', has_background: false, position_x, position_y, width, height })
      .select().single()
    if (error || !data) { console.error('이미지 요소 생성 실패:', error?.message); return }
    setNodes(prev => [...prev, elementToNode(data as SketchNoteElement, { text: textHandlers, box: boxHandlers, image: imageHandlers })])
  }, [boardId, supabase, setNodes, textHandlers, boxHandlers, imageHandlers])

  function handlePaneDoubleClick(e: React.MouseEvent) {
    if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return
    void createText(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  // ── 이미지 붙여넣기 ───────────────────────────────────────────────────────
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.getAttribute('contenteditable') === 'true') return
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
        await createImage(urlData.publicUrl, naturalSize, pickCreatePos())
      } finally {
        setUploading(false)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [boardId, supabase, createImage, pickCreatePos])

  // ── 단축키 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.getAttribute('contenteditable') === 'true') return
      if (e.key.toLowerCase() === 't') { e.preventDefault(); void createText(pickCreatePos()) }
      if (e.key.toLowerCase() === 'b') { e.preventDefault(); void createBox(pickCreatePos()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createText, createBox, pickCreatePos])

  // ── 드래그 종료 시 위치 저장 ──────────────────────────────────────────────
  const handleNodeDragStop: OnNodeDrag<Node> = useCallback((_e, node) => {
    savePosition(node.id, node.position)
  }, [savePosition])

  const handleNodesDelete = useCallback((deleted: Node[]) => {
    deleted.forEach(n => handleDelete(n.id))
  }, [handleDelete])

  const nodeTypes: NodeTypes = useMemo(() => ({
    notetext: NoteTextNodeComponent,
    noteimage: NoteImageNodeComponent,
    notebox: NoteBoxNodeComponent,
  }), [])

  // ── Board name ─────────────────────────────────────────────────────────────
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

  const elementCount = nodes.length

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
        <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.3)' }}>요소 {elementCount}개</span>

        <button
          onClick={() => void createText(pickCreatePos())}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0"
          style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: '#9DBEF5' }}
        >
          <Type size={13} /> 텍스트
          <span className="text-[10px] font-mono opacity-50">T</span>
        </button>
        <button
          onClick={() => void createBox(pickCreatePos())}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}
        >
          <Square size={13} /> 박스
          <span className="text-[10px] font-mono opacity-50">B</span>
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

      {/* 캔버스 */}
      <div
        ref={wrapperRef}
        className="flex-1 min-h-0 rounded-2xl overflow-hidden relative"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        onDoubleClick={handlePaneDoubleClick}
        onMouseMove={handlePaneMouseMove}
      >
        {viewportReady && (
          <ReactFlow
            nodes={nodes}
            onNodesChange={onNodesChange}
            onNodesDelete={handleNodesDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            nodeTypes={nodeTypes}
            onNodeDragStop={handleNodeDragStop}
            onMoveEnd={handleMoveEnd}
            colorMode="dark"
            {...(initialViewport ? { defaultViewport: initialViewport } : { fitView: true })}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgba(255,255,255,0.14)" style={{ background: '#0F1319' }} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>

      <p className="text-center text-[11px] pt-2 flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>
        {elementCount === 0
          ? <>더블클릭 또는 <span className="font-mono">T</span> 키로 텍스트를, <span className="font-mono">B</span> 키로 박스를 만들고 <span className="font-mono">Ctrl+V</span>로 이미지를 붙여넣으세요</>
          : <>더블클릭/<span className="font-mono">T</span> 텍스트 · <span className="font-mono">B</span> 박스 · <span className="font-mono">Ctrl+V</span> 이미지 붙여넣기</>}
      </p>
    </div>
  )
}

export default function FreeNoteCanvas({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      <FreeNoteCanvasInner boardId={boardId} />
    </ReactFlowProvider>
  )
}
